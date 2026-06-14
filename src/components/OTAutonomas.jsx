import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Workflow, Timer, CalendarRange, Sigma, Activity, Wrench, Cpu, Fingerprint,
  Lightbulb, UserCheck, ClipboardList, RotateCw, Anchor, CalendarClock,
  Check, RefreshCw, AlertTriangle, Bot,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { useOnline } from "../lib/offline";
import { fetchAll, insertRow, logActivity } from "../lib/db";
import { folioOT } from "../lib/ot";
import { generarOTsPreventivas } from "../lib/autoOT";
import { C, tint, canOperate } from "../theme";
import { Card, PageHead, InlineSpinner, Empty } from "../ui";

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

// Caja del diagrama. dim → atenuada (Fase 2, aún no implementada).
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

// ── Badge de prioridad / semáforo en la paleta de la app ──
function SemBadge({ tone }) {
  const map = {
    red:    [C.red, "Vencido"],
    yellow: [C.yellow, "Próximo"],
  };
  const [col, label] = map[tone] || [C.slate, "—"];
  return (
    <span style={{ fontSize: 10.5, fontWeight: 700, color: col, background: tint(col, 14), border: `1px solid ${tint(col, 35)}`, borderRadius: 20, padding: "1px 9px", whiteSpace: "nowrap" }}>
      {label}
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

  const [data, setData] = useState({ planes: [], equipos: [], ots: [] });
  const [cargando, setCargando] = useState(true);
  const [ts, setTs] = useState(null);
  const [incluirProximos, setIncluirProximos] = useState(false);
  const [confirmando, setConfirmando] = useState(null); // huella en curso | "all"
  const [error, setError] = useState("");
  const [creadas, setCreadas] = useState(0);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [planes, equipos, ots] = await Promise.all([
        fetchAll("planes_pm"),
        fetchAll("equipos"),
        fetchAll("ordenes_trabajo"),
      ]);
      setData({ planes: planes || [], equipos: equipos || [], ots: ots || [] });
      setTs(new Date());
    } catch { /* conserva datos previos */ }
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const motor = useMemo(
    () => generarOTsPreventivas(data, { incluirProximos }),
    [data, incluirProximos]
  );

  const planesHoras = useMemo(
    () => data.planes.filter((p) => p.activo !== false && p.tipo_disparador !== "calendario").length,
    [data.planes]
  );

  function mensajeError(e) {
    const msg = e?.message || String(e);
    if (/origen|huella|column/i.test(msg)) {
      return "Faltan las columnas origen/huella en ordenes_trabajo. Aplica la migración 20260614_0001_ot_autogeneracion.sql en Supabase y reintenta.";
    }
    return "No se pudo generar la OT: " + msg;
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
      prioridad: sug.prioridad,
      fecha: new Date().toISOString().slice(0, 10),
      estado: "planificada",
      origen: "auto",
      huella: sug.huella,
      created_by: profile.id,
    });
  }

  async function confirmarUna(sug) {
    setConfirmando(sug.huella); setError("");
    try {
      const actuales = await fetchAll("ordenes_trabajo");
      if (sug.huella && actuales.some((o) => o.huella === sug.huella)) {
        setData((d) => ({ ...d, ots: actuales }));          // otra sesión ya la creó
        return;
      }
      const ot = await crearOT(sug, actuales);
      setData((d) => ({ ...d, ots: [ot, ...actuales] }));
      logActivity(profile, "OT auto-generada", `${ot.folio} · ${sug.sistema} · ${sug.motivo}`);
    } catch (e) { setError(mensajeError(e)); }
    finally { setConfirmando(null); }
  }

  async function confirmarTodas() {
    if (!motor.sugerencias.length) return;
    setConfirmando("all"); setError(""); setCreadas(0);
    try {
      let actuales = await fetchAll("ordenes_trabajo");
      const huellasYa = new Set(actuales.map((o) => o.huella).filter(Boolean));
      let n = 0;
      for (const sug of motor.sugerencias) {
        if (sug.huella && huellasYa.has(sug.huella)) continue;
        const ot = await crearOT(sug, actuales);
        actuales = [ot, ...actuales];
        huellasYa.add(sug.huella);
        n++;
      }
      setData((d) => ({ ...d, ots: actuales }));
      setCreadas(n);
      if (n > 0) logActivity(profile, "Generación automática de OTs", `${n} OT(s) preventivas auto-generadas desde planes vencidos`);
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
        sub="El sistema detecta planes preventivos vencidos y propone la orden de trabajo. Tú confirmas; la huella de idempotencia evita que se regenere. Lazo de generación → agendamiento → zarpe."
      />

      {/* ───────────── Blueprint del lazo de control ───────────── */}
      <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: D.bg, color: D.text, padding: 24, borderRadius: 12, marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, paddingBottom: 12, borderBottom: `1px solid ${D.bdr}`, gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <Workflow size={18} color="#93c5fd" />
            <span style={{ fontSize: 16, fontWeight: 800, color: D.ink, letterSpacing: -0.3 }}>Lazo de control · Generación automática de OTs</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: "#86efac", background: "rgba(34,197,94,.12)", border: "1px solid rgba(34,197,94,.35)", borderRadius: 20, padding: "2px 10px" }}>Fase 1 · activa</span>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: D.muted, background: "rgba(100,116,139,.12)", border: "1px solid rgba(100,116,139,.3)", borderRadius: 20, padding: "2px 10px" }}>Fase 2 · diseño</span>
          </div>
        </div>

        <DiagLabel>1 · Disparadores — eventos que pueden originar trabajo</DiagLabel>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          <Step icon={Timer}        title="Horas (horómetro)" sub="PM vencido por horas de operación" tone="green" />
          <Step icon={CalendarRange} title="Calendario"        sub="PM vencido por período" tone="green" />
          <Step icon={Sigma}        title="Predictivo (RUL)"  sub="Weibull proyecta falla · Fase 2" tone="purple" dim />
          <Step icon={Activity}     title="Condición (PdM)"   sub="medición cruza umbral · Fase 2" tone="cyan" dim />
          <Step icon={Wrench}       title="Derivado"          sub="stock, inspección, varada · Fase 2" tone="amber" dim />
        </div>

        <Flow>↓ &nbsp;evaluarPlanes() · vencido = elapsed ≥ intervalo</Flow>

        <DiagLabel>2 · Motor de reglas — autoOT.js</DiagLabel>
        <Step icon={Cpu} title="generarOTsPreventivas()" sub="Evalúa cada plan activo y selecciona los vencidos. Lógica pura, determinística, sin estadística." tone="blue" wide />

        <Flow>↓ &nbsp;huella  pm:{"{plan}"}:{"{hito}"}</Flow>

        <DiagLabel>3 · Idempotencia — el mecanismo anti-spam</DiagLabel>
        <Step icon={Fingerprint} title="Huella de ciclo" sub="¿Ya existe una OT con esta huella? Duplicada → se descarta. Nueva → continúa. La huella es estable mientras el PM siga pendiente." tone="amber" wide />

        <Flow>↓</Flow>

        <DiagLabel>4 · Sugerencia explicable</DiagLabel>
        <Step icon={Lightbulb} title="OT propuesta + motivo" sub="Carga los números que la dispararon (horas actuales vs intervalo). Sin explicación el operador no confía." tone="cyan" wide />

        <Flow>↓ &nbsp;compuerta de confianza</Flow>

        <DiagLabel>5 · Compuerta humana</DiagLabel>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          <Step icon={UserCheck} title="Confirmación humana" sub="Fase 1: el planificador revisa y confirma cada OT" tone="green" />
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
            <strong style={{ color: "#86efac" }}>El lazo se cierra:</strong> al ejecutar el PM, el horómetro o la fecha del último mantenimiento avanza → la huella cambia → queda habilitada la OT del próximo ciclo. El sistema vuelve a vigilar sin intervención.
          </div>
        </div>
      </div>

      {/* ───────────── Panel vivo ───────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: C.abyss }}>Motor en vivo</span>
          {cargando && <span style={{ fontSize: 11.5, color: C.slate }}>· evaluando…</span>}
          {tsStr && !cargando && <span style={{ fontSize: 11.5, color: C.slate }}>· evaluado {tsStr}</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: C.slate, cursor: "pointer" }}>
            <input type="checkbox" checked={incluirProximos} onChange={(e) => setIncluirProximos(e.target.checked)} style={{ width: 15, height: 15, accentColor: C.steel }} />
            Incluir próximos (≥90%)
          </label>
          <button onClick={cargar} disabled={cargando} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: C.steel, background: tint(C.steel, 10), border: `1px solid ${tint(C.steel, 30)}`, borderRadius: 8, padding: "6px 12px", cursor: cargando ? "default" : "pointer", opacity: cargando ? 0.5 : 1 }}>
            <RefreshCw size={13} /> Reevaluar
          </button>
        </div>
      </div>

      {/* Estadísticas */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <StatCard label="Planes por horas activos" valor={cargando ? "—" : planesHoras} color={C.steel} />
        <StatCard label="Vencidos detectados" valor={cargando ? "—" : motor.total + motor.yaCubiertas.length} color={C.slate} />
        <StatCard label="Ya con OT (no se duplican)" valor={cargando ? "—" : motor.yaCubiertas.length} color={C.green} sub="huella ya existente" />
        <StatCard label="Nuevas sugerencias" valor={cargando ? "—" : motor.total} color={motor.total > 0 ? C.gold : C.green} />
      </div>

      {error && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 9, background: tint(C.red, 8), border: `1px solid ${tint(C.red, 35)}`, borderRadius: 10, padding: "11px 14px", marginBottom: 14 }}>
          <AlertTriangle size={16} color={C.red} style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 12.5, color: C.ink, lineHeight: 1.5 }}>{error}</span>
        </div>
      )}

      {creadas > 0 && !error && (
        <div style={{ display: "flex", alignItems: "center", gap: 9, background: tint(C.green, 10), border: `1px solid ${tint(C.green, 35)}`, borderRadius: 10, padding: "11px 14px", marginBottom: 14 }}>
          <Check size={16} color={C.green} style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 12.5, color: C.ink }}>
            {creadas} OT{creadas !== 1 ? "s" : ""} generada{creadas !== 1 ? "s" : ""} y planificada{creadas !== 1 ? "s" : ""}.
            <button onClick={() => onNavigate?.("ots")} style={{ marginLeft: 8, fontSize: 12.5, fontWeight: 700, color: C.steel, background: "none", border: "none", cursor: "pointer", textDecoration: "underline", padding: 0 }}>
              Ver en Órdenes de Trabajo
            </button>
          </span>
        </div>
      )}

      {/* Lista de sugerencias */}
      <Card>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: motor.sugerencias.length ? 12 : 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: C.abyss }}>
            Sugerencias del motor{motor.total > 0 ? ` · ${motor.total}` : ""}
          </div>
          {motor.sugerencias.length > 0 && (
            <button onClick={confirmarTodas} disabled={sinAccion || confirmando === "all"}
              title={!puedeOperar ? "Tu rol no permite generar OTs" : !online ? "Sin conexión" : ""}
              style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 700, color: "#fff", background: sinAccion ? C.slate : C.green, border: "none", borderRadius: 9, padding: "8px 16px", cursor: sinAccion || confirmando === "all" ? "default" : "pointer", opacity: confirmando === "all" ? 0.7 : 1 }}>
              <Check size={15} /> {confirmando === "all" ? "Generando…" : `Confirmar todas (${motor.total})`}
            </button>
          )}
        </div>

        {cargando ? (
          <InlineSpinner label="Evaluando planes…" />
        ) : motor.sugerencias.length === 0 ? (
          <Empty>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <Check size={26} color={C.green} />
              <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink }}>Sin OTs pendientes de generar</div>
              <div style={{ fontSize: 12.5, color: C.slate, maxWidth: 440, lineHeight: 1.5 }}>
                {motor.yaCubiertas.length > 0
                  ? `Los ${motor.yaCubiertas.length} planes vencidos ya tienen su OT. El motor no duplica trabajo.`
                  : "Ningún plan preventivo está vencido en este momento."}
              </div>
            </div>
          </Empty>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {motor.sugerencias.map((s) => {
              const enCurso = confirmando === s.huella;
              return (
                <div key={s.huella} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 13px", borderRadius: 10, border: `1px solid ${C.line}`, background: C.surface2 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 9, background: tint(s.tone === "red" ? C.red : C.yellow, 12), display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Wrench size={16} color={s.tone === "red" ? C.red : C.yellow} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13.5, fontWeight: 700, color: C.abyss }}>{s.sistema || "Equipo"}</span>
                      <SemBadge tone={s.tone} />
                    </div>
                    <div style={{ fontSize: 12.5, color: C.ink, marginTop: 2 }}>{s.descripcion}</div>
                    <div style={{ fontSize: 11.5, color: C.slate, marginTop: 3, lineHeight: 1.45 }}>{s.motivo}</div>
                  </div>
                  <button onClick={() => confirmarUna(s)} disabled={sinAccion || enCurso}
                    title={!puedeOperar ? "Tu rol no permite generar OTs" : !online ? "Sin conexión" : ""}
                    style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, color: sinAccion ? C.slate : C.steel, background: sinAccion ? tint(C.slate, 10) : tint(C.steel, 10), border: `1px solid ${sinAccion ? C.line : tint(C.steel, 35)}`, borderRadius: 8, padding: "7px 13px", cursor: sinAccion || enCurso ? "default" : "pointer", flexShrink: 0, opacity: enCurso ? 0.7 : 1 }}>
                    <ClipboardList size={13} /> {enCurso ? "Creando…" : "Confirmar → OT"}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {!puedeOperar && motor.sugerencias.length > 0 && (
          <div style={{ fontSize: 11.5, color: C.slate, marginTop: 10, fontStyle: "italic" }}>
            Tu rol permite ver las sugerencias pero no generarlas. Un planificador o administrador debe confirmarlas.
          </div>
        )}
      </Card>
    </div>
  );
}
