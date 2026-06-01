import React, { useEffect, useRef, useState, useMemo } from "react";
import { Camera, X, ImageOff, Loader, Trash2 } from "lucide-react";
import { useAuth } from "../lib/auth";
import { listarFotos, subirFotos, borrarFoto } from "../lib/fotos";
import { C } from "../theme";

// Selector de fotos en memoria (para formularios de creación). No sube: entrega
// los File al padre, que los subirá tras crear el registro. Previsualiza.
export function FotoInput({ files, onChange, max = 5, disabled }) {
  const inputRef = useRef();
  const previews = useMemo(() => files.map((f) => ({ name: f.name, url: URL.createObjectURL(f) })), [files]);
  useEffect(() => () => previews.forEach((p) => URL.revokeObjectURL(p.url)), [previews]);

  function pick(e) {
    const nuevos = Array.from(e.target.files || []).filter((f) => f.type.startsWith("image/"));
    onChange([...files, ...nuevos].slice(0, max));
    e.target.value = "";
  }
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        {previews.map((p, i) => (
          <div key={i} style={{ position: "relative", width: 64, height: 64, borderRadius: 8, overflow: "hidden", border: `1px solid ${C.line}` }}>
            <img src={p.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            {!disabled && (
              <button onClick={() => onChange(files.filter((_, idx) => idx !== i))}
                style={{ position: "absolute", top: 2, right: 2, width: 18, height: 18, borderRadius: 9, border: "none", background: "rgba(0,0,0,.6)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                <X size={11} />
              </button>
            )}
          </div>
        ))}
        {files.length < max && !disabled && (
          <button type="button" onClick={() => inputRef.current?.click()}
            style={{ width: 64, height: 64, borderRadius: 8, border: `1.5px dashed ${C.line}`, background: C.mist, color: C.slate, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2 }}>
            <Camera size={18} /><span style={{ fontSize: 9 }}>Foto</span>
          </button>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" multiple onChange={pick} style={{ display: "none" }} />
      <div style={{ fontSize: 10.5, color: C.slate, marginTop: 6 }}>Se comprimen y suben al guardar. Máx {max} fotos.</div>
    </div>
  );
}

// Galería para un registro ya creado: muestra fotos (URL firmada), permite
// agregar (sube directo) y borrar (admin). Requiere conexión.
export function FotoGaleria({ entidad, entidadId, puedeAgregar, puedeBorrar, online = true }) {
  const { profile } = useAuth();
  const [fotos, setFotos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [err, setErr] = useState(null);
  const inputRef = useRef();

  async function recargar() {
    setCargando(true); setErr(null);
    try { setFotos(await listarFotos(entidad, entidadId)); }
    catch (e) { setErr(e.message); }
    finally { setCargando(false); }
  }
  useEffect(() => { if (entidadId) recargar(); /* eslint-disable-next-line */ }, [entidadId]);

  async function agregar(e) {
    const fs = Array.from(e.target.files || []); e.target.value = "";
    if (!fs.length) return;
    setSubiendo(true); setErr(null);
    const { errores } = await subirFotos(fs, { empresaId: profile.empresa_id, entidad, entidadId, profileId: profile.id });
    if (errores.length) setErr("Algunas fotos no se subieron: " + errores[0]);
    setSubiendo(false); recargar();
  }
  async function quitar(adj) {
    if (!window.confirm("¿Eliminar esta foto?")) return;
    try { await borrarFoto(adj); recargar(); } catch (e) { setErr("No se pudo eliminar: " + e.message); }
  }

  if (cargando) return <div style={{ fontSize: 12, color: C.slate, display: "flex", alignItems: "center", gap: 6 }}><Loader size={13} /> Cargando fotos…</div>;

  return (
    <div>
      {err && <div style={{ fontSize: 11.5, color: C.red, marginBottom: 6 }}>{err}</div>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        {fotos.length === 0 && <span style={{ fontSize: 12, color: C.slate, display: "inline-flex", alignItems: "center", gap: 6 }}><ImageOff size={14} /> Sin fotos</span>}
        {fotos.map((a) => (
          <div key={a.id} style={{ position: "relative", width: 72, height: 72, borderRadius: 8, overflow: "hidden", border: `1px solid ${C.line}` }}>
            {a.url
              ? <a href={a.url} target="_blank" rel="noreferrer"><img src={a.url} alt={a.nombre} style={{ width: "100%", height: "100%", objectFit: "cover" }} /></a>
              : <div style={{ width: "100%", height: "100%", background: C.mist }} />}
            {puedeBorrar && (
              <button onClick={() => quitar(a)} style={{ position: "absolute", top: 2, right: 2, width: 18, height: 18, borderRadius: 9, border: "none", background: "rgba(0,0,0,.6)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}><Trash2 size={10} /></button>
            )}
          </div>
        ))}
        {puedeAgregar && online && (
          <button type="button" onClick={() => inputRef.current?.click()} disabled={subiendo}
            style={{ width: 72, height: 72, borderRadius: 8, border: `1.5px dashed ${C.line}`, background: C.mist, color: C.slate, cursor: subiendo ? "default" : "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2 }}>
            {subiendo ? <Loader size={18} /> : <Camera size={18} />}<span style={{ fontSize: 9 }}>{subiendo ? "Subiendo" : "Agregar"}</span>
          </button>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" multiple onChange={agregar} style={{ display: "none" }} />
    </div>
  );
}
