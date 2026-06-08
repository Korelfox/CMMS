import React, { useEffect, useState, useCallback, useMemo } from "react";
import { ShieldCheck, FileText, Upload, ExternalLink, Trash2, AlertCircle, Plus, Settings, X, Check } from "lucide-react";
import { useAuth } from "../lib/auth";
import { fetchAll, insertRow, updateRow, deleteRow, logActivity } from "../lib/db";
import { subirArchivoDocumento, urlFirmada, borrarArchivoStorage } from "../lib/fotos";
import { estadoDoc, docDe } from "../lib/cumplimiento";
import { C, archivo, isAdmin, tint } from "../theme";
import { Card, PageHead, Pill, primaryBtn, ghostBtn, inputStyle, Field, Empty, ErrorBanner, InlineSpinner, FilterBtn } from "../ui";

// Tipos por defecto (semilla para empresas nuevas; el catálogo real es editable
// y vive en la tabla documento_tipos por empresa).
const TIPOS_DOC_DEFAULT = [
  "Certificado de Navegabilidad",
  "Matrícula de la nave",
  "Certificado de Seguridad",
  "Seguro (póliza)",
  "Inscripción RPA",
  "Revisión técnica casco/máquinas",
  "Balsa salvavidas",
  "Extintores",
];
const HOY = () => new Date().toISOString().slice(0, 10);
// estadoDoc, docDe y diasHabilesEntre viven ahora en lib/cumplimiento (testeables).

export default function Cumplimiento() {
  const { profile } = useAuth();
  const [embarcaciones, setEmbarcaciones] = useState([]);
  const [documentos, setDocumentos] = useState([]);
  const [tipos, setTipos] = useState([]);   // catálogo editable (documento_tipos)
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filtro, setFiltro] = useState("all");
  const [form, setForm] = useState(null);  // formulario de carga/edición
  const [tiposEdit, setTiposEdit] = useState(null); // null = panel cerrado
  const [guardandoTipos, setGuardandoTipos] = useState(false);
  const puedeAdmin = isAdmin(profile?.rol);

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [embs, docs, tps] = await Promise.all([
        fetchAll("embarcaciones", { order: { col: "codigo", asc: true } }),
        fetchAll("documentos", { order: { col: "vencimiento", asc: true } }),
        fetchAll("documento_tipos", { order: { col: "orden", asc: true } }),
      ]);
      setEmbarcaciones(embs); setDocumentos(docs); setTipos(tps);
    } catch (e) { setError("No se pudo cargar el cumplimiento. " + e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  // Nombres de tipos a mostrar (catálogo de la empresa; si está vacío, los por defecto).
  const tiposDoc = useMemo(() => (
    tipos.length ? tipos.slice().sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)).map((t) => t.nombre) : TIPOS_DOC_DEFAULT
  ), [tipos]);

  const navesVisibles = filtro === "all" ? embarcaciones : embarcaciones.filter((e) => e.id === filtro);

  // KPIs de cumplimiento de la flota
  const kpis = useMemo(() => {
    let vigentes = 0, porVencer = 0, vencidos = 0, faltan = 0;
    embarcaciones.forEach((e) => tiposDoc.forEach((t) => {
      const st = estadoDoc(docDe(documentos, e.id, t));
      if (st.key === "vigente") vigentes++;
      else if (st.key === "por_vencer") porVencer++;
      else if (st.key === "vencido") vencidos++;
      else faltan++;
    }));
    const total = embarcaciones.length * tiposDoc.length;
    return { total, vigentes, porVencer, vencidos, faltan, pct: total ? Math.round((vigentes / total) * 100) : 0 };
  }, [embarcaciones, documentos, tiposDoc]);

  async function verArchivo(doc) {
    if (!doc?.storage_path) return;
    const url = await urlFirmada(doc.storage_path);
    if (url) window.open(url, "_blank", "noopener");
  }

  async function guardar() {
    if (!form.tipo || !form.embId) return;
    setForm((f) => ({ ...f, guardando: true }));
    try {
      let meta = {};
      if (form.file) meta = await subirArchivoDocumento(form.file, { empresaId: profile.empresa_id, embarcacionId: form.embId });
      const datos = {
        embarcacion_id: form.embId, tipo: form.tipo, numero: (form.numero || "").trim(),
        emision: form.emision || null, vencimiento: form.vencimiento || null, notas: (form.notas || "").trim(),
        ...meta,
      };
      if (form.docId) {
        await updateRow("documentos", form.docId, datos);
      } else {
        await insertRow("documentos", profile.empresa_id, { ...datos, created_by: profile.id });
      }
      logActivity(profile, form.docId ? "Actualizar documento" : "Cargar documento", `${embName(form.embId)} · ${form.tipo}`);
      setForm(null); await cargar();
    } catch (e) { setForm((f) => ({ ...f, guardando: false })); setError("No se pudo guardar: " + e.message); }
  }

  async function eliminar(doc) {
    if (!window.confirm(`¿Eliminar "${doc.tipo}" de ${embName(doc.embarcacion_id)}?`)) return;
    try {
      await borrarArchivoStorage(doc.storage_path);
      await deleteRow("documentos", doc.id);
      logActivity(profile, "Eliminar documento", `${embName(doc.embarcacion_id)} · ${doc.tipo}`);
      await cargar();
    } catch (e) { setError("No se pudo eliminar: " + e.message); }
  }

  function embName(id) { return embarcaciones.find((e) => e.id === id)?.nombre || "—"; }
  function abrirForm(embId, tipo, doc) {
    setForm({ embId, tipo, docId: doc?.id || null, numero: doc?.numero || "", emision: doc?.emision || "", vencimiento: doc?.vencimiento || "", notas: doc?.notas || "", file: null });
  }

  // ── Gestión del catálogo de tipos de documentación ───────────
  function abrirGestion() {
    const base = tipos.length
      ? tipos.slice().sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)).map((t) => ({ id: t.id, nombre: t.nombre }))
      : TIPOS_DOC_DEFAULT.map((n) => ({ id: null, nombre: n }));
    setTiposEdit(base);
  }
  const setTipoNombre = (idx, v) => setTiposEdit((p) => p.map((t, i) => i === idx ? { ...t, nombre: v } : t));
  const quitarTipo = (idx) => setTiposEdit((p) => p.filter((_, i) => i !== idx));
  const agregarTipo = () => setTiposEdit((p) => [...p, { id: null, nombre: "" }]);

  async function guardarTipos() {
    const limpio = tiposEdit.map((t) => ({ ...t, nombre: (t.nombre || "").trim() })).filter((t) => t.nombre);
    if (limpio.length === 0) { setError("Debe haber al menos un tipo de documentación."); return; }
    setGuardandoTipos(true); setError(null);
    try {
      const vivos = new Set(limpio.filter((t) => t.id).map((t) => t.id));
      for (const t of tipos) if (!vivos.has(t.id)) await deleteRow("documento_tipos", t.id); // eliminados
      for (let i = 0; i < limpio.length; i++) {
        const t = limpio[i], orden = i + 1;
        if (!t.id) {
          await insertRow("documento_tipos", profile.empresa_id, { nombre: t.nombre, orden });
        } else {
          const orig = tipos.find((x) => x.id === t.id);
          if (!orig || orig.nombre !== t.nombre || (orig.orden ?? 0) !== orden) await updateRow("documento_tipos", t.id, { nombre: t.nombre, orden });
          // Renombrado: actualizar en cascada los documentos ya cargados de ese tipo.
          if (orig && orig.nombre !== t.nombre) {
            const afectados = documentos.filter((d) => d.tipo === orig.nombre);
            for (const d of afectados) await updateRow("documentos", d.id, { tipo: t.nombre });
            if (afectados.length) logActivity(profile, "Renombrar tipo documento", `${orig.nombre} → ${t.nombre} (${afectados.length} doc.)`);
          }
        }
      }
      logActivity(profile, "Editar tipos de documentación", `${limpio.length} tipo(s)`);
      setTiposEdit(null); await cargar();
    } catch (e) { setError("No se pudieron guardar los tipos: " + e.message); }
    finally { setGuardandoTipos(false); }
  }

  if (loading) return <div><PageHead kicker="Flota · Cumplimiento" title="Cumplimiento Normativo" /><Card><InlineSpinner label="Cargando documentos…" /></Card></div>;

  if (embarcaciones.length === 0) {
    return <div><PageHead kicker="Flota · Cumplimiento" title="Cumplimiento Normativo" /><Card><Empty><AlertCircle size={30} color={C.amber} style={{ marginBottom: 10 }} /><br />Registra al menos una embarcación para gestionar su documentación.</Empty></Card></div>;
  }

  return (
    <div>
      <PageHead kicker="Flota · Cumplimiento normativo" title="Cumplimiento Normativo"
        sub="Certificados, inspecciones y documentación requerida por embarcación. Avisa con 15 días hábiles de anticipación al vencimiento."
        action={puedeAdmin && <button onClick={abrirGestion} style={ghostBtn}><Settings size={15} /> Gestionar tipos</button>} />

      <ErrorBanner onRetry={cargar}>{error}</ErrorBanner>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 16 }}>
        <Card style={{ padding: 18, background: kpis.vencidos ? `linear-gradient(135deg, ${C.red}, #8A2A26)` : kpis.porVencer ? `linear-gradient(135deg, ${C.amber}, #9F7415)` : `linear-gradient(135deg, #1E9E6A, #127C8A)`, color: "#fff" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}><ShieldCheck size={20} color="#fff" /><span style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: "rgba(255,255,255,.85)", fontWeight: 700 }}>Cumplimiento</span></div>
          <div style={{ ...archivo, fontSize: 28, fontWeight: 800, lineHeight: 1 }}>{kpis.pct}%</div>
          <div style={{ fontSize: 12, marginTop: 6, color: "rgba(255,255,255,.85)" }}>{kpis.vigentes}/{kpis.total} documentos vigentes</div>
        </Card>
        <KPI label="Vencidos" value={kpis.vencidos} tone={kpis.vencidos ? C.red : C.green} sub="acción inmediata" />
        <KPI label="Por vencer" value={kpis.porVencer} tone={kpis.porVencer ? C.amber : C.green} sub="≤ 15 días hábiles" />
        <KPI label="Faltan cargar" value={kpis.faltan} tone={kpis.faltan ? C.slate : C.green} />
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <FilterBtn active={filtro === "all"} onClick={() => setFiltro("all")}>Toda la flota</FilterBtn>
        {embarcaciones.map((v) => <FilterBtn key={v.id} active={filtro === v.id} onClick={() => setFiltro(v.id)} color={v.color}>{v.nombre}</FilterBtn>)}
      </div>

      {/* ── Gestión de tipos de documentación (admin) ── */}
      {tiposEdit && (
        <Card style={{ marginBottom: 16, background: tint(C.steel, 6), border: `1px solid ${C.steel}40` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <Settings size={17} color={C.steel} />
            <span style={{ fontWeight: 700, fontSize: 15, color: C.abyss }}>Tipos de documentación</span>
            <span style={{ fontSize: 12, color: C.slate }}>· editables para toda la flota</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px,1fr))", gap: 8 }}>
            {tiposEdit.map((t, idx) => (
              <div key={idx} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 11, color: C.slate, fontFamily: "'IBM Plex Mono', monospace", width: 20, textAlign: "right" }}>{idx + 1}</span>
                <input value={t.nombre} autoFocus={!t.nombre}
                  onChange={(e) => setTipoNombre(idx, e.target.value)}
                  placeholder="Nombre del documento"
                  style={{ ...inputStyle(), flex: 1 }} />
                <button onClick={() => quitarTipo(idx)} title="Quitar"
                  style={{ background: "none", border: "none", cursor: "pointer", color: C.slate, padding: 4, flexShrink: 0 }}>
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
          <button onClick={agregarTipo} style={{ ...ghostBtn, marginTop: 12, fontSize: 12.5 }}><Plus size={14} /> Agregar tipo</button>
          <div style={{ display: "flex", gap: 8, marginTop: 14, alignItems: "center" }}>
            <button onClick={guardarTipos} disabled={guardandoTipos} style={primaryBtn}>
              <Check size={15} /> {guardandoTipos ? "Guardando…" : "Guardar cambios"}
            </button>
            <button onClick={() => setTiposEdit(null)} disabled={guardandoTipos} style={ghostBtn}><X size={14} /> Cancelar</button>
            <span style={{ fontSize: 11.5, color: C.slate, marginLeft: "auto" }}>
              Al renombrar un tipo, sus documentos ya cargados se actualizan automáticamente.
            </span>
          </div>
        </Card>
      )}

      {form && (
        <Card style={{ marginBottom: 16, background: C.mist }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: C.abyss, marginBottom: 14 }}>{form.docId ? "Actualizar" : "Cargar"} documento · {form.tipo} · {embName(form.embId)}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
            <Field label="N° / Folio"><input value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} style={inputStyle()} placeholder="opcional" /></Field>
            <Field label="Emisión"><input type="date" value={form.emision || ""} onChange={(e) => setForm({ ...form, emision: e.target.value })} style={inputStyle()} /></Field>
            <Field label="Vencimiento"><input type="date" value={form.vencimiento || ""} onChange={(e) => setForm({ ...form, vencimiento: e.target.value })} style={inputStyle()} /></Field>
            <Field label="Archivo (PDF o foto)"><input type="file" accept="application/pdf,image/*" onChange={(e) => setForm({ ...form, file: e.target.files?.[0] || null })} style={{ ...inputStyle(), padding: "7px" }} /></Field>
            <Field label="Notas" span={4}><input value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} style={inputStyle()} placeholder="Observaciones (opcional)" /></Field>
          </div>
          {form.docId && form.file === null && <div style={{ fontSize: 11.5, color: C.slate, marginTop: 8 }}>Si no eliges un archivo nuevo, se conserva el actual.</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button onClick={guardar} disabled={form.guardando} style={primaryBtn}>{form.guardando ? "Guardando…" : "Guardar documento"}</button>
            <button onClick={() => setForm(null)} style={ghostBtn}>Cancelar</button>
          </div>
        </Card>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {navesVisibles.map((emb) => (
          <Card key={emb.id}>
            <div style={{ ...archivo, fontWeight: 800, fontSize: 16, color: C.abyss, marginBottom: 12 }}>{emb.nombre}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px,1fr))", gap: 10 }}>
              {tiposDoc.map((tipo) => {
                const doc = docDe(documentos, emb.id, tipo);
                const st = estadoDoc(doc);
                return (
                  <div key={tipo} style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: "12px 14px", borderLeft: `4px solid ${st.tone === "red" ? C.red : st.tone === "yellow" ? C.amber : st.tone === "green" ? C.green : C.line}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{tipo}</span>
                      <Pill tone={st.tone}>{st.label}</Pill>
                    </div>
                    <div style={{ fontSize: 11.5, color: C.slate, marginTop: 6, fontFamily: "'IBM Plex Mono', monospace" }}>
                      {doc?.vencimiento ? `Vence: ${doc.vencimiento}` : (doc ? "Sin fecha de vencimiento" : "No cargado")}
                    </div>
                    <div style={{ display: "flex", gap: 10, marginTop: 8, alignItems: "center" }}>
                      {doc?.storage_path && <button onClick={() => verArchivo(doc)} style={{ ...ghostBtn, padding: "4px 10px", fontSize: 11.5 }}><ExternalLink size={13} /> Ver</button>}
                      {puedeAdmin && <button onClick={() => abrirForm(emb.id, tipo, doc)} style={{ ...ghostBtn, padding: "4px 10px", fontSize: 11.5, color: C.steel, borderColor: C.steel }}>{doc ? <><Upload size={13} /> Actualizar</> : <><Plus size={13} /> Cargar</>}</button>}
                      {puedeAdmin && doc && <button onClick={() => eliminar(doc)} title="Eliminar" style={{ background: "none", border: "none", cursor: "pointer", color: C.slate, marginLeft: "auto" }}><Trash2 size={14} /></button>}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function KPI({ label, value, tone, sub }) {
  return (
    <Card style={{ padding: 16 }}>
      <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: C.slate, fontWeight: 600 }}>{label}</div>
      <div style={{ ...archivo, fontSize: 26, fontWeight: 800, color: tone || C.steel, lineHeight: 1, marginTop: 6 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: C.slate, marginTop: 6 }}>{sub}</div>}
    </Card>
  );
}
