import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  LayoutDashboard, AlertTriangle, ClipboardList, Wrench, Package,
  Activity, DollarSign, History, ChevronRight, TrendingUp,
} from "lucide-react";
import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { useAuth } from "../lib/auth";
import { fetchAll } from "../lib/db";
import { C, archivo, clp, num, rolLabel, ESTADOS_OT, PM_INTERVALS, lk } from "../theme";
import { Card, PageHead, Pill, Empty, ErrorBanner, InlineSpinner } from "../ui";

const ESTADO_COLOR = { solicitada: C.slate, planificada: C.purple, programada: C.steel, en_ejecucion: C.amber, cerrada: C.green };

function fechaCorta(ts) {
  const d = new Date(ts);
  return d.toLocaleString("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function Tablero({ onNavigate }) {
  const { profile, empresa } = useAuth();
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [embs, eqs, otsAll, sols, its, stk, bita] = await Promise.all([
        fetchAll("embarcaciones"),
        fetchAll("equipos"),
        fetchAll("ordenes_trabajo", { order: { col: "fecha", asc: false } }),
        fetchAll("solicitudes"),
        fetchAll("inventario_items"),
        fetchAll("stock"),
        fetchAll("bitacora", { order: { col: "fecha", asc: false } }),
      ]);
      setData({ embs, eqs, ots: otsAll, sols, its, stk, bita: bita.slice(0, 6) });
    } catch (e) { setError("No se pudo cargar el tablero. " + e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const m = useMemo(() => {
    const { embs = [], eqs = [], ots = [], sols = [], its = [], stk = [] } = data;
    const otsAbiertas = ots.filter((o) => o.estado !== "cerrada");
    const otsCriticas = ots.filter((o) => (o.prioridad === "critica" || o.prioridad === "alta") && o.estado !== "cerrada");
    const pmVencidos = eqs.filter((eq) => {
      const elapsed = (eq.horas_actual || 0) - (eq.horas_ult_pm || 0);
      return elapsed >= PM_INTERVALS[0];
    }).length;
    const stockBajo = its.filter((i) => {
      const total = stk.filter((s) => s.item_id === i.id).reduce((acc, x) => acc + (Number(x.cantidad) || 0), 0);
      return i.stock_min > 0 && total <= i.stock_min;
    }).length;
    const solPend = sols.filter((s) => s.estado === "pendiente").length;
    const correctivas = ots.filter((o) => o.tipo === "correctivo");
    const cerradas = ots.filter((o) => o.estado === "cerrada");
    const mtbf = correctivas.length ? correctivas.reduce((s, o) => s + (Number(o.hrs_oper_desde) || 0), 0) / correctivas.length : 0;
    const costoTotal = ots.reduce((s, o) => s + (Number(o.costo_mo) || 0) + (Number(o.costo_mat) || 0), 0);
    // mes actual
    const hoy = new Date(); const mesIni = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const otsMes = ots.filter((o) => new Date(o.fecha) >= mesIni);
    const costoMes = otsMes.reduce((s, o) => s + (Number(o.costo_mo) || 0) + (Number(o.costo_mat) || 0), 0);

    const porEstado = ESTADOS_OT.map((e) => ({
      name: e.label,
      cantidad: ots.filter((o) => o.estado === e.value).length,
      color: ESTADO_COLOR[e.value],
    }));

    return {
      flota: embs.length, equipos: eqs.length, otsTotal: ots.length, otsAbiertas: otsAbiertas.length,
      otsCriticas: otsCriticas.length, pmVencidos, stockBajo, solPend,
      mtbf, costoTotal, costoMes, porEstado, otsRec: ots.slice(0, 5),
    };
  }, [data]);

  if (loading) return <div><PageHead kicker="Resumen de Flota" title="Tablero Principal" /><Card><InlineSpinner label="Cargando tablero…" /></Card></div>;

  const totalAlertas = m.otsCriticas + m.pmVencidos + m.stockBajo + m.solPend;

  return (
    <div>
      <PageHead kicker={`${empresa?.nombre || "Flota"} · ${empresa?.puerto_base || ""}`} title={`Buen día, ${profile?.nombre?.split(" ")[0] || ""}`}
        sub={`Estás conectado como ${rolLabel(profile?.rol)}. Aquí está el estado de tu operación a hoy.`} />

      <ErrorBanner onRetry={cargar}>{error}</ErrorBanner>

      {/* Resumen ejecutivo */}
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr", gap: 14, marginBottom: 18 }}>
        <Card style={{ padding: 20, background: totalAlertas === 0 ? `linear-gradient(135deg, #1E9E6A, #127C8A)` : totalAlertas <= 3 ? `linear-gradient(135deg, ${C.amber}, #9F7415)` : `linear-gradient(135deg, ${C.red}, #8A2A26)`, color: "#fff", cursor: "pointer" }}
          onClick={() => onNavigate?.("alertas")}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <AlertTriangle size={22} color="#fff" />
            <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: "rgba(255,255,255,.85)", fontWeight: 700 }}>Acciones Pendientes</div>
          </div>
          <div style={{ ...archivo, fontSize: 36, fontWeight: 800, lineHeight: 1 }}>
            {totalAlertas === 0 ? "Todo OK" : totalAlertas}
          </div>
          <div style={{ fontSize: 12, marginTop: 8, color: "rgba(255,255,255,.85)" }}>
            {totalAlertas === 0 ? "Sin alertas activas" : `${m.otsCriticas} OTs · ${m.pmVencidos} PM · ${m.stockBajo} stock · ${m.solPend} solicitudes`}
          </div>
        </Card>
        <Stat icon={ClipboardList} label="OTs abiertas" value={m.otsAbiertas} tone={m.otsAbiertas ? C.amber : C.green} sub={`${m.otsTotal} totales`} onClick={() => onNavigate?.("ots")} />
        <Stat icon={Wrench} label="PM vencidos" value={m.pmVencidos} tone={m.pmVencidos ? C.red : C.green} sub="equipos requieren PM" onClick={() => onNavigate?.("planpm")} />
        <Stat icon={Package} label="Stock bajo" value={m.stockBajo} tone={m.stockBajo ? C.amber : C.green} sub="ítems bajo mínimo" onClick={() => onNavigate?.("inventario")} />
      </div>

      {/* Estado de flota + indicadores */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 14, marginBottom: 18 }}>
        <Stat icon={Activity} label="MTBF" value={`${num(m.mtbf, 0)}h`} sub="tiempo medio entre fallas" onClick={() => onNavigate?.("kpis")} />
        <Stat icon={DollarSign} label="Costo del mes" value={clp(m.costoMes)} tone={C.gold} sub={`${clp(m.costoTotal)} acumulado`} onClick={() => onNavigate?.("costos")} />
        <Stat icon={TrendingUp} label="Flota" value={m.flota} sub={`${m.equipos} equipos registrados`} onClick={() => onNavigate?.("embarcaciones")} />
        <Stat icon={ClipboardList} label="Solicitudes" value={m.solPend} tone={m.solPend ? C.amber : C.green} sub="pendientes de revisar" onClick={() => onNavigate?.("solicitudes")} />
      </div>

      {/* Gráfico + actividad reciente */}
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 14 }}>
        <Card>
          <div style={{ ...archivo, fontWeight: 700, fontSize: 14, color: C.abyss, marginBottom: 10 }}>OTs por Estado</div>
          {m.otsTotal === 0 ? <Empty>Sin OTs registradas todavía.</Empty> :
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={m.porEstado}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.foam} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: C.slate }} />
                <YAxis tick={{ fontSize: 11, fill: C.slate }} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 7 }} />
                <Bar dataKey="cantidad" radius={[5, 5, 0, 0]}>
                  {m.porEstado.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>}
        </Card>

        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ ...archivo, fontWeight: 700, fontSize: 14, color: C.abyss }}>Actividad Reciente</div>
            <button onClick={() => onNavigate?.("bitacora")}
              style={{ background: "none", border: "none", color: C.steel, cursor: "pointer", fontSize: 11.5, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 2 }}>
              Ver bitácora <ChevronRight size={13} />
            </button>
          </div>
          {(data.bita || []).length === 0 ? <Empty>Sin actividad aún.</Empty> :
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(data.bita || []).map((e) => (
                <div key={e.id} style={{ padding: "8px 10px", background: C.mist, borderRadius: 7, borderLeft: `3px solid ${C.steel}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.abyss }}>{e.accion}</span>
                    <span style={{ fontSize: 10.5, color: C.slate, fontFamily: "'IBM Plex Mono', monospace" }}>{fechaCorta(e.fecha)}</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: C.slate }}>{e.usuario_nombre || "Sistema"} · {e.detalle?.slice(0, 80)}</div>
                </div>))}
            </div>}
        </Card>
      </div>

      {/* OTs recientes */}
      <Card style={{ marginTop: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ ...archivo, fontWeight: 700, fontSize: 14, color: C.abyss }}>Últimas Órdenes de Trabajo</div>
          <button onClick={() => onNavigate?.("ots")}
            style={{ background: "none", border: "none", color: C.steel, cursor: "pointer", fontSize: 11.5, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 2 }}>
            Ver todas <ChevronRight size={13} />
          </button>
        </div>
        {m.otsRec?.length === 0 ? <Empty>Sin OTs registradas.</Empty> :
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {m.otsRec?.map((o) => {
              const emb = data.embs?.find((e) => e.id === o.embarcacion_id);
              return (
                <div key={o.id} style={{ display: "grid", gridTemplateColumns: "auto 1.4fr 1fr auto auto auto", gap: 12, padding: "8px 12px", background: C.mist, borderRadius: 7, alignItems: "center" }}>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: C.steel, fontSize: 12 }}>{o.folio}</span>
                  <span style={{ fontSize: 12.5 }}>{o.sistema} · <span style={{ color: C.slate }}>{o.descripcion?.slice(0, 50)}</span></span>
                  <span style={{ fontSize: 12, color: C.slate, display: "flex", alignItems: "center", gap: 5 }}>
                    {emb && <span style={{ width: 8, height: 8, borderRadius: 2, background: emb.color }} />}{emb?.nombre || "—"}
                  </span>
                  <span style={{ fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", color: C.slate }}>{o.fecha}</span>
                  <Pill tone={o.prioridad === "critica" || o.prioridad === "alta" ? "red" : "slate"}>{lk([{ value: "baja", label: "Baja" }, { value: "media", label: "Media" }, { value: "alta", label: "Alta" }, { value: "critica", label: "Crítica" }], o.prioridad)}</Pill>
                  <Pill tone={o.estado === "cerrada" ? "green" : "yellow"}>{lk(ESTADOS_OT, o.estado)}</Pill>
                </div>);
            })}
          </div>}
      </Card>
    </div>
  );
}

function Stat({ icon: Icon, label, value, tone, sub, onClick }) {
  return (
    <Card style={{ padding: 16, cursor: onClick ? "pointer" : "default" }} onClick={onClick}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: C.slate, fontWeight: 600 }}>{label}</div>
        {Icon && <Icon size={17} color={tone || C.steel} />}
      </div>
      <div style={{ ...archivo, fontSize: 22, fontWeight: 800, color: tone || C.steel, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: C.slate, marginTop: 6 }}>{sub}</div>}
    </Card>
  );
}
