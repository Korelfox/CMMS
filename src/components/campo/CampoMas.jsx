import React from "react";
import { Inbox, Timer, Package, RefreshCw, ChevronRight } from "lucide-react";
import { C, tint } from "../../theme";
import { Card, primaryBtn } from "../../ui";
const LINKS = [
  { id: "solicitudes", label: "Nueva solicitud", sub: "Reportar falla o pedido", icon: Inbox, tone: C.sky },
  { id: "horometros", label: "Horómetro", sub: "Registrar lectura", icon: Timer, tone: C.steel },
  { id: "inventario", label: "Inventario", sub: "Stock a bordo", icon: Package, tone: C.amber },
];

export default function CampoMas({ onSync, pendientes, sincronizando, online, onNavigate }) {

  return (
    <div style={{ padding: "4px 0" }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: C.ink, marginBottom: 14 }}>Accesos rápidos</div>
      {LINKS.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onNavigate?.(item.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              width: "100%",
              textAlign: "left",
              padding: 14,
              marginBottom: 10,
              borderRadius: 12,
              border: `1px solid ${C.line}`,
              background: C.surface,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            <div style={{ width: 40, height: 40, borderRadius: 10, background: tint(item.tone, 12), display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Icon size={20} color={item.tone} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>{item.label}</div>
              <div style={{ fontSize: 12, color: C.slate, marginTop: 2 }}>{item.sub}</div>
            </div>
            <ChevronRight size={18} color={C.slate} />
          </button>
        );
      })}

      <Card style={{ marginTop: 8, padding: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, marginBottom: 8 }}>Sincronización</div>
        <div style={{ fontSize: 12.5, color: C.slate, marginBottom: 12, lineHeight: 1.5 }}>
          {pendientes > 0
            ? `${pendientes} cambio${pendientes === 1 ? "" : "s"} pendiente${pendientes === 1 ? "" : "s"} de subir.`
            : "Todo sincronizado con la oficina."}
        </div>
        <button
          type="button"
          onClick={onSync}
          disabled={!online || sincronizando}
          style={{ ...primaryBtn, width: "100%", justifyContent: "center", opacity: !online || sincronizando ? 0.6 : 1 }}
        >
          <RefreshCw size={16} className={sincronizando ? "cmms-spin" : undefined} />
          {sincronizando ? "Sincronizando…" : "Sincronizar ahora"}
        </button>
      </Card>
    </div>
  );
}
