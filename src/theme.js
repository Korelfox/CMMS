// ============================================================
//  Tema visual compartido · CMMS Flota
//  Paleta industrial-marítima + tokens de estilo reutilizables.
// ============================================================

// ── Valores reales (modo claro) — fuente única de verdad ──────
// Se inyectan como CSS variables en :root. El modo oscuro las
// redefine en [data-theme="dark"] (ver THEME_VARS abajo).
export const HEX_LIGHT = {
  abyss: "#06182E", deep: "#0B2A4A", ocean: "#103E6B", steel: "#1C5C9B",
  sky: "#3E8FD6", foam: "#E8F1F8", mist: "#F4F8FB", line: "#D6E2EC",
  ink: "#0A1A2A", slate: "#5A7184", gold: "#E0A526", amber: "#F4B740",
  green: "#1E9E6A", greenBg: "#DCF5EA", red: "#D8443C", redBg: "#FBE3E1",
  yellow: "#E5A300", yellowBg: "#FCF3D6", purple: "#6C4FA3", purpleBg: "#EAE2F6",
  cyan: "#127C8A", cyanBg: "#D7EFF1", indigo: "#3A3F9E", indigoBg: "#E2E3F5",
  brown: "#8A5A2B", brownBg: "#F0E6DA",
  // Superficies (nuevas) — reemplazan los "#fff" hardcodeados
  surface: "#FFFFFF", surface2: "#F8FAFD", surfaceLine: "#D6E2EC",
  // Navegación: fondo del sidebar — oscuro en AMBOS temas (no invierte)
  navBg1: "#06182E", navBg2: "#0B2A4A", navFg: "#E8F1F8",
};

// Overrides del modo oscuro: solo neutros/superficies cambian; los
// acentos semánticos se mantienen para conservar el significado.
export const HEX_DARK = {
  abyss: "#E8F1F8", deep: "#CFE0EE", ocean: "#9FC2DD", steel: "#5AA0DC",
  sky: "#6FB0E6", foam: "#16232F", mist: "#0C151D", line: "#243441",
  ink: "#E6EEF5", slate: "#93A8B8",
  surface: "#121E29", surface2: "#0F1922", surfaceLine: "#243441",
  // backgrounds tenues de acento, más oscuros en dark
  greenBg: "#10271E", redBg: "#2E1715", yellowBg: "#2A2310",
  purpleBg: "#1E1A2C", cyanBg: "#0E2226", indigoBg: "#181A2C", brownBg: "#241A10",
  // navegación: un punto más oscura en modo noche
  navBg1: "#040E1C", navBg2: "#06182E", navFg: "#DCEAF6",
  // acentos un toque más luminosos para contraste sobre fondo oscuro
  gold: "#E8B23E", amber: "#F6C24E", green: "#2BB47C", red: "#E85C54",
};

// El objeto C que consumen los componentes: cada token es una CSS var.
// style={{ color: C.ink }} → color: var(--c-ink) → el navegador resuelve.
export const C = Object.keys(HEX_LIGHT).reduce((acc, k) => {
  acc[k] = `var(--c-${k})`;
  return acc;
}, {});

// Fondo tenue de un color con transparencia, válido en claro y oscuro.
// Reemplaza el patrón `${C.x}18` (hex+alpha) que no funciona con var().
export const tint = (color, pct = 10) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;

// Bloque CSS con las variables de ambos temas (se monta una vez).
export const THEME_VARS = `
  :root {
    ${Object.entries(HEX_LIGHT).map(([k, v]) => `--c-${k}: ${v};`).join("\n    ")}
    color-scheme: light;
  }
  [data-theme="dark"] {
    ${Object.entries(HEX_DARK).map(([k, v]) => `--c-${k}: ${v};`).join("\n    ")}
    color-scheme: dark;
  }
`;

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
export function isSuperAdmin(rol) {
  return rol === "super_admin";
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
