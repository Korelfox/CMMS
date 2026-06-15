// ============================================================
//  Edge Function: ingest-horometro
//  Webhook de ingesta de telemetría de horómetro (CMMS autónomo · Salto 3).
//  El emisor a bordo (gateway NMEA 2000 / ESP32 al tacógrafo) hace POST con un
//  token de embarcación y la lectura de horas. Sin sesión de usuario: usa la
//  service role key y valida el token contra embarcaciones.telemetria_token.
//
//  Efecto = el mismo que una lectura manual: inserta en lecturas_horometro con
//  fuente 'telemetria' y propaga horas_actual al subárbol que hereda del punto
//  de horómetro (misma lógica que puntoHorometro/idsBajoPunto del frontend).
//
//  Deploy con verify_jwt = false: el dispositivo no tiene JWT de Supabase; la
//  autenticación real es el token por nave en el cuerpo.
//
//  Body:  { token: uuid, equipo_id: uuid, horas: number, fecha?: ISO, nota?: string }
//  200 →  { ok, embarcacion, punto, sistema, horas, propagados, lectura_id }
// ============================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// ── Herencia de horómetro (espejo de src/lib/horometro.js) ──
type Eq = { id: string; id_visible?: string; parent_id?: string | null; horometro?: string; horas_actual?: number; sistema?: string };
const modo = (e?: Eq) => e?.horometro || "hereda";

function puntoHorometro(eq: Eq | undefined, byId: Map<string, Eq>): string | null {
  if (!eq || modo(eq) === "no") return null;
  let cur: Eq | undefined = eq;
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    if (modo(cur) === "propio") return cur.id;
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  return null;
}

function idsBajoPunto(propioId: string, equipos: Eq[], byId: Map<string, Eq>): string[] {
  return equipos.filter((e) => puntoHorometro(e, byId) === propioId).map((e) => e.id);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  try {
    const body = await req.json().catch(() => null);
    if (!body) return json({ error: "JSON inválido" }, 400);
    const { token, equipo_id, horas, fecha, nota } = body as Record<string, unknown>;
    const h = Number(horas);
    if (!token) return json({ error: "Falta token" }, 400);
    if (!equipo_id) return json({ error: "Falta equipo_id" }, 400);
    if (!Number.isFinite(h) || h < 0) return json({ error: "horas inválidas" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // 1) token → embarcación
    const { data: emb } = await supabase
      .from("embarcaciones")
      .select("id, empresa_id, nombre, codigo")
      .eq("telemetria_token", token)
      .maybeSingle();
    if (!emb) return json({ error: "Token inválido" }, 401);

    // 2) equipos de la embarcación + validación de pertenencia
    const { data: equipos, error: eqErr } = await supabase
      .from("equipos")
      .select("id, id_visible, parent_id, horometro, horas_actual, sistema")
      .eq("embarcacion_id", emb.id);
    if (eqErr) return json({ error: eqErr.message }, 500);

    const byId = new Map<string, Eq>((equipos ?? []).map((e: Eq) => [e.id, e]));
    const eq = byId.get(String(equipo_id));
    if (!eq) return json({ error: "El equipo no pertenece a esta embarcación" }, 404);

    // 3) resolver el punto de horómetro (propio o heredado)
    const puntoId = puntoHorometro(eq, byId);
    if (!puntoId) return json({ error: "El equipo no tiene horómetro (propio ni heredado)" }, 422);
    const punto = byId.get(puntoId)!;
    const prev = Number(punto.horas_actual) || 0;

    // 4) integridad: no aceptar lecturas decrecientes (glitch de sensor)
    if (h < prev) {
      return json({ error: `Lectura ${h} h menor que la actual ${prev} h`, horas_actual: prev }, 409);
    }

    const fechaIso = fecha ? new Date(String(fecha)).toISOString() : new Date().toISOString();

    // 5) insertar la lectura en el punto
    const { data: lectura, error: insErr } = await supabase
      .from("lecturas_horometro")
      .insert({
        empresa_id: emb.empresa_id, equipo_id: puntoId, horas: h, horas_anterior: prev,
        fuente: "telemetria", fecha: fechaIso, usuario_nombre: "Telemetría", nota: nota ?? null,
      })
      .select("id")
      .single();
    if (insErr) return json({ error: insErr.message }, 500);

    // 6) contar propagados para la respuesta (el trigger trg_propagar_horas
    //    ya actualizó equipos.horas_actual en la misma transacción del INSERT).
    const propagados = idsBajoPunto(puntoId, equipos ?? [], byId).length;

    return json({
      ok: true,
      embarcacion: emb.codigo || emb.nombre,
      punto: punto.id_visible, sistema: punto.sistema,
      horas: h, propagados, lectura_id: lectura.id,
    });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
