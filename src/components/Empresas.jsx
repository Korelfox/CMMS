import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Building2, Plus, Ship, Users, Copy, Check, Power, AlertCircle } from "lucide-react";
import { useAuth } from "../lib/auth";
import { fetchAll, logActivity } from "../lib/db";
import { supabase } from "../lib/supabase";
import { C, archivo, isSuperAdmin, tint } from "../theme";
import {
  Card, PageHead, Pill, primaryBtn, ghostBtn, inputStyle, bluInput,
  thStyle, tdStyle, Field, Empty, ErrorBanner, InlineSpinner, GuiaColapsable,
} from "../ui";

const PLANES = [
  { value: "basico",     label: "Básico" },
  { value: "pro",        label: "Pro" },
  { value: "enterprise", label: "Enterprise" },
];
const PLAN_TONE = { basico: "slate", pro: "cyan", enterprise: "purple" };

// Genera un código de invitación legible (sin caracteres ambiguos).
function nuevoCodigo(nombre) {
  const base = (nombre || "FLOTA").replace(/[^A-Za-z]/g, "").slice(0, 4).toUpperCase() || "FLOTA";
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let sufijo = "";
  for (let i = 0; i < 4; i++) sufijo += chars[Math.floor(Math.random() * chars.length)];
  return `${base}-${sufijo}`;
}

function blank() {
  return { nombre: "", rut: "", puerto_base: "", plan: "basico", codigo_invitacion: "" };
}

export default function Empresas() {
  const { profile } = useAuth();
  const [empresas, setEmpresas]   = useState([]);
  const [embs, setEmbs]           = useState([]);
  const [usuarios, setUsuarios]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm]           = useState(blank());
  const [copiado, setCopiado]     = useState(null);
  const soyseuper = isSuperAdmin(profile?.rol);

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [emp, em, us] = await Promise.all([
        fetchAll("empresas",      { order: { col: "created_at", asc: false } }),
        fetchAll("embarcaciones"),
        fetchAll("profiles"),
      ]);
      setEmpresas(emp); setEmbs(em); setUsuarios(us);
    } catch (e) { setError("No se pudo cargar empresas. " + e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const navesDe    = (eid) => embs.filter((x) => x.empresa_id === eid).length;
  const usuariosDe = (eid) => usuarios.filter((u) => u.empresa_id === eid).length;

  const kpis = useMemo(() => ({
    total:   empresas.length,
    activas: empresas.filter((e) => e.activa).length,
    naves:   embs.length,
    users:   usuarios.length,
  }), [empresas, embs, usuarios]);

  async function crear() {
    if (!form.nombre.trim()) { setError("El nombre de la empresa es obligatorio."); return; }
    try {
      const row = {
        nombre: form.nombre.trim(),
        rut: form.rut.trim() || null,
        puerto_base: form.puerto_base.trim() || null,
        plan: form.plan,
        codigo_invitacion: (form.codigo_invitacion.trim() || nuevoCodigo(form.nombre)).toUpperCase(),
        activa: true,
      };
      const { data, error: e } = await supabase.from("empresas").insert(row).select().single();
      if (e) throw e;
      setEmpresas((p) => [data, ...p]);
      logActivity(profile, "Crear empresa", `${data.nombre} · ${data.plan}`);
      setForm(blank()); setShowForm(false);
    } catch (e) {
      setError(e.message.includes("duplicate") ? "Ya existe una empresa con ese código de invitación." : "No se pudo crear: " + e.message);
    }
  }

  function onChangeLocal(id, campo, valor) { setEmpresas((p) => p.map((e) => e.id === id ? { ...e, [campo]: valor } : e)); }
  async function commit(id, campo, valor) {
    const previo = empresas.find((e) => e.id === id)?.[campo];
    if (previo === valor) return;
    onChangeLocal(id, campo, valor);
    try {
      const { error: e } = await supabase.from("empresas").update({ [campo]: valor }).eq("id", id);
      if (e) throw e;
    } catch (e) { onChangeLocal(id, campo, previo); setError("No se pudo guardar: " + e.message); }
  }

  async function toggleActiva(emp) {
    await commit(emp.id, "activa", !emp.activa);
    logActivity(profile, emp.activa ? "Desactivar empresa" : "Activar empresa", emp.nombre);
  }

  function copiarCodigo(emp) {
    try {
      navigator.clipboard.writeText(emp.codigo_invitacion || "");
      setCopiado(emp.id);
      setTimeout(() => setCopiado((c) => (c === emp.id ? null : c)), 1800);
    } catch { /* clipboard no disponible */ }
  }

  if (loading) return <div><PageHead kicker="Administración · Super Admin" title="Empresas & Flotas" /><Card><InlineSpinner label="Cargando empresas…" /></Card></div>;

  if (!soyseuper) {
    return (
      <div>
        <PageHead kicker="Administración" title="Empresas & Flotas" />
        <Card><Empty>
          <AlertCircle size={30} color={C.amber} style={{ marginBottom: 10 }} /><br />
          Solo el <strong>Super Administrador</strong> puede gestionar empresas y flotas.
        </Empty></Card>
      </div>
    );
  }

  return (
    <div>
      <PageHead kicker="Administración · Super Admin" title="Empresas & Flotas"
        sub="Cada empresa es una flota independiente con sus datos aislados. Crea organizaciones y comparte su código de invitación para que sus usuarios se unan."
        action={<button onClick={() => { setShowForm(!showForm); setError(null); }} style={primaryBtn}><Plus size={16} /> Nueva Empresa</button>} />

      <ErrorBanner onRetry={cargar}>{error}</ErrorBanner>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 16 }}>
        {[
          ["Empresas", kpis.total, C.steel, Building2],
          ["Activas", kpis.activas, C.green, Power],
          ["Embarcaciones", kpis.naves, C.cyan, Ship],
          ["Usuarios", kpis.users, C.gold, Users],
        ].map(([lbl, val, tone, Icon]) => (
          <Card key={lbl} style={{ padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 10.5, letterSpacing: 1.2, textTransform: "uppercase", color: C.slate, fontWeight: 700 }}>{lbl}</div>
                <div style={{ ...archivo, fontSize: 26, fontWeight: 800, color: tone, marginTop: 8 }}>{val}</div>
              </div>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: tint(tone, 12), display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon size={19} color={tone} />
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Formulario nueva empresa */}
      {showForm && (
        <Card style={{ marginBottom: 16, background: C.mist }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: C.abyss, marginBottom: 14 }}>Nueva Empresa / Flota</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12 }}>
            <Field label="Nombre" span={2}><input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} style={inputStyle()} placeholder="Pesquera del Sur SPA" /></Field>
            <Field label="RUT"><input value={form.rut} onChange={(e) => setForm({ ...form, rut: e.target.value })} style={inputStyle()} placeholder="76.123.456-7" /></Field>
            <Field label="Puerto base"><input value={form.puerto_base} onChange={(e) => setForm({ ...form, puerto_base: e.target.value })} style={inputStyle()} placeholder="Puerto Montt" /></Field>
            <Field label="Plan">
              <select value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} style={inputStyle()}>
                {PLANES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </Field>
            <Field label="Código de invitación" span={2}>
              <div style={{ display: "flex", gap: 6 }}>
                <input value={form.codigo_invitacion} onChange={(e) => setForm({ ...form, codigo_invitacion: e.target.value.toUpperCase() })} style={{ ...inputStyle(), fontFamily: "'IBM Plex Mono', monospace" }} placeholder="se genera automático" />
                <button onClick={() => setForm({ ...form, codigo_invitacion: nuevoCodigo(form.nombre) })} style={{ ...ghostBtn, whiteSpace: "nowrap" }}>Generar</button>
              </div>
            </Field>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button onClick={crear} style={primaryBtn}>Crear Empresa</button>
            <button onClick={() => { setShowForm(false); setError(null); }} style={ghostBtn}>Cancelar</button>
          </div>
          <GuiaColapsable titulo="¿Cómo funciona una empresa/flota?" icon={Building2}>
            <ul style={{ margin: 0, paddingLeft: 18, color: C.slate }}>
              <li>Cada empresa es una <strong>flota independiente</strong>: sus embarcaciones, equipos, OTs e inventario están aislados de las demás (RLS por empresa).</li>
              <li>El <strong>código de invitación</strong> es lo que un usuario nuevo ingresa al registrarse para unirse a esta flota.</li>
              <li>Luego cargas su flota en <strong>Embarcaciones</strong> y generas los sistemas con <strong>Precargar plantilla</strong> en Equipos.</li>
              <li>Desactivar una empresa bloquea el acceso sin borrar sus datos.</li>
            </ul>
          </GuiaColapsable>
        </Card>
      )}

      {/* Tabla de empresas */}
      {empresas.length === 0 ? (
        <Card><Empty>
          <Building2 size={32} color={C.line} style={{ marginBottom: 10 }} /><br />
          Aún no hay empresas. Crea la primera flota con el botón "Nueva Empresa".
        </Empty></Card>
      ) : (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
              <thead><tr>
                <th style={thStyle}>Empresa</th>
                <th style={thStyle}>RUT</th>
                <th style={thStyle}>Puerto base</th>
                <th style={thStyle}>Plan</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Naves</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Usuarios</th>
                <th style={thStyle}>Código invitación</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Estado</th>
              </tr></thead>
              <tbody>
                {empresas.map((e) => {
                  const inactiva = !e.activa;
                  return (
                    <tr key={e.id} style={{ opacity: inactiva ? 0.55 : 1 }}>
                      <td style={tdStyle}>
                        <input value={e.nombre} onChange={(ev) => onChangeLocal(e.id, "nombre", ev.target.value)} onBlur={(ev) => commit(e.id, "nombre", ev.target.value)} style={{ ...bluInput, width: 200, fontWeight: 700, color: C.abyss }} />
                      </td>
                      <td style={tdStyle}><input value={e.rut || ""} onChange={(ev) => onChangeLocal(e.id, "rut", ev.target.value)} onBlur={(ev) => commit(e.id, "rut", ev.target.value)} style={inputStyle(120)} /></td>
                      <td style={tdStyle}><input value={e.puerto_base || ""} onChange={(ev) => onChangeLocal(e.id, "puerto_base", ev.target.value)} onBlur={(ev) => commit(e.id, "puerto_base", ev.target.value)} style={inputStyle(130)} /></td>
                      <td style={tdStyle}>
                        <select value={e.plan} onChange={(ev) => commit(e.id, "plan", ev.target.value)} style={inputStyle(120)}>
                          {PLANES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                        </select>
                      </td>
                      <td style={{ ...tdStyle, textAlign: "center", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700 }}>{navesDe(e.id)}</td>
                      <td style={{ ...tdStyle, textAlign: "center", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700 }}>{usuariosDe(e.id)}</td>
                      <td style={tdStyle}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <code style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: C.steel, background: tint(C.steel, 10), padding: "3px 8px", borderRadius: 5 }}>{e.codigo_invitacion || "—"}</code>
                          {e.codigo_invitacion && (
                            <button onClick={() => copiarCodigo(e)} title="Copiar código" style={{ background: "none", border: "none", cursor: "pointer", color: copiado === e.id ? C.green : C.slate, padding: 2 }}>
                              {copiado === e.id ? <Check size={15} /> : <Copy size={15} />}
                            </button>
                          )}
                        </div>
                      </td>
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        <button onClick={() => toggleActiva(e)} title={e.activa ? "Desactivar" : "Activar"}
                          style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 11.5, fontWeight: 700, background: e.activa ? tint(C.green, 14) : tint(C.slate, 14), color: e.activa ? C.green : C.slate }}>
                          <Power size={12} /> {e.activa ? "Activa" : "Inactiva"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
