import React, { useEffect, useState, useCallback } from "react";
import { Ship, Plus, Trash2, Download, AlertCircle } from "lucide-react";
import { useAuth } from "../lib/auth";
import { fetchAll, insertRow, updateRow, deleteRow, logActivity } from "../lib/db";
import { C, isAdmin, canOperate, ESTADOS_EQUIPO, estadoLabel } from "../theme";
import {
  Card, PageHead, primaryBtn, ghostBtn, exportBtn, inputStyle, bluInput,
  thStyle, tdStyle, FilterBtn, Field, Empty, ErrorBanner, InlineSpinner,
} from "../ui";

// Tipo de niveles que se revisan en el prezarpe para este equipo
const NIVEL_TIPOS = [
  { value: "ninguno", label: "— No aplica" },
  { value: "aceite", label: "Solo aceite" },
  { value: "aceite_agua", label: "Aceite + agua chaqueta" },
];

export default function Equipos() {
  const { profile } = useAuth();
  const [embarcaciones, setEmbarcaciones] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filtro, setFiltro] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ embarcacion_id: "", id_visible: "", sistema: "", marca: "", modelo: "" });
  const puedeOperar = canOperate(profile?.rol);
  const puedeBorrar = isAdmin(profile?.rol);

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [embs, eqs] = await Promise.all([
        fetchAll("embarcaciones", { order: { col: "codigo", asc: true } }),
        fetchAll("equipos", { order: { col: "id_visible", asc: true } }),
      ]);
      setEmbarcaciones(embs);
      setEquipos(eqs);
      if (embs.length && !form.embarcacion_id) setForm((f) => ({ ...f, embarcacion_id: embs[0].id }));
    } catch (e) {
      setError("No se pudieron cargar los equipos. " + e.message);
    } finally { setLoading(false); }
  }, []); // eslint-disable-line

  useEffect(() => { cargar(); }, [cargar]);

  function embName(id) { return embarcaciones.find((e) => e.id === id)?.nombre || "—"; }
  function embColor(id) { return embarcaciones.find((e) => e.id === id)?.color || C.steel; }

  const lista = filtro === "all" ? equipos : equipos.filter((e) => e.embarcacion_id === filtro);

  async function agregar() {
    if (!form.embarcacion_id || !form.sistema.trim()) return;
    const emb = embarcaciones.find((e) => e.id === form.embarcacion_id);
    const idVis = form.id_visible.trim() || `${emb?.codigo || "EQ"}-${form.sistema.slice(0, 6).toUpperCase().replace(/\s/g, "")}`;
    try {
      const nuevo = await insertRow("equipos", profile.empresa_id, {
        embarcacion_id: form.embarcacion_id,
        id_visible: idVis,
        sistema: form.sistema.trim(),
        marca: form.marca.trim(),
        modelo: form.modelo.trim(),
        created_by: profile.id,
      });
      setEquipos((p) => [...p, nuevo]);
      logActivity(profile, "Crear equipo", `${idVis} · ${nuevo.sistema} (${emb?.nombre})`);
      setForm({ embarcacion_id: form.embarcacion_id, id_visible: "", sistema: "", marca: "", modelo: "" });
      setShowForm(false);
    } catch (e) {
      setError("No se pudo crear el equipo: " + e.message);
    }
  }

  // Cambio local inmediato
  function onChangeLocal(id, campo, valor) {
    setEquipos((p) => p.map((e) => (e.id === id ? { ...e, [campo]: valor } : e)));
  }
  // Persiste a la base (optimista con reversión)
  async function commit(id, campo, valor) {
    const previo = equipos.find((e) => e.id === id)?.[campo];
    if (previo === valor) return;
    onChangeLocal(id, campo, valor);
    try {
      await updateRow("equipos", id, { [campo]: valor });
    } catch (e) {
      onChangeLocal(id, campo, previo);
      setError("No se pudo guardar el cambio: " + e.message);
    }
  }

  async function eliminar(id) {
    const eq = equipos.find((e) => e.id === id);
    if (!window.confirm(`¿Eliminar el equipo "${eq?.sistema}"? Se borrarán también su criticidad, costos y planes asociados.`)) return;
    const respaldo = equipos;
    setEquipos((p) => p.filter((e) => e.id !== id));
    try {
      await deleteRow("equipos", id);
      logActivity(profile, "Eliminar equipo", `${eq?.id_visible} · ${eq?.sistema}`);
    } catch (e) {
      setEquipos(respaldo);
      setError("No se pudo eliminar: " + e.message);
    }
  }

  function exportar() {
    const filas = [["ID", "Embarcación", "Sistema", "Marca", "Modelo", "Horas Actuales", "Hrs Últ PM", "Estado"],
      ...equipos.map((e) => [e.id_visible, embName(e.embarcacion_id), e.sistema, e.marca, e.modelo, e.horas_actual, e.horas_ult_pm, estadoLabel(e.estado)])];
    const csv = filas.map((r) => r.map((c) => { const s = String(c ?? ""); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(";")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "equipos.csv"; a.click();
  }

  if (loading) return <div><PageHead kicker="Taxonomía ISO 14224" title="Registro de Equipos" /><Card><InlineSpinner label="Cargando equipos…" /></Card></div>;

  // Sin embarcaciones aún → no se pueden crear equipos
  if (!loading && embarcaciones.length === 0) {
    return (
      <div>
        <PageHead kicker="Taxonomía ISO 14224" title="Registro de Equipos" />
        <ErrorBanner onRetry={cargar}>{error}</ErrorBanner>
        <Card><Empty>
          <AlertCircle size={32} color={C.amber} style={{ marginBottom: 10 }} /><br />
          Primero debes registrar al menos una <strong>embarcación</strong>. Ve al módulo <strong>Embarcaciones</strong> y agrega tu flota; luego podrás cargar sus equipos aquí.
        </Empty></Card>
      </div>
    );
  }

  return (
    <div>
      <PageHead kicker="Taxonomía ISO 14224" title="Registro de Equipos"
        sub="ID y Sistema editables. Las horas alimentan el Plan Preventivo, la Criticidad y el Costo Global. Los datos están aislados por empresa."
        action={<div style={{ display: "flex", gap: 8 }}>
          <button onClick={exportar} style={exportBtn}><Download size={15} /> Exportar CSV</button>
          {puedeOperar && <button onClick={() => setShowForm(!showForm)} style={primaryBtn}><Plus size={16} /> Agregar Equipo</button>}
        </div>} />

      <ErrorBanner onRetry={cargar}>{error}</ErrorBanner>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <FilterBtn active={filtro === "all"} onClick={() => setFiltro("all")}>Todas ({equipos.length})</FilterBtn>
        {embarcaciones.map((v) => (
          <FilterBtn key={v.id} active={filtro === v.id} onClick={() => setFiltro(v.id)} color={v.color}>
            {v.nombre} ({equipos.filter((e) => e.embarcacion_id === v.id).length})
          </FilterBtn>
        ))}
      </div>

      {showForm && (
        <Card style={{ marginBottom: 16, background: C.mist }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: C.abyss, marginBottom: 14 }}>Nuevo Equipo</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12 }}>
            <Field label="Embarcación"><select value={form.embarcacion_id} onChange={(e) => setForm({ ...form, embarcacion_id: e.target.value })} style={inputStyle()}>{embarcaciones.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}</select></Field>
            <Field label="ID (opcional)"><input value={form.id_visible} onChange={(e) => setForm({ ...form, id_visible: e.target.value })} style={inputStyle()} placeholder="auto" /></Field>
            <Field label="Sistema / Equipo"><input value={form.sistema} onChange={(e) => setForm({ ...form, sistema: e.target.value })} style={inputStyle()} placeholder="Motor Principal" /></Field>
            <Field label="Marca"><input value={form.marca} onChange={(e) => setForm({ ...form, marca: e.target.value })} style={inputStyle()} /></Field>
            <Field label="Modelo"><input value={form.modelo} onChange={(e) => setForm({ ...form, modelo: e.target.value })} style={inputStyle()} /></Field>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button onClick={agregar} style={primaryBtn}>Guardar Equipo</button>
            <button onClick={() => setShowForm(false)} style={ghostBtn}>Cancelar</button>
          </div>
        </Card>
      )}

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 940 }}>
            <thead><tr>
              <th style={thStyle}>ID</th><th style={thStyle}>Embarcación</th><th style={thStyle}>Sistema / Equipo</th>
              <th style={thStyle}>Marca</th><th style={thStyle}>Modelo</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Horas Actuales</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Hrs Últ. PM</th>
              <th style={thStyle}>Estado</th>
              <th style={{ ...thStyle, textAlign: "center" }}>Prezarpe</th>
              <th style={thStyle}>Niveles</th>
              <th style={{ ...thStyle, textAlign: "center" }}>Cons. aceite</th>{puedeBorrar && <th style={thStyle}></th>}
            </tr></thead>
            <tbody>
              {lista.length === 0 ? <tr><td colSpan={puedeBorrar ? 12 : 11}><Empty>Sin equipos en este filtro.</Empty></td></tr> :
                lista.map((e) => (
                  <tr key={e.id}>
                    <td style={tdStyle}><input value={e.id_visible} disabled={!puedeOperar} onChange={(ev) => onChangeLocal(e.id, "id_visible", ev.target.value)} onBlur={(ev) => commit(e.id, "id_visible", ev.target.value)} style={{ ...bluInput, width: 120 }} /></td>
                    <td style={tdStyle}>
                      <select value={e.embarcacion_id} disabled={!puedeOperar} onChange={(ev) => commit(e.id, "embarcacion_id", ev.target.value)} style={{ ...inputStyle(140), fontWeight: 600, color: embColor(e.embarcacion_id) }}>
                        {embarcaciones.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
                      </select>
                    </td>
                    <td style={tdStyle}><input value={e.sistema} disabled={!puedeOperar} onChange={(ev) => onChangeLocal(e.id, "sistema", ev.target.value)} onBlur={(ev) => commit(e.id, "sistema", ev.target.value)} style={{ ...bluInput, width: 180, color: C.ink }} /></td>
                    <td style={tdStyle}><input value={e.marca || ""} disabled={!puedeOperar} onChange={(ev) => onChangeLocal(e.id, "marca", ev.target.value)} onBlur={(ev) => commit(e.id, "marca", ev.target.value)} style={inputStyle(90)} /></td>
                    <td style={tdStyle}><input value={e.modelo || ""} disabled={!puedeOperar} onChange={(ev) => onChangeLocal(e.id, "modelo", ev.target.value)} onBlur={(ev) => commit(e.id, "modelo", ev.target.value)} style={inputStyle(90)} /></td>
                    <td style={{ ...tdStyle, textAlign: "right" }}><input type="number" value={e.horas_actual} disabled={!puedeOperar} onChange={(ev) => onChangeLocal(e.id, "horas_actual", +ev.target.value)} onBlur={(ev) => commit(e.id, "horas_actual", +ev.target.value)} style={{ ...bluInput, width: 90, textAlign: "right" }} /></td>
                    <td style={{ ...tdStyle, textAlign: "right" }}><input type="number" value={e.horas_ult_pm} disabled={!puedeOperar} onChange={(ev) => onChangeLocal(e.id, "horas_ult_pm", +ev.target.value)} onBlur={(ev) => commit(e.id, "horas_ult_pm", +ev.target.value)} style={{ ...bluInput, width: 90, textAlign: "right" }} /></td>
                    <td style={tdStyle}>
                      <select value={e.estado} disabled={!puedeOperar} onChange={(ev) => commit(e.id, "estado", ev.target.value)} style={inputStyle(130)}>
                        {ESTADOS_EQUIPO.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      <input type="checkbox" checked={!!e.prezarpe} disabled={!puedeOperar}
                        onChange={(ev) => commit(e.id, "prezarpe", ev.target.checked)}
                        title="Incluir este equipo en la inspección de prezarpe"
                        style={{ width: 17, height: 17, cursor: puedeOperar ? "pointer" : "default", accentColor: C.steel }} />
                    </td>
                    <td style={tdStyle}>
                      <select value={e.nivel_tipo || "ninguno"} disabled={!puedeOperar} onChange={(ev) => commit(e.id, "nivel_tipo", ev.target.value)} style={inputStyle(170)}>
                        {NIVEL_TIPOS.map((n) => <option key={n.value} value={n.value}>{n.label}</option>)}
                      </select>
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      <input type="checkbox" checked={!!e.consume_aceite} disabled={!puedeOperar}
                        onChange={(ev) => commit(e.id, "consume_aceite", ev.target.checked)}
                        title="Este motor consume aceite de la tineta común (para repartir el consumo por horas)"
                        style={{ width: 17, height: 17, cursor: puedeOperar ? "pointer" : "default", accentColor: C.steel }} />
                    </td>
                    {puedeBorrar && <td style={tdStyle}><button onClick={() => eliminar(e.id)} style={{ background: "none", border: "none", cursor: "pointer", color: C.slate }}><Trash2 size={15} /></button></td>}
                  </tr>))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
