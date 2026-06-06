import React, { useState, useEffect, useCallback, lazy, Suspense } from "react";
import {
  Anchor, LayoutDashboard, Ship, Sailboat, CalendarClock, Calendar, Inbox, ClipboardList,
  Package, Warehouse, Gauge, Activity, AlertTriangle, ClipboardCheck, DollarSign,
  TrendingUp, FileText, History, Layers, Bell, LogOut, UserCircle, UserCog,
  Wifi, WifiOff, RefreshCw, CheckCircle2, BarChart3, ShipWheel, Fuel, ShieldCheck, Fish,
  Menu, X,
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
const Rentabilidad  = lazy(() => import("./Rentabilidad"));
const Usuarios      = lazy(() => import("./Usuarios"));

// Estructura de navegaciÃ³n (los mÃ³dulos se conectan a la base de datos uno a uno)
const NAV = [
  { id: "dashboard", label: "Tablero", icon: LayoutDashboard, group: "Principal" },
  { id: "alertas", label: "Alertas", icon: Bell, group: "Principal" },
  { id: "mgm", label: "Modelo MGM", icon: Layers, group: "Principal" },
  { id: "embarcaciones", label: "Embarcaciones", icon: Sailboat, group: "Flota" },
  { id: "equipos", label: "Equipos", icon: Ship, group: "Flota" },
  { id: "prezarpe", label: "Prezarpe", icon: ShipWheel, group: "Flota" },
  { id: "cumplimiento", label: "Cumplimiento", icon: ShieldCheck, group: "Flota" },
  { id: "planpm", label: "Plan Preventivo", icon: CalendarClock, group: "OperaciÃ³n" },
  { id: "programa", label: "ProgramaciÃ³n", icon: Calendar, group: "OperaciÃ³n" },
  { id: "solicitudes", label: "Solicitudes", icon: Inbox, group: "OperaciÃ³n" },
  { id: "ots", label: "Ã“rdenes de Trabajo", icon: ClipboardList, group: "OperaciÃ³n" },
  { id: "inventario", label: "Inventario", icon: Package, group: "OperaciÃ³n" },
  { id: "almacen", label: "AlmacÃ©n & Compras", icon: Warehouse, group: "OperaciÃ³n" },
  { id: "kpis", label: "KPIs & Confiabilidad", icon: Gauge, group: "AnÃ¡lisis" },
  { id: "criticidad", label: "Criticidad", icon: Activity, group: "AnÃ¡lisis" },
  { id: "fallas", label: "AnÃ¡lisis de Fallas", icon: AlertTriangle, group: "AnÃ¡lisis" },
  { id: "pareto", label: "Pareto (80/20)", icon: BarChart3, group: "AnÃ¡lisis" },
  { id: "consumos",      label: "Consumos & Eficiencia",  icon: Fuel,          group: "AnÃ¡lisis"  },
  { id: "auditoria",     label: "AuditorÃ­a MES",          icon: ClipboardCheck, group: "AnÃ¡lisis"  },
  { id: "rentabilidad",  label: "Rentabilidad por Marea", icon: Fish,           group: "Comercial" },
  { id: "costos", label: "Costo Global (CGM)", icon: DollarSign, group: "OptimizaciÃ³n" },
  { id: "optim", label: "OptimizaciÃ³n", icon: TrendingUp, group: "OptimizaciÃ³n" },
  { id: "reportes", label: "Reportes", icon: FileText, group: "Sistema" },
  { id: "bitacora", label: "BitÃ¡cora", icon: History, group: "Sistema" },
  { id: "usuarios", label: "Usuarios", icon: UserCog, group: "Sistema", adminOnly: true },
];

// MÃ³dulos ya conectados a la base de datos (los 18)
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
  bitacora:      Bitacora,
  rentabilidad:  Rentabilidad,
  usuarios: Usuarios,
};

export default function AppShell() {
  const { profile, empresa, signOut } = useAuth();
  const online = useOnline();
  const [view, setView] = useState("dashboard");
  const [navParams, setNavParams] = useState(null);  // contexto al navegar (ej. OT a resaltar)
  const [armador, setArmador] = useState(null);      // usuario Armador (admin_empresa) de la organizaciÃ³n
  const [pendientes, setPendientes] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false); // drawer mÃ³vil

  // Navega a un mÃ³dulo, opcionalmente con parÃ¡metros (ej. { otId }).
  const navegar = useCallback((destino, params = null) => {
    setView(destino);
    setNavParams(params);
    setSidebarOpen(false); // cierra el drawer al navegar (mÃ³vil)
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

  // Al recuperar seÃ±al, intenta subir lo pendiente automÃ¡ticamente
  useEffect(() => {
    if (online) sincronizar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  // Identifica al Armador de la organizaciÃ³n: el usuario con rol admin_empresa;
  // si no hay, se usa el Super Admin como respaldo.
  useEffect(() => {
    if (!empresa?.id) return;
    let vivo = true;
    (async () => {
      try {
        const profs = await fetchAll("profiles");
        const arm = profs.find((p) => p.rol === "admin_empresa") || profs.find((p) => p.rol === "super_admin");
        if (vivo) setArmador(arm?.nombre || null);
      } catch { /* sin datos: la barra usarÃ¡ el respaldo */ }
    })();
    return () => { vivo = false; };
  }, [empresa?.id]);

  return (
    <div style={{ display: "flex", height: "100vh", color: C.ink, overflow: "hidden" }}>
      {/* OVERLAY (solo mÃ³vil, al abrir el drawer) */}
      <div className={`cmms-overlay${sidebarOpen ? " cmms-overlay-open" : ""}`}
        onClick={() => setSidebarOpen(false)}
        style={{ position: "fixed", inset: 0, background: "rgba(8,20,32,.55)", zIndex: 40, display: "none" }} />

      {/* SIDEBAR */}
      <aside className={`cmms-sidebar${sidebarOpen ? " cmms-sidebar-open" : ""}`}
        style={{ width: 250, background: `linear-gradient(180deg, ${C.abyss}, ${C.deep})`, color: C.foam, display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ padding: "20px 18px 16px", borderBottom: "1px solid rgba(255,255,255,.08)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 9, background: C.gold, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Anchor size={21} color={C.abyss} strokeWidth={2.4} />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14.5, lineHeight: 1.1 }}>CMMS Korelfox</div>
              <div style={{ fontSize: 10, opacity: 0.6, marginTop: 3, lineHeight: 1.3 }}>
                EnergÃ­a que impulsa tu rumbo
              </div>
            </div>
            {/* Cerrar drawer â€” solo mÃ³vil */}
            <button className="cmms-sidebar-close" onClick={() => setSidebarOpen(false)}
              style={{ display: "none", background: "rgba(255,255,255,.08)", border: "none", borderRadius: 7, color: C.foam, cursor: "pointer", padding: 6, alignItems: "center", justifyContent: "center" }}>
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
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 11, padding: "8px 12px", marginBottom: 2, borderRadius: 8, border: "none", cursor: "pointer", textAlign: "left", background: active ? C.gold : "transparent", color: active ? C.abyss : C.foam, fontWeight: active ? 600 : 500, fontSize: 12.5, fontFamily: "inherit" }}>
                    <Icon size={16} strokeWidth={active ? 2.4 : 2} /><span>{n.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Usuario + cerrar sesiÃ³n */}
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
            <LogOut size={14} /> Cerrar sesiÃ³n
          </button>
        </div>
      </aside>

      {/* CONTENIDO */}
      <main style={{ flex: 1, overflowY: "auto", background: C.mist }}>
        {/* Barra superior: Armador + estado de conexiÃ³n */}
        <div className="cmms-topbar" style={{ position: "sticky", top: 0, zIndex: 20, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, background: online ? "rgba(244,248,251,.92)" : C.yellowBg, borderBottom: `1px solid ${online ? C.line : C.amber}`, backdropFilter: "blur(6px)" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: C.slate, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            <button className="cmms-hamburger" onClick={() => setSidebarOpen(true)}
              aria-label="Abrir menÃº"
              style={{ display: "none", background: "none", border: `1px solid ${C.line}`, borderRadius: 8, color: C.steel, cursor: "pointer", padding: 6, alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Menu size={18} />
            </button>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
              Armador: <strong style={{ color: C.steel }}>{armador || profile?.nombre || "â€”"}</strong>
              {empresa?.puerto_base ? <span style={{ opacity: 0.7 }}> Â· {empresa.puerto_base}</span> : null}
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
                {sincronizando ? "Sincronizandoâ€¦" : `${pendientes} por subir`}
              </button>
            )}
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: online ? C.green : "#7a5b00" }}>
              {online ? <Wifi size={15} /> : <WifiOff size={15} />}
              {online ? "En lÃ­nea" : "Sin conexiÃ³n"}
            </span>
          </div>
        </div>
        <div className="cmms-work-area" style={{ maxWidth: 1680, margin: "0 auto" }}>
          <Suspense fallback={<InlineSpinner label="Cargando mÃ³duloâ€¦" />}>
          {(() => {
            const Modulo = MODULOS[view];
            if (Modulo) return <Modulo onNavigate={navegar} navParams={navParams} />;
            return (
              <>
                <PageHead
                  kicker={NAV.find((n) => n.id === view)?.group}
                  title={NAV.find((n) => n.id === view)?.label}
                  sub="MÃ³dulo en proceso de conexiÃ³n a la base de datos."
                />
                <Card>
                  <div style={{ padding: "40px 0", textAlign: "center", color: C.slate }}>
                    <div style={{ ...archivo, fontSize: 16, fontWeight: 700, color: C.abyss, marginBottom: 8 }}>
                      PrÃ³ximamente
                    </div>
                    <p style={{ fontSize: 13.5, maxWidth: 460, margin: "0 auto", lineHeight: 1.6 }}>
                      Este mÃ³dulo se conectarÃ¡ a la base de datos en una prÃ³xima entrega.
                      SesiÃ³n activa como <strong>{profile?.nombre}</strong> ({rolLabel(profile?.rol)}) en <strong>{empresa?.nombre}</strong>.
                    </p>
                  </div>
                </Card>
              </>
            );
          })()}
          </Suspense>
        </div>
      </main>

      {/* Padding responsivo + sidebar colapsable en mÃ³vil */}
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
