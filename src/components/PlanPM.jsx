import React, { useEffect, useState, useCallback, useMemo } from "react";
import { CalendarClock, Check, AlertCircle, Plus, Trash2, Download, History, ClipboardList, X, ChevronDown, ChevronRight } from "lucide-react";
import { useAuth } from "../lib/auth";
import { fetchAll, insertRow, updateRow, deleteRow, logActivity } from "../lib/db";
import { buildEquipoTree } from "../lib/equipTree";
import { useArbolColapsable, BotonesColapsar, colorTipo, fondoTipo } from "../lib/arbolColapsable";
import { C, archivo, num, canOperate, isAdmin, tint } from "../theme";
import {
  Card, PageHead, Pill, FilterBtn, primaryBtn, ghostBtn, exportBtn,
  inputStyle, bluInput, thStyle, tdStyle, Field, Empty, ErrorBanner, InlineSpinner, GuiaColapsable,
} from "../ui";

const HOY = () => new Date().toISOString().slice(0, 10);
const INTERVALOS_COMUNES = [50, 100, 250, 500, 1000, 2000, 4000];

// ── Semáforo por plan ──────────────────────────────────────────
function statusPlan(elapsed, intervalo) {
  if (elapsed >= intervalo)          return ["red",    "Vencido"];
  if (elapsed >= intervalo * 0.9)    return ["yellow", "Próximo"];
  return                                    ["green",  "OK"];
}

// ── Barra de progreso por plan ─────────────────────────────────
function PMBar({ elapsed, intervalo }) {
  const pct   = Math.min(100, intervalo > 0 ? (elapsed / intervalo) * 100 : 0);
  const [tone] = statusPlan(elapsed, intervalo);
  const color  = tone === "red" ? C.red : tone === "yellow" ? C.amber : C.green;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 220 }}>
      <div style={{ flex: 1, height: 7, background: tint(C.slate, 14), borderRadius: 4, position: "relative" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 4, transition: "width .3s" }} />
        <div title="90% del intervalo" style={{ position: "absolute", top: -2, left: "90%", width: 2, height: 11, background: C.slate, opacity: 0.35, borderRadius: 1 }} />
      </div>
      <span style={{ fontSize: 11.5, color, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", minWidth: 90, textAlign: "right" }}>
        {num(elapsed, 0)}h / {intervalo}h
      </span>
    </div>
  );
}

export default function PlanPM({ onNavigate }) {
  const { profile } = useAuth();
  const [embarcaciones, setEmbarcaciones] = useState([]);
  const [equipos,    setEquipos]    = useState([]);
  const [planes,     setPlanes]     = useState([]);
  const [historial,  setHistorial]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [filtro,     setFiltro]     = useState("all");
  const [tab,        setTab]        = useState("plan"); // "plan" | "historial"
  const puedeOperar = canOperate(profile?.rol);
  const puedeBorrar = isAdmin(profile?.rol);

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [embs, eqs, pls, hist] = await Promise.all([
        fetchAll("embarcaciones",  { order: { col: "codigo",      asc: true  } }),
        fetchAll("equipos",        { order: { col: "id_visible",  asc: true  } }),
        fetchAll("planes_pm",      { order: { col: "intervalo_horas", asc: true } }),
        fetchAll("historial_pm",   { order: { col: "created_at",  asc: false } }),
      ]);
      setEmbarcaciones(embs); setEquipos(eqs); setPlanes(pls); setHistorial(hist);
    } catch (e) { setError("No se pudo cargar el plan PM. " + e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const embName = (id) => embarcaciones.find((e) => e.id === id)?.nombre || "—";
  const lista   = buildEquipoTree(filtro === "all" ? equipos : equipos.filter((e) => e.embarcacion_id === filtro));

  // KPIs globales
  const kpis = useMemo(() => {
    let total = 0, vencidos = 0, proximos = 0;
    planes.filter((p) => p.activo).forEach((p) => {
      const eq = equipos.find((e) => e.id === p.equipo_id);
      if (!eq) return;
      const elapsed = (eq.horas_actual || 0) - (p.horas_ult_pm || 0);
      const [tone]  = statusPlan(elapsed, p.intervalo_horas);
      total++;
      if (tone === "red")    vencidos++;
      if (tone === "yellow") proximos++;
    });
    return { total, vencidos, proximos, ok: total - vencidos - proximos };
  }, [planes, equipos]);

  if (loading) return <div><PageHead kicker="Mantenimiento Preventivo" title="Plan Preventivo" /><Card><InlineSpinner label="Cargando plan preventivo…" /></Card></div>;

  return (
    <div>
      <PageHead kicker="Mantenimiento Preventivo · ISO 14224" title="Plan Preventivo"
        sub="Plan por equipo: cada tarea con su propio intervalo e historial. Al registrar PM se genera trazabilidad completa." />
      <ErrorBanner onRetry={cargar}>{error}</ErrorBanner>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 18, alignItems: "center", flexWrap: "wrap" }}>
        {[[" plan", CalendarClock, "Plan de Mantenimiento"], ["historial", History, "Historial de PM"]].map(([id, Icon, lbl]) => (
          <button key={id} onClick={() => setTab(id.trim())}
            style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 15px", borderRadius: 9, border: `1px solid ${tab === id.trim() ? C.cyan : C.line}`, background: tab === id.trim() ? C.cyan : "#fff", color: tab === id.trim() ? "#fff" : C.slate, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            <Icon size={15} />{lbl}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        {embarcaciones.map((v) => (
          <FilterBtn key={v.id} active={filtro === v.id} onClick={() => setFiltro(filtro === v.id ? "all" : v.id)} color={v.color}>{v.nombre}</FilterBtn>
        ))}
        {filtro !== "all" && <FilterBtn active={false} onClick={() => setFiltro("all")}>Toda la flota</FilterBtn>}
      </div>

      {/* KPIs */}
      {tab === "plan" && kpis.total > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 18 }}>
          {[
            ["Planes activos",  kpis.total,    C.steel],
            ["Vencidos",        kpis.vencidos, C.red,   "requieren atención inmediata"],
            ["Próximos",        kpis.proximos, C.amber, "≥ 90% del intervalo"],
            ["Al día",          kpis.ok,       C.green],
          ].map(([lbl, val, tone, sub]) => (
            <Card key={lbl} style={{ padding: 14 }}>
              <div style={{ fontSize: 10.5, letterSpacing: 1.5, textTransform: "uppercase", color: C.slate, fontWeight: 700 }}>{lbl}</div>
              <div style={{ ...archivo, fontSize: 26, fontWeight: 800, color: tone, marginTop: 6 }}>{val}</div>
              {sub && <div style={{ fontSize: 11, color: C.slate, marginTop: 4 }}>{sub}</div>}
            </Card>
          ))}
        </div>
      )}

      {tab === "plan" && (
        <TabPlan
          lista={lista} equipos={equipos} setEquipos={setEquipos}
          planes={planes} setPlanes={setPlanes}
          historial={historial} setHistorial={setHistorial}
          embarcaciones={embarcaciones} embName={embName}
          profile={profile} puedeOperar={puedeOperar} puedeBorrar={puedeBorrar}
          setError={setError} onNavigate={onNavigate} />
      )}
      {tab === "historial" && (
        <TabHistorial historial={historial} planes={planes} equipos={equipos} embName={embName} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// TAB PLAN
// ─────────────────────────────────────────────────────────────────
function TabPlan({ lista, equipos, setEquipos, planes, setPlanes, historial, setHistorial, embarcaciones, embName, profile, puedeOperar, puedeBorrar, setError, onNavigate }) {
  const [addingFor,   setAddingFor]   = useState(null); // equipo_id
  const [newPlan,     setNewPlan]     = useState({ descripcion: "", intervalo_horas: 250 });
  const [registrando, setRegistrando] = useState(null); // plan_pm_id
  const [regForm,     setRegForm]     = useState({ realizado_por: "", notas: "", crearOT: false });
  // Colapso por nodo a cualquier nivel (helper compartido en todo el CMMS).
  const arbol = useArbolColapsable(lista);
  const listaVisible = lista.filter((eq) => arbol.visible(eq));

  if (lista.length === 0) return (
    <Card><Empty>
      <AlertCircle size={28} color={C.amber} style={{ marginBottom: 8 }} /><br />
      No hay equipos. Ve a <strong>Equipos</strong> y carga la maquinaria de tu flota.
    </Empty></Card>
  );

  async function agregarPlan(equipoId) {
    if (!newPlan.descripcion.trim()) return;
    const eq = equipos.find((e) => e.id === equipoId);
    try {
      const nuevo = await insertRow("planes_pm", profile.empresa_id, {
        equipo_id:       equipoId,
        descripcion:     newPlan.descripcion.trim(),
        intervalo_horas: +newPlan.intervalo_horas,
        activo:          true,
        horas_ult_pm:    0,
      });
      setPlanes((p) => [...p, nuevo]);
      logActivity(profile, "Crear plan PM", `${eq?.sistema} · cada ${nuevo.intervalo_horas}h`);
      setNewPlan({ descripcion: "", intervalo_horas: 250 });
      setAddingFor(null);
    } catch (e) { setError("No se pudo crear el plan: " + e.message); }
  }

  async function eliminarPlan(planId) {
    const plan = planes.find((p) => p.id === planId);
    if (!window.confirm(`¿Eliminar el plan "${plan?.descripcion}"? Se borrará también su historial.`)) return;
    setPlanes((p) => p.filter((x) => x.id !== planId));
    try { await deleteRow("planes_pm", planId); }
    catch (e) { setPlanes((p) => [...p, plan]); setError("No se pudo eliminar: " + e.message); }
  }

  async function registrarPM(plan) {
    const eq      = equipos.find((e) => e.id === plan.equipo_id);
    const horas   = eq?.horas_actual || 0;
    const fecha   = HOY();
    const elapsed = horas - (plan.horas_ult_pm || 0);
    let otId = null;

    try {
      // 1) Generar OT si se pidió
      if (regForm.crearOT && eq) {
        const [tone] = statusPlan(elapsed, plan.intervalo_horas);
        const prio = tone === "red" ? "alta" : tone === "yellow" ? "media" : "baja";
        const folio = `PM-${Date.now().toString().slice(-6)}`;
        const ot = await insertRow("ordenes_trabajo", profile.empresa_id, {
          folio, embarcacion_id: eq.embarcacion_id, equipo_id: eq.id,
          sistema: eq.sistema, tipo: "preventivo",
          descripcion: `PM ${plan.intervalo_horas}h · ${plan.descripcion}`,
          prioridad: prio, fecha, estado: "abierta", created_by: profile.id,
        });
        otId = ot.id;
      }
      // 2) Actualizar contador del plan
      await updateRow("planes_pm", plan.id, { horas_ult_pm: horas, fecha_ult_pm: fecha });
      setPlanes((p) => p.map((x) => x.id === plan.id ? { ...x, horas_ult_pm: horas, fecha_ult_pm: fecha } : x));
      // 3) Actualizar horas_ult_pm del equipo (resumen global)
      if (eq) {
        await updateRow("equipos", eq.id, { horas_ult_pm: horas, fecha_ult_pm: fecha });
        setEquipos((p) => p.map((e) => e.id === eq.id ? { ...e, horas_ult_pm: horas, fecha_ult_pm: fecha } : e));
      }
      // 4) Registrar en historial
      const registro = await insertRow("historial_pm", profile.empresa_id, {
        plan_pm_id: plan.id, equipo_id: plan.equipo_id,
        horas_realizacion: horas, fecha_realizacion: fecha,
        realizado_por: regForm.realizado_por.trim() || profile.nombre || "",
        notas: regForm.notas.trim() || null,
        ot_id: otId, created_by: profile.id,
      });
      setHistorial((p) => [registro, ...p]);
      logActivity(profile, "Registrar PM", `${eq?.sistema} · ${plan.descripcion} · ${num(horas)}h`);
      setRegistrando(null);
      setRegForm({ realizado_por: "", notas: "", crearOT: false });
      // 5) Navegar a la OT si se creó
      if (otId && regForm.crearOT) onNavigate?.("ots", { otId });
    } catch (e) { setError("No se pudo registrar el PM: " + e.message); }
  }

  return (
    <div>
      <BotonesColapsar conHijos={arbol.conHijos} colapsarTodo={arbol.colapsarTodo} />
      {listaVisible.map((eq) => {
        const planesEq = planes.filter((p) => p.equipo_id === eq.id && p.activo);
        const vencidosEq = planesEq.filter((p) => {
          const elapsed = (eq.horas_actual || 0) - (p.horas_ult_pm || 0);
          return statusPlan(elapsed, p.intervalo_horas)[0] === "red";
        }).length;
        const tieneHijos = arbol.tieneHijos(eq);
        const colapsado = arbol.estaColapsado(eq);
        const nSub = arbol.nSubDe(eq);

        return (
          <Card key={eq.id} style={{ marginBottom: 10, borderLeft: `4px solid ${vencidosEq > 0 ? C.red : colorTipo(eq)}`, background: fondoTipo(eq), paddingBottom: 8 }}>
            {/* ── Cabecera del equipo ── */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: planesEq.length > 0 ? 12 : 4, paddingLeft: eq.depth * 16 }}>
              {tieneHijos ? (
                <button onClick={() => arbol.toggle(eq.id)} title={colapsado ? "Expandir" : "Colapsar"}
                  style={{ background: "none", border: "none", cursor: "pointer", color: C.steel, padding: 0, display: "flex", alignItems: "center" }}>
                  {colapsado ? <ChevronRight size={17} /> : <ChevronDown size={17} />}
                </button>
              ) : eq.depth > 0 ? <span style={{ color: C.slate, fontSize: 13 }}>└─</span> : <span style={{ width: 17 }} />}
              <div style={{ flex: 1 }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: C.abyss }}>{eq.sistema}</span>
                {eq.criticidad && <span style={{ marginLeft: 7 }}><Pill tone={{ A: "red", B: "yellow", C: "green" }[eq.criticidad]}>{eq.criticidad}</Pill></span>}
                <span style={{ fontSize: 11.5, color: C.slate, marginLeft: 8, fontFamily: "'IBM Plex Mono', monospace" }}>{eq.id_visible}</span>
                <span style={{ fontSize: 11.5, color: C.slate, marginLeft: 6 }}>· {embName(eq.embarcacion_id)}</span>
                {colapsado && nSub > 0 && <span style={{ fontSize: 11.5, color: C.steel, marginLeft: 8, fontWeight: 600 }} title={`${nSub} elemento(s) ocultos`}>▸ {nSub}</span>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: C.slate }}>
                {num(eq.horas_actual || 0, 0)}h actuales
              </div>
              {vencidosEq > 0 && <Pill tone="red">{vencidosEq} vencido{vencidosEq > 1 && "s"}</Pill>}
              {puedeOperar && (
                <button onClick={() => setAddingFor(addingFor === eq.id ? null : eq.id)}
                  style={{ ...ghostBtn, padding: "4px 10px", fontSize: 12 }}>
                  <Plus size={13} /> Plan
                </button>
              )}
            </div>

            {/* ── Planes del equipo ── */}
            {planesEq.length === 0 && addingFor !== eq.id && (
              <div style={{ fontSize: 12.5, color: C.slate, paddingLeft: eq.depth * 16 + 8, fontStyle: "italic" }}>
                Sin planes de PM — agrega el primero con el botón "+ Plan"
              </div>
            )}

            {planesEq.map((plan) => {
              const elapsed = (eq.horas_actual || 0) - (plan.horas_ult_pm || 0);
              const [tone, label] = statusPlan(elapsed, plan.intervalo_horas);
              const isReg = registrando === plan.id;

              return (
                <div key={plan.id} style={{ marginLeft: eq.depth * 16 + 8, marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8, background: tone === "red" ? tint(C.red, 8) : tone === "yellow" ? tint(C.amber, 10) : tint(C.steel, 6), border: `1px solid ${tone === "red" ? C.red + "30" : tone === "yellow" ? C.amber + "30" : C.line}` }}>
                    <Pill tone={tone}>{label}</Pill>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.abyss }}>{plan.descripcion}</div>
                      <div style={{ fontSize: 11, color: C.slate, marginTop: 1 }}>
                        Cada <strong>{plan.intervalo_horas}h</strong>
                        {plan.fecha_ult_pm && <span> · Último: {new Date(plan.fecha_ult_pm + "T00:00:00").toLocaleDateString("es-CL")}</span>}
                        {!plan.fecha_ult_pm && <span style={{ color: C.amber }}> · Nunca realizado</span>}
                      </div>
                    </div>
                    <div style={{ minWidth: 240 }}>
                      <PMBar elapsed={elapsed} intervalo={plan.intervalo_horas} />
                    </div>
                    {puedeOperar && (
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        <button onClick={() => { setRegistrando(isReg ? null : plan.id); setRegForm({ realizado_por: profile.nombre || "", notas: "", crearOT: false }); }}
                          title="Registrar PM realizado"
                          style={{ ...primaryBtn, padding: "5px 10px", fontSize: 12, background: isReg ? C.slate : C.green, borderColor: isReg ? C.slate : C.green }}>
                          <Check size={13} /> {isReg ? "Cancelar" : "Registrar PM"}
                        </button>
                        {tone === "red" && !regForm.crearOT && (
                          <button onClick={() => { setRegistrando(plan.id); setRegForm({ realizado_por: profile.nombre || "", notas: "", crearOT: true }); }}
                            title="Crear OT y registrar PM"
                            style={{ ...ghostBtn, padding: "5px 10px", fontSize: 12, borderColor: C.red, color: C.red }}>
                            <ClipboardList size={13} /> Crear OT
                          </button>
                        )}
                        {puedeBorrar && (
                          <button onClick={() => eliminarPlan(plan.id)} style={{ background: "none", border: "none", cursor: "pointer", color: C.slate, padding: 4 }}>
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* ── Formulario de registro ── */}
                  {isReg && (
                    <div style={{ margin: "6px 0 4px 12px", padding: "12px 14px", background: tint(C.green, 9), border: `1px solid ${C.green}40`, borderRadius: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.abyss, marginBottom: 10 }}>
                        Registrar PM: <em style={{ fontWeight: 400 }}>{plan.descripcion}</em> a las {num(eq.horas_actual || 0, 0)}h
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr auto", gap: 10, alignItems: "flex-end" }}>
                        <Field label="Realizado por">
                          <input value={regForm.realizado_por}
                            onChange={(e) => setRegForm((p) => ({ ...p, realizado_por: e.target.value }))}
                            style={inputStyle()} />
                        </Field>
                        <Field label="Notas (opcional)">
                          <input value={regForm.notas}
                            onChange={(e) => setRegForm((p) => ({ ...p, notas: e.target.value }))}
                            placeholder="Qué se revisó, observaciones…"
                            style={inputStyle()} />
                        </Field>
                        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, cursor: "pointer", marginBottom: 2, whiteSpace: "nowrap" }}>
                          <input type="checkbox" checked={regForm.crearOT}
                            onChange={(e) => setRegForm((p) => ({ ...p, crearOT: e.target.checked }))}
                            style={{ width: 15, height: 15, accentColor: C.steel }} />
                          Crear OT de cierre
                        </label>
                      </div>
                      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                        <button onClick={() => registrarPM(plan)} style={primaryBtn}>
                          <Check size={14} /> Confirmar PM{regForm.crearOT ? " + OT" : ""}
                        </button>
                        <button onClick={() => setRegistrando(null)} style={ghostBtn}><X size={13} /> Cancelar</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* ── Formulario nuevo plan ── */}
            {addingFor === eq.id && (
              <div style={{ marginLeft: eq.depth * 16 + 8, marginTop: 8, padding: "12px 14px", background: C.mist, borderRadius: 8, border: `1px solid ${C.line}` }}>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr auto auto", gap: 10, alignItems: "flex-end" }}>
                  <Field label="Tarea de mantenimiento">
                    <input value={newPlan.descripcion} list="intervalos-sugeridos"
                      onChange={(e) => setNewPlan((p) => ({ ...p, descripcion: e.target.value }))}
                      placeholder="Cambio aceite + filtro, Revisión válvulas…"
                      style={inputStyle()} autoFocus />
                  </Field>
                  <Field label="Intervalo (horas)">
                    <input type="number" value={newPlan.intervalo_horas} list="intervalosnums"
                      onChange={(e) => setNewPlan((p) => ({ ...p, intervalo_horas: +e.target.value }))}
                      style={{ ...bluInput, width: "100%" }} />
                    <datalist id="intervalosnums">{INTERVALOS_COMUNES.map((v) => <option key={v} value={v} />)}</datalist>
                  </Field>
                  <button onClick={() => agregarPlan(eq.id)} style={{ ...primaryBtn, marginTop: 22 }}>Guardar</button>
                  <button onClick={() => setAddingFor(null)} style={{ ...ghostBtn, marginTop: 22 }}><X size={13} /></button>
                </div>
                <datalist id="intervalos-sugeridos">
                  {["Cambio aceite + filtro", "Revisión válvulas", "Revisión general motor", "Limpieza radiador", "Revisión bomba hidráulica", "Cambio correas", "Revisión sistema eléctrico", "Inspección casco y ánodos", "Revisión bomba agua mar", "Revisión turbocompresor"].map((s) => <option key={s} value={s} />)}
                </datalist>
                <GuiaColapsable titulo="¿Cómo elegir el intervalo?" icon={CalendarClock}>
                  <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 8 }}>
                    <tbody>
                      {[
                        ["250 h", "Sistemas críticos de uso intenso: hidráulico de pesca, generador, inyección"],
                        ["500 h", "Motor principal: cambio de aceite y filtros, revisión general"],
                        ["1000 h", "Análisis de aceite, limpieza de radiador/intercambiador, válvulas"],
                        ["2000 h", "Revisión mayor: turbo, bombas, mangueras de alta presión"],
                      ].map(([h, d]) => (
                        <tr key={h}>
                          <td style={{ padding: "4px 8px", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: C.steel, whiteSpace: "nowrap", verticalAlign: "top", borderBottom: `1px solid ${C.foam}` }}>{h}</td>
                          <td style={{ padding: "4px 8px", color: C.slate, borderBottom: `1px solid ${C.foam}` }}>{d}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ color: C.slate }}>
                    <strong style={{ color: C.abyss }}>Regla práctica:</strong> a mayor criticidad y uso, menor intervalo.
                    Para PM por <strong>tiempo</strong> (ánodos, inspección de casco, certificados) que no dependen de horas,
                    usa un intervalo alto y registra el PM por fecha — o gestiónalo desde <strong>Cumplimiento</strong>.
                  </div>
                </GuiaColapsable>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// TAB HISTORIAL
// ─────────────────────────────────────────────────────────────────
function TabHistorial({ historial, planes, equipos, embName }) {
  function eqNombre(id) { const e = equipos.find((x) => x.id === id); return e ? `${e.sistema} (${e.id_visible})` : "—"; }
  function planDesc(id) { const p = planes.find((x) => x.id === id); return p ? `${p.intervalo_horas}h · ${p.descripcion}` : "—"; }

  function exportar() {
    const filas = [
      ["Fecha", "Equipo", "Plan PM", "Horas realización", "Realizado por", "Notas", "OT vinculada"],
      ...historial.map((h) => [h.fecha_realizacion, eqNombre(h.equipo_id), planDesc(h.plan_pm_id), h.horas_realizacion, h.realizado_por || "", h.notas || "", h.ot_id ? "Sí" : "No"]),
    ];
    const csv = filas.map((r) => r.map((c) => { const s = String(c ?? ""); return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(";")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "historial_pm.csv"; a.click();
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: C.slate }}>{historial.length} PM registrado{historial.length !== 1 && "s"}</div>
        <button onClick={exportar} style={exportBtn}><Download size={14} /> Exportar CSV</button>
      </div>
      {historial.length === 0 ? (
        <Card><Empty>Sin historial aún. Registra el primer PM desde la pestaña <strong>Plan de Mantenimiento</strong>.</Empty></Card>
      ) : (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>
              <th style={thStyle}>Fecha</th>
              <th style={thStyle}>Equipo</th>
              <th style={thStyle}>Tarea PM</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Horas</th>
              <th style={thStyle}>Realizado por</th>
              <th style={thStyle}>Notas</th>
              <th style={{ ...thStyle, textAlign: "center" }}>OT</th>
            </tr></thead>
            <tbody>
              {historial.map((h) => (
                <tr key={h.id}>
                  <td style={{ ...tdStyle, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>{h.fecha_realizacion}</td>
                  <td style={tdStyle}><div style={{ fontSize: 13, fontWeight: 600 }}>{eqNombre(h.equipo_id)}</div></td>
                  <td style={{ ...tdStyle, fontSize: 12.5, color: C.slate }}>{planDesc(h.plan_pm_id)}</td>
                  <td style={{ ...tdStyle, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>{num(h.horas_realizacion, 0)}h</td>
                  <td style={{ ...tdStyle, fontSize: 12.5 }}>{h.realizado_por || "—"}</td>
                  <td style={{ ...tdStyle, fontSize: 12, color: C.slate, maxWidth: 200 }}>{h.notas || "—"}</td>
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    {h.ot_id ? <Pill tone="green">Sí</Pill> : <span style={{ color: C.line }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
