import React, { useMemo } from "react";
import { ChevronRight } from "lucide-react";
import { useAuth } from "../lib/auth";
import { C, tint, isAdmin, isSuperAdmin } from "../theme";
import { ModuleShell, Section } from "../ui";
import {
  ANALISIS_GROUPS, ANALISIS_CARD_META, filterNavIds, navItem,
} from "../lib/navigation";

const perms = { isAdmin, isSuperAdmin };

export default function HubAnalisis({ onNavigate }) {
  const { profile } = useAuth();

  const groups = useMemo(() => {
    return ANALISIS_GROUPS.map((g) => ({
      ...g,
      items: filterNavIds(g.items, profile, perms)
        .map(navItem)
        .filter(Boolean),
    })).filter((g) => g.items.length > 0);
  }, [profile]);

  return (
    <ModuleShell
      kicker="Modo Oficina · Hub secundario"
      title="Análisis"
      sub="KPIs avanzados, modelos predictivos y herramientas de decisión — fuera del menú principal para reducir ruido."
    >
      {groups.map((g) => (
        <Section key={g.id} title={g.label} description={g.description} style={{ marginBottom: 20 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              gap: 12,
            }}
          >
            {g.items.map((item) => {
              const meta = ANALISIS_CARD_META[item.id] || {};
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate?.(item.id)}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    gap: 8,
                    padding: "16px 18px",
                    borderRadius: 12,
                    border: `1px solid ${C.line}`,
                    background: C.surface,
                    cursor: "pointer",
                    textAlign: "left",
                    fontFamily: "inherit",
                    transition: "border-color .15s, box-shadow .15s",
                    boxShadow: "0 1px 2px rgba(0,0,0,.04)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = tint(C.sky, 35);
                    e.currentTarget.style.boxShadow = `0 4px 14px ${tint(C.sky, 12)}`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = C.line;
                    e.currentTarget.style.boxShadow = "0 1px 2px rgba(0,0,0,.04)";
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", gap: 8 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 800, color: C.ink }}>
                      <Icon size={18} color={C.sky} strokeWidth={2.2} />
                      {item.label}
                    </span>
                    <ChevronRight size={16} color={C.slate} />
                  </div>
                  {meta.desc && (
                    <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.45, color: C.slate }}>
                      {meta.desc}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </Section>
      ))}
    </ModuleShell>
  );
}
