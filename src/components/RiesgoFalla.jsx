import React, { useState, useMemo } from "react";
import {
  ChevronDown, ChevronRight, AlertTriangle, CheckCircle2, AlertCircle,
} from "lucide-react";
import { useFleetData } from "../hooks/useFleetData";
import { evaluarPlanes } from "../lib/pm";
import { riesgoFlota } from "../lib/riesgo";
import { C, archivo, num, tint } from "../theme";
import { Card, PageHead, Pill, Empty, ErrorBanner, InlineSpinner } from "../ui";

const SPEC = [
  { tabla: "embarcaciones", opts: { order: { col: "codigo", asc: true } } },
  "equipos",
  "planes_pm",
  "ordenes_trabajo",
];

const ZONA_META = {
  roja:    { tone: "red",    label: "Riesgo alto",  icon: AlertCircle },
  amarilla: { tone: "yellow", label: "Riesgo medio", icon: AlertTriangle },
  verde:   { tone: "green",  label: "Riesgo bajo",  icon: CheckCircle2 },
};

export default function RiesgoFalla({ onNavigate }) {
  const [raw, loading, error, reload] = useFleetData(SPEC);
  const [embFiltro,  setEmbFiltro]  = useState("todas");
  const [zonaFiltro, setZonaFiltro] = useState("todas");
  const [expanded,   setExpanded]   = useState(null);

  const { embarcaciones, planes, equipos, ots } = useMemo(() => ({
    embarcaciones: raw?.embarcaciones   || [],
    planes:        raw?.planes_pm       || [],
    equipos:       raw?.equipos         || [],
    ots:           raw?.ordenes_trabajo || [],
  }), [raw]);

  const hoy = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const planesEval = useMemo(() => evaluarPlanes(planes, equipos), [planes, equipos]);

  const ranking = useMemo(() => riesgoFlota({
    planesEval,
    ots,
    equipos,
    embId: embFiltro !== "todas" ? embFiltro : null,
    hoy,
  }), [planesEval, ots, equipos, embFiltro, hoy]);

  const rankingFiltrado = useMemo(() => zonaFiltro === "todas"
    ? ranking
    : ranking.filter((r) => r.zona === zonaFiltro),
  [ranking, zonaFiltro]);

  // KPIs
  const nRojos    = useMemo(() => ranking.filter((r) => r.zona === "roja").length,    [ranking]);
  const nAmarillos = useMemo(() => ranking.filter((r) => r.zona === "amarilla").length, [ranking]);
  const nPMVencidos = useMemo(() =>
    new Set(planesEval.filter((p) => p.tone === "red").map((p) => p.equipo?.id)).size,
  [planesEval]);
  const mtbfPromedio = useMemo(() => {
    const vals = ranking.map((r) => r.mtbf).filter((v) => v != null);
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
  }, [ranking]);

  if (loading) return (
    <div>
      <PageHead kicker="Análisis" title="Riesgo de Falla" />
      <Card><InlineSpinner label="Calculando índices de riesgo…" /></Card>
    </div>
  );

  return (
    <div>
      <PageHead
        kicker="Análisis · Confiabilidad"
        title="Riesgo de Falla"
        sub="Score compuesto 0-100 por equipo: estado PM (vencido/próximo), proximidad al MTBF histórico y frecuencia de fallas correctivas recientes. Criticidad A amplifica × 1.4."
      />
      <ErrorBanner onRetry={reload}>{error}</ErrorBanner>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 16 }}>
        <KCard label="Equipos zona roja"    value={nRojos}    tone={nRojos ? C.red : C.green}   sub="score ≥ 40" />
        <KCard label="Equipos zona amarilla" value={nAmarillos} tone={nAmarillos ? C.amber : C.green} sub="score 20-39" />
        <KCard label="PMs vencidos"          value={nPMVencidos} tone={nPMVencidos ? C.red : C.green} sub="equipos afectados" />
        <KCard label="MTBF promedio flota"
          value={mtbfPromedio != null ? `${num(mtbfPromedio, 0)}d` : "—"}
          tone={C.steel}
          sub="entre fallas correctivas" />
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: C.slate, alignSelf: "center" }}>Nave:</span>
          <select value={embFiltro} onChange={(e) => setEmbFiltro(e.target.value)}
            style={{ padding: "5px 10px", borderRadius: 7, border: `1px solid ${C.line}`, fontSize: 12, background: "var(--card-bg)" }}>
            <option value="todas">Toda la flota</option>
            {embarcaciones.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: C.slate, alignSelf: "center" }}>Zona:</span>
          {["todas", "roja", "amarilla", "verde"].map((z) => (
            <button key={z} onClick={() => setZonaFiltro(z)} style={{
              padding: "5px 12px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer",
              border: `1px solid ${zonaFiltro === z ? zonaColor(z) : C.line}`,
              background: zonaFiltro === z ? tint(zonaColor(z), 6) : "transparent",
              color: zonaFiltro === z ? zonaColor(z) : C.slate,
            }}>
              {z === "todas" ? "Todas" : z.charAt(0).toUpperCase() + z.slice(1)}
            </button>
          ))}
        </div>
        <span style={{ marginLeft: "auto", fontSize: 12, color: C.slate }}>
          {rankingFiltrado.length} equipo{rankingFiltrado.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Ranking */}
      {rankingFiltrado.length === 0 ? (
        <Card><Empty>No hay equipos con el filtro seleccionado.</Empty></Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rankingFiltrado.map((r, idx) => {
            const meta   = ZONA_META[r.zona];
            const ZIcon  = meta.icon;
            const isExp  = expanded === r.equipo.id;
            const emb    = embarcaciones.find((e) => e.id === r.equipo.embarcacion_id);

            return (
              <Card key={r.equipo.id} style={{
                padding: 0, overflow: "hidden",
                borderLeft: `5px solid ${zonaColor(r.zona)}`,
                opacity: r.score === 0 ? 0.75 : 1,
              }}>
                <button
                  onClick={() => setExpanded(isExp ? null : r.equipo.id)}
                  style={{
                    width: "100%", display: "grid",
                    gridTemplateColumns: "32px 2.5fr 1.2fr 1fr 1fr 1fr 28px",
                    gap: 12, alignItems: "center", padding: "12px 16px",
                    background: r.zona === "roja" ? tint(C.red, 6) : "transparent",
                    border: "none", cursor: "pointer", textAlign: "left",
                  }}
                >
                  <div style={{ ...archivo, fontWeight: 800, fontSize: 15, color: zonaColor(r.zona), textAlign: "center" }}>
                    {idx + 1}
                  </div>
                  <div>
                    <div style={{ ...archivo, fontWeight: 700, fontSize: 14, color: C.abyss }}>
                      {r.equipo.sistema || r.equipo.id_visible || r.equipo.id}
                    </div>
                    <div style={{ fontSize: 11, color: C.slate }}>{emb?.nombre || "—"}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <ZIcon size={14} color={zonaColor(r.zona)} />
                    <Pill tone={meta.tone}>{meta.label}</Pill>
                  </div>
                  <VCol label="Score" value={r.score}
                    tone={r.score >= 40 ? C.red : r.score >= 20 ? C.amber : C.slate} />
                  <VCol label="Criticidad" value={r.equipo.criticidad || "—"}
                    tone={r.equipo.criticidad === "A" ? C.red : r.equipo.criticidad === "B" ? C.amber : C.slate} />
                  <VCol label="MTBF"
                    value={r.mtbf != null ? `${num(r.mtbf, 0)}d` : "—"}
                    note={r.diasUltimaFalla != null ? `última: ${num(r.diasUltimaFalla, 0)}d atrás` : "sin historial"} />
                  <div style={{ color: C.slate, display: "flex", justifyContent: "flex-end" }}>
                    {isExp ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </div>
                </button>

                {isExp && (
                  <div style={{ borderTop: `1px solid ${C.line}`, padding: "12px 18px 14px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                    {/* Motivos */}
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: C.ink, marginBottom: 8 }}>
                        Factores de riesgo
                      </div>
                      {r.motivos.length === 0 ? (
                        <div style={{ fontSize: 13, color: C.slate }}>Sin señales de riesgo detectadas.</div>
                      ) : r.motivos.map((m, i) => (
                        <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 6, fontSize: 13 }}>
                          <AlertTriangle size={13} color={C.amber} style={{ flexShrink: 0, marginTop: 2 }} />
                          <span style={{ color: C.ink }}>{m}</span>
                        </div>
                      ))}
                    </div>

                    {/* Planes vencidos/próximos */}
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: C.ink, marginBottom: 8 }}>
                        Estado PM ({r.planes.length} plan{r.planes.length !== 1 ? "es" : ""})
                      </div>
                      {r.planes.length === 0 ? (
                        <div style={{ fontSize: 13, color: C.slate }}>Sin planes PM asignados.</div>
                      ) : r.planes.map((p) => (
                        <div key={p.plan.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: `1px solid ${C.line}`, fontSize: 12.5 }}>
                          <div style={{ width: 8, height: 8, borderRadius: "50%", background: p.tone === "red" ? C.red : p.tone === "yellow" ? C.amber : C.green, flexShrink: 0 }} />
                          <span style={{ flex: 1, color: C.ink, fontWeight: 600 }}>{p.plan.descripcion}</span>
                          <span style={{ color: C.slate }}>{p.label}</span>
                        </div>
                      ))}
                      {r.planes.length > 0 && (
                        <button
                          onClick={() => onNavigate && onNavigate("planpm")}
                          style={{ marginTop: 8, fontSize: 12, color: C.cyan, background: "none", border: "none", cursor: "pointer", padding: 0 }}
                        >
                          Ir a Plan Preventivo →
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Card style={{ marginTop: 16, background: C.mist }}>
        <div style={{ fontSize: 12.5, color: C.slate, lineHeight: 1.7 }}>
          <strong style={{ color: C.ink }}>Metodología:</strong>{" "}
          PM vencido +40 pts · PM próximo +20 pts · MTBF superado +30 pts · MTBF ≥ 75% +20 pts ·
          ≥5 fallas/12m +15 pts. Factor criticidad: A×1.4 · B×1.1 · C×0.85.
          Zonas: Roja ≥ 40 · Amarilla ≥ 20 · Verde {"< 20"}.
        </div>
      </Card>
    </div>
  );
}

function zonaColor(z) {
  return z === "roja" ? C.red : z === "amarilla" ? C.amber : C.green;
}

function KCard({ label, value, tone, sub }) {
  return (
    <Card style={{ padding: 16 }}>
      <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: C.slate, fontWeight: 600 }}>{label}</div>
      <div style={{ ...archivo, fontSize: 26, fontWeight: 800, color: tone || C.steel, lineHeight: 1, marginTop: 6 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: C.slate, marginTop: 6 }}>{sub}</div>}
    </Card>
  );
}

function VCol({ label, value, note, tone }) {
  return (
    <div>
      <div style={{ fontSize: 10, letterSpacing: 0.5, textTransform: "uppercase", color: C.slate, fontWeight: 600 }}>{label}</div>
      <div style={{ ...archivo, fontWeight: 700, fontSize: 14, color: tone || C.ink, marginTop: 2 }}>{value}</div>
      {note && <div style={{ fontSize: 11, color: C.slate }}>{note}</div>}
    </div>
  );
}
