import React, { useEffect, useState, useMemo, useCallback } from "react";
import { ClipboardList, ChevronRight, Bot, Sparkles } from "lucide-react";
import { useAuth } from "../../lib/auth";
import { fetchAll } from "../../lib/db";
import { useShell } from "../../context/ShellContext";
import { filterByEmbarcacion } from "../../lib/embarcacionActiva";
import { evaluarPlanes } from "../../lib/pm";
import { C, tint, lk, PRIORIDADES, ESTADOS_OT } from "../../theme";
import { Card, Pill, primaryBtn, EmptyState, InlineSpinner } from "../../ui";
import { sugerirSiguienteAccion, alertasParaEmbarcacion } from "../../lib/campoAccion";
import { navigateFromAlerta } from "../../lib/alertaNav";
import TaskCard from "./TaskCard";
import ProgressStrip from "./ProgressStrip";

function prioTone(p) {
  if (p === "critica") return "red";
  if (p === "alta") return "amber";
  return "steel";
}

export default function CampoHoy({ onIrTrabajo, onNavigate }) {
  const { profile } = useAuth();
  const { embarcacionId, embarcacionActiva, appMode } = useShell();
  const nav = onNavigate;
  const [loading, setLoading] = useState(true);
  const [ots, setOts] = useState([]);
  const [planesEval, setPlanesEval] = useState([]);
  const [alertas, setAlertas] = useState([]);

  const cargar = useCallback(async () => {
    if (!embarcacionId) return;
    setLoading(true);
    try {
      const [o, eqs, pls, solicitudes, items, stock, destinos] = await Promise.all([
        fetchAll("ordenes_trabajo", { order: { col: "fecha", asc: false } }),
        fetchAll("equipos"),
        fetchAll("planes_pm"),
        fetchAll("solicitudes", { order: { col: "created_at", asc: false } }),
        fetchAll("inventario_items"),
        fetchAll("stock"),
        fetchAll("inventario_item_destinos"),
      ]);
      const scoped = filterByEmbarcacion(o, embarcacionId);
      const eqScoped = filterByEmbarcacion(eqs, embarcacionId);
      setOts(scoped.filter((ot) => ot.estado !== "cerrada"));
      setPlanesEval(evaluarPlanes(pls, eqScoped).filter((r) => r.tone === "red" || r.tone === "yellow"));
      const raw = {
        ordenes_trabajo: o,
        equipos: eqs,
        planes_pm: pls,
        solicitudes,
        inventario_items: items,
        stock,
        inventario_item_destinos: destinos,
        embarcaciones: [],
      };
      setAlertas(alertasParaEmbarcacion(raw, embarcacionId, null));
    } finally {
      setLoading(false);
    }
  }, [embarcacionId]);

  useEffect(() => { cargar(); }, [cargar]);

  const priorizadas = useMemo(() => {
    const order = { critica: 0, alta: 1, media: 2, baja: 3 };
    return [...ots].sort((a, b) => (order[a.prioridad] ?? 9) - (order[b.prioridad] ?? 9));
  }, [ots]);

  const enEjecucion = ots.find((o) => o.estado === "en_ejecucion");

  const siguienteAccion = useMemo(
    () => sugerirSiguienteAccion({ ots, planesEval, enEjecucion, alertas, embarcacionId }),
    [ots, planesEval, enEjecucion, alertas, embarcacionId],
  );

  function ejecutarSiguienteAccion() {
    if (!siguienteAccion) return;
    if (siguienteAccion.kind === "ot_continue" || siguienteAccion.kind === "ot_start") {
      onIrTrabajo?.(siguienteAccion.otId);
      return;
    }
    if (siguienteAccion.alerta) {
      navigateFromAlerta(nav, siguienteAccion.alerta, { appMode, embarcacionId });
      return;
    }
    nav?.(siguienteAccion.destino, siguienteAccion.params);
  }

  if (loading) return <InlineSpinner label="Cargando turno…" />;

  return (
    <div className="cmms-campo-polish" style={{ padding: "4px 0" }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: C.ink }}>
          Buenos días{profile?.nombre ? `, ${profile.nombre.split(" ")[0]}` : ""}
        </div>
        <div style={{ fontSize: 13, color: C.slate, marginTop: 4 }}>
          {embarcacionActiva?.codigo} · {embarcacionActiva?.nombre || "—"}
        </div>
      </div>

      {siguienteAccion && (
        <Card style={{ marginBottom: 14, padding: 14, border: `1px solid ${tint(C.sky, 35)}`, background: tint(C.sky, 6) }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Bot size={18} color={C.sky} />
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: C.sky }}>Copiloto · Siguiente acción</span>
            <Sparkles size={14} color={C.steel} style={{ marginLeft: "auto" }} />
          </div>
          <div style={{ fontWeight: 800, fontSize: 15, color: C.ink }}>{siguienteAccion.titulo}</div>
          <div style={{ fontSize: 12.5, color: C.slate, marginTop: 4, lineHeight: 1.4 }}>{siguienteAccion.detalle}</div>
          {siguienteAccion.razon && (
            <div style={{ fontSize: 11.5, color: C.steel, marginTop: 8, fontStyle: "italic", lineHeight: 1.4 }}>{siguienteAccion.razon}</div>
          )}
          <button type="button" onClick={ejecutarSiguienteAccion} className="cmms-campo-touch" style={{ ...primaryBtn, marginTop: 12, width: "100%", justifyContent: "center" }}>
            {siguienteAccion.cta} <ChevronRight size={16} />
          </button>
        </Card>
      )}

      {enEjecucion && siguienteAccion?.kind !== "ot_continue" && (() => {
        const pasos = Array.isArray(enEjecucion.checklist) ? enEjecucion.checklist : [];
        const hechos = pasos.filter((p) => p.ok).length;
        return (
          <Card style={{ marginBottom: 14, padding: 14, border: `1px solid ${tint(C.amber, 35)}`, background: tint(C.amber, 8) }}>
            <div style={{ fontSize: 12, color: C.slate, marginBottom: 6 }}>OT en ejecución</div>
            <div style={{ fontWeight: 700, fontSize: 16, color: C.ink }}>{enEjecucion.folio}</div>
            <div style={{
              fontSize: 14, color: C.slate, marginTop: 4, lineHeight: 1.4,
              overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
              overflowWrap: "anywhere",
            }}>{enEjecucion.descripcion || enEjecucion.titulo || "—"}</div>
            {pasos.length > 0 && (
              <ProgressStrip current={hechos} total={pasos.length} label="Checklist" />
            )}
            <button type="button" className="cmms-campo-touch" onClick={() => onIrTrabajo?.(enEjecucion.id)} style={{ ...primaryBtn, marginTop: 6, width: "100%", justifyContent: "center" }}>
              Continuar checklist
            </button>
          </Card>
        );
      })()}

      {priorizadas.length === 0 && planesEval.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Sin trabajo pendiente" description="No hay OTs abiertas para esta embarcación hoy." />
      ) : (
        <>
          {priorizadas.slice(0, 5).map((ot) => (
            <TaskCard
              key={ot.id}
              tone={prioTone(ot.prioridad)}
              badgeLabel={lk(PRIORIDADES, ot.prioridad)}
              badge={ot.folio}
              title={ot.sistema || ot.folio}
              subtitle={ot.descripcion || undefined}
              meta={lk(ESTADOS_OT, ot.estado)}
              onClick={() => onIrTrabajo?.(ot.id)}
            />
          ))}

          {planesEval.slice(0, 3).map((pm) => (
            <TaskCard
              key={pm.plan.id}
              tone={pm.tone === "red" ? "red" : "amber"}
              badgeLabel="PM"
              title={pm.plan.descripcion}
              subtitle={pm.label}
              onClick={() => nav?.("planpm", { campo: true, filtro: embarcacionId, tab: "plan", planId: pm.plan.id })}
            />
          ))}
        </>
      )}

      <button type="button" className="cmms-campo-touch" onClick={() => nav?.("solicitudes", { campo: true })} style={{ ...primaryBtn, marginTop: 8, width: "100%", justifyContent: "center", background: "none", color: C.steel, border: `1px solid ${C.line}` }}>
        + Solicitud rápida
      </button>
    </div>
  );
}
