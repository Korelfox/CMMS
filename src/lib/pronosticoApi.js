// ============================================================
//  Cliente compartido — pronóstico operacional (Edge Function)
// ============================================================
import { supabase } from "./supabase";
import { resolverCoordenadas } from "./clima";

export async function fetchPronosticoOperacional(puertoBase, opts = {}) {
  const { generarBrief = false, pronostico, contexto, signal } = opts;
  const coords = resolverCoordenadas(puertoBase);
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Sesión no válida.");

  const body = {
    puerto_base: puertoBase || coords.label,
    lat: coords.lat,
    lon: coords.lon,
  };
  if (generarBrief) {
    body.generarBrief = true;
    body.pronostico = pronostico;
    body.contexto = contexto ?? {};
  }

  const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pronostico-operacional`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!resp.ok) {
    const payload = await resp.json().catch(() => ({}));
    throw new Error(payload.error || `Error ${resp.status}`);
  }

  if (generarBrief) return resp;
  return resp.json();
}
