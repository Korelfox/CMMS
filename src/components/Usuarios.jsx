import React, { useEffect, useState, useCallback } from "react";
import { Users, Copy, Check, Shield, Trash2, UserCog, RefreshCw } from "lucide-react";
import { useAuth } from "../lib/auth";
import { fetchAll, updateRow, deleteRow, logActivity } from "../lib/db";
import { C, archivo, ROLES, rolLabel, isAdmin } from "../theme";
import {
  Card, PageHead, Pill, inputStyle, thStyle, tdStyle, Empty, ErrorBanner, InlineSpinner,
} from "../ui";

export default function Usuarios() {
  const { profile, empresa, refreshProfile } = useAuth();
  const [usuarios, setUsuarios] = useState([]);
  const [embarcaciones, setEmbarcaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copiado, setCopiado] = useState(false);
  const soyAdmin = isAdmin(profile?.rol);
  const miNivel = ROLES[profile?.rol]?.nivel ?? 0;

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [us, embs] = await Promise.all([
        fetchAll("profiles", { order: { col: "nombre", asc: true } }),
        fetchAll("embarcaciones", { order: { col: "codigo", asc: true } }),
      ]);
      setUsuarios(us); setEmbarcaciones(embs);
    } catch (e) { setError("No se pudieron cargar los usuarios. " + e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  // Roles que ESTE usuario puede asignar (no por encima de su propio nivel; super_admin solo lo da un super_admin)
  const rolesAsignables = Object.entries(ROLES)
    .filter(([key, r]) => r.nivel <= miNivel && (key !== "super_admin" || profile?.rol === "super_admin"))
    .map(([key]) => key);

  function copiarCodigo() {
    if (!empresa?.codigo_invitacion) return;
    navigator.clipboard?.writeText(empresa.codigo_invitacion);
    setCopiado(true); setTimeout(() => setCopiado(false), 1800);
  }

  async function setCampo(u, campo, valor) {
    const previo = u[campo];
    if (previo === valor) return;
    setUsuarios((p) => p.map((x) => x.id === u.id ? { ...x, [campo]: valor } : x));
    try {
      await updateRow("profiles", u.id, { [campo]: valor });
      logActivity(profile, "Gestión de usuario", `${u.nombre || u.email}: ${campo} → ${valor}`);
      if (u.id === profile.id) refreshProfile(); // si me edité a mí mismo, refresco mi sesión
    } catch (e) {
      setUsuarios((p) => p.map((x) => x.id === u.id ? { ...x, [campo]: previo } : x));
      setError(e.message.includes("super_admin") ? "Solo un super administrador puede otorgar ese rol." : "No se pudo guardar: " + e.message);
    }
  }

  async function eliminar(u) {
    if (u.id === profile.id) { setError("No puedes eliminar tu propia cuenta."); return; }
    if (!window.confirm(`¿Quitar a "${u.nombre || u.email}" de la empresa? Perderá el acceso a los datos (su cuenta de correo seguirá existiendo, pero sin empresa asignada).`)) return;
    const respaldo = usuarios;
    setUsuarios((p) => p.filter((x) => x.id !== u.id));
    try {
      // No borramos el auth.user (no se puede desde el front); lo desvinculamos de la empresa
      await updateRow("profiles", u.id, { empresa_id: null, activo: false });
      logActivity(profile, "Quitar usuario", u.nombre || u.email);
    } catch (e) { setUsuarios(respaldo); setError("No se pudo quitar: " + e.message); }
  }

  if (loading) return <div><PageHead kicker="Administración" title="Gestión de Usuarios" /><Card><InlineSpinner label="Cargando usuarios…" /></Card></div>;

  if (!soyAdmin) {
    return (
      <div>
        <PageHead kicker="Administración" title="Gestión de Usuarios" />
        <Card><Empty>
          <Shield size={32} color={C.amber} style={{ marginBottom: 10 }} /><br />
          Esta sección es solo para administradores. Si necesitas cambios en tu cuenta, contacta al Jefe de Mantención o al administrador de tu empresa.
        </Empty></Card>
      </div>
    );
  }

  const activos = usuarios.filter((u) => u.activo).length;
  const admins = usuarios.filter((u) => isAdmin(u.rol)).length;

  return (
    <div>
      <PageHead kicker="Administración · Equipo" title="Gestión de Usuarios"
        sub="Administra quién accede al sistema, con qué rol y a qué embarcación. Los nuevos empleados se registran con el código de la empresa y aparecen aquí."
        action={<button onClick={cargar} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 9, border: `1px solid ${C.line}`, background: C.surface, color: C.steel, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}><RefreshCw size={14} /> Actualizar</button>} />

      <ErrorBanner onRetry={cargar}>{error}</ErrorBanner>

      {/* Código de invitación */}
      <Card style={{ marginBottom: 16, padding: 20, background: `linear-gradient(135deg, ${C.abyss}, ${C.steel})`, color: "#fff" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: "rgba(255,255,255,.7)", fontWeight: 700, marginBottom: 6 }}>Código de invitación de {empresa?.nombre}</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,.85)", maxWidth: 460, lineHeight: 1.5 }}>
              Comparte este código con tus empleados. Al registrarse e ingresarlo, quedan asignados automáticamente a tu empresa (como maquinista). Luego les ajustas el rol aquí.
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ ...archivo, fontSize: 30, fontWeight: 800, letterSpacing: 3, color: C.gold, fontFamily: "'IBM Plex Mono', monospace" }}>
              {empresa?.codigo_invitacion || "—"}
            </div>
            <button onClick={copiarCodigo} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 14px", borderRadius: 9, border: "none", background: copiado ? C.green : C.gold, color: C.abyss, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              {copiado ? <><Check size={15} /> Copiado</> : <><Copy size={15} /> Copiar</>}
            </button>
          </div>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 16 }}>
        <KPI label="Usuarios" value={usuarios.length} sub={`${activos} activos`} />
        <KPI label="Administradores" value={admins} tone={C.steel} sub="acceso de gestión" />
        <KPI label="Operativos" value={usuarios.length - admins} sub="capitanes y maquinistas" />
      </div>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 920 }}>
            <thead><tr>
              <th style={thStyle}>Nombre</th><th style={thStyle}>Correo</th>
              <th style={thStyle}>Rol</th><th style={thStyle}>Embarcación</th>
              <th style={{ ...thStyle, textAlign: "center" }}>Activo</th><th style={thStyle}></th>
            </tr></thead>
            <tbody>
              {usuarios.length === 0 ? <tr><td colSpan={6}><Empty>Sin usuarios. Comparte el código de invitación para que tu equipo se registre.</Empty></td></tr> :
                usuarios.map((u) => {
                  const soyYo = u.id === profile.id;
                  const puedoEditarRol = !soyYo && (ROLES[u.rol]?.nivel ?? 0) <= miNivel;
                  return (
                    <tr key={u.id} style={{ background: soyYo ? C.mist : "transparent" }}>
                      <td style={tdStyle}>
                        <input value={u.nombre || ""} onChange={(e) => setUsuarios((p) => p.map((x) => x.id === u.id ? { ...x, nombre: e.target.value } : x))}
                          onBlur={(e) => setCampo(u, "nombre", e.target.value)} style={inputStyle(150)} />
                        {soyYo && <span style={{ fontSize: 10.5, color: C.steel, fontWeight: 600, marginLeft: 6 }}>(tú)</span>}
                      </td>
                      <td style={{ ...tdStyle, fontSize: 12, color: C.slate, fontFamily: "'IBM Plex Mono', monospace" }}>{u.email || "—"}</td>
                      <td style={tdStyle}>
                        {puedoEditarRol ? (
                          <select value={u.rol} onChange={(e) => setCampo(u, "rol", e.target.value)} style={inputStyle(160)}>
                            {rolesAsignables.includes(u.rol) ? null : <option value={u.rol}>{rolLabel(u.rol)}</option>}
                            {rolesAsignables.map((r) => <option key={r} value={r}>{rolLabel(r)}</option>)}
                          </select>
                        ) : (
                          <Pill tone="steel">{rolLabel(u.rol)}</Pill>
                        )}
                      </td>
                      <td style={tdStyle}>
                        <select value={u.embarcacion_id || ""} onChange={(e) => setCampo(u, "embarcacion_id", e.target.value || null)} style={inputStyle(150)}>
                          <option value="">— Toda la flota —</option>
                          {embarcaciones.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
                        </select>
                      </td>
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        <label style={{ display: "inline-flex", alignItems: "center", cursor: soyYo ? "default" : "pointer" }}>
                          <input type="checkbox" checked={u.activo} disabled={soyYo}
                            onChange={(e) => setCampo(u, "activo", e.target.checked)} />
                        </label>
                      </td>
                      <td style={tdStyle}>
                        {!soyYo && <button onClick={() => eliminar(u)} title="Quitar de la empresa" style={{ background: "none", border: "none", cursor: "pointer", color: C.slate }}><Trash2 size={15} /></button>}
                      </td>
                    </tr>);
                })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card style={{ marginTop: 16, background: C.mist }}>
        <div style={{ fontSize: 12.5, color: C.slate, lineHeight: 1.7 }}>
          <strong style={{ color: C.ink }}>Cómo dar de alta a alguien:</strong> 1) le pasas el <strong>código de invitación</strong> de arriba;
          2) la persona entra a la app, pulsa <strong>"Crear una"</strong> cuenta y lo ingresa al registrarse;
          3) confirma su correo e inicia sesión — ya queda en tu empresa como maquinista;
          4) tú le ajustas aquí el rol y la embarcación.
          <br /><strong style={{ color: C.ink }}>Seguridad:</strong> no puedes cambiar tu propio rol ni desactivarte (para no quedar fuera por accidente),
          y solo un super administrador puede otorgar ese rol. "Quitar" desvincula a la persona de la empresa sin borrar su correo.
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
