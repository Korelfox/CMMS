import { supabase } from "./supabase";
function emitMutated(tabla) { try { window.dispatchEvent(new CustomEvent("cmms-data-mutated", { detail: { tabla } })); } catch {} }

// ============================================================
//  Capa de acceso a datos
//  Helpers delgados sobre supabase. El aislamiento por empresa
//  lo garantiza RLS en la base de datos: aunque aquí se consulte
//  "todo", el servidor solo devuelve filas de la empresa del usuario.
//  Aun así, en las escrituras incluimos empresa_id explícito para
//  cumplir el WITH CHECK de las políticas.
// ============================================================

// Lectura genérica de una tabla (RLS filtra por empresa automáticamente).
export async function fetchAll(tabla, { select = "*", order, limit, includeDeleted = false } = {}) {
  let q = supabase.from(tabla).select(select);
  if (!includeDeleted) q = q.is("deleted_at", null);
  if (order) q = q.order(order.col, { ascending: order.asc ?? true });
  if (limit) q = q.limit(limit);
  const { data, error } = await q;
  if (error) { console.error(`[CMMS] fetchAll(${tabla}):`, error.message); throw error; }
  return data || [];
}

// Inserta una fila agregando empresa_id (requerido por las políticas WITH CHECK).
export async function insertRow(tabla, empresaId, row) {
  const { data, error } = await supabase
    .from(tabla)
    .insert({ ...row, empresa_id: empresaId })
    .select()
    .single();
  if (error) { console.error(`[CMMS] insertRow(${tabla}):`, error.message); throw error; }
  emitMutated(tabla);
  return data;
}

// Actualiza por id.
export async function updateRow(tabla, id, cambios) {
  const { data, error } = await supabase
    .from(tabla).update(cambios).eq("id", id).select().single();
  if (error) { console.error(`[CMMS] updateRow(${tabla}):`, error.message); throw error; }
  emitMutated(tabla);
  return data;
}

// Elimina por id (RLS solo lo permite a administradores).
export async function deleteRow(tabla, id, hard = false) {
  if (hard) {
    const { error } = await supabase.from(tabla).delete().eq("id", id);
    if (error) { console.error(`[CMMS] hard deleteRow(${tabla}):`, error.message); throw error; }
  } else {
    // Soft delete: marca deleted_at, el registro es recuperable.
    const { error } = await supabase.from(tabla).update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) { console.error(`[CMMS] soft deleteRow(${tabla}):`, error.message); throw error; }
  }
  emitMutated(tabla);
  return true;
}

// Restaura un registro con soft-delete (limpia deleted_at).
export async function restoreRow(tabla, id) {
  const { error } = await supabase.from(tabla).update({ deleted_at: null }).eq("id", id).is("deleted_at", "not.null");
  if (error) { console.error(`[CMMS] restoreRow(${tabla}):`, error.message); throw error; }
  emitMutated(tabla);
  return true;
}

// Upsert por una clave única (ej. stock por item+bodega, criticidad por equipo).
export async function upsertRow(tabla, empresaId, row, onConflict) {
  const { data, error } = await supabase
    .from(tabla)
    .upsert({ ...row, empresa_id: empresaId }, { onConflict })
    .select()
    .single();
  if (error) { console.error(`[CMMS] upsertRow(${tabla}):`, error.message); throw error; }
  return data;
}

// Llama a una función RPC de Postgres (fn = nombre sin esquema, params = objeto).
export async function rpcCall(fn, params = {}) {
  const { data, error } = await supabase.rpc(fn, params);
  if (error) { console.error(`[CMMS] rpc(${fn}):`, error.message); throw error; }
  return data ?? [];
}

// Registra un evento en la bitácora de actividad.
export async function logActivity(profile, accion, detalle = "") {
  if (!profile?.empresa_id) return;
  const { error } = await supabase.from("bitacora").insert({
    empresa_id: profile.empresa_id,
    usuario_id: profile.id,
    usuario_nombre: profile.nombre || "",
    rol: profile.rol || "",
    accion,
    detalle,
  });
  if (error) console.warn("[CMMS] No se pudo registrar en bitácora:", error.message);
}
