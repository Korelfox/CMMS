import React, { useState } from "react";
import {
  Anchor, LayoutDashboard, Ship, Sailboat, CalendarClock, Calendar, Inbox, ClipboardList,
  Package, Warehouse, Gauge, Activity, AlertTriangle, ClipboardCheck, DollarSign,
  TrendingUp, FileText, History, Layers, Bell, LogOut, UserCircle,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { C, archivo, rolLabel, ROLES } from "../theme";
import { Card, PageHead } from "../ui";
import Embarcaciones from "./Embarcaciones";
import Equipos from "./Equipos";

// Estructura de navegación (los módulos se conectan a la base de datos uno a uno)
const NAV = [
  { id: "dashboard", label: "Tablero", icon: LayoutDashboard, group: "Principal" },
  { id: "alertas", label: "Alertas", icon: Bell, group: "Principal" },
  { id: "mgm", label: "Modelo MGM", icon: Layers, group: "Principal" },
  { id: "embarcaciones", label: "Embarcaciones", icon: Sailboat, group: "Flota" },
  { id: "equipos", label: "Equipos", icon: Ship, group: "Flota" },
  { id: "planpm", label: "Plan Preventivo", icon: CalendarClock, group: "Operación" },
  { id: "programa", label: "Programación", icon: Calendar, group: "Operación" },
  { id: "solicitudes", label: "Solicitudes", icon: Inbox, group: "Operación" },
  { id: "ots", label: "Órdenes de Trabajo", icon: ClipboardList, group: "Operación" },
  { id: "inventario", label: "Inventario", icon: Package, group: "Operación" },
  { id: "almacen", label: "Almacén & Compras", icon: Warehouse, group: "Operación" },
  { id: "kpis", label: "KPIs & Confiabilidad", icon: Gauge, group: "Análisis" },
  { id: "criticidad", label: "Criticidad", icon: Activity, group: "Análisis" },
  { id: "fallas", label: "Análisis de Fallas", icon: AlertTriangle, group: "Análisis" },
  { id: "auditoria", label: "Auditoría MES", icon: ClipboardCheck, group: "Análisis" },
  { id: "costos", label: "Costo Global (CGM)", icon: DollarSign, group: "Optimización" },
  { id: "optim", label: "Optimización", icon: TrendingUp, group: "Optimización" },
  { id: "reportes", label: "Reportes", icon: FileText, group: "Sistema" },
  { id: "bitacora", label: "Bitácora", icon: History, group: "Sistema" },
];

// Módulos ya conectados a la base de datos
const MODULOS = {
  embarcaciones: Embarcaciones,
  equipos: Equipos,
};

export default function AppShell() {
  const { profile, empresa, signOut } = useAuth();
  const [view, setView] = useState("dashboard");
  const groups = [...new Set(NAV.map((n) => n.group))];
  const roleColor = ROLES[profile?.rol]?.color || C.steel;

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
              <div style={{ fontWeight: 700, fontSize: 14.5, lineHeight: 1.1 }}>CMMS Flota</div>
              <div style={{ fontSize: 10, opacity: 0.6, letterSpacing: 1, textTransform: "uppercase", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {empresa?.nombre || "—"}
              </div>
            </div>
          </div>
        </div>

        <nav style={{ flex: 1, overflowY: "auto", padding: "12px 10px" }}>
          {groups.map((g) => (
            <div key={g} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 9.5, letterSpacing: 2, textTransform: "uppercase", opacity: 0.4, padding: "4px 12px 6px", fontWeight: 600 }}>{g}</div>
              {NAV.filter((n) => n.group === g).map((n) => {
                const active = view === n.id; const Icon = n.icon;
                return (
                  <button key={n.id} onClick={() => setView(n.id)}
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
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 34px 60px" }}>
          {(() => {
            const Modulo = MODULOS[view];
            if (Modulo) return <Modulo />;
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
        </div>
      </main>
    </div>
  );
}
