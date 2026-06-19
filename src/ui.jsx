import React, { useState, useEffect } from "react";
import { ChevronRight } from "lucide-react";
import { C, archivo, shadow, tint, space, LAYOUT } from "./theme";

// ============================================================
//  Focus-following scroll — al enfocar un campo cerca del borde,
//  desliza la vista para mantenerlo visible (formularios largos
//  y tablas anchas con edición inline). Global, sin tocar módulos.
// ============================================================
export function FocusScroll() {
  useEffect(() => {
    let raf = 0;
    function onFocusIn(e) {
      const el = e.target;
      if (!el || typeof el.matches !== "function") return;
      if (!el.matches('input, select, textarea, [contenteditable="true"]')) return;
      cancelAnimationFrame(raf);
      // Espera un frame a que el layout (y el teclado en móvil) se asienten.
      raf = requestAnimationFrame(() => {
        const r  = el.getBoundingClientRect();
        const vh = window.innerHeight || document.documentElement.clientHeight;
        const vw = window.innerWidth  || document.documentElement.clientWidth;
        const margenV = 110;  // anticipa antes de tocar el borde vertical
        const margenH = 16;
        const fueraV = r.top < margenV || r.bottom > vh - margenV;
        const fueraH = r.left < margenH || r.right > vw - margenH;
        if (fueraV || fueraH) {
          try { el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" }); }
          catch { el.scrollIntoView(); }
        }
      });
    }
    document.addEventListener("focusin", onFocusIn);
    return () => { document.removeEventListener("focusin", onFocusIn); cancelAnimationFrame(raf); };
  }, []);
  return null;
}

// ── Guía colapsable: nota de ayuda para mantener estructura/estándares ──
// Uso: <GuiaColapsable titulo="..." icon={Tag}> contenido </GuiaColapsable>
export function GuiaColapsable({ titulo, icon: Icon, children, defaultOpen = false, tone = C.cyan }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ border: `1px solid ${tint(tone, 35)}`, borderRadius: 10, background: tint(tone, 7), marginTop: 12, overflow: "hidden" }}>
      <button onClick={() => setOpen((o) => !o)} data-nofx
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 9, padding: "10px 14px", background: "none", border: "none", cursor: "pointer", textAlign: "left", color: tone, fontSize: 12.5, fontWeight: 700, fontFamily: "inherit" }}>
        {Icon && <Icon size={15} />}
        <span style={{ flex: 1 }}>{titulo}</span>
        <span style={{ fontSize: 11, opacity: 0.7 }}>{open ? "▲ ocultar" : "▼ ver guía"}</span>
      </button>
      {open && <div style={{ padding: "0 14px 14px", fontSize: 12.5, color: C.ink, lineHeight: 1.6 }}>{children}</div>}
    </div>
  );
}

// ============================================================
//  Primitivas de interfaz reutilizables
// ============================================================

export function Card({ children, style, ...rest }) {
  return (
    <div {...rest} style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 20, boxShadow: shadow.sm, ...style }}>
      {children}
    </div>
  );
}

export function Pill({ tone = "slate", children }) {
  const map = {
    green: [C.green, C.greenBg], red: [C.red, C.redBg], yellow: [C.yellow, C.yellowBg],
    slate: [C.slate, C.foam], steel: [C.steel, C.indigoBg], purple: [C.purple, C.purpleBg],
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
  fontSize: 14, color: C.ink, background: C.surface, outline: "none",
});

export const primaryBtn = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
  padding: "10px 18px", borderRadius: 9, border: "none",
  background: `linear-gradient(135deg, ${C.sky} 0%, ${C.indigo} 100%)`,
  color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer",
  boxShadow: "0 2px 10px color-mix(in srgb, var(--c-sky) 35%, transparent)",
};

export const ghostBtn = {
  padding: "9px 16px", borderRadius: 9, border: `1px solid ${C.line}`, background: C.surface,
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
export const bluInput = { ...inputStyle(), padding: "9px 11px", fontSize: 13.5, color: C.steel, fontWeight: 600, background: tint(C.sky, 9), borderColor: tint(C.sky, 28), fontFamily: "'IBM Plex Mono', monospace" };

export const exportBtn = { display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 9, border: `1px solid ${C.line}`, background: C.surface, color: C.steel, fontSize: 12.5, fontWeight: 600, cursor: "pointer" };

export function FilterBtn({ active, onClick, children, color }) {
  return (
    <button onClick={onClick} style={{ padding: "7px 14px", borderRadius: 8, border: `1px solid ${active ? (color || C.steel) : C.line}`, background: active ? (color || C.steel) : C.surface, color: active ? "#fff" : C.slate, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
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
    <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 16, boxShadow: shadow.sm, position: "relative", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10.5, letterSpacing: 1.2, textTransform: "uppercase", color: C.slate, fontWeight: 700 }}>{label}</div>
          <div style={{ ...archivo, fontSize: 25, fontWeight: 800, color: tone, lineHeight: 1.1, marginTop: 8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
          {sub && <div style={{ fontSize: 11.5, color: C.slate, marginTop: 5 }}>{sub}</div>}
        </div>
        {Icon && (
          <div style={{ width: 38, height: 38, borderRadius: 10, background: tint(tone, 10), display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
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
//  Design System Tier 2 — layouts de módulo (estándar global)
// ============================================================

/** Enlace de acción secundaria (Ver todas, Ver bitácora…) */
export function LinkButton({ children, onClick, icon: Icon = ChevronRight }) {
  return (
    <button type="button" onClick={onClick} data-nofx
      style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none",
        color: C.steel, cursor: "pointer", fontSize: 12.5, fontWeight: 600, fontFamily: "inherit", padding: "4px 0" }}>
      {children}
      <Icon size={14} strokeWidth={2.2} />
    </button>
  );
}

/** Estado vacío con jerarquía visual y CTA opcional */
export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div style={{ padding: "48px 24px", textAlign: "center" }}>
      {Icon && (
        <div style={{ width: 52, height: 52, borderRadius: 14, background: tint(C.steel, 8),
          display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
          <Icon size={24} color={C.steel} strokeWidth={1.8} />
        </div>
      )}
      {title && <div style={{ ...archivo, fontSize: 16, fontWeight: 700, color: C.abyss, marginBottom: 6 }}>{title}</div>}
      {description && <p style={{ margin: 0, fontSize: 13.5, color: C.slate, lineHeight: 1.6, maxWidth: 360, marginInline: "auto" }}>{description}</p>}
      {action && <div style={{ marginTop: 18 }}>{action}</div>}
    </div>
  );
}

/**
 * Contenedor estándar de módulo: header premium + toolbar + cuerpo animado.
 * loading → spinner inline · error → banner con retry
 */
export function ModuleShell({ kicker, title, sub, action, toolbar, children, loading, error, onRetry, maxWidth = LAYOUT.maxWidth }) {
  return (
    <div className="cmms-module" style={{ maxWidth, width: "100%", margin: "0 auto", animation: "cmms-fade-in .35s ease both" }}>
      <header className="cmms-module-header">
        <div className="cmms-module-header-inner">
          <div style={{ minWidth: 0, flex: 1 }}>
            {kicker && <div className="cmms-module-kicker">{kicker}</div>}
            <h1 className="cmms-module-title">{title}</h1>
            {sub && <p className="cmms-module-sub">{sub}</p>}
          </div>
          {action && <div className="cmms-module-actions">{action}</div>}
        </div>
      </header>

      {error && <ErrorBanner onRetry={onRetry}>{error}</ErrorBanner>}
      {toolbar && <div className="cmms-toolbar-wrap">{toolbar}</div>}

      {loading ? (
        <Card style={{ padding: 0 }}><InlineSpinner label="Cargando datos…" /></Card>
      ) : children}
    </div>
  );
}

/** Barra de herramientas: filtros/búsqueda a la izq · acciones a la der */
export function Toolbar({ left, right, style }) {
  return (
    <div className="cmms-toolbar" style={style}>
      <div className="cmms-toolbar-left">{left}</div>
      {right && <div className="cmms-toolbar-right">{right}</div>}
    </div>
  );
}

/** Sección dentro de un módulo — título + descripción + contenido en Card */
export function Section({ title, description, action, children, style, padding = 20 }) {
  return (
    <section style={{ marginBottom: space.xl, ...style }}>
      {(title || action) && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: space.md }}>
          <div>
            {title && <h2 className="cmms-section-title">{title}</h2>}
            {description && <p className="cmms-section-desc">{description}</p>}
          </div>
          {action}
        </div>
      )}
      <Card style={{ padding }}>{children}</Card>
    </section>
  );
}

/** KPI clickeable — envuelve KPICard con hover estándar */
export function StatTile({ onClick, highlight, ...kpiProps }) {
  return (
    <div
      className={onClick ? "cmms-stat-tile cmms-clickable" : "cmms-stat-tile"}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(e); } } : undefined}
      style={highlight ? { gridColumn: "span 2" } : undefined}
    >
      <KPICard {...kpiProps} />
    </div>
  );
}

/**
 * Tarjeta hero para command centers — gradiente según severidad.
 * variant: ok | warn | critical
 */
export function HeroStat({ variant = "ok", icon: Icon, label, value, sub, onClick }) {
  const palettes = {
    ok:       { grad: `linear-gradient(135deg, ${C.indigo} 0%, ${C.sky} 55%, ${C.cyan} 100%)`, glow: "rgba(6,182,212,.32)" },
    warn:     { grad: `linear-gradient(135deg, ${C.amber} 0%, #D97706 100%)`, glow: "rgba(245,158,11,.28)" },
    critical: { grad: `linear-gradient(135deg, ${C.red} 0%, #7F1D1D 100%)`, glow: "rgba(239,68,68,.28)" },
  };
  const p = palettes[variant] || palettes.ok;
  return (
    <div
      className={onClick ? "cmms-hero-stat cmms-clickable" : "cmms-hero-stat"}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(e); } } : undefined}
      style={{ background: p.grad, boxShadow: `0 8px 32px ${p.glow}`, cursor: onClick ? "pointer" : "default" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        {Icon && <Icon size={22} color="#fff" strokeWidth={2.2} />}
        <div style={{ fontSize: 11, letterSpacing: 1.8, textTransform: "uppercase", color: "rgba(255,255,255,.88)", fontWeight: 700 }}>{label}</div>
      </div>
      <div style={{ ...archivo, fontSize: 40, fontWeight: 800, color: "#fff", lineHeight: 1, letterSpacing: -1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12.5, marginTop: 10, color: "rgba(255,255,255,.85)", lineHeight: 1.5 }}>{sub}</div>}
    </div>
  );
}

/** Grid responsivo de KPIs — stats: [{ label, value, sub, icon, tone, onClick, highlight }] */
export function StatGrid({ stats = [], hero }) {
  return (
    <div className="cmms-stat-grid">
      {hero}
      {stats.map((s, i) => (
        <StatTile key={s.id || s.label || i} {...s} />
      ))}
    </div>
  );
}

/** Lista de acciones prioritarias — items: [{ id, label, detail, tone, onClick }] */
export function ActionQueue({ title = "Requiere atención", items = [], emptyLabel = "Sin acciones pendientes" }) {
  if (!items.length) {
    return (
      <div className="cmms-action-queue cmms-action-queue-ok">
        <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: C.green, fontWeight: 700, marginBottom: 8 }}>{title}</div>
        <div style={{ ...archivo, fontSize: 18, fontWeight: 800, color: C.green }}>{emptyLabel}</div>
      </div>
    );
  }
  return (
    <div className="cmms-action-queue">
      <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: C.slate, fontWeight: 700, marginBottom: 12 }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map((item) => {
          const toneColor = item.tone === "red" ? C.red : item.tone === "amber" ? C.amber : C.steel;
          return (
            <button key={item.id} type="button" data-nofx onClick={item.onClick}
              className="cmms-action-item"
              style={{ borderLeftColor: toneColor }}>
              <span style={{ fontWeight: 700, color: C.abyss, fontSize: 13 }}>{item.label}</span>
              {item.detail && <span style={{ fontSize: 12, color: C.slate }}>{item.detail}</span>}
              <ChevronRight size={14} color={C.slate} style={{ marginLeft: "auto", flexShrink: 0 }} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Tabla de datos enterprise — columns: [{ key, label, width, render }]
 * rows: array · onRowClick opcional · compact para densidad controlada
 */
export function DataTable({ columns = [], rows = [], onRowClick, empty, compact = false }) {
  if (!rows.length) {
    return empty || <Empty>Sin registros.</Empty>;
  }
  const pad = compact ? "10px 14px" : "13px 18px";
  return (
    <div className="cmms-datatable-wrap">
      <table className="cmms-datatable" style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} style={{ ...thStyle, padding: pad, width: col.width }}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr
              key={row.id ?? ri}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              style={{ cursor: onRowClick ? "pointer" : "default" }}
              className={onRowClick ? "cmms-datatable-row-click" : undefined}
            >
              {columns.map((col) => (
                <td key={col.key} style={{ ...tdStyle, padding: pad }}>
                  {col.render ? col.render(row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Anillo de salud 0–100 para tarjetas de flota */
export function HealthRing({ value, size = 56, stroke = 5 }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  const color = v >= 80 ? C.green : v >= 60 ? C.amber : C.red;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (v / 100) * circ;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)", flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={C.foam} strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: "stroke-dashoffset .6s ease" }} />
    </svg>
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
        box-shadow: 0 0 0 3px color-mix(in srgb, ${C.sky} 28%, transparent);
      }

      /* Tarjetas clickeables: se elevan al pasar el mouse */
      .cmms-clickable { transition: box-shadow .18s ease, transform .14s ease, border-color .18s ease; }
      .cmms-clickable:hover {
        box-shadow: ${shadow.md};
        transform: translateY(-2px);
        border-color: ${tint(C.sky, 45)};
      }
      .cmms-clickable:active { transform: translateY(0); }

      /* Filas de tabla: hover sutil para seguir la lectura */
      tbody tr { transition: background-color .12s ease; }
      tbody tr:hover td { background-color: ${C.mist}; }

      /* Scrollbars discretas y modernas */
      ::-webkit-scrollbar { width: 11px; height: 11px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb {
        background: color-mix(in srgb, ${C.indigo} 35%, ${C.line});
        border-radius: 8px;
        border: 3px solid transparent; background-clip: padding-box;
      }
      ::-webkit-scrollbar-thumb:hover { background: color-mix(in srgb, ${C.sky} 45%, ${C.line}); }

      /* Selección de texto con acento orbital */
      ::selection { background: color-mix(in srgb, ${C.sky} 28%, transparent); }

      /* Aparición suave de las vistas de módulo */
      @keyframes cmms-fade-in {
        from { opacity: 0; transform: translateY(4px); }
        to   { opacity: 1; transform: translateY(0); }
      }

      /* ── Tier 2: ModuleShell ─────────────────────────────────────── */
      .cmms-module-header {
        position: relative;
        margin-bottom: 28px;
        padding: 28px 28px 24px;
        border-radius: 16px;
        background: linear-gradient(135deg,
          color-mix(in srgb, var(--c-indigo) 7%, var(--c-surface)) 0%,
          var(--c-surface) 42%,
          color-mix(in srgb, var(--c-sky) 6%, var(--c-surface)) 100%);
        border: 1px solid color-mix(in srgb, var(--c-indigo) 18%, var(--c-line));
        box-shadow: ${shadow.sm};
        overflow: hidden;
      }
      .cmms-module-header::before {
        content: "";
        position: absolute;
        top: -40%;
        right: -8%;
        width: 280px;
        height: 280px;
        border-radius: 50%;
        background: radial-gradient(circle, color-mix(in srgb, var(--c-sky) 16%, transparent) 0%, transparent 70%);
        pointer-events: none;
      }
      .cmms-module-header::after {
        content: "";
        position: absolute;
        bottom: -50%;
        left: -5%;
        width: 200px;
        height: 200px;
        border-radius: 50%;
        background: radial-gradient(circle, color-mix(in srgb, var(--c-purple) 10%, transparent) 0%, transparent 70%);
        pointer-events: none;
      }
      .cmms-module-header-inner {
        position: relative;
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        gap: 20px;
        flex-wrap: wrap;
      }
      .cmms-module-kicker {
        font-size: 11px;
        letter-spacing: 2.5px;
        text-transform: uppercase;
        color: var(--c-steel);
        font-weight: 600;
        margin-bottom: 8px;
      }
      .cmms-module-title {
        font-family: 'Archivo', sans-serif;
        font-size: clamp(26px, 4vw, 32px);
        font-weight: 800;
        margin: 0;
        color: var(--c-abyss);
        letter-spacing: -0.6px;
        line-height: 1.1;
      }
      .cmms-module-sub {
        margin: 10px 0 0;
        color: var(--c-slate);
        font-size: 14px;
        line-height: 1.55;
        max-width: 840px;
      }
      .cmms-module-actions { display: flex; gap: 10px; flex-shrink: 0; align-items: center; flex-wrap: wrap; }

      /* ── Toolbar ─────────────────────────────────────────────────── */
      .cmms-toolbar-wrap { margin-bottom: 20px; }
      .cmms-toolbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
        padding: 12px 16px;
        background: var(--c-surface2);
        border: 1px solid var(--c-line);
        border-radius: 12px;
      }
      .cmms-toolbar-left, .cmms-toolbar-right {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }

      /* ── StatGrid ────────────────────────────────────────────────── */
      .cmms-stat-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 14px;
        margin-bottom: 24px;
      }
      .cmms-hero-stat {
        grid-column: span 2;
        border-radius: 14px;
        padding: 22px 24px;
        color: #fff;
        border: none;
        text-align: left;
        font-family: inherit;
        transition: transform .18s ease, box-shadow .18s ease;
      }
      .cmms-stat-tile { min-width: 0; }
      .cmms-stat-tile > div { height: 100%; }

      /* ── Section titles ──────────────────────────────────────────── */
      .cmms-section-title {
        font-family: 'Archivo', sans-serif;
        font-size: 17px;
        font-weight: 800;
        color: var(--c-abyss);
        margin: 0;
        letter-spacing: -0.2px;
      }
      .cmms-section-desc {
        margin: 4px 0 0;
        font-size: 12.5px;
        color: var(--c-slate);
        line-height: 1.5;
      }

      /* ── Action queue ─────────────────────────────────────────────── */
      .cmms-action-queue {
        padding: 18px 20px;
        background: var(--c-surface);
        border: 1px solid var(--c-line);
        border-radius: 14px;
        box-shadow: ${shadow.sm};
        height: 100%;
      }
      .cmms-action-queue-ok {
        background: color-mix(in srgb, var(--c-green) 6%, var(--c-surface));
        border-color: color-mix(in srgb, var(--c-green) 25%, var(--c-line));
      }
      .cmms-action-item {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        padding: 11px 14px;
        background: var(--c-mist);
        border: 1px solid var(--c-line);
        border-left-width: 3px;
        border-radius: 10px;
        cursor: pointer;
        text-align: left;
        font-family: inherit;
        transition: background .12s ease, border-color .12s ease;
      }
      .cmms-root:not(.cmms-campo-mode) .cmms-module-kicker { color: var(--c-indigo); }

      .cmms-action-item:hover {
        background: color-mix(in srgb, var(--c-indigo) 8%, var(--c-mist));
        border-color: color-mix(in srgb, var(--c-sky) 32%, var(--c-line));
      }

      /* ── DataTable ───────────────────────────────────────────────── */
      .cmms-datatable-wrap { overflow-x: auto; margin: -4px -4px 0; }
      .cmms-datatable thead { position: sticky; top: 0; z-index: 1; background: var(--c-surface); }
      .cmms-datatable-row-click:hover td { background: color-mix(in srgb, var(--c-indigo) 6%, var(--c-mist)) !important; }

      /* ── Layout grids (Tablero / command centers) ─────────────────── */
      .cmms-grid-2 { display: grid; grid-template-columns: 1.35fr 1fr; gap: 16px; margin-bottom: 24px; }
      .cmms-grid-fleet { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 16px; }

      /* ── Split cola/árbol + detalle (Equipos, Inventario, OT, PM…) ─ */
      .cmms-split-layout,
      .inv-split-container,
      .eq-split-container,
      .ot-split-container {
        display: grid;
        grid-template-columns: minmax(260px, ${LAYOUT.splitTreeMax}px) minmax(0, 1fr);
        gap: 14px;
        align-items: start;
        padding: 12px 14px;
      }
      .inv-split-container.inv-split-queue-wide {
        grid-template-columns: minmax(${LAYOUT.splitQueueMin}px, ${LAYOUT.splitQueueMax}px) minmax(0, 1fr);
      }
      .inv-split-container.inv-split-table-wide {
        grid-template-columns: minmax(${LAYOUT.splitTableMin}px, ${LAYOUT.splitTableMax}px) minmax(0, 1fr);
      }
      .cmms-split-layout.cmms-split-stack,
      .inv-split-container.inv-split-stack,
      .eq-split-container.cmms-split-stack,
      .ot-split-container.ot-split-stack {
        grid-template-columns: 1fr;
      }
      .cmms-split-kanban,
      .inv-kanban-with-detail,
      .ot-kanban-with-detail {
        display: grid;
        grid-template-columns: 1fr;
        gap: 0;
      }
      @media (min-width: 1025px) {
        .cmms-split-kanban.has-detail,
        .inv-kanban-with-detail.has-detail,
        .ot-kanban-with-detail.has-detail {
          grid-template-columns: minmax(0, 1fr) minmax(${LAYOUT.splitDetailMin}px, ${LAYOUT.splitDetailMax}px);
        }
      }
      /* Split colapsable — panel detalle on/off (Fase 4) */
      .cmms-split-detail {
        display: grid;
        gap: 14px;
        align-items: start;
        padding: 12px 14px;
      }
      .cmms-split-detail.detail-open:not(.cmms-split-detail--stack) {
        grid-template-columns: minmax(260px, ${LAYOUT.splitTreeMax}px) minmax(0, 1fr);
      }
      .cmms-split-detail:not(.detail-open):not(.cmms-split-detail--stack) {
        grid-template-columns: 1fr;
      }
      .cmms-split-detail--queue-wide.detail-open {
        grid-template-columns: minmax(${LAYOUT.splitQueueMin}px, ${LAYOUT.splitQueueMax}px) minmax(0, 1fr);
      }
      .cmms-split-detail--queue-wide:not(.detail-open) {
        grid-template-columns: 1fr;
      }
      .cmms-split-detail--table-wide.detail-open {
        grid-template-columns: minmax(${LAYOUT.splitTableMin}px, ${LAYOUT.splitTableMax}px) minmax(0, 1fr);
      }
      .cmms-split-detail--table-wide:not(.detail-open) {
        grid-template-columns: 1fr;
      }
      .cmms-split-detail-pane {
        position: relative;
        min-width: 0;
      }
      .cmms-split-detail-close {
        position: absolute;
        top: 8px;
        right: 8px;
        z-index: 4;
      }
      @media (max-width: 1024px) {
        .cmms-split-layout,
        .inv-split-container,
        .eq-split-container,
        .ot-split-container,
        .cmms-split-detail { grid-template-columns: 1fr; }
      }

      @media (max-width: 1100px) {
        .cmms-stat-grid { grid-template-columns: repeat(2, 1fr); }
        .cmms-hero-stat { grid-column: span 2; }
        .cmms-grid-2 { grid-template-columns: 1fr; }
      }
      @media (max-width: 600px) {
        .cmms-module-header { padding: 20px 18px 18px; }
        .cmms-stat-grid { grid-template-columns: 1fr; }
        .cmms-hero-stat { grid-column: span 1; }
        .cmms-grid-fleet { grid-template-columns: 1fr; }
      }
    `}</style>
  );
}
