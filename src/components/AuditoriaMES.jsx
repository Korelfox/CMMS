import React, { useEffect, useState, useCallback } from "react";
import { ClipboardCheck, Award } from "lucide-react";
import { useAuth } from "../lib/auth";
import { fetchAll, upsertRow, logActivity } from "../lib/db";
import { C, archivo, canOperate } from "../theme";
import { Card, PageHead, Pill, Empty, ErrorBanner, InlineSpinner } from "../ui";

// 25 preguntas en 5 pilares (metodología Mora Gutiérrez · Auditoría MES)
const PILARES = [
  { id: 1, nombre: "Política y Estrategia de Mantenimiento", color: "#1C5C9B", preguntas: [
    "Existe una política de mantenimiento formal, alineada a los objetivos de la flota.",
    "Los objetivos de disponibilidad y confiabilidad están definidos y medidos.",
    "El presupuesto anual de mantenimiento está documentado y se controla.",
    "Existe un plan estratégico de mantenimiento a 3–5 años.",
    "La dirección revisa periódicamente los indicadores y toma decisiones con ellos.",
  ]},
  { id: 2, nombre: "Planificación y Programación", color: "#127C8A", preguntas: [
    "Cada equipo tiene plan preventivo con intervalos definidos (horas, calendario).",
    "Las OTs se planifican con anticipación, no se trabaja siempre reactivamente.",
    "Existe un cronograma semanal/mensual de tareas balanceado por disponibilidad.",
    "El backlog de trabajos pendientes está controlado bajo 4 semanas.",
    "La carga de trabajo del personal se mide y nivela.",
  ]},
  { id: 3, nombre: "Ejecución y Recursos Humanos", color: "#1E9E6A", preguntas: [
    "El personal de mantenimiento está calificado y certificado para su rol.",
    "Existe un plan anual de capacitación con horas asignadas por persona.",
    "Las OTs cerradas registran tiempo real, materiales y feedback técnico.",
    "Se dispone de herramientas y EPP adecuados para todas las tareas.",
    "El cumplimiento de las OTs programadas supera el 85%.",
  ]},
  { id: 4, nombre: "Información y Tecnología (CMMS)", color: "#6C4FA3", preguntas: [
    "Existe un CMMS en uso y toda la flota está cargada en él.",
    "Los repuestos críticos están identificados y con stock mínimo definido.",
    "El historial de fallas se registra y se puede consultar por equipo.",
    "Los movimientos de inventario y compras quedan trazados.",
    "Los KPIs (MTBF, MTTR, disponibilidad) se calculan automáticamente.",
  ]},
  { id: 5, nombre: "Mejora Continua y Evaluación", color: "#E0A526", preguntas: [
    "Se realizan análisis de causa raíz (RCA) en fallas mayores.",
    "Existe un análisis FMECA o de criticidad documentado para los equipos clave.",
    "Se identifican y eliminan progresivamente las fallas crónicas.",
    "Existen auditorías internas o externas periódicas del mantenimiento.",
    "Se establecen metas anuales de mejora con seguimiento mensual.",
  ]},
];

// Genera el listado plano (1..25) con su pilar
const PREGUNTAS = PILARES.flatMap((p, idxP) =>
  p.preguntas.map((texto, idxQ) => ({ num: idxP * 5 + idxQ + 1, pilar: p.id, texto }))
);

const MADUREZ = (avg) =>
  avg >= 4.0 ? ["green", "Clase Mundial"] :
  avg >= 3.5 ? ["green", "Optimizado"] :
  avg >= 3.0 ? ["yellow", "Gestionado"] :
  avg >= 2.0 ? ["yellow", "Planificado"] :
               ["red", "Reactivo"];

export default function AuditoriaMES() {
  const { profile } = useAuth();
  const [respuestas, setRespuestas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const puedeOperar = canOperate(profile?.rol);

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      setRespuestas(await fetchAll("auditoria_mes"));
    } catch (e) { setError("No se pudo cargar la auditoría. " + e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  function getScore(num) { return respuestas.find((r) => r.pregunta === num)?.puntaje || 3; }

  async function setScore(num, v) {
    const previo = respuestas.find((r) => r.pregunta === num)?.puntaje || 3;
    if (previo === v) return;
    // Optimista
    setRespuestas((p) => {
      const i = p.findIndex((r) => r.pregunta === num);
      if (i >= 0) { const copy = [...p]; copy[i] = { ...copy[i], puntaje: v }; return copy; }
      return [...p, { pregunta: num, puntaje: v, empresa_id: profile.empresa_id }];
    });
    try {
      await upsertRow("auditoria_mes", profile.empresa_id, { pregunta: num, puntaje: v }, "empresa_id,pregunta");
      logActivity(profile, "Auditoría MES", `P${num} = ${v}`);
    } catch (e) {
      setError("No se pudo guardar: " + e.message);
      cargar();
    }
  }

  // Promedios
  const promPilar = (pilarId) => {
    const qs = PREGUNTAS.filter((q) => q.pilar === pilarId);
    return qs.reduce((s, q) => s + getScore(q.num), 0) / qs.length;
  };
  const promGlobal = PREGUNTAS.reduce((s, q) => s + getScore(q.num), 0) / PREGUNTAS.length;
  const [madTone, madLabel] = MADUREZ(promGlobal);
  const pctGlobal = Math.round((promGlobal / 5) * 100);

  if (loading) return <div><PageHead kicker="Auditoría · MES" title="Auditoría de Madurez" /><Card><InlineSpinner label="Cargando auditoría…" /></Card></div>;

  return (
    <div>
      <PageHead kicker="Maintenance Excellence Survey · Mora Gutiérrez" title="Auditoría de Madurez"
        sub="25 preguntas en 5 pilares. Califica de 1 (no se cumple) a 5 (excelente). El sistema calcula tu nivel de madurez en mantenimiento." />

      <ErrorBanner onRetry={cargar}>{error}</ErrorBanner>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr", gap: 14, marginBottom: 20 }}>
        <Card style={{ padding: 18, background: `linear-gradient(135deg, ${C.abyss}, ${C.steel})`, color: "#fff" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <Award size={22} color={C.gold} />
            <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: "rgba(255,255,255,.7)", fontWeight: 700 }}>Nivel de Madurez</div>
          </div>
          <div style={{ ...archivo, fontSize: 32, fontWeight: 800, color: C.gold, lineHeight: 1 }}>{madLabel}</div>
          <div style={{ fontSize: 13, marginTop: 8, color: "rgba(255,255,255,.85)" }}>{promGlobal.toFixed(2)} / 5.00 &nbsp;·&nbsp; {pctGlobal}%</div>
        </Card>
        {PILARES.slice(0, 3).map((p) => {
          const avg = promPilar(p.id);
          const [tone] = MADUREZ(avg);
          return (
            <Card key={p.id} style={{ padding: 14, borderTop: `3px solid ${p.color}` }}>
              <div style={{ fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase", color: C.slate, fontWeight: 600, marginBottom: 4 }}>Pilar {p.id}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.abyss, marginBottom: 8, minHeight: 32, lineHeight: 1.3 }}>{p.nombre}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ ...archivo, fontSize: 22, fontWeight: 800, color: tone === "green" ? C.green : tone === "yellow" ? C.amber : C.red }}>{avg.toFixed(2)}</span>
                <span style={{ fontSize: 11, color: C.slate }}>/ 5.00</span>
              </div>
            </Card>);
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 14, marginBottom: 16 }}>
        {PILARES.slice(3).map((p) => {
          const avg = promPilar(p.id);
          const [tone] = MADUREZ(avg);
          return (
            <Card key={p.id} style={{ padding: 14, borderTop: `3px solid ${p.color}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase", color: C.slate, fontWeight: 600 }}>Pilar {p.id}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.abyss }}>{p.nombre}</div>
                </div>
                <span style={{ ...archivo, fontSize: 22, fontWeight: 800, color: tone === "green" ? C.green : tone === "yellow" ? C.amber : C.red }}>{avg.toFixed(2)}</span>
              </div>
            </Card>);
        })}
      </div>

      {/* Cuestionario completo por pilar */}
      {PILARES.map((p) => {
        const avg = promPilar(p.id);
        const [tone, label] = MADUREZ(avg);
        return (
          <Card key={p.id} style={{ marginBottom: 14, padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", background: C.mist, borderBottom: `1px solid ${C.line}`, borderLeft: `5px solid ${p.color}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase", color: C.slate, fontWeight: 700 }}>Pilar {p.id}</div>
                <div style={{ ...archivo, fontSize: 15, fontWeight: 700, color: C.abyss }}>{p.nombre}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ ...archivo, fontSize: 20, fontWeight: 800, color: C.steel }}>{avg.toFixed(2)} / 5</div>
                <Pill tone={tone}>{label}</Pill>
              </div>
            </div>
            <div>
              {PREGUNTAS.filter((q) => q.pilar === p.id).map((q) => {
                const v = getScore(q.num);
                return (
                  <div key={q.num} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 18px", borderBottom: `1px solid ${C.foam}`, gap: 16 }}>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", color: C.slate, fontWeight: 600, marginRight: 8 }}>P{String(q.num).padStart(2, "0")}</span>
                      <span style={{ fontSize: 13, color: C.ink }}>{q.texto}</span>
                    </div>
                    <ScoreSelector value={v} onChange={(nv) => setScore(q.num, nv)} disabled={!puedeOperar} />
                  </div>);
              })}
            </div>
          </Card>);
      })}

      <Card style={{ background: C.mist }}>
        <div style={{ fontSize: 12.5, color: C.slate, lineHeight: 1.7 }}>
          <strong style={{ color: C.ink }}>Escala:</strong>{" "}
          <strong>1</strong> = no se cumple ·{" "}
          <strong>2</strong> = se cumple parcialmente ·{" "}
          <strong>3</strong> = se cumple razonablemente ·{" "}
          <strong>4</strong> = se cumple bien ·{" "}
          <strong>5</strong> = se cumple a nivel de excelencia.
          <br /><strong style={{ color: C.ink }}>Niveles de madurez:</strong>{" "}
          <Pill tone="red">Reactivo</Pill> &lt; 2.0 ·{" "}
          <Pill tone="yellow">Planificado</Pill> 2.0–2.9 ·{" "}
          <Pill tone="yellow">Gestionado</Pill> 3.0–3.4 ·{" "}
          <Pill tone="green">Optimizado</Pill> 3.5–3.9 ·{" "}
          <Pill tone="green">Clase Mundial</Pill> ≥ 4.0
        </div>
      </Card>
    </div>
  );
}

function ScoreSelector({ value, onChange, disabled }) {
  return (
    <div style={{ display: "inline-flex", gap: 3 }}>
      {[1, 2, 3, 4, 5].map((n) => {
        const sel = value === n;
        return (
          <button key={n} disabled={disabled} onClick={() => onChange(n)}
            style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${sel ? C.steel : C.line}`, background: sel ? C.steel : "#fff", color: sel ? "#fff" : C.slate, fontSize: 12.5, fontWeight: 700, cursor: disabled ? "default" : "pointer", padding: 0 }}>
            {n}
          </button>);
      })}
    </div>
  );
}
