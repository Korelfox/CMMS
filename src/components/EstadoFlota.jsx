import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  Anchor, CheckCircle2, AlertTriangle, XCircle, ChevronRight, Waves,
  RefreshCw, Ship,
} from "lucide-react";
import { fetchAll } from "../lib/db";
import { evaluarPlanes } from "../lib/pm";
import { evaluarZarpe, diasEnMar } from "../lib/operacional";
import { C, archivo, num, tint } from "../theme";
import {
  ModuleShell, StatGrid, HeroStat, Section, EmptyState, Pill,
  ghostBtn, LinkButton,
} from "../ui";

const NIVEL_META = {
  go:          { label: "GO", full: "Lista para zarpar", color: C.green, icon: CheckCircle2, variant: "ok" },
  condicional: { label: "CONDICIONAL", full: "Zarpe con observaciones", color: C.amber, icon: AlertTriangle, variant: "warn" },
  nogo:        { label: "NO-GO", full: "Zarpe bloqueado", color: C.red, icon: XCircle, variant: "critical" },
};

export default function EstadoFlota({ onNavigate }) {
  const [embarcaciones, setEmbarcaciones] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [ots, setOts] = useState([]);
  const [documentos, setDocumentos] = useState([]);
  const [planes, setPlanes] = useState([]);
  const [mareas, setMareas] = useState([]);
  const [varadas, setVaradas] = useState([]);
  const [varadaTrabajos, setVaradaTrabajos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [embs, eqs, otsAll, docs, pls, mrs, vars, vtrabs] = await Promise.all([
        fetchAll("embarcaciones", { order: { col: "codigo", asc: true } }),
        fetchAll("equipos"),
        fetchAll("ordenes_trabajo"),
        fetchAll("documentos"),
        fetchAll("planes_pm"),
        fetchAll("mareas"),
        fetchAll("varadas"),
        fetchAll("varada_trabajos"),
      ]);
      setEmbarcaciones(embs);
      setEquipos(eqs);
      setOts(otsAll);
      setDocumentos(docs);
      setPlanes(pls);
      setMareas(mrs);
      setVaradas(vars);
      setVaradaTrabajos(vtrabs);
    } catch (e) {
      setError("No se pudo cargar el estado de flota. " + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const flota = useMemo(() => {
    const planesEval = evaluarPlanes(planes, equipos);
    const ahora = Date.now();
    return embarcaciones.map((emb) => {
      const zarpe = evaluarZarpe(emb.id, { equipos, ots, documentos, planesEval, varadas, varadaTrabajos });
      const enMar = mareas.some((m) => m.embarcacion_id === emb.id && m.estado === "navegando");
      const utilizacion = diasEnMar(mareas, emb.id, ahora, 30);
      return { emb, zarpe, enMar, utilizacion };
    });
  }, [embarcaciones, equipos, ots, documentos, planes, mareas, varadas, varadaTrabajos]);

  const nGo   = flota.filter((f) => f.zarpe.nivel === "go").length;
  const nCond = flota.filter((f) => f.zarpe.nivel === "condicional").length;
  const nNogo = flota.filter((f) => f.zarpe.nivel === "nogo").length;
  const pctDisponible = flota.length ? Math.round(((nGo + nCond) / flota.length) * 100) : 0;

  const heroVariant = nNogo > 0 ? "critical" : nCond > 0 ? "warn" : "ok";
  const nav = (id, ref) => onNavigate?.(id, ref ? { otId: ref } : null);

  return (
    <ModuleShell
      kicker="Sala de control · Decisión de zarpe"
      title="Estado de Flota"
      sub="Semáforo GO / NO-GO por nave según equipos críticos, certificados, OTs abiertas, PM y trabajos de varada bloqueantes. Cada observación es clicable."
      loading={loading}
      error={error}
      onRetry={cargar}
      action={
        <button type="button" onClick={cargar} title="Actualizar" data-nofx style={{ ...ghostBtn, padding: "10px 12px", display: "inline-flex", alignItems: "center" }}>
          <RefreshCw size={15} />
        </button>
      }
    >
      {!loading && (
        <>
          <StatGrid
            hero={
              <HeroStat
                variant={heroVariant}
                icon={nNogo > 0 ? XCircle : nCond > 0 ? AlertTriangle : CheckCircle2}
                label="Disponibilidad de flota"
                value={`${pctDisponible}%`}
                sub={`${nGo} GO · ${nCond} condicional${nCond !== 1 ? "es" : ""} · ${nNogo} bloqueada${nNogo !== 1 ? "s" : ""} · ${flota.length} nave${flota.length !== 1 ? "s" : ""}`}
                onClick={() => nav("alertas")}
              />
            }
            stats={[
              { label: "Naves GO", value: nGo, sub: "sin restricciones", icon: CheckCircle2, tone: C.green },
              { label: "Condicionales", value: nCond, sub: "zarpe con observaciones", icon: AlertTriangle, tone: nCond ? C.amber : C.green },
            ]}
          />

          <StatGrid
            stats={[
              { label: "Bloqueadas NO-GO", value: nNogo, sub: "requieren resolución", icon: XCircle, tone: nNogo ? C.red : C.green },
              { label: "Embarcaciones", value: flota.length, sub: "en evaluación", icon: Ship, tone: C.steel },
              { label: "En el mar", value: flota.filter((f) => f.enMar).length, sub: "navegando ahora", icon: Waves, tone: C.cyan },
              { label: "Varadas activas", value: varadas.filter((v) => v.estado === "ejecucion").length, sub: "mantenimiento mayor", icon: Anchor, tone: C.amber, onClick: () => nav("varada") },
            ]}
          />

          {flota.length === 0 ? (
            <Section title="Flota" padding={0}>
              <EmptyState
                icon={Ship}
                title="Sin embarcaciones registradas"
                description="Crea tu flota en Embarcaciones para activar la sala de control y el semáforo de zarpe."
                action={
                  <button type="button" onClick={() => nav("embarcaciones")} style={{ ...ghostBtn, borderColor: C.steel, color: C.steel }}>
                    Ir a Embarcaciones
                  </button>
                }
              />
            </Section>
          ) : (
            <Section
              title="Semáforo por embarcación"
              description="Cada tarjeta resume el estado de zarpe. Haz clic en una observación para ir al módulo donde se resuelve."
              padding={0}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 16 }}>
                {flota.map(({ emb, zarpe, enMar, utilizacion }) => {
                  const meta = NIVEL_META[zarpe.nivel];
                  const Icon = meta.icon;
                  const razones = [
                    ...zarpe.bloqueos.map((r) => ({ ...r, sev: "nogo" })),
                    ...zarpe.advertencias.map((r) => ({ ...r, sev: "warn" })),
                  ];
                  const pctUtil = Math.min(100, (utilizacion / 30) * 100);

                  return (
                    <div
                      key={emb.id}
                      style={{
                        borderRadius: 14,
                        border: `1px solid ${C.line}`,
                        borderLeft: `5px solid ${meta.color}`,
                        overflow: "hidden",
                        background: C.surface,
                        boxShadow: "0 1px 3px rgba(10,26,42,.05)",
                      }}
                    >
                      <div style={{
                        padding: "16px 20px",
                        display: "flex",
                        alignItems: "center",
                        gap: 16,
                        flexWrap: "wrap",
                        background: tint(meta.color, 5),
                      }}>
                        <div style={{
                          width: 44, height: 44, borderRadius: 12, background: C.surface,
                          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                          border: `1px solid ${C.line}`,
                        }}>
                          <Anchor size={22} color={emb.color || C.steel} />
                        </div>

                        <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <span style={{ ...archivo, fontWeight: 800, fontSize: 17, color: C.abyss }}>{emb.nombre}</span>
                            {enMar && (
                              <Pill tone="cyan">
                                <Waves size={11} /> En el mar
                              </Pill>
                            )}
                          </div>
                          <div style={{ fontSize: 12, color: C.slate, marginTop: 3, fontFamily: "'IBM Plex Mono', monospace" }}>
                            {emb.codigo || "—"}
                          </div>
                        </div>

                        <div style={{
                          display: "inline-flex", alignItems: "center", gap: 8,
                          padding: "8px 14px", borderRadius: 10,
                          background: tint(meta.color, 12), border: `1px solid ${tint(meta.color, 35)}`,
                        }}>
                          <Icon size={18} color={meta.color} />
                          <div>
                            <div style={{ fontWeight: 800, fontSize: 13, color: meta.color }}>{meta.label}</div>
                            <div style={{ fontSize: 11, color: C.slate }}>{meta.full}</div>
                          </div>
                        </div>

                        <div style={{ flexBasis: 180, minWidth: 140 }}>
                          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.6, color: C.slate, fontWeight: 700, marginBottom: 4 }}>
                            Utilización 30d · {num(utilizacion, 1)} días
                          </div>
                          <div style={{ height: 6, background: tint(C.slate, 12), borderRadius: 3, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${pctUtil}%`, background: C.cyan, borderRadius: 3 }} />
                          </div>
                        </div>
                      </div>

                      {razones.length > 0 && (
                        <div style={{ padding: "12px 20px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
                          {razones.map((r, i) => (
                            <button
                              key={i}
                              type="button"
                              data-nofx
                              onClick={onNavigate ? () => nav(r.nav, r.ref) : undefined}
                              style={{
                                display: "flex", alignItems: "center", gap: 10, width: "100%",
                                fontSize: 13, padding: "10px 12px", borderRadius: 10, cursor: onNavigate ? "pointer" : "default",
                                background: r.sev === "nogo" ? tint(C.red, 7) : tint(C.amber, 8),
                                border: `1px solid ${r.sev === "nogo" ? tint(C.red, 25) : tint(C.amber, 30)}`,
                                textAlign: "left", fontFamily: "inherit", color: C.ink,
                              }}
                            >
                              {r.sev === "nogo"
                                ? <XCircle size={15} color={C.red} style={{ flexShrink: 0 }} />
                                : <AlertTriangle size={15} color={C.amber} style={{ flexShrink: 0 }} />}
                              <span style={{ flex: 1 }}>{r.texto}</span>
                              <Pill tone={r.sev === "nogo" ? "red" : "yellow"}>{r.sev === "nogo" ? "Bloquea" : "Observación"}</Pill>
                              {onNavigate && <ChevronRight size={14} color={C.slate} />}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          <Section title="Reglas del semáforo" padding={20} style={{ marginBottom: 0 }}>
            <div style={{ fontSize: 13, color: C.slate, lineHeight: 1.75 }}>
              <strong style={{ color: C.ink }}>NO-GO</strong> — equipo crítico (A) fuera de servicio, certificado vencido u OT crítica abierta.{" "}
              <strong style={{ color: C.ink }}>CONDICIONAL</strong> — crítico en reparación, equipo menor fuera de servicio, OT alta, PM vencido en crítico, documento por vencer (≤ 7 días) o varada sin bloqueos críticos pendientes.{" "}
              La varada escala a <strong style={{ color: C.red }}>NO-GO</strong> si un trabajo marcado «Crítico zarpe» sigue pendiente.{" "}
              La decisión final de zarpe es del armador/capitán — este panel asegura información completa.
            </div>
          </Section>
        </>
      )}
    </ModuleShell>
  );
}
