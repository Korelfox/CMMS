import React, { useState, useEffect, useRef } from "react";
import {
  Menu, Bell, Wifi, WifiOff, RefreshCw, CheckCircle2, ChevronDown, Sun, Moon,
} from "lucide-react";
import { C, tint } from "../theme";
import { Pill, ghostBtn } from "../ui";
import { useShell } from "../context/ShellContext";
import { useHeaderAlertas } from "../hooks/useHeaderAlertas";
import { navigateFromAlerta } from "../lib/alertaNav";

const chipBtn = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "5px 11px",
  borderRadius: 20,
  border: `1px solid ${C.line}`,
  background: C.surface,
  fontSize: 12.5,
  fontWeight: 700,
  color: C.ink,
  cursor: "pointer",
  fontFamily: "inherit",
  maxWidth: 160,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

export default function ContextHeader({
  online,
  pendientes,
  sincronizando,
  recienSync,
  onSync,
  onMenuClick,
  viewLabel,
  refreshInterval,
  timeLeft,
  showRefreshCfg,
  setShowRefreshCfg,
  refreshCfgRef,
  intervalosRefresh,
  fmtTimer,
  onSelectRefreshInterval,
  onForzarRefresh,
  dark,
  onToggleTema,
}) {
  const {
    embarcacionActiva,
    embarcaciones,
    setEmbarcacionId,
    embarcacionId,
    onNavigate,
    empresa,
    appMode,
    toggleAppMode,
    puedeOficina,
  } = useShell();

  const [embOpen, setEmbOpen] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);
  const embRef = useRef(null);
  const alertRef = useRef(null);

  const { alertas, loading: alertasLoading } = useHeaderAlertas(embarcacionId, empresa);

  useEffect(() => {
    if (!embOpen && !alertOpen) return;
    const fn = (e) => {
      if (embOpen && embRef.current && !embRef.current.contains(e.target)) setEmbOpen(false);
      if (alertOpen && alertRef.current && !alertRef.current.contains(e.target)) setAlertOpen(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [embOpen, alertOpen]);

  const isOficina = appMode === "oficina";
  const syncDisabled = !online || sincronizando;

  function irAlerta(a) {
    navigateFromAlerta(onNavigate, a, { appMode, embarcacionId });
    setAlertOpen(false);
  }

  return (
    <>
      <div
        className="cmms-topbar cmms-context-header"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          background: tint(C.surface, 92),
          borderBottom: `1px solid ${C.line}`,
          backdropFilter: "blur(6px)",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
          <button
            type="button"
            className="cmms-hamburger"
            onClick={onMenuClick}
            aria-label="Abrir menú"
            style={{
              display: "none",
              background: "none",
              border: `1px solid ${C.line}`,
              borderRadius: 8,
              color: C.steel,
              cursor: "pointer",
              padding: 6,
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Menu size={18} />
          </button>

          <div style={{ position: "relative" }} ref={embRef}>
            <button
              type="button"
              style={chipBtn}
              onClick={() => setEmbOpen((v) => !v)}
              title={embarcacionActiva?.nombre || "Elegir embarcación"}
              aria-expanded={embOpen}
            >
              {embarcacionActiva?.codigo || "Embarcación"}
              <ChevronDown size={14} color={C.slate} />
            </button>
            {embOpen && embarcaciones.length > 0 && (
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: "calc(100% + 6px)",
                  minWidth: 220,
                  background: C.surface,
                  border: `1px solid ${C.line}`,
                  borderRadius: 12,
                  padding: 6,
                  zIndex: 210,
                  boxShadow: "0 6px 24px rgba(0,0,0,.12)",
                }}
              >
                {embarcaciones.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => { setEmbarcacionId(e.id); setEmbOpen(false); }}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: "none",
                      background: e.id === embarcacionId ? tint(C.sky, 12) : "none",
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{e.codigo}</div>
                    <div style={{ fontSize: 11.5, color: C.slate }}>{e.nombre}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {viewLabel && (
            <span className="cmms-context-breadcrumb" style={{ fontSize: 12, color: C.slate, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {viewLabel}
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {recienSync && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: C.green }}>
              <CheckCircle2 size={14} /> Sincronizado
            </span>
          )}

          {pendientes > 0 && (
            <button
              type="button"
              onClick={onSync}
              disabled={syncDisabled}
              title={!online ? "Sync pausado sin conexión" : "Subir cambios locales"}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                fontWeight: 600,
                color: online ? "#7a5b00" : C.slate,
                background: online ? C.amber : tint(C.amber, 25),
                border: "none",
                borderRadius: 20,
                padding: "5px 12px",
                cursor: syncDisabled ? "default" : "pointer",
                opacity: syncDisabled ? 0.55 : 1,
                fontFamily: "inherit",
              }}
            >
              <RefreshCw size={13} className={sincronizando ? "spin" : ""} style={sincronizando ? { animation: "spin 1s linear infinite" } : undefined} />
              {sincronizando ? "Sync…" : online ? `${pendientes} por subir` : `${pendientes} en cola`}
            </button>
          )}

          {pendientes === 0 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: online ? C.green : C.amber }}>
              {online ? <Wifi size={14} /> : <WifiOff size={14} />}
              {online ? "En línea" : "Offline"}
            </span>
          )}

          {isOficina && (
            <>
              <button
                type="button"
                onClick={onForzarRefresh}
                title="Actualizar datos del módulo"
                style={{ ...ghostBtn, padding: "5px 11px", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 5 }}
              >
                <RefreshCw size={13} /> Actualizar
              </button>
              <div className="cmms-refresh-cfg" style={{ position: "relative" }} ref={refreshCfgRef}>
                <button
                  type="button"
                  onClick={() => setShowRefreshCfg((v) => !v)}
                  title="Auto-refresh (opcional)"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    fontSize: 11,
                    fontWeight: 700,
                    color: refreshInterval > 0 && timeLeft < 60 ? C.amber : C.slate,
                    background: showRefreshCfg ? tint(C.sky, 12) : "none",
                    border: `1px solid ${showRefreshCfg ? tint(C.sky, 30) : C.line}`,
                    borderRadius: 20,
                    padding: "4px 9px",
                    cursor: "pointer",
                    fontFamily: "'IBM Plex Mono', monospace",
                  }}
                >
                  <RefreshCw size={11} />
                  {refreshInterval > 0 ? fmtTimer(timeLeft) : "Auto"}
                </button>
                {showRefreshCfg && (
                  <div
                    style={{
                      position: "absolute",
                      right: 0,
                      top: "calc(100% + 6px)",
                      background: C.surface,
                      border: `1px solid ${C.line}`,
                      borderRadius: 12,
                      padding: "8px 6px",
                      zIndex: 200,
                      minWidth: 180,
                      boxShadow: "0 6px 24px rgba(0,0,0,.14)",
                    }}
                  >
                    <div style={{ fontSize: 10.5, color: C.slate, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, padding: "4px 10px 8px" }}>
                      Actualización automática
                    </div>
                    {intervalosRefresh.map((op) => (
                      <button
                        key={op.s}
                        type="button"
                        onClick={() => onSelectRefreshInterval(op.s)}
                        style={{
                          display: "block",
                          width: "100%",
                          textAlign: "left",
                          padding: "7px 12px",
                          borderRadius: 8,
                          border: "none",
                          background: refreshInterval === op.s ? tint(C.sky, 14) : "none",
                          color: refreshInterval === op.s ? C.sky : C.ink,
                          fontWeight: refreshInterval === op.s ? 700 : 400,
                          fontSize: 13,
                          cursor: "pointer",
                          fontFamily: "inherit",
                        }}
                      >
                        {op.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          <div style={{ position: "relative" }} ref={alertRef}>
            <button
              type="button"
              onClick={() => setAlertOpen((v) => !v)}
              aria-label="Alertas"
              style={{
                position: "relative",
                width: 36,
                height: 36,
                borderRadius: 8,
                border: `1px solid ${C.line}`,
                background: alertOpen ? tint(C.sky, 10) : C.surface,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: C.steel,
              }}
            >
              <Bell size={17} />
              {alertas.length > 0 && (
                <span
                  style={{
                    position: "absolute",
                    top: 4,
                    right: 4,
                    minWidth: 16,
                    height: 16,
                    borderRadius: 8,
                    background: C.red,
                    color: "#fff",
                    fontSize: 10,
                    fontWeight: 800,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "0 4px",
                  }}
                >
                  {alertas.length}
                </span>
              )}
            </button>
            {alertOpen && (
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  top: "calc(100% + 6px)",
                  width: 300,
                  maxHeight: 360,
                  overflowY: "auto",
                  background: C.surface,
                  border: `1px solid ${C.line}`,
                  borderRadius: 12,
                  padding: 8,
                  zIndex: 210,
                  boxShadow: "0 8px 28px rgba(0,0,0,.14)",
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, color: C.slate, padding: "4px 8px 8px", textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Alertas · {embarcacionActiva?.codigo || "—"}
                </div>
                {alertasLoading && (
                  <div style={{ padding: 12, fontSize: 12, color: C.slate }}>Cargando…</div>
                )}
                {!alertasLoading && alertas.length === 0 && (
                  <div style={{ padding: 12, fontSize: 12, color: C.slate }}>Sin alertas críticas.</div>
                )}
                {alertas.map((a, i) => (
                  <div
                    key={`${a.cat}-${i}`}
                    style={{
                      padding: "10px 8px",
                      borderRadius: 8,
                      marginBottom: 4,
                      background: a.sev === "red" ? C.redBg : C.yellowBg,
                    }}
                  >
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: C.ink, lineHeight: 1.35 }}>{a.titulo}</div>
                    <div style={{ fontSize: 11, color: C.slate, marginTop: 4, lineHeight: 1.35 }}>{a.detalle}</div>
                    <button
                      type="button"
                      onClick={() => irAlerta(a)}
                      style={{ ...ghostBtn, marginTop: 8, padding: "4px 10px", fontSize: 11.5 }}
                    >
                      Ver
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => { onNavigate?.("alertas"); setAlertOpen(false); }}
                  style={{ ...ghostBtn, width: "100%", marginTop: 4, fontSize: 12, justifyContent: "center" }}
                >
                  Ver todas
                </button>
              </div>
            )}
          </div>

          {puedeOficina && (
            <button
              type="button"
              onClick={toggleAppMode}
              title={isOficina ? "Cambiar a Modo Campo" : "Cambiar a Modo Oficina"}
              style={{
                ...chipBtn,
                maxWidth: "none",
                fontSize: 11,
                fontWeight: 600,
                color: isOficina ? C.steel : C.ocean,
                background: isOficina ? C.surface : tint(C.steel, 10),
              }}
            >
              {isOficina ? "Oficina" : "Campo"}
            </button>
          )}

          {isOficina && (
            <button
              type="button"
              className="cmms-theme-toggle"
              onClick={onToggleTema}
              title={dark ? "Modo día" : "Modo noche"}
              aria-label="Cambiar tema"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 36,
                height: 36,
                borderRadius: 8,
                border: `1px solid ${C.line}`,
                background: C.surface,
                color: dark ? C.gold : C.steel,
                cursor: "pointer",
              }}
            >
              {dark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          )}
        </div>
      </div>

      {!online && pendientes > 0 && (
        <div
          className="cmms-offline-banner"
          style={{
            padding: "8px 20px",
            background: C.yellowBg,
            borderBottom: `1px solid ${C.amber}`,
            fontSize: 12,
            color: C.ink,
            lineHeight: 1.45,
          }}
        >
          <strong>Sin conexión · sync pausado</strong>
          {" · "}
          {pendientes} en cola local. OTs, checklist y fotos siguen disponibles offline.
        </div>
      )}
    </>
  );
}
