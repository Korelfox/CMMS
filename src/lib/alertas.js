// ============================================================
//  Lógica pura de generación de alertas operacionales.
//  Extraído de Alertas.jsx para hacer cada generador testeable
//  de forma independiente. Sin dependencias React.
//
//  Cada alertas*() recibe datos planos, devuelve Alert[]:
//    { cat, sev: "red"|"amber", titulo, detalle, ts, ref? }
//  generarAlertas() es el único punto de entrada para el componente.
// ============================================================

import { seriesPdM, evaluarMedicion } from "./pdm";
import { sinValorizar } from "./ot";
import { requiereCodigoFalla } from "./fallasISO";
import { coberturaCriticos } from "./operacional";
import { puntoHorometro, diasDesde } from "./horometro";
import { precipProximasHoras, evaluarSemáforosOperacionales, resumirAlertasTemporales } from "./clima";
import { num, SLA_HORAS, PRIORIDADES, lk } from "../theme";

const DIA_MS = 86_400_000;
const SEV_ORDER = { red: 0, amber: 1, yellow: 2 };

// ── Helpers ─────────────────────────────────────────────────────────────────

// Días hábiles lun-vie entre dos fechas (no cuenta feriados).
export function diasHabiles(desde, hasta) {
  let n = 0;
  const d = new Date(desde); d.setHours(0, 0, 0, 0);
  const fin = new Date(hasta); fin.setHours(0, 0, 0, 0);
  while (d < fin) { d.setDate(d.getDate() + 1); const w = d.getDay(); if (w !== 0 && w !== 6) n++; }
  return n;
}

export function formatearHoraClima(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-CL", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

// ── Generadores individuales ─────────────────────────────────────────────────

// 1) PMs vencidos o próximos según evaluarPlanes().
export function alertasPM(planesEval, embsById) {
  const result = [];
  for (const r of planesEval || []) {
    if (r.tone !== "red" && r.tone !== "yellow") continue;
    const eq = r.equipo;
    const unidad = r.esCalendario ? "días" : "h";
    const transcurrido = Number.isFinite(r.elapsed)
      ? `${num(r.elapsed, 0)} ${unidad} desde último PM`
      : "nunca realizado";
    const nave = embsById.get(eq?.embarcacion_id)?.nombre || "—";
    result.push({
      cat: "pm", sev: r.tone === "red" ? "red" : "amber",
      titulo: `PM ${r.label.toLowerCase()} · ${r.plan.descripcion}`,
      detalle: `${nave} · ${eq?.sistema || "equipo"} · ${transcurrido} (intervalo ${num(r.limite, 0)} ${unidad})`,
      ts: r.plan.fecha_ult_pm || eq?.updated_at,
    });
  }
  return result;
}

// 1b) Condición PdM: última medición de cada serie que cruza su límite.
export function alertasPdM(mediciones, equipos, embsById) {
  const eqById = new Map((equipos || []).map((e) => [e.id, e]));
  const result = [];
  for (const serie of seriesPdM(mediciones || []).values()) {
    const ult = serie[0];
    const ev = evaluarMedicion(ult.valor, ult.limite_alerta, ult.limite_critico);
    if (ev.key !== "critico" && ev.key !== "alerta") continue;
    const eq = eqById.get(ult.equipo_id);
    const nave = embsById.get(eq?.embarcacion_id)?.nombre || "—";
    result.push({
      cat: "pdm", sev: ev.key === "critico" ? "red" : "amber",
      titulo: `Condición ${ev.label.toLowerCase()} · ${ult.parametro} · ${eq?.sistema || "equipo"}`,
      detalle: `${nave} · ${num(ult.valor, 1)} ${ult.unidad || ""} (alerta ${ult.limite_alerta ?? "—"} / crítico ${ult.limite_critico ?? "—"}) · medido ${ult.fecha}`,
      ts: ult.fecha,
    });
  }
  return result;
}

// 2a+2b) Cobertura de repuestos críticos agotados + stock bajo.
export function alertasStock(items, stock, destinos, equipos) {
  const result = [];
  const sinCobertura = coberturaCriticos({ items, stock, destinos, equipos })
    .filter(({ item }) => (item.stock_min || 0) > 0 || (item.stock_max || 0) > 0);
  const idsSinCobertura = new Set(sinCobertura.map((c) => c.item.id));

  for (const { item, equiposA } of sinCobertura) {
    const nombres = equiposA.map((e) => e.sistema || e.id_visible).slice(0, 3).join(", ");
    result.push({
      cat: "stock", sev: "red",
      titulo: `Sin repuesto de equipo crítico · ${item.descripcion}`,
      detalle: `Stock agotado en todas las bodegas · respalda a ${nombres}${equiposA.length > 3 ? ` (+${equiposA.length - 3})` : ""} (criticidad A) · gestiona compra o redistribución`,
      ts: item.updated_at,
    });
  }

  for (const it of items || []) {
    if (idsSinCobertura.has(it.id)) continue;
    const total = (stock || []).filter((s) => s.item_id === it.id)
      .reduce((s, x) => s + (Number(x.cantidad) || 0), 0);
    if (it.stock_min > 0 && total <= it.stock_min) {
      result.push({
        cat: "stock", sev: total === 0 ? "red" : "amber",
        titulo: `Stock bajo · ${it.descripcion}`,
        detalle: `${total} ${it.unidad || "Un"} disponibles (mínimo ${it.stock_min}) · ${total === 0 ? "AGOTADO" : `repón ${(it.stock_max || it.stock_min) - total} ${it.unidad || "Un"}`}`,
        ts: it.updated_at,
      });
    }
  }
  return result;
}

// 3) OTs críticas o de alta prioridad abiertas.
export function alertasOTs(ots, embsById) {
  const result = [];
  for (const o of ots || []) {
    if (o.estado === "cerrada") continue;
    if (o.prioridad !== "critica" && o.prioridad !== "alta") continue;
    const nave = embsById.get(o.embarcacion_id)?.nombre || "—";
    result.push({
      cat: "ot", sev: o.prioridad === "critica" ? "red" : "amber",
      titulo: `OT ${o.prioridad === "critica" ? "crítica" : "alta"} abierta · ${o.folio || ""}`,
      detalle: `${nave} · ${o.sistema} · ${o.descripcion?.slice(0, 80) || ""}`,
      ts: o.fecha, ref: o.id,
    });
  }
  return result;
}

// 4) Solicitudes con SLA vencido o próximo a vencer.
export function alertasSLA(solicitudes, embsById) {
  const result = [];
  for (const s of solicitudes || []) {
    if (s.estado !== "pendiente") continue;
    const obj = SLA_HORAS[s.prioridad] || 24;
    const transcurridas = (Date.now() - new Date(s.created_at).getTime()) / 36e5;
    const nave = embsById.get(s.embarcacion_id)?.nombre || "—";
    if (transcurridas >= obj) {
      result.push({
        cat: "sla", sev: "red",
        titulo: `SLA vencido · ${s.folio || ""} · ${lk(PRIORIDADES, s.prioridad)}`,
        detalle: `${nave} · ${num(transcurridas, 1)}h de espera (objetivo ${obj}h) · ${s.descripcion?.slice(0, 60) || ""}`,
        ts: s.created_at,
      });
    } else if (transcurridas >= obj * 0.75) {
      result.push({
        cat: "sla", sev: "amber",
        titulo: `SLA por vencer · ${s.folio || ""}`,
        detalle: `${nave} · ${num(transcurridas, 1)}h de espera (objetivo ${obj}h)`,
        ts: s.created_at,
      });
    }
  }
  return result;
}

// 5) Equipos fuera de servicio o en reparación.
export function alertasEquipos(equipos, embsById) {
  const result = [];
  for (const eq of equipos || []) {
    if (eq.estado !== "fuera_servicio" && eq.estado !== "en_reparacion") continue;
    const nave = embsById.get(eq.embarcacion_id)?.nombre || "—";
    result.push({
      cat: "equipo", sev: eq.estado === "fuera_servicio" ? "red" : "amber",
      titulo: `${eq.sistema} · ${eq.estado === "fuera_servicio" ? "Fuera de servicio" : "En reparación"}`,
      detalle: `${nave} · ${eq.id_visible}`,
      ts: eq.updated_at,
    });
  }
  return result;
}

// 6) Compras enviadas con lead time vencido.
export function alertasCompras(compras) {
  const result = [];
  for (const c of compras || []) {
    if (c.estado !== "enviada") continue;
    const dias = (Date.now() - new Date(c.fecha).getTime()) / DIA_MS;
    if (dias >= (c.lead_dias || 0)) {
      result.push({
        cat: "compra", sev: dias >= (c.lead_dias || 0) + 7 ? "red" : "amber",
        titulo: `Compra atrasada · ${c.folio || ""}`,
        detalle: `${c.proveedor} · ${num(dias, 0)} días desde envío (lead ${c.lead_dias}d)`,
        ts: c.fecha,
      });
    }
  }
  return result;
}

// 7) Consumo de aceite anómalo desde prezarpes.
export function alertasConsumoAceite(prezarpes, equipos, embsById) {
  const eqById = new Map((equipos || []).map((e) => [e.id, e]));
  const bajoPorEquipo = {};
  for (const pz of prezarpes || []) {
    for (const [eqId, n] of Object.entries(pz.niveles || {})) {
      if (n?.aceite === "bajo") {
        if (!bajoPorEquipo[eqId]) bajoPorEquipo[eqId] = { n: 0, ts: pz.fecha };
        bajoPorEquipo[eqId].n += 1;
      }
    }
  }
  const result = [];
  for (const [eqId, info] of Object.entries(bajoPorEquipo)) {
    const eq = eqById.get(eqId);
    const nave = embsById.get(eq?.embarcacion_id)?.nombre || "—";
    result.push({
      cat: "consumo", sev: info.n >= 2 ? "red" : "amber",
      titulo: `Consumo de aceite · ${eq?.sistema || eq?.id_visible || "equipo"}`,
      detalle: `${nave} · nivel bajo en ${info.n} prezarpe${info.n !== 1 ? "s" : ""} · ${info.n >= 2 ? "posible fuga o desgaste, revisar" : "vigilar consumo"}`,
      ts: info.ts,
    });
  }
  return result;
}

// 8) Documentos / certificados vencidos o por vencer (15 días hábiles).
export function alertasDocumentos(documentos, embsById, hoy) {
  const hoyD = hoy ? new Date(hoy + "T00:00:00") : new Date();
  hoyD.setHours(0, 0, 0, 0);
  const result = [];
  for (const d of documentos || []) {
    if (!d.vencimiento) continue;
    const venc = new Date(d.vencimiento + "T00:00:00");
    const nave = embsById.get(d.embarcacion_id)?.nombre || "—";
    if (venc < hoyD) {
      result.push({ cat: "documento", sev: "red", titulo: `Documento vencido · ${d.tipo}`, detalle: `${nave} · venció el ${d.vencimiento}`, ts: d.vencimiento });
    } else {
      const dh = diasHabiles(hoyD, venc);
      if (dh <= 15) result.push({ cat: "documento", sev: "amber", titulo: `Documento por vencer · ${d.tipo}`, detalle: `${nave} · vence el ${d.vencimiento} (${dh} días háb.)`, ts: d.vencimiento });
    }
  }
  return result;
}

// 8b) Riesgo FMECA sin mitigar (IEC 60812): RPN = S×O×D.
export function alertasFMECA(fallas, embsById) {
  const result = [];
  for (const f of fallas || []) {
    const rpn = (f.severidad || 0) * (f.ocurrencia || 0) * (f.deteccion || 0);
    if (rpn < 125) continue;
    const nave = embsById.get(f.embarcacion_id)?.nombre || "—";
    result.push({
      cat: "fmeca", sev: rpn >= 200 ? "red" : "amber",
      titulo: `Riesgo ${rpn >= 200 ? "crítico" : "alto"} FMECA · ${f.modo} (RPN ${rpn})`,
      detalle: `${nave} · ${f.sistema} · ${f.accion ? `acción recomendada: ${f.accion}` : "sin acción de mitigación definida — define inspección, PM o rediseño"}`,
      ts: f.fecha,
    });
  }
  return result;
}

// 9) Calidad de datos ISO 14224: OTs sin codificación y sin valorizar.
export function alertasDatosISO(ots, embsById) {
  const result = [];
  for (const o of ots || []) {
    if (o.estado !== "cerrada") continue;
    const nave = embsById.get(o.embarcacion_id)?.nombre || "—";
    if (requiereCodigoFalla(o) && !o.modo_falla) {
      result.push({
        cat: "datos", sev: "amber",
        titulo: `OT sin codificación de falla · ${o.folio || ""}`,
        detalle: `${nave} · ${o.sistema || ""} · correctiva cerrada sin modo de falla ISO 14224 — Pareto y MTBF la pierden`,
        ts: o.cerrada_fecha || o.fecha, ref: o.id,
      });
    }
    if (sinValorizar(o)) {
      result.push({
        cat: "datos", sev: "amber",
        titulo: `OT sin valorizar · ${o.folio || ""}`,
        detalle: `${nave} · ${o.sistema || ""} · cerrada sin costos de MO/materiales — el costo real del mantenimiento queda subestimado`,
        ts: o.cerrada_fecha || o.fecha, ref: o.id,
      });
    }
  }
  return result;
}

// 10) Varadas: atrasadas (fecha_fin_estimada vencida) o sin iniciar.
export function alertasVaradas(varadas, embsById, hoy) {
  const hoyISO = hoy || new Date().toISOString().slice(0, 10);
  const result = [];
  for (const v of varadas || []) {
    const nave = embsById.get(v.embarcacion_id)?.nombre || "—";
    if (v.estado === "ejecucion" && v.fecha_fin_estimada && v.fecha_fin_estimada < hoyISO) {
      const dias = Math.round(
        (new Date(hoyISO + "T00:00:00") - new Date(v.fecha_fin_estimada + "T00:00:00")) / DIA_MS
      );
      result.push({
        cat: "varada", sev: "red",
        titulo: `Varada atrasada · ${v.nombre}`,
        detalle: `${nave} · lleva ${dias} día${dias !== 1 ? "s" : ""} sobre el plan (fin estimado ${v.fecha_fin_estimada}) · actualiza la fecha o cierra la varada`,
        ts: v.fecha_fin_estimada,
      });
    } else if (v.estado === "planificacion" && v.fecha_inicio && v.fecha_inicio <= hoyISO) {
      result.push({
        cat: "varada", sev: "amber",
        titulo: `Varada sin iniciar · ${v.nombre}`,
        detalle: `${nave} · fecha de inicio ${v.fecha_inicio} ya pasó — cambia el estado a "En ejecución" si los trabajos comenzaron`,
        ts: v.fecha_inicio,
      });
    }
  }
  return result;
}

// 11-13) Horómetros: sin lectura reciente (A), herencia huérfana (B), coherencia PM (C).
export function alertasHorometros(equipos, lecturas, planesEval, embsById) {
  const byIdH = new Map((equipos || []).map((e) => [e.id, e]));
  const result = [];

  // A — puntos con horómetro propio sin lectura reciente (ISO 14224 §9.4)
  const ultimaDe = (id) => (lecturas || []).find((l) => l.equipo_id === id);
  for (const eq of equipos || []) {
    if (eq.horometro !== "propio" || eq.tipo_nodo === "sistema") continue;
    const ultima = ultimaDe(eq.id);
    const dias = diasDesde(ultima?.fecha);
    const nave = embsById.get(eq.embarcacion_id)?.nombre || "—";
    if (dias == null || dias > 30) {
      result.push({ cat: "horometro", sev: "red",
        titulo: `Sin lectura de horómetro · ${eq.sistema}`,
        detalle: `${nave} · ${eq.id_visible} · ${dias == null ? "nunca registrada" : `última hace ${Math.round(dias)} días`} — ingresar en Horómetros`,
        ts: ultima?.fecha || eq.updated_at });
    } else if (dias > 7) {
      result.push({ cat: "horometro", sev: "amber",
        titulo: `Lectura de horómetro atrasada · ${eq.sistema}`,
        detalle: `${nave} · ${eq.id_visible} · última hace ${Math.round(dias)} días (objetivo ≤7 días) — ingresar en Horómetros`,
        ts: ultima?.fecha });
    }
  }

  // B — herencia huérfana: "hereda" sin ascendiente con horómetro propio
  for (const e of equipos || []) {
    if ((e.horometro || "hereda") !== "hereda" || e.tipo_nodo === "sistema") continue;
    if (puntoHorometro(e, byIdH) === null) {
      const nave = embsById.get(e.embarcacion_id)?.nombre || "—";
      result.push({ cat: "horometro", sev: "amber",
        titulo: `Herencia de horómetro sin resolver · ${e.sistema}`,
        detalle: `${nave} · ${e.id_visible} · "hereda" pero ningún ascendiente tiene horómetro propio — configurar en Equipos`,
        ts: e.updated_at });
    }
  }

  // C — coherencia PM/horómetro: horas_ult_pm > horas_actual → datos inconsistentes
  for (const r of planesEval || []) {
    if (r.esCalendario || !r.equipo) continue;
    const eq = r.equipo;
    const ptoId = puntoHorometro(eq, byIdH);
    const pto = ptoId ? byIdH.get(ptoId) : null;
    const horasAct = Number(pto?.horas_actual ?? 0);
    const hPM = Number(r.plan?.horas_ult_pm ?? 0);
    if (hPM > 0 && horasAct > 0 && hPM > horasAct) {
      const nave = embsById.get(eq.embarcacion_id)?.nombre || "—";
      result.push({ cat: "horometro", sev: "amber",
        titulo: `Horómetro inconsistente con PM · ${r.plan.descripcion}`,
        detalle: `${nave} · ${eq.sistema} · último PM a ${num(hPM, 0)} h pero horómetro actual es ${num(horasAct, 0)} h`,
        ts: r.plan?.fecha_ult_pm || eq.updated_at });
    }
  }

  return result;
}

// IA-A…D: calidad de datos que alimentan módulos de inteligencia.
export function alertasIA(equipos, ots, mediciones) {
  const result = [];

  // IA-A: equipos sin criticidad → scoring de riesgo degradado
  const sinCrit = (equipos || []).filter((e) => !e.criticidad && e.tipo_nodo !== "sistema");
  if (sinCrit.length > 5) {
    result.push({ cat: "ia", sev: sinCrit.length > 20 ? "red" : "amber",
      titulo: `${sinCrit.length} equipos sin criticidad — scoring de riesgo degradado`,
      detalle: `InformeEjecutivo y CopilotoFlota no priorizan correctamente sin A/B/C — configurar criticidad en módulo Equipos`,
      ts: null });
  }

  // IA-B: OTs correctivas sin modo_falla ISO 14224
  const otsCorrCerr = (ots || []).filter((o) => o.estado === "cerrada" && o.tipo === "correctivo");
  if (otsCorrCerr.length >= 5) {
    const sinModo = otsCorrCerr.filter((o) => !o.modo_falla).length;
    const pct = Math.round((sinModo / otsCorrCerr.length) * 100);
    if (pct > 30) {
      result.push({ cat: "ia", sev: pct > 60 ? "red" : "amber",
        titulo: `Historial ISO al ${100 - pct}% — DiagnosticoFallas trabaja con datos incompletos`,
        detalle: `${sinModo} de ${otsCorrCerr.length} OTs correctivas sin modo_falla ISO 14224 · el motor de diagnóstico pierde el patrón histórico de falla por cada OT sin codificar`,
        ts: null });
    }
  }

  // IA-C: equipos críticos A con <4 OTs correctivas → Weibull no puede ajustarse
  const eqCriticosA = (equipos || []).filter((e) => e.criticidad === "A");
  const sinPred = eqCriticosA.filter((eq) =>
    (ots || []).filter((o) => o.equipo_id === eq.id && o.tipo === "correctivo" && o.estado === "cerrada").length < 4
  );
  if (eqCriticosA.length > 0 && sinPred.length > 0) {
    result.push({ cat: "ia", sev: "amber",
      titulo: `${sinPred.length} equipo${sinPred.length !== 1 ? "s" : ""} crítico${sinPred.length !== 1 ? "s" : ""} A sin predicción Weibull`,
      detalle: `ConfiabilidadML requiere ≥4 OTs correctivas cerradas por equipo · sin ese historial no hay ajuste de distribución ni vida residual (RUL)`,
      ts: null });
  }

  // IA-D: series PdM sin medición reciente → contexto de condición perdido
  let pdmStale = 0;
  for (const serie of seriesPdM(mediciones || []).values()) {
    const d = diasDesde(serie[0]?.fecha);
    if (d == null || d > 30) pdmStale++;
  }
  if (pdmStale > 0) {
    result.push({ cat: "ia", sev: "amber",
      titulo: `${pdmStale} serie${pdmStale !== 1 ? "s" : ""} PdM sin datos recientes (>30 d)`,
      detalle: `DiagnosticoFallas y ConfiabilidadML pierden contexto de condición — ingresar mediciones en módulo PdM`,
      ts: null });
  }

  return result;
}

// IA-F: clima marítimo — condiciones actuales y temporal previsto en 48 h.
export function alertasClima(pronosticoClima, puertoBase) {
  const result = [];
  if (!pronosticoClima?.actual) return result;

  const precip6h = precipProximasHoras(pronosticoClima.horario, 6);
  const sem      = evaluarSemáforosOperacionales(pronosticoClima.actual, precip6h);
  const temporal = resumirAlertasTemporales(pronosticoClima.horario);
  const ev       = sem.zarpe;

  if (ev.nivel !== "verde") {
    result.push({
      cat: "clima", sev: ev.nivel === "rojo" ? "red" : "amber",
      titulo: `IA-F · ${ev.label} · ${pronosticoClima.puerto || puertoBase || "Puerto"}`,
      detalle: `Viento ${Math.round(pronosticoClima.actual.vientoKn ?? 0)} kn · oleaje ${Number(pronosticoClima.actual.oleajeM ?? 0).toFixed(1)} m · revisar antes de zarpar`,
      ts: pronosticoClima.actualizado || null,
    });
  }

  if (temporal.hayTemporal && temporal.peor?.ev.nivel !== "verde") {
    if (!result.some((a) => a.cat === "clima" && a.titulo.includes("Temporal"))) {
      result.push({
        cat: "clima", sev: temporal.peor.ev.nivel === "rojo" ? "red" : "amber",
        titulo: `IA-F · Temporal previsto · ${formatearHoraClima(temporal.peor.time)}`,
        detalle: `${temporal.etiqueta} · apoyo operacional, verificar Directemar`,
        ts: temporal.peor.time,
      });
    }
  }

  if (ev.nivel !== "verde" || temporal.hayTemporal) {
    result.push({
      cat: "ia",
      sev: ev.nivel === "rojo" || temporal.peor?.ev.nivel === "rojo" ? "red" : "amber",
      titulo: "IA-F · Vigilancia meteorológica activa",
      detalle: temporal.etiqueta || `${ev.label} en condiciones actuales`,
      ts: pronosticoClima.actualizado || null,
    });
  }

  return result;
}

// ── Punto de entrada ─────────────────────────────────────────────────────────

export function generarAlertas({
  embarcaciones    = [],
  equipos          = [],
  items            = [],
  stock            = [],
  ots              = [],
  solicitudes      = [],
  compras          = [],
  prezarpes        = [],
  documentos       = [],
  planesEval       = [],
  mediciones       = [],
  fallas           = [],
  destinos         = [],
  varadas          = [],
  lecturas         = [],
  pronosticoClima  = null,
  empresa          = null,
  hoy              = new Date().toISOString().slice(0, 10),
} = {}) {
  const embsById = new Map((embarcaciones || []).map((e) => [e.id, e]));

  const all = [
    ...alertasPM(planesEval, embsById),
    ...alertasPdM(mediciones, equipos, embsById),
    ...alertasStock(items, stock, destinos, equipos),
    ...alertasOTs(ots, embsById),
    ...alertasSLA(solicitudes, embsById),
    ...alertasEquipos(equipos, embsById),
    ...alertasCompras(compras),
    ...alertasConsumoAceite(prezarpes, equipos, embsById),
    ...alertasDocumentos(documentos, embsById, hoy),
    ...alertasFMECA(fallas, embsById),
    ...alertasDatosISO(ots, embsById),
    ...alertasVaradas(varadas, embsById, hoy),
    ...alertasHorometros(equipos, lecturas, planesEval, embsById),
    ...alertasIA(equipos, ots, mediciones),
    ...alertasClima(pronosticoClima, empresa?.puerto_base),
  ];

  return all.sort((a, b) => {
    if (SEV_ORDER[a.sev] !== SEV_ORDER[b.sev]) return SEV_ORDER[a.sev] - SEV_ORDER[b.sev];
    return new Date(b.ts || 0).getTime() - new Date(a.ts || 0).getTime();
  });
}

/** Destino de navegación por categoría de alerta (header + módulo Alertas). */
export const ALERTA_NAV = {
  pm: "planpm", pdm: "pdm", stock: "inventario", ot: "ots", sla: "solicitudes",
  equipo: "equipos", consumo: "prezarpe", documento: "cumplimiento", compra: "almacen",
  fmeca: "fallas", datos: "ots", varada: "varada", horometro: "horometros",
  clima: "dashboard", ia: "equipos",
};

/** Spec compartido para useFleetData en Alertas y campana del header. */
export const ALERTAS_FLEET_SPEC = [
  { tabla: "embarcaciones", opts: { order: { col: "codigo", asc: true } } },
  "equipos",
  "inventario_items",
  "stock",
  "ordenes_trabajo",
  "solicitudes",
  "compras",
  { tabla: "prezarpes", opts: { order: { col: "fecha", asc: false } } },
  "documentos",
  "planes_pm",
  "mediciones_pdm",
  "fallas",
  "inventario_item_destinos",
  "varadas",
  { tabla: "lecturas_horometro", opts: { order: { col: "fecha", asc: false } } },
];
