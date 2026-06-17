// ============================================================
//  Edge Function: copiloto-flota
//  Copiloto IA conversacional para flotas pesqueras.
//  Recibe el historial de mensajes + resumen de flota,
//  construye un system prompt con contexto real y hace streaming
//  SSE exactamente igual que informe-ejecutivo / diagnostico-fallas.
//  Secreto: ANTHROPIC_API_KEY.
// ============================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODELO_DEFECTO = "claude-sonnet-4-6";

const SYSTEM_BASE = `Eres el Copiloto IA de flota de CMMS Korelfox. Asistes al armador, jefe de flota y encargado de mantenimiento de empresas pesqueras industriales chilenas.

CAPACIDADES:
- Explicar el estado actual de la flota y señalar qué requiere atención inmediata.
- Priorizar tareas de mantenimiento según riesgo operacional real.
- Interpretar indicadores: PMs vencidos, riesgo de falla por equipo, backlog de OTs, repuestos críticos sin stock.
- Detectar patrones: equipo con fallas recurrentes, nave con múltiples alertas, stock agotado en sistema crítico.
- Analizar desgaste y vida remanente: el contexto incluye "horasOperacion" con tendencia de uso (h/día) por equipo, % de vida consumida en cada plan PM, y días estimados hasta que vence cada plan según el ritmo real. Úsalo para responder preguntas como "¿cuándo vence el próximo PM del motor?", "¿qué equipos tienen mayor desgaste?", "¿cuántos días de operación quedan antes del siguiente mantenimiento?".
- Proyectar impacto operacional: cruzar el desgaste de equipos críticos con la disponibilidad de repuestos para anticipar riesgos reales.
- Responder preguntas técnicas de mantenimiento naval y pesca industrial.

REGLAS ESTRICTAS:
- Basa tus respuestas EXCLUSIVAMENTE en el CONTEXTO DE FLOTA que recibes. No inventes datos.
- Si algo no está en el contexto, dilo: "No tengo ese dato en el contexto actual."
- Sé conciso: 3–8 líneas salvo que el usuario pida más detalle.
- Si detectas una situación crítica (zona roja, PM vencido en equipo crítico A, repuesto sin stock para equipo A), resáltala al inicio con ⚠️.
- Tono: directo y técnico, como un asesor de flota con 20 años de experiencia en pesca industrial.
- Formato: texto plano, usa **negrita** para datos clave y listas - para enumerar. Sin tablas ni encabezados ##.
- Idioma: español de Chile. Términos náuticos y mecánicos precisos.
- Nunca repitas el contexto completo al usuario. Extrae solo lo relevante para la pregunta.`;

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

    const { messages, contexto, model } = await req.json();
    if (!Array.isArray(messages) || messages.length === 0) {
      return json({ error: "Se requiere al menos un mensaje." }, 400);
    }

    // System prompt dinámico con contexto de flota inyectado
    const system = contexto
      ? `${SYSTEM_BASE}\n\nCONTEXTO DE FLOTA (datos reales, actualizado ${contexto.fecha || "hoy"}):\n\`\`\`json\n${JSON.stringify(contexto)}\n\`\`\``
      : SYSTEM_BASE;

    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: model || MODELO_DEFECTO,
        max_tokens: 2000,
        stream: true,
        thinking: { type: "disabled" },
        output_config: { effort: "low" },
        system,
        messages,
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const errText = await upstream.text().catch(() => "");
      return json({ error: `Anthropic ${upstream.status}: ${errText.slice(0, 400)}` }, 502);
    }

    const reader  = upstream.body.getReader();
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
              // fragmento parcial — se completa en la próxima lectura
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
