import React, { useEffect, useState, useMemo, useCallback } from "react";
import { ClipboardList, CalendarDays, ChevronDown } from "lucide-react";
import { useAuth } from "../../lib/auth";
import { fetchAll } from "../../lib/db";
import { useShell } from "../../context/ShellContext";
import { filterByEmbarcacion } from "../../lib/embarcacionActiva";
import { C, tint, lk, ESTADOS_OT, num } from "../../theme";
import { EmptyState, InlineSpinner, ghostBtn } from "../../ui";
import { agruparProgramacion, labelProgFecha, describeOtCampo } from "../../lib/campoHoy";
import TaskCard from "./TaskCard";
import CampoSection from "./CampoSection";
import CampoTiempoWidget from "./CampoTiempoWidget";
import { hoyLocal } from "../../lib/fechas";

const HOY = () => hoyLocal();

/** Fila-indicador colapsable para grupos secundarios (atrasadas / próximas). */
function IndicadorRow({ tone, label, abierto, onClick }) {
  const color = tone === "red" ? C.red : C.steel;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={abierto}
      className="cmms-campo-touch"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        padding: "12px 14px",
        marginBottom: 8,
        borderRadius: 12,
        border: `1px solid ${tint(color, 35)}`,
        background: abierto ? tint(color, 10) : C.surface,
        cursor: "pointer",
        fontFamily: "inherit",
        textAlign: "left",
      }}
    >
      <span style={{ width: 9, height: 9, borderRadius: "50%", background: color, flexShrink: 0 }} />
      <span style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>{label}</span>
      <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, fontWeight: 700, color }}>
        {abierto ? "Ocultar" : "Ver"}
        <ChevronDown size={16} style={{ transform: abierto ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
      </span>
    </button>
  );
}

export default function CampoHoy({ onIrTrabajo }) {
  const { profile } = useAuth();
  const { embarcacionId, embarcacionActiva } = useShell();
  const [loading, setLoading] = useState(true);
  const [todasOts, setTodasOts] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [programacion, setProgramacion] = useState([]);
  const [expandido, setExpandido] = useState(null); // null | "atrasadas" | "proximas"

  const cargar = useCallback(async () => {
    if (!embarcacionId) return;
    setLoading(true);
    try {
      const [o, prog, eqs] = await Promise.all([
        fetchAll("ordenes_trabajo", { order: { col: "fecha", asc: false } }),
        fetchAll("programacion", { order: { col: "fecha_programada", asc: true } }),
        fetchAll("equipos"),
      ]);
      const scoped = filterByEmbarcacion(o, embarcacionId);
      setTodasOts(scoped);
      setProgramacion(filterByEmbarcacion(prog, embarcacionId));
      setEquipos(filterByEmbarcacion(eqs, embarcacionId));
    } finally {
      setLoading(false);
    }
  }, [embarcacionId]);

  useEffect(() => { cargar(); }, [cargar]);

  const hoy = HOY();

  // Una tarea programada cuenta como cerrada si su OT vinculada ya está cerrada,
  // aunque su flag `done` no se haya sincronizado. Así no aparece como atrasada.
  const folioCerrado = useMemo(() => {
    const s = new Set();
    todasOts.forEach((ot) => { if (ot.estado === "cerrada" && ot.folio) s.add(ot.folio); });
    return s;
  }, [todasOts]);
  const progCompletada = useCallback(
    (item) => !!item.done || (!!item.ot_folio && folioCerrado.has(item.ot_folio)),
    [folioCerrado],
  );
  const prog = useMemo(() => agruparProgramacion(programacion, hoy, progCompletada), [programacion, hoy, progCompletada]);

  const otPorFolio = useMemo(() => {
    const m = new Map();
    todasOts.forEach((ot) => { if (ot.folio) m.set(ot.folio, ot); });
    return m;
  }, [todasOts]);

  const equipoPorId = useMemo(() => {
    const m = new Map();
    equipos.forEach((eq) => m.set(eq.id, eq));
    return m;
  }, [equipos]);

  function abrirOt(id) {
    if (id) onIrTrabajo?.(id);
  }

  function abrirProg(item) {
    const ot = item.ot_folio ? otPorFolio.get(item.ot_folio) : null;
    if (ot) abrirOt(ot.id);
    else onIrTrabajo?.(null);
  }

  function renderProgCard(item) {
    const f = (item.fecha_programada || "").slice(0, 10);
    const esAtrasada = f < hoy;
    const esHoy = f === hoy;
    const ot = item.ot_folio ? otPorFolio.get(item.ot_folio) : null;
    const eq = ot?.equipo_id ? equipoPorId.get(ot.equipo_id) : null;
    const d = ot ? describeOtCampo(ot, eq, equipoPorId) : null;
    const chip = item.ot_folio
      ? ot
        ? { label: lk(ESTADOS_OT, ot.estado), tone: ot.estado === "en_ejecucion" ? "amber" : "steel" }
        : { label: "Sin OT", tone: "steel" }
      : null;
    return (
      <TaskCard
        key={item.id}
        tone={esAtrasada ? "red" : esHoy ? "steel" : "green"}
        badge={item.ot_folio || "—"}
        badgeLabel={item.tipo || "Tarea"}
        chip={chip}
        lineaEquipo={d?.lineaEquipo || undefined}
        title={d?.titulo || item.sistema || "Sin sistema"}
        subtitle={d?.trabajo || `${labelProgFecha(item.fecha_programada, hoy)} · ${num(item.hh, 1)} h`}
        meta={esAtrasada ? "Atrasada" : esHoy ? "Programada hoy" : "Próxima"}
        cta={ot ? "Abrir OT" : "Ir a Trabajo"}
        onClick={() => abrirProg(item)}
      />
    );
  }

  const totalProg = prog.hoy.length + prog.atrasadas.length + prog.proximas.length;
  const vacio = totalProg === 0;

  return (
    <div className="cmms-campo-polish" style={{ padding: "4px 0" }}>
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: C.ink, letterSpacing: -0.3 }}>
          Hoy
        </div>
        <div style={{ fontSize: 14, color: C.slate, marginTop: 4 }}>
          {embarcacionActiva?.codigo}
          {profile?.nombre ? ` · ${profile.nombre.split(" ")[0]}` : ""}
        </div>
      </div>

      <CampoTiempoWidget />

      {loading ? (
        <InlineSpinner label="Cargando turno…" />
      ) : vacio ? (
        <EmptyState
          icon={ClipboardList}
          title="Sin programación para hoy"
          description="No tienes tareas programadas. Entra a Trabajo para ver las órdenes."
        />
      ) : (
        <>
          {totalProg > 0 && (
            <>
              <CampoSection
                title="Programación"
                sub={prog.hoy.length > 0 ? `${prog.hoy.length} para hoy` : "Sin tareas para hoy"}
                style={{ marginTop: 12 }}
              />

              {prog.hoy.map(renderProgCard)}
              {prog.hoy.length === 0 && (
                <div style={{ fontSize: 13.5, color: C.slate, margin: "2px 0 12px" }}>
                  Nada programado para hoy.
                </div>
              )}

              {prog.atrasadas.length > 0 && (
                <IndicadorRow
                  tone="red"
                  label={`${prog.atrasadas.length} atrasada${prog.atrasadas.length !== 1 ? "s" : ""}`}
                  abierto={expandido === "atrasadas"}
                  onClick={() => setExpandido((e) => (e === "atrasadas" ? null : "atrasadas"))}
                />
              )}
              {expandido === "atrasadas" && prog.atrasadas.map(renderProgCard)}

              {prog.proximas.length > 0 && (
                <IndicadorRow
                  tone="steel"
                  label={`${prog.proximas.length} próxima${prog.proximas.length !== 1 ? "s" : ""}`}
                  abierto={expandido === "proximas"}
                  onClick={() => setExpandido((e) => (e === "proximas" ? null : "proximas"))}
                />
              )}
              {expandido === "proximas" && prog.proximas.map(renderProgCard)}
            </>
          )}
        </>
      )}

      {!loading && (
        <button
          type="button"
          className="cmms-campo-touch"
          onClick={() => onIrTrabajo?.(null)}
          style={{
            ...ghostBtn,
            width: "100%",
            justifyContent: "center",
            marginTop: 12,
            padding: "12px",
            borderRadius: 12,
          }}
        >
          <CalendarDays size={16} /> Ir a Trabajo
        </button>
      )}
    </div>
  );
}
