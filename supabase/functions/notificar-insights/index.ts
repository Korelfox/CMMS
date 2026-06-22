// Edge Function: notificar-insights
// Avisa por correo a la gerencia cuando el Vigilante detecta insights de
// severidad ROJA del día. Disparada por pg_cron vía pg_net (08:15 UTC, tras
// _gen_insights de las 07:30). Auth cron↔función por secreto compartido en
// Vault, validado con cron_secret_matches() (nunca expone el valor).
//
// Dormante hasta que exista el secreto RESEND_API_KEY: sin clave devuelve 503
// y no envía nada (mismo patrón que FALTA_API_KEY del Copiloto). Idempotente:
// solo procesa rojos de hoy con notificado_en NULL y los marca al enviar, así
// un reintento del cron no duplica correos.
//
// Secretos: RESEND_API_KEY (proveedor email), ALERTA_EMAIL_FROM (remitente,
// dominio verificado en Resend). Service role para leer insights/profiles.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Quién recibe el aviso: roles de gestión/oficina (= isAdmin en theme.js).
// Capitán y maquinista quedan fuera: son operativos a bordo, no gestión.
const ROLES_AVISO = ["super_admin", "admin_empresa", "jefe_mantencion"];

const FROM = Deno.env.get("ALERTA_EMAIL_FROM") || "CMMS Korelfox <alertas@korelfox.cl>";

// Base de la app para el enlace directo al módulo Vigilante (deep-link ?view=).
const APP_URL = (Deno.env.get("APP_URL") || "https://cmms-phi-nine.vercel.app").replace(/\/+$/, "");
const VIGILANTE_URL = `${APP_URL}/?view=vigilante`;

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

function esc(s: string): string {
  return String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const secret = req.headers.get("x-cron-secret") ?? "";
    const { data: ok, error: secErr } = await supabase.rpc("cron_secret_matches", { p: secret });
    if (secErr) return json({ error: "Error validando secreto: " + secErr.message }, 500);
    if (!ok) return json({ error: "No autorizado" }, 401);

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) return json({ error: "FALTA_RESEND_KEY" }, 503);

    const hoy = new Date().toISOString().slice(0, 10);

    // Insights ROJOS de hoy aún no notificados, con el nombre de la empresa.
    const { data: rojos, error: insErr } = await supabase
      .from("insights")
      .select("id, empresa_id, agente, titulo, detalle, valor, empresas(nombre)")
      .eq("severidad", "red")
      .eq("corrida", hoy)
      .is("notificado_en", null);
    if (insErr) return json({ error: insErr.message }, 500);
    if (!rojos || rojos.length === 0) {
      return json({ ok: true, fecha: hoy, enviados: 0, motivo: "sin insights rojos pendientes" });
    }

    // Destinatarios de gestión por empresa.
    const empresaIds = [...new Set(rojos.map((r) => r.empresa_id))];
    const { data: admins, error: profErr } = await supabase
      .from("profiles")
      .select("empresa_id, email, nombre, rol")
      .in("empresa_id", empresaIds)
      .in("rol", ROLES_AVISO)
      .eq("activo", true)
      .not("email", "is", null);
    if (profErr) return json({ error: profErr.message }, 500);

    const correosPorEmpresa = new Map<string, string[]>();
    for (const p of admins ?? []) {
      if (!p.email) continue;
      const arr = correosPorEmpresa.get(p.empresa_id) ?? [];
      arr.push(p.email);
      correosPorEmpresa.set(p.empresa_id, arr);
    }

    // Agrupar insights rojos por empresa.
    const rojosPorEmpresa = new Map<string, typeof rojos>();
    for (const r of rojos) {
      const arr = rojosPorEmpresa.get(r.empresa_id) ?? [];
      arr.push(r);
      rojosPorEmpresa.set(r.empresa_id, arr);
    }

    const resultados: Array<Record<string, unknown>> = [];
    const idsNotificados: string[] = [];

    for (const [empId, items] of rojosPorEmpresa) {
      const destinatarios = correosPorEmpresa.get(empId) ?? [];
      const nombreEmpresa = (items[0] as { empresas?: { nombre?: string } })?.empresas?.nombre ?? "tu empresa";
      if (destinatarios.length === 0) {
        resultados.push({ empresa: nombreEmpresa, enviado: false, motivo: "sin destinatarios de gestión con email" });
        continue;
      }

      const filas = items.map((i) =>
        `<li style="margin-bottom:8px"><strong>${esc(i.titulo)}</strong><br>` +
        `<span style="color:#475569;font-size:13px">${esc(i.detalle ?? "")}</span></li>`
      ).join("");

      const html =
        `<div style="font-family:system-ui,Arial,sans-serif;max-width:560px;color:#0A1A2A">` +
        `<h2 style="font-size:17px;margin:0 0 4px">⚠️ ${items.length} alerta(s) crítica(s) de datos</h2>` +
        `<p style="color:#475569;font-size:13px;margin:0 0 16px">Flota de <strong>${esc(nombreEmpresa)}</strong> · ${hoy}</p>` +
        `<ul style="padding-left:18px;margin:0 0 16px">${filas}</ul>` +
        `<p style="margin:0 0 18px">` +
        `<a href="${VIGILANTE_URL}" style="display:inline-block;background:#0A1A2A;color:#fff;text-decoration:none;` +
        `font-size:13px;font-weight:600;padding:10px 18px;border-radius:8px">Abrir el Vigilante en el CMMS →</a>` +
        `</p>` +
        `<p style="font-size:13px;color:#475569;margin:0">Revisa estas alertas para mantener confiables los análisis de la flota.</p>` +
        `</div>`;

      const subject = `⚠️ ${nombreEmpresa}: ${items.length} alerta(s) crítica(s) de datos en el CMMS`;

      const resp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: FROM, to: destinatarios, subject, html }),
      });

      if (resp.ok) {
        for (const i of items) idsNotificados.push(i.id);
        resultados.push({ empresa: nombreEmpresa, enviado: true, destinatarios: destinatarios.length, alertas: items.length });
      } else {
        const errText = await resp.text().catch(() => "");
        resultados.push({ empresa: nombreEmpresa, enviado: false, motivo: `Resend ${resp.status}: ${errText.slice(0, 300)}` });
      }
    }

    // Marcar como notificados solo los enviados con éxito (idempotencia).
    if (idsNotificados.length > 0) {
      await supabase.from("insights").update({ notificado_en: new Date().toISOString() }).in("id", idsNotificados);
    }

    return json({ ok: true, fecha: hoy, enviados: idsNotificados.length, detalle: resultados });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
