import React from "react";
import {
  ChevronRight, Layers, GitBranch, Wrench, Cpu, Box, AlertCircle,
} from "lucide-react";
import { C, tint, num } from "../../theme";
import { Pill } from "../../ui";
import { statusPlan, statusPlanCalendario, diasDesde } from "../../lib/pm";
import { TIPO_NODO_META } from "../../lib/plantillaPesquera";
import { usePlanPMData } from "./planpmStore";

const ICONO_TIPO = {
  sistema: Layers, subsistema: GitBranch,
  componente: Wrench, instrumento: Cpu, equipo: Box,
};

function ordenar(arr) {
  return [...arr].sort((a, b) => {
    const oa = a.orden == null ? Infinity : Number(a.orden);
    const ob = b.orden == null ? Infinity : Number(b.orden);
    if (oa !== ob) return oa - ob;
    return (a.id_visible || "").localeCompare(b.id_visible || "", "es");
  });
}

// Calcula vencidos/próximos/total de planes activos para un equipo.
function pmStats(eq, planes) {
  const ps = planes.filter((p) => p.equipo_id === eq.id && p.activo);
  let vencidos = 0, proximos = 0;
  ps.forEach((p) => {
    const esC = p.tipo_disparador === "calendario";
    const elapsed = esC
      ? diasDesde(p.fecha_ult_pm)
      : (eq.horas_actual || 0) - (p.horas_ult_pm || 0);
    const [tone] = esC
      ? statusPlanCalendario(elapsed, p.unidad_calendario, p.intervalo_calendario ?? 1)
      : statusPlan(elapsed, p.intervalo_horas);
    if (tone === "red")    vencidos++;
    if (tone === "yellow") proximos++;
  });
  return { total: ps.length, vencidos, proximos };
}

// ── Ventana de estructura PM para nodos agrupadores (sistema/subsistema) ──
// Muestra los hijos directos con su estado PM y permite hacer drill-down.
// handlersRef.current debe tener abrirPMWindowAdaptado(eq).
export default function PMEstructuraWindow({ equipoId, handlersRef }) {
  const { planes, equipos, embarcaciones } = usePlanPMData();
  const h = handlersRef.current;

  const eq = equipos.find((e) => e.id === equipoId);

  if (!eq) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10, padding: 40, color: C.slate }}>
        <AlertCircle size={28} color={C.line} />
        <span style={{ fontSize: 13 }}>Sistema no encontrado.</span>
      </div>
    );
  }

  const nave  = embarcaciones.find((v) => v.id === eq.embarcacion_id);
  const hijos = ordenar(equipos.filter((e) => e.parent_id === eq.id));

  // Totales agregados de los hijos (para el resumen de la cabecera)
  const agg = hijos.reduce((acc, c) => {
    const s = pmStats(c, planes);
    return { total: acc.total + s.total, vencidos: acc.vencidos + s.vencidos, proximos: acc.proximos + s.proximos };
  }, { total: 0, vencidos: 0, proximos: 0 });

  return (
    <div style={{ flex: 1, overflowY: "auto" }}>

      {/* ── Cabecera del sistema ── */}
      <div style={{ padding: "16px 22px 14px", borderBottom: `1px solid ${C.foam}`, background: C.mist }}>
        <div style={{ fontSize: 11.5, color: C.slate, fontFamily: "'IBM Plex Mono', monospace", marginBottom: 2 }}>
          {eq.id_visible}{nave ? ` · ${nave.nombre || nave.codigo}` : ""}
        </div>
        <div style={{ fontSize: 12, color: C.steel }}>
          {hijos.length} equipo{hijos.length !== 1 ? "s" : ""} en este sistema
        </div>
        {agg.total > 0 && (
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11.5, color: C.slate }}>PM:</span>
            {agg.vencidos > 0 && <Pill tone="red">{agg.vencidos} vencido{agg.vencidos > 1 ? "s" : ""}</Pill>}
            {agg.proximos > 0 && <Pill tone="yellow">{agg.proximos} próximo{agg.proximos > 1 ? "s" : ""}</Pill>}
            {agg.total - agg.vencidos - agg.proximos > 0 && (
              <Pill tone="green">{agg.total - agg.vencidos - agg.proximos} al día</Pill>
            )}
          </div>
        )}
      </div>

      {/* ── Lista de hijos ── */}
      <div style={{ padding: "16px 22px 24px" }}>
        {hijos.length === 0 ? (
          <div style={{ fontSize: 12.5, color: C.slate, fontStyle: "italic", lineHeight: 1.6 }}>
            Sin equipos en este sistema.<br />
            Agrégalos desde el módulo <strong>Equipos</strong>.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {hijos.map((child) => {
              const meta     = TIPO_NODO_META[child.tipo_nodo] || TIPO_NODO_META.equipo;
              const Ico      = ICONO_TIPO[child.tipo_nodo] || Box;
              const esGrupo  = child.tipo_nodo === "sistema" || child.tipo_nodo === "subsistema";
              const stats    = pmStats(child, planes);
              const nietos   = equipos.filter((e) => e.parent_id === child.id).length;
              const alertCol = stats.vencidos > 0 ? C.red : stats.proximos > 0 ? C.amber : null;

              return (
                <button key={child.id}
                  onClick={() => h.abrirPMWindowAdaptado(child)}
                  className="cmms-clickable"
                  style={{
                    display: "flex", alignItems: "center", gap: 12, width: "100%",
                    textAlign: "left", padding: "12px 14px", borderRadius: 10,
                    cursor: "pointer", fontFamily: "inherit",
                    border: `1px solid ${alertCol ? alertCol + "45" : C.line}`,
                    background: alertCol ? tint(alertCol, 5) : C.surface,
                    boxShadow: "0 1px 3px rgba(0,0,0,.05)",
                  }}>

                  {/* Ícono tipo */}
                  <div style={{ width: 36, height: 36, borderRadius: 9, background: tint(meta.color, 12), display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Ico size={17} color={meta.color} />
                  </div>

                  {/* Nombre + meta */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: C.abyss, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {child.sistema}
                    </div>
                    <div style={{ fontSize: 11.5, color: C.slate, fontFamily: "'IBM Plex Mono', monospace", marginTop: 1 }}>
                      {child.id_visible}
                      {!esGrupo && (child.horas_actual || 0) > 0
                        ? ` · ${num(child.horas_actual, 0)}h`
                        : esGrupo && nietos > 0 ? ` · ${nietos} dentro` : ""}
                    </div>
                  </div>

                  {/* Estado PM */}
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                    {!esGrupo && stats.total === 0 && (
                      <span style={{ fontSize: 11, color: C.slate, fontStyle: "italic" }}>Sin planes</span>
                    )}
                    {stats.vencidos > 0 && <Pill tone="red">{stats.vencidos} vencido{stats.vencidos > 1 ? "s" : ""}</Pill>}
                    {stats.proximos > 0 && <Pill tone="yellow">{stats.proximos} próx.</Pill>}
                    {stats.total > 0 && stats.vencidos === 0 && stats.proximos === 0 && (
                      <Pill tone="green">{stats.total} al día</Pill>
                    )}
                  </div>

                  <ChevronRight size={16} color={C.slate} style={{ flexShrink: 0 }} />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
