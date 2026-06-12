import React, { useEffect, useState, useCallback } from "react";
import { Inbox, Plus, Trash2, ArrowRight, X, Clock } from "lucide-react";
import { useAuth } from "../lib/auth";
import { fetchAll, insertRow, updateRow, deleteRow, logActivity } from "../lib/db";
import {
  C, archivo, isAdmin, canOperate,
  PRIORIDADES, ESTADOS_SOLICITUD, SLA_HORAS, lk, tn,
} from "../theme";
import {
  Card, PageHead, Pill, primaryBtn, ghostBtn, inputStyle,
  thStyle, tdStyle, FilterBtn, Field, Empty, ErrorBanner, InlineSpinner,
} from "../ui";
import EquipoPicker from "./EquipoPicker";
import { folioOT } from "../lib/ot";

const HOY = () => new Date().toISOString().slice(0, 10);

// SLA: calcula horas transcurridas desde la creación y compara contra el objetivo
function slaInfo(sol) {
  if (sol.estado !== "pendiente") return null;
  const objetivo = SLA_HORAS[sol.prioridad] || 24;
  const transcurridas = (Date.now() - new Date(sol.created_at).getTime()) / 36e5;
  const pct = transcurridas / objetivo;
  const tone = pct >= 1 ? "red" : pct >= 0.75 ? "yellow" : "green";
  const label = pct >= 1 ? "Vencido" : pct >= 0.75 ? "Por vencer" : "En tiempo";
  return { objetivo, transcurridas, pct, tone, label };
}

export default function Solicitudes() {
  const { profile } = useAuth();
  const [embarcaciones, setEmbarcaciones] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [solicitudes, setSolicitudes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filtro, setFiltro] = useState("pendiente");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blank());
  const [selEq, setSelEq] = useState(null); // equipo elegido en el picker (para mostrar el chip)
  const puedeOperar = canOperate(profile?.rol);
  const puedeBorrar = isAdmin(profile?.rol);

  function blank() {
    return { solicitante: profile?.nombre || "", embarcacion_id: "", sistema: "", descripcion: "", prioridad: "media", fecha: HOY() };
  }

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [embs, eqs, sols] = await Promise.all([
        fetchAll("embarcaciones", { order: { col: "codigo", asc: true } }),
        fetchAll("equipos", { order: { col: "id_visible", asc: true } }),
        fetchAll("solicitudes", { order: { col: "created_at", asc: false } }),
      ]);
      setEmbarcaciones(embs); setEquipos(eqs); setSolicitudes(sols);
    } catch (e) { setError("No se pudieron cargar las solicitudes. " + e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  function embName(id) { return embarcaciones.find((e) => e.id === id)?.nombre || "—"; }

  // Equipos para el buscador de sistema: los de la embarcación elegida
  // (o de toda la flota si aún no se eligió). Se guarda el nombre del sistema.
  const equiposDeNave = form.embarcacion_id ? equipos.filter((e) => e.embarcacion_id === form.embarcacion_id) : equipos;

  async function crear() {
    if (!form.solicitante.trim() || !form.descripcion.trim()) { setError("Indica solicitante y descripción."); return; }
    const folio = `SOL-${String(solicitudes.length + 1).padStart(3, "0")}`;
    try {
      const nueva = await insertRow("solicitudes", profile.empresa_id, {
        folio, solicitante: form.solicitante.trim(), embarcacion_id: form.embarcacion_id || null,
        sistema: form.sistema.trim(), descripcion: form.descripcion.trim(),
        prioridad: form.prioridad, fecha: form.fecha, estado: "pendiente", created_by: profile.id,
      });
      setSolicitudes((p) => [nueva, ...p]);
      logActivity(profile, "Crear solicitud", `${folio} · ${nueva.descripcion}`);
      setForm(blank()); setSelEq(null); setShowForm(false);
    } catch (e) { setError("No se pudo crear: " + e.message); }
  }

  // Convertir solicitud → OT (folio correlativo robusto desde lib/ot)
  async function convertir(sol) {
    if (!window.confirm(`¿Convertir "${sol.folio || sol.descripcion}" en una nueva Orden de Trabajo?`)) return;
    try {
      const otsActuales = await fetchAll("ordenes_trabajo");
      const folio = folioOT(otsActuales, true);
      const nuevaOT = await insertRow("ordenes_trabajo", profile.empresa_id, {
        folio,
        embarcacion_id: sol.embarcacion_id, sistema: sol.sistema,
        tipo: "correctivo", prioridad: sol.prioridad, estado: "planificada",
        descripcion: sol.descripcion, fecha: sol.fecha,
        origen_solicitud_id: sol.id, created_by: profile.id,
      });
      await updateRow("solicitudes", sol.id, { estado: "convertida", ot_id: nuevaOT.id });
      setSolicitudes((p) => p.map((s) => s.id === sol.id ? { ...s, estado: "convertida", ot_id: nuevaOT.id } : s));
      logActivity(profile, "Solicitud → OT", `${sol.folio || ""} → ${nuevaOT.folio}`);
    } catch (e) { setError("No se pudo convertir: " + e.message); }
  }

  async function rechazar(sol) {
    if (!window.confirm(`¿Rechazar la solicitud "${sol.folio || sol.descripcion}"?`)) return;
    const previo = sol.estado;
    setSolicitudes((p) => p.map((s) => s.id === sol.id ? { ...s, estado: "rechazada" } : s));
    try { await updateRow("solicitudes", sol.id, { estado: "rechazada" });
      logActivity(profile, "Rechazar solicitud", sol.folio || sol.descripcion); }
    catch (e) { setSolicitudes((p) => p.map((s) => s.id === sol.id ? { ...s, estado: previo } : s)); setError("No se pudo rechazar: " + e.message); }
  }

  async function eliminar(id) {
    const s = solicitudes.find((x) => x.id === id);
    if (!window.confirm(`¿Eliminar la solicitud ${s?.folio || ""}?`)) return;
    const respaldo = solicitudes;
    setSolicitudes((p) => p.filter((x) => x.id !== id));
    try { await deleteRow("solicitudes", id); logActivity(profile, "Eliminar solicitud", s?.folio || ""); }
    catch (e) { setSolicitudes(respaldo); setError("No se pudo eliminar: " + e.message); }
  }

  const pendientes = solicitudes.filter((s) => s.estado === "pendiente");
  const vencidasSLA = pendientes.filter((s) => { const i = slaInfo(s); return i && i.pct >= 1; }).length;
  const porVencer = pendientes.filter((s) => { const i = slaInfo(s); return i && i.pct >= 0.75 && i.pct < 1; }).length;
  const convertidas = solicitudes.filter((s) => s.estado === "convertida").length;

  const lista = filtro === "all" ? solicitudes : solicitudes.filter((s) => s.estado === filtro);

  if (loading) return <div><PageHead kicker="Portal de Requerimientos" title="Solicitudes" /><Card><InlineSpinner label="Cargando solicitudes…" /></Card></div>;

  return (
    <div>
      <PageHead kicker="Portal de Requerimientos · SLA" title="Solicitudes"
        sub="Capitán y maquinista solicitan, Jefe de Mantención convierte en OT. SLA por prioridad: crítica 4h · alta 8h · media 24h · baja 72h."
        action={puedeOperar && <button onClick={() => { setShowForm(!showForm); setError(null); }} style={primaryBtn}><Plus size={16} /> Nueva Solicitud</button>} />

      <ErrorBanner onRetry={cargar}>{error}</ErrorBanner>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 16 }}>
        <KPI label="Pendientes" value={pendientes.length} tone={pendientes.length ? C.amber : C.green} />
        <KPI label="SLA Vencidas" value={vencidasSLA} tone={vencidasSLA ? C.red : C.green} sub="acción inmediata" />
        <KPI label="Por Vencer" value={porVencer} tone={porVencer ? C.amber : C.green} sub="≥ 75% del SLA" />
        <KPI label="Convertidas a OT" value={convertidas} tone={C.green} sub={`${solicitudes.length} totales`} />
      </div>

      {showForm && (
        <Card style={{ marginBottom: 16, background: C.mist }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: C.abyss, marginBottom: 14 }}>Nueva Solicitud</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
            <Field label="Solicitante"><input value={form.solicitante} onChange={(e) => setForm({ ...form, solicitante: e.target.value })} style={inputStyle()} /></Field>
            <Field label="Embarcación">
              <select value={form.embarcacion_id} onChange={(e) => { setForm({ ...form, embarcacion_id: e.target.value, sistema: "" }); setSelEq(null); }} style={inputStyle()}>
                <option value="">— Selecciona —</option>
                {embarcaciones.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
              </select>
            </Field>
            <Field label="Sistema">
              <EquipoPicker equipos={equiposDeNave} value={selEq}
                placeholder="Buscar sistema o equipo…"
                onChange={(eq) => { setSelEq(eq?.id || null); setForm((f) => ({ ...f, sistema: eq?.sistema || "" })); }} />
            </Field>
            <Field label="Prioridad"><select value={form.prioridad} onChange={(e) => setForm({ ...form, prioridad: e.target.value })} style={inputStyle()}>{PRIORIDADES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select></Field>
            <Field label="Descripción" span={3}><input value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} style={inputStyle()} placeholder="Qué se necesita" /></Field>
            <Field label="Fecha"><input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} style={inputStyle()} /></Field>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button onClick={crear} style={primaryBtn}>Enviar solicitud</button>
            <button onClick={() => { setShowForm(false); setError(null); }} style={ghostBtn}>Cancelar</button>
          </div>
        </Card>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <FilterBtn active={filtro === "all"} onClick={() => setFiltro("all")}>Todas ({solicitudes.length})</FilterBtn>
        {ESTADOS_SOLICITUD.map((s) => {
          const n = solicitudes.filter((x) => x.estado === s.value).length;
          return <FilterBtn key={s.value} active={filtro === s.value} onClick={() => setFiltro(s.value)}>{s.label} ({n})</FilterBtn>;
        })}
      </div>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1000 }}>
            <thead><tr>
              <th style={thStyle}>Folio</th><th style={thStyle}>Fecha</th><th style={thStyle}>Solicitante</th>
              <th style={thStyle}>Embarcación</th><th style={thStyle}>Descripción</th>
              <th style={thStyle}>Prioridad</th><th style={thStyle}>SLA</th>
              <th style={thStyle}>Estado</th><th style={thStyle}>Acciones</th>
            </tr></thead>
            <tbody>
              {lista.length === 0 ? <tr><td colSpan={9}><Empty>Sin solicitudes en este filtro.</Empty></td></tr> :
                lista.map((s) => {
                  const sla = slaInfo(s);
                  return (
                    <tr key={s.id}>
                      <td style={{ ...tdStyle, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, color: C.steel }}>{s.folio || "—"}</td>
                      <td style={{ ...tdStyle, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>{s.fecha}</td>
                      <td style={{ ...tdStyle, fontSize: 12.5 }}>{s.solicitante}</td>
                      <td style={tdStyle}>{embName(s.embarcacion_id)}</td>
                      <td style={{ ...tdStyle, maxWidth: 260, fontSize: 12.5 }}>
                        <div>{s.descripcion}</div>
                        {s.sistema && <div style={{ fontSize: 11, color: C.slate, marginTop: 2 }}>{s.sistema}</div>}
                      </td>
                      <td style={tdStyle}><Pill tone={tn(PRIORIDADES, s.prioridad)}>{lk(PRIORIDADES, s.prioridad)}</Pill></td>
                      <td style={tdStyle}>
                        {sla ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <Clock size={12} color={sla.tone === "red" ? C.red : sla.tone === "yellow" ? C.amber : C.green} />
                            <span style={{ fontSize: 11.5, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>{sla.transcurridas.toFixed(1)}/{sla.objetivo}h</span>
                            <Pill tone={sla.tone}>{sla.label}</Pill>
                          </div>
                        ) : <span style={{ fontSize: 11, color: C.slate }}>—</span>}
                      </td>
                      <td style={tdStyle}><Pill tone={tn(ESTADOS_SOLICITUD, s.estado)}>{lk(ESTADOS_SOLICITUD, s.estado)}</Pill></td>
                      <td style={tdStyle}>
                        <div style={{ display: "flex", gap: 6 }}>
                          {s.estado === "pendiente" && isAdmin(profile?.rol) && (
                            <>
                              <button onClick={() => convertir(s)} title="Convertir a OT"
                                style={{ ...ghostBtn, padding: "5px 9px", fontSize: 11.5, color: C.green, borderColor: C.green }}>
                                <ArrowRight size={13} /> OT
                              </button>
                              <button onClick={() => rechazar(s)} title="Rechazar"
                                style={{ ...ghostBtn, padding: "5px 9px", fontSize: 11.5, color: C.red, borderColor: C.red }}>
                                <X size={13} />
                              </button>
                            </>
                          )}
                          {puedeBorrar && <button onClick={() => eliminar(s.id)} style={{ background: "none", border: "none", cursor: "pointer", color: C.slate }}><Trash2 size={14} /></button>}
                        </div>
                      </td>
                    </tr>);
                })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function KPI({ label, value, tone, sub }) {
  return (
    <Card style={{ padding: 16 }}>
      <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: C.slate, fontWeight: 600 }}>{label}</div>
      <div style={{ ...archivo, fontSize: 26, fontWeight: 800, color: tone || C.steel, lineHeight: 1, marginTop: 6 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: C.slate, marginTop: 6 }}>{sub}</div>}
    </Card>
  );
}
