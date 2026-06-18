// Capa 1 — estructura de navegación Campo / Oficina (validada UX).

import {
  LayoutDashboard, Ship, Sailboat, CalendarClock, Calendar, Inbox, ClipboardList,
  Package, Warehouse, Gauge, Activity, AlertTriangle, ClipboardCheck, DollarSign,
  TrendingUp, TrendingDown, FileText, History, Layers, Bell, UserCog, Building2,
  BarChart3, ShipWheel, Fuel, ShieldCheck, Fish, Timer, Waves, ListTodo, Microscope,
  Wrench, CalendarRange, ShieldAlert, SlidersHorizontal, PiggyBank, Sparkles,
  Stethoscope, Bot, Scale, Sigma, Receipt, Replace, Network, Workflow, Radar, Anchor,
  Sun, Search, MoreHorizontal,
} from "lucide-react";

/** Metadatos de cada módulo (id → label, icono, permisos). */
export const NAV_META = {
  dashboard:    { label: "Tablero", icon: LayoutDashboard },
  alertas:      { label: "Alertas", icon: Bell },
  flota:        { label: "Estado de Flota", icon: Anchor },
  copiloto:     { label: "Copiloto IA", icon: Bot },
  informe:      { label: "Informe Ejecutivo IA", icon: Sparkles },
  mgm:          { label: "Modelo MGM", icon: Layers },
  embarcaciones:{ label: "Embarcaciones", icon: Sailboat },
  equipos:      { label: "Equipos", icon: Ship },
  prezarpe:     { label: "Prezarpe", icon: ShipWheel },
  cumplimiento: { label: "Cumplimiento", icon: ShieldCheck },
  horometros:   { label: "Horómetros", icon: Timer },
  planpm:       { label: "Plan Preventivo", icon: CalendarClock },
  solicitudes:  { label: "Solicitudes", icon: Inbox },
  ots:          { label: "Órdenes de Trabajo", icon: ClipboardList },
  otauto:       { label: "OTs Automáticas", icon: Workflow },
  backlog:      { label: "Backlog", icon: ListTodo },
  planpuerto:   { label: "Ventana de Puerto", icon: CalendarRange },
  optimvt:      { label: "Optimizador de Ventana", icon: Scale },
  programa:     { label: "Programación", icon: Calendar },
  varada:       { label: "Varadas & Paradas", icon: Wrench },
  inventario:   { label: "Inventario", icon: Package },
  almacen:      { label: "Almacén & Compras", icon: Warehouse },
  ocr:          { label: "OCR Facturas", icon: Receipt },
  criticidad:   { label: "Criticidad", icon: Activity },
  kpis:         { label: "KPIs & Confiabilidad", icon: Gauge },
  lucro:        { label: "Lucro Cesante", icon: TrendingDown },
  riesgo:       { label: "Riesgo de Falla", icon: ShieldAlert },
  diagnostico:  { label: "Diagnóstico de Fallas IA", icon: Stethoscope },
  minmax:       { label: "Min/Max Sugerido", icon: SlidersHorizontal },
  pareto:       { label: "Pareto (80/20)", icon: BarChart3 },
  fallas:       { label: "Análisis de Fallas", icon: AlertTriangle },
  rca:          { label: "Causa Raíz (RCA)", icon: Microscope },
  pdm:          { label: "Predictivo (PdM)", icon: Waves },
  confiab:      { label: "Predictivo ML", icon: Sigma },
  consumos:     { label: "Consumos & Eficiencia", icon: Fuel },
  auditoria:    { label: "Auditoría MES", icon: ClipboardCheck },
  rentabilidad: { label: "Rentabilidad por Marea", icon: Fish },
  presupuesto:  { label: "Presupuesto & Run-rate", icon: PiggyBank },
  costos:       { label: "Costo Global (CGM)", icon: DollarSign },
  capex:        { label: "Reemplazar vs Reparar", icon: Replace },
  optim:        { label: "Optimización", icon: TrendingUp },
  vigilante:    { label: "Vigilante IA", icon: Radar },
  arquia:       { label: "Arquitectura IA", icon: Network },
  reportes:     { label: "Reportes", icon: FileText },
  bitacora:     { label: "Bitácora", icon: History },
  usuarios:     { label: "Usuarios", icon: UserCog, adminOnly: true },
  empresas:     { label: "Empresas & Flotas", icon: Building2, superAdminOnly: true },
};

/** Bloques visibles del sidebar Modo Oficina. */
export const OFICINA_GROUPS = [
  {
    id: "operacion",
    label: "Operación",
    items: ["ots", "solicitudes", "planpm", "programa", "backlog", "otauto", "varada", "ocr"],
  },
  {
    id: "activos",
    label: "Activos",
    items: ["flota", "embarcaciones", "equipos", "horometros", "inventario", "almacen", "prezarpe", "cumplimiento"],
  },
  {
    id: "confiabilidad",
    label: "Confiabilidad",
    items: ["fallas", "pdm", "rca", "riesgo"],
  },
  {
    id: "comercial",
    label: "Comercial",
    items: ["costos", "presupuesto", "rentabilidad"],
  },
  {
    id: "sistema",
    label: "Sistema",
    items: ["reportes", "usuarios", "copiloto", "vigilante", "informe", "bitacora", "arquia", "empresas"],
  },
];

/** Entrada hub Análisis (Fase 4 — pantalla con cards, no lista plana en sidebar). */
export const ANALISIS_HUB_ID = "analisis";

/** Módulos accesibles desde el hub Análisis. */
export const ANALISIS_IDS = [
  "dashboard", "alertas", "mgm", "optim", "optimvt", "kpis", "criticidad", "pareto",
  "confiab", "consumos", "minmax", "capex", "auditoria", "lucro", "planpuerto", "diagnostico",
];

/** Agrupación del hub Análisis con cards descriptivas. */
export const ANALISIS_GROUPS = [
  {
    id: "ejecutivo",
    label: "Ejecutivo y alertas",
    description: "Visión global, alertas accionables e informes para gerencia.",
    items: ["dashboard", "alertas", "informe", "lucro"],
  },
  {
    id: "confiabilidad",
    label: "Confiabilidad avanzada",
    description: "Modelos, KPIs técnicos y análisis de fallas.",
    items: ["kpis", "criticidad", "pareto", "confiab", "mgm", "diagnostico"],
  },
  {
    id: "optimizacion",
    label: "Optimización y costos",
    description: "Ventanas de mantenimiento, Weibull, min/max y reemplazo vs reparar.",
    items: ["optim", "optimvt", "planpuerto", "minmax", "capex", "consumos"],
  },
  {
    id: "compliance",
    label: "Cumplimiento y auditoría",
    description: "Auditoría MES y trazabilidad analítica.",
    items: ["auditoria"],
  },
];

/** Texto corto por módulo en cards del hub. */
export const ANALISIS_CARD_META = {
  dashboard:   { desc: "Tablero operacional con KPIs y cola de acciones prioritarias." },
  alertas:     { desc: "Alertas críticas y desvíos que requieren decisión." },
  informe:     { desc: "Informe ejecutivo generado con IA para gerencia." },
  lucro:       { desc: "Lucro cesante por paradas y fallas." },
  kpis:        { desc: "Indicadores de confiabilidad (MTBF, MTTR, disponibilidad)." },
  criticidad:  { desc: "Matriz de criticidad y priorización de activos." },
  pareto:      { desc: "Análisis 80/20 de fallas y costos." },
  confiab:     { desc: "Modelos predictivos ML sobre historial de fallas." },
  mgm:         { desc: "Modelo de gestión de mantenimiento (MGM)." },
  diagnostico: { desc: "Diagnóstico de fallas asistido por IA." },
  optim:       { desc: "Optimización Weibull y curvas de vida útil." },
  optimvt:     { desc: "Optimizador de ventana de mantenimiento en puerto." },
  planpuerto:  { desc: "Planificación de ventana de puerto y varada." },
  minmax:      { desc: "Sugerencias min/max de inventario por consumo." },
  capex:       { desc: "Reemplazar vs reparar — análisis económico." },
  consumos:    { desc: "Consumos, eficiencia energética y combustible." },
  auditoria:   { desc: "Auditoría MES y trazabilidad de mantenimiento." },
};

/** Tabs Modo Campo (bottom bar). */
export const CAMPO_TABS = [
  { id: "hoy", label: "Hoy", icon: Sun },
  { id: "trabajo", label: "Trabajo", icon: ClipboardList },
  { id: "activos", label: "Activos", icon: Search },
  { id: "mas", label: "Más", icon: MoreHorizontal },
];

export const CAMPO_TAB_KEY = "cmms-campo-tab";

export function navItem(id) {
  const meta = NAV_META[id];
  if (!meta) return null;
  return { id, ...meta };
}

export function filterNavIds(ids, profile, perms) {
  return ids.filter((id) => {
    const m = NAV_META[id];
    if (!m) return false;
    if (m.adminOnly && !perms.isAdmin(profile?.rol)) return false;
    if (m.superAdminOnly && !perms.isSuperAdmin(profile?.rol)) return false;
    return true;
  });
}

export function allNavItems(profile, perms) {
  const ids = [...new Set([...OFICINA_GROUPS.flatMap((g) => g.items), ...ANALISIS_IDS])];
  return filterNavIds(ids, profile, perms).map(navItem).filter(Boolean);
}

export function labelForView(viewId) {
  if (viewId === ANALISIS_HUB_ID) return "Análisis";
  return NAV_META[viewId]?.label || CAMPO_TABS.find((t) => t.id === viewId)?.label || "";
}
