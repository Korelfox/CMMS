import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Search, Wrench, ClipboardList, ChevronRight, ArrowLeft } from "lucide-react";
import { useShell } from "../../context/ShellContext";
import { fetchAll } from "../../lib/db";
import { filterByEmbarcacion } from "../../lib/embarcacionActiva";
import { C, tint, lk, ESTADOS_OT, estadoLabel } from "../../theme";
import { Card, Pill, EmptyState, InlineSpinner, ghostBtn, primaryBtn, inputStyle } from "../../ui";
import TaskCard from "./TaskCard";

export default function CampoActivos({ onIrTrabajo, onNavigate }) {
  const { embarcacionId, embarcacionActiva } = useShell();
  const [equipos, setEquipos] = useState([]);
  const [ots, setOts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [selId, setSelId] = useState(null);

  const cargar = useCallback(async () => {
    if (!embarcacionId) return;
    setLoading(true);
    try {
      const [eqs, otsAll] = await Promise.all([
        fetchAll("equipos", { order: { col: "id_visible", asc: true } }),
        fetchAll("ordenes_trabajo", { order: { col: "fecha", asc: false } }),
      ]);
      setEquipos(filterByEmbarcacion(eqs, embarcacionId));
      setOts(filterByEmbarcacion(otsAll, embarcacionId).filter((o) => o.estado !== "cerrada"));
    } finally {
      setLoading(false);
    }
  }, [embarcacionId]);

  useEffect(() => { cargar(); }, [cargar]);

  const otsPorEquipo = useMemo(() => {
    const m = new Map();
    for (const ot of ots) {
      if (!ot.equipo_id) continue;
      m.set(ot.equipo_id, (m.get(ot.equipo_id) || 0) + 1);
    }
    return m;
  }, [ots]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return equipos.slice(0, 40);
    return equipos.filter((e) =>
      [e.id_visible, e.sistema, e.subsistema, e.tag].some((x) => String(x || "").toLowerCase().includes(q)),
    ).slice(0, 30);
  }, [equipos, busca]);

  const sel = equipos.find((e) => e.id === selId);

  if (loading) return <InlineSpinner label="Cargando activos…" />;

  if (sel) {
    const nOt = otsPorEquipo.get(sel.id) || 0;
    const otsEq = ots.filter((o) => o.equipo_id === sel.id).slice(0, 3);
    return (
      <div className="cmms-campo-polish">
        <button type="button" onClick={() => setSelId(null)} className="cmms-campo-touch" style={{ ...ghostBtn, marginBottom: 12 }}>
          <ArrowLeft size={16} /> Buscar otro activo
        </button>
        <Card style={{ padding: 16, marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: C.slate, marginBottom: 4 }}>{embarcacionActiva?.codigo}</div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 20, fontWeight: 800, color: C.steel }}>
            {sel.id_visible || "—"}
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, color: C.ink, marginTop: 8 }}>{sel.sistema || "Sin sistema"}</div>
          {sel.subsistema && <div style={{ fontSize: 14, color: C.slate, marginTop: 4 }}>{sel.subsistema}</div>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
            <Pill tone={sel.estado === "operativo" ? "green" : sel.estado === "fuera_servicio" ? "red" : "amber"}>
              {estadoLabel(sel.estado)}
            </Pill>
            {sel.criticidad && <Pill tone={sel.criticidad === "A" ? "red" : sel.criticidad === "B" ? "amber" : "steel"}>Crit. {sel.criticidad}</Pill>}
            {nOt > 0 && <Pill tone="amber">{nOt} OT{nOt !== 1 ? "s" : ""} abierta{nOt !== 1 ? "s" : ""}</Pill>}
          </div>
        </Card>
        {otsEq.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.slate, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
              OTs abiertas
            </div>
            {otsEq.map((ot) => (
              <TaskCard
                key={ot.id}
                badge={ot.folio}
                title={ot.descripcion || "—"}
                meta={lk(ESTADOS_OT, ot.estado) || ot.estado}
                cta="Abrir en Trabajo"
                onClick={() => onIrTrabajo?.(ot.id)}
              />
            ))}
          </div>
        )}
        <button
          type="button"
          className="cmms-campo-touch"
          style={{ ...primaryBtn, width: "100%", justifyContent: "center" }}
          onClick={() => onNavigate?.("equipos", { campo: true, equipoId: sel.id, embFiltro: embarcacionId })}
        >
          Ficha completa <ChevronRight size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="cmms-campo-polish">
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: C.ink }}>Activos</div>
        <div style={{ fontSize: 14, color: C.slate, marginTop: 4 }}>
          {embarcacionActiva?.nombre || "—"} · busca equipo por ID o sistema
        </div>
      </div>
      <div style={{ position: "relative", marginBottom: 14 }}>
        <Search size={18} color={C.slate} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" }} />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="MP-01, motor, hidráulico…"
          className="cmms-campo-touch"
          style={{ ...inputStyle(), paddingLeft: 42, fontSize: 16, minHeight: 48 }}
        />
      </div>
      {filtrados.length === 0 ? (
        <EmptyState icon={Wrench} title="Sin resultados" description="Prueba otro término de búsqueda." />
      ) : (
        filtrados.map((eq) => (
          <TaskCard
            key={eq.id}
            badge={eq.id_visible}
            title={eq.sistema || "—"}
            subtitle={eq.subsistema}
            meta={
              (otsPorEquipo.get(eq.id) || 0) > 0
                ? `${otsPorEquipo.get(eq.id)} OT abierta${otsPorEquipo.get(eq.id) !== 1 ? "s" : ""}`
                : estadoLabel(eq.estado)
            }
            tone={eq.estado === "fuera_servicio" ? "red" : eq.criticidad === "A" ? "amber" : "steel"}
            onClick={() => setSelId(eq.id)}
          />
        ))
      )}
      <button
        type="button"
        className="cmms-campo-touch"
        style={{ ...ghostBtn, width: "100%", justifyContent: "center", marginTop: 8 }}
        onClick={() => onNavigate?.("equipos", { campo: true, embFiltro: embarcacionId })}
      >
        <ClipboardList size={16} /> Explorar árbol completo
      </button>
    </div>
  );
}
