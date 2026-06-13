import { mdToBasicHtml } from "../components/Markdown";

// Abre una ventana de impresión profesional con el informe ejecutivo.
// Usada tanto desde InformeEjecutivo (live) como desde Reportes (guardado).
export function imprimirInforme({ contexto = {}, ocStats, texto, hoy, empresa, meses, anio }) {
  const w = window.open("", "_blank");
  if (!w) return;

  const nombreEmpresa = contexto?.empresa || empresa?.nombre || "—";
  const periodoLabel  = contexto?.periodo?.label || `últimos ${meses} meses`;
  const totalNaves    = contexto?.flota?.totalNaves ?? 0;
  const riesgoAlto    = contexto?.confiabilidad?.equiposRiesgoAlto ?? 0;
  const pmVencidos    = contexto?.mantenimiento?.pmVencidos ?? 0;
  const pmTotal       = contexto?.mantenimiento?.pmTotal ?? 0;
  const otsAbiertas   = contexto?.mantenimiento?.otsAbiertas ?? 0;
  const gastoAnio     = contexto?.costos?.gastoAnioFlota ?? 0;
  const presupTotal   = contexto?.costos?.presupuestoFlota ?? 0;
  const zonaPresup    = contexto?.costos?.zona || "sin-dato";
  const desvioPct     = contexto?.costos?.desvioPct;

  const riesgoClr = riesgoAlto > 0 ? "#dc2626" : "#16a34a";
  const pmClr     = pmVencidos > 0 ? "#dc2626" : "#16a34a";
  const presupClr = zonaPresup === "critica" ? "#dc2626" : zonaPresup === "alerta" ? "#d97706" : "#16a34a";

  const fmtClp = (n) => (n || 0).toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

  const oc = ocStats || { total: 0, pendientes: 0, recibidas: 0, totalNeto: 0 };
  const ocColor = oc.pendientes > 0 ? "#d97706" : "#16a34a";

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

  const contenido = mdToBasicHtml(texto);

  w.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Informe Ejecutivo \xb7 ${nombreEmpresa} \xb7 ${hoy}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#fff;color:#1a2b3c;font-size:13px;line-height:1.6}
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
.kpi-strip{display:grid;grid-template-columns:repeat(5,1fr);border-bottom:2px solid #d0dce9}
.kpi{padding:14px 18px;background:#f7fafc;border-right:1px solid #d0dce9}
.kpi:last-child{border-right:none}
.kpi-lbl{font-size:9.5px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;font-weight:700;margin-bottom:5px}
.kpi-val{font-size:24px;font-weight:800;line-height:1;letter-spacing:-.5px}
.kpi-sub{font-size:10px;color:#94a3b8;margin-top:3px}
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
.body{padding:28px 52px 72px}
h2{font-size:14.5px;font-weight:700;color:#05101e;margin:26px 0 8px;padding-bottom:6px;border-bottom:2px solid #0d2d4f;letter-spacing:-.1px;page-break-after:avoid}
h3{font-size:13px;font-weight:600;color:#1e3a5f;margin:16px 0 5px;page-break-after:avoid}
p{margin:5px 0;color:#1a2b3c;font-size:13px;line-height:1.65}
ul,ol{padding-left:20px;margin:6px 0 10px}
li{margin:3px 0;color:#1a2b3c;font-size:13px;line-height:1.7}
strong{color:#05101e;font-weight:700}
hr{border:none;border-top:1px solid #e1e8f0;margin:18px 0}
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
<div class="hdr">
  <div class="hdr-top">
    <div class="brand">
      <div class="brand-ico">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l9-13 9 13"/><path d="M12 4v16"/><path d="M2 20h20"/></svg>
      </div>
      <div>
        <div class="brand-name">${nombreEmpresa}</div>
        <div class="brand-sub">Sistema de Gesti\xf3n de Mantenimiento</div>
      </div>
    </div>
    <div class="doc-meta">
      <div class="doc-meta-period">Per\xedodo: ${periodoLabel}</div>
      <div class="doc-meta-date">Emisi\xf3n: ${hoy}</div>
      <div><span class="confidencial">Confidencial</span></div>
    </div>
  </div>
  <div class="hdr-title">Informe Ejecutivo de Mantenimiento</div>
  <div class="hdr-sub">An\xe1lisis de confiabilidad \xb7 Plan preventivo \xb7 Costos \xb7 Inventario cr\xedtico &nbsp;\xb7&nbsp; ${totalNaves} nave${totalNaves !== 1 ? "s" : ""} en flota</div>
  <div class="hdr-divider"></div>
</div>
<div class="kpi-strip">
  <div class="kpi">
    <div class="kpi-lbl">Flota</div>
    <div class="kpi-val" style="color:#2563eb">${totalNaves}</div>
    <div class="kpi-sub">naves activas</div>
  </div>
  <div class="kpi">
    <div class="kpi-lbl">Riesgo alto</div>
    <div class="kpi-val" style="color:${riesgoClr}">${riesgoAlto}</div>
    <div class="kpi-sub">equipos cr\xedticos</div>
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
    <div class="kpi-val" style="color:${presupClr};font-size:${gastoAnio >= 10000000 ? 14 : 18}px;padding-top:${gastoAnio >= 10000000 ? 5 : 0}px">${fmtClp(gastoAnio)}</div>
    <div class="kpi-sub">${desvioLabel}</div>
  </div>
</div>
${ocSection}
<div class="body">${contenido}</div>
<div class="footer">
  <span>${nombreEmpresa} \xb7 CMMS</span>
  <span class="footer-center">Informe Ejecutivo \xb7 ${hoy}</span>
  <span>Generado con Claude IA \xb7 Confidencial</span>
</div>
</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => { try { w.print(); } catch { /* cancelado */ } }, 350);
}
