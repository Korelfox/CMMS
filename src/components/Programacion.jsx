import React, { useEffect, useState, useCallback } from "react";
import { Calendar, Plus, Trash2, Check } from "lucide-react";
import { useAuth } from "../lib/auth";
import { fetchAll, insertRow, updateRow, deleteRow, logActivity } from "../lib/db";
import { C, archivo, num, canOperate, isAdmin, DIAS_SEMANA, tint, ESTADOS_OT, lk } from "../theme";
import CierreFallaModal from "./ot/CierreFallaModal";
import { MODOS_FALLA_ISO, requiereCodigoFalla } from "../lib/fallasISO";
import {
  Card, PageHead, Pill, primaryBtn, ghostBtn, inputStyle, bluInput,
  Field, Empty, ErrorBanner, InlineSpinner,
} from "../ui";
import EquipoPicker from "./EquipoPicker";

const TIPOS = ["Proactiva", "Reactiva", "Inspección", "Predictiva"];

// Tipo de OT (BD) → tipo de tarea programada
const TIPO_OT_A_PROG = { preventivo: "Proactiva", correctivo: "Reactiva", modificativo: "Proactiva", predictivo: "Predictiva" };
// Orden de presentación de OTs abiertas: primero las que faltan por programar
const RANK_ESTADO = { solicitada: 0, planificada: 1, programada: 2, en_ejecucion: 3 };

export default function Programacion() {
  const { profile } = useAuth();
  const [embarcaciones, setEmbarcaciones] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [ots, setOts] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blank());
  const [cierreOT, setCierreOT] = useState(null);
  const puedeOperar = canOperate(profile?.rol);
  const puedeBorrar = isAdmin(profile?.rol);

  function blank() {
    return { embarcacion_id: "", ot_id: "", ot_folio: "", equipo_id: "", sistema: "", tipo: "Proactiva", hh: 2, dia: "Lun" };
  }

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [embs, prog, eqs, otsAll] = await Promise.all([
        fetchAll("embarcaciones", { order: { col: "codigo", asc: true } }),
        fetchAll("programacion", { order: { col: "created_at", asc: true } }),
        fetchAll("equipos"),
        fetchAll("ordenes_trabajo", { order: { col: "fecha", asc: false } }),
      ]);
      setEmbarcaciones(embs); setItems(prog); setEquipos(eqs); setOts(otsAll);
    } catch (e) { setError("No se pudo cargar la programación. " + e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  function embName(id) { return embarcaciones.find((e) => e.id === id)?.nombre || "—"; }
  function embColor(id) { return embarcaciones.find((e) => e.id === id)?.color || C.steel; }
  const estadoLabel = (v) => ESTADOS_OT.find((s) => s.value === v)?.label || v;

  // Sistemas de la embarcación elegida (para el buscador de Sistema)
  const equiposDeNave = form.embarcacion_id ? equipos.filter((e) => e.embarcacion_id === form.embarcacion_id) : [];

  // OTs por cerrar, primero las que aún no se programan
  const otsAbiertas = ots
    .filter((o) => o.estado !== "cerrada")
    .sort((a, b) => (RANK_ESTADO[a.estado] ?? 9) - (RANK_ESTADO[b.estado] ?? 9) || (b.fecha || "").localeCompare(a.fecha || ""));

  // Elegir una OT pre-llena embarcación, sistema y tipo de la tarea.
  function seleccionarOT(otId) {
    const ot = ots.find((o) => o.id === otId);
    if (!ot) { setForm((f) => ({ ...f, ot_id: "", ot_folio: "" })); return; }
    setForm((f) => ({
      ...f,
      ot_id: ot.id,
      ot_folio: ot.folio || "",
      embarcacion_id: ot.embarcacion_id || f.embarcacion_id,
      equipo_id: ot.equipo_id || "",
      sistema: ot.sistema || f.sistema,
      tipo: TIPO_OT_A_PROG[ot.tipo] || f.tipo,
    }));
  }

  async function crear(dia) {
    const f = dia ? { ...form, dia } : form;
    if (!f.embarcacion_id || !f.sistema.trim()) { setError("Indica embarcación y sistema."); return; }
    let nuevo;
    try {
      nuevo = await insertRow("programacion", profile.empresa_id, {
        embarcacion_id: f.embarcacion_id, ot_folio: f.ot_folio.trim(),
        sistema: f.sistema.trim(), tipo: f.tipo, hh: f.hh, dia: f.dia, done: false, created_by: profile.id,
      });
      setItems((p) => [...p, nuevo]);
      logActivity(profile, "Programar tarea", `${f.dia} · ${nuevo.sistema} (${nuevo.hh}h)`);
      setForm(blank()); setShowForm(false);
    } catch (e) { setError("No se pudo programar: " + e.message); return; }

    // La OT asociada queda automáticamente en estado "programada"
    const ot = f.ot_id ? ots.find((o) => o.id === f.ot_id) : null;
    if (ot && ["solicitada", "planificada"].includes(ot.estado)) {
      try {
        await updateRow("ordenes_trabajo", ot.id, { estado: "programada" });
        setOts((p) => p.map((o) => (o.id === ot.id ? { ...o, estado: "programada" } : o)));
        logActivity(profile, "Programar OT", `${ot.folio} → programada (vía Programación Semanal)`);
      } catch (e) {
        setError(`La tarea quedó creada, pero no se pudo pasar la OT ${ot.folio} a programada: ` + e.message);
      }
    }
  }

  async function toggleDone(item) {
    const previo = item.done;
    const ahora = !previo;
    setItems((p) => p.map((x) => x.id === item.id ? { ...x, done: ahora } : x));
    try {
      await updateRow("programacion", item.id, { done: ahora });
      logActivity(profile, ahora ? "Cerrar tarea" : "Reabrir tarea", `${item.dia} · ${item.sistema}`);
    } catch (e) {
      setItems((p) => p.map((x) => x.id === item.id ? { ...x, done: previo } : x));
      setError("No se pudo actualizar: " + e.message);
      return;
    }
    // Al marcar como hecha, cerrar también la OT asociada si no está ya cerrada
    if (ahora && item.ot_folio) {
      const ot = ots.find((o) => o.folio === item.ot_folio);
      if (ot && ot.estado !== "cerrada") {
        if (requiereCodigoFalla(ot) && !ot.modo_falla) {
          // Correctiva sin codificar: pedir código ISO 14224 antes de cerrar
          setCierreOT(ot);
        } else {
          await cerrarOTDirecta(ot);
        }
      }
    }
  }

  async function cerrarOTDirecta(ot) {
    const cambios = { estado: "cerrada", cerrada_por: profile?.nombre || profile?.email || "", cerrada_fecha: new Date().toISOString() };
    try {
      await updateRow("ordenes_trabajo", ot.id, cambios);
      setOts((p) => p.map((o) => o.id === ot.id ? { ...o, ...cambios } : o));
      logActivity(profile, "Cerrar OT vía Programación", `${ot.folio} → cerrada`);
    } catch (e) {
      setError(`Tarea marcada, pero no se pudo cerrar la OT ${ot.folio}: ` + e.message);
    }
  }

  async function cerrarOTConCodigos(ot, codigos) {
    const previo = { estado: ot.estado, modo_falla: ot.modo_falla ?? null, causa_falla: ot.causa_falla ?? null, mecanismo_falla: ot.mecanismo_falla ?? null, cerrada_por: ot.cerrada_por ?? null, cerrada_fecha: ot.cerrada_fecha ?? null };
    const cambios = { estado: "cerrada", cerrada_por: profile?.nombre || profile?.email || "", cerrada_fecha: new Date().toISOString(), ...(codigos || {}) };
    setOts((p) => p.map((o) => o.id === ot.id ? { ...o, ...cambios } : o));
    setCierreOT(null);
    try {
      await updateRow("ordenes_trabajo", ot.id, cambios);
      const modoLbl = codigos?.modo_falla ? lk(MODOS_FALLA_ISO, codigos.modo_falla) : "sin codificar";
      logActivity(profile, "Cerrar OT correctiva vía Programación", `${ot.folio} · falla: ${modoLbl}`);
    } catch (e) {
      setOts((p) => p.map((o) => o.id === ot.id ? { ...o, ...previo } : o));
      setError("No se pudo cerrar la OT: " + e.message);
    }
  }

  async function eliminar(id) {
    if (!window.confirm("¿Eliminar esta tarea del programa?")) return;
    const respaldo = items;
    setItems((p) => p.filter((x) => x.id !== id));
    try { await deleteRow("programacion", id); }
    catch (e) { setItems(respaldo); setError("No se pudo eliminar: " + e.message); }
  }

  // Cálculos agregados
  const totalHH = items.reduce((s, i) => s + (i.hh || 0), 0);
  const totalDone = items.filter((i) => i.done).length;
  const cumplimiento = items.length ? (totalDone / items.length) * 100 : 0;
  const hhPorDia = (d) => items.filter((i) => i.dia === d).reduce((s, i) => s + (i.hh || 0), 0);
  const itemsPorDia = (d) => items.filter((i) => i.dia === d);

  if (loading) return <div><PageHead kicker="Plan Semanal" title="Programación Semanal" /><Card><InlineSpinner label="Cargando programa…" /></Card></div>;

  return (
    <div>
      <PageHead kicker="Plan Semanal · Libbrecht / Pascual" title="Programación Semanal"
        sub="Balance de carga semana a semana. Cada tarea con sus horas-hombre estimadas. Pulsa ✓ cuando esté cumplida."
        action={puedeOperar && <button onClick={() => { setShowForm(!showForm); setError(null); }} style={primaryBtn}><Plus size={16} /> Nueva Tarea</button>} />

      <ErrorBanner onRetry={cargar}>{error}</ErrorBanner>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 16 }}>
        <KPI label="Tareas planificadas" value={items.length} />
        <KPI label="Total HH semana" value={`${num(totalHH, 1)}h`} tone={C.steel} />
        <KPI label="Cumplimiento" value={`${cumplimiento.toFixed(0)}%`} tone={cumplimiento >= 80 ? C.green : cumplimiento >= 50 ? C.amber : C.red} sub={`${totalDone} de ${items.length}`} />
        <KPI label="Pendientes" value={items.length - totalDone} tone={(items.length - totalDone) > 0 ? C.amber : C.green} />
      </div>

      {showForm && (
        <Card style={{ marginBottom: 16, background: C.mist }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: C.abyss, marginBottom: 14 }}>Nueva Tarea Programada</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 12 }}>
            <Field label="Día">
              <select value={form.dia} onChange={(e) => setForm({ ...form, dia: e.target.value })} style={inputStyle()}>
                {DIAS_SEMANA.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </Field>
            <Field label="Embarcación">
              <select value={form.embarcacion_id} onChange={(e) => setForm({ ...form, embarcacion_id: e.target.value, equipo_id: "", sistema: "" })} style={inputStyle()}>
                <option value="">— Selecciona —</option>
                {embarcaciones.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
              </select>
            </Field>
            <Field label="Sistema" span={2}>
              {form.embarcacion_id && equiposDeNave.length === 0 ? (
                <input value={form.sistema} onChange={(e) => setForm({ ...form, sistema: e.target.value })}
                  style={inputStyle()} placeholder="Sistema (nave sin equipos registrados)" />
              ) : (
                <EquipoPicker equipos={equiposDeNave} value={form.equipo_id} disabled={!form.embarcacion_id}
                  placeholder={form.embarcacion_id ? "Buscar sistema o código…" : "Elige embarcación primero"}
                  onChange={(eq) => setForm({ ...form, equipo_id: eq?.id || "", sistema: eq?.sistema || "" })} />
              )}
            </Field>
            <Field label="Tipo">
              <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} style={inputStyle()}>
                {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="HH"><input type="number" step={0.5} value={form.hh} onFocus={(e) => e.target.select()} onChange={(e) => setForm({ ...form, hh: +e.target.value })} style={bluInput} /></Field>
            <Field label="OT por programar (opcional) — al guardar, la OT pasa a estado Programada" span={6}>
              <select value={form.ot_id} onChange={(e) => seleccionarOT(e.target.value)} style={inputStyle()}>
                <option value="">— Sin OT asociada —</option>
                {otsAbiertas.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.folio} · {embName(o.embarcacion_id)} · {o.sistema || "—"}{o.descripcion ? ` — ${o.descripcion.slice(0, 50)}` : ""} ({estadoLabel(o.estado)})
                  </option>
                ))}
              </select>
              {form.ot_id && (
                <div style={{ fontSize: 11, color: C.steel, marginTop: 5 }}>
                  ✓ Embarcación, sistema y tipo se completaron desde la OT. Al guardar, {form.ot_folio} quedará <strong>Programada</strong>.
                </div>
              )}
            </Field>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button onClick={() => crear()} style={primaryBtn}>Agregar al programa</button>
            <button onClick={() => { setShowForm(false); setError(null); }} style={ghostBtn}>Cancelar</button>
          </div>
        </Card>
      )}

      {/* Grilla semanal de 7 columnas */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 10 }}>
        {DIAS_SEMANA.map((d) => {
          const dayItems = itemsPorDia(d);
          const hhDia = hhPorDia(d);
          const doneDia = dayItems.filter((i) => i.done).length;
          return (
            <div key={d} style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 10, overflow: "hidden", minHeight: 200, display: "flex", flexDirection: "column" }}>
              <div style={{ padding: "10px 12px", background: C.mist, borderBottom: `1px solid ${C.line}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ ...archivo, fontWeight: 700, color: C.abyss, fontSize: 14 }}>{d}</div>
                  <div style={{ fontSize: 10.5, color: C.slate, fontFamily: "'IBM Plex Mono', monospace" }}>{num(hhDia, 1)}h · {doneDia}/{dayItems.length}</div>
                </div>
                {puedeOperar && (
                  <button onClick={() => { setForm({ ...blank(), dia: d }); setShowForm(true); }}
                    title={`Añadir tarea en ${d}`}
                    style={{ width: 24, height: 24, borderRadius: 6, border: `1px solid ${C.line}`, background: C.surface, color: C.slate, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                    <Plus size={13} />
                  </button>
                )}
              </div>
              <div style={{ flex: 1, padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                {dayItems.length === 0 ? (
                  <div style={{ fontSize: 11, color: C.line, textAlign: "center", padding: "20px 0" }}>Sin tareas</div>
                ) : dayItems.map((i) => {
                  const otAsociada = i.ot_folio ? ots.find((o) => o.folio === i.ot_folio) : null;
                  const otTono = otAsociada?.estado === "cerrada" ? C.green : C.amber;
                  return (
                  <div key={i.id} style={{ background: i.done ? tint(C.green, 8) : C.foam, borderLeft: `3px solid ${embColor(i.embarcacion_id)}`, borderRadius: 6, padding: "7px 9px", fontSize: 11.5, opacity: i.done ? 0.65 : 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, color: C.ink, textDecoration: i.done ? "line-through" : "none" }}>{i.sistema}</div>
                        <div style={{ fontSize: 10.5, color: C.slate, marginTop: 2 }}>{embName(i.embarcacion_id)}</div>
                        {i.ot_folio && (
                          <div style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", marginTop: 2, color: C.steel }}>
                            {i.ot_folio}
                            {otAsociada && <span style={{ marginLeft: 4, color: otTono }}>· {estadoLabel(otAsociada.estado)}</span>}
                          </div>
                        )}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                        <span style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, color: C.steel }}>{i.hh}h</span>
                        <div style={{ display: "flex", gap: 3 }}>
                          {puedeOperar && (
                            <button onClick={() => toggleDone(i)} title={i.done ? "Reabrir" : "Marcar hecho"}
                              style={{ width: 18, height: 18, borderRadius: 4, border: `1px solid ${i.done ? C.green : C.line}`, background: i.done ? C.green : "#fff", color: i.done ? "#fff" : C.slate, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                              {i.done && <Check size={10} />}
                            </button>
                          )}
                          {puedeBorrar && <button onClick={() => eliminar(i.id)} style={{ background: "none", border: "none", cursor: "pointer", color: C.slate, padding: 0 }}><Trash2 size={11} /></button>}
                        </div>
                      </div>
                    </div>
                    <div style={{ marginTop: 4 }}><Pill tone={i.tipo === "Reactiva" ? "red" : i.tipo === "Predictiva" ? "cyan" : "green"}>{i.tipo}</Pill></div>
                  </div>
                  );
                })}
              </div>
            </div>);
        })}
      </div>

      <Card style={{ marginTop: 16, background: C.mist }}>
        <div style={{ fontSize: 12.5, color: C.slate, lineHeight: 1.7 }}>
          <strong style={{ color: C.ink }}>Cómo usarlo:</strong> usa el botón <strong>+</strong> de cada día para agregar una tarea directamente a ese día.
          Si asocias una <strong>OT por programar</strong>, sus datos se pre-llenan y la orden pasa automáticamente a estado <strong>Programada</strong> — así el flujo Solicitada → Planificada → Programada se cierra desde aquí.
          Pulsa <strong>✓</strong> cuando esté ejecutada — el indicador de cumplimiento sube automáticamente.
          Las HH por día te dicen si la carga está balanceada (objetivo: similar volumen lunes a viernes, menor el fin de semana).
        </div>
      </Card>

      {cierreOT && (
        <CierreFallaModal
          ot={cierreOT}
          onGuardar={(codigos) => cerrarOTConCodigos(cierreOT, codigos)}
          onCerrarSinCodificar={() => cerrarOTConCodigos(cierreOT, null)}
          onClose={() => setCierreOT(null)}
        />
      )}
    </div>
  );
}

function KPI({ label, value, tone, sub }) {
  return (
    <Card style={{ padding: 16 }}>
      <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: C.slate, fontWeight: 600 }}>{label}</div>
      <div style={{ ...archivo, fontSize: 24, fontWeight: 800, color: tone || C.steel, lineHeight: 1, marginTop: 6 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: C.slate, marginTop: 6 }}>{sub}</div>}
    </Card>
  );
}
