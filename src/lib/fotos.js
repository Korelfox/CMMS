import { supabase } from "./supabase";
import { insertRow } from "./db";
import { nuevoId } from "./offline";

// ============================================================
//  Fotos / evidencias
//  - Comprime en el navegador antes de subir (redimensiona + JPEG)
//    para que la carga/descarga sea liviana, sobre todo en el celular.
//  - Sube al bucket privado "evidencias", organizado por empresa.
//  - Registra metadata en la tabla "adjuntos".
// ============================================================

const BUCKET = "evidencias";

// Comprime una imagen a un objetivo de tamaño. Redimensiona el lado mayor a
// maxLado y baja la calidad JPEG hasta quedar bajo maxBytes (~0.8 MB por defecto).
export async function comprimirImagen(file, { maxLado = 1600, maxBytes = 800 * 1024 } = {}) {
  const dataUrl = await new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result); fr.onerror = rej;
    fr.readAsDataURL(file);
  });
  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i); i.onerror = rej;
    i.src = dataUrl;
  });
  let { width, height } = img;
  if (width > maxLado || height > maxLado) {
    const r = Math.min(maxLado / width, maxLado / height);
    width = Math.round(width * r); height = Math.round(height * r);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  canvas.getContext("2d").drawImage(img, 0, 0, width, height);

  let q = 0.82, blob = null;
  for (let i = 0; i < 6; i++) {
    // eslint-disable-next-line no-await-in-loop
    blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", q));
    if (!blob || blob.size <= maxBytes || q <= 0.4) break;
    q -= 0.12;
  }
  return blob;
}

// Sube una foto (comprimida) y registra el adjunto. Devuelve el registro.
export async function subirFoto(file, { empresaId, entidad, entidadId, profileId }) {
  const blob = await comprimirImagen(file);
  const path = `${empresaId}/${entidad}/${entidadId}/${nuevoId()}.jpg`;
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: false });
  if (upErr) throw upErr;
  return insertRow("adjuntos", empresaId, {
    entidad, entidad_id: entidadId,
    nombre: (file.name || "foto.jpg").slice(0, 120),
    storage_path: path, mime: "image/jpeg", tamano: blob.size, created_by: profileId,
  });
}

// Sube varias fotos en serie. Devuelve cuántas se subieron y errores si hubo.
export async function subirFotos(files, ctx) {
  let ok = 0; const errores = [];
  for (const f of files) {
    try { /* eslint-disable-next-line no-await-in-loop */ await subirFoto(f, ctx); ok++; }
    catch (e) { errores.push(e.message); }
  }
  return { ok, errores };
}

// Lista los adjuntos de una entidad, con URL firmada (temporal) para mostrar.
export async function listarFotos(entidad, entidadId) {
  const { data, error } = await supabase
    .from("adjuntos").select("*")
    .eq("entidad", entidad).eq("entidad_id", entidadId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const items = data || [];
  const conUrl = await Promise.all(items.map(async (a) => {
    const { data: s } = await supabase.storage.from(BUCKET).createSignedUrl(a.storage_path, 3600);
    return { ...a, url: s?.signedUrl || null };
  }));
  return conUrl;
}

// Borra una foto (storage + registro).
export async function borrarFoto(adj) {
  await supabase.storage.from(BUCKET).remove([adj.storage_path]);
  await supabase.from("adjuntos").delete().eq("id", adj.id);
}
