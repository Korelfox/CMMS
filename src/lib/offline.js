import { useState, useEffect } from "react";
import localforage from "localforage";
import { supabase } from "./supabase";

// ============================================================
//  Motor Offline
//  - Cache de datos de referencia (embarcaciones, equipos…) en IndexedDB,
//    para que los formularios funcionen sin señal (altamar).
//  - "Outbox": cola de OTs creadas sin conexión, que se suben solas al
//    recuperar señal. Cada OT lleva un UUID generado en el dispositivo,
//    así no hay choques de id al sincronizar.
// ============================================================

const cacheStore = localforage.createInstance({ name: "cmms", storeName: "cache" });
const outboxStore = localforage.createInstance({ name: "cmms", storeName: "outbox" });

// ---------- Conexión ----------
export function useOnline() {
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  return online;
}

// Genera un UUID aunque el navegador sea antiguo
export function nuevoId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0; const v = c === "x" ? r : (r & 0x3) | 0x8; return v.toString(16);
  });
}

// ---------- Cache de datos de referencia ----------
export async function cacheTable(tabla, rows) {
  try { await cacheStore.setItem(tabla, rows); } catch (e) { console.warn("[CMMS] cache", tabla, e.message); }
}
export async function getCached(tabla) {
  try { return (await cacheStore.getItem(tabla)) || []; } catch { return []; }
}

// ---------- Outbox (operaciones pendientes de subir) ----------
function avisarCambio() { window.dispatchEvent(new CustomEvent("cmms-outbox")); }

// Encola un INSERT. row debe traer ya su id (UUID) y empresa_id.
export async function queueInsert(tabla, row, descripcion = "") {
  const localId = row.id || nuevoId();
  const op = { localId, tabla, row: { ...row, id: localId }, ts: Date.now(), descripcion };
  await outboxStore.setItem(localId, op);
  avisarCambio();
  return op;
}

export async function getOutbox() {
  const items = [];
  await outboxStore.iterate((v) => items.push(v));
  return items.sort((a, b) => a.ts - b.ts);
}

export async function outboxCount() {
  try { return await outboxStore.length(); } catch { return 0; }
}

// Sube todo lo pendiente. Devuelve { ok, fail, total }.
export async function flushOutbox() {
  const items = await getOutbox();
  let ok = 0, fail = 0;
  for (const op of items) {
    try {
      const { error } = await supabase.from(op.tabla).insert(op.row);
      // 23505 = clave duplicada: ya estaba subida; la damos por buena.
      if (error && error.code !== "23505") throw error;
      await outboxStore.removeItem(op.localId);
      ok++;
    } catch (e) {
      console.warn("[CMMS] No se pudo sincronizar", op.localId, e.message);
      fail++;
    }
  }
  if (ok > 0) { avisarCambio(); window.dispatchEvent(new CustomEvent("cmms-synced", { detail: { ok } })); }
  return { ok, fail, total: items.length };
}
