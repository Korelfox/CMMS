// Edge Function: informe-ejecutivo-cron
// Genera el Informe Ejecutivo de forma autonoma (disparada por pg_cron dia 1 y 15
// via pg_net). Sin sesion de usuario: service role + secreto compartido en Vault
// (validado por RPC, nunca expuesto). Por cada empresa con datos arma el contexto
// con informe_contexto() (SQL), lo pasa a Claude (no-streaming) y persiste en
// informes_ejecutivos. Misma ANTHROPIC_API_KEY de proyecto que el informe manual.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODELO = "claude-opus-4-8";
const MESES = 3;

const SYSTEM = [
  "Eres un analista senior de confiabilidad y gestion de mantenimiento (CMMS) para flotas pesqueras industriales.",
  "Recibes un JSON con indicadores reales del periodo y redactas el informe ejecutivo para la gerencia, en espanol de Chile.",
  "Reglas: usa SOLO los datos del JSON (si un dato es 0 o falta, dilo: sin presupuesto configurado, sin historial suficiente); se cuantitativo citando numeros (CLP, porcentajes, conteos); tono ejecutivo directo sin relleno; Markdown solo con encabezados (##), vinetas (-) y negrita, sin tablas ni codigo ni HTML; conciso, 1 a 2 paginas; montos en pesos chilenos con separador de miles.",
  "Estructura con estas secciones: ## Resumen ejecutivo; ## Confiabilidad de la flota; ## Cumplimiento del plan de mantenimiento; ## Costos y presupuesto; ## Inventario critico; ## Recomendaciones priorizadas (3 a 6 acciones numeradas por impacto, cada una con justificacion cuantitativa y el modulo del CMMS donde se ejecuta).",
  "No incluyas firma ni secciones fuera de esa estructura.",
].join("\n");

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Metodo no permitido" }, 405);

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const secret = req.headers.get("x-cron-secret") ?? "";
    const { data: ok, error: secErr } = await supabase.rpc("cron_secret_matches", { p: secret });
    if (secErr) return json({ error: "Error validando secreto: " + secErr.message }, 500);
    if (!ok) return json({ error: "No autorizado" }, 401);

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "FALTA_API_KEY" }, 503);

    const hoy = new Date().toISOString().slice(0, 10);
    const periodoLabel = "Quincenal automatico - trimestre movil al " + hoy;

    const { data: empresas, error: empErr } = await supabase.from("empresas").select("id, nombre");
    if (empErr) return json({ error: empErr.message }, 500);

    const resultados: Array<Record<string, unknown>> = [];

    for (const emp of empresas ?? []) {
      const { data: contexto, error: ctxErr } = await supabase.rpc("informe_contexto", { p_empresa: emp.id, p_meses: MESES });
      if (ctxErr) { resultados.push({ empresa: emp.nombre, error: ctxErr.message }); continue; }
      const equipos = Number((contexto as Record<string, Record<string, unknown>>)?.flota?.equipos ?? 0);
      if (equipos === 0) continue;

      const userMsg = [
        "Empresa: " + emp.nombre + ". Periodo: " + periodoLabel + ".",
        "",
        "Indicadores operacionales reales del periodo (JSON):",
        JSON.stringify(contexto),
        "",
        "Redacta el informe ejecutivo en espanol siguiendo la estructura indicada.",
      ].join("\n");

      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        // Async/batch: effort low. En Opus el effort razona aunque thinking esté off;
        // con effort medio/alto un informe largo no-streaming roza el límite de 150s
        // del edge runtime. low mantiene la generación acotada.
        body: JSON.stringify({ model: MODELO, max_tokens: 6000, thinking: { type: "disabled" }, output_config: { effort: "low" }, system: SYSTEM, messages: [{ role: "user", content: userMsg }] }),
      });
      if (!r.ok) { resultados.push({ empresa: emp.nombre, error: "Claude " + r.status }); continue; }

      const data = await r.json();
      if (data.stop_reason === "max_tokens") {
        resultados.push({ empresa: emp.nombre, error: "informe truncado (max_tokens alcanzado)" });
        continue;
      }
      const texto = (data.content ?? []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("");
      if (!texto) { resultados.push({ empresa: emp.nombre, error: "respuesta vacia" }); continue; }

      const { error: insErr } = await supabase.from("informes_ejecutivos").insert({
        empresa_id: emp.id, fecha: hoy, periodo_meses: MESES, periodo_label: periodoLabel,
        texto_md: texto, contexto_json: contexto, created_by: null,
      });
      resultados.push({ empresa: emp.nombre, ok: !insErr, error: insErr?.message, chars: texto.length });
    }

    return json({ ok: true, fecha: hoy, generados: resultados });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
