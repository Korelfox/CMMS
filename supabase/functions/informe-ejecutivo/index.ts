// ============================================================
//  Edge Function: informe-ejecutivo
//  Redacta el informe ejecutivo mensual del CMMS con la API de
//  Claude (Anthropic). Recibe el contexto estructurado de la flota,
//  llama a /v1/messages en streaming y reemite SOLO los deltas de
//  texto al navegador como SSE simple: {text} | {done} | {error}.
//
//  Auth: valida el JWT de usuario de Supabase (getUser). verify_jwt
//  se deja en false a nivel gateway para permitir el preflight CORS;
//  la autorización real ocurre aquí dentro.
//
//  Secreto requerido:  ANTHROPIC_API_KEY  (Supabase → Edge Functions → Secrets)
// ============================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODELO_DEFECTO = "claude-opus-4-8";

const SYSTEM = `Eres un analista senior de confiabilidad y gestión de mantenimiento (CMMS) para flotas pesqueras industriales. Redactas el informe ejecutivo periódico dirigido a la gerencia de operaciones y al directorio de una empresa naviera/pesquera.

Recibes un objeto JSON con indicadores reales del período. Tu tarea es transformarlo en un informe ejecutivo claro, cuantitativo y accionable, en español de Chile.

REGLAS ESTRICTAS:
- Usa ÚNICAMENTE los datos provistos en el JSON. No inventes cifras, nombres de naves, equipos ni montos. Si un dato falta o es null, dilo explícitamente ("sin presupuesto configurado", "sin historial suficiente") en vez de suponerlo.
- Sé cuantitativo: cita los números concretos (montos en CLP, porcentajes, días, conteos) que respaldan cada afirmación.
- Tono ejecutivo: directo, profesional, sin relleno. Prioriza lo que requiere decisión gerencial.
- Formato Markdown SOLO con: encabezados (## y ###), listas con viñetas (-) y negrita (**). NO uses tablas, ni bloques de código, ni HTML.
- Extensión: conciso, equivalente a 1–2 páginas. Sin introducción larga ni despedida.
- Montos en pesos chilenos con separador de miles (ej: $5.000.000).

ESTRUCTURA DEL INFORME:
## Resumen ejecutivo
3–5 viñetas con lo más relevante del período (estado general de la flota, mayor riesgo, situación de costos).

## Confiabilidad de la flota
Equipos en riesgo alto/medio, MTBF promedio, y los equipos críticos que requieren atención prioritaria (nómbralos con su nave).

## Cumplimiento del plan de mantenimiento
PMs vencidos y próximos, proactividad (% preventivo vs correctivo), y el backlog crítico que debe programarse.

## Costos y presupuesto
Gasto del año vs presupuesto, run-rate anual proyectado, desvío, naves en riesgo presupuestario y meses hasta agotamiento donde aplique.

## Inventario crítico
Repuestos críticos sin stock e ítems subdotados que exponen a la flota a indisponibilidad.

## Recomendaciones priorizadas
3–6 acciones concretas, numeradas y ordenadas por impacto. Cada una con su justificación cuantitativa y el módulo del CMMS donde se ejecuta.

No incluyas firma ni "atentamente". No agregues secciones fuera de esta estructura.`;

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
    // — Autorización: usuario válido de Supabase —
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

    const { contexto, periodoLabel = "", empresa = "", model } = await req.json();
    if (!contexto) return json({ error: "Falta el contexto del informe." }, 400);

    const userMsg =
      `Empresa: ${empresa || "—"}. Período: ${periodoLabel || "—"}.\n\n` +
      "Indicadores operacionales reales del período (JSON):\n```json\n" +
      JSON.stringify(contexto) +
      "\n```\n\nRedacta el informe ejecutivo en español siguiendo la estructura indicada.";

    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: model || MODELO_DEFECTO,
        max_tokens: 8000,
        stream: true,
        thinking: { type: "adaptive" },
        output_config: { effort: "medium" },
        system: SYSTEM,
        messages: [{ role: "user", content: userMsg }],
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const errText = await upstream.text().catch(() => "");
      return json({ error: `Anthropic ${upstream.status}: ${errText.slice(0, 400)}` }, 502);
    }

    // — Reemite solo los deltas de texto como SSE simple —
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
