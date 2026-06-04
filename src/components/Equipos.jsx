import React, { useEffect, useState, useCallback } from "react";
import { Ship, Plus, Trash2, Download, AlertCircle, GitBranch } from "lucide-react";
import { useAuth } from "../lib/auth";
import { fetchAll, insertRow, updateRow, deleteRow, logActivity } from "../lib/db";
import { C, isAdmin, canOperate, ESTADOS_EQUIPO, estadoLabel } from "../theme";
import { buildEquipoTree } from "../lib/equipTree";
import {
  Card, PageHead, primaryBtn, ghostBtn, exportBtn, inputStyle, bluInput,
  thStyle, tdStyle, FilterBtn, Field, Empty, ErrorBanner, InlineSpinner,
} from "../ui";

// Tipo de niveles que se revisan en el prezarpe para este equipo
const NIVEL_TIPOS = [
  { value: "ninguno", label: "— No aplica" },
  { value: "aceite",  label: "Solo aceite" },
  { value: "aceite_agua", label: "Aceite + agua chaqueta" },
];


function blankForm(embId = "") {
  return { embarcacion_id: embId, id_visible: "", sistema: "", subsistema: "", marca: "", modelo: "", parent_id: "" };
}

export default function Equipos() {
  const { profile } = useAuth();
  const [embarcaciones, setEmbarcaciones] = useState([]);
  const [equipos, setEquipos]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [filtro, setFiltro]     = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState(blankForm());
  const puedeOperar = canOperate(profile?.rol);
  const puedeBorrar = isAdmin(profile?.rol);

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [embs, eqs] = await Promise.all([
        fetchAll("embarcaciones", { order: { col: "codigo", asc: true } }),
        fetchAll("equipos",       { order: { col: "id_visible", asc: true } }),
      ]);
      setEmbarcaciones(embs); setEquipos(eqs);
      if (embs.length && !form.embarcacion_id) setForm((f) => ({ ...f, embarcacion_id: embs[0].id }));
    } catch (e) { setError("No se pudieron cargar los equipos. " + e.message); }
    finally { setLoading(false); }
  }, []); // eslint-disable-line
  useEffect(() => { cargar(); }, [cargar]);

  function embName(id)  { return embarcaciones.find((e) => e.id === id)?.nombre || "—"; }
  function embColor(id) { return embarcaciones.find((e) => e.id === id)?.color  || C.steel; }
  function eqName(id)   { const e = equipos.find((q) => q.id === id); return e ? `${e.id_visible} · ${e.sistema}` : "—"; }

  // Lista en orden de árbol según filtro de nave
  const baseList = filtro === "all" ? equipos : equipos.filter((e) => e.embarcacion_id === filtro);
  const lista    = buildEquipoTree(baseList);

  // Padres disponibles para un equipo (misma nave, no él mismo ni sus hijos)
  function padresDisponibles(eqId, embId) {
    const candidatos = equipos.filter((e) => e.embarcacion_id === embId && e.id !== eqId);
    // Excluir descendientes del equipo actual (para no crear ciclos)
    const descendants = new Set();
    function markDesc(id) { equipos.filter((c) => c.parent_id === id).forEach((c) => { descendants.add(c.id); markDesc(c.id); }); }
    if (eqId) markDesc(eqId);
    return candidatos.filter((c) => !descendants.has(c.id));
  }

  async function agregar() {
    if (!form.embarcacion_id || !form.sistema.trim()) return;
    const emb   = embarcaciones.find((e) => e.id === form.embarcacion_id);
    const idVis = form.id_visible.trim() || `${emb?.codigo || "EQ"}-${form.sistema.slice(0, 6).toUpperCase().replace(/\s/g, "")}`;
    try {
      const nuevo = await insertRow("equipos", profile.empresa_id, {
        embarcacion_id: form.embarcacion_id,
        id_visible:     idVis,
        sistema:        form.sistema.trim(),
        marca:          form.marca.trim(),
        modelo:         form.modelo.trim(),
        parent_id:      form.parent_id || null,
        created_by:     profile.id,
      });
      setEquipos((p) => [...p, nuevo]);
      logActivity(profile, "Crear equipo", `${idVis} · ${nuevo.sistema}${form.parent_id ? ` (sub de ${eqName(form.parent_id)})` : ""} (${emb?.nombre})`);
      setForm(blankForm(form.embarcacion_id));
      setShowForm(false);
    } catch (e) { setError("No se pudo crear el equipo: " + e.message); }
  }

  function onChangeLocal(id, campo, valor) { setEquipos((p) => p.map((e) => e.id === id ? { ...e, [campo]: valor } : e)); }
  async function commit(id, campo, valor) {
    const previo = equipos.find((e) => e.id === id)?.[campo];
    if (previo === valor) return;
    onChangeLocal(id, campo, valor);
    try { await updateRow("equipos", id, { [campo]: valor }); }
    catch (e) { onChangeLocal(id, campo, previo); setError("No se pudo guardar el cambio: " + e.message); }
  }

  async function eliminar(id) {
    const eq = equipos.find((e) => e.id === id);
    const hijos = equipos.filter((e) => e.parent_id === id);
    const aviso = hijos.length > 0 ? `\n⚠️ Tiene ${hijos.length} subsistema(s) que quedarán como raíz.` : "";
    if (!window.confirm(`¿Eliminar el equipo "${eq?.sistema}"? Se borrarán también su criticidad, costos y planes asociados.${aviso}`)) return;
    const respaldo = equipos;
    setEquipos((p) => p.filter((e) => e.id !== id));
    try {
      await deleteRow("equipos", id);
      logActivity(profile, "Eliminar equipo", `${eq?.id_visible} · ${eq?.sistema}`);
    } catch (e) { setEquipos(respaldo); setError("No se pudo eliminar: " + e.message); }
  }

  function exportar() {
    const filas = [
      ["ID", "Embarcación", "Sistema padre", "Sistema / Equipo", "Marca", "Modelo", "Horas Actuales", "Hrs Últ PM", "Estado"],
      ...equipos.map((e) => [
        e.id_visible, embName(e.embarcacion_id),
        e.parent_id ? eqName(e.parent_id) : "",
        e.sistema, e.marca, e.modelo, e.horas_actual, e.horas_ult_pm, estadoLabel(e.estado),
      ]),
    ];
    const csv = filas.map((r) => r.map((c) => { const s = String(c ?? ""); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(";")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "equipos.csv"; a.click();
  }

  if (loading) return <div><PageHead kicker="Taxonomía ISO 14224" title="Registro de Equipos" /><Card><InlineSpinner label="Cargando equipos…" /></Card></div>;

  if (!loading && embarcaciones.length === 0) {
    return (
      <div>
        <PageHead kicker="Taxonomía ISO 14224" title="Registro de Equipos" />
        <ErrorBanner onRetry={cargar}>{error}</ErrorBanner>
        <Card><Empty>
          <AlertCircle size={32} color={C.amber} style={{ marginBottom: 10 }} /><br />
          Primero debes registrar al menos una <strong>embarcación</strong>. Ve al módulo <strong>Embarcaciones</strong> y agrega tu flota.
        </Empty></Card>
      </div>
    );
  }

  // Equipos de la nave seleccionada en el form (para el select de padre)
  const candidatosPadre = equipos.filter((e) => e.embarcacion_id === form.embarcacion_id);

  return (
    <div>
      <PageHead kicker="Taxonomía ISO 14224 · Jerarquía funcional" title="Registro de Equipos"
        sub="Estructura árbol: sistema raíz → subsistemas. Las horas alimentan el Plan Preventivo, Criticidad y Costo Global."
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
          <div style={{ fontWeight: 700, fontSize: 15, color: C.abyss, marginBottom: 14 }}>Nuevo Equipo / Subsistema</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 12 }}>
            <Field label="Embarcación">
              <select value={form.embarcacion_id}
                onChange={(e) => setForm({ ...form, embarcacion_id: e.target.value, parent_id: "" })}
                style={inputStyle()}>
                {embarcaciones.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
              </select>
            </Field>
            <Field label="Sistema padre (opcional — si es subsistema)">
              <select value={form.parent_id} onChange={(e) => setForm({ ...form, parent_id: e.target.value })} style={inputStyle()}>
                <option value="">— Ninguno (sistema raíz) —</option>
                {buildEquipoTree(candidatosPadre).map((eq) => (
                  <option key={eq.id} value={eq.id}>
                    {"　".repeat(eq.depth)}{eq.depth > 0 ? "└─ " : ""}{eq.id_visible} · {eq.sistema}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="ID visible (opcional)">
              <input value={form.id_visible} onChange={(e) => setForm({ ...form, id_visible: e.target.value })} style={inputStyle()} placeholder="auto" />
            </Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12 }}>
            <Field label="Sistema / Equipo">
              <input value={form.sistema} onChange={(e) => setForm({ ...form, sistema: e.target.value })} style={inputStyle()} placeholder="Motor Principal, Bomba Hidráulica…" />
            </Field>
            <Field label="Marca">
              <input value={form.marca} onChange={(e) => setForm({ ...form, marca: e.target.value })} style={inputStyle()} />
            </Field>
            <Field label="Modelo">
              <input value={form.modelo} onChange={(e) => setForm({ ...form, modelo: e.target.value })} style={inputStyle()} />
            </Field>
          </div>
          {form.parent_id && (
            <div style={{ marginTop: 10, padding: "8px 12px", background: `${C.cyan}14`, borderRadius: 7, fontSize: 12.5, color: C.steel }}>
              <GitBranch size={13} style={{ display: "inline", verticalAlign: "middle", marginRight: 5 }} />
              Subsistema de: <strong>{eqName(form.parent_id)}</strong>
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button onClick={agregar} style={primaryBtn}>Guardar</button>
            <button onClick={() => setShowForm(false)} style={ghostBtn}>Cancelar</button>
          </div>
        </Card>
      )}

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1060 }}>
            <thead><tr>
              <th style={thStyle}>ID</th>
              <th style={thStyle}>Nave</th>
              <th style={thStyle}>Sistema / Equipo</th>
              <th style={thStyle}>Subsistema de</th>
              <th style={thStyle}>Marca</th>
              <th style={thStyle}>Modelo</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Horas</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Hrs PM</th>
              <th style={thStyle}>Estado</th>
              <th style={{ ...thStyle, textAlign: "center" }}>Prezarpe</th>
              <th style={thStyle}>Niveles</th>
              <th style={{ ...thStyle, textAlign: "center" }}>Aceite</th>
              {puedeBorrar && <th style={thStyle}></th>}
            </tr></thead>
            <tbody>
              {lista.length === 0
                ? <tr><td colSpan={puedeBorrar ? 13 : 12}><Empty>Sin equipos en este filtro.</Empty></td></tr>
                : lista.map((e) => {
                  const padres = padresDisponibles(e.id, e.embarcacion_id);
                  return (
                    <tr key={e.id} style={{ background: e.depth > 0 ? "#FAFBFF" : undefined }}>

                      {/* ID */}
                      <td style={tdStyle}>
                        <input value={e.id_visible} disabled={!puedeOperar}
                          onChange={(ev) => onChangeLocal(e.id, "id_visible", ev.target.value)}
                          onBlur={(ev) => commit(e.id, "id_visible", ev.target.value)}
                          style={{ ...bluInput, width: 110 }} />
                      </td>

                      {/* Nave */}
                      <td style={tdStyle}>
                        <select value={e.embarcacion_id} disabled={!puedeOperar}
                          onChange={(ev) => commit(e.id, "embarcacion_id", ev.target.value)}
                          style={{ ...inputStyle(130), fontWeight: 600, color: embColor(e.embarcacion_id) }}>
                          {embarcaciones.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
                        </select>
                      </td>

                      {/* Sistema — con indentación de árbol */}
                      <td style={tdStyle}>
                        <div style={{ display: "flex", alignItems: "center" }}>
                          {e.depth > 0 && (
                            <span style={{ marginLeft: (e.depth - 1) * 14, marginRight: 5, color: C.slate, fontSize: 13, flexShrink: 0 }}>└─</span>
                          )}
                          <input value={e.sistema} disabled={!puedeOperar}
                            onChange={(ev) => onChangeLocal(e.id, "sistema", ev.target.value)}
                            onBlur={(ev) => commit(e.id, "sistema", ev.target.value)}
                            style={{ ...bluInput, width: Math.max(120, 180 - e.depth * 14), color: e.depth === 0 ? C.abyss : C.ink, fontWeight: e.depth === 0 ? 700 : 400 }} />
                        </div>
                      </td>

                      {/* Subsistema de (padre inline editable) */}
                      <td style={tdStyle}>
                        <select value={e.parent_id || ""} disabled={!puedeOperar}
                          onChange={(ev) => commit(e.id, "parent_id", ev.target.value || null)}
                          style={{ ...inputStyle(170), fontSize: 12, color: e.parent_id ? C.steel : C.line }}>
                          <option value="">— Raíz —</option>
                          {padres.map((p) => <option key={p.id} value={p.id}>{p.id_visible} · {p.sistema}</option>)}
                        </select>
                      </td>

                      {/* Marca / Modelo */}
                      <td style={tdStyle}><input value={e.marca || ""} disabled={!puedeOperar} onChange={(ev) => onChangeLocal(e.id, "marca", ev.target.value)} onBlur={(ev) => commit(e.id, "marca", ev.target.value)} style={inputStyle(85)} /></td>
                      <td style={tdStyle}><input value={e.modelo || ""} disabled={!puedeOperar} onChange={(ev) => onChangeLocal(e.id, "modelo", ev.target.value)} onBlur={(ev) => commit(e.id, "modelo", ev.target.value)} style={inputStyle(85)} /></td>

                      {/* Horas */}
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        <input type="number" value={e.horas_actual} disabled={!puedeOperar}
                          onChange={(ev) => onChangeLocal(e.id, "horas_actual", +ev.target.value)}
                          onBlur={(ev) => commit(e.id, "horas_actual", +ev.target.value)}
                          style={{ ...bluInput, width: 80, textAlign: "right" }} />
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        <input type="number" value={e.horas_ult_pm} disabled={!puedeOperar}
                          onChange={(ev) => onChangeLocal(e.id, "horas_ult_pm", +ev.target.value)}
                          onBlur={(ev) => commit(e.id, "horas_ult_pm", +ev.target.value)}
                          style={{ ...bluInput, width: 80, textAlign: "right" }} />
                      </td>

                      {/* Estado */}
                      <td style={tdStyle}>
                        <select value={e.estado} disabled={!puedeOperar}
                          onChange={(ev) => commit(e.id, "estado", ev.target.value)}
                          style={inputStyle(120)}>
                          {ESTADOS_EQUIPO.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                      </td>

                      {/* Prezarpe */}
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        <input type="checkbox" checked={!!e.prezarpe} disabled={!puedeOperar}
                          onChange={(ev) => commit(e.id, "prezarpe", ev.target.checked)}
                          title="Incluir en inspección de prezarpe"
                          style={{ width: 16, height: 16, cursor: puedeOperar ? "pointer" : "default", accentColor: C.steel }} />
                      </td>

                      {/* Niveles */}
                      <td style={tdStyle}>
                        <select value={e.nivel_tipo || "ninguno"} disabled={!puedeOperar}
                          onChange={(ev) => commit(e.id, "nivel_tipo", ev.target.value)}
                          style={inputStyle(155)}>
                          {NIVEL_TIPOS.map((n) => <option key={n.value} value={n.value}>{n.label}</option>)}
                        </select>
                      </td>

                      {/* Consume aceite */}
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        <input type="checkbox" checked={!!e.consume_aceite} disabled={!puedeOperar}
                          onChange={(ev) => commit(e.id, "consume_aceite", ev.target.checked)}
                          title="Consume aceite del motor (para repartir consumo por horas)"
                          style={{ width: 16, height: 16, cursor: puedeOperar ? "pointer" : "default", accentColor: C.steel }} />
                      </td>

                      {puedeBorrar && (
                        <td style={tdStyle}>
                          <button onClick={() => eliminar(e.id)} style={{ background: "none", border: "none", cursor: "pointer", color: C.slate }}>
                            <Trash2 size={15} />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
