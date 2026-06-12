import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Anchor, CheckCircle2, AlertTriangle, XCircle, ChevronRight, Waves } from "lucide-react";
import { fetchAll } from "../lib/db";
import { evaluarPlanes } from "../lib/pm";
import { evaluarZarpe, diasEnMar } from "../lib/operacional";
import { C, archivo, num, tint } from "../theme";
import { Card, PageHead, Pill, Empty, ErrorBanner, InlineSpinner } from "../ui";

// Apariencia de cada nivel del semáforo de zarpe
const NIVEL_META = {
  go:          { label: "GO — Lista para zarpar", color: C.green, icon: CheckCircle2 },
  condicional: { label: "CONDICIONAL — Zarpe con observaciones", color: C.amber, icon: AlertTriangle },
  nogo:        { label: "NO-GO — Zarpe bloqueado", color: C.red, icon: XCircle },
};

export default function EstadoFlota({ onNavigate }) {
  const [embarcaciones, setEmbarcaciones] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [ots, setOts] = useState([]);
  const [documentos, setDocumentos] = useState([]);
  const [planes, setPlanes] = useState([]);
  const [mareas, setMareas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [embs, eqs, otsAll, docs, pls, mrs] = await Promise.all([
        fetchAll("embarcaciones", { order: { col: "codigo", asc: true } }),
        fetchAll("equipos"),
        fetchAll("ordenes_trabajo"),
        fetchAll("documentos"),
        fetchAll("planes_pm"),
        fetchAll("mareas"),
      ]);
      setEmbarcaciones(embs); setEquipos(eqs); setOts(otsAll);
      setDocumentos(docs); setPlanes(pls); setMareas(mrs);
    } catch (e) { setError("No se pudo cargar el estado de flota. " + e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  // Evaluación por nave: semáforo + utilización + marea en curso
  const flota = useMemo(() => {
    const planesEval = evaluarPlanes(planes, equipos);
    const ahora = Date.now();
    return embarcaciones.map((emb) => {
      const zarpe = evaluarZarpe(emb.id, { equipos, ots, documentos, planesEval });
      const enMar = mareas.some((m) => m.embarcacion_id === emb.id && m.estado === "navegando");
      const utilizacion = diasEnMar(mareas, emb.id, ahora, 30);
      return { emb, zarpe, enMar, utilizacion };
    });
  }, [embarcaciones, equipos, ots, documentos, planes, mareas]);

  const nGo   = flota.filter((f) => f.zarpe.nivel === "go").length;
  const nCond = flota.filter((f) => f.zarpe.nivel === "condicional").length;
  const nNogo = flota.filter((f) => f.zarpe.nivel === "nogo").length;
  const pctDisponible = flota.length ? Math.round(((nGo + nCond) / flota.length) * 100) : 0;

  if (loading) return <div><PageHead kicker="Sala de Control" title="Estado de Flota" /><Card><InlineSpinner label="Evaluando flota…" /></Card></div>;

  return (
    <div>
      <PageHead kicker="Sala de Control · Decisión de Zarpe" title="Estado de Flota"
        sub="GO / NO-GO por nave, calculado del estado real: equipos críticos, certificados, OTs abiertas y plan preventivo. El detalle indica exactamente qué resolver para liberar el zarpe." />

      <ErrorBanner onRetry={cargar}>{error}</ErrorBanner>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 16 }}>
        <KPI label="Naves GO" value={nGo} tone={C.green} sub="sin restricciones" />
        <KPI label="Condicionales" value={nCond} tone={nCond ? C.amber : C.green} sub="zarpe con observaciones" />
        <KPI label="Bloqueadas (NO-GO)" value={nNogo} tone={nNogo ? C.red : C.green} sub="requieren resolución" />
        <KPI label="Flota disponible" value={`${pctDisponible}%`} tone={pctDisponible >= 80 ? C.green : pctDisponible >= 50 ? C.amber : C.red} sub={`${nGo + nCond} de ${flota.length} naves`} />
      </div>

      {flota.length === 0 ? (
        <Card><Empty>Sin embarcaciones registradas. Crea la flota en Embarcaciones para activar la sala de control.</Empty></Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {flota.map(({ emb, zarpe, enMar, utilizacion }) => {
            const meta = NIVEL_META[zarpe.nivel];
            const Icon = meta.icon;
            const razones = [
              ...zarpe.bloqueos.map((r) => ({ ...r, sev: "nogo" })),
              ...zarpe.advertencias.map((r) => ({ ...r, sev: "warn" })),
            ];
            const pctUtil = Math.min(100, (utilizacion / 30) * 100);
            return (
              <Card key={emb.id} style={{ padding: 0, overflow: "hidden", borderLeft: `5px solid ${meta.color}` }}>
                {/* Cabecera de la nave */}
                <div style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", background: tint(meta.color, 6) }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: C.surface, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Anchor size={20} color={emb.color || C.steel} />
                  </div>
                  <div style={{ flex: "1 1 200px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ ...archivo, fontWeight: 800, fontSize: 16, color: C.abyss }}>{emb.nombre}</span>
                      {enMar && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, color: C.cyan, background: tint(C.cyan, 12), borderRadius: 6, padding: "2px 8px" }}>
                          <Waves size={11} /> En el mar
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11.5, color: C.slate, marginTop: 2 }}>{emb.codigo || ""}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Icon size={20} color={meta.color} />
                    <span style={{ fontWeight: 800, fontSize: 13.5, color: meta.color }}>{meta.label}</span>
                  </div>
                  {/* Utilización 30 días */}
                  <div style={{ flexBasis: 180 }}>
                    <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, color: C.slate, fontWeight: 600, marginBottom: 3 }}>
                      Días en mar (30d): {num(utilizacion, 1)}
                    </div>
                    <div style={{ height: 6, background: tint(C.slate, 14), borderRadius: 3 }}>
                      <div style={{ height: "100%", width: `${pctUtil}%`, background: C.cyan, borderRadius: 3 }} />
                    </div>
                  </div>
                </div>

                {/* Razones (qué resolver para liberar el zarpe) */}
                {razones.length > 0 && (
                  <div style={{ padding: "10px 18px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
                    {razones.map((r, i) => (
                      <div key={i}
                        onClick={onNavigate ? () => onNavigate(r.nav, r.ref ? { otId: r.ref } : null) : undefined}
                        title={onNavigate ? "Ir al módulo para resolverlo" : undefined}
                        style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, padding: "7px 10px", borderRadius: 7, cursor: onNavigate ? "pointer" : "default", background: r.sev === "nogo" ? tint(C.red, 7) : tint(C.amber, 8), color: C.ink }}>
                        {r.sev === "nogo" ? <XCircle size={14} color={C.red} style={{ flexShrink: 0 }} /> : <AlertTriangle size={14} color={C.amber} style={{ flexShrink: 0 }} />}
                        <span style={{ flex: 1 }}>{r.texto}</span>
                        <Pill tone={r.sev === "nogo" ? "red" : "yellow"}>{r.sev === "nogo" ? "Bloquea" : "Observación"}</Pill>
                        {onNavigate && <ChevronRight size={14} color={C.slate} />}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Card style={{ marginTop: 16, background: C.mist }}>
        <div style={{ fontSize: 12.5, color: C.slate, lineHeight: 1.7 }}>
          <strong style={{ color: C.ink }}>Reglas del semáforo:</strong>{" "}
          <strong style={{ color: C.red }}>NO-GO</strong> = equipo crítico (A) fuera de servicio, certificado vencido u OT crítica abierta.{" "}
          <strong style={{ color: C.amber }}>CONDICIONAL</strong> = crítico en reparación, equipo menor fuera de servicio, OT alta, PM vencido en crítico o documento por vencer (≤ 7 días).{" "}
          Cada observación es clicable y lleva al módulo donde se resuelve. La decisión final de zarpe es del armador/capitán — este panel asegura que se tome con la información completa.
        </div>
      </Card>
    </div>
  );
}

function KPI({ label, value, tone, sub }) {
  return (
    <Card style={{ padding: 16 }}>
      <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: C.slate, fontWeight: 600 }}>{label}</div>
      <div style={{ ...archivo, fontSize: 26, fontWeight: 800, color: tone || C.steel, lineHeight: 1, marginTop: 6 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: C.slate, marginTop: 6 }}>{sub}</div>}
    </Card>
  );
}
