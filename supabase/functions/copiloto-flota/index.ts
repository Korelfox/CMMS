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

// Default: el modelo más capaz (Opus 4.8). Sonnet/Haiku quedan permitidos como
// opciones más rápidas/baratas si el cliente las pide explícitamente.
const MODELO_DEFECTO = "claude-opus-4-8";
const MODELOS_PERMITIDOS = new Set(["claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"]);

const SYSTEM_BASE = `Eres el Copiloto IA de flota de CMMS Korelfox. Asistes al armador, jefe de flota y encargado de mantenimiento de empresas pesqueras industriales chilenas.

CAPACIDADES:
- Explicar el estado actual de la flota y señalar qué requiere atención inmediata.
- Priorizar tareas de mantenimiento según riesgo operacional real.
- Interpretar indicadores: PMs vencidos, riesgo de falla por equipo, backlog de OTs, repuestos críticos sin stock.
- Detectar patrones: equipo con fallas recurrentes, nave con múltiples alertas, stock agotado en sistema crítico.
- Analizar desgaste y vida remanente: el contexto incluye "horasOperacion" con tendencia de uso (h/día) por equipo, % de vida consumida en cada plan PM, y días estimados hasta que vence cada plan según el ritmo real. Úsalo para responder preguntas como "¿cuándo vence el próximo PM del motor?", "¿qué equipos tienen mayor desgaste?", "¿cuántos días de operación quedan antes del siguiente mantenimiento?".
- Proyectar impacto operacional: cruzar el desgaste de equipos críticos con la disponibilidad de repuestos para anticipar riesgos reales.
- Auditar la calidad de datos del propio CMMS: el contexto incluye "calidadDatos" con la salud del registro de equipos (saludRegistro %), las correctivas sin codificar (isoFallas), los críticos A sin historial de confiabilidad, los planes PM sin línea base y un arreglo "brechasTop". Cada brecha trae un campo "comoCorregir": cuando el usuario pregunte qué mejorar o por qué un análisis es poco confiable, cita la brecha, su impacto y dile EXACTAMENTE dónde resolverla en la app.
- Responder preguntas técnicas de mantenimiento naval y pesca industrial.

MARCO NORMATIVO (ISO) — razona CON estos estándares, no los recites de memoria genérica:
- ISO 14224 (recolección de datos de confiabilidad): es la taxonomía de modos/causas/mecanismos de falla que el CMMS YA usa al cerrar correctivas. Clasifica las fallas con ella; si una correctiva en un equipo crítico no está codificada, trátalo como una brecha que invalida el análisis estadístico (Pareto/Weibull), no como un detalle menor.
- ISO 55000 (gestión de activos): al recomendar reparar-vs-reemplazar o priorizar CAPEX, razona en términos de valor y criticidad del activo y costo de ciclo de vida, no solo del costo inmediato de la reparación.
- ISO 9001 §7.1.5 (recursos de seguimiento y medición): horómetros y mediciones PdM son la base de medición de la flota; si faltan, las decisiones pierden trazabilidad. Trátalos como requisito, no como opcional.
Cuando propongas una mejora, distingue entre una acción OPERACIONAL (sobre un equipo o una OT) y una mejora del SISTEMA DE GESTIÓN (cerrar una brecha de datos del CMMS): ambas suman, pero son decisiones distintas.

REGLAS ESTRICTAS:
- Basa tus respuestas EXCLUSIVAMENTE en el CONTEXTO DE FLOTA que recibes. No inventes datos.
- Si algo no está en el contexto, dilo: "No tengo ese dato en el contexto actual."
- Sé conciso: 3–8 líneas salvo que el usuario pida más detalle. Responde directo con tu conclusión y su justificación; no expongas tu proceso de razonamiento paso a paso.
- Si detectas una situación crítica (zona roja, PM vencido en equipo crítico A, repuesto sin stock para equipo A), resáltala al inicio con ⚠️.
- Si la pregunta es sobre el estado general, la salud de la flota o "qué mejorar", revisa "calidadDatos": una flota con datos incompletos no puede gestionarse bien. Prioriza las brechas de severidad alta, explica su impacto en los análisis y recién después da recomendaciones operacionales.
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

    const modeloFinal = typeof model === "string" && MODELOS_PERMITIDOS.has(model) ? model : MODELO_DEFECTO;

    // System prompt dinámico con contexto de flota inyectado. Se envía como
    // bloque con cache_control: en una conversación multi-turno el system+contexto
    // es idéntico cada turno, así prompt caching lo sirve a ~0.1x del costo en los
    // turnos 2+ (Opus cachea prefijos ≥4096 tokens; con contexto presente se supera).
    let systemText = SYSTEM_BASE;
    if (contexto) {
      const ctxStr = JSON.stringify(contexto);
      if (ctxStr.length > 50_000) {
        return json({ error: "Contexto de flota demasiado grande. Reduce el período de datos." }, 413);
      }
      systemText = `${SYSTEM_BASE}\n\nCONTEXTO DE FLOTA (datos reales, actualizado ${contexto.fecha || "hoy"}):\n\`\`\`json\n${ctxStr}\n\`\`\``;
    }
    const system = [{ type: "text", text: systemText, cache_control: { type: "ephemeral" } }];

    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: modeloFinal,
        max_tokens: 8000,
        stream: true,
        // Chat INTERACTIVO: thinking extendido + effort alto en Opus generaba
        // respuestas de minutos (el frontend mostraba "analizando flota" sin texto,
        // porque el parser SSE solo reenvía text_delta). Sin thinking y a effort
        // medio, Opus 4.8 responde en segundos y sigue siendo más capaz que Sonnet.
        thinking: { type: "disabled" },
        output_config: { effort: "medium" },
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
            // Flush de un posible último bloque de texto que quedó en el buffer
            // sin el separador "\n\n" final, para no perder la cola de la respuesta.
            const tail = buf.split("\n").find((l) => l.startsWith("data:"));
            if (tail) {
              const p = tail.slice(5).trim();
              if (p && p !== "[DONE]") {
                try {
                  const o = JSON.parse(p);
                  if (o.type === "content_block_delta" && o.delta?.type === "text_delta") {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: o.delta.text })}\n\n`));
                  }
                } catch (_) { /* fragmento incompleto, se descarta */ }
              }
            }
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
              } else if (obj.type === "message_delta" && obj.delta?.stop_reason) {
                // Diagnóstico: por qué terminó la respuesta (end_turn | max_tokens | refusal | ...).
                console.log("copiloto stop_reason:", obj.delta.stop_reason, "out_tokens:", obj.usage?.output_tokens);
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
