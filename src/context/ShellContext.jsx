import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from "react";
import { useAuth } from "../lib/auth";
import { canOperate } from "../theme";
import { readAppMode, writeAppMode } from "../lib/embarcacionActiva";
import { useEmbarcacionActiva } from "../hooks/useEmbarcacionActiva";

const ShellContext = createContext(null);

export function ShellProvider({ children, onNavigate }) {
  const { profile, empresa } = useAuth();
  const embarc = useEmbarcacionActiva(empresa?.id);
  const defaultMode = canOperate(profile?.rol) ? "campo" : "oficina";
  const [appMode, setAppModeState] = useState(() => readAppMode(defaultMode));

  useEffect(() => {
    const fn = (e) => {
      const m = e.detail?.mode;
      if (m === "campo" || m === "oficina") setAppModeState(m);
    };
    window.addEventListener("cmms-app-mode-change", fn);
    return () => window.removeEventListener("cmms-app-mode-change", fn);
  }, []);

  const setAppMode = useCallback((mode) => {
    setAppModeState(mode);
    writeAppMode(mode);
  }, []);

  const toggleAppMode = useCallback(() => {
    setAppModeState((prev) => {
      const next = prev === "campo" ? "oficina" : "campo";
      writeAppMode(next);
      return next;
    });
  }, []);

  const value = useMemo(() => ({
    ...embarc,
    appMode,
    setAppMode,
    toggleAppMode,
    onNavigate,
    empresa,
    profile,
  }), [embarc, appMode, setAppMode, toggleAppMode, onNavigate, empresa, profile]);

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShell() {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("useShell debe usarse dentro de ShellProvider");
  return ctx;
}

/** Versión opcional para componentes fuera del shell (no lanza error). */
export function useShellOptional() {
  return useContext(ShellContext);
}
