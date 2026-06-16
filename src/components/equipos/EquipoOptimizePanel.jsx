import React, { useMemo } from "react";
import { Target, Filter } from "lucide-react";
import { C, tint } from "../../theme";
import { ActionQueue, FilterBtn, ghostBtn } from "../../ui";
import { BRECHA_META } from "../../lib/equipoBrechas";

export default function EquipoOptimizePanel({
  analisis,
  filtroBrecha,
  setFiltroBrecha,
  onIrABrecha,
  embName,
}) {
  const itemsFiltrados = useMemo(() => {
    if (!filtroBrecha) return analisis.items;
    return analisis.items.filter((i) => i.tipo === filtroBrecha);
  }, [analisis.items, filtroBrecha]);

  const queueItems = useMemo(() => itemsFiltrados.map((item) => ({
    id: `${item.equipoId}-${item.tipo}`,
    label: item.equipo.sistema || item.equipo.id_visible,
    detail: `${item.equipo.id_visible} · ${item.label}${embName ? ` · ${embName(item.equipo.embarcacion_id)}` : ""}`,
    tone: item.tone,
    onClick: () => onIrABrecha(item.equipoId, item.tab, item.tipo),
  })), [itemsFiltrados, onIrABrecha, embName]);

  const tiposActivos = Object.entries(analisis.porTipo).sort(
    (a, b) => (BRECHA_META[a[0]]?.prio ?? 99) - (BRECHA_META[b[0]]?.prio ?? 99),
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 280px)", minHeight: 420, overflow: "hidden" }}>
      <div style={{ padding: "16px 20px 12px", borderBottom: `1px solid ${C.foam}`, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <Target size={18} color={C.sky} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.abyss }}>Cola de optimización</div>
            <div style={{ fontSize: 12, color: C.slate, marginTop: 2 }}>
              {analisis.equiposConBrecha} equipo{analisis.equiposConBrecha !== 1 ? "s" : ""} con brechas · {analisis.total} acciones
            </div>
          </div>
        </div>

        {tiposActivos.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <Filter size={14} color={C.slate} />
            <FilterBtn active={!filtroBrecha} onClick={() => setFiltroBrecha(null)}>
              Todas ({analisis.total})
            </FilterBtn>
            {tiposActivos.map(([tipo, n]) => (
              <FilterBtn key={tipo} active={filtroBrecha === tipo} onClick={() => setFiltroBrecha(tipo)}>
                {BRECHA_META[tipo]?.label || tipo} ({n})
              </FilterBtn>
            ))}
            {filtroBrecha && (
              <button type="button" onClick={() => setFiltroBrecha(null)} style={{ ...ghostBtn, fontSize: 11.5, padding: "5px 10px" }}>
                Limpiar filtro
              </button>
            )}
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px 20px" }}>
        <ActionQueue
          title="Brechas del registro"
          items={queueItems}
          emptyLabel={analisis.evaluables === 0
            ? "Sin nodos evaluables en este alcance"
            : "Registro completo — sin brechas abiertas"}
        />

        {analisis.evaluables > 0 && analisis.salud === 100 && (
          <p style={{ fontSize: 12.5, color: C.slate, marginTop: 16, padding: "10px 12px", background: tint(C.green, 8), borderRadius: 8, border: `1px solid ${tint(C.green, 30)}` }}>
            Todos los nodos evaluables ({analisis.evaluables}) tienen criticidad, horómetro, ficha y repuestos según corresponda.
          </p>
        )}
      </div>
    </div>
  );
}
