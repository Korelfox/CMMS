import React from "react";
import { Inbox, Package, RefreshCw, ChevronRight, Anchor, CalendarClock, Sun, Moon } from "lucide-react";
import { C, tint } from "../../theme";
import { Card, primaryBtn, ghostBtn } from "../../ui";
const LINKS = [
  { id: "prezarpe", label: "Prezarpe", sub: "Checklist antes de zarpar", icon: Anchor, tone: C.cyan },
  { id: "solicitudes", label: "Nueva solicitud", sub: "Reportar falla o pedido", icon: Inbox, tone: C.sky },
  { id: "inventario", label: "Inventario", sub: "Stock a bordo", icon: Package, tone: C.amber },
  { id: "planpm", label: "Plan PM", sub: "Mantenimiento preventivo", icon: CalendarClock, tone: C.green },
];

export default function CampoMas({ onSync, pendientes, sincronizando, online, onNavigate, dark = false, onToggleTema }) {

  return (
    <div className="cmms-campo-polish" style={{ padding: "4px 0" }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: C.ink, marginBottom: 14 }}>Accesos rápidos</div>
      {LINKS.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onNavigate?.(item.id)}
            className="cmms-campo-touch"
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
          className="cmms-campo-touch"
          onClick={onSync}
          disabled={!online || sincronizando}
          style={{ ...primaryBtn, width: "100%", justifyContent: "center", opacity: !online || sincronizando ? 0.6 : 1 }}
        >
          <RefreshCw size={16} className={sincronizando ? "cmms-spin" : undefined} />
          {sincronizando ? "Sincronizando…" : "Sincronizar ahora"}
        </button>
      </Card>

      {onToggleTema && (
        <button
          type="button"
          className="cmms-campo-touch"
          onClick={onToggleTema}
          style={{
            ...ghostBtn,
            width: "100%",
            justifyContent: "center",
            marginTop: 12,
            padding: "12px 14px",
            borderRadius: 12,
            gap: 8,
          }}
        >
          {dark ? <Sun size={18} color={C.gold} /> : <Moon size={18} color={C.steel} />}
          {dark ? "Modo día" : "Modo noche"}
        </button>
      )}
    </div>
  );
}
