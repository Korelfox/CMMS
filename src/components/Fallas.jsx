import React, { useEffect, useState, useCallback } from "react";
import { AlertTriangle, Plus, Trash2, Download } from "lucide-react";
import { useAuth } from "../lib/auth";
import { fetchAll, insertRow, updateRow, deleteRow, logActivity } from "../lib/db";
import { C, archivo, isAdmin, canOperate } from "../theme";
import {
  Card, PageHead, Pill, primaryBtn, ghostBtn, exportBtn, inputStyle, bluInput,
  thStyle, tdStyle, FilterBtn, Field, Empty, ErrorBanner, InlineSpinner,
} from "../ui";

const HOY = () => new Date().toISOString().slice(0, 10);
// RPN = S × O × D, en escala 1-10 cada dimensión (rango 1-1000)
const rpn = (f) => (f.severidad || 0) * (f.ocurrencia || 0) * (f.deteccion || 0);
const nivelRPN = (r) =>
  r >= 200 ? ["red", "Crítico"] :
  r >= 125 ? ["red", "Alto"] :
  r >= 50  ? ["yellow", "Medio"] :
             ["green", "Bajo"];

export default function Fallas() {
  const { profile } = useAuth();
  const [embarcaciones, setEmbarcaciones] = useState([]);
  const [fallas, setFallas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filtro, setFiltro] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blank());
  const puedeOperar = canOperate(profile?.rol);
  const puedeBorrar = isAdmin(profile?.rol);

  function blank() {
    return { embarcacion_id: "", sistema: "", modo: "", causa: "", severidad: 5, ocurrencia: 3, deteccion: 3, accion: "", fecha: HOY() };
  }

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [embs, fs] = await Promise.all([
        fetchAll("embarcaciones", { order: { col: "codigo", asc: true } }),
        fetchAll("fallas", { order: { col: "fecha", asc: false } }),
      ]);
      setEmbarcaciones(embs); setFallas(fs);
    } catch (e) { setError("No se pudo cargar el análisis de fallas. " + e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  function embName(id) { return embarcaciones.find((e) => e.id === id)?.nombre || "—"; }

  async function crear() {
    if (!form.sistema.trim() || !form.modo.trim()) { setError("Sistema y modo de falla son obligatorios."); return; }
    try {
      const nueva = await insertRow("fallas", profile.empresa_id, {
        embarcacion_id: form.embarcacion_id || null,
        sistema: form.sistema.trim(), modo: form.modo.trim(), causa: form.causa.trim(),
        severidad: form.severidad, ocurrencia: form.ocurrencia, deteccion: form.deteccion,
        accion: form.accion.trim(), fecha: form.fecha, created_by: profile.id,
      });
      setFallas((p) => [nueva, ...p]);
      logActivity(profile, "Crear análisis FMECA", `${nueva.sistema} · ${nueva.modo} (RPN ${rpn(nueva)})`);
      setForm(blank()); setShowForm(false);
    } catch (e) { setError("No se pudo crear: " + e.message); }
  }

  function onChangeLocal(id, c, v) { setFallas((p) => p.map((f) => (f.id === id ? { ...f, [c]: v } : f))); }
  async function commit(id, c, v) {
    const previo = fallas.find((f) => f.id === id)?.[c]; if (previo === v) return;
    onChangeLocal(id, c, v);
    try { await updateRow("fallas", id, { [c]: v }); }
    catch (e) { onChangeLocal(id, c, previo); setError("No se pudo guardar: " + e.message); }
  }

  async function eliminar(id) {
    const f = fallas.find((x) => x.id === id);
    if (!window.confirm(`¿Eliminar el análisis "${f?.modo}"?`)) return;
    const respaldo = fallas;
    setFallas((p) => p.filter((x) => x.id !== id));
    try { await deleteRow("fallas", id); logActivity(profile, "Eliminar FMECA", `${f?.sistema} · ${f?.modo}`); }
    catch (e) { setFallas(respaldo); setError("No se pudo eliminar: " + e.message); }
  }

  function exportar() {
    const filas = [["Fecha", "Embarcación", "Sistema", "Modo de falla", "Causa", "S", "O", "D", "RPN", "Nivel", "Acción"],
      ...fallas.map((f) => [f.fecha, embName(f.embarcacion_id), f.sistema, f.modo, f.causa, f.severidad, f.ocurrencia, f.deteccion, rpn(f), nivelRPN(rpn(f))[1], f.accion])];
    const csv = filas.map((r) => r.map((c) => { const s = String(c ?? ""); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(";")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "fmeca.csv"; a.click();
  }

  const lista = (filtro === "all" ? fallas : fallas.filter((f) => f.embarcacion_id === filtro))
    .map((f) => ({ ...f, _rpn: rpn(f) }))
    .sort((a, b) => b._rpn - a._rpn);

  const criticas = lista.filter((x) => x._rpn >= 200).length;
  const altas = lista.filter((x) => x._rpn >= 125 && x._rpn < 200).length;
  const rpnProm = lista.length ? Math.round(lista.reduce((s, x) => s + x._rpn, 0) / lista.length) : 0;

  if (loading) return <div><PageHead kicker="Análisis · FMECA" title="Análisis de Modos de Falla" /><Card><InlineSpinner label="Cargando análisis…" /></Card></div>;

  return (
    <div>
      <PageHead kicker="FMECA · Mora Gutiérrez (RPN)" title="Análisis de Modos de Falla"
        sub="RPN = Severidad × Ocurrencia × Detección. Cada dimensión 1–10. Identifica los riesgos que merecen acción preventiva o rediseño."
        action={<div style={{ display: "flex", gap: 8 }}>
          <button onClick={exportar} style={exportBtn}><Download size={15} /> Exportar</button>
          {puedeOperar && <button onClick={() => { setShowForm(!showForm); setError(null); }} style={primaryBtn}><Plus size={16} /> Nuevo Análisis</button>}
        </div>} />

      <ErrorBanner onRetry={cargar}>{error}</ErrorBanner>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 16 }}>
        <KPI label="Modos Analizados" value={fallas.length} />
        <KPI label="Críticos" value={criticas} tone={criticas ? C.red : C.green} sub="RPN ≥ 200" />
        <KPI label="Alto Riesgo" value={altas} tone={altas ? C.amber : C.green} sub="RPN 125–199" />
        <KPI label="RPN Promedio" value={rpnProm} tone={nivelRPN(rpnProm)[0] === "red" ? C.red : nivelRPN(rpnProm)[0] === "yellow" ? C.amber : C.green} sub={nivelRPN(rpnProm)[1]} />
      </div>

      {showForm && (
        <Card style={{ marginBottom: 16, background: C.mist }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: C.abyss, marginBottom: 14 }}>Nuevo Análisis de Modo de Falla</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
            <Field label="Embarcación">
              <select value={form.embarcacion_id} onChange={(e) => setForm({ ...form, embarcacion_id: e.target.value })} style={inputStyle()}>
                <option value="">— Sin asignar —</option>
                {embarcaciones.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
              </select>
            </Field>
            <Field label="Sistema"><input value={form.sistema} onChange={(e) => setForm({ ...form, sistema: e.target.value })} style={inputStyle()} placeholder="Motor Principal" /></Field>
            <Field label="Modo de falla" span={2}><input value={form.modo} onChange={(e) => setForm({ ...form, modo: e.target.value })} style={inputStyle()} placeholder="Sobrecalentamiento" /></Field>
            <Field label="Causa" span={2}><input value={form.causa} onChange={(e) => setForm({ ...form, causa: e.target.value })} style={inputStyle()} placeholder="Bomba de agua dañada" /></Field>
            <Field label="Severidad (1-10)"><input type="number" min={1} max={10} value={form.severidad} onChange={(e) => setForm({ ...form, severidad: Math.max(1, Math.min(10, +e.target.value)) })} style={bluInput} /></Field>
            <Field label="Ocurrencia (1-10)"><input type="number" min={1} max={10} value={form.ocurrencia} onChange={(e) => setForm({ ...form, ocurrencia: Math.max(1, Math.min(10, +e.target.value)) })} style={bluInput} /></Field>
            <Field label="Detección (1-10)"><input type="number" min={1} max={10} value={form.deteccion} onChange={(e) => setForm({ ...form, deteccion: Math.max(1, Math.min(10, +e.target.value)) })} style={bluInput} /></Field>
            <Field label="Fecha"><input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} style={inputStyle()} /></Field>
            <Field label="Acción recomendada" span={4}><input value={form.accion} onChange={(e) => setForm({ ...form, accion: e.target.value })} style={inputStyle()} placeholder="Inspección semanal de bomba y termostato" /></Field>
          </div>
          <div style={{ marginTop: 12, padding: "10px 14px", background: "#fff", borderRadius: 8, fontSize: 13, color: C.slate }}>
            RPN calculado: <strong style={{ color: C.steel, fontSize: 16, fontFamily: "'IBM Plex Mono', monospace" }}>{form.severidad * form.ocurrencia * form.deteccion}</strong>
            <span style={{ marginLeft: 10 }}><Pill tone={nivelRPN(form.severidad * form.ocurrencia * form.deteccion)[0]}>{nivelRPN(form.severidad * form.ocurrencia * form.deteccion)[1]}</Pill></span>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button onClick={crear} style={primaryBtn}>Guardar análisis</button>
            <button onClick={() => { setShowForm(false); setError(null); }} style={ghostBtn}>Cancelar</button>
          </div>
        </Card>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <FilterBtn active={filtro === "all"} onClick={() => setFiltro("all")}>Todas ({fallas.length})</FilterBtn>
        {embarcaciones.map((v) => (
          <FilterBtn key={v.id} active={filtro === v.id} onClick={() => setFiltro(v.id)} color={v.color}>
            {v.nombre} ({fallas.filter((f) => f.embarcacion_id === v.id).length})
          </FilterBtn>
        ))}
      </div>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1060 }}>
            <thead><tr>
              <th style={thStyle}>Fecha</th><th style={thStyle}>Embarcación</th><th style={thStyle}>Sistema</th>
              <th style={thStyle}>Modo de Falla</th><th style={thStyle}>Causa</th>
              <th style={{ ...thStyle, textAlign: "center" }} title="Severidad">S</th>
              <th style={{ ...thStyle, textAlign: "center" }} title="Ocurrencia">O</th>
              <th style={{ ...thStyle, textAlign: "center" }} title="Detección">D</th>
              <th style={{ ...thStyle, textAlign: "right" }}>RPN</th>
              <th style={{ ...thStyle, textAlign: "center" }}>Nivel</th>
              <th style={thStyle}>Acción</th>{puedeBorrar && <th style={thStyle}></th>}
            </tr></thead>
            <tbody>
              {lista.length === 0 ? <tr><td colSpan={puedeBorrar ? 12 : 11}><Empty>Sin análisis registrados. Documenta los modos de falla para empezar a priorizar acciones preventivas.</Empty></td></tr> :
                lista.map((f) => {
                  const [tone, label] = nivelRPN(f._rpn);
                  return (
                    <tr key={f.id}>
                      <td style={{ ...tdStyle, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>{f.fecha}</td>
                      <td style={tdStyle}>{embName(f.embarcacion_id)}</td>
                      <td style={tdStyle}><input value={f.sistema} disabled={!puedeOperar} onChange={(e) => onChangeLocal(f.id, "sistema", e.target.value)} onBlur={(e) => commit(f.id, "sistema", e.target.value)} style={inputStyle(130)} /></td>
                      <td style={tdStyle}><input value={f.modo} disabled={!puedeOperar} onChange={(e) => onChangeLocal(f.id, "modo", e.target.value)} onBlur={(e) => commit(f.id, "modo", e.target.value)} style={inputStyle(160)} /></td>
                      <td style={tdStyle}><input value={f.causa || ""} disabled={!puedeOperar} onChange={(e) => onChangeLocal(f.id, "causa", e.target.value)} onBlur={(e) => commit(f.id, "causa", e.target.value)} style={inputStyle(170)} /></td>
                      <td style={{ ...tdStyle, textAlign: "center" }}><input type="number" min={1} max={10} value={f.severidad} disabled={!puedeOperar} onChange={(e) => onChangeLocal(f.id, "severidad", +e.target.value)} onBlur={(e) => commit(f.id, "severidad", Math.max(1, Math.min(10, +e.target.value)))} style={{ ...bluInput, width: 50, textAlign: "center" }} /></td>
                      <td style={{ ...tdStyle, textAlign: "center" }}><input type="number" min={1} max={10} value={f.ocurrencia} disabled={!puedeOperar} onChange={(e) => onChangeLocal(f.id, "ocurrencia", +e.target.value)} onBlur={(e) => commit(f.id, "ocurrencia", Math.max(1, Math.min(10, +e.target.value)))} style={{ ...bluInput, width: 50, textAlign: "center" }} /></td>
                      <td style={{ ...tdStyle, textAlign: "center" }}><input type="number" min={1} max={10} value={f.deteccion} disabled={!puedeOperar} onChange={(e) => onChangeLocal(f.id, "deteccion", +e.target.value)} onBlur={(e) => commit(f.id, "deteccion", Math.max(1, Math.min(10, +e.target.value)))} style={{ ...bluInput, width: 50, textAlign: "center" }} /></td>
                      <td style={{ ...tdStyle, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700 }}>{f._rpn}</td>
                      <td style={{ ...tdStyle, textAlign: "center" }}><Pill tone={tone}>{label}</Pill></td>
                      <td style={{ ...tdStyle, maxWidth: 220 }}><input value={f.accion || ""} disabled={!puedeOperar} onChange={(e) => onChangeLocal(f.id, "accion", e.target.value)} onBlur={(e) => commit(f.id, "accion", e.target.value)} style={inputStyle(180)} /></td>
                      {puedeBorrar && <td style={tdStyle}><button onClick={() => eliminar(f.id)} style={{ background: "none", border: "none", cursor: "pointer", color: C.slate }}><Trash2 size={15} /></button></td>}
                    </tr>);
                })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card style={{ marginTop: 16, background: C.mist }}>
        <div style={{ fontSize: 12.5, color: C.slate, lineHeight: 1.7 }}>
          <strong style={{ color: C.ink }}>Escala FMECA (1–10):</strong>{" "}
          <strong>Severidad</strong>: 1 = sin efecto, 10 = catastrófico (peligro vida o pérdida total).{" "}
          <strong>Ocurrencia</strong>: 1 = improbable, 10 = casi seguro.{" "}
          <strong>Detección</strong>: 1 = se detecta seguro antes de la falla, 10 = invisible hasta que falla.
          <br /><strong style={{ color: C.ink }}>Umbrales típicos:</strong>{" "}
          <Pill tone="green">Bajo</Pill> RPN &lt; 50 ·{" "}
          <Pill tone="yellow">Medio</Pill> 50–124 ·{" "}
          <Pill tone="red">Alto</Pill> 125–199 ·{" "}
          <Pill tone="red">Crítico</Pill> ≥ 200 (requiere acción inmediata)
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
