import React, { useState, useMemo, useEffect } from "react";
import { Fish, Plus, Trash2, Settings, BookOpen, ChevronDown, ChevronRight, Check, LayoutDashboard, Download, ExternalLink, Fuel } from "lucide-react";
import { ComposedChart, Bar, Line, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, Legend } from "recharts";
import { insertRow, updateRow, deleteRow, upsertRow, logActivity } from "../../lib/db";
import { C, archivo, clp, num, isAdmin, canOperate, tint } from "../../theme";
import { Card, Pill, FilterBtn, primaryBtn, ghostBtn, inputStyle, bluInput, thStyle, tdStyle, Field, Empty, GuiaColapsable } from "../../ui";


const ESPECIES_CL = [
  "Merluza común","Merluza del sur","Merluza de cola","Jibia","Reineta",
  "Congrio dorado","Congrio colorado","Congrio negro","Albacora / Pez espada",
  "Atún","Jurel","Caballa","Sardina","Anchoveta","Salmón","Trucha",
  "Langostino colorado","Langostino amarillo","Camarón nailon","Camarón de roca",
  "Pulpo","Jaiba","Centolla","Loco","Erizo","Macha","Chorito",
];

export default function TabEspecies({ profile, especies, setEspecies, setError }) {
  const puedeOperar = canOperate(profile?.rol);
  const puedeBorrar = isAdmin(profile?.rol);
  const [form, setForm]         = useState({ nombre: "", precio_kg_default: 0 });
  const [showForm, setShowForm] = useState(false);

  async function crear() {
    if (!form.nombre.trim()) return;
    try {
      const nueva = await insertRow("especies", profile.empresa_id, {
        nombre: form.nombre.trim(), precio_kg_default: +form.precio_kg_default, activa: true,
      });
      setEspecies((p) => [...p, nueva]);
      logActivity(profile, "Crear especie", nueva.nombre);
      setForm({ nombre: "", precio_kg_default: 0 }); setShowForm(false);
    } catch (e) {
      setError(e.message.includes("duplicate") ? `Ya existe "${form.nombre}".` : "No se pudo crear: " + e.message);
    }
  }

  async function commitEsp(id, campo, val) {
    const prev = especies.find((e) => e.id === id)?.[campo];
    if (prev === val) return;
    setEspecies((p) => p.map((e) => e.id === id ? { ...e, [campo]: val } : e));
    try { await updateRow("especies", id, { [campo]: val }); }
    catch (e) { setEspecies((p) => p.map((e2) => e2.id === id ? { ...e2, [campo]: prev } : e2)); setError("Error al guardar: " + e.message); }
  }

  async function eliminarEsp(id) {
    const esp = especies.find((e) => e.id === id);
    if (!window.confirm(`¿Eliminar "${esp?.nombre}"?`)) return;
    const bk = especies;
    setEspecies((p) => p.filter((e) => e.id !== id));
    try { await deleteRow("especies", id); }
    catch (e) { setEspecies(bk); setError("No se pudo eliminar: " + e.message); }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: C.slate }}>{especies.length} especie{especies.length !== 1 && "s"} — los precios se pre-llenan al registrar capturas.</div>
        {puedeOperar && <button onClick={() => setShowForm(!showForm)} style={primaryBtn}><Plus size={15} /> Agregar especie</button>}
      </div>

      {showForm && (
        <Card style={{ marginBottom: 14, background: tint(C.steel, 6) }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr auto auto", gap: 12, alignItems: "flex-end" }}>
            <Field label="Nombre de la especie">
              <input value={form.nombre} list="esp-sugeridas"
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                style={inputStyle()} placeholder="Merluza, Jibia, Reineta…" />
              <datalist id="esp-sugeridas">{ESPECIES_CL.map((s) => <option key={s} value={s} />)}</datalist>
            </Field>
            <Field label="Precio $/kg referencial">
              <input type="number" value={form.precio_kg_default}
                onChange={(e) => setForm({ ...form, precio_kg_default: e.target.value })}
                style={bluInput} />
            </Field>
            <button onClick={crear} style={{ ...primaryBtn, marginTop: 22 }}>Guardar</button>
            <button onClick={() => setShowForm(false)} style={{ ...ghostBtn, marginTop: 22 }}>✕</button>
          </div>
        </Card>
      )}

      {especies.length === 0 ? (
        <Card><Empty>Sin especies. Agrega las que pesca tu flota para pre-llenar precios automáticamente al registrar capturas.</Empty></Card>
      ) : (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>
              <th style={thStyle}>Especie</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Precio $/kg referencial</th>
              <th style={{ ...thStyle, textAlign: "center" }}>Activa</th>
              {puedeBorrar && <th style={thStyle}></th>}
            </tr></thead>
            <tbody>
              {especies.map((esp) => (
                <tr key={esp.id}>
                  <td style={tdStyle}>
                    <input value={esp.nombre} disabled={!puedeOperar}
                      onChange={(e) => setEspecies((p) => p.map((x) => x.id === esp.id ? { ...x, nombre: e.target.value } : x))}
                      onBlur={(e) => commitEsp(esp.id, "nombre", e.target.value)}
                      style={inputStyle(240)} />
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>
                    <input type="number" value={esp.precio_kg_default} disabled={!puedeOperar}
                      onChange={(e) => setEspecies((p) => p.map((x) => x.id === esp.id ? { ...x, precio_kg_default: +e.target.value } : x))}
                      onBlur={(e) => commitEsp(esp.id, "precio_kg_default", +e.target.value)}
                      style={{ ...bluInput, width: 130, textAlign: "right" }} />
                  </td>
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    <input type="checkbox" checked={!!esp.activa} disabled={!puedeOperar}
                      onChange={(e) => commitEsp(esp.id, "activa", e.target.checked)}
                      style={{ width: 16, height: 16, accentColor: C.green, cursor: puedeOperar ? "pointer" : "default" }} />
                  </td>
                  {puedeBorrar && (
                    <td style={tdStyle}>
                      <button onClick={() => eliminarEsp(esp.id)} style={{ background: "none", border: "none", cursor: "pointer", color: C.slate }}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// TAB CONFIG — precios por defecto de la empresa
// ─────────────────────────────────────────────────────────────────
