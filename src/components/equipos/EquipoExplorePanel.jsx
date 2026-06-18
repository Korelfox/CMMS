import React, { useMemo } from "react";
import { Layers, GitBranch, Package, Clock, ChevronRight, Calendar } from "lucide-react";
import { C, num } from "../../theme";
import { TipoChip, CritBadge, RegistroBadge } from "./arbolUI";
import { requiereFechaInstalacionEquipo, tieneFechaInstalacion } from "../../lib/plantillaPesquera";
import { useEquiposData } from "./equiposStore";

export default function EquipoExplorePanel({ nodeId, onGestionar, onSelectNode }) {
  const { equipos, destinos } = useEquiposData();
  const node = equipos.find((e) => e.id === nodeId);

  const hijos = useMemo(
    () => equipos.filter((e) => e.parent_id === nodeId),
    [equipos, nodeId],
  );

  if (!nodeId || !node) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, padding: 40, color: C.slate, minHeight: 320, background: C.surface, borderRadius: 12, border: `1px solid ${C.line}` }}>
        <Layers size={36} color={C.line} />
        <div style={{ fontSize: 15, fontWeight: 700, color: C.abyss }}>Modo exploración</div>
        <p style={{ fontSize: 13, margin: 0, textAlign: "center", maxWidth: 320 }}>
          Selecciona un nodo en el árbol para ver un resumen de su estructura y datos clave.
        </p>
      </div>
    );
  }

  const nReps = destinos.filter((d) => d.equipo_id === node.id).length;
  const esAgrupador = node.tipo_nodo === "sistema";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 280px)", minHeight: 420, background: C.surface, borderRadius: 12, border: `1px solid ${C.line}`, overflow: "hidden" }}>
      <div style={{ padding: "18px 20px", borderBottom: `1px solid ${C.foam}` }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <TipoChip tipo={node.tipo_nodo} size={36} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.abyss }}>{node.sistema || "—"}</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: C.slate }}>{node.id_visible}</span>
              <RegistroBadge equipo={node} />
              <CritBadge crit={node.criticidad} />
            </div>
          </div>
          <button type="button" onClick={() => onGestionar?.(node.id)} style={{ fontSize: 12, fontWeight: 600, color: C.sky, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 4 }}>
            Gestionar <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 8, marginBottom: 16 }}>
          <Tile icon={GitBranch} label="Subequipos" value={hijos.length} />
          {!esAgrupador && node.horometro !== "no" && (
            <Tile icon={Clock} label="Horas" value={`${num(node.horas_actual || 0)} h`} />
          )}
          {!esAgrupador && requiereFechaInstalacionEquipo(node) && (
            <Tile icon={Calendar} label="Instalación" value={tieneFechaInstalacion(node) ? node.ficha.fecha_instalacion : "Pendiente"} />
          )}
          {!esAgrupador && <Tile icon={Package} label="Repuestos" value={nReps} />}
        </div>

        {(node.marca || node.modelo) && (
          <p style={{ fontSize: 13, color: C.slate, margin: "0 0 14px" }}>
            {[node.marca, node.modelo].filter(Boolean).join(" · ")}
          </p>
        )}

        {hijos.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.slate, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Elementos internos</div>
            {hijos.slice(0, 12).map((c) => (
              <button key={c.id} type="button" onClick={() => onSelectNode?.(c.id)}
                style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.line}`, background: C.surface, cursor: "pointer", fontFamily: "inherit" }}>
                <TipoChip tipo={c.tipo_nodo} size={26} />
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: C.abyss, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.sistema}</span>
                <ChevronRight size={14} color={C.slate} />
              </button>
            ))}
            {hijos.length > 12 && (
              <span style={{ fontSize: 12, color: C.slate }}>+ {hijos.length - 12} más en el árbol</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Tile({ icon: Icon, label, value }) {
  return (
    <div style={{ background: C.surface2, borderRadius: 8, padding: "10px 12px" }}>
      <div style={{ fontSize: 10, color: C.slate, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
        <Icon size={12} /> {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 800, color: C.abyss, marginTop: 4 }}>{value}</div>
    </div>
  );
}
