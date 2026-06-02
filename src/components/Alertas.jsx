import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  Bell, AlertTriangle, Package, Wrench, Clock, Ship, ShoppingCart, ChevronRight, Check, Droplet, ShieldCheck,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { fetchAll } from "../lib/db";
import { C, archivo, num, clp, PM_INTERVALS, SLA_HORAS, PRIORIDADES, lk } from "../theme";
import { Card, PageHead, Pill, FilterBtn, Empty, ErrorBanner, InlineSpinner } from "../ui";

const CATEGORIAS = [
  { id: "pm",       label: "Plan Preventivo", icon: Wrench },
  { id: "stock",    label: "Stock bajo",      icon: Package },
  { id: "ot",       label: "OTs críticas",    icon: AlertTriangle },
  { id: "sla",      label: "SLA vencido",     icon: Clock },
  { id: "equipo",   label: "Equipos",         icon: Ship },
  { id: "consumo",  label: "Consumo aceite",  icon: Droplet },
  { id: "documento", label: "Documentos",     icon: ShieldCheck },
  { id: "compra",   label: "Compras",         icon: ShoppingCart },
];

// A qué módulo lleva cada categoría de alerta al hacer clic.
const NAV_POR_CAT = {
  pm: "planpm",
  stock: "inventario",
  ot: "ots",
  sla: "solicitudes",
  equipo: "equipos",
  consumo: "prezarpe",
  documento: "cumplimiento",
  compra: "almacen",
};

// Días hábiles (lun-vie) entre dos fechas (no cuenta feriados).
function diasHabiles(desde, hasta) {
  let n = 0; const d = new Date(desde); d.setHours(0, 0, 0, 0); const fin = new Date(hasta); fin.setHours(0, 0, 0, 0);
  while (d < fin) { d.setDate(d.getDate() + 1); const w = d.getDay(); if (w !== 0 && w !== 6) n++; }
  return n;
}

export default function Alertas({ onNavigate }) {
  const { profile } = useAuth();
  const [embarcaciones, setEmbarcaciones] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [items, setItems] = useState([]);
  const [stock, setStock] = useState([]);
  const [ots, setOts] = useState([]);
  const [solicitudes, setSolicitudes] = useState([]);
  const [compras, setCompras] = useState([]);
  const [prezarpes, setPrezarpes] = useState([]);
  const [documentos, setDocumentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filtro, setFiltro] = useState("all");

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [embs, eqs, its, stk, otsAll, sols, cps, pzs, docs] = await Promise.all([
        fetchAll("embarcaciones", { order: { col: "codigo", asc: true } }),
        fetchAll("equipos"),
        fetchAll("inventario_items"),
        fetchAll("stock"),
        fetchAll("ordenes_trabajo"),
        fetchAll("solicitudes"),
        fetchAll("compras"),
        fetchAll("prezarpes", { order: { col: "fecha", asc: false } }),
        fetchAll("documentos"),
      ]);
      setEmbarcaciones(embs); setEquipos(eqs); setItems(its); setStock(stk);
      setOts(otsAll); setSolicitudes(sols); setCompras(cps); setPrezarpes(pzs); setDocumentos(docs);
    } catch (e) { setError("No se pudieron cargar las alertas. " + e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  function embName(id) { return embarcaciones.find((e) => e.id === id)?.nombre || "—"; }
  function itemDesc(id) { return items.find((i) => i.id === id)?.descripcion || "—"; }

  // ───── Generación de alertas (computada) ──────────────────────────────
  const alertas = useMemo(() => {
    const all = [];

    // 1) PM vencido (transcurridas >= primer intervalo)
    equipos.forEach((eq) => {
      const elapsed = (eq.horas_actual || 0) - (eq.horas_ult_pm || 0);
      for (const iv of [...PM_INTERVALS].reverse()) { // empieza por el mayor para clasificar peor caso
        if (elapsed >= iv) {
          all.push({
            cat: "pm", sev: iv >= 250 ? "red" : iv >= 100 ? "amber" : "yellow",
            titulo: `PM ${iv}h vencido · ${eq.sistema}`,
            detalle: `${embName(eq.embarcacion_id)} · transcurridas ${num(elapsed, 0)}h desde último PM`,
            ts: eq.updated_at,
          });
          break; // solo la peor coincidencia
        }
      }
    });

    // 2) Stock bajo (stock total por item <= stock_min)
    items.forEach((it) => {
      const total = stock.filter((s) => s.item_id === it.id).reduce((s, x) => s + (Number(x.cantidad) || 0), 0);
      if (it.stock_min > 0 && total <= it.stock_min) {
        all.push({
          cat: "stock", sev: total === 0 ? "red" : "amber",
          titulo: `Stock bajo · ${it.descripcion}`,
          detalle: `${total} ${it.unidad || "Un"} disponibles (mínimo ${it.stock_min}) · ${total === 0 ? "AGOTADO" : `repón ${(it.stock_max || it.stock_min) - total} ${it.unidad || "Un"}`}`,
          ts: it.updated_at,
        });
      }
    });

    // 3) OTs críticas abiertas
    ots.filter((o) => o.estado !== "cerrada" && (o.prioridad === "critica" || o.prioridad === "alta")).forEach((o) => {
      all.push({
        cat: "ot", sev: o.prioridad === "critica" ? "red" : "amber",
        titulo: `OT ${o.prioridad === "critica" ? "crítica" : "alta"} abierta · ${o.folio || ""}`,
        detalle: `${embName(o.embarcacion_id)} · ${o.sistema} · ${o.descripcion?.slice(0, 80) || ""}`,
        ts: o.fecha, ref: o.id,   // id de la OT para abrirla filtrada al hacer clic
      });
    });

    // 4) Solicitudes con SLA vencido
    solicitudes.filter((s) => s.estado === "pendiente").forEach((s) => {
      const obj = SLA_HORAS[s.prioridad] || 24;
      const transcurridas = (Date.now() - new Date(s.created_at).getTime()) / 36e5;
      if (transcurridas >= obj) {
        all.push({
          cat: "sla", sev: "red",
          titulo: `SLA vencido · ${s.folio || ""} · ${lk(PRIORIDADES, s.prioridad)}`,
          detalle: `${embName(s.embarcacion_id)} · ${num(transcurridas, 1)}h de espera (objetivo ${obj}h) · ${s.descripcion?.slice(0, 60) || ""}`,
          ts: s.created_at,
        });
      } else if (transcurridas >= obj * 0.75) {
        all.push({
          cat: "sla", sev: "amber",
          titulo: `SLA por vencer · ${s.folio || ""}`,
          detalle: `${embName(s.embarcacion_id)} · ${num(transcurridas, 1)}h de espera (objetivo ${obj}h)`,
          ts: s.created_at,
        });
      }
    });

    // 5) Equipos fuera de servicio o en reparación
    equipos.filter((eq) => eq.estado === "fuera_servicio" || eq.estado === "en_reparacion").forEach((eq) => {
      all.push({
        cat: "equipo", sev: eq.estado === "fuera_servicio" ? "red" : "amber",
        titulo: `${eq.sistema} · ${eq.estado === "fuera_servicio" ? "Fuera de servicio" : "En reparación"}`,
        detalle: `${embName(eq.embarcacion_id)} · ${eq.id_visible}`,
        ts: eq.updated_at,
      });
    });

    // 6) Compras enviadas hace más tiempo que lead_dias sin recibir
    compras.filter((c) => c.estado === "enviada").forEach((c) => {
      const dias = (Date.now() - new Date(c.fecha).getTime()) / 86400000;
      if (dias >= (c.lead_dias || 0)) {
        all.push({
          cat: "compra", sev: dias >= (c.lead_dias || 0) + 7 ? "red" : "amber",
          titulo: `Compra atrasada · ${c.folio || ""}`,
          detalle: `${c.proveedor} · ${num(dias, 0)} días desde envío (lead ${c.lead_dias}d)`,
          ts: c.fecha,
        });
      }
    });

    // 7) Consumo de aceite anómalo: nivel de aceite marcado "bajo" en prezarpes.
    //    Recurrente (≥2) = crítico (posible fuga/desgaste); 1 vez = atención.
    const bajoPorEquipo = {};
    prezarpes.forEach((pz) => {
      Object.entries(pz.niveles || {}).forEach(([eqId, n]) => {
        if (n?.aceite === "bajo") {
          if (!bajoPorEquipo[eqId]) bajoPorEquipo[eqId] = { n: 0, ts: pz.fecha };
          bajoPorEquipo[eqId].n += 1;
        }
      });
    });
    Object.entries(bajoPorEquipo).forEach(([eqId, info]) => {
      const eq = equipos.find((e) => e.id === eqId);
      all.push({
        cat: "consumo", sev: info.n >= 2 ? "red" : "amber",
        titulo: `Consumo de aceite · ${eq?.sistema || eq?.id_visible || "equipo"}`,
        detalle: `${embName(eq?.embarcacion_id)} · nivel bajo en ${info.n} prezarpe${info.n !== 1 ? "s" : ""} · ${info.n >= 2 ? "posible fuga o desgaste, revisar" : "vigilar consumo"}`,
        ts: info.ts,
      });
    });

    // 8) Documentos / certificados vencidos o por vencer (15 días hábiles)
    const hoyD = new Date(); hoyD.setHours(0, 0, 0, 0);
    documentos.forEach((d) => {
      if (!d.vencimiento) return;
      const venc = new Date(d.vencimiento + "T00:00:00");
      if (venc < hoyD) {
        all.push({ cat: "documento", sev: "red", titulo: `Documento vencido · ${d.tipo}`, detalle: `${embName(d.embarcacion_id)} · venció el ${d.vencimiento}`, ts: d.vencimiento });
      } else {
        const dh = diasHabiles(hoyD, venc);
        if (dh <= 15) all.push({ cat: "documento", sev: "amber", titulo: `Documento por vencer · ${d.tipo}`, detalle: `${embName(d.embarcacion_id)} · vence el ${d.vencimiento} (${dh} días háb.)`, ts: d.vencimiento });
      }
    });

    // Orden: rojo primero, luego ámbar, dentro de cada uno por timestamp descendente
    return all.sort((a, b) => {
      const sevOrder = { red: 0, amber: 1, yellow: 2 };
      if (sevOrder[a.sev] !== sevOrder[b.sev]) return sevOrder[a.sev] - sevOrder[b.sev];
      return new Date(b.ts || 0).getTime() - new Date(a.ts || 0).getTime();
    });
  }, [equipos, items, stock, ots, solicitudes, compras, prezarpes, documentos, embarcaciones]); // eslint-disable-line

  const conteoPorCat = (id) => alertas.filter((a) => a.cat === id).length;
  const listaFiltrada = filtro === "all" ? alertas : alertas.filter((a) => a.cat === filtro);
  const rojas = alertas.filter((a) => a.sev === "red").length;
  const ambar = alertas.filter((a) => a.sev === "amber").length;

  if (loading) return <div><PageHead kicker="Centro de Notificaciones" title="Alertas" /><Card><InlineSpinner label="Cargando alertas…" /></Card></div>;

  return (
    <div>
      <PageHead kicker="Centro de Notificaciones" title="Alertas"
        sub="Señales agregadas de toda la operación: PM vencidos, stock bajo, OTs críticas, SLA, equipos fuera de servicio y compras atrasadas. Si no hay nada acá, tu flota está bajo control." />

      <ErrorBanner onRetry={cargar}>{error}</ErrorBanner>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 16 }}>
        <Card style={{ padding: 18, background: alertas.length === 0 ? `linear-gradient(135deg, #1E9E6A, #127C8A)` : alertas.length && rojas ? `linear-gradient(135deg, ${C.red}, #8A2A26)` : `linear-gradient(135deg, ${C.amber}, #9F7415)`, color: "#fff" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            {alertas.length === 0 ? <Check size={22} color="#fff" /> : <Bell size={22} color="#fff" />}
            <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: "rgba(255,255,255,.85)", fontWeight: 700 }}>Estado General</div>
          </div>
          <div style={{ ...archivo, fontSize: 26, fontWeight: 800, lineHeight: 1 }}>
            {alertas.length === 0 ? "Todo en orden" : `${alertas.length} alerta${alertas.length !== 1 ? "s" : ""}`}
          </div>
          <div style={{ fontSize: 12, marginTop: 8, color: "rgba(255,255,255,.85)" }}>
            {alertas.length === 0 ? "Sin acciones pendientes inmediatas" : `${rojas} crítica${rojas !== 1 ? "s" : ""} · ${ambar} por revisar`}
          </div>
        </Card>
        <KPI label="Críticas" value={rojas} tone={rojas ? C.red : C.green} sub="requieren acción inmediata" />
        <KPI label="Por revisar" value={ambar} tone={ambar ? C.amber : C.green} sub="atención esta semana" />
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <FilterBtn active={filtro === "all"} onClick={() => setFiltro("all")}>Todas ({alertas.length})</FilterBtn>
        {CATEGORIAS.map((c) => (
          <FilterBtn key={c.id} active={filtro === c.id} onClick={() => setFiltro(c.id)}>
            {c.label} ({conteoPorCat(c.id)})
          </FilterBtn>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {listaFiltrada.length === 0 ? (
          <Card><Empty>
            <Check size={32} color={C.green} style={{ marginBottom: 10 }} /><br />
            {filtro === "all" ? "Sin alertas activas. Todo bajo control." : "Sin alertas en esta categoría."}
          </Empty></Card>
        ) : listaFiltrada.map((a, i) => {
          const cat = CATEGORIAS.find((c) => c.id === a.cat);
          const Icon = cat?.icon || Bell;
          const bg = a.sev === "red" ? C.redBg : C.yellowBg;
          const borderC = a.sev === "red" ? C.red : C.amber;
          const dest = NAV_POR_CAT[a.cat];
          const clicable = dest && onNavigate;
          return (
            <Card key={i}
              onClick={clicable ? () => onNavigate(dest, a.cat === "ot" && a.ref ? { otId: a.ref } : null) : undefined}
              title={clicable ? `Ir a ${cat?.label} para gestionarla` : undefined}
              style={{ padding: 0, overflow: "hidden", borderLeft: `4px solid ${borderC}`, background: bg, cursor: clicable ? "pointer" : "default" }}>
              <div style={{ padding: "12px 16px", display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 12, alignItems: "center" }}>
                <div style={{ width: 38, height: 38, borderRadius: 9, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon size={18} color={borderC} />
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: C.abyss }}>{a.titulo}</span>
                    <Pill tone={a.sev === "red" ? "red" : "yellow"}>{a.sev === "red" ? "Crítica" : "Atención"}</Pill>
                  </div>
                  <div style={{ fontSize: 12.5, color: C.slate }}>{a.detalle}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, color: C.slate, fontFamily: "'IBM Plex Mono', monospace", textAlign: "right" }}>{cat?.label}</span>
                  {clicable && <ChevronRight size={18} color={borderC} />}
                </div>
              </div>
            </Card>);
        })}
      </div>
    </div>
  );
}

function KPI({ label, value, tone, sub }) {
  return (
    <Card style={{ padding: 18 }}>
      <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: C.slate, fontWeight: 600 }}>{label}</div>
      <div style={{ ...archivo, fontSize: 26, fontWeight: 800, color: tone || C.steel, lineHeight: 1, marginTop: 6 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: C.slate, marginTop: 6 }}>{sub}</div>}
    </Card>
  );
}
