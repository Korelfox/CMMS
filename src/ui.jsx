import React from "react";
import { C, archivo, shadow } from "./theme";

// ============================================================
//  Primitivas de interfaz reutilizables
// ============================================================

export function Card({ children, style, ...rest }) {
  return (
    <div {...rest} style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 14, padding: 20, boxShadow: shadow.sm, ...style }}>
      {children}
    </div>
  );
}

export function Pill({ tone = "slate", children }) {
  const map = {
    green: [C.green, C.greenBg], red: [C.red, C.redBg], yellow: [C.yellow, C.yellowBg],
    slate: [C.slate, C.foam], steel: [C.steel, "#E4EFF8"], purple: [C.purple, C.purpleBg],
    cyan: [C.cyan, C.cyanBg], indigo: [C.indigo, C.indigoBg], brown: [C.brown, C.brownBg],
  };
  const [fg, bg] = map[tone] || map.slate;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 20, background: bg, color: fg, fontSize: 11.5, fontWeight: 600, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

export function PageHead({ title, sub, kicker, action }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24, gap: 16 }}>
      <div>
        {kicker && <div style={{ fontSize: 11, letterSpacing: 2.5, textTransform: "uppercase", color: C.steel, fontWeight: 600, marginBottom: 6 }}>{kicker}</div>}
        <h1 style={{ ...archivo, fontSize: 27, fontWeight: 800, margin: 0, color: C.abyss, letterSpacing: -0.5 }}>{title}</h1>
        {sub && <p style={{ margin: "6px 0 0", color: C.slate, fontSize: 13.5, maxWidth: 720 }}>{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export const inputStyle = (w) => ({
  width: w || "100%", padding: "10px 13px", border: `1px solid ${C.line}`, borderRadius: 8,
  fontSize: 14, color: C.ink, background: "#fff", outline: "none",
});

export const primaryBtn = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
  padding: "10px 18px", borderRadius: 9, border: "none", background: C.steel, color: "#fff",
  fontSize: 14, fontWeight: 600, cursor: "pointer",
};

export const ghostBtn = {
  padding: "9px 16px", borderRadius: 9, border: `1px solid ${C.line}`, background: "#fff",
  color: C.slate, fontSize: 13, fontWeight: 600, cursor: "pointer",
};

export function Spinner({ label = "Cargando…" }) {
  return (
    <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", background: C.abyss, color: C.foam }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 40, height: 40, border: `3px solid rgba(255,255,255,.2)`, borderTopColor: C.gold, borderRadius: "50%", margin: "0 auto 16px", animation: "spin 0.8s linear infinite" }} />
        <div style={{ letterSpacing: 2, fontSize: 12, textTransform: "uppercase", opacity: 0.7 }}>{label}</div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// Spinner pequeño para cargar dentro de un módulo (no pantalla completa)
export function InlineSpinner({ label = "Cargando…" }) {
  return (
    <div style={{ padding: "50px 0", textAlign: "center", color: C.slate }}>
      <div style={{ width: 30, height: 30, border: `3px solid ${C.line}`, borderTopColor: C.steel, borderRadius: "50%", margin: "0 auto 12px", animation: "spin 0.8s linear infinite" }} />
      <div style={{ fontSize: 12.5 }}>{label}</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// Estilos de tabla
export const thStyle = { textAlign: "left", padding: "13px 18px", fontSize: 11.5, letterSpacing: 0.5, textTransform: "uppercase", color: C.slate, fontWeight: 600, borderBottom: `2px solid ${C.line}`, whiteSpace: "nowrap" };
export const tdStyle = { padding: "13px 18px", fontSize: 13.5, borderBottom: `1px solid ${C.foam}`, color: C.ink };

// Input "editable" (resaltado azul) para campos que escriben en la base
export const bluInput = { ...inputStyle(), padding: "9px 11px", fontSize: 13.5, color: C.steel, fontWeight: 600, background: "#F2F8FD", borderColor: "#CFE3F2", fontFamily: "'IBM Plex Mono', monospace" };

export const exportBtn = { display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 9, border: `1px solid ${C.line}`, background: "#fff", color: C.steel, fontSize: 12.5, fontWeight: 600, cursor: "pointer" };

export function FilterBtn({ active, onClick, children, color }) {
  return (
    <button onClick={onClick} style={{ padding: "7px 14px", borderRadius: 8, border: `1px solid ${active ? (color || C.steel) : C.line}`, background: active ? (color || C.steel) : "#fff", color: active ? "#fff" : C.slate, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
      {children}
    </button>
  );
}

export function Field({ label, children, span }) {
  return (
    <div style={{ gridColumn: span ? `span ${span}` : "auto" }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: C.slate, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      {children}
    </div>
  );
}

export function Empty({ children }) {
  return <div style={{ padding: "30px 0", textAlign: "center", color: C.slate, fontSize: 13 }}>{children}</div>;
}

// ── KPI Card premium: ícono en fondo tenue + valor + tendencia opcional ──
// icon: componente lucide · tone: color del acento · trend: { dir:'up'|'down', value:'12%' }
export function KPICard({ label, value, sub, icon: Icon, tone = C.steel, trend }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 14, padding: 16, boxShadow: shadow.sm, position: "relative", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10.5, letterSpacing: 1.2, textTransform: "uppercase", color: C.slate, fontWeight: 700 }}>{label}</div>
          <div style={{ ...archivo, fontSize: 25, fontWeight: 800, color: tone, lineHeight: 1.1, marginTop: 8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
          {sub && <div style={{ fontSize: 11.5, color: C.slate, marginTop: 5 }}>{sub}</div>}
        </div>
        {Icon && (
          <div style={{ width: 38, height: 38, borderRadius: 10, background: `${tone}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Icon size={19} color={tone} />
          </div>
        )}
      </div>
      {trend && (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 10, fontSize: 11.5, fontWeight: 700, color: trend.dir === "up" ? C.green : trend.dir === "down" ? C.red : C.slate }}>
          <span>{trend.dir === "up" ? "▲" : trend.dir === "down" ? "▼" : "■"}</span>
          <span>{trend.value}</span>
          {trend.label && <span style={{ color: C.slate, fontWeight: 500 }}>{trend.label}</span>}
        </div>
      )}
    </div>
  );
}

export function ErrorBanner({ children, onRetry }) {
  if (!children) return null;
  return (
    <div style={{ background: C.redBg, color: C.red, padding: "12px 14px", borderRadius: 10, fontSize: 13, marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
      <span>{children}</span>
      {onRetry && <button onClick={onRetry} style={{ background: C.red, color: "#fff", border: "none", borderRadius: 7, padding: "5px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Reintentar</button>}
    </div>
  );
}

// ============================================================
//  Estilos globales del design system (Tier 1 fundacional)
//  Se monta una sola vez en App. Usa propiedades que NO se
//  definen inline (box-shadow, transform, filter, outline) para
//  no chocar con los estilos en línea de los componentes.
// ============================================================
export function DesignSystemStyles() {
  return (
    <style>{`
      * { -webkit-tap-highlight-color: transparent; }

      /* Transiciones suaves globales en elementos interactivos */
      button, input, select, textarea, a, [role="button"] {
        transition: box-shadow .15s ease, transform .12s ease,
                    filter .15s ease, border-color .15s ease,
                    background-color .15s ease, opacity .15s ease;
      }

      /* Botones: realce y "lift" al pasar el mouse, hundido al click */
      button:not(:disabled):not([data-nofx]):hover { filter: brightness(1.05); }
      button:not(:disabled):not([data-nofx]):active { transform: translateY(1px); filter: brightness(.97); }
      button:disabled { opacity: .55; cursor: not-allowed; }

      /* Focus ring accesible y consistente en campos */
      input:focus-visible, select:focus-visible, textarea:focus-visible {
        border-color: ${C.sky} !important;
        box-shadow: 0 0 0 3px rgba(62,143,214,.20);
      }

      /* Tarjetas clickeables: se elevan al pasar el mouse */
      .cmms-clickable { transition: box-shadow .18s ease, transform .14s ease, border-color .18s ease; }
      .cmms-clickable:hover {
        box-shadow: ${shadow.md};
        transform: translateY(-2px);
        border-color: ${C.sky}66;
      }
      .cmms-clickable:active { transform: translateY(0); }

      /* Filas de tabla: hover sutil para seguir la lectura */
      tbody tr { transition: background-color .12s ease; }
      tbody tr:hover td { background-color: ${C.mist}; }

      /* Scrollbars discretas y modernas */
      ::-webkit-scrollbar { width: 11px; height: 11px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb {
        background: #C2D3E0; border-radius: 8px;
        border: 3px solid transparent; background-clip: padding-box;
      }
      ::-webkit-scrollbar-thumb:hover { background: #A4BBCD; }

      /* Selección de texto con el azul de marca */
      ::selection { background: rgba(62,143,214,.22); }

      /* Aparición suave de las vistas de módulo */
      @keyframes cmms-fade-in {
        from { opacity: 0; transform: translateY(4px); }
        to   { opacity: 1; transform: translateY(0); }
      }
    `}</style>
  );
}
