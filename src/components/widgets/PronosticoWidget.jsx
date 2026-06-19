import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Cloud, Wind, Waves, Sparkles, RefreshCw, AlertTriangle, CheckCircle2,
  Thermometer, MapPin, Droplets, Anchor, HardHat, Wrench, ChevronDown, ChevronUp,
  Sun, CloudRain, CloudFog, Clock,
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
import { C, tint, archivo, shadow } from "../../theme";
import { Pill, InlineSpinner, ghostBtn, primaryBtn, inputStyle } from "../../ui";
import { renderMarkdown } from "../Markdown";
import PronosticoGrafico, { FlechaViento } from "./PronosticoGrafico";
import PronosticoMarea from "./PronosticoMarea";

const TONE_COLOR = { green: C.green, yellow: C.amber, red: C.red };
const TONE_HERO = {
  green: `linear-gradient(135deg, ${tint(C.green, 14)} 0%, ${tint(C.cyan, 6)} 42%, ${C.surface} 100%)`,
  yellow: `linear-gradient(135deg, ${tint(C.amber, 16)} 0%, ${tint(C.gold, 8)} 38%, ${C.surface} 100%)`,
  red: `linear-gradient(135deg, ${tint(C.red, 14)} 0%, ${tint(C.amber, 6)} 40%, ${C.surface} 100%)`,
};
const TABS = [
  { id: "hoy", label: "Hoy" },
  { id: "48h", label: "48 h" },
  { id: "7d", label: "7 días" },
];

function iconoClima(code) {
  const c = Number(code);
  if (c === 0) return Sun;
  if (c <= 3) return Cloud;
  if (c <= 48) return CloudFog;
  if (c <= 82) return CloudRain;
  return Cloud;
}

function fmtActualizado(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return null;
  }
}

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
  const heroTone = colapsado ? toneResumen : tone;
  const heroColor = TONE_COLOR[heroTone] || C.green;
  const IconClima = iconoClima(actual?.climaCode);
  const horaAct = fmtActualizado(datos?.actualizado);

  return (
    <div
      className="cmms-pronostico-widget"
      style={{
        position: "relative",
        background: C.surface,
        border: `1px solid ${tint(heroColor, 22)}`,
        borderRadius: 16,
        overflow: "hidden",
        boxShadow: shadow.md,
      }}
    >
      <div style={{ height: 4, background: `linear-gradient(90deg, ${heroColor}, ${tint(heroColor, 40)})` }} />

      {/* Encabezado */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: 14,
        padding: colapsado ? "16px 20px 14px" : "18px 22px 0",
        flexWrap: "wrap",
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, letterSpacing: 1.8, textTransform: "uppercase", color: C.steel, fontWeight: 700, marginBottom: 8 }}>
            Ventana operacional
          </div>
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 10px 6px 12px",
            borderRadius: 12,
            border: `1px solid ${C.line}`,
            background: C.surface2,
            maxWidth: "100%",
          }}>
            <MapPin size={15} color={C.sky} style={{ flexShrink: 0 }} />
            <select
              value={puertoSel}
              onChange={(e) => cambiarPuerto(e.target.value)}
              disabled={loading}
              aria-label="Seleccionar puerto para pronóstico"
              style={{
                ...inputStyle(),
                border: "none",
                background: "transparent",
                width: "auto",
                minWidth: 140,
                maxWidth: "100%",
                ...archivo,
                fontSize: 15,
                fontWeight: 800,
                color: C.ink,
                padding: "2px 4px 2px 0",
                cursor: loading ? "wait" : "pointer",
                boxShadow: "none",
              }}
            >
              {puertos.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          {distintoEmpresa && (
            <div style={{ fontSize: 11.5, color: C.slate, marginTop: 8 }}>
              Puerto empresa · {puertoEmpresa}
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {!loading && actual && (
            <Pill tone={pillTone}>
              {pillEval.nivel === "rojo" ? <AlertTriangle size={12} /> : <CheckCircle2 size={12} />}
              {pillEval.label}
            </Pill>
          )}
          <button type="button" onClick={cargar} disabled={loading} title="Actualizar pronóstico" data-nofx
            style={{ ...ghostBtn, padding: "9px 10px", borderRadius: 10, display: "inline-flex", alignItems: "center" }}>
            <RefreshCw size={15} style={loading ? { animation: "cmms-pron-spin 0.8s linear infinite" } : undefined} />
          </button>
          <button type="button" onClick={toggleColapsado} title={colapsado ? "Expandir widget" : "Minimizar widget"} data-nofx
            style={{ ...ghostBtn, padding: "9px 10px", borderRadius: 10, display: "inline-flex", alignItems: "center" }}>
            {colapsado ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
          </button>
        </div>
      </div>

      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "28px 22px", color: C.slate }}>
          <InlineSpinner /> Cargando pronóstico marítimo…
        </div>
      )}

      {error && !loading && (
        <div style={{
          margin: "0 22px 18px",
          padding: "12px 14px",
          borderRadius: 10,
          background: tint(C.red, 10),
          border: `1px solid ${tint(C.red, 30)}`,
          color: C.red,
          fontSize: 13,
        }}>
          {error.includes("404") || error.includes("Failed")
            ? "Función de pronóstico no desplegada. Ejecuta: supabase functions deploy pronostico-operacional"
            : error}
        </div>
      )}

      {!loading && !error && actual && (
        <>
          {/* Hero — condiciones actuales */}
          <div style={{
            margin: colapsado ? "0 20px 16px" : "14px 22px 0",
            padding: colapsado ? "16px 18px" : "20px 22px",
            borderRadius: 14,
            background: TONE_HERO[heroTone] || TONE_HERO.green,
            border: `1px solid ${tint(heroColor, 18)}`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <div style={{
                width: 56, height: 56, borderRadius: 14, flexShrink: 0,
                background: tint(heroColor, 12),
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <IconClima size={28} color={heroColor} strokeWidth={2} />
              </div>
              <div style={{ flex: 1, minWidth: 140 }}>
                <div style={{ ...archivo, fontSize: colapsado ? 36 : 44, fontWeight: 800, color: C.ink, lineHeight: 1, letterSpacing: -1 }}>
                  {actual.tempC != null ? `${Math.round(actual.tempC)}°` : "—"}
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.slate, marginTop: 6 }}>
                  {etiquetaClima(actual.climaCode)}
                </div>
              </div>
              {!colapsado && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginLeft: "auto" }}>
                  <HeroStat icon={Wind} label="Viento" value={actual.vientoKn != null ? `${Math.round(actual.vientoKn)} kn` : "—"} sub={actual.vientoDirLabel || direccionViento(actual.vientoDir)} />
                  <HeroStat icon={Waves} label="Oleaje" value={actual.oleajeM != null ? `${actual.oleajeM.toFixed(1)} m` : "—"} sub={oleajeDetalle} />
                  <HeroStat icon={Droplets} label="Lluvia 6 h" value={precip6h > 0 ? `${precip6h.toFixed(1)} mm` : "0 mm"} />
                </div>
              )}
            </div>
            {colapsado && (
              <div style={{ display: "flex", gap: 16, marginTop: 14, flexWrap: "wrap", fontSize: 13, fontWeight: 600, color: C.steel }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Wind size={14} /> {actual.vientoKn != null ? `${Math.round(actual.vientoKn)} kn` : "—"}</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Waves size={14} /> {actual.oleajeM != null ? `${actual.oleajeM.toFixed(1)} m` : "—"}</span>
              </div>
            )}
            {horaAct && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 12, fontSize: 11.5, color: C.slate }}>
                <Clock size={12} /> Actualizado {horaAct}
              </div>
            )}
          </div>

          {/* Semáforos operacionales */}
          <div
            className="cmms-pronostico-semaforos"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: 10,
              padding: colapsado ? "0 20px 16px" : "16px 22px 0",
            }}
          >
            <SemáforoCard icon={Anchor} titulo="Zarpe" eval={semaforos.zarpe} />
            <SemáforoCard icon={HardHat} titulo="Cubierta" eval={semaforos.cubierta} />
            <SemáforoCard icon={Wrench} titulo="PM puerto" eval={semaforos.pmPuerto} />
          </div>

          {!colapsado && (
            <div style={{ padding: "8px 22px 22px" }}>
              {/* Pestañas segmentadas */}
              <div style={{
                display: "inline-flex",
                gap: 4,
                padding: 4,
                borderRadius: 12,
                background: C.surface2,
                border: `1px solid ${C.line}`,
                marginBottom: 18,
              }}>
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    style={{
                      padding: "8px 16px",
                      borderRadius: 9,
                      border: "none",
                      background: tab === t.id ? C.surface : "transparent",
                      color: tab === t.id ? C.ink : C.slate,
                      fontSize: 12.5,
                      fontWeight: tab === t.id ? 700 : 600,
                      cursor: "pointer",
                      boxShadow: tab === t.id ? shadow.sm : "none",
                      fontFamily: "inherit",
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {tab === "hoy" && (
                <>
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))",
                    gap: 10,
                    marginBottom: 16,
                  }}>
                    <MetricTile icon={Thermometer} label="Temperatura" value={actual.tempC != null ? `${Math.round(actual.tempC)}°C` : "—"} tone={heroColor} />
                    <MetricTile icon={Wind} label="Viento" value={actual.vientoKn != null ? `${Math.round(actual.vientoKn)} kn` : "—"} sub={actual.vientoDirLabel || direccionViento(actual.vientoDir)} tone={C.steel} />
                    <MetricTile icon={Waves} label="Oleaje" value={actual.oleajeM != null ? `${actual.oleajeM.toFixed(1)} m` : "—"} sub={oleajeDetalle} tone={C.cyan} />
                    <MetricTile icon={Droplets} label="Precipitación" value={precip6h > 0 ? `${precip6h.toFixed(1)} mm` : "0 mm"} sub="próx. 6 h" tone={C.sky} />
                    {actual.mareaM != null && (
                      <MetricTile icon={Anchor} label="Marea est." value={`${actual.mareaM.toFixed(1)} m`} sub="MSL modelado" tone={C.indigo} />
                    )}
                  </div>

                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "12px 0 16px",
                    marginBottom: 8,
                  }}>
                    <FlechaViento
                      grados={actual.vientoDir}
                      kn={actual.vientoKn}
                      label={actual.vientoDirLabel || direccionViento(actual.vientoDir)}
                      size={64}
                    />
                  </div>

                  {mareaInfo && (mareaInfo.pleamar || mareaInfo.bajamar) && (
                    <div style={{
                      fontSize: 12.5,
                      color: C.ink,
                      marginBottom: 16,
                      padding: "12px 14px",
                      borderRadius: 12,
                      background: tint(C.cyan, 6),
                      border: `1px solid ${tint(C.cyan, 20)}`,
                      lineHeight: 1.5,
                    }}>
                      {etiquetaEventoMarea(mareaInfo.pleamar) && <span>{etiquetaEventoMarea(mareaInfo.pleamar)}</span>}
                      {mareaInfo.pleamar && mareaInfo.bajamar && <span> · </span>}
                      {etiquetaEventoMarea(mareaInfo.bajamar) && <span>{etiquetaEventoMarea(mareaInfo.bajamar)}</span>}
                    </div>
                  )}

                  {horasHoy.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: C.slate, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 10 }}>
                        Resto del día
                      </div>
                      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 6, scrollbarWidth: "thin" }}>
                        {horasHoy.slice(0, 12).map((h) => (
                          <div key={h.time} style={{
                            flex: "0 0 auto",
                            minWidth: 78,
                            padding: "10px 12px",
                            borderRadius: 12,
                            border: `1px solid ${C.line}`,
                            background: C.surface2,
                            textAlign: "center",
                          }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: C.slate }}>{formatearHoraCorta(h.time)}</div>
                            <div style={{ ...archivo, fontSize: 14, fontWeight: 800, color: C.ink, marginTop: 6 }}>
                              {h.vientoKn != null ? `${Math.round(h.vientoKn)}` : "—"}
                              <span style={{ fontSize: 10, fontWeight: 600, color: C.slate }}> kn</span>
                            </div>
                            <div style={{ fontSize: 11, color: C.cyan, marginTop: 3, fontWeight: 600 }}>
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
                  <PronosticoMarea horario={datos?.horario} puertoLabel={datos?.puerto || puertoSel} />
                </>
              )}

              {tab === "7d" && dias7.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(108px, 1fr))", gap: 10, marginBottom: 16 }}>
                  {dias7.map((d) => {
                    const c = TONE_COLOR[d.evaluacion.tone] || C.green;
                    return (
                      <div key={d.fecha} style={{
                        padding: "12px 14px",
                        borderRadius: 12,
                        border: `1px solid ${tint(c, 22)}`,
                        background: tint(c, 5),
                        borderTop: `3px solid ${c}`,
                      }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: C.slate, textTransform: "capitalize", marginBottom: 8 }}>
                          {formatearDia(d.fecha)}
                        </div>
                        <div style={{ ...archivo, fontSize: 15, fontWeight: 800, color: C.ink }}>
                          {d.tempMin != null && d.tempMax != null ? `${Math.round(d.tempMin)}–${Math.round(d.tempMax)}°` : "—"}
                        </div>
                        <div style={{ fontSize: 11.5, color: C.steel, marginTop: 6, lineHeight: 1.4 }}>
                          {d.vientoMaxKn != null ? `${Math.round(d.vientoMaxKn)} kn` : ""}
                          {d.oleajeMaxM != null ? ` · ${d.oleajeMaxM.toFixed(1)} m` : ""}
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: c, marginTop: 8 }}>{d.evaluacion.label}</div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Brief IA */}
              <div style={{
                marginTop: 8,
                padding: "16px 18px",
                borderRadius: 14,
                border: `1px solid ${tint(C.cyan, 22)}`,
                background: `linear-gradient(180deg, ${tint(C.cyan, 5)} 0%, ${C.surface} 100%)`,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: brief || genBrief ? 12 : 0, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 9,
                      background: tint(C.cyan, 12),
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <Sparkles size={16} color={C.cyan} />
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>Brief operacional IA</span>
                  </div>
                  <button type="button" onClick={generarBrief} disabled={genBrief || !datos}
                    style={{ ...primaryBtn, padding: "8px 14px", fontSize: 12.5, display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 10 }}>
                    {genBrief ? "Generando…" : brief ? "Regenerar" : "Generar brief"}
                  </button>
                </div>

                {genBrief && !brief && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.slate, fontSize: 13, padding: "4px 0" }}>
                    <InlineSpinner /> Analizando condiciones…
                  </div>
                )}

                {briefError === "FALTA_API_KEY" && (
                  <div style={{ fontSize: 12, color: C.amber, padding: "4px 0", lineHeight: 1.5 }}>
                    Falta <code style={{ fontSize: 11 }}>ANTHROPIC_API_KEY</code> en Supabase Edge Functions.
                  </div>
                )}
                {briefError && briefError !== "FALTA_API_KEY" && (
                  <div style={{ fontSize: 12, color: C.red, padding: "4px 0" }}>{briefError}</div>
                )}

                {brief && (
                  <div style={{
                    fontSize: 13.5,
                    color: C.ink,
                    lineHeight: 1.65,
                    padding: "14px 16px",
                    borderRadius: 10,
                    background: C.surface,
                    border: `1px solid ${tint(C.cyan, 18)}`,
                  }}>
                    {renderMarkdown(brief)}
                  </div>
                )}

                <div style={{ fontSize: 10.5, color: C.slate, marginTop: 12, lineHeight: 1.45 }}>
                  Apoyo a la decisión operacional. No reemplaza avisos oficiales de Directemar.
                  {datos.modelos?.oleaje && (
                    <span> · Oleaje: {etiquetaModeloOleaje(datos.modelos.oleaje)}</span>
                  )}
                  {datos.modelos?.marea && (
                    <span> · Marea: MeteoFrance (estimada)</span>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      <style>{`
        @keyframes cmms-pron-spin { to { transform: rotate(360deg); } }
        @media (max-width: 640px) {
          .cmms-pronostico-semaforos { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

function SemáforoCard({ icon: Icon, titulo, eval: ev }) {
  const color = TONE_COLOR[ev.tone] || C.green;
  const IconStatus = ev.nivel === "rojo" ? AlertTriangle : CheckCircle2;
  return (
    <div style={{
      position: "relative",
      padding: "12px 14px 12px 18px",
      borderRadius: 12,
      border: `1px solid ${tint(color, 24)}`,
      background: tint(color, 5),
      overflow: "hidden",
    }}>
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: color }} />
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 10, flexShrink: 0,
          background: tint(color, 12),
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Icon size={17} color={color} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.slate, textTransform: "uppercase", letterSpacing: 0.5 }}>
            {titulo}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 3 }}>
            <IconStatus size={13} color={color} />
            <span style={{ fontSize: 12.5, fontWeight: 700, color }}>{ev.label}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function HeroStat({ icon: Icon, label, value, sub }) {
  return (
    <div style={{
      padding: "10px 14px",
      borderRadius: 12,
      background: tint(C.surface, 70),
      border: `1px solid ${tint(C.line, 80)}`,
      minWidth: 100,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
        <Icon size={13} color={C.slate} />
        <span style={{ fontSize: 10, fontWeight: 700, color: C.slate, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</span>
      </div>
      <div style={{ ...archivo, fontSize: 16, fontWeight: 800, color: C.ink }}>{value}</div>
      {sub && <div style={{ fontSize: 10.5, color: C.slate, marginTop: 2, maxWidth: 120, lineHeight: 1.3 }}>{sub}</div>}
    </div>
  );
}

function MetricTile({ icon: Icon, label, value, sub, tone = C.steel }) {
  return (
    <div style={{
      padding: "14px 14px 12px",
      borderRadius: 12,
      border: `1px solid ${tint(tone, 18)}`,
      background: tint(tone, 4),
    }}>
      <div style={{
        width: 30, height: 30, borderRadius: 8, marginBottom: 10,
        background: tint(tone, 10),
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Icon size={15} color={tone} />
      </div>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.slate, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
      <div style={{ ...archivo, fontSize: 17, fontWeight: 800, color: C.ink, lineHeight: 1.2 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.slate, marginTop: 4, lineHeight: 1.35 }}>{sub}</div>}
    </div>
  );
}
