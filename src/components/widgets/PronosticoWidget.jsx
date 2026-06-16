import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Cloud, Wind, Waves, Sparkles, RefreshCw, AlertTriangle, CheckCircle2,
  Thermometer, MapPin, Droplets, Anchor, HardHat, Wrench, ChevronDown, ChevronUp,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import {
  resolverCoordenadas, evaluarCondiciones, resumirPorDia,
  formatearDia, etiquetaClima, direccionViento,
  listaPuertos, puertoInicial, storageKeyPuertoClima,
  etiquetaModeloOleaje, precipProximasHoras,
  evaluarSemáforosOperacionales, peorSemáforo,
  storageKeyPronosticoColapsado, horarioRestanteHoy,
  formatearHoraCorta, analizarMarea, etiquetaEventoMarea,
} from "../../lib/clima";
import { C, tint, archivo } from "../../theme";
import { Pill, InlineSpinner, ghostBtn, primaryBtn, inputStyle } from "../../ui";
import { renderMarkdown } from "../Markdown";
import PronosticoGrafico, { FlechaViento } from "./PronosticoGrafico";
import PronosticoMarea from "./PronosticoMarea";

const TONE_COLOR = { green: C.green, yellow: C.amber, red: C.red };
const TABS = [
  { id: "hoy", label: "Hoy" },
  { id: "48h", label: "48 h" },
  { id: "7d", label: "7 días" },
];

function toneEval(ev) {
  if (!ev) return "green";
  if (ev.tone) return ev.tone;
  if (ev.nivel === "rojo") return "red";
  if (ev.nivel === "ambar") return "yellow";
  return "green";
}

function leerColapsado(empresaId) {
  try {
    return localStorage.getItem(storageKeyPronosticoColapsado(empresaId)) === "1";
  } catch {
    return false;
  }
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
  const [tab, setTab]           = useState("hoy");
  const [colapsado, setColapsado] = useState(() => leerColapsado(empresaId));
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
    setColapsado(leerColapsado(empresaId));
  }, [empresaId, puertoBase]);

  const toggleColapsado = useCallback(() => {
    setColapsado((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(storageKeyPronosticoColapsado(empresaId), next ? "1" : "0");
      } catch { /* sin almacenamiento local */ }
      return next;
    });
  }, [empresaId]);

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
  const precip6h = useMemo(() => precipProximasHoras(datos?.horario, 6), [datos]);
  const semaforos = useMemo(
    () => evaluarSemáforosOperacionales(actual, precip6h),
    [actual, precip6h],
  );
  const resumenSem = useMemo(() => peorSemáforo(semaforos), [semaforos]);
  const toneResumen = toneEval(resumenSem);
  const dias7 = useMemo(() => resumirPorDia(datos?.horario || [], 7), [datos]);
  const horasHoy = useMemo(() => horarioRestanteHoy(datos?.horario), [datos]);
  const mareaInfo = useMemo(() => analizarMarea(datos?.horario), [datos]);

  const distintoEmpresa = puertoBase && puertoSel !== puertoEmpresa;
  const oleajeDetalle = actual?.oleajeVientoM != null || actual?.oleajeSwellM != null
    ? [
        actual?.oleajeVientoM != null ? `viento ${actual.oleajeVientoM.toFixed(1)} m` : null,
        actual?.oleajeSwellM != null ? `swell ${actual.oleajeSwellM.toFixed(1)} m` : null,
      ].filter(Boolean).join(" · ")
    : null;

  const pillTone = colapsado ? toneResumen : tone;
  const pillEval = colapsado ? resumenSem : evalActual;

  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14,
      padding: colapsado ? "14px 18px" : "18px 20px",
      boxShadow: "0 2px 8px rgba(15,35,55,.06)",
    }}>
      {/* Encabezado */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: colapsado ? 0 : 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
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
          {distintoEmpresa && !colapsado && (
            <div style={{ fontSize: 11, color: C.slate, marginTop: 6, marginLeft: 22 }}>
              Puerto empresa: {puertoEmpresa}
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {!loading && actual && (
            <Pill tone={pillTone}>
              {pillEval.nivel === "rojo" ? <AlertTriangle size={12} /> : <CheckCircle2 size={12} />}
              {pillEval.label}
            </Pill>
          )}
          <button type="button" onClick={cargar} disabled={loading} title="Actualizar pronóstico" data-nofx
            style={{ ...ghostBtn, padding: "8px 10px", display: "inline-flex", alignItems: "center" }}>
            <RefreshCw size={14} style={loading ? { animation: "spin 0.8s linear infinite" } : undefined} />
          </button>
          <button type="button" onClick={toggleColapsado} title={colapsado ? "Expandir widget" : "Minimizar widget"} data-nofx
            style={{ ...ghostBtn, padding: "8px 10px", display: "inline-flex", alignItems: "center" }}>
            {colapsado ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        </div>
      </div>

      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: colapsado ? "12px 0 0" : "24px 0", color: C.slate }}>
          <InlineSpinner /> Cargando pronóstico…
        </div>
      )}

      {error && !loading && (
        <div style={{ padding: "12px 14px", borderRadius: 8, background: tint(C.red, 10), border: `1px solid ${tint(C.red, 30)}`, color: C.red, fontSize: 13, marginTop: colapsado ? 10 : 0 }}>
          {error.includes("404") || error.includes("Failed")
            ? "Función de pronóstico no desplegada. Ejecuta: supabase functions deploy pronostico-operacional"
            : error}
        </div>
      )}

      {!loading && !error && actual && (
        <>
          {/* Semáforos operacionales */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 8,
            marginBottom: colapsado ? 0 : 14,
            marginTop: colapsado ? 12 : 0,
          }}>
            <SemáforoChip icon={Anchor} titulo="Zarpe" eval={semaforos.zarpe} />
            <SemáforoChip icon={HardHat} titulo="Cubierta" eval={semaforos.cubierta} />
            <SemáforoChip icon={Wrench} titulo="PM puerto" eval={semaforos.pmPuerto} />
          </div>

          {!colapsado && (
            <>
              {/* Pestañas */}
              <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    style={{
                      padding: "6px 14px",
                      borderRadius: 8,
                      border: `1px solid ${tab === t.id ? C.steel : C.line}`,
                      background: tab === t.id ? tint(C.steel, 10) : C.surface2,
                      color: tab === t.id ? C.abyss : C.slate,
                      fontSize: 12.5,
                      fontWeight: tab === t.id ? 700 : 600,
                      cursor: "pointer",
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {tab === "hoy" && (
                <>
                  <div style={{
                    display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))",
                    gap: 12, marginBottom: 16, padding: 14, borderRadius: 10,
                    background: tint(colorEval, 6), border: `1px solid ${tint(colorEval, 22)}`,
                  }}>
                    <Metrica icon={Thermometer} label="Temp." value={actual.tempC != null ? `${Math.round(actual.tempC)}°C` : "—"} />
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4, alignSelf: "flex-start" }}>
                        <Wind size={13} color={C.slate} />
                        <span style={{ fontSize: 10, fontWeight: 700, color: C.slate, textTransform: "uppercase", letterSpacing: 0.5 }}>Viento</span>
                      </div>
                      <FlechaViento
                        grados={actual.vientoDir}
                        kn={actual.vientoKn}
                        label={actual.vientoDirLabel || direccionViento(actual.vientoDir)}
                        size={48}
                      />
                    </div>
                    <Metrica icon={Waves} label="Oleaje" value={actual.oleajeM != null ? `${actual.oleajeM.toFixed(1)} m` : "—"}
                      sub={oleajeDetalle} />
                    <Metrica icon={Droplets} label="Lluvia" value={precip6h > 0 ? `${precip6h.toFixed(1)} mm` : "0 mm"}
                      sub="próx. 6 h" compact />
                    <Metrica icon={Cloud} label="Cielo" value={etiquetaClima(actual.climaCode)} compact />
                    {actual.mareaM != null && (
                      <Metrica icon={Anchor} label="Marea est." value={`${actual.mareaM.toFixed(1)} m`}
                        sub="MSL modelado" compact />
                    )}
                  </div>

                  {mareaInfo && (mareaInfo.pleamar || mareaInfo.bajamar) && (
                    <div style={{
                      fontSize: 12, color: C.steel, marginBottom: 14, padding: "10px 12px",
                      borderRadius: 8, background: tint(C.cyan, 5), border: `1px solid ${tint(C.cyan, 18)}`,
                    }}>
                      {etiquetaEventoMarea(mareaInfo.pleamar) && <span>{etiquetaEventoMarea(mareaInfo.pleamar)}</span>}
                      {mareaInfo.pleamar && mareaInfo.bajamar && <span> · </span>}
                      {etiquetaEventoMarea(mareaInfo.bajamar) && <span>{etiquetaEventoMarea(mareaInfo.bajamar)}</span>}
                    </div>
                  )}

                  {horasHoy.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: C.slate, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8 }}>
                        Resto del día
                      </div>
                      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
                        {horasHoy.slice(0, 12).map((h) => (
                          <div key={h.time} style={{
                            flex: "0 0 auto", minWidth: 72, padding: "8px 10px", borderRadius: 8,
                            border: `1px solid ${C.line}`, background: C.surface2, textAlign: "center",
                          }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: C.slate }}>{formatearHoraCorta(h.time)}</div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: C.abyss, marginTop: 4 }}>
                              {h.vientoKn != null ? `${Math.round(h.vientoKn)} kn` : "—"}
                            </div>
                            <div style={{ fontSize: 10, color: C.steel }}>
                              {h.oleajeM != null ? `${h.oleajeM.toFixed(1)} m` : "—"}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {tab === "48h" && (
                <>
                  <PronosticoGrafico horario={datos?.horario} />
                  <PronosticoMarea horario={datos?.horario} />
                </>
              )}

              {tab === "7d" && dias7.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, marginBottom: 16 }}>
                  {dias7.map((d) => {
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
                  {datos.modelos?.oleaje && (
                    <span> · Oleaje: {etiquetaModeloOleaje(datos.modelos.oleaje)}</span>
                  )}
                  {datos.modelos?.marea && (
                    <span> · Marea: MeteoFrance (estimada)</span>
                  )}
                  {datos.actualizado && (
                    <span> · Actualizado {new Date(datos.actualizado).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}</span>
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function SemáforoChip({ icon: Icon, titulo, eval: ev }) {
  const color = TONE_COLOR[ev.tone] || C.green;
  const IconStatus = ev.nivel === "rojo" ? AlertTriangle : CheckCircle2;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
      borderRadius: 10, border: `1px solid ${tint(color, 28)}`, background: tint(color, 6),
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
        background: tint(color, 14),
      }}>
        <Icon size={16} color={color} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.slate, textTransform: "uppercase", letterSpacing: 0.4 }}>
          {titulo}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
          <IconStatus size={12} color={color} />
          <span style={{ fontSize: 12, fontWeight: 700, color }}>{ev.label}</span>
        </div>
      </div>
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
