import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Cloud, Wind, Waves, Sparkles, RefreshCw, AlertTriangle, CheckCircle2,
  Thermometer, MapPin,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import {
  resolverCoordenadas, evaluarCondiciones, resumirPorDia,
  formatearDia, etiquetaClima, direccionViento,
  listaPuertos, puertoInicial, storageKeyPuertoClima,
} from "../../lib/clima";
import { C, tint, archivo } from "../../theme";
import { Pill, InlineSpinner, ghostBtn, primaryBtn, inputStyle } from "../../ui";
import { renderMarkdown } from "../Markdown";

const TONE_COLOR = { green: C.green, yellow: C.amber, red: C.red };

function toneEval(ev) {
  if (!ev) return "green";
  if (ev.tone) return ev.tone;
  if (ev.nivel === "rojo") return "red";
  if (ev.nivel === "ambar") return "yellow";
  return "green";
}

async function leerSSE(resp, onChunk) {
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const blocks = buf.split("\n\n");
    buf = blocks.pop() || "";
    for (const block of blocks) {
      const line = block.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;
      const raw = line.slice(5).trim();
      if (!raw) continue;
      let obj;
      try { obj = JSON.parse(raw); } catch { continue; }
      if (obj.text) onChunk(obj.text);
      else if (obj.error) throw new Error(obj.error);
      else if (obj.done) return;
    }
  }
}

export default function PronosticoWidget({ puertoBase, empresaId, contextoOps = {} }) {
  const puertos = useMemo(() => listaPuertos(), []);
  const [datos, setDatos]       = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [brief, setBrief]       = useState("");
  const [genBrief, setGenBrief] = useState(false);
  const [briefError, setBriefError] = useState(null);
  const abortRef = useRef(null);
  const [puertoSel, setPuertoSel] = useState(() => {
    try {
      const guardado = localStorage.getItem(storageKeyPuertoClima(empresaId));
      return puertoInicial(puertoBase, guardado);
    } catch {
      return puertoInicial(puertoBase);
    }
  });

  useEffect(() => {
    try {
      const guardado = localStorage.getItem(storageKeyPuertoClima(empresaId));
      setPuertoSel(puertoInicial(puertoBase, guardado));
    } catch {
      setPuertoSel(puertoInicial(puertoBase));
    }
    setBrief("");
    setDatos(null);
  }, [empresaId, puertoBase]);

  const coords = useMemo(() => resolverCoordenadas(puertoSel), [puertoSel]);
  const puertoEmpresa = useMemo(() => resolverCoordenadas(puertoBase).label, [puertoBase]);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Sesión no válida.");

      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pronostico-operacional`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          puerto_base: puertoSel,
          lat: coords.lat,
          lon: coords.lon,
        }),
      });

      if (!resp.ok) {
        const payload = await resp.json().catch(() => ({}));
        throw new Error(payload.error || `Error ${resp.status}`);
      }
      setDatos(await resp.json());
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [puertoSel, coords]);

  const cambiarPuerto = useCallback((label) => {
    setPuertoSel(label);
    setBrief("");
    setDatos(null);
    try {
      localStorage.setItem(storageKeyPuertoClima(empresaId), label);
    } catch { /* sin almacenamiento local */ }
  }, [empresaId]);

  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => () => { if (abortRef.current) abortRef.current.abort(); }, []);

  const generarBrief = useCallback(async () => {
    if (!datos) return;
    setGenBrief(true);
    setBriefError(null);
    setBrief("");
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Sesión no válida.");

      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pronostico-operacional`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          puerto_base: datos.puerto || puertoSel,
          lat: datos.coords?.lat ?? coords.lat,
          lon: datos.coords?.lon ?? coords.lon,
          generarBrief: true,
          pronostico: { actual: datos.actual, horario: datos.horario, actualizado: datos.actualizado },
          contexto: contextoOps,
        }),
        signal: ctrl.signal,
      });

      if (!resp.ok) {
        const payload = await resp.json().catch(() => ({}));
        if (resp.status === 503 || payload.error === "FALTA_API_KEY") {
          setBriefError("FALTA_API_KEY");
        } else {
          setBriefError(payload.error || `Error ${resp.status}`);
        }
        return;
      }

      await leerSSE(resp, (text) => setBrief((t) => t + text));
    } catch (e) {
      if (e.name !== "AbortError") setBriefError(e.message || String(e));
    } finally {
      setGenBrief(false);
      abortRef.current = null;
    }
  }, [datos, puertoSel, coords, contextoOps]);

  const actual = datos?.actual;
  const evalActual = actual?.evaluacion || evaluarCondiciones({
    vientoKn: actual?.vientoKn,
    oleajeM: actual?.oleajeM,
  });
  const tone = toneEval(evalActual);
  const colorEval = TONE_COLOR[tone] || C.green;
  const dias = useMemo(() => resumirPorDia(datos?.horario || [], 3), [datos]);

  const distintoEmpresa = puertoBase && puertoSel !== puertoEmpresa;

  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14,
      padding: "18px 20px", boxShadow: "0 2px 8px rgba(15,35,55,.06)",
    }}>
      {/* Encabezado */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <Cloud size={18} color={C.steel} />
            <span style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: C.steel, fontWeight: 700 }}>
              Pronóstico marítimo
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <MapPin size={14} color={C.slate} style={{ flexShrink: 0 }} />
            <select
              value={puertoSel}
              onChange={(e) => cambiarPuerto(e.target.value)}
              disabled={loading}
              aria-label="Seleccionar puerto para pronóstico"
              style={{
                ...inputStyle(),
                width: "auto",
                minWidth: 160,
                maxWidth: "100%",
                ...archivo,
                fontSize: 15,
                fontWeight: 800,
                color: C.abyss,
                padding: "8px 12px",
                cursor: loading ? "wait" : "pointer",
              }}
            >
              {puertos.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          {distintoEmpresa && (
            <div style={{ fontSize: 11, color: C.slate, marginTop: 6, marginLeft: 22 }}>
              Puerto empresa: {puertoEmpresa}
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {!loading && actual && (
            <Pill tone={tone}>
              {evalActual.nivel === "rojo" ? <AlertTriangle size={12} /> : <CheckCircle2 size={12} />}
              {evalActual.label}
            </Pill>
          )}
          <button type="button" onClick={cargar} disabled={loading} title="Actualizar pronóstico" data-nofx
            style={{ ...ghostBtn, padding: "8px 10px", display: "inline-flex", alignItems: "center" }}>
            <RefreshCw size={14} style={loading ? { animation: "spin 0.8s linear infinite" } : undefined} />
          </button>
        </div>
      </div>

      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "24px 0", color: C.slate }}>
          <InlineSpinner /> Cargando pronóstico…
        </div>
      )}

      {error && !loading && (
        <div style={{ padding: "12px 14px", borderRadius: 8, background: tint(C.red, 10), border: `1px solid ${tint(C.red, 30)}`, color: C.red, fontSize: 13 }}>
          {error.includes("404") || error.includes("Failed")
            ? "Función de pronóstico no desplegada. Ejecuta: supabase functions deploy pronostico-operacional"
            : error}
        </div>
      )}

      {!loading && !error && actual && (
        <>
          {/* Condiciones actuales */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))",
            gap: 12, marginBottom: 16, padding: 14, borderRadius: 10,
            background: tint(colorEval, 6), border: `1px solid ${tint(colorEval, 22)}`,
          }}>
            <Metrica icon={Thermometer} label="Temp." value={actual.tempC != null ? `${Math.round(actual.tempC)}°C` : "—"} />
            <Metrica icon={Wind} label="Viento" value={actual.vientoKn != null ? `${Math.round(actual.vientoKn)} kn` : "—"}
              sub={actual.vientoDir != null ? direccionViento(actual.vientoDir) : null} />
            <Metrica icon={Waves} label="Oleaje" value={actual.oleajeM != null ? `${actual.oleajeM.toFixed(1)} m` : "—"} />
            <Metrica icon={Cloud} label="Cielo" value={etiquetaClima(actual.climaCode)} compact />
          </div>

          {/* Próximos días */}
          {dias.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, marginBottom: 16 }}>
              {dias.map((d) => {
                const c = TONE_COLOR[d.evaluacion.tone] || C.green;
                return (
                  <div key={d.fecha} style={{
                    padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.line}`,
                    background: C.surface2,
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.slate, textTransform: "capitalize", marginBottom: 6 }}>
                      {formatearDia(d.fecha)}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.abyss }}>
                      {d.tempMin != null && d.tempMax != null ? `${Math.round(d.tempMin)}–${Math.round(d.tempMax)}°C` : "—"}
                    </div>
                    <div style={{ fontSize: 11, color: C.slate, marginTop: 4 }}>
                      {d.vientoMaxKn != null ? `↑${Math.round(d.vientoMaxKn)} kn` : ""}
                      {d.oleajeMaxM != null ? ` · ${d.oleajeMaxM.toFixed(1)} m` : ""}
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: c, marginTop: 4 }}>{d.evaluacion.label}</div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Brief IA */}
          <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: brief || genBrief ? 10 : 0 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.ink }}>Brief operacional IA</span>
              <button type="button" onClick={generarBrief} disabled={genBrief || !datos}
                style={{ ...primaryBtn, padding: "7px 14px", fontSize: 12.5, display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Sparkles size={14} />
                {genBrief ? "Generando…" : brief ? "Regenerar" : "Generar brief"}
              </button>
            </div>

            {genBrief && !brief && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.slate, fontSize: 13, padding: "8px 0" }}>
                <InlineSpinner /> Analizando condiciones…
              </div>
            )}

            {briefError === "FALTA_API_KEY" && (
              <div style={{ fontSize: 12, color: C.amber, padding: "8px 0", lineHeight: 1.5 }}>
                Falta <code style={{ fontSize: 11 }}>ANTHROPIC_API_KEY</code> en Supabase Edge Functions.
              </div>
            )}
            {briefError && briefError !== "FALTA_API_KEY" && (
              <div style={{ fontSize: 12, color: C.red, padding: "8px 0" }}>{briefError}</div>
            )}

            {brief && (
              <div style={{ fontSize: 13, color: C.ink, lineHeight: 1.65, padding: "10px 12px", borderRadius: 8, background: tint(C.cyan, 6), border: `1px solid ${tint(C.cyan, 20)}` }}>
                {renderMarkdown(brief)}
              </div>
            )}

            <div style={{ fontSize: 10.5, color: C.slate, marginTop: 10, lineHeight: 1.4 }}>
              Apoyo a la decisión operacional. No reemplaza avisos oficiales de Directemar.
              {datos.actualizado && (
                <span> · Actualizado {new Date(datos.actualizado).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}</span>
              )}
            </div>
          </div>
        </>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function Metrica({ icon: Icon, label, value, sub, compact }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
        <Icon size={13} color={C.slate} />
        <span style={{ fontSize: 10, fontWeight: 700, color: C.slate, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</span>
      </div>
      <div style={{ ...archivo, fontSize: compact ? 13 : 18, fontWeight: 800, color: C.abyss, lineHeight: 1.2 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.slate, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
