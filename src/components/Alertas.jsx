import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  Bell, AlertTriangle, Package, Wrench, Clock, Ship, ShoppingCart, ChevronRight, Check, Droplet, ShieldCheck, Activity, FileWarning, ShieldAlert, Anchor, Timer, Cpu, Cloud,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { fetchPronosticoOperacional } from "../lib/pronosticoApi";
import {
  evaluarSemáforosOperacionales, precipProximasHoras, resumirAlertasTemporales,
} from "../lib/clima";
import { puntoHorometro, diasDesde } from "../lib/horometro";
import { fetchAll } from "../lib/db";
import { C, archivo, num, SLA_HORAS, PRIORIDADES, lk } from "../theme";
import { evaluarPlanes } from "../lib/pm";
import { seriesPdM, evaluarMedicion } from "../lib/pdm";
import { sinValorizar } from "../lib/ot";
import { requiereCodigoFalla } from "../lib/fallasISO";
import { coberturaCriticos } from "../lib/operacional";
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

// A qué módulo lleva cada categoría de alerta al hacer clic.
const NAV_POR_CAT = {
  pm: "planpm",
  pdm: "pdm",
  stock: "inventario",
  ot: "ots",
  sla: "solicitudes",
  equipo: "equipos",
  consumo: "prezarpe",
  documento: "cumplimiento",
  compra: "almacen",
  fmeca: "fallas",
  datos: "ots",
  varada: "varada",
  horometro: "horometros",
  clima: "tablero",
  ia: "equipos",
};

// Días hábiles (lun-vie) entre dos fechas (no cuenta feriados).
function diasHabiles(desde, hasta) {
  let n = 0; const d = new Date(desde); d.setHours(0, 0, 0, 0); const fin = new Date(hasta); fin.setHours(0, 0, 0, 0);
  while (d < fin) { d.setDate(d.getDate() + 1); const w = d.getDay(); if (w !== 0 && w !== 6) n++; }
  return n;
}

function formatearHoraClima(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-CL", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function Alertas({ onNavigate }) {
  const { empresa } = useAuth();
  const [embarcaciones, setEmbarcaciones] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [items, setItems] = useState([]);
  const [stock, setStock] = useState([]);
  const [ots, setOts] = useState([]);
  const [solicitudes, setSolicitudes] = useState([]);
  const [compras, setCompras] = useState([]);
  const [prezarpes, setPrezarpes] = useState([]);
  const [documentos, setDocumentos] = useState([]);
  const [planes, setPlanes] = useState([]);
  const [mediciones, setMediciones] = useState([]);
  const [fallas, setFallas] = useState([]);
  const [destinos, setDestinos] = useState([]);
  const [varadas, setVaradas] = useState([]);
  const [lecturas, setLecturas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filtro, setFiltro] = useState("all");
  const [pronosticoClima, setPronosticoClima] = useState(null);

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [embs, eqs, its, stk, otsAll, sols, cps, pzs, docs, pls, meds, fls, dsts, vars, lecs] = await Promise.all([
        fetchAll("embarcaciones", { order: { col: "codigo", asc: true } }),
        fetchAll("equipos"),
        fetchAll("inventario_items"),
        fetchAll("stock"),
        fetchAll("ordenes_trabajo"),
        fetchAll("solicitudes"),
        fetchAll("compras"),
        fetchAll("prezarpes", { order: { col: "fecha", asc: false } }),
        fetchAll("documentos"),
        fetchAll("planes_pm"),
        fetchAll("mediciones_pdm"),
        fetchAll("fallas"),
        fetchAll("inventario_item_destinos"),
        fetchAll("varadas"),
        fetchAll("lecturas_horometro", { order: { col: "fecha", asc: false } }),
      ]);
      setEmbarcaciones(embs); setEquipos(eqs); setItems(its); setStock(stk);
      setOts(otsAll); setSolicitudes(sols); setCompras(cps); setPrezarpes(pzs); setDocumentos(docs);
      setPlanes(pls); setMediciones(meds); setFallas(fls); setDestinos(dsts); setVaradas(vars); setLecturas(lecs);
    } catch (e) { setError("No se pudieron cargar las alertas. " + e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    if (!empresa?.puerto_base) return;
    let cancel = false;
    fetchPronosticoOperacional(empresa.puerto_base)
      .then((d) => { if (!cancel) setPronosticoClima(d); })
      .catch(() => { if (!cancel) setPronosticoClima(null); });
    return () => { cancel = true; };
  }, [empresa?.puerto_base]);

  function embName(id) { return embarcaciones.find((e) => e.id === id)?.nombre || "—"; }

  // ───── Generación de alertas (computada) ──────────────────────────────
  const alertas = useMemo(() => {
    const all = [];

    // 1) Planes PM vencidos o próximos — modelo real (planes_pm: intervalo
    //    propio por plan, hito de último PM, disparador horas o calendario).
    evaluarPlanes(planes, equipos).forEach((r) => {
      if (r.tone !== "red" && r.tone !== "yellow") return;
      const eq = r.equipo;
      const unidad = r.esCalendario ? "días" : "h";
      const transcurrido = Number.isFinite(r.elapsed)
        ? `${num(r.elapsed, 0)} ${unidad} desde último PM`
        : "nunca realizado";
      all.push({
        cat: "pm", sev: r.tone === "red" ? "red" : "amber",
        titulo: `PM ${r.label.toLowerCase()} · ${r.plan.descripcion}`,
        detalle: `${embName(eq?.embarcacion_id)} · ${eq?.sistema || "equipo"} · ${transcurrido} (intervalo ${num(r.limite, 0)} ${unidad})`,
        ts: r.plan.fecha_ult_pm || eq?.updated_at,
      });
    });

    // 1b) Condición PdM (ISO 17359): última medición de cada serie
    //     (equipo+parámetro) que cruza su límite de alerta o crítico.
    for (const serie of seriesPdM(mediciones).values()) {
      const ult = serie[0];
      const ev = evaluarMedicion(ult.valor, ult.limite_alerta, ult.limite_critico);
      if (ev.key !== "critico" && ev.key !== "alerta") continue;
      const eq = equipos.find((e) => e.id === ult.equipo_id);
      all.push({
        cat: "pdm", sev: ev.key === "critico" ? "red" : "amber",
        titulo: `Condición ${ev.label.toLowerCase()} · ${ult.parametro} · ${eq?.sistema || "equipo"}`,
        detalle: `${embName(eq?.embarcacion_id)} · ${num(ult.valor, 1)} ${ult.unidad || ""} (alerta ${ult.limite_alerta ?? "—"} / crítico ${ult.limite_critico ?? "—"}) · medido ${ult.fecha}`,
        ts: ult.fecha,
      });
    }

    // 2a) Cobertura de repuestos críticos: repuesto ligado a equipo de
    //     criticidad A con stock total agotado — la nave depende de ese
    //     equipo y no hay con qué repararlo (siempre rojo, tenga o no mínimo).
    // Ítems con min=0 y max=0 no han sido auditados: omitirlos.
    const sinCobertura = coberturaCriticos({ items, stock, destinos, equipos })
      .filter(({ item }) => (item.stock_min || 0) > 0 || (item.stock_max || 0) > 0);
    const idsSinCobertura = new Set(sinCobertura.map((c) => c.item.id));
    sinCobertura.forEach(({ item, equiposA }) => {
      const nombres = equiposA.map((e) => e.sistema || e.id_visible).slice(0, 3).join(", ");
      all.push({
        cat: "stock", sev: "red",
        titulo: `Sin repuesto de equipo crítico · ${item.descripcion}`,
        detalle: `Stock agotado en todas las bodegas · respalda a ${nombres}${equiposA.length > 3 ? ` (+${equiposA.length - 3})` : ""} (criticidad A) · gestiona compra o redistribución`,
        ts: item.updated_at,
      });
    });

    // 2b) Stock bajo (stock total por item <= stock_min); los agotados de
    //     equipos críticos ya salieron arriba con mayor contexto.
    items.forEach((it) => {
      if (idsSinCobertura.has(it.id)) return;
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

    // 8b) Riesgo FMECA sin mitigar (IEC 60812): RPN = S×O×D.
    //     Crítico (≥200) exige acción inmediata; Alto (125–199) atención.
    //     La alerta persiste hasta re-evaluar el riesgo tras la mitigación.
    fallas.forEach((f) => {
      const rpn = (f.severidad || 0) * (f.ocurrencia || 0) * (f.deteccion || 0);
      if (rpn < 125) return;
      all.push({
        cat: "fmeca", sev: rpn >= 200 ? "red" : "amber",
        titulo: `Riesgo ${rpn >= 200 ? "crítico" : "alto"} FMECA · ${f.modo} (RPN ${rpn})`,
        detalle: `${embName(f.embarcacion_id)} · ${f.sistema} · ${f.accion ? `acción recomendada: ${f.accion}` : "sin acción de mitigación definida — define inspección, PM o rediseño"}`,
        ts: f.fecha,
      });
    });

    // 9) Calidad de datos ISO 14224: deuda de codificación y valorización.
    //    Cerrar rápido en terreno está bien — pero la deuda queda visible
    //    hasta completarla, o Pareto/Weibull/costos pierden esos eventos.
    ots.filter((o) => o.estado === "cerrada" && requiereCodigoFalla(o) && !o.modo_falla).forEach((o) => {
      all.push({
        cat: "datos", sev: "amber",
        titulo: `OT sin codificación de falla · ${o.folio || ""}`,
        detalle: `${embName(o.embarcacion_id)} · ${o.sistema || ""} · correctiva cerrada sin modo de falla ISO 14224 — Pareto y MTBF la pierden`,
        ts: o.cerrada_fecha || o.fecha, ref: o.id,
      });
    });
    ots.filter(sinValorizar).forEach((o) => {
      all.push({
        cat: "datos", sev: "amber",
        titulo: `OT sin valorizar · ${o.folio || ""}`,
        detalle: `${embName(o.embarcacion_id)} · ${o.sistema || ""} · cerrada sin costos de MO/materiales — el costo real del mantenimiento queda subestimado`,
        ts: o.cerrada_fecha || o.fecha, ref: o.id,
      });
    });

    // 10) Varadas: atrasadas (ejecución + fecha_fin_estimada vencida) o sin iniciar
    const hoyISO = new Date().toISOString().slice(0, 10);
    varadas.forEach((v) => {
      if (v.estado === "ejecucion" && v.fecha_fin_estimada && v.fecha_fin_estimada < hoyISO) {
        const dias = Math.round((new Date(hoyISO + "T00:00:00") - new Date(v.fecha_fin_estimada + "T00:00:00")) / 86_400_000);
        all.push({
          cat: "varada", sev: "red",
          titulo: `Varada atrasada · ${v.nombre}`,
          detalle: `${embName(v.embarcacion_id)} · lleva ${dias} día${dias !== 1 ? "s" : ""} sobre el plan (fin estimado ${v.fecha_fin_estimada}) · actualiza la fecha o cierra la varada`,
          ts: v.fecha_fin_estimada,
        });
      } else if (v.estado === "planificacion" && v.fecha_inicio && v.fecha_inicio <= hoyISO) {
        all.push({
          cat: "varada", sev: "amber",
          titulo: `Varada sin iniciar · ${v.nombre}`,
          detalle: `${embName(v.embarcacion_id)} · fecha de inicio ${v.fecha_inicio} ya pasó — cambia el estado a "En ejecución" si los trabajos comenzaron`,
          ts: v.fecha_inicio,
        });
      }
    });

    // 11) Agente A — puntos de horómetro sin lectura reciente (ISO 14224 §9.4)
    const byIdH = new Map(equipos.map((e) => [e.id, e]));
    const ultimaDe = (id) => lecturas.find((l) => l.equipo_id === id);
    equipos.filter((e) => e.horometro === "propio" && e.tipo_nodo !== "sistema").forEach((eq) => {
      const ultima = ultimaDe(eq.id);
      const dias = diasDesde(ultima?.fecha);
      if (dias == null || dias > 30) {
        all.push({ cat: "horometro", sev: "red",
          titulo: `Sin lectura de horómetro · ${eq.sistema}`,
          detalle: `${embName(eq.embarcacion_id)} · ${eq.id_visible} · ${dias == null ? "nunca registrada" : `última hace ${Math.round(dias)} días`} — ingresar en Horómetros`,
          ts: ultima?.fecha || eq.updated_at });
      } else if (dias > 7) {
        all.push({ cat: "horometro", sev: "amber",
          titulo: `Lectura de horómetro atrasada · ${eq.sistema}`,
          detalle: `${embName(eq.embarcacion_id)} · ${eq.id_visible} · última hace ${Math.round(dias)} días (objetivo ≤7 días) — ingresar en Horómetros`,
          ts: ultima?.fecha });
      }
    });

    // 12) Agente B — herencia huérfana: "hereda" sin ascendiente con horómetro propio
    equipos.filter((e) => (e.horometro || "hereda") === "hereda" && e.tipo_nodo !== "sistema").forEach((e) => {
      if (puntoHorometro(e, byIdH) === null) {
        all.push({ cat: "horometro", sev: "amber",
          titulo: `Herencia de horómetro sin resolver · ${e.sistema}`,
          detalle: `${embName(e.embarcacion_id)} · ${e.id_visible} · "hereda" pero ningún ascendiente tiene horómetro propio — configurar en Equipos`,
          ts: e.updated_at });
      }
    });

    // 13) Agente C — coherencia PM/horómetro: horas_ult_pm > horas_actual (datos inconsistentes)
    evaluarPlanes(planes, equipos).filter((r) => !r.esCalendario && r.equipo).forEach((r) => {
      const eq = r.equipo;
      const ptoId = puntoHorometro(eq, byIdH);
      const pto = ptoId ? byIdH.get(ptoId) : null;
      const horasAct = Number(pto?.horas_actual ?? 0);
      const hPM = Number(r.plan?.horas_ult_pm ?? 0);
      if (hPM > 0 && horasAct > 0 && hPM > horasAct) {
        all.push({ cat: "horometro", sev: "amber",
          titulo: `Horómetro inconsistente con PM · ${r.plan.descripcion}`,
          detalle: `${embName(eq.embarcacion_id)} · ${eq.sistema} · último PM a ${num(hPM, 0)} h pero horómetro actual es ${num(horasAct, 0)} h`,
          ts: r.plan?.fecha_ult_pm || eq.updated_at });
      }
    });

    // ──── Agentes IA — calidad de datos que alimentan módulos de inteligencia ────

    // IA-A: equipos sin criticidad → riesgoFlota() / InformeEjecutivo / CopilotoFlota degradados
    const sinCrit = equipos.filter((e) => !e.criticidad && e.tipo_nodo !== "sistema");
    if (sinCrit.length > 5) {
      all.push({ cat: "ia", sev: sinCrit.length > 20 ? "red" : "amber",
        titulo: `${sinCrit.length} equipos sin criticidad — scoring de riesgo degradado`,
        detalle: `InformeEjecutivo y CopilotoFlota no priorizan correctamente sin A/B/C — configurar criticidad en módulo Equipos`,
        ts: null });
    }

    // IA-B: % OTs correctivas sin modo_falla ISO 14224 → historial de DiagnosticoFallas incompleto
    const otsCorrCerr = ots.filter((o) => o.estado === "cerrada" && o.tipo === "correctivo");
    if (otsCorrCerr.length >= 5) {
      const sinModo = otsCorrCerr.filter((o) => !o.modo_falla).length;
      const pct = Math.round((sinModo / otsCorrCerr.length) * 100);
      if (pct > 30) {
        all.push({ cat: "ia", sev: pct > 60 ? "red" : "amber",
          titulo: `Historial ISO al ${100 - pct}% — DiagnosticoFallas trabaja con datos incompletos`,
          detalle: `${sinModo} de ${otsCorrCerr.length} OTs correctivas sin modo_falla ISO 14224 · el motor de diagnóstico pierde el patrón histórico de falla por cada OT sin codificar`,
          ts: null });
      }
    }

    // IA-C: equipos críticos A con <4 OTs correctivas → Weibull no puede ajustarse (ConfiabilidadML)
    const eqCriticosA = equipos.filter((e) => e.criticidad === "A");
    const sinPred = eqCriticosA.filter((eq) =>
      ots.filter((o) => o.equipo_id === eq.id && o.tipo === "correctivo" && o.estado === "cerrada").length < 4
    );
    if (eqCriticosA.length > 0 && sinPred.length > 0) {
      all.push({ cat: "ia", sev: "amber",
        titulo: `${sinPred.length} equipo${sinPred.length !== 1 ? "s" : ""} crítico${sinPred.length !== 1 ? "s" : ""} A sin predicción Weibull`,
        detalle: `ConfiabilidadML requiere ≥4 OTs correctivas cerradas por equipo · sin ese historial no hay ajuste de distribución ni vida residual (RUL)`,
        ts: null });
    }

    // IA-D: series PdM sin medición reciente → DiagnosticoFallas pierde contexto de condición
    let pdmStale = 0;
    for (const serie of seriesPdM(mediciones).values()) {
      const dSerie = diasDesde(serie[0]?.fecha);
      if (dSerie == null || dSerie > 30) pdmStale++;
    }
    if (pdmStale > 0) {
      all.push({ cat: "ia", sev: "amber",
        titulo: `${pdmStale} serie${pdmStale !== 1 ? "s" : ""} PdM sin datos recientes (>30 d)`,
        detalle: `DiagnosticoFallas y ConfiabilidadML pierden contexto de condición — ingresar mediciones en módulo PdM`,
        ts: null });
    }

    // IA-F: clima marítimo — condiciones actuales y temporal en 48 h
    if (pronosticoClima?.actual) {
      const precip6h = precipProximasHoras(pronosticoClima.horario, 6);
      const sem = evaluarSemáforosOperacionales(pronosticoClima.actual, precip6h);
      const temporal = resumirAlertasTemporales(pronosticoClima.horario);
      const ev = sem.zarpe;

      if (ev.nivel !== "verde") {
        all.push({
          cat: "clima",
          sev: ev.nivel === "rojo" ? "red" : "amber",
          titulo: `IA-F · ${ev.label} · ${pronosticoClima.puerto || empresa?.puerto_base || "Puerto"}`,
          detalle: `Viento ${Math.round(pronosticoClima.actual.vientoKn ?? 0)} kn · oleaje ${Number(pronosticoClima.actual.oleajeM ?? 0).toFixed(1)} m · revisar antes de zarpar`,
          ts: pronosticoClima.actualizado || null,
        });
      }

      if (temporal.hayTemporal && temporal.peor?.ev.nivel !== "verde") {
        const sevT = temporal.peor.ev.nivel === "rojo" ? "red" : "amber";
        if (!all.some((a) => a.cat === "clima" && a.titulo.includes("Temporal"))) {
          all.push({
            cat: "clima",
            sev: sevT,
            titulo: `IA-F · Temporal previsto · ${formatearHoraClima(temporal.peor.time)}`,
            detalle: `${temporal.etiqueta} · apoyo operacional, verificar Directemar`,
            ts: temporal.peor.time,
          });
        }
      }

      if (ev.nivel !== "verde" || temporal.hayTemporal) {
        all.push({
          cat: "ia",
          sev: ev.nivel === "rojo" || temporal.peor?.ev.nivel === "rojo" ? "red" : "amber",
          titulo: "IA-F · Vigilancia meteorológica activa",
          detalle: temporal.etiqueta || `${ev.label} en condiciones actuales`,
          ts: pronosticoClima.actualizado || null,
        });
      }
    }

    // Orden: rojo primero, luego ámbar, dentro de cada uno por timestamp descendente
    return all.sort((a, b) => {
      const sevOrder = { red: 0, amber: 1, yellow: 2 };
      if (sevOrder[a.sev] !== sevOrder[b.sev]) return sevOrder[a.sev] - sevOrder[b.sev];
      return new Date(b.ts || 0).getTime() - new Date(a.ts || 0).getTime();
    });
  }, [equipos, items, stock, ots, solicitudes, compras, prezarpes, documentos, embarcaciones, planes, mediciones, fallas, destinos, varadas, lecturas, pronosticoClima, empresa?.puerto_base]); // eslint-disable-line

  const conteoPorCat = (id) => alertas.filter((a) => a.cat === id).length;
  const listaFiltrada = filtro === "all" ? alertas : alertas.filter((a) => a.cat === filtro);
  const rojas = alertas.filter((a) => a.sev === "red").length;
  const ambar = alertas.filter((a) => a.sev === "amber").length;

  if (loading) return <div><PageHead kicker="Centro de Notificaciones" title="Alertas" /><Card><InlineSpinner label="Cargando alertas…" /></Card></div>;

  return (
    <div>
      <PageHead kicker="Centro de Notificaciones" title="Alertas"
        sub="Señales agregadas de toda la operación: planes PM vencidos, condición PdM fuera de límites, stock bajo, OTs críticas, SLA, equipos fuera de servicio, compras atrasadas y deuda de datos ISO. Si no hay nada acá, tu flota está bajo control." />

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
