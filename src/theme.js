// ============================================================
//  Tema visual compartido · CMMS Korelfox
//  Paleta orbital: nave de comando, nebulosas y sistemas vivos.
// ============================================================

// ── Valores reales (modo claro) — fuente única de verdad ──────
// Se inyectan como CSS variables en :root. El modo oscuro las
// redefine en [data-theme="dark"] (ver THEME_VARS abajo).
export const HEX_LIGHT = {
  abyss: "#0B0F2E", deep: "#151B4B", ocean: "#1E2878", steel: "#4F46E5",
  sky: "#38BDF8", foam: "#E8F4FF", mist: "#F1F5F9", line: "#CBD5F5",
  ink: "#0F172A", slate: "#64748B", gold: "#FBBF24", amber: "#F97316",
  green: "#10B981", greenBg: "#D1FAE5", red: "#EF4444", redBg: "#FEE2E2",
  yellow: "#EAB308", yellowBg: "#FEF9C3", purple: "#8B5CF6", purpleBg: "#EDE9FE",
  cyan: "#06B6D4", cyanBg: "#CFFAFE", indigo: "#6366F1", indigoBg: "#E0E7FF",
  brown: "#92400E", brownBg: "#FEF3C7",
  surface: "#FFFFFF", surface2: "#F8FAFC", surfaceLine: "#CBD5F5", warm: "#FFFBEB", amberBg: "#FFEDD5",
  // Navegación: cockpit espacial — oscuro en AMBOS temas (no invierte)
  navBg1: "#070B1F", navBg2: "#141038", navFg: "#E8EFFF",
};

// Paleta de graficos (Recharts) — 8 colores distinguibles
export const CHART_COLORS = [
  "#4F46E5", "#06B6D4", "#10B981", "#F97316",
  "#8B5CF6", "#EC4899", "#6366F1", "#14B8A6",
];


// Overrides del modo oscuro: solo neutros/superficies cambian; los
// acentos semánticos se mantienen para conservar el significado.
export const HEX_DARK = {
  abyss: "#E8EFFF", deep: "#C7D2FE", ocean: "#A5B4FC", steel: "#818CF8",
  sky: "#22D3EE", foam: "#141929", mist: "#0A0E1A", line: "#252B45",
  ink: "#E8EFFF", slate: "#94A3B8",
  surface: "#12182B", surface2: "#0D1220", surfaceLine: "#252B45", warm: "#1A1508", amberBg: "#2A1810",
  greenBg: "#0A2318", redBg: "#2A1210", yellowBg: "#2A2310",
  purpleBg: "#1A1530", cyanBg: "#0A2228", indigoBg: "#151830", brownBg: "#241A10",
  navBg1: "#040810", navBg2: "#0A1028", navFg: "#DDE4FF",
  gold: "#FCD34D", amber: "#FB923C", green: "#34D399", red: "#F87171",
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
    --layout-max-width: ${1920}px;
    --layout-pad-x: 18px;
    --layout-pad-y: 22px;
    --layout-pad-bottom: 48px;
    color-scheme: light;
  }
  [data-theme="dark"] {
    ${Object.entries(HEX_DARK).map(([k, v]) => `--c-${k}: ${v};`).join("\n    ")}
    color-scheme: dark;
  }

  /* Impresión / Exportar PDF: imprime solo el área de trabajo, en claro. */
  @media print {
    [data-theme="dark"] { ${Object.entries(HEX_LIGHT).map(([k, v]) => `--c-${k}: ${v};`).join(" ")} color-scheme: light; }
    .cmms-sidebar, .cmms-topbar, .cmms-overlay, .no-print { display: none !important; }
    .cmms-work-area { padding: 0 !important; max-width: 100% !important; }
    main, body, html { overflow: visible !important; height: auto !important; background: #fff !important; }
    .print-only { display: block !important; }
  }
  .print-only { display: none; }

  /* ── Modo Oficina: cockpit orbital ─────────────────────────── */
  .cmms-root:not(.cmms-campo-mode) {
    --cmms-oficina-bg:
      radial-gradient(ellipse 80% 50% at 10% -10%, rgba(99,102,241,.14) 0%, transparent 55%),
      radial-gradient(ellipse 60% 40% at 92% 0%, rgba(6,182,212,.11) 0%, transparent 50%),
      radial-gradient(ellipse 50% 30% at 50% 100%, rgba(139,92,246,.09) 0%, transparent 45%),
      linear-gradient(180deg, var(--c-mist) 0%, color-mix(in srgb, var(--c-foam) 55%, var(--c-mist)) 100%);
  }
  [data-theme="dark"] .cmms-root:not(.cmms-campo-mode) {
    --cmms-oficina-bg:
      radial-gradient(ellipse 70% 45% at 15% -5%, rgba(99,102,241,.22) 0%, transparent 55%),
      radial-gradient(ellipse 55% 35% at 88% 5%, rgba(6,182,212,.14) 0%, transparent 50%),
      radial-gradient(ellipse 45% 25% at 50% 100%, rgba(139,92,246,.12) 0%, transparent 40%),
      linear-gradient(180deg, #0A0E1A 0%, #0D1220 100%);
  }
  .cmms-root:not(.cmms-campo-mode) > main {
    background: var(--cmms-oficina-bg) !important;
  }
  .cmms-root.cmms-campo-mode > main {
    background: linear-gradient(180deg, var(--c-mist) 0%, color-mix(in srgb, var(--c-foam) 22%, var(--c-mist)) 100%);
  }

  /* Modo Campo: cards elevadas con sombra visible al sol */
  .cmms-campo-elevated {
    box-shadow: 0 2px 8px rgba(15,23,42,.08), 0 0 0 1px rgba(15,23,42,.04);
  }

  /* Modo Campo: barra de tabs inferior estilo app nativa */
  .cmms-campo-tabs {
    background: var(--c-surface);
    border-top: 1px solid var(--c-line);
    padding: 6px 0 max(6px, env(safe-area-inset-bottom, 0px));
    display: flex;
    justify-content: space-around;
  }
  .cmms-campo-tab {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    padding: 6px 12px;
    border-radius: 8px;
    border: none;
    background: transparent;
    color: var(--c-slate);
    font-size: 10.5px;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    position: relative;
    min-width: 56px;
    transition: color .15s;
  }
  .cmms-campo-tab-active {
    color: var(--c-steel);
  }
  .cmms-campo-tab-active::before {
    content: "";
    position: absolute;
    top: -7px;
    left: 50%;
    transform: translateX(-50%);
    width: 24px;
    height: 3px;
    border-radius: 0 0 3px 3px;
    background: var(--c-sky);
  }

  /* Modo Campo: indicador de seccion con barra lateral de color */
  .cmms-campo-section-accent {
    border-left: 3px solid var(--_section-tone, var(--c-steel));
    padding-left: 11px;
  }

  /* Modo Campo: dark mode optimizado para uso nocturno */
  [data-theme="dark"] .cmms-root.cmms-campo-mode > main {
    background: linear-gradient(180deg, #101827 0%, #0D1220 100%);
  }
  [data-theme="dark"] .cmms-campo-elevated {
    box-shadow: 0 2px 8px rgba(0,0,0,.25);
  }
  [data-theme="dark"] .cmms-campo-tabs {
    background: var(--c-surface2);
    border-top-color: var(--c-surfaceLine);
  }
  [data-theme="dark"] .cmms-campo-tab-active {
    color: var(--c-sky);
  }

  .cmms-root:not(.cmms-campo-mode) .cmms-sidebar {
    background: linear-gradient(175deg, var(--c-navBg1) 0%, var(--c-navBg2) 48%, #1a1040 100%) !important;
    box-shadow: 4px 0 28px rgba(7,11,31,.38);
    position: relative;
  }
  .cmms-root:not(.cmms-campo-mode) .cmms-sidebar::before {
    content: "";
    position: absolute;
    inset: 0 auto 0 0;
    width: 1px;
    background: linear-gradient(180deg, rgba(6,182,212,.45) 0%, rgba(139,92,246,.2) 55%, transparent 100%);
    pointer-events: none;
    z-index: 1;
  }
  .cmms-root:not(.cmms-campo-mode) .cmms-sidebar::after {
    content: "";
    position: absolute;
    top: -20%;
    right: -30%;
    width: 180px;
    height: 180px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(6,182,212,.12) 0%, transparent 70%);
    pointer-events: none;
  }

  .cmms-brand-icon {
    background: linear-gradient(135deg, var(--c-sky) 0%, var(--c-indigo) 55%, var(--c-purple) 100%) !important;
    box-shadow: 0 0 22px rgba(6,182,212,.42);
  }
  .cmms-brand-tagline { opacity: .72 !important; color: color-mix(in srgb, var(--c-sky) 35%, var(--c-navFg)); }

  .cmms-nav-item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 11px;
    padding: 8px 12px;
    margin-bottom: 2px;
    border-radius: 8px;
    border: none;
    cursor: pointer;
    text-align: left;
    background: transparent;
    color: var(--c-navFg);
    font-weight: 500;
    font-size: 12.5px;
    font-family: inherit;
    transition: background .15s ease, color .15s ease, box-shadow .15s ease, transform .12s ease;
  }
  .cmms-nav-item:hover:not(.cmms-nav-item--active) {
    background: rgba(255,255,255,.07);
    color: #fff;
  }
  .cmms-nav-item--active {
    background: linear-gradient(135deg, var(--c-sky) 0%, var(--c-indigo) 100%) !important;
    color: #fff !important;
    font-weight: 600 !important;
    box-shadow: 0 2px 14px rgba(6,182,212,.38);
  }
  .cmms-nav-item--hub.cmms-nav-item--active {
    background: linear-gradient(135deg, rgba(139,92,246,.35) 0%, rgba(99,102,241,.25) 100%) !important;
    color: var(--c-gold) !important;
    box-shadow: inset 0 0 0 1px rgba(139,92,246,.35);
  }
  .cmms-nav-item--hub:not(.cmms-nav-item--active) { color: rgba(255,255,255,.85); }

  .cmms-root:not(.cmms-campo-mode) .cmms-context-header {
    background: color-mix(in srgb, var(--c-surface) 86%, transparent) !important;
    backdrop-filter: blur(14px) saturate(1.25);
    border-bottom-color: color-mix(in srgb, var(--c-sky) 22%, var(--c-line)) !important;
  }
  .cmms-root:not(.cmms-campo-mode) .cmms-tabs-bar {
    background: color-mix(in srgb, var(--c-surface2) 92%, transparent);
    border-bottom-color: color-mix(in srgb, var(--c-indigo) 18%, var(--c-line));
  }
  .cmms-root:not(.cmms-campo-mode) .cmms-tab-active {
    color: var(--c-indigo);
    border-bottom-color: var(--c-sky);
    background: color-mix(in srgb, var(--c-sky) 10%, transparent);
  }
  .cmms-root:not(.cmms-campo-mode) .cmms-tab:hover {
    color: var(--c-steel);
    background: color-mix(in srgb, var(--c-indigo) 8%, transparent);
  }
`;

export const mono = { fontFamily: "'IBM Plex Mono', monospace" };
export const archivo = { fontFamily: "'Archivo', sans-serif" };

// Escala de elevación (sombras en capas) — da profundidad y jerarquía.
// sm: cards en reposo · md: cards interactivas/hover · lg: dropdowns · xl: modales
export const shadow = {
  sm: "0 1px 2px rgba(11,15,46,.06), 0 1px 3px rgba(99,102,241,.05)",
  md: "0 2px 4px rgba(11,15,46,.06), 0 4px 16px rgba(6,182,212,.08)",
  lg: "0 8px 24px rgba(11,15,46,.12), 0 0 0 1px rgba(99,102,241,.06)",
  xl: "0 16px 48px rgba(11,15,46,.18), 0 0 40px rgba(6,182,212,.06)",
};

// Radios consistentes
export const radius = { sm: 6, md: 8, lg: 12, xl: 16, pill: 999 };

// Escala de espaciado (px) — layout y gutters del design system Tier 2
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 };

/** Ancho máximo del área de trabajo y paddings del shell (monitores anchos). */
export const LAYOUT = {
  maxWidth: 1920,
  workPadX: 18,
  workPadY: 22,
  workPadBottom: 48,
  splitTreeMax: 320,
  /** Cola de equipos (vista Cola): el doble del panel árbol/cola estándar. */
  splitQueueMin: 520,
  splitQueueMax: 640,
  /** Árbol de equipos (vista Tabla): +60% respecto al split estándar. */
  splitTableMin: 416,
  splitTableMax: 512,
  splitDetailMin: 400,
  splitDetailMax: 520,
};

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
// ¿Puede el rol entrar al Modo Oficina? Los operativos a bordo (capitán, maquinista,
// contratista) quedan acotados al Modo Campo; los administrativos ven Campo y Oficina.
export function canAccessOficina(rol) {
  return isAdmin(rol);
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

// Tipo de niveles que se revisan en el prezarpe para un equipo (aceite/agua).
// Se configura en Horómetros (junto a las máquinas) y se usa en Prezarpe.
export const NIVEL_TIPOS = [
  { value: "ninguno", label: "— No aplica" },
  { value: "aceite",  label: "Solo aceite" },
  { value: "aceite_agua", label: "Aceite + agua chaqueta" },
];

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
