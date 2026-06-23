// ============================================================
//  Edge Function: diagnostico-fallas
//  Diagnóstico asistido de fallas con la API de Claude. Recibe el
//  contexto del equipo + síntoma + historial ISO 14224 + repuestos
//  vinculados, llama a /v1/messages en streaming y reemite SOLO los
//  deltas de texto como SSE simple: {text} | {done} | {error}.
//
//  Patrón espejo de informe-ejecutivo. Secreto: ANTHROPIC_API_KEY.
// ============================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODELO_DEFECTO = "claude-opus-4-8";
const MODELOS_PERMITIDOS = new Set(["claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"]);

const SYSTEM = `Eres un ingeniero de mantenimiento naval senior (jefe de máquinas), experto en diagnóstico de fallas de maquinaria de flotas pesqueras industriales: motores diésel marinos, sistemas hidráulicos, refrigeración, propulsión, generación y sistemas eléctricos. Asistes a técnicos a bordo y en taller.

Recibes un JSON con: la ficha del equipo, el síntoma reportado por el técnico, el historial de fallas codificadas (ISO 14224) de ese equipo, fallas similares de otros equipos del mismo sistema en la flota, y los repuestos vinculados con su stock.

Tu tarea: producir un diagnóstico estructurado, práctico y accionable en español de Chile, orientado a reducir el tiempo de reparación (MTTR).

REGLAS ESTRICTAS:
- Razona desde el síntoma + el historial + las fallas similares. Si hay un modo de falla recurrente, dale peso explícito.
- Repuestos: recomienda SOLO de la lista de repuestos vinculados provista, indicando su stock actual. Si un repuesto probable tiene stock 0, adviértelo. Si crees que hace falta uno que no está en la lista, dilo como "verificar disponibilidad" SIN inventar códigos.
- No inventes datos del equipo, montos ni nombres. Si el historial está vacío, dilo y diagnostica desde conocimiento de ingeniería marina general.
- Tono: técnico, directo, como un jefe de máquinas experimentado guiando a un técnico junior. Cuantifica donde puedas.
- Formato Markdown SOLO con encabezados (## y ###), listas con viñetas (-) y negrita (**). NO uses tablas, ni bloques de código, ni HTML.
- Conciso: que quepa en una pantalla.

ESTRUCTURA:
## Causas probables
3–5 causas ordenadas de la más a la menos probable. Para cada una: el mecanismo físico y por qué encaja con el síntoma/historial. Marca con **(recurrente)** la que aparezca en el historial del equipo o en fallas similares de la flota.

## Pasos de diagnóstico
Secuencia numerada de verificaciones, de la más rápida y barata a la más invasiva, para confirmar o descartar las causas anteriores.

## Repuestos probables
De la lista vinculada: cuáles conviene tener a mano y su stock actual. Advierte faltantes.

## Seguridad y criticidad
Precauciones antes de intervenir (bloqueo/etiquetado, presión residual, temperatura) y una nota sobre la criticidad del equipo para la operación de la nave.

No incluyas resumen final ni firma.`;

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return json({ error: "No autorizado." }, 401);

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "FALTA_API_KEY" }, 503);

    const { contexto, model } = await req.json();
    if (!contexto || !contexto.equipo) return json({ error: "Falta el contexto del diagnóstico." }, 400);
    if (!contexto.sintoma) return json({ error: "Describe el síntoma observado." }, 400);

    const modeloFinal = typeof model === "string" && MODELOS_PERMITIDOS.has(model) ? model : MODELO_DEFECTO;

    const userMsg =
      "Diagnostica la siguiente falla. Datos del equipo, síntoma e historial (JSON):\n```json\n" +
      JSON.stringify(contexto) +
      "\n```\n\nEntrega el diagnóstico en español siguiendo la estructura indicada.";

    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: modeloFinal,
        max_tokens: 3000,
        stream: true,
        thinking: { type: "disabled" },
        output_config: { effort: "low" },  // interactivo: en Opus el effort razona aunque thinking esté off → low mantiene la latencia baja
        system: SYSTEM,
        messages: [{ role: "user", content: userMsg }],
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const errText = await upstream.text().catch(() => "");
      return json({ error: `Anthropic ${upstream.status}: ${errText.slice(0, 400)}` }, 502);
    }

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let buf = "";

    const out = new ReadableStream({
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (done) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
            controller.close();
            return;
          }
          buf += decoder.decode(value, { stream: true });
          const blocks = buf.split("\n\n");
          buf = blocks.pop() ?? "";
          for (const block of blocks) {
            const dataLine = block.split("\n").find((l) => l.startsWith("data:"));
            if (!dataLine) continue;
            const payload = dataLine.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            try {
              const obj = JSON.parse(payload);
              if (obj.type === "content_block_delta" && obj.delta?.type === "text_delta") {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: obj.delta.text })}\n\n`));
              } else if (obj.type === "error") {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: obj.error?.message || "Error de la API" })}\n\n`));
              }
            } catch (_) {
              // Fragmento parcial entre chunks: se completa en la próxima lectura.
            }
          }
        } catch (e) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: String((e as Error)?.message || e) })}\n\n`));
          try { controller.close(); } catch (_) { /* ya cerrado */ }
        }
      },
      cancel() {
        reader.cancel().catch(() => {});
      },
    });

    return new Response(out, {
      headers: { ...CORS, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
