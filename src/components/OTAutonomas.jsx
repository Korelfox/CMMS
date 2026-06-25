import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Workflow, Timer, CalendarRange, Sigma, Activity, Wrench, Cpu, Fingerprint,
  Lightbulb, UserCheck, ClipboardList, RotateCw, Anchor, CalendarClock,
  Check, RefreshCw, AlertTriangle, Bot, Zap, X,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { useOnline } from "../lib/offline";
import { supabase } from "../lib/supabase";
import { fetchAll, insertRow, updateRow, logActivity } from "../lib/db";
import { folioOT } from "../lib/ot";
import { generarOTsPreventivas, generarOTsPredictivas } from "../lib/autoOT";
import { C, tint, canOperate } from "../theme";
import { Card, PageHead, InlineSpinner, Empty } from "../ui";
import { hoyLocal } from "../lib/fechas";

// ── Paleta del blueprint (oscuro en ambos temas, como el plano de arquitectura) ──
const D = {
  bg: "#0d1117", bg2: "#161b22", bdr: "#21262d", ink: "#e6edf3",
  text: "#c9d1d9", muted: "#8b949e", dim: "#6e7681",
};
const TONE_DIAG = {
  blue:   { t: "#93c5fd", bg: "rgba(59,130,246,.14)", b: "rgba(59,130,246,.45)" },
  cyan:   { t: "#67e8f9", bg: "rgba(6,182,212,.14)",  b: "rgba(6,182,212,.45)"  },
  green:  { t: "#86efac", bg: "rgba(34,197,94,.14)",  b: "rgba(34,197,94,.45)"  },
  amber:  { t: "#fbbf24", bg: "rgba(245,158,11,.14)", b: "rgba(245,158,11,.45)" },
  purple: { t: "#d8b4fe", bg: "rgba(168,85,247,.14)", b: "rgba(168,85,247,.45)" },
};

function Step({ icon: Ico, title, sub, tone = "blue", dim = false, wide = false }) {
  const c = TONE_DIAG[tone];
  return (
    <div style={{
      flex: wide ? "1 1 100%" : 1, minWidth: 128,
      padding: "10px 13px", borderRadius: 8,
      background: dim ? "rgba(100,116,139,.08)" : c.bg,
      border: `1px solid ${dim ? "rgba(100,116,139,.3)" : c.b}`,
      opacity: dim ? 0.6 : 1,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: sub ? 3 : 0 }}>
        {Ico && <Ico size={14} color={dim ? D.dim : c.t} style={{ flexShrink: 0 }} />}
        <span style={{ fontSize: 12.5, fontWeight: 700, color: dim ? D.muted : c.t }}>{title}</span>
      </div>
      {sub && <div style={{ fontSize: 11, color: D.muted, lineHeight: 1.45, fontWeight: 400 }}>{sub}</div>}
    </div>
  );
}

function Flow({ children }) {
  return <div style={{ textAlign: "center", color: "#4b6ef6", fontSize: 12.5, fontWeight: 600, padding: "5px 0", letterSpacing: 0.2 }}>{children}</div>;
}

function DiagLabel({ children }) {
  return <div style={{ fontSize: 10, fontWeight: 700, color: D.dim, letterSpacing: 0.9, textTransform: "uppercase", margin: "0 0 8px" }}>{children}</div>;
}

function Chip({ color, bg, border, children }) {
  return (
    <span style={{ fontSize: 10.5, fontWeight: 700, color, background: bg, border: `1px solid ${border}`, borderRadius: 20, padding: "2px 10px", whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

function EmbNaveTag({ emb }) {
  const col = emb?.color || C.steel;
  const label = emb?.nombre || "Sin nave";
  return (
    <span
      title={emb?.codigo ? `${emb.nombre} (${emb.codigo})` : label}
      style={{
        fontSize: 11,
        fontWeight: 700,
        color: col,
        background: tint(col, 12),
        border: `1px solid ${tint(col, 32)}`,
        borderRadius: 6,
        padding: "2px 8px",
        whiteSpace: "nowrap",
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        flexShrink: 0,
      }}
    >
      <Anchor size={11} style={{ flexShrink: 0 }} />
      {label}
      {emb?.codigo && (
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: 600, opacity: 0.85 }}>
          {emb.codigo}
        </span>
      )}
    </span>
  );
}

// ── Badges en la paleta de la app ──
// El "origen" identifica QUÉ disparó la sugerencia → ícono, color y etiqueta.
const ORIGEN_META = {
  cron:       { Icon: Wrench,   color: C.red,    label: "PM vencido" },
  manual:     { Icon: Wrench,   color: C.red,    label: "PM vencido" },
  condicion:  { Icon: Activity, color: C.cyan,   label: "Condición PdM" },
  predictivo: { Icon: Sigma,    color: C.purple, label: "Predictivo" },
};
function TipoBadge({ origen }) {
  const m = ORIGEN_META[origen] || ORIGEN_META.cron;
  return (
    <span style={{ fontSize: 10.5, fontWeight: 700, color: m.color, background: tint(m.color, 14), border: `1px solid ${tint(m.color, 35)}`, borderRadius: 20, padding: "1px 9px", whiteSpace: "nowrap" }}>
      {m.label}
    </span>
  );
}
function CritBadge({ nivel }) {
  if (!nivel) return null;
  const col = nivel === "A" ? C.red : nivel === "B" ? C.yellow : C.steel;
  return (
    <span style={{ fontSize: 10.5, fontWeight: 700, color: col, background: tint(col, 12), border: `1px solid ${tint(col, 30)}`, borderRadius: 20, padding: "1px 8px" }}>
      Crit. {nivel}
    </span>
  );
}

function StatCard({ label, valor, color = C.steel, sub }) {
  return (
    <div style={{ flex: 1, minWidth: 130, background: C.surface, border: `1px solid ${C.line}`, borderRadius: 11, padding: "13px 15px" }}>
      <div style={{ fontSize: 11, color: C.slate, fontWeight: 600, marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 25, fontWeight: 800, color, lineHeight: 1 }}>{valor}</div>
      {sub && <div style={{ fontSize: 10.5, color: C.slate, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export default function OTAutonomas({ onNavigate }) {
  const { profile } = useAuth();
  const online = useOnline();
  const puedeOperar = canOperate(profile?.rol);

  const [data, setData] = useState({ planes: [], equipos: [], ots: [], lecturas: [] });
  const [embarcaciones, setEmbarcaciones] = useState([]);
  const [sugerencias, setSugerencias] = useState([]);   // bandeja: ot_sugerencias estado 'sugerida'
  const [cargando, setCargando] = useState(true);
  const [ts, setTs] = useState(null);
  const [generando, setGenerando] = useState(false);
  const [confirmando, setConfirmando] = useState(null); // id de sugerencia | "all"
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [planes, equipos, ots, lecturas, embs, sugs] = await Promise.all([
        fetchAll("planes_pm"),
        fetchAll("equipos"),
        fetchAll("ordenes_trabajo"),
        fetchAll("lecturas_horometro"),
        fetchAll("embarcaciones", { order: { col: "codigo", asc: true } }),
        supabase.from("ot_sugerencias").select("*").eq("estado", "sugerida").order("created_at", { ascending: false }),
      ]);
      setData({ planes: planes || [], equipos: equipos || [], ots: ots || [], lecturas: lecturas || [] });
      setEmbarcaciones(embs || []);
      setSugerencias(sugs?.data || []);
      setTs(new Date());
    } catch { /* conserva datos previos */ }
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // Preview del motor (cliente): vencidos que aún no están materializados —
  // ni como OT firme ni como sugerencia en bandeja. Dedup contra ambos.
  const motor = useMemo(() => {
    const conHuella = [...data.ots, ...sugerencias];
    return generarOTsPreventivas({ planes: data.planes, equipos: data.equipos, ots: conHuella });
  }, [data, sugerencias]);

  const planesHoras = useMemo(
    () => data.planes.filter((p) => p.activo !== false && p.tipo_disparador !== "calendario").length,
    [data.planes]
  );

  const embMap = useMemo(
    () => Object.fromEntries(embarcaciones.map((e) => [e.id, e])),
    [embarcaciones],
  );

  const embDeSug = useCallback((s) => {
    const id = s.embarcacion_id || data.equipos.find((e) => e.id === s.equipo_id)?.embarcacion_id;
    return id ? embMap[id] : null;
  }, [data.equipos, embMap]);

  function mensajeError(e) {
    const msg = e?.message || String(e);
    if (/ot_sugerencias|generar_ots|function|origen|huella|column|does not exist/i.test(msg)) {
      return "Faltan objetos de BD de la Fase 2. Aplica las migraciones 20260614_0001 y 0002 en Supabase y reintenta.";
    }
    return "Operación fallida: " + msg;
  }

  async function crearOT(sug, actuales) {
    const folio = folioOT(actuales, online);
    return insertRow("ordenes_trabajo", profile.empresa_id, {
      folio,
      embarcacion_id: sug.embarcacion_id,
      equipo_id: sug.equipo_id,
      sistema: sug.sistema,
      tipo: "preventivo",
      descripcion: sug.descripcion,
      prioridad: sug.prioridad || "alta",
      fecha: hoyLocal(),
      estado: "planificada",
      origen: "auto",
      huella: sug.huella,
      created_by: profile.id,
    });
  }

  // Genera ahora (no esperar al cron): PM/condición server-side + predictivo cliente.
  async function generarAhora() {
    setGenerando(true); setError(""); setAviso("");
    try {
      // (1) PM + condición + auto-confirm C — server-side, scoped a la empresa.
      const { data: n, error: e } = await supabase.rpc("generar_ots_preventivas");
      if (e) throw e;
      // (2) Predictivo (Weibull) — se evalúa en el cliente y se materializa en la bandeja.
      const pred = generarOTsPredictivas({
        equipos: data.equipos, ots: [...data.ots, ...sugerencias], lecturas: data.lecturas, hoy: new Date(),
      });
      if (pred.sugerencias.length > 0) {
        const filas = pred.sugerencias.map((s) => ({
          empresa_id: profile.empresa_id, huella: s.huella, plan_pm_id: null,
          equipo_id: s.equipo_id, embarcacion_id: s.embarcacion_id, sistema: s.sistema,
          tipo: "preventivo", prioridad: s.prioridad, descripcion: s.descripcion,
          motivo: s.motivo, criticidad: s.criticidad, horas_actual: s.horas_actual,
          elapsed: s.elapsed, limite: s.limite, estado: "sugerida", origen: "predictivo",
        }));
        const { error: ep } = await supabase
          .from("ot_sugerencias")
          .upsert(filas, { onConflict: "empresa_id,huella", ignoreDuplicates: true });
        if (ep) throw ep;
      }
      await cargar();
      const partes = [];
      if ((n || 0) > 0) partes.push(`${n} por reglas (PM/condición)`);
      if (pred.total > 0) partes.push(`${pred.total} predictiva${pred.total !== 1 ? "s" : ""}`);
      setAviso(partes.length ? `Bandeja actualizada: ${partes.join(" + ")}.` : "Sin nuevos disparadores: la bandeja ya está al día.");
    } catch (e) { setError(mensajeError(e)); }
    finally { setGenerando(false); }
  }

  // Confirmar una sugerencia → nace la OT firme + se marca confirmada.
  async function confirmarSug(sug, actualesPre) {
    const actuales = actualesPre || await fetchAll("ordenes_trabajo");
    let otId = actuales.find((o) => o.huella === sug.huella)?.id || null;
    let folio = null;
    if (!otId) {
      try {
        const ot = await crearOT(sug, actuales);
        otId = ot.id; folio = ot.folio;
        actuales.unshift(ot);
      } catch (e) {
        // 23505: el cron u otro usuario ya creó la OT de esta huella (índice
        // único ux_ot_empresa_huella). La recuperamos en vez de duplicar.
        if (e?.code !== "23505") throw e;
        const refetch = await fetchAll("ordenes_trabajo");
        otId = refetch.find((o) => o.huella === sug.huella)?.id || null;
        if (!otId) throw e;
      }
    }
    await updateRow("ot_sugerencias", sug.id, {
      estado: "confirmada", ot_id: otId,
      resolved_at: new Date().toISOString(), resolved_by: profile.id,
    });
    if (folio) logActivity(profile, "OT auto-generada (confirmada)", `${folio} · ${sug.sistema} · ${sug.motivo || ""}`);
    return otId;
  }

  async function onConfirmarUna(sug) {
    setConfirmando(sug.id); setError(""); setAviso("");
    try {
      await confirmarSug(sug);
      setSugerencias((p) => p.filter((s) => s.id !== sug.id));
      setAviso(`OT creada y planificada para ${sug.sistema || "el equipo"}${embDeSug(sug)?.nombre ? ` · ${embDeSug(sug).nombre}` : ""}.`);
    } catch (e) { setError(mensajeError(e)); }
    finally { setConfirmando(null); }
  }

  async function onConfirmarTodas() {
    if (!sugerencias.length) return;
    setConfirmando("all"); setError(""); setAviso("");
    try {
      const actuales = await fetchAll("ordenes_trabajo");
      let n = 0;
      for (const sug of sugerencias) { await confirmarSug(sug, actuales); n++; }
      setSugerencias([]);
      setAviso(`${n} OT${n !== 1 ? "s" : ""} creada${n !== 1 ? "s" : ""} y planificada${n !== 1 ? "s" : ""}.`);
    } catch (e) { setError(mensajeError(e)); }
    finally { setConfirmando(null); }
  }

  async function onRechazar(sug) {
    setConfirmando(sug.id); setError(""); setAviso("");
    try {
      await updateRow("ot_sugerencias", sug.id, {
        estado: "rechazada", resolved_at: new Date().toISOString(), resolved_by: profile.id,
      });
      setSugerencias((p) => p.filter((s) => s.id !== sug.id));
    } catch (e) { setError(mensajeError(e)); }
    finally { setConfirmando(null); }
  }

  const tsStr = ts ? ts.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" }) : null;
  const sinAccion = !puedeOperar || !online;

  return (
    <div style={{ paddingBottom: 40 }}>
      <PageHead
        kicker="Operación · CMMS autónomo"
        title="OTs Automáticas"
        sub="Cada noche el motor detecta planes preventivos vencidos y deja las propuestas en la bandeja, sin que nadie abra la app. Tú confirmas; nace la OT firme. La huella de idempotencia evita duplicados."
      />

      {/* ───────────── Blueprint del lazo de control ───────────── */}
      <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: D.bg, color: D.text, padding: 24, borderRadius: 12, marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, paddingBottom: 12, borderBottom: `1px solid ${D.bdr}`, gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <Workflow size={18} color="#93c5fd" />
            <span style={{ fontSize: 16, fontWeight: 800, color: D.ink, letterSpacing: -0.3 }}>Lazo de control · Generación automática de OTs</span>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Chip color="#86efac" bg="rgba(34,197,94,.12)" border="rgba(34,197,94,.35)">Cron nocturno · activo</Chip>
            <Chip color={D.muted} bg="rgba(100,116,139,.12)" border="rgba(100,116,139,.3)">Predictivo · Fase 2</Chip>
          </div>
        </div>

        <DiagLabel>1 · Disparadores — eventos que pueden originar trabajo</DiagLabel>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          <Step icon={Timer}         title="Horas (horómetro)" sub="PM vencido por horas de operación" tone="green" />
          <Step icon={CalendarRange} title="Calendario"        sub="PM vencido por período" tone="green" />
          <Step icon={Sigma}         title="Predictivo (RUL)"  sub="Weibull proyecta falla · Fase 2" tone="purple" dim />
          <Step icon={Activity}      title="Condición (PdM)"   sub="medición cruza umbral · Fase 2" tone="cyan" dim />
          <Step icon={Wrench}        title="Derivado"          sub="stock, inspección, varada · Fase 2" tone="amber" dim />
        </div>

        <Flow>↓ &nbsp;pg_cron 08:00 UTC · evaluarPlanes() · vencido = elapsed ≥ intervalo</Flow>

        <DiagLabel>2 · Motor de reglas — _gen_ots() en SQL + src/lib/autoOT.js</DiagLabel>
        <Step icon={Cpu} title="Genera sin intervención" sub="Corre en la base de datos cada noche y materializa los vencidos. Mismo criterio determinístico en SQL y en el preview del cliente." tone="blue" wide />

        <Flow>↓ &nbsp;huella  pm:{"{plan}"}:{"{hito}"}  ·  unique(empresa, huella)</Flow>

        <DiagLabel>3 · Idempotencia — el mecanismo anti-spam</DiagLabel>
        <Step icon={Fingerprint} title="Huella de ciclo" sub="ON CONFLICT DO NOTHING: la sugerencia no se regenera mientras el PM siga pendiente; al ejecutarse el PM el hito avanza y se habilita el próximo ciclo." tone="amber" wide />

        <Flow>↓</Flow>

        <DiagLabel>4 · Bandeja de sugerencias (staging aislado)</DiagLabel>
        <Step icon={Lightbulb} title="ot_sugerencias + motivo" sub="Tabla separada: una sugerencia NO contamina KPIs, backlog ni el gate de zarpe hasta que se confirma. Carga el motivo explicable." tone="cyan" wide />

        <Flow>↓ &nbsp;compuerta de confianza</Flow>

        <DiagLabel>5 · Compuerta humana</DiagLabel>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          <Step icon={UserCheck} title="Confirmación humana" sub="El planificador confirma o rechaza cada propuesta" tone="green" />
          <Step icon={Bot} title="Auto-confirmación por criticidad" sub="Fase 2: PM rutinario de criticidad C entra solo; A siempre con ojo humano" tone="purple" dim />
        </div>

        <Flow>↓</Flow>

        <DiagLabel>6 · OT firme + integración con tus lazos existentes</DiagLabel>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          <Step icon={ClipboardList} title="OT planificada (origen=auto)" sub="Entra al backlog como trabajo real, trazable" tone="blue" />
          <Step icon={CalendarClock} title="→ Ventana de Puerto" sub="se slotea en la próxima recalada óptima" tone="cyan" />
          <Step icon={Anchor} title="→ Evaluar Zarpe" sub="si es crítica y queda pendiente: NO-GO" tone="amber" />
        </div>

        <Flow>↓ &nbsp;ejecución → PM registrado → el hito avanza</Flow>

        <div style={{ display: "flex", alignItems: "center", gap: 11, background: "rgba(34,197,94,.08)", border: "1px dashed rgba(34,197,94,.4)", borderRadius: 9, padding: "12px 15px" }}>
          <RotateCw size={18} color="#86efac" style={{ flexShrink: 0 }} />
          <div style={{ fontSize: 12, color: D.text, lineHeight: 1.5 }}>
            <strong style={{ color: "#86efac" }}>El lazo se cierra:</strong> al ejecutar el PM, el horómetro o la fecha del último mantenimiento avanza → la huella cambia → queda habilitada la OT del próximo ciclo. El sistema vuelve a vigilar solo.
          </div>
        </div>
      </div>

      {/* ───────────── Bandeja ───────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: C.abyss }}>Bandeja de sugerencias</span>
          {cargando && <span style={{ fontSize: 11.5, color: C.slate }}>· cargando…</span>}
          {tsStr && !cargando && <span style={{ fontSize: 11.5, color: C.slate }}>· {tsStr}</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button onClick={generarAhora} disabled={sinAccion || generando}
            title={!puedeOperar ? "Tu rol no permite generar" : !online ? "Sin conexión" : "Corre el motor ahora, sin esperar la noche"}
            style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 700, color: "#fff", background: sinAccion ? C.slate : C.steel, border: "none", borderRadius: 8, padding: "7px 14px", cursor: sinAccion || generando ? "default" : "pointer", opacity: generando ? 0.7 : 1 }}>
            <Zap size={14} /> {generando ? "Generando…" : "Generar ahora"}
          </button>
          <button onClick={cargar} disabled={cargando} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: C.steel, background: tint(C.steel, 10), border: `1px solid ${tint(C.steel, 30)}`, borderRadius: 8, padding: "6px 12px", cursor: cargando ? "default" : "pointer", opacity: cargando ? 0.5 : 1 }}>
            <RefreshCw size={13} /> Recargar
          </button>
        </div>
      </div>

      {/* Estadísticas */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <StatCard label="Planes por horas activos" valor={cargando ? "—" : planesHoras} color={C.steel} />
        <StatCard label="En bandeja (por confirmar)" valor={cargando ? "—" : sugerencias.length} color={sugerencias.length > 0 ? C.gold : C.green} />
        <StatCard label="Sin materializar" valor={cargando ? "—" : motor.total} color={motor.total > 0 ? C.amber : C.green} sub="el motor los detecta; aún no generados" />
        <StatCard label="Motor nocturno" valor="08:00" color={C.purple} sub="UTC · pg_cron diario" />
      </div>

      {error && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 9, background: tint(C.red, 8), border: `1px solid ${tint(C.red, 35)}`, borderRadius: 10, padding: "11px 14px", marginBottom: 14 }}>
          <AlertTriangle size={16} color={C.red} style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 12.5, color: C.ink, lineHeight: 1.5 }}>{error}</span>
        </div>
      )}
      {aviso && !error && (
        <div style={{ display: "flex", alignItems: "center", gap: 9, background: tint(C.green, 10), border: `1px solid ${tint(C.green, 35)}`, borderRadius: 10, padding: "11px 14px", marginBottom: 14 }}>
          <Check size={16} color={C.green} style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 12.5, color: C.ink }}>
            {aviso}
            <button onClick={() => onNavigate?.("ots")} style={{ marginLeft: 8, fontSize: 12.5, fontWeight: 700, color: C.steel, background: "none", border: "none", cursor: "pointer", textDecoration: "underline", padding: 0 }}>
              Ver Órdenes de Trabajo
            </button>
          </span>
        </div>
      )}

      <Card>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: sugerencias.length ? 12 : 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: C.abyss }}>
            Propuestas pendientes{sugerencias.length > 0 ? ` · ${sugerencias.length}` : ""}
          </div>
          {sugerencias.length > 0 && (
            <button onClick={onConfirmarTodas} disabled={sinAccion || confirmando === "all"}
              title={!puedeOperar ? "Tu rol no permite generar OTs" : !online ? "Sin conexión" : ""}
              style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 700, color: "#fff", background: sinAccion ? C.slate : C.green, border: "none", borderRadius: 9, padding: "8px 16px", cursor: sinAccion || confirmando === "all" ? "default" : "pointer", opacity: confirmando === "all" ? 0.7 : 1 }}>
              <Check size={15} /> {confirmando === "all" ? "Creando…" : `Confirmar todas (${sugerencias.length})`}
            </button>
          )}
        </div>

        {cargando ? (
          <InlineSpinner label="Cargando bandeja…" />
        ) : sugerencias.length === 0 ? (
          <Empty>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <Check size={26} color={motor.total > 0 ? C.amber : C.green} />
              <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink }}>
                {motor.total > 0 ? "Bandeja vacía, pero hay vencidos sin materializar" : "Bandeja al día"}
              </div>
              <div style={{ fontSize: 12.5, color: C.slate, maxWidth: 460, lineHeight: 1.5 }}>
                {motor.total > 0
                  ? `El motor detecta ${motor.total} plan${motor.total !== 1 ? "es" : ""} vencido${motor.total !== 1 ? "s" : ""} todavía sin propuesta. Pulsa “Generar ahora” o espera la corrida nocturna de las 08:00 UTC.`
                  : "Ningún plan preventivo está vencido. El motor vuelve a evaluar cada noche automáticamente."}
              </div>
            </div>
          </Empty>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {sugerencias.map((s) => {
              const enCurso = confirmando === s.id;
              const meta = ORIGEN_META[s.origen] || ORIGEN_META.cron;
              const OIcon = meta.Icon;
              const emb = embDeSug(s);
              const embCol = emb?.color || C.steel;
              return (
                <div key={s.id} style={{ display: "flex", alignItems: "stretch", borderRadius: 10, border: `1px solid ${C.line}`, background: C.surface2, overflow: "hidden" }}>
                  <div
                    title={emb?.nombre || "Embarcación"}
                    style={{ width: 4, flexShrink: 0, background: embCol }}
                  />
                  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 13px", flex: 1, minWidth: 0, flexWrap: "wrap" }}>
                  <div style={{ width: 34, height: 34, borderRadius: 9, background: tint(meta.color, 12), display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <OIcon size={16} color={meta.color} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <EmbNaveTag emb={emb} />
                      <span style={{ fontSize: 13.5, fontWeight: 700, color: C.abyss }}>{s.sistema || "Equipo"}</span>
                      <TipoBadge origen={s.origen} />
                      <CritBadge nivel={s.criticidad} />
                    </div>
                    <div style={{ fontSize: 12.5, color: C.ink, marginTop: 2 }}>{s.descripcion}</div>
                    <div style={{ fontSize: 11.5, color: C.slate, marginTop: 3, lineHeight: 1.45 }}>{s.motivo}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button onClick={() => onRechazar(s)} disabled={sinAccion || enCurso}
                      title="Descartar (la huella sigue evitando que se regenere)"
                      style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, fontWeight: 600, color: sinAccion ? C.slate : C.slate, background: C.surface, border: `1px solid ${C.line}`, borderRadius: 8, padding: "7px 11px", cursor: sinAccion || enCurso ? "default" : "pointer" }}>
                      <X size={13} /> Rechazar
                    </button>
                    <button onClick={() => onConfirmarUna(s)} disabled={sinAccion || enCurso}
                      title={!puedeOperar ? "Tu rol no permite generar OTs" : !online ? "Sin conexión" : ""}
                      style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, color: sinAccion ? C.slate : "#fff", background: sinAccion ? tint(C.slate, 12) : C.green, border: "none", borderRadius: 8, padding: "7px 13px", cursor: sinAccion || enCurso ? "default" : "pointer", opacity: enCurso ? 0.7 : 1 }}>
                      <ClipboardList size={13} /> {enCurso ? "Creando…" : "Confirmar → OT"}
                    </button>
                  </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!puedeOperar && sugerencias.length > 0 && (
          <div style={{ fontSize: 11.5, color: C.slate, marginTop: 10, fontStyle: "italic" }}>
            Tu rol permite ver la bandeja pero no confirmar. Un planificador o administrador debe aprobar las propuestas.
          </div>
        )}
      </Card>
    </div>
  );
}
