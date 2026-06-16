import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  AlertTriangle, ClipboardList, Wrench, Activity, DollarSign, History,
  Sparkles, Bot, CalendarClock, RefreshCw, Ship, CheckCircle2,
} from "lucide-react";
import {
  BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";
import { useAuth } from "../lib/auth";
import { fetchAll } from "../lib/db";
import { C, archivo, clp, num, rolLabel, ESTADOS_OT, lk } from "../theme";
import { evaluarPlanes } from "../lib/pm";
import {
  ModuleShell, StatGrid, HeroStat, ActionQueue, Section, DataTable,
  LinkButton, Pill, EmptyState, HealthRing, ghostBtn, primaryBtn,
} from "../ui";

const ESTADO_COLOR = {
  solicitada: C.slate, planificada: C.purple, programada: C.steel,
  en_ejecucion: C.amber, cerrada: C.green,
};

const PRIORIDADES = [
  { value: "baja", label: "Baja" }, { value: "media", label: "Media" },
  { value: "alta", label: "Alta" }, { value: "critica", label: "Crítica" },
];

function fechaCorta(ts) {
  const d = new Date(ts);
  return d.toLocaleString("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function saludTone(pct) {
  if (pct >= 80) return { color: C.green, label: "Óptimo" };
  if (pct >= 60) return { color: C.amber, label: "Atención" };
  return { color: C.red, label: "Crítico" };
}

export default function Tablero({ onNavigate }) {
  const { profile, empresa } = useAuth();
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [embs, eqs, otsAll, sols, its, stk, bita, pls, vars] = await Promise.all([
        fetchAll("embarcaciones"),
        fetchAll("equipos"),
        fetchAll("ordenes_trabajo", { order: { col: "fecha", asc: false } }),
        fetchAll("solicitudes"),
        fetchAll("inventario_items"),
        fetchAll("stock"),
        fetchAll("bitacora", { order: { col: "fecha", asc: false } }),
        fetchAll("planes_pm"),
        fetchAll("varadas"),
      ]);
      setData({ embs, eqs, ots: otsAll, sols, its, stk, bita: bita.slice(0, 8), planes: pls, varadas: vars });
    } catch (e) {
      setError("No se pudo cargar el tablero. " + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const m = useMemo(() => {
    const { embs = [], eqs = [], ots = [], sols = [], its = [], stk = [], planes = [], varadas = [] } = data;
    const otsAbiertas = ots.filter((o) => o.estado !== "cerrada");
    const otsCriticas = ots.filter((o) => (o.prioridad === "critica" || o.prioridad === "alta") && o.estado !== "cerrada");
    const eqIdsPMVencido = new Set(
      evaluarPlanes(planes, eqs).filter((r) => r.tone === "red").map((r) => r.plan.equipo_id)
    );
    const pmVencidos = eqIdsPMVencido.size;
    const stockBajo = its.filter((i) => {
      const total = stk.filter((s) => s.item_id === i.id).reduce((acc, x) => acc + (Number(x.cantidad) || 0), 0);
      return i.stock_min > 0 && total <= i.stock_min;
    }).length;
    const solPend = sols.filter((s) => s.estado === "pendiente").length;
    const correctivas = ots.filter((o) => o.tipo === "correctivo");
    const mtbf = correctivas.length
      ? correctivas.reduce((s, o) => s + (Number(o.hrs_oper_desde) || 0), 0) / correctivas.length
      : 0;
    const costoTotal = ots.reduce((s, o) => s + (Number(o.costo_mo) || 0) + (Number(o.costo_mat) || 0), 0);
    const hoy = new Date();
    const mesIni = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const otsMes = ots.filter((o) => new Date(o.fecha) >= mesIni);
    const costoMes = otsMes.reduce((s, o) => s + (Number(o.costo_mo) || 0) + (Number(o.costo_mat) || 0), 0);

    const porEstado = ESTADOS_OT.map((e) => ({
      name: e.label,
      cantidad: ots.filter((o) => o.estado === e.value).length,
      color: ESTADO_COLOR[e.value],
    }));

    const SISTEMAS_HEX = [
      { key: "Motor", kw: ["motor", "propulsión", "propulsion", "diésel", "diesel", "generador"] },
      { key: "Casco", kw: ["casco", "cubierta", "hull", "fondo", "estructura"] },
      { key: "Eléctrico", kw: ["eléctrico", "electrico", "panel", "batería", "bateria", "cableado", "alarma", "generacion"] },
      { key: "Hidráulico", kw: ["hidráulico", "hidraulico", "grúa", "grua", "halador", "winche", "potencia"] },
      { key: "Navegación", kw: ["navegación", "navegacion", "radar", "gps", "carta", "compás", "compas", "radio"] },
      { key: "Seguridad", kw: ["seguridad", "extintor", "balsa", "salvavidas", "aro", "señal", "senal"] },
    ];
    const nowMs = Date.now();
    const diasMs = 90 * 24 * 36e5;
    const match = (txt = "", kw) => kw.some((k) => txt.toLowerCase().includes(k));

    const calcHex = (embId) => SISTEMAS_HEX.map(({ key, kw }) => {
      const eqsS = eqs.filter((e) => e.embarcacion_id === embId && (match(e.sistema, kw) || match(e.id_visible, kw)));
      const otsS = ots.filter((o) => o.embarcacion_id === embId && (match(o.sistema, kw) || match(o.descripcion, kw)));
      let score = 100;
      eqsS.forEach((e) => {
        if (e.estado === "fuera_servicio") score -= 25;
        else if (e.estado === "en_reparacion") score -= 20;
        else if (e.estado === "desgaste") score -= 10;
      });
      eqsS.forEach((e) => { if (eqIdsPMVencido.has(e.id)) score -= 15; });
      otsS.filter((o) => o.tipo === "correctivo" && o.estado !== "cerrada").forEach((o) => {
        score -= o.prioridad === "critica" ? 25 : o.prioridad === "alta" ? 18 : 12;
      });
      otsS.filter((o) => o.tipo === "correctivo" && o.estado === "cerrada" && (nowMs - new Date(o.fecha).getTime()) < diasMs)
        .forEach(() => { score -= 8; });
      if (eqsS.length === 0 && otsS.length === 0) score = 85;
      return { sistema: key, salud: Math.max(0, Math.min(100, score)) };
    });

    const diagnostico = embs.map((emb) => {
      const hexData = calcHex(emb.id);
      const saludPromedio = Math.round(hexData.reduce((s, d) => s + d.salud, 0) / hexData.length);
      return { emb, hexData, saludPromedio };
    });

    const varadasActivas = varadas.filter((v) => v.estado === "ejecucion").length;
    const totalAlertas = otsCriticas.length + pmVencidos + stockBajo + solPend;

    return {
      flota: embs.length, equipos: eqs.length, otsTotal: ots.length, otsAbiertas: otsAbiertas.length,
      otsCriticas: otsCriticas.length, pmVencidos, stockBajo, solPend, totalAlertas,
      mtbf, costoTotal, costoMes, porEstado, otsRec: ots.slice(0, 8),
      diagnostico, varadasActivas,
    };
  }, [data]);

  const nav = (id) => onNavigate?.(id);

  const actionItems = useMemo(() => {
    if (!m || loading) return [];
    const items = [];
    if (m.otsCriticas > 0) {
      items.push({
        id: "ot-crit",
        label: `${m.otsCriticas} OT${m.otsCriticas !== 1 ? "s" : ""} crítica${m.otsCriticas !== 1 ? "s" : ""} o alta prioridad`,
        detail: "Revisar y programar intervención",
        tone: "red",
        onClick: () => nav("ots"),
      });
    }
    if (m.pmVencidos > 0) {
      items.push({
        id: "pm-venc",
        label: `${m.pmVencidos} equipo${m.pmVencidos !== 1 ? "s" : ""} con PM vencido`,
        detail: "Plan preventivo requiere ejecución",
        tone: "red",
        onClick: () => nav("planpm"),
      });
    }
    if (m.stockBajo > 0) {
      items.push({
        id: "stock",
        label: `${m.stockBajo} ítem${m.stockBajo !== 1 ? "s" : ""} bajo stock mínimo`,
        detail: "Repuestos críticos por reponer",
        tone: "amber",
        onClick: () => nav("inventario"),
      });
    }
    if (m.solPend > 0) {
      items.push({
        id: "sol",
        label: `${m.solPend} solicitud${m.solPend !== 1 ? "es" : ""} pendiente${m.solPend !== 1 ? "s" : ""}`,
        detail: "Triaje de mantenimiento",
        tone: "amber",
        onClick: () => nav("solicitudes"),
      });
    }
    return items;
  }, [m, loading]);

  const heroVariant = !m ? "ok" : m.totalAlertas === 0 ? "ok" : m.totalAlertas <= 3 ? "warn" : "critical";

  const otColumns = [
    {
      key: "folio",
      label: "Folio",
      width: "100px",
      render: (o) => (
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: C.steel, fontSize: 12.5 }}>
          {o.folio}
        </span>
      ),
    },
    {
      key: "descripcion",
      label: "Descripción",
      render: (o) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{o.sistema || "—"}</div>
          <div style={{ fontSize: 12, color: C.slate, marginTop: 2 }}>{o.descripcion?.slice(0, 72) || "—"}</div>
        </div>
      ),
    },
    {
      key: "embarcacion",
      label: "Nave",
      width: "140px",
      render: (o) => {
        const emb = data.embs?.find((e) => e.id === o.embarcacion_id);
        return (
          <span style={{ fontSize: 12.5, display: "inline-flex", alignItems: "center", gap: 6 }}>
            {emb && <span style={{ width: 8, height: 8, borderRadius: 2, background: emb.color, flexShrink: 0 }} />}
            {emb?.nombre || "—"}
          </span>
        );
      },
    },
    {
      key: "fecha",
      label: "Fecha",
      width: "100px",
      render: (o) => <span style={{ fontSize: 12, fontFamily: "'IBM Plex Mono', monospace", color: C.slate }}>{o.fecha}</span>,
    },
    {
      key: "prioridad",
      label: "Prioridad",
      width: "90px",
      render: (o) => (
        <Pill tone={o.prioridad === "critica" || o.prioridad === "alta" ? "red" : "slate"}>
          {lk(PRIORIDADES, o.prioridad)}
        </Pill>
      ),
    },
    {
      key: "estado",
      label: "Estado",
      width: "110px",
      render: (o) => <Pill tone={o.estado === "cerrada" ? "green" : "yellow"}>{lk(ESTADOS_OT, o.estado)}</Pill>,
    },
  ];

  const primerNombre = profile?.nombre?.split(" ")[0] || "";
  const fechaHoy = new Date().toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" });

  return (
    <ModuleShell
      kicker={`${empresa?.nombre || "Flota"} · ${empresa?.puerto_base || "Operaciones marítimas"}`}
      title={primerNombre ? `Centro de mando · ${primerNombre}` : "Centro de mando"}
      sub={`${fechaHoy.charAt(0).toUpperCase() + fechaHoy.slice(1)} · Sesión como ${rolLabel(profile?.rol)}. Vista unificada de flota, mantenimiento y alertas.`}
      loading={loading}
      error={error}
      onRetry={cargar}
      action={
        <>
          <button type="button" onClick={() => nav("copiloto")} style={{ ...ghostBtn, display: "inline-flex", alignItems: "center", gap: 7 }}>
            <Bot size={15} /> Copiloto IA
          </button>
          <button type="button" onClick={() => nav("informe")} style={{ ...primaryBtn, display: "inline-flex", alignItems: "center", gap: 7 }}>
            <Sparkles size={15} /> Informe ejecutivo
          </button>
          <button type="button" onClick={cargar} title="Actualizar datos" data-nofx
            style={{ ...ghostBtn, padding: "10px 12px", display: "inline-flex", alignItems: "center" }}>
            <RefreshCw size={15} />
          </button>
        </>
      }
    >
      {!loading && m && (
        <>
          {/* ── KPIs + cola de acciones ─────────────────────────────── */}
          <div className="cmms-grid-2" style={{ marginBottom: 24 }}>
            <StatGrid
              hero={
                <HeroStat
                  variant={heroVariant}
                  icon={m.totalAlertas === 0 ? CheckCircle2 : AlertTriangle}
                  label="Estado operacional"
                  value={m.totalAlertas === 0 ? "Operación estable" : m.totalAlertas}
                  sub={m.totalAlertas === 0
                    ? "Sin alertas activas en flota, PM, stock ni solicitudes"
                    : `${m.otsCriticas} OT · ${m.pmVencidos} PM · ${m.stockBajo} stock · ${m.solPend} solicitudes`}
                  onClick={() => nav("alertas")}
                />
              }
              stats={[
                { label: "OTs abiertas", value: m.otsAbiertas, sub: `${m.otsTotal} totales`, icon: ClipboardList, tone: m.otsAbiertas ? C.amber : C.green, onClick: () => nav("ots") },
                { label: "PM vencidos", value: m.pmVencidos, sub: "equipos pendientes", icon: CalendarClock, tone: m.pmVencidos ? C.red : C.green, onClick: () => nav("planpm") },
              ]}
            />
            <ActionQueue
              title="Acciones prioritarias"
              items={actionItems}
              emptyLabel="Flota en condiciones normales"
            />
          </div>

          {/* ── Segunda fila KPIs ───────────────────────────────────── */}
          <StatGrid
            stats={[
              { label: "MTBF", value: `${num(m.mtbf, 0)} h`, sub: "entre fallas correctivas", icon: Activity, tone: C.cyan, onClick: () => nav("kpis") },
              { label: "Costo del mes", value: clp(m.costoMes), sub: `${clp(m.costoTotal)} acumulado`, icon: DollarSign, tone: C.gold, onClick: () => nav("costos") },
              { label: "Embarcaciones", value: m.flota, sub: `${m.equipos} equipos`, icon: Ship, tone: C.steel, onClick: () => nav("embarcaciones") },
              { label: "Varadas activas", value: m.varadasActivas, sub: "mantenimiento mayor", icon: Wrench, tone: m.varadasActivas ? C.amber : C.green, onClick: () => nav("varada") },
            ]}
          />

          {/* ── Salud por embarcación ───────────────────────────────── */}
          {(m.diagnostico || []).length > 0 && (
            <Section
              title="Salud de la flota"
              description="Diagnóstico por sistemas críticos — motor, casco, eléctrico, hidráulico, navegación y seguridad"
              action={<LinkButton onClick={() => nav("flota")}>Ver estado de flota</LinkButton>}
              padding={0}
            >
              <div className="cmms-grid-fleet" style={{ padding: 16 }}>
                {m.diagnostico.map(({ emb, hexData, saludPromedio }) => {
                  const { color, label } = saludTone(saludPromedio);
                  return (
                    <div key={emb.id} style={{
                      padding: 20, borderRadius: 12, border: `1px solid ${C.line}`,
                      background: C.surface2,
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: C.slate, fontWeight: 700 }}>
                            Salud del buque
                          </div>
                          <div style={{ ...archivo, fontSize: 18, fontWeight: 800, color: C.abyss, marginTop: 4 }}>{emb.nombre}</div>
                          <div style={{ fontSize: 11, color: C.slate, fontFamily: "'IBM Plex Mono', monospace", marginTop: 2 }}>{emb.codigo}</div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ ...archivo, fontSize: 22, fontWeight: 800, color, lineHeight: 1 }}>{saludPromedio}%</div>
                            <div style={{ fontSize: 10.5, color, fontWeight: 600 }}>{label}</div>
                          </div>
                          <div style={{ position: "relative", width: 56, height: 56, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <HealthRing value={saludPromedio} />
                          </div>
                        </div>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 130px", gap: 8, alignItems: "center" }}>
                        <ResponsiveContainer width="100%" height={220}>
                          <RadarChart data={hexData} margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
                            <PolarGrid gridType="polygon" stroke={C.line} />
                            <PolarAngleAxis dataKey="sistema" tick={{ fontSize: 10, fontWeight: 600, fill: C.ink }} />
                            <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                            <Tooltip formatter={(v) => [`${v}%`, "Salud"]} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${C.line}` }} />
                            <Radar dataKey="salud" stroke={color} fill={color} fillOpacity={0.12} strokeWidth={2} dot={{ r: 3, fill: color }} />
                          </RadarChart>
                        </ResponsiveContainer>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {hexData.map((d) => {
                            const c = d.salud >= 80 ? C.green : d.salud >= 60 ? C.amber : C.red;
                            return (
                              <div key={d.sistema}>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                                  <span style={{ fontSize: 10, fontWeight: 600, color: C.ink }}>{d.sistema}</span>
                                  <span style={{ fontSize: 10, fontWeight: 800, color: c, fontFamily: "'IBM Plex Mono', monospace" }}>{d.salud}%</span>
                                </div>
                                <div style={{ height: 4, borderRadius: 2, background: C.foam, overflow: "hidden" }}>
                                  <div style={{ height: "100%", width: `${d.salud}%`, background: c, borderRadius: 2 }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {/* ── Gráfico + actividad ─────────────────────────────────── */}
          <div className="cmms-grid-2">
            <Section title="Órdenes de trabajo por estado" padding={16}>
              {m.otsTotal === 0 ? (
                <EmptyState
                  icon={ClipboardList}
                  title="Sin órdenes de trabajo"
                  description="Cuando registres OTs, verás aquí la distribución por estado del flujo de mantenimiento."
                  action={
                    <button type="button" onClick={() => nav("ots")} style={primaryBtn}>
                      Crear primera OT
                    </button>
                  }
                />
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={m.porEstado} barCategoryGap="20%">
                    <CartesianGrid strokeDasharray="3 3" stroke={C.line} vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: C.slate }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: C.slate }} allowDecimals={false} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 10, border: `1px solid ${C.line}`, boxShadow: "0 4px 16px rgba(0,0,0,.08)" }} />
                    <Bar dataKey="cantidad" radius={[6, 6, 0, 0]} maxBarSize={48}>
                      {m.porEstado.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Section>

            <Section
              title="Actividad reciente"
              action={<LinkButton onClick={() => nav("bitacora")}>Ver bitácora</LinkButton>}
              padding={16}
            >
              {(data.bita || []).length === 0 ? (
                <EmptyState icon={History} title="Sin actividad registrada" description="Las acciones de usuarios aparecerán aquí en tiempo real." />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {(data.bita || []).map((e) => (
                    <div key={e.id} style={{
                      padding: "12px 14px", background: C.mist, borderRadius: 10,
                      borderLeft: `3px solid ${C.steel}`,
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: C.abyss }}>{e.accion}</span>
                        <span style={{ fontSize: 10.5, color: C.slate, fontFamily: "'IBM Plex Mono', monospace", flexShrink: 0 }}>
                          {fechaCorta(e.fecha)}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: C.slate, lineHeight: 1.45 }}>
                        {e.usuario_nombre || "Sistema"}
                        {e.detalle ? ` · ${e.detalle.slice(0, 100)}` : ""}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          </div>

          {/* ── Tabla OTs recientes ─────────────────────────────────── */}
          <Section
            title="Últimas órdenes de trabajo"
            description="Acceso rápido al backlog operativo más reciente"
            action={<LinkButton onClick={() => nav("ots")}>Ver todas</LinkButton>}
            padding={0}
            style={{ marginBottom: 0 }}
          >
            <DataTable
              columns={otColumns}
              rows={m.otsRec || []}
              onRowClick={(o) => onNavigate?.("ots", { otId: o.id })}
              compact
              empty={
                <EmptyState
                  icon={ClipboardList}
                  title="Sin OTs registradas"
                  description="Las órdenes de trabajo son el corazón del CMMS. Empieza creando una desde el módulo de OTs."
                  action={<button type="button" onClick={() => nav("ots")} style={{ ...primaryBtn, margin: "0 auto" }}>Ir a OTs</button>}
                />
              }
            />
          </Section>
        </>
      )}
    </ModuleShell>
  );
}
