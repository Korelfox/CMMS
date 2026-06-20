import React, { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { CAMPO_TABS, CAMPO_TAB_KEY, NAV_META } from "../../lib/navigation";
import { useCampoSwipe } from "../../lib/useCampoSwipe";
import { C, tint } from "../../theme";
import { InlineSpinner, ghostBtn } from "../../ui";
import ErrorBoundary from "../ErrorBoundary";
import CampoHoy from "./CampoHoy";
import CampoMas from "./CampoMas";
import CampoHorometros from "./CampoHorometros";
import CampoHomeFab from "./CampoHomeFab";
import { useShell } from "../../context/ShellContext";

const OrdenesTrabajo = lazy(() => import("../OrdenesTrabajo"));
const Solicitudes = lazy(() => import("../Solicitudes"));
const Inventario = lazy(() => import("../Inventario"));
const PlanPM = lazy(() => import("../PlanPM"));
const Prezarpe = lazy(() => import("../Prezarpe"));

const STACK_MODULOS = {
  solicitudes: Solicitudes,
  inventario: Inventario,
  planpm: PlanPM,
  prezarpe: Prezarpe,
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
  dark = false,
  onToggleTema,
}) {
  const { embarcacionId } = useShell();
  const [tab, setTab] = useState(readTab);
  const [stackModule, setStackModule] = useState(null);
  const [openOtWizard, setOpenOtWizard] = useState(false);
  const [launchOtId, setLaunchOtId] = useState(null);
  // OT resaltada al llegar desde Hoy. A diferencia de launchOtId (que se limpia
  // en un tick para no reabrir el wizard), persiste para ubicarla en la lista.
  const [highlightOtId, setHighlightOtId] = useState(null);
  const [campoParams, setCampoParams] = useState({});

  const setTabDirect = useCallback((next) => setTab(next), []);

  const { changeTab, swipeHandlers, paneClass } = useCampoSwipe({
    enabled: !stackModule,
    tabs: CAMPO_TABS,
    tab,
    onTabChange: setTabDirect,
  });

  useEffect(() => {
    try { sessionStorage.setItem(CAMPO_TAB_KEY, tab); } catch { /* sin storage */ }
    if (!stackModule) onTabChange?.(tab);
  }, [tab, onTabChange, stackModule]);

  const irTrabajo = useCallback((otId = null) => {
    setStackModule(null);
    setLaunchOtId(otId);
    setHighlightOtId(otId);
    setOpenOtWizard(true);
    setTab("trabajo");
  }, []);

  const irInicio = useCallback(() => {
    setStackModule(null);
    setOpenOtWizard(false);
    setLaunchOtId(null);
    setHighlightOtId(null);
    setCampoParams({});
    setTab("hoy");
    onTabChange?.("hoy");
    window.dispatchEvent(new CustomEvent("cmms-campo-home"));
    requestAnimationFrame(() => {
      document.querySelector(".cmms-campo-content")?.scrollTo?.({ top: 0, behavior: "smooth" });
      document.querySelector(".cmms-work-area")?.scrollTo?.({ top: 0, behavior: "smooth" });
    });
  }, [onTabChange]);

  useEffect(() => {
    const fn = (e) => {
      const { tab: destTab, otId, params } = e.detail || {};
      if (destTab === "hoy") {
        irInicio();
        return;
      }
      if (destTab === "trabajo") {
        irTrabajo(otId || null);
        return;
      }
      if (params) setCampoParams(params);
      if (destTab === "horometros") {
        setStackModule(null);
        changeTab("horometros");
        return;
      }
      if (destTab && CAMPO_TABS.some((t) => t.id === destTab)) changeTab(destTab);
    };
    window.addEventListener("cmms-campo-nav", fn);
    return () => window.removeEventListener("cmms-campo-nav", fn);
  }, [irTrabajo, irInicio, changeTab]);

  useEffect(() => {
    if (openOtWizard && tab === "trabajo") {
      const t = setTimeout(() => { setOpenOtWizard(false); setLaunchOtId(null); }, 0);
      return () => clearTimeout(t);
    }
  }, [openOtWizard, tab]);

  const campoNavigate = useCallback((dest, params = null) => {
    const p = {
      campo: true,
      ...(embarcacionId && !params?.embFiltro ? { embFiltro: embarcacionId } : {}),
      ...(params || {}),
    };
    if (dest === "ots") {
      irTrabajo(p.otId || null);
      return;
    }
    if (STACK_MODULOS[dest]) {
      setStackModule({ id: dest, params: p });
      onTabChange?.(dest);
      return;
    }
    onNavigate?.(dest, p);
  }, [onNavigate, onTabChange, embarcacionId, irTrabajo]);

  const navParamsCampo = { campo: true, openWizard: openOtWizard, otId: launchOtId, highlightOtId, ...campoParams };
  const inStack = !!stackModule;
  const atHome = tab === "hoy" && !inStack;

  let body = null;
  if (inStack) {
    const Mod = STACK_MODULOS[stackModule.id];
    body = (
      <ErrorBoundary key={stackModule.id}>
        <Suspense fallback={<InlineSpinner label="Cargando…" />}>
          <Mod
            navParams={{ ...navParamsCampo, ...stackModule.params }}
            onNavigate={campoNavigate}
          />
        </Suspense>
      </ErrorBoundary>
    );
  } else {
    body = (
      <ErrorBoundary key={tab}>
        <Suspense fallback={<InlineSpinner label="Cargando…" />}>
          {tab === "hoy" && (
            <CampoHoy onIrTrabajo={irTrabajo} onNavigate={campoNavigate} />
          )}
          {tab === "trabajo" && (
            <OrdenesTrabajo
              key={`ots-campo-${refreshTick}-${openOtWizard ? "w" : "n"}`}
              navParams={navParamsCampo}
              onNavigate={campoNavigate}
            />
          )}
          {tab === "horometros" && (
            <CampoHorometros
              key={`hor-campo-${refreshTick}`}
              navParams={navParamsCampo}
            />
          )}
          {tab === "mas" && (
            <CampoMas
              onNavigate={campoNavigate}
              onSync={onSync}
              pendientes={pendientes}
              sincronizando={sincronizando}
              online={online}
              dark={dark}
              onToggleTema={onToggleTema}
            />
          )}
        </Suspense>
      </ErrorBoundary>
    );
  }

  return (
    <div className={`cmms-campo-shell${inStack ? " cmms-campo-shell--stack" : ""}`}>
      {inStack && (
        <div className="cmms-campo-stack-header">
          <button type="button" className="cmms-campo-touch" onClick={() => { setStackModule(null); onTabChange?.(tab); }} style={{ ...ghostBtn, padding: "10px 14px", minHeight: 48 }}>
            <ArrowLeft size={18} /> Volver
          </button>
          <span className="cmms-campo-stack-title">{NAV_META[stackModule.id]?.label || stackModule.id}</span>
        </div>
      )}

      <div
        className={`cmms-campo-content${inStack ? " cmms-campo-stack-body" : ""}`}
        {...(!inStack ? swipeHandlers : {})}
      >
        {!inStack ? <div key={tab} className={paneClass}>{body}</div> : body}
      </div>

      {!inStack && (
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
                onClick={() => changeTab(t.id)}
              >
                <Icon size={20} strokeWidth={active ? 2.4 : 2} />
                <span>{t.label}</span>
              </button>
            );
          })}
        </nav>
      )}

      <CampoHomeFab onClick={irInicio} atHome={atHome} inStack={inStack} />

      <style>{`
        .cmms-campo-shell {
          display: flex;
          flex-direction: column;
          min-height: calc(100vh - var(--context-header-h, 52px));
          min-height: calc(100dvh - var(--context-header-h, 52px));
        }
        .cmms-campo-polish {
          font-size: 16px;
          -webkit-text-size-adjust: 100%;
        }
        .cmms-campo-polish input,
        .cmms-campo-polish select,
        .cmms-campo-polish textarea {
          font-size: 16px !important;
        }
        .cmms-campo-polish .cmms-campo-touch,
        .cmms-campo-touch {
          min-height: 48px;
          min-width: 48px;
          touch-action: manipulation;
        }
        .cmms-campo-content {
          flex: 1;
          padding-bottom: calc(76px + env(safe-area-inset-bottom, 0px));
          font-size: 15px;
          min-width: 0;
          overflow-x: hidden;
          touch-action: pan-y;
        }
        .cmms-campo-pane {
          min-height: 100%;
        }
        @keyframes cmms-campo-slide-from-right {
          from { opacity: 0.55; transform: translateX(28px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes cmms-campo-slide-from-left {
          from { opacity: 0.55; transform: translateX(-28px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .cmms-campo-pane--from-right {
          animation: cmms-campo-slide-from-right 0.26s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .cmms-campo-pane--from-left {
          animation: cmms-campo-slide-from-left 0.26s cubic-bezier(0.22, 1, 0.36, 1);
        }
        @media (prefers-reduced-motion: reduce) {
          .cmms-campo-pane--from-right,
          .cmms-campo-pane--from-left { animation: none; }
        }
        :root:not([data-theme="dark"]) .cmms-campo-shell {
          --cmms-campo-shadow-sm: 0 2px 4px rgba(10,26,42,.08), 0 4px 10px rgba(10,26,42,.07);
          --cmms-campo-shadow-md: 0 4px 10px rgba(10,26,42,.10), 0 10px 24px rgba(10,26,42,.12);
          --cmms-campo-shadow-lg: 0 8px 20px rgba(10,26,42,.14), 0 18px 40px rgba(10,26,42,.10);
        }
        :root:not([data-theme="dark"]) .cmms-campo-shell .cmms-campo-elevated {
          box-shadow: var(--cmms-campo-shadow-md) !important;
        }
        :root:not([data-theme="dark"]) .cmms-campo-tabs {
          box-shadow: 0 -6px 20px rgba(10,26,42,.12), 0 -2px 6px rgba(10,26,42,.06);
          border-top-color: transparent;
        }
        :root:not([data-theme="dark"]) .cmms-campo-home-fab {
          box-shadow: var(--cmms-campo-shadow-lg) !important;
        }
        .cmms-campo-stack-body {
          padding-bottom: calc(24px + env(safe-area-inset-bottom, 0px));
        }
        .cmms-campo-stack-header {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 0 0 12px;
          margin-bottom: 8;
          border-bottom: 1px solid ${C.line};
          min-width: 0;
        }
        .cmms-campo-stack-title {
          font-size: 16px;
          font-weight: 700;
          color: ${C.ink};
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
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
          -webkit-backdrop-filter: blur(8px);
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
          padding: 6px 2px;
          min-height: 52px;
          touch-action: manipulation;
          transition: color .15s, background .15s;
        }
        .cmms-campo-tab-active {
          color: ${C.sky};
          background: color-mix(in srgb, ${C.sky} 10%, transparent);
        }
        .cmms-campo-wizard-steps button {
          min-height: 44px;
          touch-action: manipulation;
        }
        .cmms-checklist-campo .cmms-checklist-row {
          min-height: 48px;
        }
        .cmms-checklist-campo input[type="checkbox"] {
          width: 22px !important;
          height: 22px !important;
        }
        .cmms-detail-shell-campo .cmms-detail-shell-header button {
          min-height: 48px;
          padding: 10px 14px !important;
          font-size: 14px;
        }
        .cmms-detail-shell-campo .cmms-detail-shell-body {
          padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px));
        }
        .cmms-detail-shell-campo .cmms-detail-shell-footer button {
          min-height: 48px;
          flex: 1;
          justify-content: center;
        }
        @media (min-width: 768px) and (max-width: 1024px) {
          .cmms-campo-content { padding-left: 4px; padding-right: 4px; }
          .cmms-campo-tab { font-size: 12px; }
        }
        @keyframes cmms-spin { to { transform: rotate(360deg); } }
        @keyframes cmms-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        .cmms-spin { animation: cmms-spin .8s linear infinite; }
      `}</style>
    </div>
  );
}
