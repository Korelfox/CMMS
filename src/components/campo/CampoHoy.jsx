import React, { useEffect, useState, useMemo, useCallback } from "react";
import { ClipboardList, Wrench, ChevronRight } from "lucide-react";
import { useAuth } from "../../lib/auth";
import { fetchAll } from "../../lib/db";
import { useShell } from "../../context/ShellContext";
import { filterByEmbarcacion } from "../../lib/embarcacionActiva";
import { evaluarPlanes } from "../../lib/pm";
import { C, tint, lk, PRIORIDADES, ESTADOS_OT } from "../../theme";
import { Card, Pill, primaryBtn, EmptyState, InlineSpinner } from "../../ui";

function prioTone(p) {
  if (p === "critica") return "red";
  if (p === "alta") return "amber";
  return "steel";
}

export default function CampoHoy({ onIrTrabajo, onNavigate }) {
  const { profile } = useAuth();
  const { embarcacionId, embarcacionActiva } = useShell();
  const nav = onNavigate;
  const [loading, setLoading] = useState(true);
  const [ots, setOts] = useState([]);
  const [planesEval, setPlanesEval] = useState([]);

  const cargar = useCallback(async () => {
    if (!embarcacionId) return;
    setLoading(true);
    try {
      const [o, eqs, pls] = await Promise.all([
        fetchAll("ordenes_trabajo", { order: { col: "fecha", asc: false } }),
        fetchAll("equipos"),
        fetchAll("planes_pm"),
      ]);
      const scoped = filterByEmbarcacion(o, embarcacionId);
      const eqScoped = filterByEmbarcacion(eqs, embarcacionId);
      setOts(scoped.filter((ot) => ot.estado !== "cerrada"));
      setPlanesEval(evaluarPlanes(pls, eqScoped).filter((r) => r.tone === "red" || r.tone === "yellow"));
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

  if (loading) return <InlineSpinner label="Cargando turno…" />;

  return (
    <div style={{ padding: "4px 0" }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: C.ink }}>
          Buenos días{profile?.nombre ? `, ${profile.nombre.split(" ")[0]}` : ""}
        </div>
        <div style={{ fontSize: 13, color: C.slate, marginTop: 4 }}>
          {embarcacionActiva?.codigo} · {embarcacionActiva?.nombre || "—"}
        </div>
      </div>

      {enEjecucion && (
        <Card style={{ marginBottom: 14, padding: 14, border: `1px solid ${tint(C.amber, 35)}`, background: tint(C.amber, 8) }}>
          <div style={{ fontSize: 12, color: C.slate, marginBottom: 6 }}>OT en ejecución</div>
          <div style={{ fontWeight: 700, color: C.ink }}>{enEjecucion.folio}</div>
          <div style={{ fontSize: 13, color: C.slate, marginTop: 4 }}>{enEjecucion.descripcion || enEjecucion.titulo || "—"}</div>
          <button type="button" onClick={() => onIrTrabajo?.(enEjecucion.id)} style={{ ...primaryBtn, marginTop: 10, width: "100%", justifyContent: "center" }}>
            Continuar checklist
          </button>
        </Card>
      )}

      {priorizadas.length === 0 && planesEval.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Sin trabajo pendiente" description="No hay OTs abiertas para esta embarcación hoy." />
      ) : (
        <>
          {priorizadas.slice(0, 5).map((ot) => (
            <button
              key={ot.id}
              type="button"
              onClick={() => onIrTrabajo?.(ot.id)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: 12,
                marginBottom: 8,
                borderRadius: 10,
                border: `1px solid ${C.line}`,
                background: C.surface,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <Pill tone={prioTone(ot.prioridad)}>{lk(PRIORIDADES, ot.prioridad)}</Pill>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 800, fontSize: 13, color: C.steel }}>{ot.folio}</span>
              </div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>{ot.descripcion || "—"}</div>
              <div style={{ fontSize: 12, color: C.slate, marginTop: 4 }}>{lk(ESTADOS_OT, ot.estado)}</div>
            </button>
          ))}

          {planesEval.slice(0, 3).map((pm) => (
            <button
              key={pm.plan.id}
              type="button"
              onClick={() => nav?.("planpm")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                width: "100%",
                textAlign: "left",
                padding: 12,
                marginBottom: 8,
                borderRadius: 10,
                border: `1px solid ${pm.tone === "red" ? tint(C.red, 30) : C.line}`,
                background: pm.tone === "red" ? C.redBg : C.yellowBg,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              <Wrench size={16} color={C.steel} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>PM · {pm.plan.descripcion}</div>
                <div style={{ fontSize: 11.5, color: C.slate }}>{pm.label}</div>
              </div>
              <ChevronRight size={16} color={C.slate} />
            </button>
          ))}
        </>
      )}

      <button type="button" onClick={() => nav?.("solicitudes")} style={{ ...primaryBtn, marginTop: 8, width: "100%", justifyContent: "center", background: "none", color: C.steel, border: `1px solid ${C.line}` }}>
        + Solicitud rápida
      </button>
    </div>
  );
}
