import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Timer, Save, ChevronDown, ChevronRight, History, AlertCircle, CheckCircle2, CornerDownRight, ShieldCheck } from "lucide-react";
import { useAuth } from "../lib/auth";
import { fetchAll, insertRow, logActivity, rpcCall } from "../lib/db";
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

export default function Horometros() {
  const { profile } = useAuth();
  const [embarcaciones, setEmbarcaciones] = useState([]);
  const [equipos, setEquipos]   = useState([]);
  const [lecturas, setLecturas] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [okMsg, setOkMsg]       = useState(null);
  const [filtro, setFiltro]   = useState("all");
  const [valores, setValores] = useState({});      // puntoId → texto ingresado
  const [fechas, setFechas] = useState({});         // puntoId → fecha de lectura (YYYY-MM-DD)
  const [histAbierto, setHistAbierto] = useState(null);
  const [guardando, setGuardando]     = useState(false);
  const [ultimoLog,    setUltimoLog]    = useState(null);
  const [auditViols,   setAuditViols]   = useState(null);   // null = no verificado; [] = sin viols; [...] = viols
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditAbierto, setAuditAbierto] = useState(false);
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

  // Carga el último chequeo automático (cron) para mostrar en el panel supervisor.
  const cargarUltimoLog = useCallback(async () => {
    try {
      const rows = await fetchAll("horometro_health_log", {
        order: { col: "chequeado_en", asc: false }, limit: 1,
      });
      setUltimoLog(rows[0] ?? null);
    } catch { /* tabla puede no existir en instancias sin migración → silencio */ }
  }, []);
  useEffect(() => { cargarUltimoLog(); }, [cargarUltimoLog]);

  const byId = useMemo(() => new Map(equipos.map((e) => [e.id, e])), [equipos]);
  const lecturasDe = useCallback((id) => lecturas.filter((l) => l.equipo_id === id), [lecturas]);

  const equiposNave = useMemo(
    () => (filtro === "all" ? equipos : equipos.filter((e) => e.embarcacion_id === filtro)),
    [equipos, filtro]);

  // Solo equipos con horómetro configurado (propio o hereda con ascendiente propio).
  // La configuración se hace en Equipos → botón ⚙ Config. operacional.
  const lista = useMemo(() => {
    return buildEquipoTree(equiposNave.filter((e) => puntoHorometro(e, byId) !== null));
  }, [equiposNave, byId]);

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

  // Guarda lecturas pendientes. La propagación de horas_actual al subárbol la
  // hace el trigger trg_propagar_horas en la DB (atómico, cualquier fuente).
  // Aquí solo actualizamos estado local para UX inmediata.
  async function guardarLecturas() {
    if (!pendientes.length) return;
    setGuardando(true); setError(null); setOkMsg(null);
    const guardadas = [];
    try {
      for (const [puntoId, valor] of pendientes) {
        const eq = byId.get(puntoId);
        if (!eq) continue;

        const horas = Number(valor);
        const fechaLec = fechas[puntoId] ? new Date(fechas[puntoId] + "T12:00:00") : new Date();
        const todasLecs = lecturasDe(puntoId);
        const ultimaFecha = todasLecs[0]?.fecha ? new Date(todasLecs[0].fecha) : null;
        const esRetroactiva = ultimaFecha !== null && fechaLec < ultimaFecha;
        const lecPrev = esRetroactiva
          ? (todasLecs.find((l) => new Date(l.fecha) <= fechaLec) ?? null)
          : (todasLecs[0] ?? null);
        const v = validarLectura({
          horasPrev: lecPrev ? Number(lecPrev.horas) : (eq.horas_actual ?? null),
          fechaPrev: lecPrev?.fecha ?? null,
          horas,
        });
        if (!v.ok) { setError(`${eq.id_visible}: ${v.error}`); continue; }
        if (v.warning && !window.confirm(`${eq.id_visible} · ${eq.sistema}\n\n${v.warning}\n\n¿Guardar de todas formas?`)) continue;

        const row = await insertRow("lecturas_horometro", profile.empresa_id, {
          equipo_id: puntoId, horas,
          horas_anterior: lecPrev ? Number(lecPrev.horas) : (eq.horas_actual ?? null),
          fuente: "manual", usuario_id: profile.id, usuario_nombre: profile.nombre || "",
          fecha: fechaLec.toISOString(),
        });

        // Optimistic update local: el trigger de DB ya propagó en la transacción.
        const ids = idsBajoPunto(puntoId, equipos, byId);
        if (!esRetroactiva) {
          setEquipos((p) => p.map((x) => ids.includes(x.id) ? { ...x, horas_actual: horas } : x));
        }

        setLecturas((p) => [row, ...p]);
        setValores((p) => { const n = { ...p }; delete n[puntoId]; return n; });
        setFechas((p) => { const n = { ...p }; delete n[puntoId]; return n; });
        guardadas.push(esRetroactiva
          ? `${eq.id_visible} (historial ${fechas[puntoId]})`
          : `${eq.id_visible} (+${ids.length - 1} comp.)`);
      }
      if (guardadas.length) {
        setOkMsg(`${guardadas.length} lectura(s) guardada(s) y propagada(s): ${guardadas.join(", ")}`);
        logActivity(profile, "Registrar lecturas de horómetro", guardadas.join(", "));
      }
    } catch (e) { setError("No se pudo guardar: " + e.message); }
    finally { setGuardando(false); }
  }

  async function verificarAhora() {
    setAuditLoading(true);
    try {
      const viols = await rpcCall("fn_audit_horometro", { p_empresa_id: profile.empresa_id });
      setAuditViols(viols);
      setAuditAbierto(true);
    } catch (e) { setError("Auditoría de horómetro: " + e.message); }
    finally { setAuditLoading(false); }
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

      {/* ── Supervisor de integridad del horómetro ─────────────────────── */}
      {(() => {
        // Fuente de verdad: live check toma precedencia sobre el log del cron.
        const tieneVivo  = auditViols !== null;
        const nViols     = tieneVivo ? auditViols.length : (ultimoLog?.n_violaciones ?? null);
        const sev        = nViols === null ? null : nViols === 0 ? "ok" : nViols <= 2 ? "aviso" : "critico";
        const sevColor   = { ok: C.green, aviso: C.yellow, critico: C.red }[sev] ?? C.steel;
        const sevLabel   = { ok: "Sin violaciones", aviso: `${nViols} aviso(s)`, critico: `${nViols} violación(es) crítica(s)` }[sev];
        const fechaStr   = tieneVivo ? "ahora"
          : ultimoLog ? new Date(ultimoLog.chequeado_en).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" }) : null;
        const TIPO_META  = {
          horas_desincronizadas: { label: "Desincronización", tone: "red" },
          pm_silenciado:          { label: "PM silenciado",    tone: "yellow" },
          fuente_huerfana:        { label: "Fuente huérfana",  tone: "red" },
        };
        return (
          <Card style={{ marginBottom: 16, padding: "12px 18px",
            border: sev && sev !== "ok" ? `1px solid ${tint(sevColor, 40)}` : `1px solid ${C.foam}` }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <ShieldCheck size={16} color={sev ? sevColor : C.steel} />
                <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>Supervisor de Horómetro</span>
                {sev && <Pill tone={sev === "ok" ? "green" : sev === "aviso" ? "yellow" : "red"}>{sevLabel}</Pill>}
                {fechaStr && <span style={{ fontSize: 11, color: C.slate }}>· {fechaStr}</span>}
                {!fechaStr && <span style={{ fontSize: 11.5, color: C.slate }}>Sin historial de chequeos automáticos</span>}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {auditAbierto && (
                  <button onClick={() => { setAuditAbierto(false); setAuditViols(null); }}
                    style={{ padding: "6px 13px", borderRadius: 8, border: `1px solid ${C.line}`, background: C.surface,
                      color: C.steel, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                    Cerrar
                  </button>
                )}
                <button onClick={verificarAhora} disabled={auditLoading}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 13px", borderRadius: 8,
                    border: `1px solid ${tint(C.cyan, 40)}`, background: tint(C.cyan, 7), color: C.cyan,
                    fontSize: 12, fontWeight: 600, cursor: auditLoading ? "default" : "pointer",
                    fontFamily: "inherit", opacity: auditLoading ? 0.6 : 1 }}>
                  <ShieldCheck size={13} />{auditLoading ? "Verificando…" : "Verificar ahora"}
                </button>
              </div>
            </div>

            {auditAbierto && auditViols !== null && (
              <div style={{ marginTop: 12, borderTop: `1px solid ${C.foam}`, paddingTop: 10 }}>
                {auditViols.length === 0 ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.green }}>
                    <CheckCircle2 size={15} />
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Todo correcto — el flujo de horas no presenta violaciones.</span>
                  </div>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead><tr>
                      {["Tipo", "Equipo", "Actual", "Esperadas", "Detalle"].map((h) => (
                        <th key={h} style={{ textAlign: "left", padding: "4px 10px", fontSize: 10.5,
                          textTransform: "uppercase", color: C.slate, letterSpacing: 0.4 }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {auditViols.map((v, i) => {
                        const m = TIPO_META[v.tipo_violacion] ?? { label: v.tipo_violacion, tone: "slate" };
                        return (
                          <tr key={i} style={{ borderTop: `1px solid ${C.foam}` }}>
                            <td style={{ padding: "6px 10px" }}><Pill tone={m.tone}>{m.label}</Pill></td>
                            <td style={{ padding: "6px 10px", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: C.steel }}>{v.id_visible}</td>
                            <td style={{ padding: "6px 10px", fontFamily: "'IBM Plex Mono', monospace" }}>{v.horas_actual != null ? `${v.horas_actual} h` : "—"}</td>
                            <td style={{ padding: "6px 10px", fontFamily: "'IBM Plex Mono', monospace" }}>{v.horas_esperadas != null ? `${v.horas_esperadas} h` : "—"}</td>
                            <td style={{ padding: "6px 10px", color: C.slate, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                              title={v.detalle}>{v.detalle}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </Card>
        );
      })()}

      {/* Filtros + vista */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <FilterBtn active={filtro === "all"} onClick={() => setFiltro("all")}>Todas</FilterBtn>
        {embarcaciones.map((v) => (
          <FilterBtn key={v.id} active={filtro === v.id} onClick={() => setFiltro(v.id)} color={v.color}>{v.nombre}</FilterBtn>
        ))}
      </div>

      <BotonesColapsar conHijos={arbol.conHijos} colapsarTodo={arbol.colapsarTodo} />

      {listaVisible.length === 0 ? (
        <Card><Empty>
          <Timer size={30} color={C.line} style={{ marginBottom: 10 }} /><br />
          Sin equipos con horómetro para este filtro. Ve a <strong>Equipos</strong> → botón <strong>⚙</strong> por equipo y asigna <em>Punto propio</em> a los motores y generadores.
        </Empty></Card>
      ) : (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
              <thead><tr>
                <th style={thStyle}>Sistema / Equipo</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Horas</th>
                <th style={thStyle}>Última lectura</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Tendencia</th>
                {puedeOperar && <th style={{ ...thStyle, textAlign: "right" }}>Nueva lectura</th>}
                <th style={{ ...thStyle, textAlign: "center" }}>Hist.</th>
              </tr></thead>
              <tbody>
                {listaVisible.map((eq) => {
                  const modo = modoHorometro(eq);
                  const puntoId = puntoHorometro(eq, byId);
                  const esPropio = modo === "propio";
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
                    <tr key={eq.id} style={{ background: fondoTipo(eq) }}>
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
                      {/* Horas */}
                      <td style={{ ...tdStyle, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: C.steel }}>
                        {horas != null ? `${num(horas)} h` : "—"}
                      </td>
                      {/* Última lectura / herencia */}
                      <td style={tdStyle}>
                        {esPropio ? (
                          <>
                            <Pill tone={tone}>{label}</Pill>
                            {ultima && <span style={{ marginLeft: 8, fontSize: 11, color: C.slate }}>{new Date(ultima.fecha).toLocaleDateString("es-CL")} · {ultima.usuario_nombre || "—"}</span>}
                          </>
                        ) : <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, color: C.cyan }}><CornerDownRight size={12} /> de {punto?.sistema || "—"}</span>}
                      </td>
                      {/* Tendencia */}
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        {hxd != null ? <span style={{ fontWeight: 700, color: C.cyan, fontFamily: "'IBM Plex Mono', monospace" }}>{num(hxd, 1)} h/día</span> : <span style={{ color: C.line }}>—</span>}
                      </td>
                      {/* Nueva lectura: solo en puntos propios */}
                      {puedeOperar && (
                        <td style={{ ...tdStyle, textAlign: "right" }}>
                          {esPropio ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                              <input type="date" max={new Date().toLocaleDateString("en-CA")}
                                value={fechas[eq.id] ?? new Date().toLocaleDateString("en-CA")}
                                onChange={(ev) => setFechas((p) => ({ ...p, [eq.id]: ev.target.value }))}
                                style={{ ...inputStyle(130), fontSize: 11.5 }} />
                              <input type="number" min={eq.horas_actual || 0} placeholder={`≥ ${num(eq.horas_actual || 0)}`}
                                value={valores[eq.id] ?? ""}
                                onChange={(ev) => setValores((p) => ({ ...p, [eq.id]: ev.target.value }))}
                                onKeyDown={(ev) => { if (ev.key === "Enter") guardarLecturas(); }}
                                style={{ ...inputStyle(130), textAlign: "right", borderColor: (valores[eq.id] ?? "") !== "" ? C.steel : undefined }} />
                            </div>
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
                        <td colSpan={puedeOperar ? 6 : 5} style={{ padding: "10px 18px 14px", background: tint(C.steel, 6), borderBottom: `1px solid ${C.line}` }}>
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
          <li><strong>Configurar equipos</strong>: ve a <strong>Equipos</strong> → botón <strong>⚙ Config. operacional</strong> por fila. Ahí defines Propio / Hereda / No aplica, si consume aceite y los niveles de prezarpe.</li>
          <li><strong>Propio</strong>: máquina con horómetro real (Motor Principal, Generador). Aquí ingresas las lecturas periódicas.</li>
          <li><strong>Hereda</strong>: filtros, enfriadores y demás componentes usan las horas de su motor ascendiente. Ingresas la lectura una vez y se propaga a todo el subárbol.</li>
          <li><strong>No aplica</strong>: mamparos, casco, estructura — sin registro de horas; no aparecen en esta vista.</li>
          <li>El sistema <strong>rechaza lecturas decrecientes</strong> y advierte saltos imposibles (&gt;24 h/día). Registra al menos una lectura semanal por máquina.</li>
        </ul>
      </GuiaColapsable>
    </div>
  );
}
