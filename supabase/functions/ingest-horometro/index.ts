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
type Eq = { id: string; id_visible?: string; parent_id?: string | null; horometro?: string; horas_actual?: number; sistema?: string; horas_fuente_id?: string | null };
const modo = (e?: Eq) => e?.horometro || "hereda";

function puntoHorometro(eq: Eq | undefined, byId: Map<string, Eq>): string | null {
  if (!eq || modo(eq) === "no") return null;
  if (modo(eq) === "propio") return eq.id;

  // Ancestro 'propio' más cercano siguiendo parent_id.
  let cur: Eq | undefined = eq;
  const seen = new Set<string>();
  while (cur?.parent_id && !seen.has(cur.parent_id)) {
    seen.add(cur.parent_id);
    cur = byId.get(cur.parent_id);
    if (!cur) break;
    if (modo(cur) === "propio") return cur.id;
  }

  // Sin ancestro propio: fuente explícita (p. ej. reductora hermana del motor).
  const fuenteId = eq.horas_fuente_id;
  if (fuenteId) {
    const fuente = byId.get(fuenteId);
    if (fuente && modo(fuente) === "propio") return fuenteId;
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

    // 1) token → embarcación (E1: respuesta genérica — no revelar si el token existe)
    const { data: emb } = await supabase
      .from("embarcaciones")
      .select("id, empresa_id, nombre, codigo")
      .eq("telemetria_token", token)
      .maybeSingle();
    if (!emb) return json({ error: "No autorizado" }, 401);

    // 2) equipos de la embarcación + validación de pertenencia
    const { data: equipos, error: eqErr } = await supabase
      .from("equipos")
      .select("id, id_visible, parent_id, horometro, horas_actual, sistema, horas_fuente_id")
      .eq("embarcacion_id", emb.id);
    if (eqErr) return json({ error: eqErr.message }, 500);

    const byId = new Map<string, Eq>((equipos ?? []).map((e: Eq) => [e.id, e]));
    const eq = byId.get(String(equipo_id));
    // E1: mismo 401 que token inválido para no revelar si equipo_id existe en otra nave
    if (!eq) return json({ error: "No autorizado" }, 401);

    // 3) resolver el punto de horómetro (propio o heredado)
    const puntoId = puntoHorometro(eq, byId);
    if (!puntoId) return json({ error: "El equipo no tiene horómetro (propio ni heredado)" }, 422);
    const punto = byId.get(puntoId)!;
    const prev = Number(punto.horas_actual) || 0;

    // 4) rate limit: máximo 1 lectura por telemetría cada 60 s por equipo (E1)
    const ventana = new Date(Date.now() - 60_000).toISOString();
    const { count: recientes } = await supabase
      .from("lecturas_horometro")
      .select("id", { count: "exact", head: true })
      .eq("equipo_id", puntoId)
      .eq("fuente", "telemetria")
      .gte("created_at", ventana);
    if (recientes && recientes > 0) {
      return json({ error: "Demasiadas lecturas. Espera al menos 60 s entre envíos.", retry_after: 60 }, 429);
    }

    // 5) integridad: no aceptar lecturas decrecientes (glitch de sensor)
    if (h < prev) {
      return json({ error: `Lectura ${h} h menor que la actual ${prev} h`, horas_actual: prev }, 409);
    }

    const fechaIso = fecha ? new Date(String(fecha)).toISOString() : new Date().toISOString();

    // 7) insertar la lectura en el punto
    const { data: lectura, error: insErr } = await supabase
      .from("lecturas_horometro")
      .insert({
        empresa_id: emb.empresa_id, equipo_id: puntoId, horas: h, horas_anterior: prev,
        fuente: "telemetria", fecha: fechaIso, usuario_nombre: "Telemetría", nota: nota ?? null,
      })
      .select("id")
      .single();
    if (insErr) return json({ error: insErr.message }, 500);

    // 8) contar propagados para la respuesta (el trigger trg_propagar_horas
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
