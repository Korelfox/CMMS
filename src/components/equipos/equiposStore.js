import { useSyncExternalStore } from "react";

// ============================================================
//  Fuente viva de datos de Equipos para las VENTANAS.
//  Las ventanas se renderizan en <WindowHost> (raíz), fuera del
//  árbol de <Equipos>, así que no alcanzan su estado por contexto.
//  Equipos espeja aquí su estado en cada cambio y las ventanas lo
//  leen con useSyncExternalStore → se refrescan en tiempo real al
//  agregar un subnodo, enlazar un repuesto, etc.
//  No cambia el modelo de datos: es sólo un puente de presentación.
// ============================================================

let snap = { equipos: [], items: [], destinos: [], embarcaciones: [] };
const listeners = new Set();

export const equiposStore = {
  set(next) { snap = { ...snap, ...next }; listeners.forEach((l) => l()); },
  get() { return snap; },
  subscribe(l) { listeners.add(l); return () => listeners.delete(l); },
};

export function useEquiposData() {
  return useSyncExternalStore(equiposStore.subscribe, equiposStore.get, equiposStore.get);
}
