import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from "react";
import { useAuth } from "../lib/auth";
import { canAccessOficina } from "../theme";
import { readAppMode, writeAppMode } from "../lib/embarcacionActiva";
import { useEmbarcacionActiva } from "../hooks/useEmbarcacionActiva";

const ShellContext = createContext(null);

export function ShellProvider({ children, onNavigate }) {
  const { profile, empresa } = useAuth();
  const embarc = useEmbarcacionActiva(empresa?.id);
  // Solo los administrativos pueden alternar a Oficina; los operativos a bordo
  // (capitán, maquinista, contratista) quedan fijados a Campo.
  const puedeOficina = canAccessOficina(profile?.rol);
  const [appMode, setAppModeState] = useState(() => (puedeOficina ? readAppMode("oficina") : "campo"));

  // Candado: quien no puede entrar a Oficina nunca queda fuera de Campo,
  // ni por un valor guardado, ni por un deep link, ni por un cambio de rol.
  useEffect(() => {
    if (!puedeOficina && appMode !== "campo") setAppModeState("campo");
  }, [puedeOficina, appMode]);

  useEffect(() => {
    if (!puedeOficina) return;
    const fn = (e) => {
      const m = e.detail?.mode;
      if (m === "campo" || m === "oficina") setAppModeState(m);
    };
    window.addEventListener("cmms-app-mode-change", fn);
    return () => window.removeEventListener("cmms-app-mode-change", fn);
  }, [puedeOficina]);

  const setAppMode = useCallback((mode) => {
    if (!puedeOficina) return;
    setAppModeState(mode);
    writeAppMode(mode);
  }, [puedeOficina]);

  const toggleAppMode = useCallback(() => {
    if (!puedeOficina) return;
    setAppModeState((prev) => {
      const next = prev === "campo" ? "oficina" : "campo";
      writeAppMode(next);
      return next;
    });
  }, [puedeOficina]);

  const value = useMemo(() => ({
    ...embarc,
    appMode,
    puedeOficina,
    setAppMode,
    toggleAppMode,
    onNavigate,
    empresa,
    profile,
  }), [embarc, appMode, puedeOficina, setAppMode, toggleAppMode, onNavigate, empresa, profile]);

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
