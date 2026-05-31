import React, { useEffect, useState, useCallback } from "react";
import { ClipboardList, Plus, Trash2, Download, CloudOff, Clock } from "lucide-react";
import { useAuth } from "../lib/auth";
import { fetchAll, insertRow, deleteRow, logActivity } from "../lib/db";
import { useOnline, cacheTable, getCached, queueInsert, nuevoId } from "../lib/offline";
import { C, clp, num, isAdmin, canOperate, TIPOS_OT, PRIORIDADES, ESTADOS_OT, lk, tn } from "../theme";
import {
  Card, PageHead, Pill, primaryBtn, ghostBtn, exportBtn, inputStyle, bluInput,
  thStyle, tdStyle, FilterBtn, Field, Empty, ErrorBanner, InlineSpinner,
} from "../ui";

const HOY = () => new Date().toISOString().slice(0, 10);

export default function OrdenesTrabajo() {
  const { profile } = useAuth();
  const online = useOnline();
  const [embarcaciones, setEmbarcaciones] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [ots, setOts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [usandoCache, setUsandoCache] = useState(false);
  const [filtro, setFiltro] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blank());
  const puedeOperar = canOperate(profile?.rol);
  const puedeBorrar = isAdmin(profile?.rol);

  function blank() {
    return { embarcacion_id: "", equipo_id: "", sistema: "", tipo: "preventivo", prioridad: "media",
      estado: "solicitada", fecha: HOY(), descripcion: "", mttr_horas: 0, hrs_oper_desde: 0, costo_mo: 0, costo_mat: 0 };
  }

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [embs, eqs, o] = await Promise.all([
        fetchAll("embarcaciones", { order: { col: "codigo", asc: true } }),
        fetchAll("equipos", { order: { col: "id_visible", asc: true } }),
        fetchAll("ordenes_trabajo", { order: { col: "fecha", asc: false } }),
      ]);
      setEmbarcaciones(embs); setEquipos(eqs); setOts(o);
      setUsandoCache(false);
      // Guarda copia local para poder trabajar sin señal
      cacheTable("embarcaciones", embs); cacheTable("equipos", eqs); cacheTable("ordenes_trabajo", o);
    } catch (e) {
      // Sin señal o error de red → trabajamos con la última copia local
      const [embs, eqs, o] = await Promise.all([
        getCached("embarcaciones"), getCached("equipos"), getCached("ordenes_trabajo"),
      ]);
      setEmbarcaciones(embs); setEquipos(eqs); setOts(o); setUsandoCache(true);
      if (embs.length === 0 && o.length === 0) setError("No se pudieron cargar las órdenes y no hay copia local. Conéctate al menos una vez para guardar los datos.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // Cuando el outbox se vacía (volvió la señal y subió todo), recargamos del servidor.
  useEffect(() => {
    const onSynced = () => cargar();
    window.addEventListener("cmms-synced", onSynced);
    return () => window.removeEventListener("cmms-synced", onSynced);
  }, [cargar]);

  function embName(id) { return embarcaciones.find((e) => e.id === id)?.nombre || "—"; }
  const equiposDeNave = form.embarcacion_id ? equipos.filter((e) => e.embarcacion_id === form.embarcacion_id) : [];

  const lista = filtro === "all" ? ots
    : ["solicitada", "planificada", "programada", "en_ejecucion", "cerrada"].includes(filtro)
      ? ots.filter((o) => o.estado === filtro)
      : ots.filter((o) => o.embarcacion_id === filtro);

  // KPIs rápidos
  const abiertas = ots.filter((o) => o.estado !== "cerrada").length;
  const costoTotal = ots.reduce((s, o) => s + (o.costo_mo || 0) + (o.costo_mat || 0), 0);
  const preventivas = ots.filter((o) => o.tipo === "preventivo").length;
  const propProactivo = ots.length ? Math.round((preventivas / ots.length) * 100) : 0;

  async function crear() {
    if (!form.descripcion.trim() || !form.embarcacion_id) { setError("Indica al menos la embarcación y una descripción."); return; }
    const id = nuevoId();
    const fila = {
      id,
      folio: online ? `OT-${String(ots.length + 1).padStart(3, "0")}` : `OT-S/N-${new Date().toISOString().slice(5, 16).replace("T", "-").replace(":", "")}`,
      empresa_id: profile.empresa_id,
      embarcacion_id: form.embarcacion_id,
      equipo_id: form.equipo_id || null,
      sistema: form.sistema.trim(),
      tipo: form.tipo, prioridad: form.prioridad, estado: form.estado,
      descripcion: form.descripcion.trim(), fecha: form.fecha,
      mttr_horas: form.mttr_horas, hrs_oper_desde: form.hrs_oper_desde,
      costo_mo: form.costo_mo, costo_mat: form.costo_mat,
      created_by: profile.id,
    };

    if (online) {
      try {
        const { empresa_id, ...resto } = fila;
        const nueva = await insertRow("ordenes_trabajo", profile.empresa_id, resto);
        setOts((p) => [nueva, ...p]);
        logActivity(profile, "Crear OT", `${fila.folio} · ${embName(form.embarcacion_id)} · ${lk(TIPOS_OT, form.tipo)} · ${form.descripcion}`);
        setForm(blank()); setShowForm(false); setError(null);
      } catch (e) { setError("No se pudo crear la OT: " + e.message); }
    } else {
      // Sin señal: a la cola. Sube sola al recuperar conexión.
      await queueInsert("ordenes_trabajo", fila, `OT ${embName(form.embarcacion_id)} · ${form.descripcion}`);
      setOts((p) => [{ ...fila, _pending: true }, ...p]);
      setForm(blank()); setShowForm(false); setError(null);
    }
  }

  async function eliminar(id) {
    const ot = ots.find((o) => o.id === id);
    if (!window.confirm(`¿Eliminar la orden ${ot?.folio}?`)) return;
    const respaldo = ots;
    setOts((p) => p.filter((o) => o.id !== id));
    try { await deleteRow("ordenes_trabajo", id); logActivity(profile, "Eliminar OT", ot?.folio || id); }
    catch (e) { setOts(respaldo); setError("No se pudo eliminar: " + e.message); }
  }

  function exportar() {
    const filas = [["Folio", "Fecha", "Embarcación", "Sistema", "Tipo", "Prioridad", "Descripción", "MTTR", "Costo MO", "Costo Mat", "Estado"],
      ...ots.map((o) => [o.folio, o.fecha, embName(o.embarcacion_id), o.sistema, lk(TIPOS_OT, o.tipo), lk(PRIORIDADES, o.prioridad), o.descripcion, o.mttr_horas, o.costo_mo, o.costo_mat, lk(ESTADOS_OT, o.estado)])];
    const csv = filas.map((r) => r.map((c) => { const s = String(c ?? ""); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(";")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "ordenes_trabajo.csv"; a.click();
  }

  if (loading) return <div><PageHead kicker="Nivel Operativo" title="Órdenes de Trabajo" /><Card><InlineSpinner label="Cargando órdenes…" /></Card></div>;

  return (
    <div>
      <PageHead kicker="Nivel Operativo · Libbrecht" title="Órdenes de Trabajo"
        sub="Flujo: Solicitada → Planificada → Programada → En ejecución → Cerrada. Registra costos, MTTR y horas de operación."
        action={<div style={{ display: "flex", gap: 8 }}>
          <button onClick={exportar} style={exportBtn}><Download size={15} /> Exportar</button>
          {puedeOperar && <button onClick={() => { setShowForm(!showForm); setError(null); }} style={primaryBtn}><Plus size={16} /> Nueva OT</button>}
        </div>} />

      <ErrorBanner onRetry={cargar}>{error}</ErrorBanner>

      {(!online || usandoCache) && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: C.yellowBg, border: `1px solid ${C.amber}`, color: "#7a5b00", padding: "10px 14px", borderRadius: 10, marginBottom: 14, fontSize: 13 }}>
          <CloudOff size={17} />
          <span>
            {online
              ? "Mostrando la última copia guardada en este dispositivo."
              : "Sin conexión. Puedes crear OTs igual: quedarán en este dispositivo y se subirán solas al recuperar señal."}
          </span>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 16 }}>
        <MiniStat label="OTs Totales" value={ots.length} sub={`${abiertas} abiertas`} />
        <MiniStat label="Abiertas" value={abiertas} tone={abiertas ? C.yellow : C.green} />
        <MiniStat label="Proactivo" value={`${propProactivo}%`} tone={propProactivo >= 60 ? C.green : C.yellow} sub={`${preventivas} preventivas`} />
        <MiniStat label="Costo Total" value={clp(costoTotal)} tone={C.gold} />
      </div>

      {showForm && (
        <Card style={{ marginBottom: 16, background: C.mist }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: C.abyss, marginBottom: 14 }}>Nueva Orden de Trabajo</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
            <Field label="Embarcación">
              <select value={form.embarcacion_id} onChange={(e) => setForm({ ...form, embarcacion_id: e.target.value, equipo_id: "" })} style={inputStyle()}>
                <option value="">— Selecciona —</option>
                {embarcaciones.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
              </select>
            </Field>
            <Field label="Equipo (opcional)">
              <select value={form.equipo_id} disabled={!form.embarcacion_id} onChange={(e) => {
                const eq = equipos.find((x) => x.id === e.target.value);
                setForm({ ...form, equipo_id: e.target.value, sistema: eq?.sistema || form.sistema });
              }} style={inputStyle()}>
                <option value="">— Ninguno —</option>
                {equiposDeNave.map((eq) => <option key={eq.id} value={eq.id}>{eq.id_visible} · {eq.sistema}</option>)}
              </select>
            </Field>
            <Field label="Sistema"><input value={form.sistema} onChange={(e) => setForm({ ...form, sistema: e.target.value })} style={inputStyle()} placeholder="Motor Principal" /></Field>
            <Field label="Fecha"><input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} style={inputStyle()} /></Field>

            <Field label="Tipo"><select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} style={inputStyle()}>{TIPOS_OT.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></Field>
            <Field label="Prioridad"><select value={form.prioridad} onChange={(e) => setForm({ ...form, prioridad: e.target.value })} style={inputStyle()}>{PRIORIDADES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></Field>
            <Field label="Estado"><select value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })} style={inputStyle()}>{ESTADOS_OT.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></Field>
            <Field label="MTTR (hrs paro)"><input type="number" value={form.mttr_horas} onChange={(e) => setForm({ ...form, mttr_horas: +e.target.value })} style={bluInput} /></Field>

            <Field label="Descripción" span={2}><input value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} style={inputStyle()} placeholder="Trabajo a realizar" /></Field>
            <Field label="Costo MO ($)"><input type="number" value={form.costo_mo} onChange={(e) => setForm({ ...form, costo_mo: +e.target.value })} style={bluInput} /></Field>
            <Field label="Costo Mat. ($)"><input type="number" value={form.costo_mat} onChange={(e) => setForm({ ...form, costo_mat: +e.target.value })} style={bluInput} /></Field>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button onClick={crear} style={primaryBtn}>Guardar OT</button>
            <button onClick={() => { setShowForm(false); setError(null); }} style={ghostBtn}>Cancelar</button>
          </div>
        </Card>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <FilterBtn active={filtro === "all"} onClick={() => setFiltro("all")}>Todas ({ots.length})</FilterBtn>
        {ESTADOS_OT.map((s) => {
          const n = ots.filter((o) => o.estado === s.value).length;
          return <FilterBtn key={s.value} active={filtro === s.value} onClick={() => setFiltro(s.value)}>{s.label} ({n})</FilterBtn>;
        })}
      </div>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 960 }}>
            <thead><tr>
              <th style={thStyle}>Folio</th><th style={thStyle}>Fecha</th><th style={thStyle}>Embarcación</th>
              <th style={thStyle}>Sistema</th><th style={thStyle}>Tipo</th><th style={thStyle}>Prioridad</th>
              <th style={thStyle}>Descripción</th><th style={{ ...thStyle, textAlign: "right" }}>Costo</th>
              <th style={thStyle}>Estado</th>{puedeBorrar && <th style={thStyle}></th>}
            </tr></thead>
            <tbody>
              {lista.length === 0 ? <tr><td colSpan={puedeBorrar ? 10 : 9}><Empty>Sin órdenes en este filtro.</Empty></td></tr> :
                lista.map((o) => (
                  <tr key={o.id} style={o._pending ? { background: C.yellowBg } : undefined}>
                    <td style={{ ...tdStyle, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, color: C.steel }}>
                      {o.folio}
                      {o._pending && <span title="Pendiente de sincronizar" style={{ display: "inline-flex", alignItems: "center", gap: 3, marginLeft: 6, fontSize: 10, fontFamily: "'Archivo',sans-serif", fontWeight: 700, color: "#7a5b00", background: C.amber, padding: "1px 6px", borderRadius: 20 }}><Clock size={9} /> Pendiente</span>}
                    </td>
                    <td style={{ ...tdStyle, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>{o.fecha}</td>
                    <td style={tdStyle}>{embName(o.embarcacion_id)}</td>
                    <td style={tdStyle}>{o.sistema}</td>
                    <td style={tdStyle}><Pill tone={tn(TIPOS_OT, o.tipo)}>{lk(TIPOS_OT, o.tipo)}</Pill></td>
                    <td style={tdStyle}><Pill tone={tn(PRIORIDADES, o.prioridad)}>{lk(PRIORIDADES, o.prioridad)}</Pill></td>
                    <td style={{ ...tdStyle, maxWidth: 220 }}>{o.descripcion}</td>
                    <td style={{ ...tdStyle, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>{clp((o.costo_mo || 0) + (o.costo_mat || 0))}</td>
                    <td style={tdStyle}><Pill tone={tn(ESTADOS_OT, o.estado)}>{lk(ESTADOS_OT, o.estado)}</Pill></td>
                    {puedeBorrar && <td style={tdStyle}>{!o._pending && <button onClick={() => eliminar(o.id)} style={{ background: "none", border: "none", cursor: "pointer", color: C.slate }}><Trash2 size={15} /></button>}</td>}
                  </tr>))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function MiniStat({ label, value, unit, tone, sub }) {
  return (
    <Card style={{ padding: 16 }}>
      <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: C.slate, fontWeight: 600 }}>{label}</div>
      <div style={{ fontFamily: "'Archivo', sans-serif", fontSize: 26, fontWeight: 800, color: tone || C.steel, lineHeight: 1, marginTop: 8 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: C.slate, marginTop: 6 }}>{sub}</div>}
    </Card>
  );
}
