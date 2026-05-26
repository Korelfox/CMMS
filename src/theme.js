// ============================================================
//  Tema visual compartido · CMMS Flota
//  Paleta industrial-marítima + tokens de estilo reutilizables.
// ============================================================

export const C = {
  abyss: "#06182E", deep: "#0B2A4A", ocean: "#103E6B", steel: "#1C5C9B",
  sky: "#3E8FD6", foam: "#E8F1F8", mist: "#F4F8FB", line: "#D6E2EC",
  ink: "#0A1A2A", slate: "#5A7184", gold: "#E0A526", amber: "#F4B740",
  green: "#1E9E6A", greenBg: "#DCF5EA", red: "#D8443C", redBg: "#FBE3E1",
  yellow: "#E5A300", yellowBg: "#FCF3D6", purple: "#6C4FA3", purpleBg: "#EAE2F6",
  cyan: "#127C8A", cyanBg: "#D7EFF1", indigo: "#3A3F9E", indigoBg: "#E2E3F5",
  brown: "#8A5A2B", brownBg: "#F0E6DA",
};

export const mono = { fontFamily: "'IBM Plex Mono', monospace" };
export const archivo = { fontFamily: "'Archivo', sans-serif" };

// Roles y jerarquía (refleja el enum app.rol_usuario del esquema SQL)
export const ROLES = {
  super_admin: { label: "Super Admin", nivel: 4, color: C.abyss },
  admin_empresa: { label: "Admin Empresa", nivel: 3, color: C.deep },
  jefe_mantencion: { label: "Jefe Mantención", nivel: 3, color: C.steel },
  capitan: { label: "Capitán", nivel: 2, color: C.cyan },
  maquinista: { label: "Maquinista", nivel: 1, color: C.gold },
  contratista: { label: "Contratista", nivel: 0, color: C.slate },
};

export function rolLabel(rol) { return ROLES[rol]?.label || rol || "—"; }
export function clp(n) { return "$" + Math.round(n || 0).toLocaleString("es-CL"); }
export function num(n, d = 0) {
  return (n || 0).toLocaleString("es-CL", { minimumFractionDigits: d, maximumFractionDigits: d });
}

// Permisos de cliente (la verdad última la impone RLS en la base de datos;
// esto solo adapta la interfaz para no mostrar acciones que el servidor negará).
export function canOperate(rol) {
  return ["super_admin", "admin_empresa", "jefe_mantencion", "capitan", "maquinista"].includes(rol);
}
export function isAdmin(rol) {
  return ["super_admin", "admin_empresa", "jefe_mantencion"].includes(rol);
}

// Estados de equipo: valor en BD ↔ etiqueta visible ↔ color
export const ESTADOS_EQUIPO = [
  { value: "operativo", label: "Operativo", tone: "green" },
  { value: "desgaste", label: "Desgaste", tone: "yellow" },
  { value: "en_reparacion", label: "En reparación", tone: "steel" },
  { value: "fuera_servicio", label: "Fuera de servicio", tone: "red" },
];
export function estadoLabel(v) { return ESTADOS_EQUIPO.find((e) => e.value === v)?.label || v; }
export function estadoTone(v) { return ESTADOS_EQUIPO.find((e) => e.value === v)?.tone || "slate"; }
