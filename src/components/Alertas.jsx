import React, { useEffect, useState, useMemo } from "react";
import {
  Bell, AlertTriangle, Package, Wrench, Clock, Ship, ShoppingCart, ChevronRight, Check, Droplet, ShieldCheck, Activity, FileWarning, ShieldAlert, Anchor, Timer, Cpu, Cloud,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { fetchPronosticoOperacional } from "../lib/pronosticoApi";
import { useFleetData } from "../hooks/useFleetData";
import { C, archivo } from "../theme";
import { evaluarPlanes } from "../lib/pm";
import { generarAlertas, ALERTAS_FLEET_SPEC, ALERTA_NAV } from "../lib/alertas";
import { Card, PageHead, Pill, FilterBtn, Empty, ErrorBanner, InlineSpinner } from "../ui";

const CATEGORIAS = [
  { id: "pm",        label: "Plan Preventivo", icon: Wrench },
  { id: "pdm",       label: "Condición PdM",   icon: Activity },
  { id: "stock",     label: "Stock bajo",      icon: Package },
  { id: "ot",        label: "OTs críticas",    icon: AlertTriangle },
  { id: "sla",       label: "SLA vencido",     icon: Clock },
  { id: "equipo",    label: "Equipos",         icon: Ship },
  { id: "consumo",   label: "Consumo aceite",  icon: Droplet },
  { id: "documento", label: "Documentos",      icon: ShieldCheck },
  { id: "compra",    label: "Compras",         icon: ShoppingCart },
  { id: "fmeca",     label: "Riesgo FMECA",    icon: ShieldAlert },
  { id: "datos",     label: "Datos ISO",       icon: FileWarning },
  { id: "varada",    label: "Varadas",         icon: Anchor },
  { id: "horometro", label: "Horómetros",      icon: Timer },
  { id: "clima",     label: "Clima marítimo",  icon: Cloud },
  { id: "ia",        label: "Agentes IA",      icon: Cpu },
];

const NAV_POR_CAT = ALERTA_NAV;

const SPEC = ALERTAS_FLEET_SPEC;

export default function Alertas({ onNavigate }) {
  const { empresa } = useAuth();
  const [raw, loading, error, reload] = useFleetData(SPEC);
  const [filtro, setFiltro] = useState("all");
  const [pronosticoClima, setPronosticoClima] = useState(null);

  const embarcaciones = raw?.embarcaciones            || [];
  const equipos       = raw?.equipos                  || [];
  const items         = raw?.inventario_items         || [];
  const stock         = raw?.stock                    || [];
  const ots           = raw?.ordenes_trabajo          || [];
  const solicitudes   = raw?.solicitudes              || [];
  const compras       = raw?.compras                  || [];
  const prezarpes     = raw?.prezarpes                || [];
  const documentos    = raw?.documentos               || [];
  const planes        = raw?.planes_pm                || [];
  const mediciones    = raw?.mediciones_pdm           || [];
  const fallas        = raw?.fallas                   || [];
  const destinos      = raw?.inventario_item_destinos || [];
  const varadas       = raw?.varadas                  || [];
  const lecturas      = raw?.lecturas_horometro       || [];

  useEffect(() => {
    if (!empresa?.puerto_base) return;
    let cancel = false;
    fetchPronosticoOperacional(empresa.puerto_base)
      .then((d) => { if (!cancel) setPronosticoClima(d); })
      .catch(() => { if (!cancel) setPronosticoClima(null); });
    return () => { cancel = true; };
  }, [empresa?.puerto_base]);

  const alertas = useMemo(() => {
    if (!raw) return [];
    const planesEval = evaluarPlanes(planes, equipos);
    return generarAlertas({
      embarcaciones, equipos, items, stock, ots, solicitudes, compras,
      prezarpes, documentos, planesEval, mediciones, fallas, destinos,
      varadas, lecturas, pronosticoClima, empresa,
    });
  }, [equipos, items, stock, ots, solicitudes, compras, prezarpes, documentos, // eslint-disable-line
      embarcaciones, planes, mediciones, fallas, destinos, varadas, lecturas,
      pronosticoClima, empresa?.puerto_base, raw]);

  const conteoPorCat = (id) => alertas.filter((a) => a.cat === id).length;
  const listaFiltrada = filtro === "all" ? alertas : alertas.filter((a) => a.cat === filtro);
  const rojas = alertas.filter((a) => a.sev === "red").length;
  const ambar = alertas.filter((a) => a.sev === "amber").length;

  if (loading) return <div><PageHead kicker="Centro de Notificaciones" title="Alertas" /><Card><InlineSpinner label="Cargando alertas…" /></Card></div>;

  return (
    <div>
      <PageHead kicker="Centro de Notificaciones" title="Alertas"
        sub="Señales agregadas de toda la operación: planes PM vencidos, condición PdM fuera de límites, stock bajo, OTs críticas, SLA, equipos fuera de servicio, compras atrasadas y deuda de datos ISO. Si no hay nada acá, tu flota está bajo control." />

      <ErrorBanner onRetry={reload}>{error}</ErrorBanner>

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
              onClick={clicable ? () => onNavigate(dest, (a.cat === "ot" || a.cat === "datos") && a.ref ? { otId: a.ref } : null) : undefined}
              title={clicable ? `Ir a ${cat?.label} para gestionarla` : undefined}
              style={{ padding: 0, overflow: "hidden", borderLeft: `4px solid ${borderC}`, background: bg, cursor: clicable ? "pointer" : "default" }}>
              <div style={{ padding: "12px 16px", display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 12, alignItems: "center" }}>
                <div style={{ width: 38, height: 38, borderRadius: 9, background: C.surface, display: "flex", alignItems: "center", justifyContent: "center" }}>
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
