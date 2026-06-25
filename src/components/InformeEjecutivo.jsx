import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  Sparkles, FileText, Copy, Download, Printer, RefreshCw, AlertCircle,
  Check, Ship, ShieldAlert, CalendarClock, DollarSign, Save,
} from "lucide-react";
import { insertRow } from "../lib/db";
import { useFleetData } from "../hooks/useFleetData";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { evaluarPlanes } from "../lib/pm";
import { riesgoFlota } from "../lib/riesgo";
import { presupuestoFlota, runRate } from "../lib/presupuesto";
import { coberturaCriticos } from "../lib/operacional";
import { analizarMinMax } from "../lib/minmax";
import { ventanaPuerto } from "../lib/planificacion";
import { construirContextoInforme } from "../lib/contextoIA";
import { imprimirInforme } from "../lib/imprimir";
import { C, archivo, tint, clp } from "../theme";
import { Card, PageHead, Pill, ErrorBanner, InlineSpinner } from "../ui";
import { renderMarkdown } from "./Markdown";
import { hoyLocal } from "../lib/fechas";

const PERIODOS = [
  { meses: 3,  label: "últimos 3 meses" },
  { meses: 6,  label: "últimos 6 meses" },
  { meses: 12, label: "últimos 12 meses" },
];

const SPEC = [
  { tabla: "embarcaciones",      opts: { order: { col: "codigo", asc: true } } },
  "equipos",
  "planes_pm",
  "ordenes_trabajo",
  "mareas",
  "inventario_items",
  "stock",
  "inventario_item_destinos",
  { tabla: "presupuestos",       soft: true },
  { tabla: "varadas",            soft: true },
  { tabla: "compras",            opts: { order: { col: "fecha", asc: false } }, soft: true },
  { tabla: "compras_items",      soft: true },
  { tabla: "lecturas_horometro", opts: { order: { col: "fecha", asc: false } }, soft: true },
];

export default function InformeEjecutivo() {
  const { empresa, profile } = useAuth();
  const [raw, loading, error, reload] = useFleetData(SPEC);
  const [meses, setMeses]     = useState(3);
  const [texto, setTexto]     = useState("");
  const [generando, setGenerando] = useState(false);
  const [genError, setGenError]   = useState(null);
  const [copiado, setCopiado]     = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado]   = useState(false);
  const abortRef = useRef(null);

  useEffect(() => () => { if (abortRef.current) abortRef.current.abort(); }, []);

  const data = useMemo(() => {
    if (!raw) return null;
    return {
      embs:         raw.embarcaciones,
      eqs:          raw.equipos,
      planes:       raw.planes_pm,
      ots:          raw.ordenes_trabajo,
      mareas:       raw.mareas,
      items:        raw.inventario_items,
      stock:        raw.stock,
      destinos:     raw.inventario_item_destinos,
      presupuestos: raw.presupuestos,
      varadas:      raw.varadas,
      compras:      raw.compras,
      comprasItems: raw.compras_items,
      lecturas:     raw.lecturas_horometro,
    };
  }, [raw]);

  const hoy = useMemo(() => hoyLocal(), []);
  const anio = useMemo(() => new Date().getFullYear(), []);

  // Construye el contexto estructurado reutilizando las libs analíticas.
  const contexto = useMemo(() => {
    if (!data) return null;
    const { embs, eqs, planes, ots, mareas, items, stock, destinos, presupuestos, lecturas } = data;
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
      estadoPorNave, presupuestoData, runRateFlota, sinCobertura, itemsSubdotados,
      lecturas: lecturas || [],
      hoy,
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
          else if (obj.done) break;
          else if (obj.error) { setGenError(obj.error); break; }
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
    imprimirInforme({ contexto, ocStats, texto, hoy, empresa, meses, anio });
  }, [contexto, ocStats, texto, hoy, empresa, meses, anio]);

  const guardar = useCallback(async () => {
    if (!texto || !empresa?.id || !contexto) return;
    setGuardando(true);
    try {
      await insertRow("informes_ejecutivos", empresa.id, {
        fecha: hoy,
        periodo_meses: meses,
        periodo_label: contexto.periodo?.label || `últimos ${meses} meses`,
        texto_md: texto,
        contexto_json: { ...contexto, ocStats },
        created_by: profile?.id ?? null,
      });
      setGuardado(true);
      setTimeout(() => setGuardado(false), 3000);
    } catch (e) {
      setGenError("No se pudo guardar el informe: " + e.message);
    } finally {
      setGuardando(false);
    }
  }, [texto, hoy, meses, empresa, contexto, ocStats, profile]);

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
      <ErrorBanner onRetry={reload}>{error}</ErrorBanner>

      {/* Snapshot de datos que alimentan el informe */}
      {snap && (
        <div className="cmms-collapse-mobile" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 16 }}>
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
                <button onClick={guardar} style={ghostBtn} title="Guardar en Reportes" disabled={guardando}>
                  {guardado ? <Check size={15} color={C.green} /> : <Save size={15} color={guardando ? C.slate : undefined} />}
                </button>
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
