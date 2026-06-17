import React, { useState, useMemo } from "react";
import {
  CalendarRange, Anchor, CheckCircle2, AlertTriangle, Clock,
  Wrench, ChevronDown, ChevronRight, Waves, AlertCircle,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from "recharts";
import { useFleetData } from "../hooks/useFleetData";
import { evaluarPlanes } from "../lib/pm";
import { scoreBacklog } from "../lib/operacional";
import {
  tasaHorasDia, proyectarVencimientos, curvaCargaSemanal,
  ventanaPuerto, trabajosEnVentana, HH_DEFAULT_POR_PM,
} from "../lib/planificacion";
import { C, archivo, num, tint } from "../theme";
import { Card, PageHead, Pill, Empty, ErrorBanner, InlineSpinner } from "../ui";

const SEMANAS_OPTS = [4, 8, 12, 16];
const HH_DIA_DEFAULT = 8;

const SPEC = [
  { tabla: "embarcaciones",     opts: { order: { col: "codigo", asc: true } } },
  "mareas",
  "planes_pm",
  "equipos",
  { tabla: "lecturas_horometro", opts: { order: { col: "fecha", asc: false } } },
  "ordenes_trabajo",
];

export default function PlanificacionPuerto({ onNavigate }) {
  const [raw, loading, error, reload] = useFleetData(SPEC);
  const [tab,      setTab]      = useState("ventana");
  const [semanas,  setSemanas]  = useState(8);
  const [hhDia,    setHhDia]    = useState(HH_DIA_DEFAULT);
  const [expanded, setExpanded] = useState(null);

  const embarcaciones = raw?.embarcaciones            || [];
  const mareas        = raw?.mareas                   || [];
  const planes        = raw?.planes_pm                || [];
  const equipos       = raw?.equipos                  || [];
  const lecturas      = raw?.lecturas_horometro       || [];
  const ots           = raw?.ordenes_trabajo          || [];

  const hoy = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // Tasa h/día por equipo_id (solo equipos con ≥2 lecturas)
  const tasasPorEquipo = useMemo(() => {
    const map = new Map();
    const porEquipo = new Map();
    (lecturas || []).forEach((l) => {
      if (!porEquipo.has(l.equipo_id)) porEquipo.set(l.equipo_id, []);
      porEquipo.get(l.equipo_id).push(l);
    });
    porEquipo.forEach((lecs, eqId) => {
      const t = tasaHorasDia(lecs);
      if (t != null) map.set(eqId, t);
    });
    return map;
  }, [lecturas]);

  // Proyección de vencimientos de todos los planes activos
  const proyecciones = useMemo(() => {
    const planesEval = evaluarPlanes(planes, equipos);
    return proyectarVencimientos(planesEval, tasasPorEquipo, hoy);
  }, [planes, equipos, tasasPorEquipo, hoy]);

  // Curva de carga semanal (tab 2)
  const curva = useMemo(
    () => curvaCargaSemanal(proyecciones, hoy, semanas),
    [proyecciones, hoy, semanas]
  );

  // Datos por nave (tab 1)
  const flota = useMemo(() => embarcaciones.map((emb) => {
    const vp       = ventanaPuerto(mareas, emb.id, hoy);
    const diasDisp = vp.enPuerto
      ? Math.max(0, vp.duracionTipica - vp.diasEnPuerto)
      : vp.duracionTipica;
    const horizonte = vp.enPuerto
      ? Math.round(diasDisp) + 2   // ventana actual + 2 días margen
      : Math.round((vp.duracionTipica || 5) + 14);  // próxima ventana estimada
    const ventana   = trabajosEnVentana(
      proyecciones, ots, emb.id, horizonte, diasDisp * hhDia, hoy
    );
    const otsOrdenadas = ventana.ots
      .map((o) => ({ o, score: scoreBacklog(o, equipos.find((e) => e.id === o.equipo_id), hoy) }))
      .sort((a, b) => b.score - a.score)
      .map(({ o }) => o);
    return { emb, vp, diasDisp, ventana: { ...ventana, ots: otsOrdenadas } };
  }), [embarcaciones, mareas, proyecciones, ots, equipos, hhDia, hoy]);

  // KPIs globales
  const totalPMsProximos = useMemo(
    () => proyecciones.filter((p) => p.diasHasta <= 14).length,
    [proyecciones]
  );
  const semanasPico = useMemo(() => curva.filter((w) => w.esPico).length, [curva]);
  const navesEnPuerto = useMemo(() => flota.filter((f) => f.vp.enPuerto).length, [flota]);

  if (loading) return (
    <div>
      <PageHead kicker="Planificación" title="Ventana de Puerto" />
      <Card><InlineSpinner label="Proyectando plan de mantenimiento…" /></Card>
    </div>
  );

  return (
    <div>
      <PageHead
        kicker="Planificación · Recalada"
        title="Ventana de Puerto"
        sub="Proyecta qué PMs vencen durante la próxima estadía en puerto de cada nave y cuánto trabajo cabe en la ventana disponible. La curva de carga detecta semanas saturadas con anticipación."
      />
      <ErrorBanner onRetry={reload}>{error}</ErrorBanner>

      {/* KPIs resumen */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 16 }}>
        <KCard label="Naves en puerto" value={navesEnPuerto} tone={navesEnPuerto ? C.cyan : C.slate} sub="disponibles para mantenimiento" />
        <KCard label="PMs próximos ≤14d" value={totalPMsProximos} tone={totalPMsProximos > 5 ? C.red : totalPMsProximos > 0 ? C.amber : C.green} sub="toda la flota" />
        <KCard label="Semanas saturadas" value={semanasPico} tone={semanasPico > 0 ? C.amber : C.green} sub={`en las próximas ${semanas} semanas`} />
        <KCard label="HH disponibles/día" value={hhDia}
          sub={<input type="number" min={1} max={24} value={hhDia}
            onChange={(e) => setHhDia(Math.max(1, Number(e.target.value)))}
            style={{ width: 52, padding: "3px 6px", borderRadius: 6, border: `1px solid ${C.line}`, fontSize: 12 }} />}
        />
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {[
          { id: "ventana", label: "Por Nave · Ventana de Puerto" },
          { id: "curva",   label: "Curva de Carga PM" },
        ].map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: "8px 18px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600,
            border: `1px solid ${tab === t.id ? C.cyan : C.line}`,
            background: tab === t.id ? C.cyan : "transparent",
            color: tab === t.id ? "#fff" : C.slate,
          }}>{t.label}</button>
        ))}
        {tab === "curva" && (
          <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: C.slate, fontWeight: 600 }}>Horizonte:</span>
            {SEMANAS_OPTS.map((s) => (
              <button key={s} onClick={() => setSemanas(s)} style={{
                padding: "5px 12px", borderRadius: 7, cursor: "pointer", fontSize: 12, fontWeight: 600,
                border: `1px solid ${semanas === s ? C.steel : C.line}`,
                background: semanas === s ? C.steel : "transparent",
                color: semanas === s ? "#fff" : C.slate,
              }}>{s}s</button>
            ))}
          </div>
        )}
      </div>

      {/* ── Tab 1: Ventana de Puerto ── */}
      {tab === "ventana" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {flota.length === 0 ? (
            <Card><Empty>Sin embarcaciones registradas.</Empty></Card>
          ) : flota.map(({ emb, vp, diasDisp, ventana: v }) => {
            const isExp = expanded === emb.id;
            const enPuerto = vp.enPuerto;
            const sobreCarga = v.sobreCarga;
            const borderColor = enPuerto ? C.cyan : C.steel;

            return (
              <Card key={emb.id} style={{ padding: 0, overflow: "hidden", borderLeft: `5px solid ${borderColor}` }}>
                <button
                  onClick={() => setExpanded(isExp ? null : emb.id)}
                  style={{
                    width: "100%", display: "grid",
                    gridTemplateColumns: "2.5fr 1.5fr 1fr 1fr 1fr 28px",
                    gap: 12, alignItems: "center", padding: "13px 18px",
                    background: enPuerto ? tint(C.cyan, 4) : "transparent",
                    border: "none", cursor: "pointer", textAlign: "left",
                  }}
                >
                  <div>
                    <div style={{ ...archivo, fontWeight: 800, fontSize: 14, color: C.abyss, display: "flex", alignItems: "center", gap: 8 }}>
                      {emb.nombre}
                      <Pill tone={enPuerto ? "cyan" : "steel"}>
                        {enPuerto ? <><Anchor size={10} /> En puerto</> : <><Waves size={10} /> En mar</>}
                      </Pill>
                    </div>
                    <div style={{ fontSize: 11, color: C.slate, marginTop: 2 }}>
                      {enPuerto
                        ? `Recaló: ${vp.inicio || "—"} · ${num(vp.diasEnPuerto, 1)} días en puerto`
                        : `Próxima recalada est. ${vp.proximaRecalada || "—"}`}
                    </div>
                  </div>

                  <VCol label="Ventana disponible" value={`~${num(diasDisp, 0)} días`}
                    note={`típica: ${num(vp.duracionTipica, 0)}d`}
                    tone={diasDisp < 2 ? C.red : C.green} />
                  <VCol label="PMs en ventana" value={v.pms.length}
                    tone={v.pms.length > 0 ? C.amber : C.green} />
                  <VCol label="OTs backlog" value={v.ots.length}
                    tone={v.ots.length > 3 ? C.amber : C.slate} />
                  <VCol label="HH estimadas" value={`${num(v.hhTotal, 0)}h`}
                    tone={sobreCarga ? C.red : C.green}
                    note={sobreCarga ? "sobre capacidad" : `cap. ${num(diasDisp * hhDia, 0)}h`} />
                  <div style={{ color: C.slate, display: "flex", justifyContent: "flex-end" }}>
                    {isExp ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                  </div>
                </button>

                {isExp && (
                  <div style={{ borderTop: `1px solid ${C.line}`, padding: "12px 18px 16px" }}>
                    {sobreCarga && (
                      <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 12px", background: tint(C.red, 6), borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
                        <AlertCircle size={15} color={C.red} style={{ flexShrink: 0 }} />
                        <span>Las {num(v.hhTotal, 0)}h estimadas superan la capacidad de {num(diasDisp * hhDia, 0)}h disponibles. Redistribuye o extiende la ventana.</span>
                      </div>
                    )}

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                      {/* PMs */}
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: C.ink, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                          PMs en la ventana ({v.pms.length})
                        </div>
                        {v.pms.length === 0 ? (
                          <div style={{ fontSize: 13, color: C.slate }}>Sin PMs venciendo en esta ventana.</div>
                        ) : v.pms.map((p) => (
                          <div key={p.plan.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: `1px solid ${C.line}` }}>
                            <div style={{ width: 8, height: 8, borderRadius: "50%", background: p.tone === "red" ? C.red : p.tone === "yellow" ? C.amber : C.green, flexShrink: 0 }} />
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{p.plan.descripcion}</div>
                              <div style={{ fontSize: 11, color: C.slate }}>{p.equipo?.sistema || "—"}</div>
                            </div>
                            <div style={{ textAlign: "right", fontSize: 12, color: p.diasHasta <= 0 ? C.red : C.slate }}>
                              {p.diasHasta <= 0 ? "Vencido" : `en ${p.diasHasta}d`}
                              <div style={{ fontSize: 11 }}>{p.fechaEstimada}</div>
                            </div>
                            <Pill tone={p.tone === "red" ? "red" : p.tone === "yellow" ? "yellow" : "green"}>
                              {HH_DEFAULT_POR_PM}h
                            </Pill>
                          </div>
                        ))}
                      </div>

                      {/* OTs backlog */}
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: C.ink, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                          Backlog recomendado ({v.ots.length})
                        </div>
                        {v.ots.length === 0 ? (
                          <div style={{ fontSize: 13, color: C.slate }}>Sin OTs pendientes en el backlog.</div>
                        ) : v.ots.slice(0, 8).map((o) => (
                          <div key={o.id}
                            onClick={onNavigate ? () => onNavigate("ots", { otId: o.id }) : undefined}
                            style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: `1px solid ${C.line}`, cursor: onNavigate ? "pointer" : "default" }}>
                            <Wrench size={13} color={C.slate} style={{ flexShrink: 0 }} />
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: onNavigate ? C.cyan : C.ink }}>
                                {o.folio} · {o.sistema || "—"}
                              </div>
                              <div style={{ fontSize: 11, color: C.slate }}>
                                {(o.descripcion || "").slice(0, 55) || "Sin descripción"}
                              </div>
                            </div>
                            <div style={{ fontSize: 11, color: C.slate, textAlign: "right" }}>
                              {o.horas_estimadas ? `${o.horas_estimadas}h` : "—"}
                            </div>
                            <Pill tone={o.prioridad === "critica" ? "red" : o.prioridad === "alta" ? "yellow" : "steel"}>
                              {o.prioridad}
                            </Pill>
                          </div>
                        ))}
                        {v.ots.length > 8 && (
                          <div style={{ fontSize: 12, color: C.slate, marginTop: 6 }}>+{v.ots.length - 8} más en Backlog</div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Tab 2: Curva de Carga PM ── */}
      {tab === "curva" && (
        <div>
          {proyecciones.length === 0 ? (
            <Card><Empty>Sin planes PM proyectables. Crea planes en Plan Preventivo y registra lecturas en Horómetros para activar la proyección.</Empty></Card>
          ) : (
            <>
              <Card style={{ marginBottom: 14 }}>
                <div style={{ ...archivo, fontWeight: 800, fontSize: 15, color: C.abyss, marginBottom: 14 }}>
                  Carga de PMs por semana · próximas {semanas} semanas
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={curva} margin={{ left: 0, right: 10, top: 4, bottom: 4 }}>
                    <XAxis dataKey="inicioISO" tick={{ fontSize: 10, fill: C.slate }}
                      tickFormatter={(v) => {
                        const d = new Date(v + "T12:00:00");
                        return `${d.getDate()} ${d.toLocaleString("es-CL", { month: "short" })}`;
                      }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: C.slate }} />
                    <Tooltip
                      labelFormatter={(v) => {
                        const d = new Date(v + "T12:00:00");
                        return `Sem. ${curva.find((w) => w.inicioISO === v)?.semana ?? ""} · ${d.getDate()} ${d.toLocaleString("es-CL", { month: "short" })}`;
                      }}
                      formatter={(v) => [`${v} PMs · ~${v * HH_DEFAULT_POR_PM}h`, "Carga"]}
                      contentStyle={{ fontSize: 12, borderRadius: 7 }}
                    />
                    <ReferenceLine y={0} stroke={C.line} />
                    <Bar dataKey="count" radius={[5, 5, 0, 0]} maxBarSize={40}>
                      {curva.map((w, i) => (
                        <Cell key={i} fill={w.esPico ? C.red : w.count > 0 ? C.amber : C.green} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 12, color: C.slate }}>
                  <span><Dot c={C.red}   /> Pico de carga</span>
                  <span><Dot c={C.amber} /> Con PMs</span>
                  <span><Dot c={C.green} /> Sin PMs</span>
                </div>
              </Card>

              {/* Tabla detalle semanal */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {curva.filter((w) => w.count > 0).map((w) => (
                  <Card key={w.semana} style={{ padding: "12px 18px", borderLeft: `4px solid ${w.esPico ? C.red : C.amber}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: w.pms.length > 0 ? 10 : 0 }}>
                      <div style={{ ...archivo, fontWeight: 800, fontSize: 14, color: C.abyss }}>
                        Semana {w.semana}
                      </div>
                      <div style={{ fontSize: 12, color: C.slate }}>{w.inicioISO} → {w.finISO}</div>
                      <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                        <Pill tone={w.esPico ? "red" : "yellow"}>{w.count} PMs</Pill>
                        <Pill tone="steel">~{w.hhTotal}h estimadas</Pill>
                        {w.esPico && <Pill tone="red"><AlertTriangle size={10} /> Pico</Pill>}
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {w.pms.map((p) => (
                        <div key={p.plan.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12.5 }}>
                          <div style={{ width: 8, height: 8, borderRadius: "50%", background: p.tone === "red" ? C.red : C.amber, flexShrink: 0 }} />
                          <span style={{ fontWeight: 600, color: C.ink }}>{p.plan.descripcion}</span>
                          <span style={{ color: C.slate }}>·</span>
                          <span style={{ color: C.slate }}>{p.equipo?.sistema || "—"}</span>
                          <span style={{ color: C.slate }}>·</span>
                          <span style={{ color: C.slate }}>{p.equipo?.embarcacion_id ? (embarcaciones.find((e) => e.id === p.equipo.embarcacion_id)?.nombre || "—") : "—"}</span>
                          <span style={{ marginLeft: "auto", color: p.diasHasta <= 0 ? C.red : C.ink, fontWeight: p.diasHasta <= 0 ? 700 : 400 }}>
                            {p.diasHasta <= 0 ? "Vencido" : `+${p.diasHasta}d`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </Card>
                ))}
                {curva.every((w) => w.count === 0) && (
                  <Card><Empty>Sin PMs proyectados en las próximas {semanas} semanas.</Empty></Card>
                )}
              </div>
            </>
          )}
        </div>
      )}

      <Card style={{ marginTop: 16, background: C.mist }}>
        <div style={{ fontSize: 12.5, color: C.slate, lineHeight: 1.7 }}>
          <strong style={{ color: C.ink }}>Metodología:</strong>{" "}
          Ventana de puerto = duración típica entre mareas (mediana histórica).
          Proyección por horas = horas restantes hasta PM ÷ tasa de uso (h/día de últimas 2 lecturas).
          Proyección calendario = días restantes directos.
          Las HH estimadas usan {HH_DEFAULT_POR_PM}h por PM como valor por defecto.
          Backlog ordenado por score de riesgo (criticidad + antigüedad + prioridad).
        </div>
      </Card>
    </div>
  );
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

function Dot({ c }) {
  return <span style={{ display: "inline-block", width: 10, height: 10, background: c, borderRadius: 2, marginRight: 5, verticalAlign: "middle" }} />;
}
