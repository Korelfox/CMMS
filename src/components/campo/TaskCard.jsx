import React from "react";
import { ChevronRight } from "lucide-react";
import { C, tint } from "../../theme";
import { Pill } from "../../ui";

const TONE_BORDER = {
  red: C.red,
  amber: C.amber,
  yellow: C.amber,
  green: C.green,
  steel: C.line,
};

/** Tarjeta táctil unificada para listas Campo (OT, PM, alertas). */
export default function TaskCard({
  tone = "steel",
  badge,
  badgeLabel,
  title,
  subtitle,
  meta,
  onClick,
  cta,
  as = "button",
  style = {},
}) {
  const border = TONE_BORDER[tone] || C.line;
  const Comp = as;
  const interactive = !!onClick;

  return (
    <Comp
      type={as === "button" ? "button" : undefined}
      onClick={onClick}
      className={interactive ? "cmms-campo-touch" : undefined}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: "14px 16px",
        marginBottom: 10,
        borderRadius: 12,
        border: `1px solid ${tint(border, 35)}`,
        background: tone === "red" ? C.redBg : tone === "amber" || tone === "yellow" ? C.yellowBg : C.surface,
        cursor: interactive ? "pointer" : "default",
        fontFamily: "inherit",
        ...style,
      }}
    >
      {(badge || badgeLabel) && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
          {badgeLabel && <Pill tone={tone}>{badgeLabel}</Pill>}
          {badge && (
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 800, fontSize: 13, color: C.steel }}>
              {badge}
            </span>
          )}
        </div>
      )}
      <div style={{
        fontSize: 16, fontWeight: 700, color: C.ink, lineHeight: 1.35,
        overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
        overflowWrap: "anywhere",
      }}>{title}</div>
      {subtitle && (
        <div style={{
          fontSize: 14, color: C.slate, marginTop: 5, lineHeight: 1.4,
          overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
          overflowWrap: "anywhere",
        }}>{subtitle}</div>
      )}
      {meta && (
        <div style={{ fontSize: 13, color: C.steel, marginTop: 6 }}>{meta}</div>
      )}
      {cta && (
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 10, fontSize: 13, fontWeight: 700, color: C.sky }}>
          {cta} <ChevronRight size={15} />
        </div>
      )}
    </Comp>
  );
}
