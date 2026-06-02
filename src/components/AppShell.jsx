import React, { useState, useEffect, useCallback, lazy, Suspense } from "react";
import {
  Anchor, LayoutDashboard, Ship, Sailboat, CalendarClock, Calendar, Inbox, ClipboardList,
  Package, Warehouse, Gauge, Activity, AlertTriangle, ClipboardCheck, DollarSign,
  TrendingUp, FileText, History, Layers, Bell, LogOut, UserCircle, UserCog,
  Wifi, WifiOff, RefreshCw, CheckCircle2, BarChart3, ShipWheel, Fuel, ShieldCheck,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { fetchAll } from "../lib/db";
import { useOnline, outboxCount, flushOutbox } from "../lib/offline";
import { C, archivo, rolLabel, ROLES, isAdmin } from "../theme";
import { Card, InlineSpinner, PageHead } from "../ui";

const Tablero       = lazy(() => import("./Tablero"));
const Alertas       = lazy(() => import("./Alertas"));
const MGM           = lazy(() => import("./MGM"));
const Embarcaciones = lazy(() => import("./Embarcaciones"));
const Equipos       = lazy(() => import("./Equipos"));
const Prezarpe      = lazy(() => import("./Prezarpe"));
const Cumplimiento  = lazy(() => import("./Cumplimiento"));
const PlanPM        = lazy(() => import("./PlanPM"));
const Programacion  = lazy(() => import("./Programacion"));
const Solicitudes   = lazy(() => import("./Solicitudes"));
const OrdenesTrabajo= lazy(() => import("./OrdenesTrabajo"));
const Inventario    = lazy(() => import("./Inventario"));
const Almacen       = lazy(() => import("./Almacen"));
const KPIs          = lazy(() => import("./KPIs"));
const Criticidad    = lazy(() => import("./Criticidad"));
const Fallas        = lazy(() => import("./Fallas"));
const Pareto        = lazy(() => import("./Pareto"));
const Consumos      = lazy(() => import("./Consumos"));
const AuditoriaMES  = lazy(() => import("./AuditoriaMES"));
const CGM           = lazy(() => import("./CGM"));
const Weibull       = lazy(() => import("./Weibull"));
const Reportes      = lazy(() => import("./Reportes"));
const Bitacora      = lazy(() => import("./Bitacora"));
const Usuarios      = lazy(() => import("./Usuarios"));

// Estructura de navegación (los módulos se conectan a la base de datos uno a uno)
const NAV = [
  { id: "dashboard", label: "Tablero", icon: LayoutDashboard, group: "Principal" },
  { id: "alertas", label: "Alertas", icon: Bell, group: "Principal" },
  { id: "mgm", label: "Modelo MGM", icon: Layers, group: "Principal" },
  { id: "embarcaciones", label: "Embarcaciones", icon: Sailboat, group: "Flota" },
  { id: "equipos", label: "Equipos", icon: Ship, group: "Flota" },
  { id: "prezarpe", label: "Prezarpe", icon: ShipWheel, group: "Flota" },
  { id: "cumplimiento", label: "Cumplimiento", icon: ShieldCheck, group: "Flota" },
  { id: "planpm", label: "Plan Preventivo", icon: CalendarClock, group: "Operación" },
  { id: "programa", label: "Programación", icon: Calendar, group: "Operación" },
  { id: "solicitudes", label: "Solicitudes", icon: Inbox, group: "Operación" },
  { id: "ots", label: "Órdenes de Trabajo", icon: ClipboardList, group: "Operación" },
  { id: "inventario", label: "Inventario", icon: Package, group: "Operación" },
  { id: "almacen", label: "Almacén & Compras", icon: Warehouse, group: "Operación" },
  { id: "kpis", label: "KPIs & Confiabilidad", icon: Gauge, group: "Análisis" },
  { id: "criticidad", label: "Criticidad", icon: Activity, group: "Análisis" },
  { id: "fallas", label: "Análisis de Fallas", icon: AlertTriangle, group: "Análisis" },
  { id: "pareto", label: "Pareto (80/20)", icon: BarChart3, group: "Análisis" },
  { id: "consumos", label: "Consumos & Eficiencia", icon: Fuel, group: "Análisis" },
  { id: "auditoria", label: "Auditoría MES", icon: ClipboardCheck, group: "Análisis" },
  { id: "costos", label: "Costo Global (CGM)", icon: DollarSign, group: "Optimización" },
  { id: "optim", label: "Optimización", icon: TrendingUp, group: "Optimización" },
  { id: "reportes", label: "Reportes", icon: FileText, group: "Sistema" },
  { id: "bitacora", label: "Bitácora", icon: History, group: "Sistema" },
  { id: "usuarios", label: "Usuarios", icon: UserCog, group: "Sistema", adminOnly: true },
];

// Módulos ya conectados a la base de datos (los 18)
const MODULOS = {
  dashboard: Tablero,
  alertas: Alertas,
  mgm: MGM,
  embarcaciones: Embarcaciones,
  equipos: Equipos,
  prezarpe: Prezarpe,
  cumplimiento: Cumplimiento,
  planpm: PlanPM,
  programa: Programacion,
  solicitudes: Solicitudes,
  ots: OrdenesTrabajo,
  inventario: Inventario,
  almacen: Almacen,
  kpis: KPIs,
  criticidad: Criticidad,
  fallas: Fallas,
  pareto: Pareto,
  consumos: Consumos,
  auditoria: AuditoriaMES,
  costos: CGM,
  optim: Weibull,
  reportes: Reportes,
  bitacora: Bitacora,
  usuarios: Usuarios,
};

export default function AppShell() {
  const { profile, empresa, signOut } = useAuth();
  const online = useOnline();
  const [view, setView] = useState("dashboard");
  const [navParams, setNavParams] = useState(null);  // contexto al navegar (ej. OT a resaltar)
  const [armador, setArmador] = useState(null);      // usuario Armador (admin_empresa) de la organización
  const [pendientes, setPendientes] = useState(0);

  // Navega a un módulo, opcionalmente con parámetros (ej. { otId }).
  const navegar = useCallback((destino, params = null) => {
    setView(destino);
    setNavParams(params);
  }, []);
  const [sincronizando, setSincronizando] = useState(false);
  const [recienSync, setRecienSync] = useState(false);
  // Oculta las entradas solo-admin a quien no lo es
  const visibleNav = NAV.filter((n) => !n.adminOnly || isAdmin(profile?.rol));
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
      {/* SIDEBAR */}
      <aside style={{ width: 250, background: `linear-gradient(180deg, ${C.abyss}, ${C.deep})`, color: C.foam, display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ padding: "20px 18px 16px", borderBottom: "1px solid rgba(255,255,255,.08)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 9, background: C.gold, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Anchor size={21} color={C.abyss} strokeWidth={2.4} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14.5, lineHeight: 1.1 }}>CMMS Korelfox</div>
              <div style={{ fontSize: 10, opacity: 0.6, marginTop: 3, lineHeight: 1.3 }}>
                Energía que impulsa tu rumbo
              </div>
            </div>
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
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 11, padding: "8px 12px", marginBottom: 2, borderRadius: 8, border: "none", cursor: "pointer", textAlign: "left", background: active ? C.gold : "transparent", color: active ? C.abyss : C.foam, fontWeight: active ? 600 : 500, fontSize: 12.5, fontFamily: "inherit" }}>
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
          <button onClick={signOut} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.12)", color: C.foam, borderRadius: 7, padding: "7px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            <LogOut size={14} /> Cerrar sesión
          </button>
        </div>
      </aside>

      {/* CONTENIDO */}
      <main style={{ flex: 1, overflowY: "auto", background: C.mist }}>
        {/* Barra superior: Armador + estado de conexión */}
        <div style={{ position: "sticky", top: 0, zIndex: 20, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "8px 34px", background: online ? "rgba(244,248,251,.92)" : C.yellowBg, borderBottom: `1px solid ${online ? C.line : C.amber}`, backdropFilter: "blur(6px)" }}>
          <span style={{ fontSize: 12, color: C.slate, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            Armador: <strong style={{ color: C.steel }}>{armador || profile?.nombre || "—"}</strong>
            {empresa?.puerto_base ? <span style={{ opacity: 0.7 }}> · {empresa.puerto_base}</span> : null}
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
          </div>
        </div>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 34px 60px" }}>
          <Suspense fallback={<InlineSpinner label="Cargando módulo…" />}>
          {(() => {
            const Modulo = MODULOS[view];
            if (Modulo) return <Modulo onNavigate={navegar} navParams={navParams} />;
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
        </div>
      </main>
    </div>
  );
}
