// ============================================================
//  Edge Function: pronostico-operacional
//  Pronóstico marítimo (Open-Meteo) + brief operacional IA (Claude).
//  Sin generarBrief → JSON con condiciones actuales y 48h.
//  Con generarBrief → SSE streaming del brief operacional.
//  Secreto: ANTHROPIC_API_KEY (solo para brief).
// ============================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODELO_DEFECTO = "claude-sonnet-4-6";

const PUERTOS: Record<string, { lat: number; lon: number; label: string }> = {
  "puerto montt":   { lat: -41.471, lon: -72.936, label: "Puerto Montt" },
  "calbuco":        { lat: -41.773, lon: -73.130, label: "Calbuco" },
  "ancud":          { lat: -41.869, lon: -73.820, label: "Ancud" },
  "castro":         { lat: -42.482, lon: -73.762, label: "Castro" },
  "chonchi":        { lat: -42.623, lon: -73.776, label: "Chonchi" },
  "quellon":        { lat: -43.116, lon: -73.617, label: "Quellón" },
  "chacao":         { lat: -41.745, lon: -73.520, label: "Chacao" },
  "talcahuano":     { lat: -36.724, lon: -73.117, label: "Talcahuano" },
  "coronel":        { lat: -37.033, lon: -73.133, label: "Coronel" },
  "lota":           { lat: -37.089, lon: -73.157, label: "Lota" },
  "san antonio":    { lat: -33.594, lon: -71.620, label: "San Antonio" },
  "valparaiso":     { lat: -33.047, lon: -71.612, label: "Valparaíso" },
  "coquimbo":       { lat: -29.953, lon: -71.343, label: "Coquimbo" },
  "antofagasta":    { lat: -23.650, lon: -70.400, label: "Antofagasta" },
  "iquique":        { lat: -20.214, lon: -70.152, label: "Iquique" },
  "arica":          { lat: -18.479, lon: -70.319, label: "Arica" },
  "puerto natales": { lat: -51.725, lon: -72.526, label: "Puerto Natales" },
  "punta arenas":   { lat: -53.163, lon: -70.908, label: "Punta Arenas" },
};

const DEFECTO = PUERTOS["puerto montt"];

const SYSTEM = `Eres un asesor operacional marítimo para flotas pesqueras industriales chilenas. Redactas briefs meteorológicos operacionales concisos para armadores y jefes de mantenimiento.

REGLAS:
- Usa ÚNICAMENTE los datos del JSON de pronóstico y contexto operacional provistos. No inventes cifras ni condiciones.
- Enfócate en impacto operacional: zarpe/recalada, trabajos en cubierta, ventanas de PM en puerto, riesgo para tripulación.
- Tono directo, español de Chile, términos náuticos precisos.
- Extensión: 4–8 líneas o viñetas cortas con **negrita** para datos clave. Sin encabezados ##.
- Si las condiciones son adversas (viento ≥20 kn u oleaje ≥2 m), resáltalo al inicio con ⚠️.
- Cierra con una recomendación concreta (zarpar / posponer / aprovechar ventana en puerto).
- Incluye disclaimer breve: apoyo a la decisión, no reemplaza aviso oficial Directemar.`;

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function normalizarPuerto(nombre: string): string {
  return (nombre || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function resolverCoords(puertoBase: string, lat?: number, lon?: number) {
  if (lat != null && lon != null && !Number.isNaN(lat) && !Number.isNaN(lon)) {
    return { lat, lon, label: puertoBase || DEFECTO.label, origen: "coordenadas" };
  }
  const key = normalizarPuerto(puertoBase);
  if (key && PUERTOS[key]) return { ...PUERTOS[key], origen: "exacto" };
  const parcial = Object.entries(PUERTOS).find(([k]) => key.includes(k) || k.includes(key));
  if (parcial) return { ...parcial[1], origen: "parcial" };
  return { ...DEFECTO, origen: "defecto" };
}

function evaluar(vientoKn: number, oleajeM: number) {
  if (vientoKn >= 28 || oleajeM >= 3.0) return { nivel: "rojo", label: "Condiciones adversas" };
  if (vientoKn >= 20 || oleajeM >= 2.0) return { nivel: "ambar", label: "Precaución" };
  return { nivel: "verde", label: "Favorable" };
}

function dirViento(grados: number | null): string {
  if (grados == null) return "—";
  const pts = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
  return pts[Math.round(((grados % 360) / 45)) % 8];
}

/** Modelo de oleaje según latitud (Chile pesquero). */
function modeloOleaje(lat: number): string {
  if (lat >= -52.5 && lat <= -15) return "ncep_gfswave016";
  return "ecmwf_wam";
}

async function fetchMarine(lat: number, lon: number, params: URLSearchParams) {
  const model = modeloOleaje(lat);
  const marineParams = new URLSearchParams(params);
  marineParams.set("cell_selection", "sea");
  marineParams.set("models", model);

  const marineUrl =
    `https://marine-api.open-meteo.com/v1/marine?${marineParams}` +
    "&current=wave_height,wind_wave_height,swell_wave_height" +
    "&hourly=wave_height,wind_wave_height,swell_wave_height";

  const res = await fetch(marineUrl);
  if (res.ok) return { data: await res.json(), model };

  // Fallback si el modelo regional no responde
  const fallback = new URLSearchParams(params);
  fallback.set("cell_selection", "sea");
  fallback.set("models", "ecmwf_wam");
  const res2 = await fetch(
    `https://marine-api.open-meteo.com/v1/marine?${fallback}` +
    "&current=wave_height,wind_wave_height,swell_wave_height" +
    "&hourly=wave_height,wind_wave_height,swell_wave_height",
  );
  if (!res2.ok) return { data: null, model: null };
  return { data: await res2.json(), model: "ecmwf_wam" };
}

async function fetchMarea(lat: number, lon: number, params: URLSearchParams) {
  const tideParams = new URLSearchParams(params);
  tideParams.set("cell_selection", "sea");
  tideParams.set("models", "meteofrance_currents");
  const url =
    `https://marine-api.open-meteo.com/v1/marine?${tideParams}` +
    "&hourly=sea_level_height_msl";
  const res = await fetch(url);
  if (!res.ok) return null;
  return await res.json() as Record<string, unknown>;
}

async function fetchPronostico(lat: number, lon: number) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    timezone: "America/Santiago",
    forecast_days: "7",
    wind_speed_unit: "kn",
    precipitation_unit: "mm",
  });

  const forecastUrl =
    `https://api.open-meteo.com/v1/forecast?${params}` +
    "&current=temperature_2m,wind_speed_10m,wind_direction_10m,weather_code,precipitation" +
    "&hourly=temperature_2m,wind_speed_10m,wind_direction_10m,weather_code,precipitation";

  const [forecastRes, marineResult, mareaData] = await Promise.all([
    fetch(forecastUrl),
    fetchMarine(lat, lon, params),
    fetchMarea(lat, lon, params),
  ]);

  if (!forecastRes.ok) {
    const t = await forecastRes.text().catch(() => "");
    throw new Error(`Open-Meteo ${forecastRes.status}: ${t.slice(0, 200)}`);
  }

  const forecast = await forecastRes.json();
  const marine = marineResult.data as Record<string, unknown> | null;
  const marineModel = marineResult.model;

  const cur = forecast.current ?? {};
  const marineCur = (marine?.current ?? {}) as Record<string, number>;
  const oleajeActual = marineCur.wave_height ?? null;
  const oleajeViento = marineCur.wind_wave_height ?? null;
  const oleajeSwell = marineCur.swell_wave_height ?? null;

  const times: string[] = forecast.hourly?.time ?? [];
  const mh = marine?.hourly as Record<string, number[]> | undefined;
  const th = mareaData?.hourly as Record<string, number[]> | undefined;
  const mareaTimes: string[] = (th?.time as string[]) ?? [];
  const horario = times.map((time: string, i: number) => {
    const mIdx = mareaTimes.indexOf(time);
    return {
      time,
      tempC: forecast.hourly?.temperature_2m?.[i] ?? null,
      vientoKn: forecast.hourly?.wind_speed_10m?.[i] ?? null,
      vientoDir: forecast.hourly?.wind_direction_10m?.[i] ?? null,
      climaCode: forecast.hourly?.weather_code?.[i] ?? null,
      precipMm: forecast.hourly?.precipitation?.[i] ?? null,
      oleajeM: mh?.wave_height?.[i] ?? null,
      oleajeVientoM: mh?.wind_wave_height?.[i] ?? null,
      oleajeSwellM: mh?.swell_wave_height?.[i] ?? null,
      mareaM: mIdx >= 0 ? th?.sea_level_height_msl?.[mIdx] ?? null : null,
    };
  });

  const precipActual = cur.precipitation ?? horario[0]?.precipMm ?? null;
  const mareaActual = horario[0]?.mareaM ?? null;

  const actual = {
    tempC: cur.temperature_2m ?? null,
    vientoKn: cur.wind_speed_10m ?? null,
    vientoDir: cur.wind_direction_10m ?? null,
    vientoDirLabel: dirViento(cur.wind_direction_10m ?? null),
    oleajeM: oleajeActual,
    oleajeVientoM: oleajeViento,
    oleajeSwellM: oleajeSwell,
    precipMm: precipActual,
    mareaM: mareaActual,
    climaCode: cur.weather_code ?? null,
    evaluacion: evaluar(cur.wind_speed_10m ?? 0, oleajeActual ?? 0),
  };

  return {
    actualizado: new Date().toISOString(),
    modelos: { oleaje: marineModel, tiempo: "best_match", marea: mareaData ? "meteofrance_currents" : null },
    actual,
    horario,
  };
}

async function streamBrief(
  pronostico: unknown,
  contexto: unknown,
  puerto: string,
  apiKey: string,
  model?: string,
): Promise<Response> {
  const userMsg =
    `Puerto: ${puerto || "—"}.\n\n` +
    "Pronóstico marítimo (JSON):\n```json\n" +
    JSON.stringify(pronostico) +
    "\n```\n\nContexto operacional CMMS (JSON):\n```json\n" +
    JSON.stringify(contexto ?? {}) +
    "\n```\n\nRedacta el brief operacional meteorológico.";

  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: model || MODELO_DEFECTO,
      max_tokens: 800,
      stream: true,
      system: SYSTEM,
      messages: [{ role: "user", content: userMsg }],
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const errText = await upstream.text().catch(() => "");
    return json({ error: `Anthropic ${upstream.status}: ${errText.slice(0, 400)}` }, 502);
  }

  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();

  (async () => {
    const reader = upstream.body!.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
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
              await writer.write(encoder.encode(`data: ${JSON.stringify({ text: obj.delta.text })}\n\n`));
            } else if (obj.type === "error") {
              await writer.write(encoder.encode(`data: ${JSON.stringify({ error: obj.error?.message ?? "Error de la API" })}\n\n`));
            }
          } catch (_) { /* fragmento parcial */ }
        }
      }
      await writer.write(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
    } catch (e) {
      try {
        await writer.write(encoder.encode(`data: ${JSON.stringify({ error: String((e as Error)?.message || e) })}\n\n`));
      } catch (_) { /* writer cerrado */ }
    } finally {
      try { await writer.close(); } catch (_) { /* ya cerrado */ }
    }
  })();

  return new Response(readable, {
    headers: { ...CORS, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
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

    const body = await req.json();
    const {
      puerto_base = "",
      lat,
      lon,
      generarBrief = false,
      pronostico: pronosticoExistente,
      contexto = {},
      model,
    } = body;

    const coords = resolverCoords(puerto_base, lat, lon);
    const puertoLabel = puerto_base?.trim() || coords.label;

    let pronostico = pronosticoExistente;
    if (!pronostico) {
      pronostico = await fetchPronostico(coords.lat, coords.lon);
    }

    if (generarBrief) {
      const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
      if (!apiKey) return json({ error: "FALTA_API_KEY" }, 503);
      return streamBrief(
        { puerto: puertoLabel, coords, ...pronostico },
        contexto,
        puertoLabel,
        apiKey,
        model,
      );
    }

    return json({
      puerto: puertoLabel,
      coords: { lat: coords.lat, lon: coords.lon, origen: coords.origen },
      ...pronostico,
    });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
