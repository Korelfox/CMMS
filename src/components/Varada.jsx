import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  Anchor, Plus, ChevronLeft, Wrench, Layers, CalendarRange,
  CheckCircle2, Clock, XCircle, AlertCircle, Download, Pencil, Trash2,
  Flag, ClipboardList, CheckSquare,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { fetchAll, insertRow, updateRow, deleteRow } from "../lib/db";
import { folioOT } from "../lib/ot";
import { scoreBacklog } from "../lib/operacional";
import {
  TIPOS_VARADA, ESTADOS_VARADA, ESTADOS_TRABAJO,
  calcularProgreso, hhTotalesVarada, costoTotalVarada,
  duracionVarada, estadoVaradaTone, desvioPrespuesto,
  resumenPorSistema, trabajosBloqueantes,
} from "../lib/varada";
import { CRITICIDAD_TONE } from "../lib/plantillaPesquera";
import { C, archivo, num, lk, tint, TIPOS_OT, PRIORIDADES } from "../theme";
import { Card, PageHead, Pill, FilterBtn, Empty, ErrorBanner, InlineSpinner, inputStyle, primaryBtn, ghostBtn } from "../ui";
import EquipoPicker from "./EquipoPicker";

const HOY = () => new Date().toISOString().slice(0, 10);

const FORM_VACIO = { nombre: "", tipo: "varada", embarcacion_id: "", fecha_inicio: "", fecha_fin_estimada: "", presupuesto: "", descripcion: "" };
const TRAB_VACIO = { sistema: "", descripcion: "", horas_estimadas: "", responsable: "", equipo_id: "" };

// ── Icono de estado de trabajo ──────────────────────────────────────────────
function IconoEstado({ estado }) {
  if (estado === "completado")  return <CheckCircle2  size={15} color={C.green}  />;
  if (estado === "en_progreso") return <Clock         size={15} color={C.amber}  />;
  if (estado === "cancelado")   return <XCircle       size={15} color={C.slate}  />;
  return                               <AlertCircle   size={15} color={C.slate}  />;
}

// ── Barra de progreso ────────────────────────────────────────────────────────
function BarraProgreso({ pct }) {
  const color = pct >= 100 ? C.green : pct >= 50 ? C.amber : C.steel;
  return (
    <div style={{ height: 6, background: tint(C.steel, 15), borderRadius: 4, overflow: "hidden", flex: 1, minWidth: 60 }}>
      <div style={{ width: `${Math.min(100, pct)}%`, height: "100%", background: color, borderRadius: 4, transition: "width .4s ease" }} />
    </div>
  );
}

// ── Modal: Importar trabajos desde Backlog ──────────────────────────────────
function ImportarModal({ varada, embarcaciones, onImportar, onClose }) {
  const [ots, setOts]       = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [seleccionados, setSeleccionados] = useState(new Set());

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchAll("ordenes_trabajo", { order: { col: "fecha", asc: true } }),
      fetchAll("equipos"),
    ]).then(([otsAll, eqs]) => {
      const abiertas = otsAll.filter(
        (o) => o.estado !== "cerrada" && !o.varada_id &&
        (varada.embarcacion_id ? o.embarcacion_id === varada.embarcacion_id : true)
      );
      setOts(abiertas);
      setEquipos(eqs);
    }).catch(() => { /* error silencioso: se muestra lista vacía */ })
      .finally(() => setLoading(false));
  }, [varada.embarcacion_id]);

  const hoy = HOY();
  const eqById = useMemo(() => new Map(equipos.map((e) => [e.id, e])), [equipos]);
  const embName = (id) => embarcaciones.find((e) => e.id === id)?.nombre || "—";

  const ordenadas = useMemo(() => {
    return [...ots].map((o) => ({
      ot: o,
      eq: o.equipo_id ? eqById.get(o.equipo_id) : null,
      score: scoreBacklog(o, o.equipo_id ? eqById.get(o.equipo_id) : null, hoy),
    })).sort((a, b) => b.score - a.score);
  }, [ots, eqById, hoy]);

  function toggle(id) {
    setSeleccionados((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function confirmar() {
    const elegidas = ots.filter((o) => seleccionados.has(o.id));
    onImportar(elegidas);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(6,24,46,.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: C.surface, borderRadius: 16, width: "100%", maxWidth: 680, maxHeight: "85vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,.25)" }}>
        <div style={{ padding: "20px 24px 16px", borderBottom: `1px solid ${C.line}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ ...archivo, fontSize: 17, fontWeight: 800, color: C.abyss }}>Importar desde Backlog</div>
            <div style={{ fontSize: 12.5, color: C.slate, marginTop: 3 }}>Selecciona OTs abiertas para agregar al alcance de la varada</div>
          </div>
          <button onClick={onClose} style={{ ...ghostBtn, padding: "6px 12px" }}>Cancelar</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 24px" }}>
          {loading ? <InlineSpinner label="Cargando backlog…" /> : ordenadas.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: C.slate }}>No hay OTs abiertas sin varada asignada{varada.embarcacion_id ? " para esta nave" : ""}.</div>
          ) : ordenadas.map(({ ot, eq, score }) => {
            const sel = seleccionados.has(ot.id);
            return (
              <div key={ot.id} onClick={() => toggle(ot.id)}
                style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 12px", borderRadius: 10, marginBottom: 6, cursor: "pointer", border: `1.5px solid ${sel ? C.cyan : C.line}`, background: sel ? tint(C.cyan, 8) : C.surface, transition: "all .15s" }}>
                <div style={{ marginTop: 2, width: 18, height: 18, borderRadius: 4, border: `2px solid ${sel ? C.cyan : C.slate}`, background: sel ? C.cyan : "transparent", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {sel && <svg width="10" height="8" viewBox="0 0 10 8"><path d="M1 4l2.5 2.5L9 1" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" /></svg>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 700, color: C.steel }}>{ot.folio}</span>
                    <span style={{ fontWeight: 700, fontSize: 13, color: C.ink }}>{ot.sistema || "—"}</span>
                    {eq?.criticidad && <Pill tone={CRITICIDAD_TONE[eq.criticidad] || "slate"}>Crit. {eq.criticidad}</Pill>}
                    <Pill tone="steel">Score {score}</Pill>
                  </div>
                  <div style={{ fontSize: 12, color: C.slate, marginTop: 3 }}>
                    {embName(ot.embarcacion_id)} · {ot.descripcion?.slice(0, 80) || "sin descripción"}
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 5, flexWrap: "wrap" }}>
                    <Pill tone={TIPOS_OT.find((t) => t.value === ot.tipo)?.tone || "slate"}>{lk(TIPOS_OT, ot.tipo)}</Pill>
                    <Pill tone={PRIORIDADES.find((p) => p.value === ot.prioridad)?.tone || "slate"}>{lk(PRIORIDADES, ot.prioridad)}</Pill>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ padding: "14px 24px", borderTop: `1px solid ${C.line}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <span style={{ fontSize: 13, color: C.slate }}>{seleccionados.size} OT{seleccionados.size !== 1 ? "s" : ""} seleccionada{seleccionados.size !== 1 ? "s" : ""}</span>
          <button disabled={seleccionados.size === 0} onClick={confirmar}
            style={{ ...primaryBtn, opacity: seleccionados.size === 0 ? 0.45 : 1 }}>
            <Download size={14} /> Agregar al alcance
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Vista detalle de una varada ──────────────────────────────────────────────
function DetalleVarada({ varada, ots, embarcaciones, equipos, empresaId, onBack, onVaradaUpdate, onOTCreada }) {
  const hoy = HOY();
  const [trabajos, setTrabajos]         = useState([]);
  const [loadTrab, setLoadTrab]         = useState(true);
  const [errTrab, setErrTrab]           = useState(null);
  const [formTrab, setFormTrab]         = useState(null); // null = cerrado, {} = abierto
  const [guardando, setGuardando]       = useState(false);
  const [showImportar, setShowImportar] = useState(false);
  const [editando, setEditando]         = useState(false);
  const [editForm, setEditForm]         = useState(null);
  const [showCierre, setShowCierre]     = useState(false);
  const [fechaCierre, setFechaCierre]   = useState(hoy);

  const cargarTrabajos = useCallback(async () => {
    setLoadTrab(true); setErrTrab(null);
    try {
      const rows = await fetchAll("varada_trabajos", { order: { col: "orden", asc: true } });
      setTrabajos(rows.filter((t) => t.varada_id === varada.id));
    } catch (e) { setErrTrab("No se pudieron cargar los trabajos. " + e.message); }
    finally { setLoadTrab(false); }
  }, [varada.id]);
  useEffect(() => { cargarTrabajos(); }, [cargarTrabajos]);

  const embName = (id) => embarcaciones.find((e) => e.id === id)?.nombre || "—";
  const equiposNave = useMemo(
    () => (varada.embarcacion_id ? equipos.filter((e) => e.embarcacion_id === varada.embarcacion_id) : []),
    [equipos, varada.embarcacion_id],
  );
  const progreso = calcularProgreso(trabajos);
  const hhTotal  = hhTotalesVarada(trabajos);
  const costo    = costoTotalVarada(ots, varada.id);
  const presup   = desvioPrespuesto(varada, costo);
  const duracion = duracionVarada(varada, hoy);
  const [tone, labelEstado] = estadoVaradaTone(varada, hoy);
  const tipoLabel = TIPOS_VARADA.find((t) => t.value === varada.tipo)?.label || varada.tipo;
  const sistemas = resumenPorSistema(trabajos, ots, varada.id);

  // Agregar trabajo manual
  async function guardarTrabajo(e) {
    e.preventDefault();
    if (!formTrab?.descripcion?.trim()) return;
    setGuardando(true);
    try {
      const maxOrden = trabajos.reduce((m, t) => Math.max(m, t.orden || 0), 0);
      const eq = formTrab.equipo_id ? equiposNave.find((e) => e.id === formTrab.equipo_id) : null;
      const nuevo = await insertRow("varada_trabajos", empresaId, {
        varada_id: varada.id,
        equipo_id: formTrab.equipo_id || null,
        sistema: (formTrab.sistema?.trim() || eq?.sistema) || null,
        descripcion: formTrab.descripcion.trim(),
        horas_estimadas: formTrab.horas_estimadas ? Number(formTrab.horas_estimadas) : null,
        responsable: formTrab.responsable?.trim() || null,
        estado: "pendiente",
        orden: maxOrden + 1,
      });
      setTrabajos((prev) => [...prev, nuevo]);
      setFormTrab(null);
    } catch (err) { alert("Error al guardar trabajo: " + err.message); }
    finally { setGuardando(false); }
  }

  // Cambiar estado de un trabajo
  async function cambiarEstadoTrabajo(id, nuevoEstado) {
    const anterior = trabajos;
    setTrabajos((prev) => prev.map((t) => t.id === id ? { ...t, estado: nuevoEstado } : t));
    try { await updateRow("varada_trabajos", id, { estado: nuevoEstado }); }
    catch { setTrabajos(anterior); }
  }

  // Eliminar trabajo
  async function eliminarTrabajo(id) {
    if (!window.confirm("¿Eliminar este trabajo del alcance?")) return;
    const anterior = trabajos;
    setTrabajos((prev) => prev.filter((t) => t.id !== id));
    try { await deleteRow("varada_trabajos", id); }
    catch { setTrabajos(anterior); }
  }

  // Importar OTs seleccionadas como trabajos
  async function onImportar(otsElegidas) {
    setShowImportar(false);
    if (otsElegidas.length === 0) return;
    const maxOrden = trabajos.reduce((m, t) => Math.max(m, t.orden || 0), 0);
    const nuevos = [];
    for (let i = 0; i < otsElegidas.length; i++) {
      const ot = otsElegidas[i];
      try {
        const trab = await insertRow("varada_trabajos", empresaId, {
          varada_id: varada.id,
          ot_id: ot.id,
          equipo_id: ot.equipo_id || null,
          sistema: ot.sistema || null,
          descripcion: ot.descripcion || ot.folio || "OT importada",
          horas_estimadas: ot.mttr_horas ? Number(ot.mttr_horas) : null,
          responsable: null,
          estado: "pendiente",
          orden: maxOrden + 1 + i,
        });
        nuevos.push(trab);
        // Ligar la OT a esta varada
        await updateRow("ordenes_trabajo", ot.id, { varada_id: varada.id });
      } catch { /* continúa con las siguientes */ }
    }
    if (nuevos.length > 0) setTrabajos((prev) => [...prev, ...nuevos]);
  }

  // Editar cabecera de varada
  function abrirEdicion() {
    setEditForm({
      nombre: varada.nombre,
      tipo: varada.tipo,
      estado: varada.estado,
      embarcacion_id: varada.embarcacion_id || "",
      fecha_inicio: varada.fecha_inicio || "",
      fecha_fin_estimada: varada.fecha_fin_estimada || "",
      fecha_fin_real: varada.fecha_fin_real || "",
      presupuesto: varada.presupuesto || "",
      descripcion: varada.descripcion || "",
    });
    setEditando(true);
  }

  async function guardarEdicion(e) {
    e.preventDefault();
    if (!editForm?.nombre?.trim()) return;
    setGuardando(true);
    try {
      const cambios = {
        nombre: editForm.nombre.trim(),
        tipo: editForm.tipo,
        estado: editForm.estado,
        embarcacion_id: editForm.embarcacion_id || null,
        fecha_inicio: editForm.fecha_inicio || null,
        fecha_fin_estimada: editForm.fecha_fin_estimada || null,
        fecha_fin_real: editForm.fecha_fin_real || null,
        presupuesto: editForm.presupuesto ? Number(editForm.presupuesto) : null,
        descripcion: editForm.descripcion?.trim() || null,
      };
      const actualizada = await updateRow("varadas", varada.id, cambios);
      onVaradaUpdate(actualizada);
      setEditando(false);
    } catch (err) { alert("Error al guardar: " + err.message); }
    finally { setGuardando(false); }
  }

  // Marcar/desmarcar trabajo como crítico para zarpe
  async function cambiarCriticoZarpe(id, valor) {
    const anterior = trabajos;
    setTrabajos((prev) => prev.map((t) => t.id === id ? { ...t, critico_zarpe: valor } : t));
    try { await updateRow("varada_trabajos", id, { critico_zarpe: valor }); }
    catch { setTrabajos(anterior); }
  }

  // Crear OT planificada desde trabajo sin OT vinculada
  async function crearOTDesdeTrabajo(trabajo) {
    setGuardando(true);
    try {
      const folio = folioOT(ots, true);
      const eq = trabajo.equipo_id ? equiposNave.find((e) => e.id === trabajo.equipo_id) : null;
      const nuevaOT = await insertRow("ordenes_trabajo", empresaId, {
        folio,
        tipo: "preventivo",
        estado: "planificada",
        prioridad: "media",
        embarcacion_id: varada.embarcacion_id || null,
        equipo_id: trabajo.equipo_id || null,
        sistema: trabajo.sistema || eq?.sistema || null,
        descripcion: trabajo.descripcion,
        varada_id: varada.id,
        fecha: hoy,
      });
      await updateRow("varada_trabajos", trabajo.id, { ot_id: nuevaOT.id });
      setTrabajos((prev) => prev.map((t) => t.id === trabajo.id ? { ...t, ot_id: nuevaOT.id } : t));
      if (onOTCreada) onOTCreada(nuevaOT);
    } catch (err) { alert("Error al crear OT: " + err.message); }
    finally { setGuardando(false); }
  }

  // Cierre formal de la varada
  async function confirmarCierre() {
    setGuardando(true);
    try {
      const actualizada = await updateRow("varadas", varada.id, {
        estado: "cerrada",
        fecha_fin_real: fechaCierre || hoy,
      });
      onVaradaUpdate(actualizada);
      setShowCierre(false);
    } catch (err) { alert("Error al cerrar varada: " + err.message); }
    finally { setGuardando(false); }
  }

  const bloqueantes = trabajosBloqueantes(trabajos);
  const pendientesAlCierre = trabajos.filter((t) => t.estado === "pendiente" || t.estado === "en_progreso").length;

  return (
    <div>
      {/* Cabecera */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <button onClick={onBack} style={{ ...ghostBtn, display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 13px" }}>
          <ChevronLeft size={15} /> Volver
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: C.steel, fontWeight: 600 }}>
            {tipoLabel} · {embName(varada.embarcacion_id)}
          </div>
          <h2 style={{ ...archivo, fontSize: 22, fontWeight: 800, margin: "2px 0 0", color: C.abyss }}>{varada.nombre}</h2>
        </div>
        <Pill tone={tone}>{labelEstado}</Pill>
        {bloqueantes.length > 0 && (
          <Pill tone="red"><Flag size={11} /> {bloqueantes.length} bloqueo{bloqueantes.length !== 1 ? "s" : ""} zarpe</Pill>
        )}
        {varada.estado !== "cerrada" && varada.estado !== "cancelada" && (
          <button onClick={() => { setShowCierre((s) => !s); setFechaCierre(hoy); }}
            style={{ ...ghostBtn, display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 12px", borderColor: C.green, color: C.green }}>
            <CheckSquare size={13} /> Cerrar varada
          </button>
        )}
        <button onClick={abrirEdicion} style={{ ...ghostBtn, display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 12px" }}>
          <Pencil size={13} /> Editar
        </button>
      </div>

      {/* Formulario de edición */}
      {editando && editForm && (
        <Card style={{ marginBottom: 20, border: `1.5px solid ${C.steel}` }}>
          <form onSubmit={guardarEdicion}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelSt}>Nombre</label>
                <input required style={inputStyle()} value={editForm.nombre} onChange={(e) => setEditForm((f) => ({ ...f, nombre: e.target.value }))} />
              </div>
              <div>
                <label style={labelSt}>Tipo</label>
                <select style={inputStyle()} value={editForm.tipo} onChange={(e) => setEditForm((f) => ({ ...f, tipo: e.target.value }))}>
                  {TIPOS_VARADA.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label style={labelSt}>Estado</label>
                <select style={inputStyle()} value={editForm.estado} onChange={(e) => setEditForm((f) => ({ ...f, estado: e.target.value }))}>
                  {ESTADOS_VARADA.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label style={labelSt}>Inicio</label>
                <input type="date" style={inputStyle()} value={editForm.fecha_inicio} onChange={(e) => setEditForm((f) => ({ ...f, fecha_inicio: e.target.value }))} />
              </div>
              <div>
                <label style={labelSt}>Fin estimado</label>
                <input type="date" style={inputStyle()} value={editForm.fecha_fin_estimada} onChange={(e) => setEditForm((f) => ({ ...f, fecha_fin_estimada: e.target.value }))} />
              </div>
              <div>
                <label style={labelSt}>Fin real</label>
                <input type="date" style={inputStyle()} value={editForm.fecha_fin_real} onChange={(e) => setEditForm((f) => ({ ...f, fecha_fin_real: e.target.value }))} />
              </div>
              <div>
                <label style={labelSt}>Presupuesto (CLP)</label>
                <input type="number" min={0} style={inputStyle()} value={editForm.presupuesto} onChange={(e) => setEditForm((f) => ({ ...f, presupuesto: e.target.value }))} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelSt}>Descripción / notas</label>
                <textarea rows={2} style={{ ...inputStyle(), resize: "vertical" }} value={editForm.descripcion} onChange={(e) => setEditForm((f) => ({ ...f, descripcion: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="submit" disabled={guardando} style={{ ...primaryBtn, opacity: guardando ? 0.6 : 1 }}>
                {guardando ? "Guardando…" : "Guardar cambios"}
              </button>
              <button type="button" onClick={() => setEditando(false)} style={ghostBtn}>Cancelar</button>
            </div>
          </form>
        </Card>
      )}

      {/* Panel de cierre formal */}
      {showCierre && (
        <Card style={{ marginBottom: 20, border: `1.5px solid ${C.green}`, background: tint(C.green, 5) }}>
          <div style={{ ...archivo, fontSize: 15, fontWeight: 800, color: C.abyss, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
            <CheckSquare size={16} color={C.green} /> Cierre formal de varada
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 14 }}>
            <ResumenCierre label="Avance físico" value={`${progreso.pct}%`} sub={`${progreso.completados}/${progreso.total} trabajos`}
              tone={progreso.pct >= 100 ? C.green : C.amber} />
            <ResumenCierre label="Duración"
              value={duracion.reales != null ? `${duracion.reales} días` : "—"}
              sub={duracion.estimados != null ? `estimado: ${duracion.estimados}d ${duracion.desviacion != null ? `(${duracion.desviacion > 0 ? "+" : ""}${duracion.desviacion}d)` : ""}` : "sin estimado"}
              tone={duracion.desviacion != null && duracion.desviacion > 0 ? C.amber : C.green} />
            <ResumenCierre label="Costo real vs presupuesto"
              value={costo > 0 ? `$${num(costo, 0)}` : "—"}
              sub={presup.presupuesto > 0 ? `${presup.pct}% del presupuesto ($${num(presup.presupuesto, 0)})` : "sin presupuesto"}
              tone={presup.tone === "red" ? C.red : presup.tone === "yellow" ? C.amber : C.green} />
          </div>
          {pendientesAlCierre > 0 && (
            <div style={{ fontSize: 12.5, color: C.amber, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
              <AlertCircle size={14} color={C.amber} />
              {pendientesAlCierre} trabajo{pendientesAlCierre !== 1 ? "s" : ""} quedan sin completar — quedarán registrados en el historial.
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <div>
              <label style={{ ...labelSt, marginBottom: 4 }}>Fecha fin real</label>
              <input type="date" style={{ ...inputStyle(), width: 180 }} value={fechaCierre}
                onChange={(e) => setFechaCierre(e.target.value)} />
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end", paddingBottom: 1 }}>
              <button disabled={guardando} onClick={confirmarCierre}
                style={{ ...primaryBtn, background: C.green, opacity: guardando ? 0.6 : 1 }}>
                <CheckSquare size={14} /> {guardando ? "Cerrando…" : "Confirmar cierre"}
              </button>
              <button onClick={() => setShowCierre(false)} style={ghostBtn}>Cancelar</button>
            </div>
          </div>
        </Card>
      )}

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 20 }}>
        <KPICard label="Avance físico" tone={progreso.pct >= 100 ? C.green : progreso.pct >= 50 ? C.amber : C.steel}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ ...archivo, fontSize: 26, fontWeight: 800 }}>{progreso.pct}%</span>
            <BarraProgreso pct={progreso.pct} />
          </div>
          <div style={{ fontSize: 11.5, color: C.slate, marginTop: 4 }}>
            {progreso.completados}/{progreso.total} trabajos · {progreso.enProgreso} en progreso
          </div>
        </KPICard>
        <KPICard label="HH estimadas" tone={C.steel}>
          <div style={{ ...archivo, fontSize: 26, fontWeight: 800 }}>{hhTotal > 0 ? `${num(hhTotal, 0)}h` : "—"}</div>
          <div style={{ fontSize: 11.5, color: C.slate, marginTop: 4 }}>
            {duracion.estimados != null ? `${duracion.estimados} días estimados` : "sin fechas"}
            {duracion.desviacion != null && duracion.desviacion !== 0 && (
              <span style={{ color: duracion.desviacion > 0 ? C.red : C.green }}> · {duracion.desviacion > 0 ? "+" : ""}{duracion.desviacion}d</span>
            )}
          </div>
        </KPICard>
        <KPICard label="Costo real (OTs)" tone={presup.tone === "slate" ? C.steel : presup.tone === "green" ? C.green : presup.tone === "yellow" ? C.amber : C.red}>
          <div style={{ ...archivo, fontSize: 22, fontWeight: 800 }}>{costo > 0 ? `$${num(costo, 0)}` : "—"}</div>
          <div style={{ fontSize: 11.5, color: C.slate, marginTop: 4 }}>
            {presup.presupuesto > 0
              ? `${presup.pct}% del presupuesto ($${num(presup.presupuesto, 0)})`
              : "sin presupuesto registrado"}
          </div>
        </KPICard>
        <KPICard label="Sistemas involucrados" tone={C.steel}>
          <div style={{ ...archivo, fontSize: 26, fontWeight: 800 }}>{sistemas.length}</div>
          <div style={{ fontSize: 11.5, color: C.slate, marginTop: 4 }}>
            {trabajos.length} trabajo{trabajos.length !== 1 ? "s" : ""} en el alcance
          </div>
        </KPICard>
      </div>

      {/* Alcance: lista de trabajos */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h3 style={{ ...archivo, fontSize: 16, fontWeight: 800, margin: 0, color: C.abyss }}>Alcance de trabajos</h3>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setShowImportar(true)}
            style={{ ...ghostBtn, display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
            <Download size={13} /> Importar desde Backlog
          </button>
          <button onClick={() => setFormTrab(formTrab ? null : { ...TRAB_VACIO })}
            style={{ ...primaryBtn, padding: "8px 14px", fontSize: 12.5 }}>
            <Plus size={13} /> Agregar trabajo
          </button>
        </div>
      </div>

      {/* Formulario inline de nuevo trabajo */}
      {formTrab !== null && (
        <Card style={{ marginBottom: 14, border: `1.5px solid ${C.cyan}` }}>
          <form onSubmit={guardarTrabajo}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
              <div style={{ gridColumn: "1 / 3" }}>
                <label style={labelSt}>Descripción *</label>
                <input required style={inputStyle()} placeholder="Qué se va a hacer…"
                  value={formTrab.descripcion}
                  onChange={(e) => setFormTrab((f) => ({ ...f, descripcion: e.target.value }))} />
              </div>
              {varada.embarcacion_id && (
                <div style={{ gridColumn: "1 / 3" }}>
                  <label style={labelSt}>Equipo (opcional — conecta con confiabilidad)</label>
                  <EquipoPicker equipos={equiposNave} value={formTrab.equipo_id}
                    onChange={(eq) => setFormTrab((f) => ({
                      ...f,
                      equipo_id: eq?.id || "",
                      sistema: eq?.sistema || f.sistema,
                    }))} />
                </div>
              )}
              <div>
                <label style={labelSt}>Sistema</label>
                <input style={inputStyle()} placeholder="Motor principal, casco…"
                  value={formTrab.sistema}
                  onChange={(e) => setFormTrab((f) => ({ ...f, sistema: e.target.value }))} />
              </div>
              <div>
                <label style={labelSt}>HH estimadas</label>
                <input type="number" min={0} step={0.5} style={inputStyle()}
                  value={formTrab.horas_estimadas}
                  onChange={(e) => setFormTrab((f) => ({ ...f, horas_estimadas: e.target.value }))} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelSt}>Responsable</label>
                <input style={inputStyle()} placeholder="Nombre o empresa contratista"
                  value={formTrab.responsable}
                  onChange={(e) => setFormTrab((f) => ({ ...f, responsable: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" disabled={guardando || !formTrab.descripcion?.trim()} style={{ ...primaryBtn, opacity: !formTrab.descripcion?.trim() ? 0.45 : 1 }}>
                {guardando ? "Guardando…" : "Agregar"}
              </button>
              <button type="button" onClick={() => setFormTrab(null)} style={ghostBtn}>Cancelar</button>
            </div>
          </form>
        </Card>
      )}

      <ErrorBanner>{errTrab}</ErrorBanner>
      {loadTrab && <Card><InlineSpinner label="Cargando alcance…" /></Card>}

      {!loadTrab && trabajos.length === 0 && (
        <Card>
          <Empty>
            <Layers size={30} color={C.steel} style={{ marginBottom: 8 }} />
            <br />Sin trabajos en el alcance. Usa "Agregar trabajo" o "Importar desde Backlog".
          </Empty>
        </Card>
      )}

      {/* Agrupado por sistema */}
      {!loadTrab && sistemas.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {sistemas.map(({ sistema, trabajos: tItems, horas, completados, total, costo: cSistema }) => (
            <Card key={sistema}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <span style={{ fontWeight: 700, fontSize: 13.5, color: C.abyss }}>{sistema}</span>
                <span style={{ fontSize: 12, color: C.slate }}>{completados}/{total} completados</span>
                {horas > 0 && <span style={{ fontSize: 12, color: C.slate }}>{num(horas, 1)}h est.</span>}
                {cSistema > 0 && <span style={{ fontSize: 12, color: C.slate }}>${num(cSistema, 0)} real</span>}
                <BarraProgreso pct={total > 0 ? Math.round((completados / total) * 100) : 0} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {tItems.map((t) => (
                  <FilaTrabajo key={t.id} trabajo={t}
                    onEstado={cambiarEstadoTrabajo}
                    onEliminar={eliminarTrabajo}
                    onCriticoZarpe={cambiarCriticoZarpe}
                    onCrearOT={crearOTDesdeTrabajo}
                  />
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      {showImportar && (
        <ImportarModal
          varada={varada}
          embarcaciones={embarcaciones}
          onImportar={onImportar}
          onClose={() => setShowImportar(false)}
        />
      )}
    </div>
  );
}

// ── Fila de un trabajo ───────────────────────────────────────────────────────
function FilaTrabajo({ trabajo: t, onEstado, onEliminar, onCriticoZarpe, onCrearOT }) {
  const estadoOpts = ESTADOS_TRABAJO.filter((e) => e.value !== "cancelado");
  const esBloqueante = t.critico_zarpe && t.estado !== "completado" && t.estado !== "cancelado";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8,
      background: t.estado === "completado" ? tint(C.green, 6) : t.estado === "cancelado" ? tint(C.slate, 6) : esBloqueante ? tint(C.red, 5) : C.surface2,
      border: esBloqueante ? `1px solid ${tint(C.red, 30)}` : "1px solid transparent" }}>
      <IconoEstado estado={t.estado} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: t.estado === "cancelado" ? C.slate : C.ink, textDecoration: t.estado === "cancelado" ? "line-through" : "none" }}>
          {t.descripcion}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 2, flexWrap: "wrap" }}>
          {t.responsable && <span style={{ fontSize: 11.5, color: C.slate }}>{t.responsable}</span>}
          {t.horas_estimadas > 0 && <span style={{ fontSize: 11.5, color: C.slate }}>{num(t.horas_estimadas, 1)}h</span>}
          {t.ot_id && <Pill tone="cyan">OT vinculada</Pill>}
          {t.critico_zarpe && <Pill tone={esBloqueante ? "red" : "green"}><Flag size={10} /> Crítico zarpe</Pill>}
        </div>
      </div>
      {/* Toggle crítico para zarpe */}
      <button title={t.critico_zarpe ? "Quitar marca de crítico para zarpe" : "Marcar como crítico para zarpe"}
        onClick={() => onCriticoZarpe(t.id, !t.critico_zarpe)}
        style={{ background: t.critico_zarpe ? tint(C.red, 18) : "none", border: `1px solid ${t.critico_zarpe ? C.red : C.line}`, borderRadius: 6, cursor: "pointer", padding: "3px 7px", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: t.critico_zarpe ? C.red : C.slate, flexShrink: 0 }}>
        <Flag size={11} /> Zarpe
      </button>
      {/* Crear OT si no tiene */}
      {!t.ot_id && (
        <button title="Crear Orden de Trabajo para este trabajo"
          onClick={() => onCrearOT(t)}
          style={{ background: "none", border: `1px solid ${C.cyan}`, borderRadius: 6, cursor: "pointer", padding: "3px 7px", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: C.cyan, flexShrink: 0 }}>
          <ClipboardList size={11} /> OT
        </button>
      )}
      <select value={t.estado}
        onChange={(e) => onEstado(t.id, e.target.value)}
        style={{ fontSize: 12, padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.line}`, background: C.surface, color: C.ink, cursor: "pointer" }}>
        {[...estadoOpts, ESTADOS_TRABAJO.find((e) => e.value === "cancelado")].map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>
      <button onClick={() => onEliminar(t.id)}
        title="Quitar del alcance"
        style={{ background: "none", border: "none", cursor: "pointer", color: C.slate, padding: 4, borderRadius: 6, display: "inline-flex", alignItems: "center" }}>
        <Trash2 size={13} />
      </button>
    </div>
  );
}

// ── Componente principal ─────────────────────────────────────────────────────
export default function Varada({ onNavigate }) {
  const { profile } = useAuth();
  const empresaId   = profile?.empresa_id;

  const [embarcaciones, setEmbarcaciones] = useState([]);
  const [equipos, setEquipos]             = useState([]);
  const [varadas, setVaradas]             = useState([]);
  const [ots, setOts]                     = useState([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState(null);
  const [filtroEmb, setFiltroEmb]         = useState("all");
  const [varadaActual, setVaradaActual]   = useState(null);
  const [showForm, setShowForm]           = useState(false);
  const [form, setForm]                   = useState(FORM_VACIO);
  const [guardando, setGuardando]         = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [embs, eqs, vars, otsAll] = await Promise.all([
        fetchAll("embarcaciones", { order: { col: "codigo", asc: true } }),
        fetchAll("equipos", { order: { col: "id_visible", asc: true } }),
        fetchAll("varadas", { order: { col: "created_at", asc: false } }),
        fetchAll("ordenes_trabajo"),
      ]);
      setEmbarcaciones(embs);
      setEquipos(eqs);
      setVaradas(vars);
      setOts(otsAll);
    } catch (e) { setError("No se pudo cargar el módulo. " + e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const lista = filtroEmb === "all" ? varadas : varadas.filter((v) => v.embarcacion_id === filtroEmb);
  const embName = (id) => embarcaciones.find((e) => e.id === id)?.nombre || "—";

  // Crear nueva varada
  async function crearVarada(e) {
    e.preventDefault();
    if (!form.nombre?.trim() || !empresaId) return;
    setGuardando(true);
    try {
      const nueva = await insertRow("varadas", empresaId, {
        nombre: form.nombre.trim(),
        tipo: form.tipo,
        estado: "planificacion",
        embarcacion_id: form.embarcacion_id || null,
        fecha_inicio: form.fecha_inicio || null,
        fecha_fin_estimada: form.fecha_fin_estimada || null,
        presupuesto: form.presupuesto ? Number(form.presupuesto) : null,
        descripcion: form.descripcion?.trim() || null,
        created_by: profile?.id || null,
      });
      setVaradas((prev) => [nueva, ...prev]);
      setShowForm(false);
      setForm(FORM_VACIO);
      setVaradaActual(nueva);
    } catch (err) { alert("Error al crear varada: " + err.message); }
    finally { setGuardando(false); }
  }

  function actualizarVarada(actualizada) {
    setVaradas((prev) => prev.map((v) => v.id === actualizada.id ? actualizada : v));
    setVaradaActual(actualizada);
  }

  // Si hay una varada seleccionada, mostrar detalle
  if (varadaActual) {
    return (
      <DetalleVarada
        varada={varadaActual}
        ots={ots}
        embarcaciones={embarcaciones}
        equipos={equipos}
        empresaId={empresaId}
        onBack={() => setVaradaActual(null)}
        onVaradaUpdate={actualizarVarada}
        onOTCreada={(ot) => setOts((prev) => [...prev, ot])}
      />
    );
  }

  // Vista: lista de varadas
  return (
    <div>
      <PageHead kicker="Mantenimiento · Parada Mayor" title="Varadas & Paradas"
        sub="Períodos planificados de mantenimiento intensivo: varadas en dique, carenas, paradas de puerto. Agrupa trabajos, controla avance físico y costos reales desde las OTs."
        action={
          <button onClick={() => setShowForm((s) => !s)} style={{ ...primaryBtn }}>
            <Plus size={14} /> Nueva varada
          </button>
        }
      />

      <ErrorBanner onRetry={cargar}>{error}</ErrorBanner>

      {/* Formulario de creación */}
      {showForm && (
        <Card style={{ marginBottom: 20, border: `1.5px solid ${C.cyan}` }}>
          <div style={{ ...archivo, fontSize: 15, fontWeight: 800, marginBottom: 14, color: C.abyss, display: "flex", alignItems: "center", gap: 8 }}>
            <Anchor size={16} /> Nueva parada / varada
          </div>
          <form onSubmit={crearVarada}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelSt}>Nombre *</label>
                <input required placeholder="Ej: Varada anual 2026 · San Martín" style={inputStyle()}
                  value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} />
              </div>
              <div>
                <label style={labelSt}>Tipo</label>
                <select style={inputStyle()} value={form.tipo} onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value }))}>
                  {TIPOS_VARADA.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label style={labelSt}>Nave</label>
                <select style={inputStyle()} value={form.embarcacion_id} onChange={(e) => setForm((f) => ({ ...f, embarcacion_id: e.target.value }))}>
                  <option value="">Seleccionar nave…</option>
                  {embarcaciones.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
                </select>
              </div>
              <div>
                <label style={labelSt}>Presupuesto (CLP)</label>
                <input type="number" min={0} style={inputStyle()} placeholder="0"
                  value={form.presupuesto} onChange={(e) => setForm((f) => ({ ...f, presupuesto: e.target.value }))} />
              </div>
              <div>
                <label style={labelSt}>Fecha inicio</label>
                <input type="date" style={inputStyle()} value={form.fecha_inicio} onChange={(e) => setForm((f) => ({ ...f, fecha_inicio: e.target.value }))} />
              </div>
              <div>
                <label style={labelSt}>Fin estimado</label>
                <input type="date" style={inputStyle()} value={form.fecha_fin_estimada} onChange={(e) => setForm((f) => ({ ...f, fecha_fin_estimada: e.target.value }))} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelSt}>Descripción</label>
                <textarea rows={2} style={{ ...inputStyle(), resize: "vertical" }} placeholder="Objetivo, alcance general, notas…"
                  value={form.descripcion} onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="submit" disabled={guardando || !form.nombre?.trim()} style={{ ...primaryBtn, opacity: !form.nombre?.trim() ? 0.45 : 1 }}>
                {guardando ? "Creando…" : "Crear varada"}
              </button>
              <button type="button" onClick={() => { setShowForm(false); setForm(FORM_VACIO); }} style={ghostBtn}>Cancelar</button>
            </div>
          </form>
        </Card>
      )}

      {/* Filtros por nave */}
      {embarcaciones.length > 1 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          <FilterBtn active={filtroEmb === "all"} onClick={() => setFiltroEmb("all")}>Todas ({varadas.length})</FilterBtn>
          {embarcaciones.map((v) => (
            <FilterBtn key={v.id} active={filtroEmb === v.id} onClick={() => setFiltroEmb(v.id)} color={v.color}>
              {v.nombre} ({varadas.filter((vd) => vd.embarcacion_id === v.id).length})
            </FilterBtn>
          ))}
        </div>
      )}

      {loading ? (
        <Card><InlineSpinner label="Cargando varadas…" /></Card>
      ) : lista.length === 0 ? (
        <Card>
          <Empty>
            <Anchor size={32} color={C.steel} style={{ marginBottom: 10 }} />
            <br />No hay varadas registradas{filtroEmb !== "all" ? " para esta nave" : ""}.
            <br /><span style={{ fontSize: 12, color: C.slate }}>Usa "Nueva varada" para planificar la próxima parada mayor.</span>
          </Empty>
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {lista.map((v) => (
            <TarjetaVarada key={v.id} varada={v} ots={ots} embName={embName}
              onClick={() => setVaradaActual(v)}
              onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tarjeta de varada en la lista ────────────────────────────────────────────
function TarjetaVarada({ varada: v, ots, embName, onClick }) {
  const hoy = HOY();
  const [tone, labelEstado] = estadoVaradaTone(v, hoy);
  const tipoLabel = TIPOS_VARADA.find((t) => t.value === v.tipo)?.label || v.tipo;
  const costo     = costoTotalVarada(ots, v.id);
  const otsVarada = ots.filter((o) => o.varada_id === v.id);
  const duracion  = duracionVarada(v, hoy);
  const presup    = desvioPrespuesto(v, costo);

  return (
    <Card style={{ cursor: "pointer", transition: "box-shadow .15s" }}
      onClick={onClick}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 4px 20px rgba(28,92,155,.15)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = ""; }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        {/* Info principal */}
        <div style={{ flex: "1 1 260px", minWidth: 220 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
            <Pill tone={tone}>{labelEstado}</Pill>
            <Pill tone={TIPOS_VARADA.find((t) => t.value === v.tipo)?.tone || "slate"}>{tipoLabel}</Pill>
            <span style={{ fontSize: 12, color: C.slate }}>{embName(v.embarcacion_id)}</span>
          </div>
          <div style={{ ...archivo, fontSize: 17, fontWeight: 800, color: C.abyss }}>{v.nombre}</div>
          {v.descripcion && <div style={{ fontSize: 12.5, color: C.slate, marginTop: 4 }}>{v.descripcion.slice(0, 120)}{v.descripcion.length > 120 ? "…" : ""}</div>}
        </div>
        {/* Stats */}
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
          <Stat label="OTs ligadas" value={otsVarada.length} />
          <Stat label="Costo real" value={costo > 0 ? `$${num(costo, 0)}` : "—"}
            color={presup.presupuesto > 0 ? (presup.tone === "red" ? C.red : presup.tone === "yellow" ? C.amber : C.green) : C.steel} />
          {v.presupuesto > 0 && <Stat label="Presupuesto" value={`$${num(v.presupuesto, 0)}`} />}
          {duracion.estimados != null && <Stat label="Duración est." value={`${duracion.estimados}d`} />}
          {(v.fecha_inicio || v.fecha_fin_estimada) && (
            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: C.slate }}>
              <CalendarRange size={13} />
              {v.fecha_inicio || "?"} → {v.fecha_fin_estimada || "?"}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

// ── Helpers de presentación ──────────────────────────────────────────────────
const labelSt = { display: "block", fontSize: 11.5, fontWeight: 600, color: C.slate, marginBottom: 5, letterSpacing: 0.3 };

function Stat({ label, value, color }) {
  return (
    <div style={{ textAlign: "center", minWidth: 70 }}>
      <div style={{ fontSize: 9.5, letterSpacing: 0.5, color: C.slate, fontWeight: 600, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: color || C.ink, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function KPICard({ label, tone, children }) {
  return (
    <Card style={{ padding: 16 }}>
      <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: C.slate, fontWeight: 600, marginBottom: 6 }}>{label}</div>
      <div style={{ color: tone || C.steel }}>{children}</div>
    </Card>
  );
}

function ResumenCierre({ label, value, sub, tone }) {
  return (
    <div style={{ background: C.surface, borderRadius: 10, padding: "12px 16px", border: `1px solid ${C.line}` }}>
      <div style={{ fontSize: 10.5, letterSpacing: 0.5, color: C.slate, fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
      <div style={{ ...archivo, fontSize: 20, fontWeight: 800, color: tone || C.steel }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: C.slate, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}
