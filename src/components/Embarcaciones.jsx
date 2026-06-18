import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Ship, Plus, Trash2, Anchor, Wifi, Copy, RefreshCw, Waves } from "lucide-react";
import { useAuth } from "../lib/auth";
import { fetchAll, insertRow, updateRow, deleteRow, logActivity } from "../lib/db";
import { C, archivo, isAdmin, canOperate } from "../theme";
import { estadoOperacionalNave } from "../lib/operacional";
import {
  Card, Pill, primaryBtn, ghostBtn, inputStyle, Field,
  ModuleShell, StatGrid, HeroStat, Section, EmptyState, Toolbar,
} from "../ui";

const COLORES = ["#0B2A4A", "#1C5C9B", "#127C8A", "#1E9E6A", "#6C4FA3", "#8A5A2B", "#E0A526", "#D8443C"];

const FUNCTIONS_URL = (import.meta.env.VITE_SUPABASE_URL || "") + "/functions/v1/ingest-horometro";

export default function Embarcaciones() {
  const { profile } = useAuth();
  const [rows, setRows] = useState([]);
  const [mareas, setMareas] = useState([]);
  const [varadas, setVaradas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ codigo: "", nombre: "", color: COLORES[1] });
  const [tokenAbierto, setTokenAbierto] = useState(null);
  const puedeOperar = canOperate(profile?.rol);
  const puedeBorrar = isAdmin(profile?.rol);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [embs, ms, vds] = await Promise.all([
        fetchAll("embarcaciones", { order: { col: "codigo", asc: true } }),
        fetchAll("mareas", { order: { col: "zarpe_at", asc: false } }),
        fetchAll("varadas"),
      ]);
      setRows(embs);
      setMareas(ms);
      setVaradas(vds);
    } catch (e) {
      setError("No se pudieron cargar las embarcaciones. " + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const stats = useMemo(() => {
    let enMar = 0;
    let enVarada = 0;
    let activas = 0;
    rows.forEach((e) => {
      if (e.activa) activas++;
      const op = estadoOperacionalNave(e.id, { mareas, varadas });
      if (op.label?.toLowerCase().includes("mar") || op.label?.toLowerCase().includes("naveg")) enMar++;
      if (op.label?.toLowerCase().includes("varada") || op.label?.toLowerCase().includes("mantenimiento")) enVarada++;
    });
    return { total: rows.length, activas, enMar, enVarada, inactivas: rows.length - activas };
  }, [rows, mareas, varadas]);

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

  const heroVariant = stats.total === 0 ? "warn" : stats.inactivas > 0 ? "warn" : "ok";

  return (
    <ModuleShell
      kicker="Flota · Registro de naves"
      title="Embarcaciones"
      sub="Administra las naves de tu empresa. Cada embarcación habilita equipos, OTs, inventario, horómetros y telemetría autónoma."
      loading={loading}
      error={error}
      onRetry={cargar}
      action={
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {puedeOperar && (
            <button type="button" onClick={() => setShowForm(!showForm)} style={primaryBtn}>
              <Plus size={16} /> Agregar embarcación
            </button>
          )}
          <button type="button" onClick={cargar} title="Actualizar" data-nofx style={{ ...ghostBtn, padding: "10px 12px", display: "inline-flex", alignItems: "center" }}>
            <RefreshCw size={15} />
          </button>
        </div>
      }
    >
      {!loading && (
        <>
          <StatGrid
            hero={
              <HeroStat
                variant={heroVariant}
                icon={Ship}
                label="Flota registrada"
                value={stats.total === 0 ? "Sin naves" : stats.total}
                sub={stats.total === 0
                  ? "Agrega tu primera embarcación para activar el CMMS"
                  : `${stats.activas} activa${stats.activas !== 1 ? "s" : ""} · ${stats.enMar} en operación · ${stats.enVarada} en mantenimiento`}
              />
            }
            stats={[
              { label: "En servicio", value: stats.activas, sub: "marcadas activas", icon: Anchor, tone: C.green },
              { label: "En el mar", value: stats.enMar, sub: "según mareas/varadas", icon: Waves, tone: C.cyan },
            ]}
          />

          {showForm && (
            <Section title="Nueva embarcación" padding={20} style={{ marginBottom: 24 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 2fr", gap: 12, alignItems: "end" }}>
                <Field label="Código">
                  <input value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} style={inputStyle()} placeholder="DM" maxLength={8} />
                </Field>
                <Field label="Nombre">
                  <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} style={inputStyle()} placeholder="Don Miguel" />
                </Field>
                <Field label="Color identificador">
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {COLORES.map((c) => (
                      <button key={c} type="button" onClick={() => setForm({ ...form, color: c })}
                        style={{ width: 28, height: 28, borderRadius: 7, background: c, border: form.color === c ? `3px solid ${C.abyss}` : `1px solid ${C.line}`, cursor: "pointer" }} />
                    ))}
                  </div>
                </Field>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <button type="button" onClick={agregar} style={primaryBtn}>Guardar</button>
                <button type="button" onClick={() => setShowForm(false)} style={ghostBtn}>Cancelar</button>
              </div>
            </Section>
          )}

          {rows.length === 0 ? (
            <Section title="Tu flota" padding={0}>
              <EmptyState
                icon={Anchor}
                title="Aún no hay embarcaciones"
                description={puedeOperar
                  ? "Registra la primera nave para comenzar a cargar equipos, OTs y planes preventivos."
                  : "Pide a un administrador que registre la flota de la empresa."}
                action={puedeOperar && (
                  <button type="button" onClick={() => setShowForm(true)} style={primaryBtn}>
                    <Plus size={15} /> Agregar primera embarcación
                  </button>
                )}
              />
            </Section>
          ) : (
            <Section
              title="Naves registradas"
              description="Edita nombre y estado inline. Los administradores pueden configurar telemetría de horómetro."
              padding={0}
              style={{ marginBottom: 0 }}
            >
              <div className="cmms-grid-fleet" style={{ padding: 16 }}>
                {rows.map((e) => {
                  const op = estadoOperacionalNave(e.id, { mareas, varadas });
                  return (
                    <Card key={e.id} style={{ padding: 0, overflow: "hidden" }}>
                      <div style={{ height: 5, background: e.color }} />
                      <div style={{ padding: 18 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                            <div style={{
                              width: 44, height: 44, borderRadius: 12, background: e.color,
                              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                            }}>
                              <Ship size={22} color="#fff" />
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <input
                                value={e.nombre}
                                disabled={!puedeOperar}
                                onChange={(ev) => setRows((p) => p.map((r) => r.id === e.id ? { ...r, nombre: ev.target.value } : r))}
                                onBlur={(ev) => commit(e.id, "nombre", ev.target.value)}
                                style={{
                                  ...archivo, fontSize: 16, fontWeight: 700, color: C.abyss,
                                  border: "none", background: "transparent", outline: "none", width: "100%", padding: 0,
                                }}
                              />
                              <div style={{ fontSize: 11.5, color: C.slate, fontFamily: "'IBM Plex Mono', monospace" }}>{e.codigo}</div>
                            </div>
                          </div>
                          {puedeBorrar && (
                            <button type="button" onClick={() => eliminar(e.id)} style={{ background: "none", border: "none", cursor: "pointer", color: C.slate, flexShrink: 0 }}>
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>

                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <Pill tone={op.tone}>{op.label}</Pill>
                            <Pill tone={e.activa ? "green" : "slate"}>{e.activa ? "Activa" : "Inactiva"}</Pill>
                          </div>
                          {puedeOperar && (
                            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.slate, cursor: "pointer" }}>
                              <input type="checkbox" checked={e.activa} onChange={(ev) => commit(e.id, "activa", ev.target.checked)} />
                              En servicio
                            </label>
                          )}
                        </div>

                        {puedeBorrar && (
                          <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.foam}` }}>
                            <button type="button" onClick={() => setTokenAbierto(tokenAbierto === e.id ? null : e.id)}
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
                                  <button type="button" onClick={() => navigator.clipboard?.writeText(e.telemetria_token)} title="Copiar token" style={{ ...ghostBtn, padding: "6px 9px" }}><Copy size={13} /></button>
                                </div>
                                <div style={{ fontSize: 11, color: C.slate, marginTop: 8, lineHeight: 1.5 }}>
                                  POST con <code style={{ fontSize: 10.5 }}>{"{ token, equipo_id, horas }"}</code>. Trata el token como credencial secreta.
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </Section>
          )}
        </>
      )}
    </ModuleShell>
  );
}
