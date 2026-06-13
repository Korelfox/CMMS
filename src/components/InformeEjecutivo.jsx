import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  Sparkles, FileText, Copy, Download, Printer, RefreshCw, AlertCircle,
  Check, Ship, ShieldAlert, CalendarClock, DollarSign,
} from "lucide-react";
import { fetchAll } from "../lib/db";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { evaluarPlanes } from "../lib/pm";
import { riesgoFlota } from "../lib/riesgo";
import { presupuestoFlota, runRate } from "../lib/presupuesto";
import { coberturaCriticos } from "../lib/operacional";
import { analizarMinMax } from "../lib/minmax";
import { ventanaPuerto } from "../lib/planificacion";
import { construirContextoInforme } from "../lib/informe";
import { C, archivo, tint, clp } from "../theme";
import { Card, PageHead, Pill, ErrorBanner, InlineSpinner } from "../ui";

const PERIODOS = [
  { meses: 3,  label: "últimos 3 meses" },
  { meses: 6,  label: "últimos 6 meses" },
  { meses: 12, label: "últimos 12 meses" },
];

export default function InformeEjecutivo() {
  const { empresa } = useAuth();
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [meses, setMeses]     = useState(3);
  const [texto, setTexto]     = useState("");
  const [generando, setGenerando] = useState(false);
  const [genError, setGenError]   = useState(null);
  const [copiado, setCopiado]     = useState(false);
  const abortRef = useRef(null);

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [embs, eqs, planes, ots, mareas, items, stock, destinos, presupuestos, varadas] = await Promise.all([
        fetchAll("embarcaciones", { order: { col: "codigo", asc: true } }),
        fetchAll("equipos"),
        fetchAll("planes_pm"),
        fetchAll("ordenes_trabajo"),
        fetchAll("mareas"),
        fetchAll("inventario_items"),
        fetchAll("stock"),
        fetchAll("inventario_item_destinos"),
        fetchAll("presupuestos").catch(() => []),
        fetchAll("varadas").catch(() => []),
      ]);
      setData({ embs, eqs, planes, ots, mareas, items, stock, destinos, presupuestos, varadas });
    } catch (e) { setError("No se pudieron cargar los datos. " + e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => () => { if (abortRef.current) abortRef.current.abort(); }, []);

  const hoy = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const anio = useMemo(() => new Date().getFullYear(), []);

  // Construye el contexto estructurado reutilizando las libs analíticas.
  const contexto = useMemo(() => {
    if (!data) return null;
    const { embs, eqs, planes, ots, mareas, items, stock, destinos, presupuestos } = data;
    const desde = new Date(hoy + "T00:00:00");
    desde.setMonth(desde.getMonth() - meses);
    const desdeISO = desde.toISOString().slice(0, 10);
    const periodo = { label: PERIODOS.find((p) => p.meses === meses)?.label || "", meses, desde: desdeISO, hasta: hoy };

    const planesEval = evaluarPlanes(planes, eqs);
    const riesgoRanking = riesgoFlota({ planesEval, ots, equipos: eqs, hoy });

    const presupuestosMap = new Map();
    (presupuestos || []).filter((p) => p.anio === anio).forEach((p) => presupuestosMap.set(p.embarcacion_id, Number(p.monto) || 0));
    const presupuestoData = presupuestoFlota({ ots, embarcaciones: embs, presupuestosMap, hoy, anio });
    const runRateFlota = runRate(ots, null, hoy, 3);

    const sinCobertura = coberturaCriticos({ items, stock, destinos, equipos: eqs })
      .filter(({ item }) => (item.stock_min || 0) > 0 || (item.stock_max || 0) > 0);
    const itemsSubdotados = analizarMinMax({ items, equipos: eqs, ots, destinos, hoy })
      .filter((a) => a.accion === "aumentar").length;

    const estadoPorNave = new Map();
    embs.forEach((e) => {
      const vp = ventanaPuerto(mareas, e.id, hoy);
      estadoPorNave.set(e.id, vp.enPuerto ? "en puerto" : "en mar");
    });

    return construirContextoInforme({
      empresa: empresa?.nombre || "",
      periodo, embarcaciones: embs, equipos: eqs, planesEval, riesgoRanking, ots,
      estadoPorNave, presupuestoData, runRateFlota, sinCobertura, itemsSubdotados, hoy,
    });
  }, [data, meses, hoy, anio, empresa]);

  const generar = useCallback(async () => {
    if (!contexto) return;
    setGenerando(true); setGenError(null); setTexto(""); setCopiado(false);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Sesión no válida. Vuelve a iniciar sesión.");

      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/informe-ejecutivo`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
          "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          contexto,
          periodoLabel: contexto.periodo.label,
          empresa: contexto.empresa,
        }),
        signal: ctrl.signal,
      });

      if (!resp.ok) {
        let payload = {};
        try { payload = await resp.json(); } catch { /* sin cuerpo json */ }
        if (resp.status === 503 || payload.error === "FALTA_API_KEY") {
          setGenError("FALTA_API_KEY");
        } else {
          setGenError(payload.error || `Error ${resp.status} del servidor.`);
        }
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
  }, [contexto]);

  const cancelar = useCallback(() => { if (abortRef.current) abortRef.current.abort(); }, []);

  const copiar = useCallback(async () => {
    try { await navigator.clipboard.writeText(texto); setCopiado(true); setTimeout(() => setCopiado(false), 2000); }
    catch { /* sin permiso de portapapeles */ }
  }, [texto]);

  const descargar = useCallback(() => {
    const blob = new Blob([texto], { type: "text/markdown;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `informe-ejecutivo-${hoy}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [texto, hoy]);

  const imprimir = useCallback(() => {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<html><head><title>Informe ejecutivo ${hoy}</title><meta charset="utf-8">
      <style>body{font-family:Georgia,serif;max-width:760px;margin:40px auto;padding:0 24px;color:#1a2b3c;line-height:1.6}
      h1{font-size:22px}h2{font-size:18px;border-bottom:1px solid #ccc;padding-bottom:4px;margin-top:28px}
      h3{font-size:15px}strong{color:#0a1929}ul,ol{padding-left:22px}li{margin:3px 0}</style></head>
      <body>${mdToBasicHtml(texto)}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => { try { w.print(); } catch { /* cancelado */ } }, 250);
  }, [texto, hoy]);

  if (loading) return (
    <div>
      <PageHead kicker="Inteligencia · IA" title="Informe Ejecutivo" />
      <Card><InlineSpinner label="Cargando indicadores de la flota…" /></Card>
    </div>
  );

  const snap = contexto;

  return (
    <div>
      <PageHead
        kicker="Inteligencia · IA"
        title="Informe Ejecutivo"
        sub="Claude redacta el informe ejecutivo del período cruzando confiabilidad, cumplimiento del plan, costos e inventario crítico — a partir de los datos reales de tu flota."
      />
      <ErrorBanner onRetry={cargar}>{error}</ErrorBanner>

      {/* Snapshot de datos que alimentan el informe */}
      {snap && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 16 }}>
          <SnapCard icon={Ship} label="Naves" value={snap.flota.totalNaves} tone={C.cyan} />
          <SnapCard icon={ShieldAlert} label="Equipos riesgo alto" value={snap.confiabilidad.equiposRiesgoAlto}
            tone={snap.confiabilidad.equiposRiesgoAlto ? C.red : C.green} />
          <SnapCard icon={CalendarClock} label="PMs vencidos" value={snap.mantenimiento.pmVencidos}
            tone={snap.mantenimiento.pmVencidos ? C.red : C.green} />
          <SnapCard icon={DollarSign} label={`Gasto ${anio}`} value={clp(snap.costos.gastoAnioFlota)} tone={C.steel} small />
        </div>
      )}

      {/* Controles */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: C.slate }}>Período:</span>
            {PERIODOS.map((p) => (
              <button key={p.meses} onClick={() => setMeses(p.meses)} disabled={generando} style={{
                padding: "6px 14px", borderRadius: 8, fontSize: 12.5, fontWeight: 600,
                cursor: generando ? "not-allowed" : "pointer",
                border: `1px solid ${meses === p.meses ? C.cyan : C.line}`,
                background: meses === p.meses ? C.cyan : "transparent",
                color: meses === p.meses ? "#fff" : C.slate,
              }}>{p.meses}m</button>
            ))}
          </div>

          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            {!generando ? (
              <button onClick={generar} style={primaryBtn}>
                <Sparkles size={15} /> {texto ? "Regenerar informe" : "Generar informe"}
              </button>
            ) : (
              <button onClick={cancelar} style={{ ...primaryBtn, background: C.slate }}>
                <RefreshCw size={15} className="spin" /> Cancelar
              </button>
            )}
            {texto && !generando && (
              <>
                <button onClick={copiar} style={ghostBtn} title="Copiar markdown">
                  {copiado ? <Check size={15} color={C.green} /> : <Copy size={15} />}
                </button>
                <button onClick={descargar} style={ghostBtn} title="Descargar .md"><Download size={15} /></button>
                <button onClick={imprimir} style={ghostBtn} title="Imprimir / PDF"><Printer size={15} /></button>
              </>
            )}
          </div>
        </div>
      </Card>

      {/* Aviso de configuración de API key */}
      {genError === "FALTA_API_KEY" && (
        <Card style={{ borderLeft: `5px solid ${C.amber}`, marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 10 }}>
            <AlertCircle size={18} color={C.amber} style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ fontSize: 13, color: C.ink, lineHeight: 1.7 }}>
              <strong>Falta configurar la clave de Claude.</strong> El módulo está listo, pero el servidor aún no tiene la
              <code style={codeStyle}>ANTHROPIC_API_KEY</code>. Configúrala una sola vez en{" "}
              <strong>Supabase → Edge Functions → Manage secrets</strong> (o por CLI:
              <code style={codeStyle}>supabase secrets set ANTHROPIC_API_KEY=sk-ant-...</code>) y vuelve a generar.
            </div>
          </div>
        </Card>
      )}
      {genError && genError !== "FALTA_API_KEY" && (
        <Card style={{ borderLeft: `5px solid ${C.red}`, marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 10, fontSize: 13, color: C.ink }}>
            <AlertCircle size={18} color={C.red} style={{ flexShrink: 0 }} />
            <span><strong>No se pudo generar el informe.</strong> {genError}</span>
          </div>
        </Card>
      )}

      {/* Informe */}
      <Card style={{ minHeight: 200 }}>
        {!texto && !generando && (
          <div style={{ textAlign: "center", padding: "48px 20px", color: C.slate }}>
            <FileText size={40} color={C.line} style={{ marginBottom: 12 }} />
            <div style={{ fontSize: 14, fontWeight: 600, color: C.ink, marginBottom: 4 }}>
              Aún no has generado el informe del período.
            </div>
            <div style={{ fontSize: 13 }}>
              Pulsa <strong>Generar informe</strong> y Claude lo redactará con los datos reales de tu flota.
            </div>
          </div>
        )}

        {generando && !texto && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "32px 8px", color: C.slate }}>
            <Sparkles size={20} color={C.cyan} className="pulse" />
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>Analizando la flota y redactando…</div>
              <div style={{ fontSize: 12.5 }}>Cruzando confiabilidad, plan PM, costos e inventario. Esto toma unos segundos.</div>
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

      <Card style={{ marginTop: 16, background: C.mist }}>
        <div style={{ fontSize: 12, color: C.slate, lineHeight: 1.7 }}>
          <strong style={{ color: C.ink }}>Cómo funciona:</strong>{" "}
          el informe se genera con <strong>Claude Sonnet 4.6</strong> sobre los indicadores reales del período
          (confiabilidad, PMs, OTs, presupuesto, run-rate, inventario crítico). La clave de la API vive solo en el
          servidor (Edge Function); el navegador nunca la ve. Claude usa únicamente los datos provistos — no inventa cifras.
        </div>
      </Card>

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

// ── Render markdown → React (subconjunto: ##/###, -, 1., **bold**, ---) ──
function renderMarkdown(md) {
  const lines = (md || "").split("\n");
  const out = [];
  let list = null, listType = null, key = 0;

  const flush = () => {
    if (list) {
      out.push(listType === "ol"
        ? <ol key={key++} style={{ paddingLeft: 22, margin: "8px 0" }}>{list}</ol>
        : <ul key={key++} style={{ paddingLeft: 22, margin: "8px 0" }}>{list}</ul>);
      list = null; listType = null;
    }
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) { flush(); continue; }

    if (/^#{1,3}\s/.test(line)) {
      flush();
      const level = line.match(/^#+/)[0].length;
      const txt = line.replace(/^#+\s/, "");
      const sz = level === 1 ? 20 : level === 2 ? 16.5 : 14.5;
      out.push(
        <div key={key++} style={{
          ...archivo, fontWeight: 800, fontSize: sz, color: C.abyss,
          marginTop: level <= 2 ? 22 : 14, marginBottom: 8,
          borderBottom: level === 2 ? `1px solid ${C.line}` : "none",
          paddingBottom: level === 2 ? 5 : 0,
        }}>{mdInline(txt)}</div>
      );
      continue;
    }

    if (/^---+$/.test(line.trim())) { flush(); out.push(<hr key={key++} style={{ border: "none", borderTop: `1px solid ${C.line}`, margin: "16px 0" }} />); continue; }

    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    if (ol || ul) {
      const type = ol ? "ol" : "ul";
      if (list && listType !== type) flush();
      if (!list) { list = []; listType = type; }
      list.push(<li key={key++} style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.65, margin: "3px 0" }}>{mdInline((ol || ul)[1])}</li>);
      continue;
    }

    flush();
    out.push(<p key={key++} style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.7, margin: "8px 0" }}>{mdInline(line)}</p>);
  }
  flush();
  return out;
}

// Negrita inline **texto**
function mdInline(text) {
  const parts = (text || "").split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) {
      return <strong key={i} style={{ color: C.abyss, fontWeight: 700 }}>{p.slice(2, -2)}</strong>;
    }
    return <React.Fragment key={i}>{p}</React.Fragment>;
  });
}

// Conversión simple md→HTML para la ventana de impresión.
function mdToBasicHtml(md) {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = (md || "").split("\n");
  let html = "", list = null;
  const closeList = () => { if (list) { html += `</${list}>`; list = null; } };
  const inl = (t) => esc(t).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { closeList(); continue; }
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) { closeList(); html += `<h${h[1].length}>${inl(h[2])}</h${h[1].length}>`; continue; }
    const ol = line.match(/^\d+\.\s+(.*)$/), ul = line.match(/^[-*]\s+(.*)$/);
    if (ol || ul) {
      const t = ol ? "ol" : "ul";
      if (list && list !== t) closeList();
      if (!list) { list = t; html += `<${t}>`; }
      html += `<li>${inl((ol || ul)[1])}</li>`; continue;
    }
    closeList();
    html += `<p>${inl(line)}</p>`;
  }
  closeList();
  return html;
}

function SnapCard({ icon: Icon, label, value, tone, small }) {
  return (
    <div style={{ background: "var(--card-bg)", border: `1px solid ${C.line}`, borderRadius: 12, padding: "12px 14px", display: "flex", alignItems: "center", gap: 11 }}>
      <div style={{ width: 34, height: 34, borderRadius: 9, background: tint(tone, 8), display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon size={17} color={tone} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.5, color: C.slate, fontWeight: 600 }}>{label}</div>
        <div style={{ ...archivo, fontWeight: 800, fontSize: small ? 15 : 20, color: tone, lineHeight: 1.1, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
      </div>
    </div>
  );
}

const primaryBtn = {
  display: "flex", alignItems: "center", gap: 7, padding: "9px 18px", borderRadius: 9,
  border: "none", cursor: "pointer", background: C.cyan, color: "#fff", fontSize: 13, fontWeight: 700,
};
const ghostBtn = {
  display: "flex", alignItems: "center", justifyContent: "center", width: 38, height: 38,
  borderRadius: 9, border: `1px solid ${C.line}`, cursor: "pointer", background: "transparent", color: C.slate,
};
const codeStyle = { background: "var(--card-bg)", border: `1px solid ${C.line}`, borderRadius: 5, padding: "1px 6px", fontSize: 12, margin: "0 3px", fontFamily: "monospace" };
