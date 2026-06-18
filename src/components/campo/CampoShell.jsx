import React, { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { CAMPO_TABS, CAMPO_TAB_KEY, NAV_META } from "../../lib/navigation";
import { C, tint } from "../../theme";
import { InlineSpinner, ghostBtn } from "../../ui";
import ErrorBoundary from "../ErrorBoundary";
import CampoHoy from "./CampoHoy";
import CampoMas from "./CampoMas";
import CampoActivos from "./CampoActivos";

const OrdenesTrabajo = lazy(() => import("../OrdenesTrabajo"));
const Solicitudes = lazy(() => import("../Solicitudes"));
const Horometros = lazy(() => import("../Horometros"));
const Inventario = lazy(() => import("../Inventario"));
const PlanPM = lazy(() => import("../PlanPM"));

const STACK_MODULOS = {
  solicitudes: Solicitudes,
  horometros: Horometros,
  inventario: Inventario,
  planpm: PlanPM,
};

function readTab() {
  try {
    const v = sessionStorage.getItem(CAMPO_TAB_KEY);
    return CAMPO_TABS.some((t) => t.id === v) ? v : "hoy";
  } catch {
    return "hoy";
  }
}

export default function CampoShell({
  refreshTick,
  onTabChange,
  onNavigate,
  onSync,
  pendientes,
  sincronizando,
  online,
}) {
  const [tab, setTab] = useState(readTab);
  const [stackModule, setStackModule] = useState(null);
  const [openOtWizard, setOpenOtWizard] = useState(false);
  const [launchOtId, setLaunchOtId] = useState(null);
  const [campoParams, setCampoParams] = useState({});

  useEffect(() => {
    try { sessionStorage.setItem(CAMPO_TAB_KEY, tab); } catch { /* sin storage */ }
    if (!stackModule) onTabChange?.(tab);
  }, [tab, onTabChange, stackModule]);

  const irTrabajo = useCallback((otId = null) => {
    setStackModule(null);
    setLaunchOtId(otId);
    setOpenOtWizard(true);
    setTab("trabajo");
  }, []);

  useEffect(() => {
    const fn = (e) => {
      const { tab: destTab, otId, params } = e.detail || {};
      if (destTab === "trabajo") {
        irTrabajo(otId || null);
        return;
      }
      if (params) setCampoParams(params);
      if (destTab === "activos") {
        setStackModule(null);
        setTab("activos");
        return;
      }
      if (destTab && CAMPO_TABS.some((t) => t.id === destTab)) setTab(destTab);
    };
    window.addEventListener("cmms-campo-nav", fn);
    return () => window.removeEventListener("cmms-campo-nav", fn);
  }, [irTrabajo]);

  useEffect(() => {
    if (openOtWizard && tab === "trabajo") {
      const t = setTimeout(() => { setOpenOtWizard(false); setLaunchOtId(null); }, 0);
      return () => clearTimeout(t);
    }
  }, [openOtWizard, tab]);

  const campoNavigate = useCallback((dest, params = null) => {
    if (STACK_MODULOS[dest]) {
      setStackModule({ id: dest, params });
      onTabChange?.(dest);
      return;
    }
    onNavigate?.(dest, params);
  }, [onNavigate, onTabChange]);

  const navParamsCampo = { campo: true, openWizard: openOtWizard, otId: launchOtId, ...campoParams };

  if (stackModule) {
    const Mod = STACK_MODULOS[stackModule.id];
    const label = NAV_META[stackModule.id]?.label || stackModule.id;
    return (
      <div className="cmms-campo-shell">
        <div style={{ padding: "0 0 12px", marginBottom: 8, borderBottom: `1px solid ${C.line}` }}>
          <button type="button" onClick={() => { setStackModule(null); onTabChange?.(tab); }} style={{ ...ghostBtn, padding: "6px 10px" }}>
            <ArrowLeft size={16} /> Volver
          </button>
          <span style={{ marginLeft: 10, fontSize: 14, fontWeight: 700, color: C.ink }}>{label}</span>
        </div>
        <div className="cmms-campo-content" style={{ paddingBottom: 24 }}>
          <ErrorBoundary key={stackModule.id}>
            <Suspense fallback={<InlineSpinner label="Cargando…" />}>
              <Mod navParams={{ ...navParamsCampo, ...stackModule.params }} onNavigate={campoNavigate} />
            </Suspense>
          </ErrorBoundary>
        </div>
      </div>
    );
  }

  return (
    <div className="cmms-campo-shell">
      <div className="cmms-campo-content">
        <ErrorBoundary key={tab}>
          <Suspense fallback={<InlineSpinner label="Cargando…" />}>
            {tab === "hoy" && (
              <CampoHoy onIrTrabajo={irTrabajo} onNavigate={campoNavigate} />
            )}
            {tab === "trabajo" && (
              <OrdenesTrabajo
                key={`ots-campo-${refreshTick}-${openOtWizard ? "w" : "n"}`}
                navParams={navParamsCampo}
                onNavigate={onNavigate}
              />
            )}
            {tab === "activos" && (
              <CampoActivos
                key={`act-campo-${refreshTick}`}
                onIrTrabajo={irTrabajo}
                onNavigate={campoNavigate}
              />
            )}
            {tab === "mas" && (
              <CampoMas
                onNavigate={campoNavigate}
                onSync={onSync}
                pendientes={pendientes}
                sincronizando={sincronizando}
                online={online}
              />
            )}
          </Suspense>
        </ErrorBoundary>
      </div>

      <nav className="cmms-campo-tabs" role="tablist" aria-label="Navegación Campo">
        {CAMPO_TABS.map((t) => {
          const active = tab === t.id;
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={`cmms-campo-tab${active ? " cmms-campo-tab-active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              <Icon size={20} strokeWidth={active ? 2.4 : 2} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </nav>

      <style>{`
        .cmms-campo-shell {
          display: flex;
          flex-direction: column;
          min-height: calc(100vh - var(--context-header-h, 52px));
        }
        .cmms-campo-polish {
          font-size: 16px;
        }
        .cmms-campo-polish .cmms-campo-touch,
        .cmms-campo-touch {
          min-height: 48px;
          min-width: 48px;
        }
        .cmms-campo-content {
          flex: 1;
          padding-bottom: 76px;
          font-size: 15px;
        }
        .cmms-campo-tabs {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          z-index: 30;
          display: flex;
          align-items: stretch;
          justify-content: space-around;
          min-height: 62px;
          padding: 6px 8px calc(6px + env(safe-area-inset-bottom, 0px));
          background: ${tint(C.surface, 96)};
          border-top: 1px solid ${C.line};
          backdrop-filter: blur(8px);
        }
        .cmms-campo-tab {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 3px;
          border: none;
          background: none;
          cursor: pointer;
          font-family: inherit;
          font-size: 11px;
          font-weight: 600;
          color: ${C.slate};
          border-radius: 10px;
          padding: 4px 2px;
          transition: color .15s, background .15s;
        }
        .cmms-campo-tab-active {
          color: ${C.sky};
          background: color-mix(in srgb, ${C.sky} 10%, transparent);
        }
        @keyframes cmms-spin { to { transform: rotate(360deg); } }
        .cmms-spin { animation: cmms-spin .8s linear infinite; }
      `}</style>
    </div>
  );
}
