import React from "react";
import { ArrowLeft } from "lucide-react";
import { C, tint } from "../../theme";
import { ghostBtn } from "../../ui";

/** Pantalla full-screen para detalle móvil (Capa 3). */
export default function DetailShell({
  title,
  subtitle,
  subtitleClamp = 1,
  onBack,
  backLabel = "Volver",
  children,
  footer,
  progress,
  className = "",
  campo = false,
}) {
  return (
    <div
      className={`cmms-detail-shell${campo ? " cmms-detail-shell-campo" : ""} ${className}`.trim()}
      role="dialog"
      aria-modal="true"
      aria-label={title || "Detalle"}
    >
      <header className="cmms-detail-shell-header">
        <button type="button" onClick={onBack} style={{ ...ghostBtn, padding: "6px 10px", flexShrink: 0 }}>
          <ArrowLeft size={16} /> {backLabel}
        </button>
        <div style={{ flex: 1, minWidth: 0, marginLeft: 8 }}>
          {title && (
            <div style={{ fontSize: 15, fontWeight: 800, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {title}
            </div>
          )}
          {subtitle && (
            <div style={{
              fontSize: 12,
              color: C.slate,
              marginTop: 2,
              lineHeight: 1.4,
              overflow: "hidden",
              overflowWrap: "anywhere",
              ...(subtitleClamp > 1
                ? { display: "-webkit-box", WebkitLineClamp: subtitleClamp, WebkitBoxOrient: "vertical" }
                : { textOverflow: "ellipsis", whiteSpace: "nowrap" }),
            }}>
              {subtitle}
            </div>
          )}
        </div>
      </header>
      {progress != null && (
        <div style={{ padding: "0 14px 10px", borderBottom: `1px solid ${C.line}` }}>
          <div style={{ height: 4, borderRadius: 4, background: tint(C.steel, 12), overflow: "hidden" }}>
            <div style={{ width: `${Math.min(100, Math.max(0, progress))}%`, height: "100%", background: C.sky, transition: "width .2s" }} />
          </div>
        </div>
      )}
      <div className="cmms-detail-shell-body">{children}</div>
      {footer && <footer className="cmms-detail-shell-footer">{footer}</footer>}
      <style>{`
        .cmms-detail-shell {
          position: fixed;
          inset: 0;
          z-index: 35;
          display: flex;
          flex-direction: column;
          background: ${C.mist};
        }
        .cmms-detail-shell-header {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 12px;
          background: ${tint(C.surface, 96)};
          border-bottom: 1px solid ${C.line};
          backdrop-filter: blur(6px);
          flex-shrink: 0;
        }
        .cmms-detail-shell-body {
          flex: 1;
          overflow-y: auto;
          padding: 16px 14px;
          -webkit-overflow-scrolling: touch;
        }
        .cmms-detail-shell-footer {
          flex-shrink: 0;
          padding: 12px 14px calc(12px + env(safe-area-inset-bottom, 0px));
          border-top: 1px solid ${C.line};
          background: ${C.surface};
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
      `}</style>
    </div>
  );
}
