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
import { renderMarkdown, mdToBasicHtml } from "./Markdown";

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
      const [embs, eqs, planes, ots, mareas, items, stock, destinos, presupuestos, varadas, compras, comprasItems] = await Promise.all([
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
        fetchAll("compras", { order: { col: "fecha", asc: false } }).catch(() => []),
        fetchAll("compras_items").catch(() => []),
      ]);
      setData({ embs, eqs, planes, ots, mareas, items, stock, destinos, presupuestos, varadas, compras, comprasItems });
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

  // Estadísticas de órdenes de compra para la portada impresa.
  const ocStats = useMemo(() => {
    if (!data?.compras) return null;
    const { compras, comprasItems } = data;
    const desde = new Date(hoy + "T00:00:00");
    desde.setMonth(desde.getMonth() - meses);
    const desdeISO = desde.toISOString().slice(0, 10);
    const enPeriodo = (compras || []).filter(
      (c) => (c.fecha || "") >= desdeISO && c.estado !== "cancelada",
    );
    const pendientes = enPeriodo.filter((c) => !["recibida", "cancelada"].includes(c.estado)).length;
    const recibidas  = enPeriodo.filter((c) => c.estado === "recibida").length;
    const ocIds      = new Set(enPeriodo.map((c) => c.id));
    const totalNeto  = (comprasItems || [])
      .filter((it) => ocIds.has(it.compra_id))
      .reduce((s, it) => s + (it.cantidad || 0) * (it.precio || 0) * (1 - ((it.descuento_pct || 0) / 100)), 0);
    return { total: enPeriodo.length, pendientes, recibidas, totalNeto: Math.round(totalNeto) };
  }, [data, meses, hoy]);

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

    const nombreEmpresa = contexto?.empresa || empresa?.nombre || "—";
    const periodoLabel  = contexto?.periodo?.label || `${meses} meses`;
    const totalNaves    = contexto?.flota?.totalNaves ?? 0;
    const riesgoAlto    = contexto?.confiabilidad?.equiposRiesgoAlto ?? 0;
    const pmVencidos    = contexto?.mantenimiento?.pmVencidos ?? 0;
    const pmTotal       = contexto?.mantenimiento?.pmTotal ?? 0;
    const otsAbiertas   = contexto?.mantenimiento?.otsAbiertas ?? 0;
    const gastoAnio     = contexto?.costos?.gastoAnioFlota ?? 0;
    const presupTotal   = contexto?.costos?.presupuestoFlota ?? 0;
    const zonaPresup    = contexto?.costos?.zona || "sin-dato";
    const desvioPct     = contexto?.costos?.desvioPct;

    const riesgoClr  = riesgoAlto > 0 ? "#dc2626" : "#16a34a";
    const pmClr      = pmVencidos > 0 ? "#dc2626" : "#16a34a";
    const presupClr  = zonaPresup === "critica" ? "#dc2626" : zonaPresup === "alerta" ? "#d97706" : "#16a34a";

    const fmtClp = (n) => (n || 0).toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

    const oc = ocStats || { total: 0, pendientes: 0, recibidas: 0, totalNeto: 0 };
    const ocColor = oc.pendientes > 0 ? "#d97706" : "#16a34a";

    const contenido = mdToBasicHtml(texto);

    const desvioLabel = desvioPct != null
      ? `${desvioPct > 0 ? "+" : ""}${desvioPct}% vs ppto.`
      : presupTotal > 0 ? `de ${fmtClp(presupTotal)}` : "sin presupuesto";

    const ocSection = ocStats ? `
<div class="oc-wrap">
  <div class="oc-box">
    <div class="oc-head">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
      <span class="oc-head-title">Órdenes de Compra</span>
      <span class="oc-head-period">Período: ${periodoLabel}</span>
    </div>
    <div class="oc-stats">
      <div class="oc-stat"><div class="oc-val">${oc.total}</div><div class="oc-lbl">OCs emitidas</div></div>
      <div class="oc-stat"><div class="oc-val" style="color:${ocColor}">${oc.pendientes}</div><div class="oc-lbl">Pend. recepción</div></div>
      <div class="oc-stat"><div class="oc-val" style="color:#16a34a">${oc.recibidas}</div><div class="oc-lbl">Recibidas</div></div>
      <div class="oc-stat"><div class="oc-val oc-money">${fmtClp(oc.totalNeto)}</div><div class="oc-lbl">Neto del período</div></div>
    </div>
  </div>
</div>` : "";

    w.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Informe Ejecutivo · ${nombreEmpresa} · ${hoy}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#fff;color:#1a2b3c;font-size:13px;line-height:1.6}

/* ── Portada ─────────────────────────────────────────── */
.hdr{background:linear-gradient(135deg,#05101e 0%,#0d2d4f 60%,#1a4a6e 100%);color:#fff;padding:36px 52px 28px;page-break-after:avoid}
.hdr-top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:22px}
.brand{display:flex;align-items:center;gap:14px}
.brand-ico{width:48px;height:48px;border-radius:12px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.18);display:flex;align-items:center;justify-content:center}
.brand-name{font-size:19px;font-weight:800;letter-spacing:-.3px}
.brand-sub{font-size:10px;color:rgba(255,255,255,.5);text-transform:uppercase;letter-spacing:.09em;margin-top:3px}
.doc-meta{text-align:right}
.doc-meta-period{font-size:13.5px;color:rgba(255,255,255,.92);font-weight:700;margin-bottom:5px}
.doc-meta-date{font-size:11px;color:rgba(255,255,255,.5)}
.confidencial{display:inline-block;margin-top:8px;font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.35);border:1px solid rgba(255,255,255,.2);border-radius:3px;padding:2px 7px}
.hdr-title{font-size:26px;font-weight:800;letter-spacing:-.5px;line-height:1.1;margin-bottom:5px}
.hdr-sub{font-size:12px;color:rgba(255,255,255,.55);line-height:1.5}
.hdr-divider{height:1px;background:rgba(255,255,255,.12);margin:18px 0 0}

/* ── Franja KPI ──────────────────────────────────────── */
.kpi-strip{display:grid;grid-template-columns:repeat(5,1fr);border-bottom:2px solid #d0dce9}
.kpi{padding:14px 18px;background:#f7fafc;border-right:1px solid #d0dce9}
.kpi:last-child{border-right:none}
.kpi-lbl{font-size:9.5px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;font-weight:700;margin-bottom:5px}
.kpi-val{font-size:24px;font-weight:800;line-height:1;letter-spacing:-.5px}
.kpi-sub{font-size:10px;color:#94a3b8;margin-top:3px}

/* ── Órdenes de Compra ───────────────────────────────── */
.oc-wrap{padding:24px 52px 0}
.oc-box{border:1.5px solid #c9d9e8;border-radius:10px;overflow:hidden}
.oc-head{background:#0d2d4f;color:#fff;padding:11px 20px;display:flex;align-items:center;gap:9px}
.oc-head-title{font-size:13.5px;font-weight:700;letter-spacing:-.1px}
.oc-head-period{margin-left:auto;font-size:10.5px;color:rgba(255,255,255,.5);font-weight:500}
.oc-stats{display:grid;grid-template-columns:repeat(4,1fr);background:#f7fafc}
.oc-stat{padding:14px 20px;border-right:1px solid #d0dce9;text-align:center}
.oc-stat:last-child{border-right:none}
.oc-val{font-size:28px;font-weight:800;color:#0d2d4f;line-height:1;letter-spacing:-.5px}
.oc-money{font-size:16px;padding-top:6px}
.oc-lbl{font-size:9.5px;text-transform:uppercase;letter-spacing:.07em;color:#64748b;font-weight:700;margin-top:4px}

/* ── Cuerpo del informe ──────────────────────────────── */
.body{padding:28px 52px 72px}
h2{font-size:14.5px;font-weight:700;color:#05101e;margin:26px 0 8px;padding-bottom:6px;border-bottom:2px solid #0d2d4f;letter-spacing:-.1px;page-break-after:avoid}
h3{font-size:13px;font-weight:600;color:#1e3a5f;margin:16px 0 5px;page-break-after:avoid}
p{margin:5px 0;color:#1a2b3c;font-size:13px;line-height:1.65}
ul,ol{padding-left:20px;margin:6px 0 10px}
li{margin:3px 0;color:#1a2b3c;font-size:13px;line-height:1.7}
strong{color:#05101e;font-weight:700}
hr{border:none;border-top:1px solid #e1e8f0;margin:18px 0}

/* ── Pie de página ───────────────────────────────────── */
.footer{position:fixed;bottom:0;left:0;right:0;display:flex;justify-content:space-between;align-items:center;padding:8px 52px;border-top:1px solid #d0dce9;font-size:9.5px;color:#94a3b8;background:#fff}
.footer-center{text-align:center}

@media print{
  @page{size:A4;margin:0}
  body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .hdr,.kpi-strip,.oc-box .oc-head{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .body{padding:24px 52px 64px}
  h2,h3{page-break-after:avoid}
}
</style>
</head>
<body>

<!-- ── Portada ── -->
<div class="hdr">
  <div class="hdr-top">
    <div class="brand">
      <div class="brand-ico">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l9-13 9 13"/><path d="M12 4v16"/><path d="M2 20h20"/></svg>
      </div>
      <div>
        <div class="brand-name">${nombreEmpresa}</div>
        <div class="brand-sub">Sistema de Gestión de Mantenimiento</div>
      </div>
    </div>
    <div class="doc-meta">
      <div class="doc-meta-period">Período: ${periodoLabel}</div>
      <div class="doc-meta-date">Emisión: ${hoy}</div>
      <div><span class="confidencial">Confidencial</span></div>
    </div>
  </div>
  <div class="hdr-title">Informe Ejecutivo de Mantenimiento</div>
  <div class="hdr-sub">Análisis de confiabilidad · Plan preventivo · Costos · Inventario crítico &nbsp;·&nbsp; ${totalNaves} nave${totalNaves !== 1 ? "s" : ""} en flota</div>
  <div class="hdr-divider"></div>
</div>

<!-- ── Franja KPI ── -->
<div class="kpi-strip">
  <div class="kpi">
    <div class="kpi-lbl">Flota</div>
    <div class="kpi-val" style="color:#2563eb">${totalNaves}</div>
    <div class="kpi-sub">naves activas</div>
  </div>
  <div class="kpi">
    <div class="kpi-lbl">Riesgo alto</div>
    <div class="kpi-val" style="color:${riesgoClr}">${riesgoAlto}</div>
    <div class="kpi-sub">equipos críticos</div>
  </div>
  <div class="kpi">
    <div class="kpi-lbl">PMs vencidos</div>
    <div class="kpi-val" style="color:${pmClr}">${pmVencidos}</div>
    <div class="kpi-sub">de ${pmTotal} planes</div>
  </div>
  <div class="kpi">
    <div class="kpi-lbl">OTs abiertas</div>
    <div class="kpi-val" style="color:#475569">${otsAbiertas}</div>
    <div class="kpi-sub">en backlog</div>
  </div>
  <div class="kpi">
    <div class="kpi-lbl">Gasto ${anio}</div>
    <div class="kpi-val" style="color:${presupClr};font-size:${gastoAnio >= 10_000_000 ? 14 : 18}px;padding-top:${gastoAnio >= 10_000_000 ? 5 : 0}px">${fmtClp(gastoAnio)}</div>
    <div class="kpi-sub">${desvioLabel}</div>
  </div>
</div>

${ocSection}

<!-- ── Contenido del informe ── -->
<div class="body">${contenido}</div>

<!-- ── Pie ── -->
<div class="footer">
  <span>${nombreEmpresa} · CMMS</span>
  <span class="footer-center">Informe Ejecutivo · ${hoy}</span>
  <span>Generado con Claude IA · Confidencial</span>
</div>

</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => { try { w.print(); } catch { /* cancelado */ } }, 350);
  }, [texto, hoy, contexto, ocStats, empresa, meses, anio]);

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
