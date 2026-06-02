import React, { useEffect, useState, useCallback, useMemo } from "react";
import { ShieldCheck, FileText, Upload, ExternalLink, Trash2, AlertCircle, Plus } from "lucide-react";
import { useAuth } from "../lib/auth";
import { fetchAll, insertRow, updateRow, deleteRow, logActivity } from "../lib/db";
import { subirArchivoDocumento, urlFirmada, borrarArchivoStorage } from "../lib/fotos";
import { C, archivo, isAdmin } from "../theme";
import { Card, PageHead, Pill, primaryBtn, ghostBtn, inputStyle, Field, Empty, ErrorBanner, InlineSpinner, FilterBtn } from "../ui";

// Documentos/certificados requeridos por embarcación (pesca artesanal).
const TIPOS_DOC = [
  "Certificado de Navegabilidad",
  "Matrícula de la nave",
  "Certificado de Seguridad",
  "Seguro (póliza)",
  "Inscripción RPA",
  "Revisión técnica casco/máquinas",
  "Balsa salvavidas",
  "Extintores",
];
const DIAS_HABILES_AVISO = 15;
const HOY = () => new Date().toISOString().slice(0, 10);

// Días hábiles (lun-vie) entre hoy y una fecha (no cuenta feriados).
function diasHabilesEntre(desde, hasta) {
  let n = 0;
  const d = new Date(desde); d.setHours(0, 0, 0, 0);
  const fin = new Date(hasta); fin.setHours(0, 0, 0, 0);
  while (d < fin) { d.setDate(d.getDate() + 1); const w = d.getDay(); if (w !== 0 && w !== 6) n++; }
  return n;
}

export function estadoDoc(doc) {
  if (!doc) return { key: "falta", label: "Falta", tone: "slate" };
  if (!doc.vencimiento) return { key: "vigente", label: "Sin vencimiento", tone: "green" };
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const venc = new Date(doc.vencimiento + "T00:00:00");
  if (venc < hoy) return { key: "vencido", label: "Vencido", tone: "red" };
  const dh = diasHabilesEntre(hoy, venc);
  if (dh <= DIAS_HABILES_AVISO) return { key: "por_vencer", label: `Por vencer (${dh} días háb.)`, tone: "yellow" };
  return { key: "vigente", label: "Vigente", tone: "green" };
}

// El documento vigente más relevante de un tipo (vencimiento más lejano).
export function docDe(documentos, embId, tipo) {
  const list = documentos.filter((d) => d.embarcacion_id === embId && d.tipo === tipo);
  if (!list.length) return null;
  return list.slice().sort((a, b) => {
    const va = a.vencimiento ? +new Date(a.vencimiento) : (a.emision ? +new Date(a.emision) : 0);
    const vb = b.vencimiento ? +new Date(b.vencimiento) : (b.emision ? +new Date(b.emision) : 0);
    return vb - va;
  })[0];
}

export default function Cumplimiento() {
  const { profile } = useAuth();
  const [embarcaciones, setEmbarcaciones] = useState([]);
  const [documentos, setDocumentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filtro, setFiltro] = useState("all");
  const [form, setForm] = useState(null);  // formulario de carga/edición
  const puedeAdmin = isAdmin(profile?.rol);

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [embs, docs] = await Promise.all([
        fetchAll("embarcaciones", { order: { col: "codigo", asc: true } }),
        fetchAll("documentos", { order: { col: "vencimiento", asc: true } }),
      ]);
      setEmbarcaciones(embs); setDocumentos(docs);
    } catch (e) { setError("No se pudo cargar el cumplimiento. " + e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const navesVisibles = filtro === "all" ? embarcaciones : embarcaciones.filter((e) => e.id === filtro);

  // KPIs de cumplimiento de la flota
  const kpis = useMemo(() => {
    let vigentes = 0, porVencer = 0, vencidos = 0, faltan = 0;
    embarcaciones.forEach((e) => TIPOS_DOC.forEach((t) => {
      const st = estadoDoc(docDe(documentos, e.id, t));
      if (st.key === "vigente") vigentes++;
      else if (st.key === "por_vencer") porVencer++;
      else if (st.key === "vencido") vencidos++;
      else faltan++;
    }));
    const total = embarcaciones.length * TIPOS_DOC.length;
    return { total, vigentes, porVencer, vencidos, faltan, pct: total ? Math.round((vigentes / total) * 100) : 0 };
  }, [embarcaciones, documentos]);

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

  if (loading) return <div><PageHead kicker="Flota · Cumplimiento" title="Cumplimiento Normativo" /><Card><InlineSpinner label="Cargando documentos…" /></Card></div>;

  if (embarcaciones.length === 0) {
    return <div><PageHead kicker="Flota · Cumplimiento" title="Cumplimiento Normativo" /><Card><Empty><AlertCircle size={30} color={C.amber} style={{ marginBottom: 10 }} /><br />Registra al menos una embarcación para gestionar su documentación.</Empty></Card></div>;
  }

  return (
    <div>
      <PageHead kicker="Flota · Cumplimiento normativo" title="Cumplimiento Normativo"
        sub="Certificados, inspecciones y documentación requerida por embarcación. Avisa con 15 días hábiles de anticipación al vencimiento." />

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
              {TIPOS_DOC.map((tipo) => {
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
