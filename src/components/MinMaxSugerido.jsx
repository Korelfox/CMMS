import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  SlidersHorizontal, TrendingUp, TrendingDown, CheckCircle2, HelpCircle,
  ChevronDown, ChevronRight, Zap,
} from "lucide-react";
import { fetchAll, updateRow } from "../lib/db";
import { analizarMinMax } from "../lib/minmax";
import { C, archivo, num, tint } from "../theme";
import { Card, PageHead, Pill, Empty, ErrorBanner, InlineSpinner } from "../ui";
import { useAuth } from "../lib/auth";

const ACCION_META = {
  aumentar: { tone: "red",    label: "Aumentar",     icon: TrendingUp   },
  reducir:  { tone: "yellow", label: "Reducir",      icon: TrendingDown },
  ok:       { tone: "green",  label: "OK",            icon: CheckCircle2 },
};

const CONF_META = {
  alta:  { tone: "green",  label: "Alta confianza"  },
  media: { tone: "yellow", label: "Media confianza" },
  baja:  { tone: "steel",  label: "Baja confianza"  },
};

export default function MinMaxSugerido() {
  const { profile } = useAuth();
  const [items,     setItems]     = useState([]);
  const [equipos,   setEquipos]   = useState([]);
  const [ots,       setOts]       = useState([]);
  const [destinos,  setDestinos]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [accionFiltro, setAccionFiltro] = useState("todas");
  const [expanded,  setExpanded]  = useState(null);
  const [applying,  setApplying]  = useState(new Set());
  const [applied,   setApplied]   = useState(new Set());

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [its, eqs, otsAll, dests] = await Promise.all([
        fetchAll("inventario_items"),
        fetchAll("equipos"),
        fetchAll("ordenes_trabajo"),
        fetchAll("inventario_item_destinos"),
      ]);
      setItems(its); setEquipos(eqs); setOts(otsAll); setDestinos(dests);
    } catch (e) { setError("No se pudieron cargar los datos. " + e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const hoy = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const analisis = useMemo(() => analizarMinMax({
    items, equipos, ots, destinos, periodoDias: 365, hoy,
  }), [items, equipos, ots, destinos, hoy]);

  const filtrado = useMemo(() => accionFiltro === "todas"
    ? analisis
    : analisis.filter((a) => a.accion === accionFiltro),
  [analisis, accionFiltro]);

  // KPIs
  const nAumentar = analisis.filter((a) => a.accion === "aumentar").length;
  const nReducir  = analisis.filter((a) => a.accion === "reducir").length;
  const nOk       = analisis.filter((a) => a.accion === "ok").length;
  const capitalLib = analisis
    .filter((a) => a.accion === "reducir")
    .reduce((s, a) => s + Math.abs(a.deltaMaxs - a.deltaMins) * (a.item.precio || 0), 0);

  const aplicar = useCallback(async (entry) => {
    if (!profile?.empresa_id) return;
    setApplying((p) => new Set(p).add(entry.item.id));
    try {
      await updateRow("inventario_items", entry.item.id, {
        stock_min: entry.minSugerido,
        stock_max: entry.maxSugerido,
      });
      setApplied((p) => new Set(p).add(entry.item.id));
      setItems((prev) => prev.map((i) => i.id === entry.item.id
        ? { ...i, stock_min: entry.minSugerido, stock_max: entry.maxSugerido }
        : i));
    } catch (e) { setError("No se pudo aplicar la sugerencia: " + e.message); }
    finally { setApplying((p) => { const n = new Set(p); n.delete(entry.item.id); return n; }); }
  }, [profile]);

  if (loading) return (
    <div>
      <PageHead kicker="Análisis" title="Min/Max Sugerido" />
      <Card><InlineSpinner label="Analizando historial de fallas…" /></Card>
    </div>
  );

  return (
    <div>
      <PageHead
        kicker="Análisis · Inventario"
        title="Min/Max Sugerido"
        sub="Recomienda niveles óptimos de stock mínimo y máximo por ítem, en función de la frecuencia de fallas correctivas en los últimos 12 meses, el tiempo de reposición y la criticidad del equipo vinculado."
      />
      <ErrorBanner onRetry={cargar}>{error}</ErrorBanner>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 16 }}>
        <KCard label="Aumentar stock"       value={nAumentar} tone={nAumentar ? C.red : C.green}   sub="ítems infra-dotados" />
        <KCard label="Reducir stock"         value={nReducir}  tone={nReducir ? C.amber : C.green} sub="ítems sobre-dotados" />
        <KCard label="Sin cambios"           value={nOk}       tone={C.green}                      sub="configurados correctamente" />
        <KCard label="Capital liberaable"
          value={capitalLib > 0 ? `$${(capitalLib / 1000).toFixed(0)}K` : "—"}
          tone={capitalLib > 0 ? C.amber : C.steel}
          sub="si se reducen excesos" />
      </div>

      {/* Aviso metodología */}
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "10px 14px", background: tint(C.steel, 8), borderRadius: 10, marginBottom: 14, fontSize: 12.5, color: C.slate }}>
        <HelpCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          Supuesto: 1 unidad de repuesto consumida por evento correctivo. Los equipos sin historial de fallas en 12 meses se tratan como sin demanda (salvo criticidad A → stock estratégico mínimo de 1 unidad).
          Alta confianza ≥ 5 correctivas, media 2-4, baja 0-1.
        </span>
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {["todas", "aumentar", "reducir", "ok"].map((a) => {
          const n = a === "todas" ? analisis.length : analisis.filter((x) => x.accion === a).length;
          return (
            <button key={a} onClick={() => setAccionFiltro(a)} style={{
              padding: "6px 14px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
              border: `1px solid ${accionFiltro === a ? C.cyan : C.line}`,
              background: accionFiltro === a ? tint(C.cyan, 6) : "transparent",
              color: accionFiltro === a ? C.cyan : C.slate,
            }}>
              {a === "todas" ? "Todos" : a.charAt(0).toUpperCase() + a.slice(1)}
              <span style={{ marginLeft: 6, opacity: 0.7 }}>({n})</span>
            </button>
          );
        })}
      </div>

      {filtrado.length === 0 ? (
        <Card><Empty>No hay ítems con el filtro seleccionado.</Empty></Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtrado.map((entry) => {
            const { item, accion, minActual, maxActual, minSugerido, maxSugerido,
              deltaMins, deltaMaxs, confianza, razon, equiposDestino } = entry;
            const meta    = ACCION_META[accion];
            const AIcon   = meta.icon;
            const confMeta = CONF_META[confianza];
            const isExp   = expanded === item.id;
            const isApp   = applied.has(item.id);
            const isApplying = applying.has(item.id);
            const sinCambio  = accion === "ok" || isApp;

            return (
              <Card key={item.id} style={{
                padding: 0, overflow: "hidden",
                borderLeft: `5px solid ${accion === "aumentar" ? C.red : accion === "reducir" ? C.amber : C.green}`,
              }}>
                <button
                  onClick={() => setExpanded(isExp ? null : item.id)}
                  style={{
                    width: "100%", display: "grid",
                    gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr 28px",
                    gap: 10, alignItems: "center", padding: "12px 16px",
                    background: "transparent", border: "none", cursor: "pointer", textAlign: "left",
                  }}
                >
                  <div>
                    <div style={{ ...archivo, fontWeight: 700, fontSize: 13.5, color: C.abyss }}>
                      {item.codigo} · {item.descripcion}
                    </div>
                    <div style={{ fontSize: 11, color: C.slate, marginTop: 2 }}>
                      {equiposDestino.length > 0
                        ? equiposDestino.slice(0, 2).map((e) => e.sistema).join(", ") + (equiposDestino.length > 2 ? ` +${equiposDestino.length - 2}` : "")
                        : "Sin equipo vinculado"}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <AIcon size={13} color={accion === "aumentar" ? C.red : accion === "reducir" ? C.amber : C.green} />
                    <Pill tone={meta.tone}>{isApp ? "Aplicado" : meta.label}</Pill>
                  </div>
                  <VCol label="Min actual" value={minActual}
                    tone={deltaMins > 0 ? C.red : deltaMins < 0 ? C.amber : C.slate} />
                  <VCol label="Min sugerido" value={minSugerido}
                    tone={deltaMins > 0 ? C.red : deltaMins < 0 ? C.amber : C.slate} />
                  <VCol label="Max actual" value={maxActual}
                    tone={deltaMaxs > 0 ? C.red : deltaMaxs < 0 ? C.amber : C.slate} />
                  <VCol label="Max sugerido" value={maxSugerido}
                    tone={deltaMaxs > 0 ? C.red : deltaMaxs < 0 ? C.amber : C.slate} />
                  <div style={{ color: C.slate, display: "flex", justifyContent: "flex-end" }}>
                    {isExp ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </div>
                </button>

                {isExp && (
                  <div style={{ borderTop: `1px solid ${C.line}`, padding: "12px 18px 14px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 16, alignItems: "start" }}>
                      <div>
                        <div style={{ fontSize: 13, color: C.ink, marginBottom: 8 }}>
                          <strong>Fundamento:</strong> {razon}
                        </div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <Pill tone={confMeta.tone}>{confMeta.label}</Pill>
                          {equiposDestino.map((e) => (
                            <Pill key={e.id} tone={e.criticidad === "A" ? "red" : e.criticidad === "B" ? "yellow" : "steel"}>
                              Crit {e.criticidad} · {e.sistema}
                            </Pill>
                          ))}
                          <Pill tone="steel">Lead: {item.lead_dias || 14}d</Pill>
                          {item.precio > 0 && <Pill tone="steel">${num(item.precio, 0)} / unidad</Pill>}
                        </div>
                      </div>
                      {!sinCambio && profile && (
                        <button
                          onClick={(e) => { e.stopPropagation(); aplicar(entry); }}
                          disabled={isApplying}
                          style={{
                            display: "flex", alignItems: "center", gap: 6, padding: "9px 18px",
                            borderRadius: 9, border: "none", cursor: isApplying ? "not-allowed" : "pointer",
                            background: C.cyan, color: "#fff", fontSize: 13, fontWeight: 700,
                            opacity: isApplying ? 0.6 : 1,
                          }}
                        >
                          <Zap size={14} />
                          {isApplying ? "Guardando…" : `Aplicar ${minSugerido}/${maxSugerido}`}
                        </button>
                      )}
                      {isApp && (
                        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: C.green, fontWeight: 700 }}>
                          <CheckCircle2 size={14} /> Actualizado
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function KCard({ label, value, tone, sub }) {
  return (
    <Card style={{ padding: 16 }}>
      <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: C.slate, fontWeight: 600 }}>{label}</div>
      <div style={{ ...archivo, fontSize: 26, fontWeight: 800, color: tone || C.steel, lineHeight: 1, marginTop: 6 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: C.slate, marginTop: 6 }}>{sub}</div>}
    </Card>
  );
}

function VCol({ label, value, tone }) {
  return (
    <div>
      <div style={{ fontSize: 10, letterSpacing: 0.5, textTransform: "uppercase", color: C.slate, fontWeight: 600 }}>{label}</div>
      <div style={{ ...archivo, fontWeight: 700, fontSize: 14, color: tone || C.ink, marginTop: 2 }}>{value}</div>
    </div>
  );
}
