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

// Escala de elevación (sombras en capas) — da profundidad y jerarquía.
// sm: cards en reposo · md: cards interactivas/hover · lg: dropdowns · xl: modales
export const shadow = {
  sm: "0 1px 2px rgba(10,26,42,.06), 0 1px 3px rgba(10,26,42,.05)",
  md: "0 2px 4px rgba(10,26,42,.06), 0 4px 12px rgba(10,26,42,.08)",
  lg: "0 8px 24px rgba(10,26,42,.12)",
  xl: "0 16px 48px rgba(10,26,42,.18)",
};

// Radios consistentes
export const radius = { sm: 6, md: 8, lg: 12, xl: 16, pill: 999 };

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

// Intervalos de mantenimiento preventivo (horas)
export const PM_INTERVALS = [50, 100, 250, 500];

// Mapeos para Órdenes de Trabajo (valor en BD ↔ etiqueta ↔ color)
export const TIPOS_OT = [
  { value: "preventivo", label: "Preventivo", tone: "green" },
  { value: "correctivo", label: "Correctivo", tone: "red" },
  { value: "modificativo", label: "Modificativo", tone: "purple" },
  { value: "predictivo", label: "Predictivo", tone: "cyan" },
];
export const PRIORIDADES = [
  { value: "baja", label: "Baja", tone: "slate" },
  { value: "media", label: "Media", tone: "yellow" },
  { value: "alta", label: "Alta", tone: "red" },
  { value: "critica", label: "Crítica", tone: "red" },
];
export const ESTADOS_OT = [
  { value: "solicitada", label: "Solicitada", tone: "slate" },
  { value: "planificada", label: "Planificada", tone: "purple" },
  { value: "programada", label: "Programada", tone: "steel" },
  { value: "en_ejecucion", label: "En ejecución", tone: "yellow" },
  { value: "cerrada", label: "Cerrada", tone: "green" },
];
export const ESTADOS_SOLICITUD = [
  { value: "pendiente",  label: "Pendiente",  tone: "yellow" },
  { value: "convertida", label: "Convertida", tone: "green" },
  { value: "rechazada",  label: "Rechazada",  tone: "slate" },
];
// Tiempos objetivo de respuesta por prioridad (horas) — SLA típico
export const SLA_HORAS = { critica: 4, alta: 8, media: 24, baja: 72 };
export const DIAS_SEMANA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
export function lk(list, v) { return list.find((x) => x.value === v)?.label || v; }
export function tn(list, v) { return list.find((x) => x.value === v)?.tone || "slate"; }
