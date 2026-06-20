import React, { useEffect, useState, useMemo, useCallback } from "react";
import { ClipboardList, CalendarDays, ChevronRight } from "lucide-react";
import { useAuth } from "../../lib/auth";
import { fetchAll } from "../../lib/db";
import { useShell } from "../../context/ShellContext";
import { filterByEmbarcacion } from "../../lib/embarcacionActiva";
import { C, lk, PRIORIDADES, ESTADOS_OT, num } from "../../theme";
import { EmptyState, InlineSpinner, ghostBtn } from "../../ui";
import { ordenarOtsCampo, agruparProgramacion, labelProgFecha, describeOtCampo } from "../../lib/campoHoy";
import TaskCard from "./TaskCard";
import CampoSection from "./CampoSection";
import CampoTiempoWidget from "./CampoTiempoWidget";
import { hoyLocal } from "../../lib/fechas";

const HOY = () => hoyLocal();

function prioTone(p) {
  if (p === "critica") return "red";
  if (p === "alta") return "amber";
  return "steel";
}

function otTone(ot) {
  if (ot.estado === "en_ejecucion") return "amber";
  return prioTone(ot.prioridad);
}

export default function CampoHoy({ onIrTrabajo }) {
  const { profile } = useAuth();
  const { embarcacionId, embarcacionActiva } = useShell();
  const [loading, setLoading] = useState(true);
  const [ots, setOts] = useState([]);
  const [todasOts, setTodasOts] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [programacion, setProgramacion] = useState([]);

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
      setOts(scoped.filter((ot) => ot.estado !== "cerrada"));
      setProgramacion(filterByEmbarcacion(prog, embarcacionId));
      setEquipos(filterByEmbarcacion(eqs, embarcacionId));
    } finally {
      setLoading(false);
    }
  }, [embarcacionId]);

  useEffect(() => { cargar(); }, [cargar]);

  const hoy = HOY();
  const otsOrdenadas = useMemo(() => ordenarOtsCampo(ots), [ots]);

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

  const totalProg = prog.hoy.length + prog.atrasadas.length + prog.proximas.length;
  const vacio = otsOrdenadas.length === 0 && totalProg === 0;

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
          title="Turno al día"
          description="No hay OTs abiertas ni tareas programadas para hoy."
        />
      ) : (
        <>
          {totalProg > 0 && (
            <>
              <CampoSection
                title="Programación"
                sub={prog.atrasadas.length > 0 ? `${prog.atrasadas.length} atrasada${prog.atrasadas.length !== 1 ? "s" : ""}` : "Plan del turno"}
                style={{ marginTop: 12 }}
              />
              {[...prog.atrasadas, ...prog.hoy, ...prog.proximas].map((item) => {
                const esAtrasada = (item.fecha_programada || "").slice(0, 10) < hoy;
                const esHoy = (item.fecha_programada || "").slice(0, 10) === hoy;
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
                    onClick={() => abrirProg(item)}
                  />
                );
              })}
            </>
          )}

          {otsOrdenadas.length > 0 && (
            <>
              <CampoSection
                title="Órdenes de trabajo"
                sub={`${otsOrdenadas.length} abierta${otsOrdenadas.length !== 1 ? "s" : ""}`}
                style={{ marginTop: totalProg > 0 ? 16 : 12 }}
              />
              {otsOrdenadas.slice(0, 8).map((ot) => {
                const eq = ot.equipo_id ? equipoPorId.get(ot.equipo_id) : null;
                const d = describeOtCampo(ot, eq, equipoPorId);
                return (
                  <TaskCard
                    key={ot.id}
                    tone={otTone(ot)}
                    badge={ot.folio}
                    badgeLabel={ot.estado === "en_ejecucion" ? "En curso" : lk(PRIORIDADES, ot.prioridad)}
                    lineaEquipo={d.lineaEquipo || undefined}
                    title={d.titulo}
                    subtitle={d.trabajo || undefined}
                    meta={lk(ESTADOS_OT, ot.estado)}
                    onClick={() => abrirOt(ot.id)}
                  />
                );
              })}
              {otsOrdenadas.length > 8 && (
                <button
                  type="button"
                  className="cmms-campo-touch"
                  onClick={() => onIrTrabajo?.(null)}
                  style={{ ...ghostBtn, width: "100%", justifyContent: "center", marginBottom: 4 }}
                >
                  Ver las {otsOrdenadas.length} OTs en Trabajo <ChevronRight size={16} />
                </button>
              )}
            </>
          )}
        </>
      )}

      {!loading && !vacio && (
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
