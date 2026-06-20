import React, { useEffect, useState, useCallback, useMemo } from "react";
import { ListTodo, CalendarPlus, ChevronRight } from "lucide-react";
import { fetchAll } from "../lib/db";
import { scoreBacklog, nivelScore, diasAbierta, semanasCuadrilla } from "../lib/operacional";
import { C, archivo, num, TIPOS_OT, PRIORIDADES, ESTADOS_OT, lk } from "../theme";
import { CRITICIDAD_TONE } from "../lib/plantillaPesquera";
import { Card, PageHead, Pill, FilterBtn, Empty, ErrorBanner, InlineSpinner, bluInput } from "../ui";
import { hoyLocal } from "../lib/fechas";

const HOY = () => hoyLocal();

// Capacidad semanal de la cuadrilla (HH) — preferencia local del planificador
function leerCapacidad() {
  try { return Math.max(1, parseInt(localStorage.getItem("cmms-hh-semana") || "40", 10) || 40); }
  catch { return 40; }
}

export default function Backlog({ onNavigate }) {
  const [embarcaciones, setEmbarcaciones] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [ots, setOts] = useState([]);
  const [varadas, setVaradas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filtro, setFiltro] = useState("all");
  const [hhSemana, setHhSemana] = useState(leerCapacidad);

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [embs, eqs, otsAll, vars] = await Promise.all([
        fetchAll("embarcaciones", { order: { col: "codigo", asc: true } }),
        fetchAll("equipos"),
        fetchAll("ordenes_trabajo", { order: { col: "fecha", asc: true } }),
        fetchAll("varadas"),
      ]);
      setEmbarcaciones(embs); setEquipos(eqs); setOts(otsAll); setVaradas(vars);
    } catch (e) { setError("No se pudo cargar el backlog. " + e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  function cambiarCapacidad(v) {
    const cap = Math.max(1, +v || 1);
    setHhSemana(cap);
    try { localStorage.setItem("cmms-hh-semana", String(cap)); } catch { /* sin storage */ }
  }

  const embName = (id) => embarcaciones.find((e) => e.id === id)?.nombre || "—";
  const varadaName = (id) => varadas.find((v) => v.id === id)?.nombre || null;

  // Backlog = OTs no cerradas, con score de riesgo, ordenadas de mayor a menor
  const backlog = useMemo(() => {
    const hoy = HOY();
    const eqById = new Map(equipos.map((e) => [e.id, e]));
    return ots
      .filter((o) => o.estado !== "cerrada")
      .map((o) => {
        const eq = o.equipo_id ? eqById.get(o.equipo_id) : null;
        return { ot: o, eq, score: scoreBacklog(o, eq, hoy), dias: diasAbierta(o, hoy) };
      })
      .sort((a, b) => b.score - a.score || b.dias - a.dias);
  }, [ots, equipos]);

  const lista = filtro === "all" ? backlog : backlog.filter((b) => b.ot.embarcacion_id === filtro);

  // KPIs del backlog visible
  const hhTotal = lista.reduce((s, b) => s + (Number(b.ot.mttr_horas) || 0), 0);
  const semanas = semanasCuadrilla(hhTotal, hhSemana);
  const envejecidas = lista.filter((b) => b.dias > 30).length;
  const sinHH = lista.filter((b) => !(Number(b.ot.mttr_horas) > 0)).length;
  const toneSemanas = semanas == null ? C.steel : semanas <= 4 ? C.green : semanas <= 6 ? C.amber : C.red;

  if (loading) return <div><PageHead kicker="Planificación" title="Backlog Priorizado" /><Card><InlineSpinner label="Priorizando trabajos…" /></Card></div>;

  return (
    <div>
      <PageHead kicker="Planificación · Cola de Trabajo" title="Backlog Priorizado"
        sub="Todas las OTs abiertas ordenadas por riesgo: prioridad de la orden × criticidad del equipo × antigüedad × tipo de trabajo. De aquí sale lo que entra a la Programación Semanal." />

      <ErrorBanner onRetry={cargar}>{error}</ErrorBanner>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 16 }}>
        <KPI label="OTs en backlog" value={lista.length} sub={`${envejecidas} con más de 30 días`} tone={envejecidas ? C.amber : C.steel} />
        <KPI label="HH pendientes" value={`${num(hhTotal, 1)}h`} tone={C.steel}
          sub={sinHH ? `${sinHH} OT${sinHH !== 1 ? "s" : ""} sin HH estimadas` : "todas con HH estimadas"} />
        <Card style={{ padding: 16 }}>
          <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: C.slate, fontWeight: 600 }}>Capacidad cuadrilla</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 6 }}>
            <input type="number" min={1} value={hhSemana} onFocus={(e) => e.target.select()}
              onChange={(e) => cambiarCapacidad(e.target.value)}
              style={{ ...bluInput, width: 70, fontSize: 18, fontWeight: 800 }} />
            <span style={{ fontSize: 12, color: C.slate }}>HH / semana</span>
          </div>
        </Card>
        <KPI label="Backlog en semanas" value={semanas == null ? "—" : num(semanas, 1)} tone={toneSemanas}
          sub="sano: 2–4 semanas-cuadrilla" />
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <FilterBtn active={filtro === "all"} onClick={() => setFiltro("all")}>Todas ({backlog.length})</FilterBtn>
        {embarcaciones.map((v) => (
          <FilterBtn key={v.id} active={filtro === v.id} onClick={() => setFiltro(v.id)} color={v.color}>
            {v.nombre} ({backlog.filter((b) => b.ot.embarcacion_id === v.id).length})
          </FilterBtn>
        ))}
      </div>

      {lista.length === 0 ? (
        <Card><Empty><ListTodo size={30} color={C.green} style={{ marginBottom: 8 }} /><br />
          Backlog limpio: no hay OTs abiertas{filtro !== "all" ? " para esta nave" : ""}. Buen trabajo.
        </Empty></Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {lista.map(({ ot, eq, score, dias }) => {
            const [tone, label] = nivelScore(score);
            return (
              <Card key={ot.id} style={{ padding: "12px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                  {/* Score */}
                  <div style={{ textAlign: "center", flexShrink: 0, minWidth: 64 }}>
                    <div style={{ ...archivo, fontSize: 22, fontWeight: 800, color: tone === "red" ? C.red : tone === "yellow" ? C.amber : tone === "steel" ? C.steel : C.green, lineHeight: 1 }}>{score}</div>
                    <div style={{ marginTop: 3 }}><Pill tone={tone}>{label}</Pill></div>
                  </div>
                  {/* Detalle */}
                  <div style={{ flex: "1 1 260px", minWidth: 220 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 12.5, color: C.steel }}>{ot.folio}</span>
                      <span style={{ fontWeight: 700, fontSize: 13.5, color: C.ink }}>{ot.sistema || "—"}</span>
                      {eq?.criticidad && <Pill tone={CRITICIDAD_TONE[eq.criticidad] || "slate"}>Crit. {eq.criticidad}</Pill>}
                    </div>
                    <div style={{ fontSize: 12, color: C.slate, marginTop: 3 }}>
                      {embName(ot.embarcacion_id)} · {ot.descripcion?.slice(0, 90) || "sin descripción"}{(ot.descripcion?.length || 0) > 90 ? "…" : ""}
                    </div>
                  </div>
                  {/* Atributos */}
                  <Pill tone={lk(TIPOS_OT, ot.tipo) ? (TIPOS_OT.find((t) => t.value === ot.tipo)?.tone || "slate") : "slate"}>{lk(TIPOS_OT, ot.tipo)}</Pill>
                  <Pill tone={PRIORIDADES.find((p) => p.value === ot.prioridad)?.tone || "slate"}>{lk(PRIORIDADES, ot.prioridad)}</Pill>
                  {ot.varada_id && varadaName(ot.varada_id) && <Pill tone="indigo">⚓ {varadaName(ot.varada_id)}</Pill>}
                  <Stat label="Estado" value={lk(ESTADOS_OT, ot.estado)} />
                  <Stat label="Días abierta" value={dias} color={dias > 30 ? C.red : dias > 14 ? C.amber : C.steel} />
                  <Stat label="HH est." value={Number(ot.mttr_horas) > 0 ? `${num(ot.mttr_horas, 1)}h` : "—"} />
                  {/* Acción */}
                  {onNavigate && (
                    <button onClick={() => onNavigate("programa")}
                      title="Llevar a la Programación Semanal"
                      style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 7, border: `1px solid ${C.cyan}`, background: "transparent", color: C.cyan, fontSize: 12, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>
                      <CalendarPlus size={13} /> Programar <ChevronRight size={12} />
                    </button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Card style={{ marginTop: 16, background: C.mist }}>
        <div style={{ fontSize: 12.5, color: C.slate, lineHeight: 1.7 }}>
          <strong style={{ color: C.ink }}>Cómo leerlo:</strong> el score combina la prioridad de la OT, la criticidad del equipo (A/B/C),
          los días que lleva abierta (+0.5/día) y el tipo de trabajo. Trabaja el backlog de arriba hacia abajo: lo de score alto entra
          primero a la <strong>Programación Semanal</strong>. El indicador <strong>semanas-cuadrilla</strong> (HH pendientes ÷ capacidad)
          es el pulso del taller: 2–4 semanas es sano; sobre 6, o falta dotación o sobran compromisos — decisión del Jefe de Mantención.
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{ textAlign: "center", minWidth: 70 }}>
      <div style={{ fontSize: 9.5, letterSpacing: 0.5, color: C.slate, fontWeight: 600, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: color || C.ink, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function KPI({ label, value, tone, sub }) {
  return (
    <Card style={{ padding: 16 }}>
      <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: C.slate, fontWeight: 600 }}>{label}</div>
      <div style={{ ...archivo, fontSize: 26, fontWeight: 800, color: tone || C.steel, lineHeight: 1, marginTop: 6 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: C.slate, marginTop: 6 }}>{sub}</div>}
    </Card>
  );
}
