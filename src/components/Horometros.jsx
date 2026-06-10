import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Timer, Save, ChevronDown, ChevronRight, History, AlertCircle, CheckCircle2, CornerDownRight, Ban, Droplet } from "lucide-react";
import { useAuth } from "../lib/auth";
import { fetchAll, insertRow, logActivity } from "../lib/db";
import { supabase } from "../lib/supabase";
import { validarLectura, tendenciaHorasDia, diasDesde, modoHorometro, puntoHorometro, idsBajoPunto } from "../lib/horometro";
import { buildEquipoTree } from "../lib/equipTree";
import { useArbolColapsable, BotonesColapsar, colorTipo, fondoTipo } from "../lib/arbolColapsable";
import { C, num, canOperate, tint } from "../theme";
import {
  Card, PageHead, Pill, FilterBtn, primaryBtn, inputStyle,
  thStyle, tdStyle, Empty, ErrorBanner, InlineSpinner, GuiaColapsable,
} from "../ui";

// Semáforo de antigüedad de la última lectura
function toneAntiguedad(dias) {
  if (dias == null) return ["slate", "Sin lecturas"];
  if (dias <= 7)  return ["green",  `hace ${Math.round(dias)} d`];
  if (dias <= 30) return ["yellow", `hace ${Math.round(dias)} d`];
  return ["red", `hace ${Math.round(dias)} d`];
}

const MODOS = [
  { value: "propio", label: "Propio" },
  { value: "hereda", label: "Hereda" },
  { value: "no", label: "No aplica" },
];

export default function Horometros() {
  const { profile } = useAuth();
  const [embarcaciones, setEmbarcaciones] = useState([]);
  const [equipos, setEquipos]   = useState([]);
  const [lecturas, setLecturas] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [okMsg, setOkMsg]       = useState(null);
  const [filtro, setFiltro]     = useState("all");
  const [verTodos, setVerTodos] = useState(false);   // configurar modos vs solo con horómetro
  const [valores, setValores]   = useState({});      // puntoId → texto ingresado
  const [histAbierto, setHistAbierto] = useState(null);
  const [guardando, setGuardando]     = useState(false);
  const puedeOperar = canOperate(profile?.rol);

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [em, eq, lec] = await Promise.all([
        fetchAll("embarcaciones", { order: { col: "codigo", asc: true } }),
        fetchAll("equipos",       { order: { col: "id_visible", asc: true } }),
        fetchAll("lecturas_horometro", { order: { col: "fecha", asc: false } }),
      ]);
      setEmbarcaciones(em); setEquipos(eq); setLecturas(lec);
    } catch (e) { setError("No se pudieron cargar los horómetros. " + e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const byId = useMemo(() => new Map(equipos.map((e) => [e.id, e])), [equipos]);
  const lecturasDe = useCallback((id) => lecturas.filter((l) => l.equipo_id === id), [lecturas]);
  const embName = (id) => embarcaciones.find((v) => v.id === id)?.nombre || "—";

  const equiposNave = useMemo(
    () => (filtro === "all" ? equipos : equipos.filter((e) => e.embarcacion_id === filtro)),
    [equipos, filtro]);

  // "Solo con horómetro": el subárbol de cada punto propio (propio + lo que hereda),
  // excluyendo los 'no'. "Todos": el árbol completo para configurar los modos.
  const lista = useMemo(() => {
    const base = verTodos ? equiposNave : equiposNave.filter((e) => puntoHorometro(e, byId) !== null);
    return buildEquipoTree(base);
  }, [equiposNave, verTodos, byId]);

  const arbol = useArbolColapsable(lista);
  const listaVisible = lista.filter((eq) => arbol.visible(eq));

  // KPIs sobre los PUNTOS de horómetro de la nave en foco
  const kpis = useMemo(() => {
    const puntos = equiposNave.filter((e) => modoHorometro(e) === "propio");
    const dias = puntos.map((e) => diasDesde(lecturasDe(e.id)[0]?.fecha));
    return {
      puntos: puntos.length,
      alDia: dias.filter((d) => d != null && d <= 7).length,
      atrasados: dias.filter((d) => d == null || d > 30).length,
    };
  }, [equiposNave, lecturasDe]);

  const pendientes = Object.entries(valores).filter(([, v]) => String(v).trim() !== "");

  // Cambia el modo de horómetro de un nodo (propio / hereda / no).
  async function cambiarModo(eq, modo) {
    if (modo === modoHorometro(eq)) return;
    const previo = eq.horometro;
    setEquipos((p) => p.map((x) => x.id === eq.id ? { ...x, horometro: modo } : x));
    try {
      await supabase.from("equipos").update({ horometro: modo }).eq("id", eq.id);
      logActivity(profile, "Horómetro: cambiar modo", `${eq.id_visible} · ${modo}`);
    } catch (e) {
      setEquipos((p) => p.map((x) => x.id === eq.id ? { ...x, horometro: previo } : x));
      setError("No se pudo cambiar el modo: " + e.message);
    }
  }

  // Marca/desmarca "consume aceite" en un punto de horómetro (la máquina). Este
  // flag reparte el aceite consumido entre los motores en Consumos & Eficiencia
  // (proporcional a sus horas). Solo aplica a máquinas con horómetro propio.
  async function toggleConsumeAceite(eq) {
    const nuevo = !eq.consume_aceite;
    setEquipos((p) => p.map((x) => x.id === eq.id ? { ...x, consume_aceite: nuevo } : x));
    try {
      await supabase.from("equipos").update({ consume_aceite: nuevo }).eq("id", eq.id);
      logActivity(profile, "Horómetro: consume aceite", `${eq.id_visible} · ${nuevo ? "sí" : "no"}`);
    } catch (e) {
      setEquipos((p) => p.map((x) => x.id === eq.id ? { ...x, consume_aceite: !nuevo } : x));
      setError("No se pudo guardar: " + e.message);
    }
  }

  // Guarda las lecturas pendientes (cada una en su punto propio) y PROPAGA las
  // horas a todo el subárbol que hereda, para que el PM por intervalo de cada
  // componente use las horas de su máquina.
  async function guardarLecturas() {
    if (!pendientes.length) return;
    setGuardando(true); setError(null); setOkMsg(null);
    const guardadas = [];
    try {
      for (const [puntoId, valor] of pendientes) {
        const eq = byId.get(puntoId);
        if (!eq) continue;
        const ultima = lecturasDe(puntoId)[0];
        const v = validarLectura({ horasPrev: eq.horas_actual ?? null, fechaPrev: ultima?.fecha ?? null, horas: Number(valor) });
        if (!v.ok) { setError(`${eq.id_visible}: ${v.error}`); continue; }
        if (v.warning && !window.confirm(`${eq.id_visible} · ${eq.sistema}\n\n${v.warning}\n\n¿Guardar de todas formas?`)) continue;

        const horas = Number(valor);
        const row = await insertRow("lecturas_horometro", profile.empresa_id, {
          equipo_id: puntoId, horas, horas_anterior: eq.horas_actual ?? null,
          fuente: "manual", usuario_id: profile.id, usuario_nombre: profile.nombre || "",
        });
        // Propaga las horas al punto + sus descendientes que heredan.
        const ids = idsBajoPunto(puntoId, equipos, byId);
        await supabase.from("equipos").update({ horas_actual: horas }).in("id", ids);

        setLecturas((p) => [row, ...p]);
        setEquipos((p) => p.map((x) => ids.includes(x.id) ? { ...x, horas_actual: horas } : x));
        setValores((p) => { const n = { ...p }; delete n[puntoId]; return n; });
        guardadas.push(`${eq.id_visible} (+${ids.length - 1} comp.)`);
      }
      if (guardadas.length) {
        setOkMsg(`${guardadas.length} lectura(s) guardada(s) y propagada(s): ${guardadas.join(", ")}`);
        logActivity(profile, "Registrar lecturas de horómetro", guardadas.join(", "));
      }
    } catch (e) { setError("No se pudo guardar: " + e.message); }
    finally { setGuardando(false); }
  }

  if (loading) return <div><PageHead kicker="Operación · Datos de Operación" title="Horómetros" /><Card><InlineSpinner label="Cargando horómetros…" /></Card></div>;

  return (
    <div>
      <PageHead kicker="Operación · Datos de Operación" title="Horómetros"
        sub="El horómetro vive en la máquina (Motor Principal, Generador…); sus componentes heredan esas horas. Ingresas la lectura una vez y se propaga al subárbol — alimenta Plan Preventivo, MTBF, Weibull y CGM."
        action={puedeOperar && (
          <button onClick={guardarLecturas} disabled={guardando || !pendientes.length}
            style={{ ...primaryBtn, opacity: pendientes.length ? 1 : 0.5 }}>
            <Save size={15} /> {guardando ? "Guardando…" : `Guardar ${pendientes.length || ""} lectura(s)`}
          </button>
        )} />

      <ErrorBanner onRetry={cargar}>{error}</ErrorBanner>
      {okMsg && (
        <Card style={{ marginBottom: 14, padding: "10px 16px", border: `1px solid ${tint(C.green, 40)}`, background: tint(C.green, 8), display: "flex", alignItems: "center", gap: 8 }}>
          <CheckCircle2 size={16} color={C.green} /><span style={{ fontSize: 12.5, color: C.green, fontWeight: 600 }}>{okMsg}</span>
        </Card>
      )}

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 16 }}>
        {[
          ["Puntos de horómetro", kpis.puntos, C.steel, Timer],
          ["Lectura al día (≤7 d)", kpis.alDia, C.green, CheckCircle2],
          ["Sin lectura / atrasada (>30 d)", kpis.atrasados, kpis.atrasados ? C.red : C.green, AlertCircle],
        ].map(([lbl, val, tone, Icon]) => (
          <Card key={lbl} style={{ padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 10.5, letterSpacing: 1.1, textTransform: "uppercase", color: C.slate, fontWeight: 700 }}>{lbl}</div>
              <div style={{ fontSize: 25, fontWeight: 800, color: tone, marginTop: 6 }}>{val}</div>
            </div>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: tint(tone, 12), display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon size={19} color={tone} />
            </div>
          </Card>
        ))}
      </div>

      {/* Filtros + vista */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <FilterBtn active={filtro === "all"} onClick={() => setFiltro("all")}>Todas</FilterBtn>
        {embarcaciones.map((v) => (
          <FilterBtn key={v.id} active={filtro === v.id} onClick={() => setFiltro(v.id)} color={v.color}>{v.nombre}</FilterBtn>
        ))}
        <label style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.slate, fontWeight: 600, cursor: "pointer" }}>
          <input type="checkbox" checked={verTodos} onChange={(e) => setVerTodos(e.target.checked)} style={{ accentColor: C.steel }} />
          Ver todos los equipos (configurar horómetros)
        </label>
      </div>

      <BotonesColapsar conHijos={arbol.conHijos} colapsarTodo={arbol.colapsarTodo} />

      {listaVisible.length === 0 ? (
        <Card><Empty>
          <Timer size={30} color={C.line} style={{ marginBottom: 10 }} /><br />
          No hay puntos de horómetro para este filtro. Activa "Ver todos los equipos" y marca como <strong>Propio</strong> las máquinas que tengan horómetro.
        </Empty></Card>
      ) : (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1080 }}>
              <thead><tr>
                <th style={thStyle}>Sistema / Equipo</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Horómetro</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Horas</th>
                <th style={thStyle}>Última lectura</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Tendencia</th>
                <th style={{ ...thStyle, textAlign: "center" }} title="Reparte el aceite consumido entre motores (Consumos & Eficiencia)">Consume aceite</th>
                {puedeOperar && <th style={{ ...thStyle, textAlign: "right" }}>Nueva lectura (h)</th>}
                <th style={{ ...thStyle, textAlign: "center" }}>Hist.</th>
              </tr></thead>
              <tbody>
                {listaVisible.map((eq) => {
                  const modo = modoHorometro(eq);
                  const puntoId = puntoHorometro(eq, byId);
                  const esPropio = modo === "propio";
                  const esNo = modo === "no" || puntoId === null;
                  const punto = puntoId ? byId.get(puntoId) : null;
                  const horas = punto?.horas_actual ?? null;
                  const tieneHijos = arbol.tieneHijos(eq);
                  const colapsado = arbol.estaColapsado(eq);
                  const nSub = arbol.nSubDe(eq);
                  const lecs = esPropio ? lecturasDe(eq.id) : [];
                  const ultima = lecs[0];
                  const dias = esPropio ? diasDesde(ultima?.fecha) : null;
                  const [tone, label] = toneAntiguedad(dias);
                  const hxd = esPropio ? tendenciaHorasDia(lecs) : null;
                  const abierto = histAbierto === eq.id;
                  return ([
                    <tr key={eq.id} style={{ background: esNo ? tint(C.slate, 4) : fondoTipo(eq), opacity: esNo ? 0.6 : 1 }}>
                      {/* Árbol */}
                      <td style={tdStyle}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: eq.depth * 16 }}>
                          <span style={{ width: 3, height: 16, borderRadius: 2, background: colorTipo(eq), flexShrink: 0 }} />
                          {tieneHijos ? (
                            <button onClick={() => arbol.toggle(eq.id)} title={colapsado ? "Expandir" : "Colapsar"}
                              style={{ background: "none", border: "none", cursor: "pointer", color: C.steel, padding: 0, display: "flex", flexShrink: 0 }}>
                              {colapsado ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                            </button>
                          ) : eq.depth > 0 ? <span style={{ color: C.slate, fontSize: 12, flexShrink: 0 }}>└─</span> : <span style={{ width: 16, flexShrink: 0 }} />}
                          <div style={{ minWidth: 0 }}>
                            <span style={{ fontWeight: eq.depth === 0 ? 700 : 600, color: eq.depth === 0 ? C.abyss : C.ink, fontSize: 13 }}>{eq.sistema}</span>
                            <span style={{ fontSize: 11, color: C.slate, marginLeft: 7, fontFamily: "'IBM Plex Mono', monospace" }}>{eq.id_visible}</span>
                            {colapsado && nSub > 0 && <span style={{ fontSize: 11, color: C.steel, marginLeft: 7, fontWeight: 600 }}>▸ {nSub}</span>}
                          </div>
                        </div>
                      </td>
                      {/* Modo */}
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        {puedeOperar
                          ? <select value={modo} onChange={(e) => cambiarModo(eq, e.target.value)}
                              style={{ ...inputStyle(108), padding: "4px 8px", fontSize: 11.5, fontWeight: 600,
                                color: esPropio ? C.steel : esNo ? C.slate : C.cyan }}>
                              {MODOS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                            </select>
                          : <Pill tone={esPropio ? "steel" : esNo ? "slate" : "cyan"}>{esPropio ? "Propio" : esNo ? "No aplica" : "Hereda"}</Pill>}
                      </td>
                      {/* Horas */}
                      <td style={{ ...tdStyle, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: esNo ? C.line : C.steel }}>
                        {esNo ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: C.slate, fontWeight: 500, fontFamily: "inherit" }}><Ban size={12} /> No aplica</span>
                          : horas != null ? `${num(horas)} h` : "—"}
                      </td>
                      {/* Última lectura / herencia */}
                      <td style={tdStyle}>
                        {esPropio ? (
                          <>
                            <Pill tone={tone}>{label}</Pill>
                            {ultima && <span style={{ marginLeft: 8, fontSize: 11, color: C.slate }}>{new Date(ultima.fecha).toLocaleDateString("es-CL")} · {ultima.usuario_nombre || "—"}</span>}
                          </>
                        ) : esNo ? <span style={{ color: C.line }}>—</span>
                          : <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, color: C.cyan }}><CornerDownRight size={12} /> de {punto?.sistema || "—"}</span>}
                      </td>
                      {/* Tendencia */}
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        {hxd != null ? <span style={{ fontWeight: 700, color: C.cyan, fontFamily: "'IBM Plex Mono', monospace" }}>{num(hxd, 1)} h/día</span> : <span style={{ color: C.line }}>—</span>}
                      </td>
                      {/* Consume aceite: solo aplica a las máquinas (punto propio) */}
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        {esPropio ? (
                          <label title="Reparte el aceite consumido entre los motores (Consumos & Eficiencia)" style={{ display: "inline-flex", alignItems: "center", gap: 5, cursor: puedeOperar ? "pointer" : "default", color: eq.consume_aceite ? C.gold : C.slate, fontSize: 11.5, fontWeight: 600 }}>
                            <input type="checkbox" checked={!!eq.consume_aceite} disabled={!puedeOperar}
                              onChange={() => toggleConsumeAceite(eq)}
                              style={{ width: 15, height: 15, accentColor: C.gold, cursor: puedeOperar ? "pointer" : "default" }} />
                            <Droplet size={13} />
                          </label>
                        ) : <span style={{ color: C.line }}>—</span>}
                      </td>
                      {/* Nueva lectura: solo en puntos propios */}
                      {puedeOperar && (
                        <td style={{ ...tdStyle, textAlign: "right" }}>
                          {esPropio ? (
                            <input type="number" min={eq.horas_actual || 0} placeholder={`≥ ${num(eq.horas_actual || 0)}`}
                              value={valores[eq.id] ?? ""}
                              onChange={(ev) => setValores((p) => ({ ...p, [eq.id]: ev.target.value }))}
                              onKeyDown={(ev) => { if (ev.key === "Enter") guardarLecturas(); }}
                              style={{ ...inputStyle(120), textAlign: "right", borderColor: (valores[eq.id] ?? "") !== "" ? C.steel : undefined }} />
                          ) : <span style={{ color: C.line }}>—</span>}
                        </td>
                      )}
                      {/* Historial */}
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        {esPropio && (
                          <button onClick={() => setHistAbierto(abierto ? null : eq.id)} disabled={!lecs.length}
                            title={lecs.length ? `${lecs.length} lectura(s)` : "Sin lecturas"}
                            style={{ background: abierto ? C.steel : "none", border: `1px solid ${abierto ? C.steel : C.line}`, borderRadius: 6, cursor: lecs.length ? "pointer" : "default", color: abierto ? "#fff" : (lecs.length ? C.steel : C.line), padding: "3px 8px", display: "inline-flex", alignItems: "center", gap: 4 }}>
                            <History size={13} /> {lecs.length || ""}
                          </button>
                        )}
                      </td>
                    </tr>,
                    abierto && (
                      <tr key={eq.id + "-h"}>
                        <td colSpan={puedeOperar ? 8 : 7} style={{ padding: "10px 18px 14px", background: tint(C.steel, 6), borderBottom: `1px solid ${C.line}` }}>
                          <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead><tr>
                              {["Fecha", "Horas", "Δ desde anterior", "Registrada por", "Nota"].map((h) => (
                                <th key={h} style={{ textAlign: "left", padding: "4px 10px", fontSize: 10.5, textTransform: "uppercase", color: C.slate, letterSpacing: 0.4 }}>{h}</th>
                              ))}
                            </tr></thead>
                            <tbody>
                              {lecs.slice(0, 12).map((l) => (
                                <tr key={l.id}>
                                  <td style={{ padding: "4px 10px", fontSize: 12 }}>{new Date(l.fecha).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" })}</td>
                                  <td style={{ padding: "4px 10px", fontSize: 12, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700 }}>{num(l.horas)} h</td>
                                  <td style={{ padding: "4px 10px", fontSize: 12, color: C.cyan, fontFamily: "'IBM Plex Mono', monospace" }}>{l.horas_anterior != null ? `+${num(Number(l.horas) - Number(l.horas_anterior))} h` : "—"}</td>
                                  <td style={{ padding: "4px 10px", fontSize: 12 }}>{l.usuario_nombre || "—"}</td>
                                  <td style={{ padding: "4px 10px", fontSize: 12, color: C.slate }}>{l.nota || ""}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    ),
                  ]);
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <GuiaColapsable titulo="¿Cómo funciona la herencia de horómetro?" icon={Timer}>
        <ul style={{ margin: 0, paddingLeft: 18, color: C.slate }}>
          <li><strong>Propio</strong>: la máquina con horómetro real (Motor Principal, Generador). Aquí ingresas la lectura.</li>
          <li><strong>Hereda</strong>: los componentes del equipo usan las horas de su máquina. Ingresas una vez y se propaga a todo el subárbol — no registras horas pieza por pieza.</li>
          <li><strong>No aplica</strong>: sistemas donde el horómetro no tiene sentido (mamparos, casco, estructura). Quedan fuera del registro.</li>
          <li>Los <strong>filtros y consumibles</strong> también heredan las horas del motor; cambian más seguido porque su plan PM reinicia su contador al cambiarlos (no porque tengan otro horómetro).</li>
          <li>El sistema <strong>rechaza lecturas decrecientes</strong> y advierte saltos imposibles (&gt;24 h/día). Registra al menos una lectura semanal por máquina.</li>
        </ul>
      </GuiaColapsable>
    </div>
  );
}
