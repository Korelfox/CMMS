import { supabase } from "./supabase";

// ============================================================
//  Capa de acceso a datos
//  Helpers delgados sobre supabase. El aislamiento por empresa
//  lo garantiza RLS en la base de datos: aunque aquí se consulte
//  "todo", el servidor solo devuelve filas de la empresa del usuario.
//  Aun así, en las escrituras incluimos empresa_id explícito para
//  cumplir el WITH CHECK de las políticas.
// ============================================================

// Lectura genérica de una tabla (RLS filtra por empresa automáticamente).
export async function fetchAll(tabla, { select = "*", order } = {}) {
  let q = supabase.from(tabla).select(select);
  if (order) q = q.order(order.col, { ascending: order.asc ?? true });
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
  return data;
}

// Actualiza por id.
export async function updateRow(tabla, id, cambios) {
  const { data, error } = await supabase
    .from(tabla).update(cambios).eq("id", id).select().single();
  if (error) { console.error(`[CMMS] updateRow(${tabla}):`, error.message); throw error; }
  return data;
}

// Elimina por id (RLS solo lo permite a administradores).
export async function deleteRow(tabla, id) {
  const { error } = await supabase.from(tabla).delete().eq("id", id);
  if (error) { console.error(`[CMMS] deleteRow(${tabla}):`, error.message); throw error; }
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
