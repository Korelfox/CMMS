import React from "react";
import { PageHead } from "../ui";

const HTML = `<style>
.iaa{font-family:'Inter',system-ui,sans-serif;background:#0d1117;color:#c9d1d9;padding:26px;border-radius:12px;font-size:13px;line-height:1.5}
.iaa-hdr{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;padding-bottom:14px;border-bottom:1px solid #21262d}
.iaa-h1{font-size:17px;font-weight:800;color:#e6edf3;letter-spacing:-0.3px}
.iaa-rev{font-size:11px;color:#6e7681;font-family:'IBM Plex Mono','Courier New',monospace}
.iaa-sec{margin-bottom:18px;background:#161b22;border:1px solid #21262d;border-radius:10px;padding:16px 18px}
.iaa-stit{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#7d8590;margin-bottom:12px;display:flex;align-items:center;gap:8px}
.iaa-badge{font-size:10px;font-weight:600;padding:2px 9px;border-radius:20px;text-transform:uppercase;letter-spacing:0.5px}
.iaa-badge.sl{background:rgba(100,116,139,.2);color:#94a3b8;border:1px solid rgba(100,116,139,.3)}
.iaa-badge.am{background:rgba(245,158,11,.2);color:#fbbf24;border:1px solid rgba(245,158,11,.3)}
.iaa-badge.rd{background:rgba(239,68,68,.2);color:#f87171;border:1px solid rgba(239,68,68,.3)}
.iaa-lbl{font-size:10px;font-weight:600;color:#6e7681;letter-spacing:.5px;margin-bottom:7px;margin-top:11px;text-transform:uppercase}
.iaa-lbl:first-child{margin-top:0}
.iaa-row{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:2px}
.iaa-box{flex:1;min-width:120px;padding:9px 11px;border-radius:7px;font-size:12px;font-weight:600;line-height:1.4}
.iaa-sub{display:block;font-size:10.5px;font-weight:400;margin-top:2px;opacity:.8}
.iaa-box.db{background:rgba(30,41,59,.8);border:1px solid #2d333b;color:#c9d1d9}
.iaa-box.dbg{background:rgba(245,158,11,.07);border:1px solid rgba(245,158,11,.4);color:#fbbf24}
.iaa-box.ctb{background:rgba(59,130,246,.12);border:1px solid rgba(59,130,246,.35);color:#93c5fd}
.iaa-box.ctc{background:rgba(6,182,212,.12);border:1px solid rgba(6,182,212,.35);color:#67e8f9}
.iaa-box.ctp{background:rgba(168,85,247,.12);border:1px solid rgba(168,85,247,.35);color:#d8b4fe}
.iaa-box.ctg{background:rgba(34,197,94,.12);border:1px solid rgba(34,197,94,.35);color:#86efac}
.iaa-box.efb{background:rgba(59,130,246,.18);border:1px solid rgba(59,130,246,.5);color:#bfdbfe}
.iaa-box.efc{background:rgba(6,182,212,.18);border:1px solid rgba(6,182,212,.5);color:#a5f3fc}
.iaa-box.efp{background:rgba(168,85,247,.18);border:1px solid rgba(168,85,247,.5);color:#e9d5ff}
.iaa-box.efg{background:rgba(34,197,94,.18);border:1px solid rgba(34,197,94,.5);color:#bbf7d0}
.iaa-box.stat{background:rgba(100,116,139,.12);border:1px solid rgba(100,116,139,.3);color:#cbd5e1}
.iaa-box.agt{background:rgba(15,23,42,.85);border:1px solid #2d333b;padding:12px 14px}
.iaa-agt-id{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#6e7681;margin-bottom:3px}
.iaa-agt-nm{font-size:13px;font-weight:700;color:#e6edf3;margin-bottom:3px}
.iaa-agt-ds{font-size:11.5px;color:#8b949e;line-height:1.5;font-weight:400}
.iaa-arr{text-align:center;color:#4b6ef6;font-size:13px;font-weight:600;padding:5px 0;letter-spacing:.3px}
.iaa-api{background:linear-gradient(135deg,rgba(59,130,246,.14),rgba(168,85,247,.14));border:1px solid rgba(99,102,241,.5);border-radius:9px;padding:14px 18px;margin-top:8px;text-align:center}
.iaa-api-t{font-size:15px;font-weight:800;color:#c7d2fe;margin-bottom:5px}
.iaa-api-s{font-size:11px;color:#94a3b8;margin-bottom:6px;font-family:'IBM Plex Mono',monospace}
.iaa-api-k{font-size:11.5px;color:#34d399;font-weight:600}
.iaa-gaps{display:flex;flex-direction:column;gap:9px}
.iaa-gap{display:flex;gap:12px;background:rgba(239,68,68,.05);border:1px solid rgba(239,68,68,.22);border-radius:7px;padding:11px 13px;align-items:flex-start}
.iaa-gid{font-size:10px;font-weight:800;color:#f87171;text-transform:uppercase;letter-spacing:1px;flex-shrink:0;padding-top:1px;min-width:42px}
.iaa-gt{font-size:12.5px;font-weight:700;color:#fca5a5;margin-bottom:4px}
.iaa-gd{font-size:11.5px;color:#8b949e;line-height:1.55;margin-bottom:5px}
.iaa-gf{font-size:11px;color:#34d399;font-weight:600}
</style>
<div class="iaa">
  <div class="iaa-hdr">
    <div class="iaa-h1">Arquitectura de Inteligencia Artificial — CMMS Pesquero</div>
    <div class="iaa-rev">Rev. 2026-06 · claude-sonnet-4-6</div>
  </div>

  <div class="iaa-sec">
    <div class="iaa-stit">Pipeline Claude API</div>

    <div class="iaa-lbl">Fuentes de datos — Supabase PostgreSQL (multi-tenant por empresa_id)</div>
    <div class="iaa-row">
      <div class="iaa-box db">BD Equipos<span class="iaa-sub">criticidad · horometro · tipo_nodo</span></div>
      <div class="iaa-box db">OTs &amp; Fallas<span class="iaa-sub">modo_falla · estado · cerrada_en</span></div>
      <div class="iaa-box db">Mareas &amp; Horómetros<span class="iaa-sub">mareas · lecturas_horometro</span></div>
      <div class="iaa-box db">Inventario<span class="iaa-sub">items · stock · consumos</span></div>
      <div class="iaa-box dbg">Mediciones PdM<span class="iaa-sub">⚠ gap — no inyectadas en IA</span></div>
    </div>

    <div class="iaa-arr">↓</div>

    <div class="iaa-lbl">Context Builders (src/lib/) — construyen el prompt del sistema</div>
    <div class="iaa-row">
      <div class="iaa-box ctb">copiloto.js<span class="iaa-sub">flota completa + OTs activas</span></div>
      <div class="iaa-box ctc">diagnostico.js<span class="iaa-sub">fallas + modo + historial</span></div>
      <div class="iaa-box ctp">informe context<span class="iaa-sub">KPIs + tendencias críticas</span></div>
      <div class="iaa-box ctg">ocr-parser<span class="iaa-sub">imagen → base64 JPEG</span></div>
    </div>

    <div class="iaa-arr">↓&nbsp;&nbsp;SSE streaming · respuesta fragmentada en tiempo real</div>

    <div class="iaa-lbl">Supabase Edge Functions — Deno runtime · solo server-side · sin acceso desde browser</div>
    <div class="iaa-row">
      <div class="iaa-box efb">copiloto-flota<span class="iaa-sub">análisis + chat interactivo</span></div>
      <div class="iaa-box efc">diagnostico-fallas<span class="iaa-sub">modo de falla + causa raíz</span></div>
      <div class="iaa-box efp">informe-ejecutivo<span class="iaa-sub">resumen gerencial PDF-ready</span></div>
      <div class="iaa-box efg">ocr-factura<span class="iaa-sub">extracción de datos → JSON</span></div>
    </div>

    <div class="iaa-arr">↓&nbsp;&nbsp;HTTPS · Authorization: Bearer ANTHROPIC_API_KEY</div>

    <div class="iaa-api">
      <div class="iaa-api-t">Anthropic Claude API</div>
      <div class="iaa-api-s">claude-sonnet-4-6 · max_tokens 2048–4096 · temperature 0.4–0.7 · streaming SSE</div>
      <div class="iaa-api-k">🔒&nbsp;ANTHROPIC_API_KEY — vive solo en Supabase Secrets · nunca llega al navegador</div>
    </div>
  </div>

  <div class="iaa-sec">
    <div class="iaa-stit">Pipeline Estadístico <span class="iaa-badge sl">Sin Claude · cómputo en browser</span></div>
    <div class="iaa-row">
      <div class="iaa-box stat">ConfiabilidadML<span class="iaa-sub">Weibull biparamétrico · curva TTF · estimación β y η</span></div>
      <div class="iaa-box stat">RCA — Causa Raíz<span class="iaa-sub">Pareto 80/20 · Bow-Tie manual · árbol de causas</span></div>
      <div class="iaa-box stat">Score de Riesgo<span class="iaa-sub">Criticidad × MTTR × Frecuencia de falla</span></div>
    </div>
  </div>

  <div class="iaa-sec">
    <div class="iaa-stit">Agentes de Monitoreo IA <span class="iaa-badge am">Frontend · useMemo · Alertas.jsx</span></div>
    <div class="iaa-row">
      <div class="iaa-box agt">
        <div class="iaa-agt-id">IA-A</div>
        <div class="iaa-agt-nm">Datos de criticidad</div>
        <div class="iaa-agt-ds">Equipos sin criticidad asignada. &gt;5 → amber · &gt;20 → rojo</div>
      </div>
      <div class="iaa-box agt">
        <div class="iaa-agt-id">IA-B</div>
        <div class="iaa-agt-nm">OTs sin modo de falla</div>
        <div class="iaa-agt-ds">% OTs correctivas sin modo_falla. &gt;30% → amber · &gt;60% → rojo</div>
      </div>
      <div class="iaa-box agt">
        <div class="iaa-agt-id">IA-C</div>
        <div class="iaa-agt-nm">Historial equipos críticos A</div>
        <div class="iaa-agt-ds">Críticos A con &lt;4 OTs cerradas — sin historial suficiente para diagnóstico</div>
      </div>
      <div class="iaa-box agt">
        <div class="iaa-agt-id">IA-D</div>
        <div class="iaa-agt-nm">Señales PdM activas</div>
        <div class="iaa-agt-ds">Series PdM sin medición &gt;30 días — datos necesarios para análisis predictivo</div>
      </div>
    </div>
  </div>

  <div class="iaa-sec">
    <div class="iaa-stit">Brechas ISO 14224 identificadas <span class="iaa-badge rd">Requieren acción</span></div>
    <div class="iaa-gaps">
      <div class="iaa-gap">
        <div class="iaa-gid">GAP-1</div>
        <div>
          <div class="iaa-gt">Weibull usa días calendario en lugar de horas de operación</div>
          <div class="iaa-gd">ConfiabilidadML calcula TTF usando fechas de OT. ISO 14224 §9.3 requiere parámetro de exposición = horas reales de operación desde lecturas_horometro. Afecta β (forma) y η (escala) del modelo.</div>
          <div class="iaa-gf">→ Fix: cruzar lectura de horómetro más cercana a cada fecha de falla para obtener horas TTF real.</div>
        </div>
      </div>
      <div class="iaa-gap">
        <div class="iaa-gid">GAP-2</div>
        <div>
          <div class="iaa-gt">Horómetros no inyectados en contexto IA</div>
          <div class="iaa-gd">Copiloto Flota e Informe Ejecutivo no incluyen el historial de horas de operación en su contexto, limitando el análisis de desgaste real y vida remanente de equipos.</div>
          <div class="iaa-gf">→ Fix: agregar summary de lecturas_horometro en copiloto.js e informe context builder.</div>
        </div>
      </div>
      <div class="iaa-gap">
        <div class="iaa-gid">GAP-3</div>
        <div>
          <div class="iaa-gt">ANTHROPIC_API_KEY pendiente de configurar en Supabase Secrets</div>
          <div class="iaa-gd">Las 4 Edge Functions retornan HTTP 500 hasta que se configure la clave. Bloquea todo el pipeline IA en producción.</div>
          <div class="iaa-gf">→ Fix: Supabase Dashboard → Project Settings → Edge Functions → Secrets → agregar ANTHROPIC_API_KEY.</div>
        </div>
      </div>
      <div class="iaa-gap">
        <div class="iaa-gid">GAP-4</div>
        <div>
          <div class="iaa-gt">Taxonomía FMECA no estructurada (ISO 14224 Apéndice C)</div>
          <div class="iaa-gd">OTs tienen modo_falla de texto libre. ISO 14224 define 3 niveles (clase → grupo → código) para análisis estadístico válido y benchmarking de industria.</div>
          <div class="iaa-gf">→ Fix: tabla modo_falla_catalogo + selector jerárquico en OTs (enabler clave para Diagnóstico IA y Confiabilidad).</div>
        </div>
      </div>
    </div>
  </div>
</div>`;

export default function ArquitecturaIA() {
  return (
    <div style={{ paddingBottom: 40 }}>
      <PageHead
        kicker="Sistema · Inteligencia Artificial"
        title="Arquitectura IA"
        sub="Pipeline completo: fuentes de datos → context builders → Edge Functions → Claude API. Módulos estadísticos, agentes de monitoreo y brechas ISO 14224 identificadas."
      />
      <div dangerouslySetInnerHTML={{ __html: HTML }} />
    </div>
  );
}
