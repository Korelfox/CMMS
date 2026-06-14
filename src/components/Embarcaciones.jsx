import React, { useEffect, useState, useCallback } from "react";
import { Ship, Plus, Trash2, Anchor, Wifi, Copy } from "lucide-react";
import { useAuth } from "../lib/auth";
import { fetchAll, insertRow, updateRow, deleteRow, logActivity } from "../lib/db";
import { C, archivo, isAdmin, canOperate } from "../theme";
import {
  Card, PageHead, Pill, primaryBtn, ghostBtn, inputStyle, bluInput,
  thStyle, tdStyle, Field, Empty, ErrorBanner, InlineSpinner,
} from "../ui";

const COLORES = ["#0B2A4A", "#1C5C9B", "#127C8A", "#1E9E6A", "#6C4FA3", "#8A5A2B", "#E0A526", "#D8443C"];

// Endpoint del webhook de telemetría de horómetro (CMMS autónomo · Salto 3).
const FUNCTIONS_URL = (import.meta.env.VITE_SUPABASE_URL || "") + "/functions/v1/ingest-horometro";

export default function Embarcaciones() {
  const { profile } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ codigo: "", nombre: "", color: COLORES[1] });
  const [tokenAbierto, setTokenAbierto] = useState(null);
  const puedeOperar = canOperate(profile?.rol);
  const puedeBorrar = isAdmin(profile?.rol);

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      setRows(await fetchAll("embarcaciones", { order: { col: "codigo", asc: true } }));
    } catch (e) {
      setError("No se pudieron cargar las embarcaciones. " + e.message);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  async function agregar() {
    if (!form.codigo.trim() || !form.nombre.trim()) return;
    try {
      const nueva = await insertRow("embarcaciones", profile.empresa_id, {
        codigo: form.codigo.trim().toUpperCase(),
        nombre: form.nombre.trim(),
        color: form.color,
        created_by: profile.id,
      });
      setRows((p) => [...p, nueva].sort((a, b) => a.codigo.localeCompare(b.codigo)));
      logActivity(profile, "Crear embarcación", `${nueva.codigo} · ${nueva.nombre}`);
      setForm({ codigo: "", nombre: "", color: COLORES[1] });
      setShowForm(false);
    } catch (e) {
      setError(e.message.includes("duplicate") ? "Ya existe una embarcación con ese código." : "No se pudo crear: " + e.message);
    }
  }

  // Persiste un cambio de campo (optimista, con reversión si falla)
  async function commit(id, campo, valor) {
    const previo = rows.find((r) => r.id === id)?.[campo];
    setRows((p) => p.map((r) => (r.id === id ? { ...r, [campo]: valor } : r)));
    try {
      await updateRow("embarcaciones", id, { [campo]: valor });
    } catch (e) {
      setRows((p) => p.map((r) => (r.id === id ? { ...r, [campo]: previo } : r)));
      setError("No se pudo guardar el cambio: " + e.message);
    }
  }

  async function eliminar(id) {
    const emb = rows.find((r) => r.id === id);
    if (!window.confirm(`¿Eliminar "${emb?.nombre}"? Se borrarán también TODOS sus equipos y datos asociados. Esta acción no se puede deshacer.`)) return;
    const respaldo = rows;
    setRows((p) => p.filter((r) => r.id !== id));
    try {
      await deleteRow("embarcaciones", id);
      logActivity(profile, "Eliminar embarcación", `${emb?.codigo} · ${emb?.nombre}`);
    } catch (e) {
      setRows(respaldo);
      setError("No se pudo eliminar: " + e.message);
    }
  }

  return (
    <div>
      <PageHead kicker="Flota · Gestión Dinámica" title="Embarcaciones"
        sub="Administra las naves de tu flota. Cada embarcación que agregues queda disponible para Equipos, OTs, Inventario y todos los módulos."
        action={puedeOperar && <button onClick={() => setShowForm(!showForm)} style={primaryBtn}><Plus size={16} /> Agregar Embarcación</button>} />

      <ErrorBanner onRetry={cargar}>{error}</ErrorBanner>

      {showForm && (
        <Card style={{ marginBottom: 16, background: C.mist }}>
          <div style={{ ...archivo, fontWeight: 700, fontSize: 15, color: C.abyss, marginBottom: 14 }}>Nueva Embarcación</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 2fr", gap: 12, alignItems: "end" }}>
            <Field label="Código"><input value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} style={inputStyle()} placeholder="DM" maxLength={8} /></Field>
            <Field label="Nombre"><input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} style={inputStyle()} placeholder="Don Miguel" /></Field>
            <Field label="Color">
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {COLORES.map((c) => (
                  <button key={c} onClick={() => setForm({ ...form, color: c })} style={{ width: 28, height: 28, borderRadius: 7, background: c, border: form.color === c ? `3px solid ${C.abyss}` : `1px solid ${C.line}`, cursor: "pointer" }} />
                ))}
              </div>
            </Field>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button onClick={agregar} style={primaryBtn}>Guardar</button>
            <button onClick={() => setShowForm(false)} style={ghostBtn}>Cancelar</button>
          </div>
        </Card>
      )}

      {loading ? <Card><InlineSpinner label="Cargando embarcaciones…" /></Card> :
        rows.length === 0 ? (
          <Card><Empty>
            <Anchor size={32} color={C.line} style={{ marginBottom: 10 }} /><br />
            Aún no hay embarcaciones. {puedeOperar ? "Agrega la primera para comenzar." : "Pide a un administrador que registre la flota."}
          </Empty></Card>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
            {rows.map((e) => (
              <Card key={e.id} style={{ padding: 0, overflow: "hidden" }}>
                <div style={{ height: 6, background: e.color }} />
                <div style={{ padding: 18 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 10, background: e.color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <Ship size={22} color="#fff" />
                      </div>
                      <div>
                        <input value={e.nombre} disabled={!puedeOperar} onChange={(ev) => setRows((p) => p.map((r) => r.id === e.id ? { ...r, nombre: ev.target.value } : r))} onBlur={(ev) => commit(e.id, "nombre", ev.target.value)}
                          style={{ ...archivo, fontSize: 16, fontWeight: 700, color: C.abyss, border: "none", background: "transparent", outline: "none", width: "100%", padding: 0 }} />
                        <div style={{ fontSize: 11.5, color: C.slate, fontFamily: "'IBM Plex Mono', monospace" }}>{e.codigo}</div>
                      </div>
                    </div>
                    {puedeBorrar && <button onClick={() => eliminar(e.id)} style={{ background: "none", border: "none", cursor: "pointer", color: C.slate }}><Trash2 size={16} /></button>}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <Pill tone={e.activa ? "green" : "slate"}>{e.activa ? "Activa" : "Inactiva"}</Pill>
                    {puedeOperar && (
                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.slate, cursor: "pointer" }}>
                        <input type="checkbox" checked={e.activa} onChange={(ev) => commit(e.id, "activa", ev.target.checked)} />
                        En servicio
                      </label>
                    )}
                  </div>

                  {puedeBorrar && (
                    <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.foam}` }}>
                      <button onClick={() => setTokenAbierto(tokenAbierto === e.id ? null : e.id)}
                        style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: C.steel, fontSize: 12, fontWeight: 600, padding: 0 }}>
                        <Wifi size={13} /> Telemetría de horómetro {tokenAbierto === e.id ? "▲" : "▼"}
                      </button>
                      {tokenAbierto === e.id && (
                        <div style={{ marginTop: 10 }}>
                          <div style={{ fontSize: 10.5, color: C.slate, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Endpoint (POST)</div>
                          <div style={{ fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", color: C.ink, background: C.mist, border: `1px solid ${C.line}`, borderRadius: 6, padding: "6px 8px", wordBreak: "break-all", marginBottom: 8 }}>{FUNCTIONS_URL}</div>
                          <div style={{ fontSize: 10.5, color: C.slate, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Token de esta nave</div>
                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <code style={{ flex: 1, fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", color: C.ink, background: C.mist, border: `1px solid ${C.line}`, borderRadius: 6, padding: "6px 8px", wordBreak: "break-all" }}>{e.telemetria_token}</code>
                            <button onClick={() => navigator.clipboard?.writeText(e.telemetria_token)} title="Copiar token" style={{ ...ghostBtn, padding: "6px 9px" }}><Copy size={13} /></button>
                          </div>
                          <div style={{ fontSize: 11, color: C.slate, marginTop: 8, lineHeight: 1.5 }}>
                            El emisor a bordo hace POST con <code style={{ fontSize: 10.5 }}>{"{ token, equipo_id, horas }"}</code>. La lectura entra con fuente telemetría y se propaga al subárbol del horómetro. Token secreto — trátalo como una credencial.
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
    </div>
  );
}
