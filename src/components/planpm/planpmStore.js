import { useSyncExternalStore } from "react";

// ============================================================
//  Fuente viva de datos de Plan PM para las ventanas.
//  PlanPM espeja aquí su estado en cada cambio; las ventanas
//  lo leen con useSyncExternalStore → refresco en tiempo real.
// ============================================================

let snap = { planes: [], historial: [], equipos: [], embarcaciones: [] };
const listeners = new Set();

export const planpmStore = {
  set(next) { snap = { ...snap, ...next }; listeners.forEach((l) => l()); },
  get() { return snap; },
  subscribe(l) { listeners.add(l); return () => listeners.delete(l); },
};

export function usePlanPMData() {
  return useSyncExternalStore(planpmStore.subscribe, planpmStore.get, planpmStore.get);
}
