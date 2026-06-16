import { useSyncExternalStore } from "react";

let snap = { ots: [], embarcaciones: [], costoOk: null, online: true };
const listeners = new Set();

export const otStore = {
  set(next) { snap = { ...snap, ...next }; listeners.forEach((l) => l()); },
  get() { return snap; },
  subscribe(l) { listeners.add(l); return () => listeners.delete(l); },
};

export function useOTData() {
  return useSyncExternalStore(otStore.subscribe, otStore.get, otStore.get);
}
