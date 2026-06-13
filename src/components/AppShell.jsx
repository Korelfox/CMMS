import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import {
  Anchor, LayoutDashboard, Ship, Sailboat, CalendarClock, Calendar, Inbox, ClipboardList,
  Package, Warehouse, Gauge, Activity, AlertTriangle, ClipboardCheck, DollarSign,
  TrendingUp, TrendingDown, FileText, History, Layers, Bell, LogOut, UserCircle, UserCog,
  Wifi, WifiOff, RefreshCw, CheckCircle2, BarChart3, ShipWheel, Fuel, ShieldCheck, Fish,
  Menu, X, Sun, Moon, Building2, Timer, Waves, ListTodo, Microscope, Wrench, CalendarRange,
  ShieldAlert, SlidersHorizontal, PiggyBank, Sparkles, Stethoscope, Bot, Scale,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { fetchAll } from "../lib/db";
import { useOnline, outboxCount, flushOutbox } from "../lib/offline";
import { C, archivo, rolLabel, ROLES, isAdmin, isSuperAdmin, tint } from "../theme";
import { Card, InlineSpinner, PageHead } from "../ui";
import ErrorBoundary from "./ErrorBoundary";

const Tablero       = lazy(() => import("./Tablero"));
const Alertas       = lazy(() => import("./Alertas"));
const MGM           = lazy(() => import("./MGM"));
const Embarcaciones = lazy(() => import("./Embarcaciones"));
const Equipos       = lazy(() => import("./Equipos"));
const Prezarpe      = lazy(() => import("./Prezarpe"));
const Cumplimiento  = lazy(() => import("./Cumplimiento"));
const PlanPM        = lazy(() => import("./PlanPM"));
const Horometros    = lazy(() => import("./Horometros"));
const Programacion  = lazy(() => import("./Programacion"));
const Solicitudes   = lazy(() => import("./Solicitudes"));
const OrdenesTrabajo= lazy(() => import("./OrdenesTrabajo"));
const Inventario    = lazy(() => import("./Inventario"));
const Almacen       = lazy(() => import("./Almacen"));
const KPIs          = lazy(() => import("./KPIs"));
const Criticidad    = lazy(() => import("./Criticidad"));
const Fallas        = lazy(() => import("./Fallas"));
const Pdm           = lazy(() => import("./Pdm"));
const Pareto        = lazy(() => import("./Pareto"));
const Consumos      = lazy(() => import("./Consumos"));
const AuditoriaMES  = lazy(() => import("./AuditoriaMES"));
const CGM           = lazy(() => import("./CGM"));
const Weibull       = lazy(() => import("./Weibull"));
const Reportes      = lazy(() => import("./Reportes"));
const Bitacora      = lazy(() => import("./Bitacora"));
const Rentabilidad  = lazy(() => import("./Rentabilidad"));
const Empresas      = lazy(() => import("./Empresas"));
const Usuarios      = lazy(() => import("./Usuarios"));
const EstadoFlota   = lazy(() => import("./EstadoFlota"));
const Backlog       = lazy(() => import("./Backlog"));
const RCA           = lazy(() => import("./RCA"));
const Varada        = lazy(() => import("./Varada"));
const LucroCesante        = lazy(() => import("./LucroCesante"));
const PlanificacionPuerto = lazy(() => import("./PlanificacionPuerto"));
const RiesgoFalla         = lazy(() => import("./RiesgoFalla"));
const MinMaxSugerido      = lazy(() => import("./MinMaxSugerido"));
const Presupuesto         = lazy(() => import("./Presupuesto"));
const InformeEjecutivo    = lazy(() => import("./InformeEjecutivo"));
const DiagnosticoFallas   = lazy(() => import("./DiagnosticoFallas"));
const CopilotoFlota       = lazy(() => import("./CopilotoFlota"));
const OptimizadorVentana  = lazy(() => import("./OptimizadorVentana"));

const INTERVALOS_REFRESH = [
  { label: "5 min",       s: 300  },
  { label: "10 min",      s: 600  },
  { label: "15 min",      s: 900  },
  { label: "30 min",      s: 1800 },
  { label: "1 hora",      s: 3600 },
  { label: "Desactivado", s: 0    },
];
function fmtTimer(s) {
  if (s <= 0) return "--:--";
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  return `${m}:${(s % 60).toString().padStart(2, "0")}`;
}

// Estructura de navegación (los módulos se conectan a la base de datos uno a uno)
const NAV = [
  { id: "dashboard", label: "Tablero", icon: LayoutDashboard, group: "Principal" },
  { id: "alertas", label: "Alertas", icon: Bell, group: "Principal" },
  { id: "flota", label: "Estado de Flota", icon: Anchor, group: "Principal" },
  { id: "copiloto", label: "Copiloto IA",           icon: Bot,      group: "Principal" },
  { id: "informe",  label: "Informe Ejecutivo IA", icon: Sparkles, group: "Principal" },
  { id: "mgm", label: "Modelo MGM", icon: Layers, group: "Principal" },
  { id: "embarcaciones", label: "Embarcaciones", icon: Sailboat, group: "Flota" },
  { id: "equipos", label: "Equipos", icon: Ship, group: "Flota" },
  { id: "prezarpe", label: "Prezarpe", icon: ShipWheel, group: "Flota" },
  { id: "cumplimiento", label: "Cumplimiento", icon: ShieldCheck, group: "Flota" },
  { id: "horometros", label: "Horómetros", icon: Timer, group: "Operación" },
  { id: "planpm", label: "Plan Preventivo", icon: CalendarClock, group: "Operación" },
  { id: "solicitudes", label: "Solicitudes", icon: Inbox, group: "Operación" },
  { id: "ots", label: "Órdenes de Trabajo", icon: ClipboardList, group: "Operación" },
  { id: "backlog",     label: "Backlog",             icon: ListTodo,     group: "Operación" },
  { id: "planpuerto", label: "Ventana de Puerto",  icon: CalendarRange, group: "Operación" },
  { id: "optimvt",    label: "Optimizador de Ventana", icon: Scale,     group: "Operación" },
  { id: "programa",   label: "Programación",        icon: Calendar,     group: "Operación" },
  { id: "varada", label: "Varadas & Paradas", icon: Wrench, group: "Operación" },
  { id: "inventario", label: "Inventario", icon: Package, group: "Operación" },
  { id: "almacen", label: "Almacén & Compras", icon: Warehouse, group: "Operación" },
  { id: "criticidad",  label: "Criticidad",            icon: Activity,       group: "Análisis" },
  { id: "kpis",        label: "KPIs & Confiabilidad",  icon: Gauge,          group: "Análisis" },
  { id: "lucro",       label: "Lucro Cesante",          icon: TrendingDown,       group: "Análisis" },
  { id: "riesgo",      label: "Riesgo de Falla",        icon: ShieldAlert,        group: "Análisis" },
  { id: "diagnostico", label: "Diagnóstico de Fallas IA", icon: Stethoscope,      group: "Análisis" },
  { id: "minmax",      label: "Min/Max Sugerido",        icon: SlidersHorizontal,  group: "Análisis" },
  { id: "pareto",      label: "Pareto (80/20)",         icon: BarChart3,           group: "Análisis" },
  { id: "fallas",      label: "Análisis de Fallas",    icon: AlertTriangle,  group: "Análisis" },
  { id: "rca",         label: "Causa Raíz (RCA)",       icon: Microscope,     group: "Análisis" },
  { id: "pdm",         label: "Predictivo (PdM)",       icon: Waves,          group: "Análisis" },
  { id: "consumos",    label: "Consumos & Eficiencia",  icon: Fuel,           group: "Análisis" },
  { id: "auditoria",   label: "Auditoría MES",          icon: ClipboardCheck, group: "Análisis" },
  { id: "rentabilidad",  label: "Rentabilidad por Marea",  icon: Fish,     group: "Comercial" },
  { id: "presupuesto",   label: "Presupuesto & Run-rate",  icon: PiggyBank, group: "Comercial" },
  { id: "costos", label: "Costo Global (CGM)", icon: DollarSign, group: "Optimización" },
  { id: "optim", label: "Optimización", icon: TrendingUp, group: "Optimización" },
  { id: "reportes", label: "Reportes", icon: FileText, group: "Sistema" },
  { id: "bitacora", label: "Bitácora", icon: History, group: "Sistema" },
  { id: "usuarios", label: "Usuarios", icon: UserCog, group: "Sistema", adminOnly: true },
  { id: "empresas", label: "Empresas & Flotas", icon: Building2, group: "Sistema", superAdminOnly: true },
];

// Módulos ya conectados a la base de datos (los 18)
const MODULOS = {
  dashboard: Tablero,
  alertas: Alertas,
  flota: EstadoFlota,
  backlog: Backlog,
  varada: Varada,
  rca: RCA,
  mgm: MGM,
  embarcaciones: Embarcaciones,
  equipos: Equipos,
  prezarpe: Prezarpe,
  cumplimiento: Cumplimiento,
  planpm: PlanPM,
  horometros: Horometros,
  programa: Programacion,
  solicitudes: Solicitudes,
  ots: OrdenesTrabajo,
  inventario: Inventario,
  almacen: Almacen,
  kpis: KPIs,
  lucro: LucroCesante,
  planpuerto: PlanificacionPuerto,
  optimvt:    OptimizadorVentana,
  riesgo: RiesgoFalla,
  diagnostico: DiagnosticoFallas,
  minmax: MinMaxSugerido,
  presupuesto: Presupuesto,
  copiloto: CopilotoFlota,
  informe:  InformeEjecutivo,
  criticidad: Criticidad,
  fallas: Fallas,
  pdm: Pdm,
  pareto: Pareto,
  consumos: Consumos,
  auditoria: AuditoriaMES,
  costos: CGM,
  optim: Weibull,
  reportes: Reportes,
  bitacora:      Bitacora,
  rentabilidad:  Rentabilidad,
  usuarios: Usuarios,
  empresas: Empresas,
};

export default function AppShell() {
  const { profile, empresa, signOut } = useAuth();
  const online = useOnline();
  const [view, setView] = useState("dashboard");
  const [navParams, setNavParams] = useState(null);  // contexto al navegar (ej. OT a resaltar)
  const [armador, setArmador] = useState(null);      // usuario Armador (admin_empresa) de la organización
  const [pendientes, setPendientes] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false); // drawer móvil
  const [refreshInterval, setRefreshInterval] = useState(() => {
    try { return parseInt(localStorage.getItem("cmms-refresh-interval") || "1800", 10); } catch { return 1800; }
  });
  const [timeLeft, setTimeLeft]     = useState(() => {
    try { return parseInt(localStorage.getItem("cmms-refresh-interval") || "1800", 10); } catch { return 1800; }
  });
  const [refreshTick, setRefreshTick]       = useState(0);
  const [showRefreshCfg, setShowRefreshCfg] = useState(false);
  const refreshCfgRef = useRef(null);
  const [dark, setDark] = useState(() => {
    try { return document.documentElement.dataset.theme === "dark"; } catch { return false; }
  });

  function toggleTema() {
    setDark((d) => {
      const next = !d;
      document.documentElement.dataset.theme = next ? "dark" : "light";
      try { localStorage.setItem("cmms-theme", next ? "dark" : "light"); } catch { /* sin storage */ }
      return next;
    });
  }

  // Navega a un módulo, opcionalmente con parámetros (ej. { otId }).
  const navegar = useCallback((destino, params = null) => {
    setView(destino);
    setNavParams(params);
    setSidebarOpen(false); // cierra el drawer al navegar (móvil)
  }, []);
  const [sincronizando, setSincronizando] = useState(false);
  const [recienSync, setRecienSync] = useState(false);
  // Oculta las entradas solo-admin a quien no lo es
  const visibleNav = NAV.filter((n) =>
    (!n.adminOnly || isAdmin(profile?.rol)) &&
    (!n.superAdminOnly || isSuperAdmin(profile?.rol)));
  const groups = [...new Set(visibleNav.map((n) => n.group))];
  const roleColor = ROLES[profile?.rol]?.color || C.steel;

  const refrescarPendientes = useCallback(async () => { setPendientes(await outboxCount()); }, []);

  const sincronizar = useCallback(async () => {
    if (sincronizando) return;
    setSincronizando(true);
    try {
      const r = await flushOutbox();
      await refrescarPendientes();
      if (r.ok > 0) { setRecienSync(true); setTimeout(() => setRecienSync(false), 3000); }
    } finally { setSincronizando(false); }
  }, [sincronizando, refrescarPendientes]);

  // Cuenta inicial + escucha cambios del outbox
  useEffect(() => {
    refrescarPendientes();
    const onChange = () => refrescarPendientes();
    window.addEventListener("cmms-outbox", onChange);
    return () => window.removeEventListener("cmms-outbox", onChange);
  }, [refrescarPendientes]);

  // ── Auto-refresh countdown ──────────────────────────────────────────────
  useEffect(() => {
    try { localStorage.setItem("cmms-refresh-interval", String(refreshInterval)); } catch { /* almacenamiento local no disponible */ }
    if (refreshInterval <= 0) return;
    setTimeLeft(refreshInterval);
    const t = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) { setRefreshTick((n) => n + 1); return refreshInterval; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [refreshInterval]);

  // Cierra popover al hacer clic fuera
  useEffect(() => {
    if (!showRefreshCfg) return;
    const fn = (e) => { if (refreshCfgRef.current && !refreshCfgRef.current.contains(e.target)) setShowRefreshCfg(false); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [showRefreshCfg]);

  function forzarRefresh() {
    setRefreshTick((n) => n + 1);
    if (refreshInterval > 0) setTimeLeft(refreshInterval);
  }

  // Al recuperar señal, intenta subir lo pendiente automáticamente
  useEffect(() => {
    if (online) sincronizar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  // Identifica al Armador de la organización: el usuario con rol admin_empresa;
  // si no hay, se usa el Super Admin como respaldo.
  useEffect(() => {
    if (!empresa?.id) return;
    let vivo = true;
    (async () => {
      try {
        const profs = await fetchAll("profiles");
        const arm = profs.find((p) => p.rol === "admin_empresa") || profs.find((p) => p.rol === "super_admin");
        if (vivo) setArmador(arm?.nombre || null);
      } catch { /* sin datos: la barra usará el respaldo */ }
    })();
    return () => { vivo = false; };
  }, [empresa?.id]);

  return (
    <div style={{ display: "flex", height: "100vh", color: C.ink, overflow: "hidden" }}>
      {/* OVERLAY (solo móvil, al abrir el drawer) */}
      <div className={`cmms-overlay${sidebarOpen ? " cmms-overlay-open" : ""}`}
        onClick={() => setSidebarOpen(false)}
        style={{ position: "fixed", inset: 0, background: "rgba(8,20,32,.55)", zIndex: 40, display: "none" }} />

      {/* SIDEBAR */}
      <aside className={`cmms-sidebar${sidebarOpen ? " cmms-sidebar-open" : ""}`}
        style={{ width: 250, background: `linear-gradient(180deg, ${C.navBg1}, ${C.navBg2})`, color: C.navFg, display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ padding: "20px 18px 16px", borderBottom: "1px solid rgba(255,255,255,.08)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 9, background: C.gold, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Anchor size={21} color={C.navBg1} strokeWidth={2.4} />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14.5, lineHeight: 1.1 }}>CMMS Korelfox</div>
              <div style={{ fontSize: 10, opacity: 0.6, marginTop: 3, lineHeight: 1.3 }}>
                Energía que impulsa tu rumbo
              </div>
            </div>
            {/* Cerrar drawer — solo móvil */}
            <button className="cmms-sidebar-close" onClick={() => setSidebarOpen(false)}
              style={{ display: "none", background: "rgba(255,255,255,.08)", border: "none", borderRadius: 7, color: C.navFg, cursor: "pointer", padding: 6, alignItems: "center", justifyContent: "center" }}>
              <X size={18} />
            </button>
          </div>
        </div>

        <nav style={{ flex: 1, overflowY: "auto", padding: "12px 10px" }}>
          {groups.map((g) => (
            <div key={g} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 9.5, letterSpacing: 2, textTransform: "uppercase", opacity: 0.4, padding: "4px 12px 6px", fontWeight: 600 }}>{g}</div>
              {visibleNav.filter((n) => n.group === g).map((n) => {
                const active = view === n.id; const Icon = n.icon;
                return (
                  <button key={n.id} onClick={() => navegar(n.id)}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 11, padding: "8px 12px", marginBottom: 2, borderRadius: 8, border: "none", cursor: "pointer", textAlign: "left", background: active ? C.gold : "transparent", color: active ? C.navBg1 : C.navFg, fontWeight: active ? 600 : 500, fontSize: 12.5, fontFamily: "inherit" }}>
                    <Icon size={16} strokeWidth={active ? 2.4 : 2} /><span>{n.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Usuario + cerrar sesión */}
        <div style={{ padding: "12px 14px", borderTop: "1px solid rgba(255,255,255,.08)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: roleColor, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <UserCircle size={20} color="#fff" />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{profile?.nombre || "Usuario"}</div>
              <div style={{ fontSize: 10, opacity: 0.55 }}>{rolLabel(profile?.rol)}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 7 }}>
            <button onClick={signOut} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.12)", color: C.navFg, borderRadius: 7, padding: "7px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              <LogOut size={14} /> Cerrar sesión
            </button>
            <button onClick={toggleTema} title={dark ? "Modo día" : "Modo noche"} aria-label="Cambiar tema"
              style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.12)", color: dark ? C.gold : C.navFg, borderRadius: 7, padding: "7px 10px", cursor: "pointer" }}>
              {dark ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </div>
        </div>
      </aside>

      {/* CONTENIDO */}
      <main style={{ flex: 1, overflowY: "auto", background: C.mist }}>
        {/* Barra superior: Armador + estado de conexión */}
        <div className="cmms-topbar" style={{ position: "sticky", top: 0, zIndex: 20, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, background: online ? tint(C.surface, 92) : C.yellowBg, borderBottom: `1px solid ${online ? C.line : C.amber}`, backdropFilter: "blur(6px)" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: C.slate, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            <button className="cmms-hamburger" onClick={() => setSidebarOpen(true)}
              aria-label="Abrir menú"
              style={{ display: "none", background: "none", border: `1px solid ${C.line}`, borderRadius: 8, color: C.steel, cursor: "pointer", padding: 6, alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Menu size={18} />
            </button>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
              Armador: <strong style={{ color: C.steel }}>{armador || profile?.nombre || "—"}</strong>
              {empresa?.puerto_base ? <span style={{ opacity: 0.7 }}> · {empresa.puerto_base}</span> : null}
            </span>
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {recienSync && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: C.green }}>
                <CheckCircle2 size={15} /> Sincronizado
              </span>
            )}
            {pendientes > 0 && (
              <button onClick={sincronizar} disabled={!online || sincronizando}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "#7a5b00", background: C.amber, border: "none", borderRadius: 20, padding: "5px 12px", cursor: online && !sincronizando ? "pointer" : "default", opacity: online && !sincronizando ? 1 : 0.7 }}>
                <RefreshCw size={13} className={sincronizando ? "spin" : ""} style={sincronizando ? { animation: "spin 1s linear infinite" } : undefined} />
                {sincronizando ? "Sincronizando…" : `${pendientes} por subir`}
              </button>
            )}
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: online ? C.green : "#7a5b00" }}>
              {online ? <Wifi size={15} /> : <WifiOff size={15} />}
              {online ? "En línea" : "Sin conexión"}
            </span>

            {/* ── Refresh timer ── */}
            <div style={{ position: "relative" }} ref={refreshCfgRef}>
              <button onClick={() => setShowRefreshCfg((v) => !v)} title="Configurar actualización automática"
                style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 700,
                  color: refreshInterval > 0 && timeLeft < 60 ? C.amber : C.slate,
                  background: showRefreshCfg ? tint(C.sky, 12) : "none",
                  border: `1px solid ${showRefreshCfg ? tint(C.sky, 30) : C.line}`,
                  borderRadius: 20, padding: "4px 10px", cursor: "pointer",
                  fontFamily: "'IBM Plex Mono', monospace", transition: "color .2s" }}>
                <RefreshCw size={12} />
                {refreshInterval > 0 ? fmtTimer(timeLeft) : "—"}
              </button>

              {showRefreshCfg && (
                <div style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", background: C.surface,
                  border: `1px solid ${C.line}`, borderRadius: 12, padding: "8px 6px", zIndex: 200, minWidth: 180,
                  boxShadow: "0 6px 24px rgba(0,0,0,.14)" }}>
                  <div style={{ fontSize: 10.5, color: C.slate, fontWeight: 700, textTransform: "uppercase",
                    letterSpacing: 0.6, padding: "4px 10px 8px" }}>
                    Actualización automática
                  </div>
                  {INTERVALOS_REFRESH.map((op) => (
                    <button key={op.s}
                      onClick={() => { setRefreshInterval(op.s); setTimeLeft(op.s || 0); setShowRefreshCfg(false); }}
                      style={{ display: "block", width: "100%", textAlign: "left", padding: "7px 12px", borderRadius: 8,
                        border: "none", background: refreshInterval === op.s ? tint(C.sky, 14) : "none",
                        color: refreshInterval === op.s ? C.sky : C.ink, fontWeight: refreshInterval === op.s ? 700 : 400,
                        fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                      {op.label}
                      {refreshInterval === op.s && refreshInterval > 0 && (
                        <span style={{ fontSize: 11, color: C.steel, marginLeft: 8, fontFamily: "'IBM Plex Mono', monospace" }}>
                          {fmtTimer(timeLeft)}
                        </span>
                      )}
                    </button>
                  ))}
                  <div style={{ borderTop: `1px solid ${C.line}`, marginTop: 6, paddingTop: 6 }}>
                    <button onClick={() => { forzarRefresh(); setShowRefreshCfg(false); }}
                      style={{ display: "flex", alignItems: "center", gap: 7, width: "100%", padding: "7px 12px",
                        borderRadius: 8, border: "none", background: "none", color: C.sky,
                        fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                      <RefreshCw size={13} /> Actualizar ahora
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="cmms-work-area" style={{ maxWidth: "100%", margin: "0 auto" }}>
          <ErrorBoundary key={view}>
          <Suspense fallback={<InlineSpinner label="Cargando módulo…" />}>
          {(() => {
            const Modulo = MODULOS[view];
            if (Modulo) return <Modulo key={`${view}-${refreshTick}`} onNavigate={navegar} navParams={navParams} />;
            return (
              <>
                <PageHead
                  kicker={NAV.find((n) => n.id === view)?.group}
                  title={NAV.find((n) => n.id === view)?.label}
                  sub="Módulo en proceso de conexión a la base de datos."
                />
                <Card>
                  <div style={{ padding: "40px 0", textAlign: "center", color: C.slate }}>
                    <div style={{ ...archivo, fontSize: 16, fontWeight: 700, color: C.abyss, marginBottom: 8 }}>
                      Próximamente
                    </div>
                    <p style={{ fontSize: 13.5, maxWidth: 460, margin: "0 auto", lineHeight: 1.6 }}>
                      Este módulo se conectará a la base de datos en una próxima entrega.
                      Sesión activa como <strong>{profile?.nombre}</strong> ({rolLabel(profile?.rol)}) en <strong>{empresa?.nombre}</strong>.
                    </p>
                  </div>
                </Card>
              </>
            );
          })()}
          </Suspense>
          </ErrorBoundary>
        </div>
      </main>

      {/* Padding responsivo + sidebar colapsable en móvil */}
      <style>{`
        .cmms-topbar    { padding: 8px 34px; }
        .cmms-work-area { padding: 28px 30px 60px; }
        @media (max-width: 760px) {
          .cmms-topbar    { padding: 8px 14px; }
          .cmms-work-area { padding: 18px 12px 48px; }

          /* Sidebar se convierte en drawer */
          .cmms-sidebar {
            position: fixed; top: 0; left: 0; height: 100vh; z-index: 50;
            transform: translateX(-100%);
            transition: transform .25s ease;
            box-shadow: 2px 0 24px rgba(0,0,0,.35);
          }
          .cmms-sidebar.cmms-sidebar-open { transform: translateX(0); }
          .cmms-sidebar-close { display: inline-flex !important; }
          .cmms-hamburger     { display: inline-flex !important; }
          .cmms-overlay.cmms-overlay-open { display: block !important; }
        }
        @media (max-width: 440px) {
          .cmms-topbar    { padding: 7px 9px; }
          .cmms-work-area { padding: 14px 7px 40px; }
        }
      `}</style>
    </div>
  );
}
