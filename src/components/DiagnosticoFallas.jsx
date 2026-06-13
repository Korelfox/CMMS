import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  Stethoscope, Sparkles, Search, Copy, Download, Printer, RefreshCw,
  AlertCircle, Check, Wrench, Activity, History, Package,
} from "lucide-react";
import { fetchAll } from "../lib/db";
import { supabase } from "../lib/supabase";
import { construirContextoDiagnostico } from "../lib/diagnostico";
import { renderMarkdown, mdToBasicHtml } from "./Markdown";
import { C } from "../theme";
import { Card, PageHead, Pill, ErrorBanner, InlineSpinner } from "../ui";

export default function DiagnosticoFallas() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [filtro, setFiltro]   = useState("");
  const [equipoId, setEquipoId] = useState("");
  const [sintoma, setSintoma] = useState("");
  const [texto, setTexto]     = useState("");
  const [generando, setGenerando] = useState(false);
  const [genError, setGenError]   = useState(null);
  const [copiado, setCopiado]     = useState(false);
  const abortRef = useRef(null);

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [equipos, embs, ots, items, destinos, stock] = await Promise.all([
        fetchAll("equipos", { order: { col: "id_visible", asc: true } }),
        fetchAll("embarcaciones"),
        fetchAll("ordenes_trabajo"),
        fetchAll("inventario_items"),
        fetchAll("inventario_item_destinos"),
        fetchAll("stock"),
      ]);
      setData({ equipos, embs, ots, items, destinos, stock });
    } catch (e) { setError("No se pudieron cargar los datos. " + e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => () => { if (abortRef.current) abortRef.current.abort(); }, []);

  const embMap = useMemo(() => new Map((data?.embs || []).map((e) => [e.id, e.nombre || e.codigo])), [data]);

  // Lista de equipos "hoja" (los que pueden fallar), etiquetados y filtrables.
  const equiposLista = useMemo(() => {
    if (!data) return [];
    const f = filtro.trim().toLowerCase();
    return (data.equipos || [])
      .map((e) => ({
        ...e,
        nave: embMap.get(e.embarcacion_id) || "—",
        label: `${embMap.get(e.embarcacion_id) || "—"} · ${e.sistema || "?"}${e.id_visible ? ` (${e.id_visible})` : ""}`,
      }))
      .filter((e) => !f || e.label.toLowerCase().includes(f) || (e.marca || "").toLowerCase().includes(f))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [data, filtro, embMap]);

  const equipo = useMemo(() => (data?.equipos || []).find((e) => e.id === equipoId) || null, [data, equipoId]);

  const contexto = useMemo(() => {
    if (!equipo || !data) return null;
    return construirContextoDiagnostico({
      equipo, sintoma,
      ots: data.ots, equipos: data.equipos, embarcaciones: data.embs,
      items: data.items, destinos: data.destinos, stock: data.stock,
    });
  }, [equipo, sintoma, data]);

  const diagnosticar = useCallback(async () => {
    if (!contexto || !sintoma.trim()) return;
    setGenerando(true); setGenError(null); setTexto(""); setCopiado(false);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Sesión no válida. Vuelve a iniciar sesión.");

      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/diagnostico-fallas`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
          "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ contexto }),
        signal: ctrl.signal,
      });

      if (!resp.ok) {
        let payload = {};
        try { payload = await resp.json(); } catch { /* sin json */ }
        setGenError(resp.status === 503 || payload.error === "FALTA_API_KEY" ? "FALTA_API_KEY" : (payload.error || `Error ${resp.status} del servidor.`));
        setGenerando(false);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const blocks = buf.split("\n\n");
        buf = blocks.pop() || "";
        for (const block of blocks) {
          const line = block.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          const raw = line.slice(5).trim();
          if (!raw) continue;
          let obj;
          try { obj = JSON.parse(raw); } catch { continue; }
          if (obj.text) setTexto((t) => t + obj.text);
          else if (obj.error) setGenError(obj.error);
        }
      }
    } catch (e) {
      if (e.name !== "AbortError") setGenError(e.message || String(e));
    } finally {
      setGenerando(false);
      abortRef.current = null;
    }
  }, [contexto, sintoma]);

  const cancelar = useCallback(() => { if (abortRef.current) abortRef.current.abort(); }, []);
  const copiar = useCallback(async () => {
    try { await navigator.clipboard.writeText(texto); setCopiado(true); setTimeout(() => setCopiado(false), 2000); } catch { /* sin permiso */ }
  }, [texto]);
  const descargar = useCallback(() => {
    const blob = new Blob([texto], { type: "text/markdown;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `diagnostico-${equipo?.id_visible || "equipo"}.md`;
    a.click(); URL.revokeObjectURL(a.href);
  }, [texto, equipo]);
  const imprimir = useCallback(() => {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<html><head><title>Diagnóstico ${equipo?.id_visible || ""}</title><meta charset="utf-8">
      <style>body{font-family:Georgia,serif;max-width:760px;margin:40px auto;padding:0 24px;color:#1a2b3c;line-height:1.6}
      h2{font-size:18px;border-bottom:1px solid #ccc;padding-bottom:4px;margin-top:24px}strong{color:#0a1929}ul,ol{padding-left:22px}</style></head>
      <body><h1>Diagnóstico · ${equipo?.sistema || ""}</h1>${mdToBasicHtml(texto)}</body></html>`);
    w.document.close(); w.focus();
    setTimeout(() => { try { w.print(); } catch { /* cancelado */ } }, 250);
  }, [texto, equipo]);

  if (loading) return (
    <div>
      <PageHead kicker="Inteligencia · IA" title="Diagnóstico de Fallas" />
      <Card><InlineSpinner label="Cargando equipos e historial…" /></Card>
    </div>
  );

  const r = contexto?.resumen;

  return (
    <div>
      <PageHead
        kicker="Inteligencia · IA"
        title="Diagnóstico de Fallas"
        sub="Describe el síntoma y Claude propone causas probables, pasos de diagnóstico y repuestos — cruzando el historial de fallas codificadas (ISO 14224) del equipo y de la flota. Baja el MTTR del técnico."
      />
      <ErrorBanner onRetry={cargar}>{error}</ErrorBanner>

      <Card style={{ marginBottom: 16 }}>
        {/* Selector de equipo */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12, marginBottom: 14 }}>
          <div>
            <label style={lblStyle}>Filtrar equipo</label>
            <div style={{ position: "relative" }}>
              <Search size={14} color={C.slate} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
              <input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="nave, sistema, marca…"
                style={{ ...inputStyle, paddingLeft: 30 }} />
            </div>
          </div>
          <div>
            <label style={lblStyle}>Equipo ({equiposLista.length})</label>
            <select value={equipoId} onChange={(e) => { setEquipoId(e.target.value); setTexto(""); setGenError(null); }} style={inputStyle}>
              <option value="">— Selecciona el equipo con la falla —</option>
              {equiposLista.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
            </select>
          </div>
        </div>

        {/* Ficha rápida del equipo */}
        {equipo && r && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            <Pill tone={equipo.criticidad === "A" ? "red" : equipo.criticidad === "B" ? "yellow" : "steel"}>
              Criticidad {equipo.criticidad || "—"}
            </Pill>
            {equipo.marca && <Pill tone="steel">{equipo.marca}{equipo.modelo ? ` ${equipo.modelo}` : ""}</Pill>}
            <Pill tone="steel"><History size={11} /> {r.total} falla{r.total !== 1 ? "s" : ""} histórica{r.total !== 1 ? "s" : ""}</Pill>
            {r.mttrPromedio != null && <Pill tone="steel"><Activity size={11} /> MTTR {r.mttrPromedio}h</Pill>}
            {r.modoMasFrecuente && <Pill tone="yellow">Recurrente: {r.modoMasFrecuente}</Pill>}
            <Pill tone="steel"><Package size={11} /> {contexto.repuestosVinculados.length} repuesto{contexto.repuestosVinculados.length !== 1 ? "s" : ""} vinculado{contexto.repuestosVinculados.length !== 1 ? "s" : ""}</Pill>
          </div>
        )}

        {/* Síntoma */}
        <label style={lblStyle}>Síntoma observado</label>
        <textarea
          value={sintoma}
          onChange={(e) => setSintoma(e.target.value)}
          placeholder="Ej: la temperatura del refrigerante sube sobre 95°C a plena carga después de ~20 min, con caída de potencia. Sin humo anormal."
          rows={3}
          disabled={generando}
          style={{ ...inputStyle, resize: "vertical", minHeight: 70, fontFamily: "inherit" }}
        />

        <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
          {!generando ? (
            <button onClick={diagnosticar} disabled={!equipo || !sintoma.trim()}
              style={{ ...primaryBtn, opacity: (!equipo || !sintoma.trim()) ? 0.5 : 1, cursor: (!equipo || !sintoma.trim()) ? "not-allowed" : "pointer" }}>
              <Stethoscope size={15} /> {texto ? "Re-diagnosticar" : "Diagnosticar"}
            </button>
          ) : (
            <button onClick={cancelar} style={{ ...primaryBtn, background: C.slate }}>
              <RefreshCw size={15} className="spin" /> Cancelar
            </button>
          )}
          {texto && !generando && (
            <>
              <button onClick={copiar} style={ghostBtn} title="Copiar">{copiado ? <Check size={15} color={C.green} /> : <Copy size={15} />}</button>
              <button onClick={descargar} style={ghostBtn} title="Descargar .md"><Download size={15} /></button>
              <button onClick={imprimir} style={ghostBtn} title="Imprimir / PDF"><Printer size={15} /></button>
            </>
          )}
        </div>
      </Card>

      {genError === "FALTA_API_KEY" && (
        <Card style={{ borderLeft: `5px solid ${C.amber}`, marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 10, fontSize: 13, color: C.ink }}>
            <AlertCircle size={18} color={C.amber} style={{ flexShrink: 0 }} />
            <span><strong>Falta configurar la clave de Claude</strong> (<code style={codeStyle}>ANTHROPIC_API_KEY</code>) en Supabase → Edge Functions → Secrets.</span>
          </div>
        </Card>
      )}
      {genError && genError !== "FALTA_API_KEY" && (
        <Card style={{ borderLeft: `5px solid ${C.red}`, marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 10, fontSize: 13, color: C.ink }}>
            <AlertCircle size={18} color={C.red} style={{ flexShrink: 0 }} />
            <span><strong>No se pudo generar el diagnóstico.</strong> {genError}</span>
          </div>
        </Card>
      )}

      {(texto || generando) && (
        <Card style={{ minHeight: 160 }}>
          {generando && !texto && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "24px 8px", color: C.slate }}>
              <Sparkles size={20} color={C.cyan} className="pulse" />
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>Analizando síntoma e historial…</div>
                <div style={{ fontSize: 12.5 }}>Cruzando fallas codificadas del equipo y de la flota.</div>
              </div>
            </div>
          )}
          {texto && (
            <article style={{ maxWidth: 780 }}>
              {renderMarkdown(texto)}
              {generando && <span className="cursor" style={{ display: "inline-block", width: 8, height: 16, background: C.cyan, verticalAlign: "middle", marginLeft: 2 }} />}
            </article>
          )}
        </Card>
      )}

      {!texto && !generando && (
        <Card style={{ background: C.mist }}>
          <div style={{ fontSize: 12.5, color: C.slate, lineHeight: 1.7 }}>
            <strong style={{ color: C.ink }}>Cómo funciona:</strong>{" "}
            elige el equipo, describe el síntoma y Claude (<strong>Sonnet 4.6</strong>) razona sobre el historial real de fallas
            ISO 14224 de ese equipo, las fallas similares en la flota y los repuestos vinculados. Recomienda solo repuestos del
            catálogo del equipo y advierte faltantes de stock. No inventa datos: si no hay historial, lo dice.
          </div>
        </Card>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: .35; } }
        @keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0; } }
        .spin { animation: spin 1s linear infinite; }
        .pulse { animation: pulse 1.4s ease-in-out infinite; }
        .cursor { animation: blink 1s step-start infinite; }
      `}</style>
    </div>
  );
}

const lblStyle = { display: "block", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: C.slate, fontWeight: 600, marginBottom: 5 };
const inputStyle = { width: "100%", padding: "9px 11px", borderRadius: 8, border: `1px solid ${C.line}`, fontSize: 13, background: "var(--card-bg)", color: C.ink, boxSizing: "border-box" };
const primaryBtn = { display: "flex", alignItems: "center", gap: 7, padding: "9px 18px", borderRadius: 9, border: "none", background: C.cyan, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" };
const ghostBtn = { display: "flex", alignItems: "center", justifyContent: "center", width: 38, height: 38, borderRadius: 9, border: `1px solid ${C.line}`, cursor: "pointer", background: "transparent", color: C.slate };
const codeStyle = { background: "var(--card-bg)", border: `1px solid ${C.line}`, borderRadius: 5, padding: "1px 6px", fontSize: 12, margin: "0 3px", fontFamily: "monospace" };
