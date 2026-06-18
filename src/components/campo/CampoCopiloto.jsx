import React, { useEffect, useState, useMemo, useCallback } from "react";
import { Bot, ChevronRight, Sparkles } from "lucide-react";
import { fetchAll } from "../../lib/db";
import { useShell } from "../../context/ShellContext";
import { filterByEmbarcacion } from "../../lib/embarcacionActiva";
import { evaluarPlanes } from "../../lib/pm";
import { C, tint } from "../../theme";
import { primaryBtn } from "../../ui";
import { sugerirSiguienteAccion, alertasParaEmbarcacion } from "../../lib/campoAccion";
import { navigateFromAlerta } from "../../lib/alertaNav";

export default function CampoCopiloto({ onIrOT, onNavigate }) {
  const { embarcacionId, appMode } = useShell();
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
      setAlertas(alertasParaEmbarcacion({
        ordenes_trabajo: o,
        equipos: eqs,
        planes_pm: pls,
        solicitudes,
        inventario_items: items,
        stock,
        inventario_item_destinos: destinos,
        embarcaciones: [],
      }, embarcacionId, null));
    } finally {
      setLoading(false);
    }
  }, [embarcacionId]);

  useEffect(() => { cargar(); }, [cargar]);

  const enEjecucion = ots.find((o) => o.estado === "en_ejecucion");

  const siguienteAccion = useMemo(
    () => sugerirSiguienteAccion({ ots, planesEval, enEjecucion, alertas, embarcacionId }),
    [ots, planesEval, enEjecucion, alertas, embarcacionId],
  );

  function ejecutar() {
    if (!siguienteAccion) return;
    if (siguienteAccion.kind === "ot_continue" || siguienteAccion.kind === "ot_start") {
      onIrOT?.(siguienteAccion.otId);
      return;
    }
    if (siguienteAccion.alerta) {
      navigateFromAlerta(onNavigate, siguienteAccion.alerta, { appMode, embarcacionId });
      return;
    }
    onNavigate?.(siguienteAccion.destino, siguienteAccion.params);
  }

  if (loading || !siguienteAccion) return null;

  return (
    <div
      style={{
        marginBottom: 16,
        padding: 14,
        borderRadius: 14,
        border: `1px solid ${tint(C.sky, 30)}`,
        background: `linear-gradient(135deg, ${tint(C.sky, 8)} 0%, ${C.surface} 100%)`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10, background: tint(C.sky, 14),
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <Bot size={18} color={C.sky} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: C.sky }}>
            Copiloto
          </div>
          <div style={{ fontSize: 12.5, color: C.slate, marginTop: 1 }}>Siguiente acción sugerida</div>
        </div>
        <Sparkles size={15} color={C.steel} style={{ flexShrink: 0, opacity: 0.7 }} />
      </div>
      <div style={{ fontWeight: 800, fontSize: 15, color: C.ink, lineHeight: 1.35 }}>{siguienteAccion.titulo}</div>
      <div style={{ fontSize: 13, color: C.slate, marginTop: 5, lineHeight: 1.45 }}>{siguienteAccion.detalle}</div>
      {siguienteAccion.razon && (
        <div style={{ fontSize: 12, color: C.steel, marginTop: 8, lineHeight: 1.4 }}>{siguienteAccion.razon}</div>
      )}
      <button
        type="button"
        onClick={ejecutar}
        className="cmms-campo-touch"
        style={{ ...primaryBtn, marginTop: 12, width: "100%", justifyContent: "center" }}
      >
        {siguienteAccion.cta} <ChevronRight size={16} />
      </button>
    </div>
  );
}
