import React, { useEffect, useState, useCallback } from "react";
import { Layers, Check, CircleDashed } from "lucide-react";
import { useAuth } from "../lib/auth";
import { fetchAll, upsertRow, logActivity } from "../lib/db";
import { C, archivo, canOperate } from "../theme";
import { Card, PageHead, Pill, Empty, ErrorBanner, InlineSpinner } from "../ui";

// 8 fases del Modelo de GestiÃ³n de Mantenimiento (Mora GutiÃ©rrez)
const FASES = [
  { n: 1, titulo: "AnÃ¡lisis de la situaciÃ³n actual",
    desc: "DiagnÃ³stico de equipos, organizaciÃ³n, prÃ¡cticas actuales y nivel de madurez.",
    color: "#0B2A4A",
    items: ["Inventario completo de equipos por sistema (ISO 14224)", "Tipo de mantenimiento actual: correctivo/preventivo/proactivo", "Encuesta de madurez (AuditorÃ­a MES, 25 preguntas)", "IdentificaciÃ³n de brechas frente a clase mundial"] },
  { n: 2, titulo: "JerarquÃ­a y criticidad",
    desc: "ClasificaciÃ³n de equipos por su importancia estratÃ©gica.",
    color: "#1C5C9B",
    items: ["AnÃ¡lisis de criticidad CTR (INGEMAN/Parra)", "IdentificaciÃ³n de equipos clase A (alta criticidad)", "PriorizaciÃ³n del esfuerzo y recursos", "Stock crÃ­tico de repuestos definido"] },
  { n: 3, titulo: "AnÃ¡lisis de fallas (FMECA/RCM)",
    desc: "IdentificaciÃ³n de modos de falla, causas y efectos en los equipos crÃ­ticos.",
    color: "#127C8A",
    items: ["FMECA de equipos clase A y B", "RPN (Severidad Ã— Ocurrencia Ã— DetecciÃ³n)", "Plan de mitigaciÃ³n por riesgo", "AnÃ¡lisis de causa raÃ­z en fallas mayores"] },
  { n: 4, titulo: "DiseÃ±o tÃ¡ctico (Planes PM)",
    desc: "DefiniciÃ³n de planes preventivos con intervalos Ã³ptimos por equipo.",
    color: "#1E9E6A",
    items: ["Plan PM por equipo e intervalo (50/100/250/500h)", "Procedimientos documentados con checklists", "OptimizaciÃ³n Weibull del Ts*", "DecisiÃ³n Reparar / PM / Overhaul / Reemplazar"] },
  { n: 5, titulo: "DiseÃ±o operativo (ProgramaciÃ³n)",
    desc: "CalendarizaciÃ³n semanal con balanceo de cargas y backlog controlado.",
    color: "#6C4FA3",
    items: ["ProgramaciÃ³n semanal balanceada por HH", "Cumplimiento â‰¥ 85% de tareas programadas", "Backlog controlado bajo 4 semanas", "OTs con ciclo completo (solicitada â†’ cerrada)"] },
  { n: 6, titulo: "ImplementaciÃ³n del CMMS",
    desc: "Sistema computarizado operando con datos confiables y trazables.",
    color: "#E0A526",
    items: ["CMMS instalado y operativo (este sistema)", "Toda la flota cargada y actualizada", "Operadores y tÃ©cnicos con accesos por rol", "ReporterÃ­a e indicadores automÃ¡ticos"] },
  { n: 7, titulo: "Recursos humanos y capacitaciÃ³n",
    desc: "Personal calificado y certificado con desarrollo continuo.",
    color: "#D8443C",
    items: ["Plan anual de capacitaciÃ³n por persona", "Certificaciones tÃ©cnicas por rol", "Multifuncionalidad y plan de sucesiÃ³n", "EPP y herramientas completas y vigentes"] },
  { n: 8, titulo: "AuditorÃ­a y mejora continua",
    desc: "Ciclo permanente de evaluaciÃ³n, RCA y mejora de procesos.",
    color: "#8A2A26",
    items: ["AuditorÃ­a MES periÃ³dica con metas anuales", "AnÃ¡lisis de causa raÃ­z (RCA) en fallas mayores", "Indicadores con metas y seguimiento mensual", "Acciones correctivas con responsable y plazo"] },
];

export default function MGM() {
  const { profile } = useAuth();
  const [respuestas, setRespuestas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const puedeOperar = canOperate(profile?.rol);

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try { setRespuestas(await fetchAll("mgm_fases")); }
    catch (e) { setError("No se pudo cargar el MGM. " + e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  function getAvance(fase) { return respuestas.find((r) => r.fase === fase)?.avance || 0; }

  async function setAvance(fase, v) {
    const valor = Math.max(0, Math.min(1, v));
    const previo = getAvance(fase);
    if (Math.abs(valor - previo) < 0.005) return;
    // Optimista
    setRespuestas((p) => {
      const i = p.findIndex((r) => r.fase === fase);
      if (i >= 0) { const copy = [...p]; copy[i] = { ...copy[i], avance: valor }; return copy; }
      return [...p, { fase, avance: valor, empresa_id: profile.empresa_id }];
    });
    try {
      await upsertRow("mgm_fases", profile.empresa_id, { fase, avance: valor }, "empresa_id,fase");
      logActivity(profile, "MGM fase", `Fase ${fase} â†’ ${Math.round(valor * 100)}%`);
    } catch (e) { setError("No se pudo guardar: " + e.message); cargar(); }
  }

  const promGlobal = FASES.reduce((s, f) => s + getAvance(f.n), 0) / FASES.length;
  const completadas = FASES.filter((f) => getAvance(f.n) >= 0.8).length;
  const enProceso = FASES.filter((f) => { const a = getAvance(f.n); return a >= 0.2 && a < 0.8; }).length;
  const pendientes = FASES.filter((f) => getAvance(f.n) < 0.2).length;

  if (loading) return <div><PageHead kicker="Modelo de GestiÃ³n" title="MGM Â· 8 Fases" /><Card><InlineSpinner label="Cargando MGMâ€¦" /></Card></div>;

  return (
    <div>
      <PageHead kicker="Mora GutiÃ©rrez Â· 8 Fases" title="Modelo de GestiÃ³n de Mantenimiento"
        sub="El MGM define 8 pasos para construir una operaciÃ³n de mantenimiento de clase mundial. Marca el avance de cada fase para visualizar tu progreso." />

      <ErrorBanner onRetry={cargar}>{error}</ErrorBanner>

      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1fr", gap: 14, marginBottom: 20 }}>
        <Card style={{ padding: 20, background: `linear-gradient(135deg, ${C.abyss}, ${C.steel})`, color: "#fff" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <Layers size={22} color={C.gold} />
            <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: "rgba(255,255,255,.85)", fontWeight: 700 }}>Avance Global</div>
          </div>
          <div style={{ ...archivo, fontSize: 36, fontWeight: 800, color: C.gold, lineHeight: 1 }}>{Math.round(promGlobal * 100)}%</div>
          <div style={{ height: 8, background: "rgba(255,255,255,.15)", borderRadius: 4, marginTop: 12, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${promGlobal * 100}%`, background: C.gold, transition: "width 0.3s" }} />
          </div>
          <div style={{ fontSize: 12, marginTop: 8, color: "rgba(255,255,255,.85)" }}>{completadas} fases â‰¥ 80% Â· {enProceso} en proceso Â· {pendientes} por iniciar</div>
        </Card>
        <KPI label="Completadas" value={completadas} tone={C.green} sub="avance â‰¥ 80%" />
        <KPI label="En Proceso" value={enProceso} tone={C.amber} sub="20% â€“ 80%" />
        <KPI label="Por Iniciar" value={pendientes} tone={pendientes ? C.slate : C.green} sub="< 20%" />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {FASES.map((f) => {
          const av = getAvance(f.n);
          const pct = Math.round(av * 100);
          const completa = av >= 0.8;
          return (
            <Card key={f.n} style={{ padding: 0, overflow: "hidden", borderLeft: `5px solid ${f.color}` }}>
              <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 16, padding: 18, alignItems: "center" }}>
                <div style={{ width: 50, height: 50, borderRadius: 12, background: f.color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", ...archivo, fontSize: 22, fontWeight: 800 }}>
                  {completa ? <Check size={26} /> : f.n}
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                    <div style={{ ...archivo, fontSize: 16, fontWeight: 700, color: C.abyss }}>{f.titulo}</div>
                    <Pill tone={completa ? "green" : av >= 0.2 ? "yellow" : "slate"}>{completa ? "Completa" : av >= 0.2 ? "En proceso" : "Pendiente"}</Pill>
                  </div>
                  <div style={{ fontSize: 12.5, color: C.slate, marginBottom: 10 }}>{f.desc}</div>
                  <div style={{ height: 8, background: C.foam, borderRadius: 4, overflow: "hidden", marginBottom: 8 }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: f.color, transition: "width 0.3s" }} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 4 }}>
                    {f.items.map((item, idx) => (
                      <div key={idx} style={{ fontSize: 11.5, color: C.slate, display: "flex", alignItems: "center", gap: 6 }}>
                        <CircleDashed size={10} color={C.line} />{item}
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, minWidth: 130 }}>
                  <div style={{ ...archivo, fontSize: 28, fontWeight: 800, color: f.color }}>{pct}%</div>
                  <input type="range" min={0} max={100} step={5} value={pct} disabled={!puedeOperar}
                    onChange={(e) => setAvance(f.n, +e.target.value / 100)}
                    style={{ width: 120, accentColor: f.color }} />
                </div>
              </div>
            </Card>);
        })}
      </div>

      <Card style={{ marginTop: 16, background: C.mist }}>
        <div style={{ fontSize: 12.5, color: C.slate, lineHeight: 1.7 }}>
          <strong style={{ color: C.ink }}>CÃ³mo usar el MGM:</strong> el modelo es secuencial pero permite paralelismo. Lo importante es no saltar fases:
          la Fase 4 (planes PM) no rinde sin la 2 (criticidad) y la 3 (FMECA). Las fases 5 y 6 corren en paralelo cuando el CMMS ya estÃ¡ operativo.
          Una operaciÃ³n madura deberÃ­a superar 75% global. Si alguna fase queda detenida bajo 30%, conviene identificar el bloqueo antes de seguir avanzando en las demÃ¡s.
        </div>
      </Card>
    </div>
  );
}

function KPI({ label, value, tone, sub }) {
  return (
    <Card style={{ padding: 16 }}>
      <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: C.slate, fontWeight: 600 }}>{label}</div>
      <div style={{ ...archivo, fontSize: 30, fontWeight: 800, color: tone || C.steel, lineHeight: 1, marginTop: 6 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: C.slate, marginTop: 6 }}>{sub}</div>}
    </Card>
  );
}
