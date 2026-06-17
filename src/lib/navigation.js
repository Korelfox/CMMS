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

/** Hub Análisis — secundario al pie del sidebar Oficina. */
export const ANALISIS_IDS = [
  "dashboard", "alertas", "mgm", "optim", "optimvt", "kpis", "criticidad", "pareto",
  "confiab", "consumos", "minmax", "capex", "auditoria", "lucro", "planpuerto", "diagnostico",
];

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
  return NAV_META[viewId]?.label || CAMPO_TABS.find((t) => t.id === viewId)?.label || "";
}
