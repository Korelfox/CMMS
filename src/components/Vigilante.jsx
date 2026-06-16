import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Radar, RefreshCw, Check, AlertTriangle, AlertCircle, Clock, Mail, ChevronRight, Cloud,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { useOnline } from "../lib/offline";
import { supabase } from "../lib/supabase";
import { fetchPronosticoOperacional } from "../lib/pronosticoApi";
import { insightClimaIAF } from "../lib/clima";
import { C, tint } from "../theme";
import { Card, PageHead, InlineSpinner, Empty } from "../ui";

// Severidad → color + ícono + etiqueta.
const SEV = {
  red:   { color: C.red,    Icon: AlertCircle,   label: "Crítico" },
  amber: { color: C.yellow, Icon: AlertTriangle, label: "Atención" },
  ok:    { color: C.green,  Icon: Check,         label: "OK" },
};

// A qué módulo lleva cada agente al pulsar la tarjeta.
const NAV_AGENTE = { "IA-A": "equipos", "IA-B": "ots", "IA-C": "confiab", "IA-D": "pdm", "IA-F": "tablero" };

function AgenteCard({ ins, onNav }) {
  const s = SEV[ins.severidad] || SEV.ok;
  return (
    <div onClick={onNav}
      className="cmms-clickable"
      style={{ flex: "1 1 260px", minWidth: 250, background: C.surface, border: `1px solid ${ins.severidad === "ok" ? C.line : tint(s.color, 40)}`, borderRadius: 12, padding: "14px 16px", cursor: "pointer" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 700, color: C.slate }}>{ins.agente}</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: s.color, background: tint(s.color, 12), border: `1px solid ${tint(s.color, 30)}`, borderRadius: 20, padding: "2px 9px" }}>
          <s.Icon size={12} /> {s.label}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 26, fontWeight: 800, color: s.color, lineHeight: 1 }}>{Number(ins.valor)}{ins.agente === "IA-B" ? "%" : ins.agente === "IA-F" ? " kn" : ""}</span>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: C.abyss }}>{ins.titulo}</span>
      </div>
      <div style={{ fontSize: 11.5, color: C.slate, marginTop: 6, lineHeight: 1.5 }}>{ins.detalle}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 3, marginTop: 8, fontSize: 11.5, fontWeight: 600, color: C.steel }}>
        Ir al módulo <ChevronRight size={13} />
      </div>
    </div>
  );
}

export default function Vigilante({ onNavigate }) {
  const online = useOnline();
  const { empresa } = useAuth();

  const [rows, setRows] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [evaluando, setEvaluando] = useState(false);
  const [error, setError] = useState("");
  const [climaInsight, setClimaInsight] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const { data, error: e } = await supabase
        .from("insights")
        .select("*")
        .order("corrida", { ascending: false })
        .order("generado_en", { ascending: false })
        .limit(40);
      if (e) throw e;
      setRows(data || []);
    } catch { /* conserva datos previos */ }
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    if (!online || !empresa?.puerto_base) return;
    let cancel = false;
    fetchPronosticoOperacional(empresa.puerto_base)
      .then((d) => { if (!cancel) setClimaInsight(insightClimaIAF(d)); })
      .catch(() => { if (!cancel) setClimaInsight(null); });
    return () => { cancel = true; };
  }, [online, empresa?.puerto_base]);

  // Última corrida: la fecha más reciente, un registro por agente (+ IA-F en vivo).
  const { ultima, agentes } = useMemo(() => {
    const base = !rows.length ? { ultima: null, agentes: [] } : (() => {
      const fecha = rows[0].corrida;
      const delDia = rows.filter((r) => r.corrida === fecha);
      const porAgente = new Map();
      for (const r of delDia) if (!porAgente.has(r.agente)) porAgente.set(r.agente, r);
      return { ultima: fecha, agentes: [...porAgente.values()] };
    })();
    const merged = climaInsight ? [...base.agentes.filter((a) => a.agente !== "IA-F"), climaInsight] : base.agentes;
    return { ultima: base.ultima, agentes: merged.sort((a, b) => a.agente.localeCompare(b.agente)) };
  }, [rows, climaInsight]);

  const resumen = useMemo(() => {
    const red = agentes.filter((a) => a.severidad === "red").length;
    const amber = agentes.filter((a) => a.severidad === "amber").length;
    return { red, amber, ok: agentes.length - red - amber };
  }, [agentes]);

  async function evaluarAhora() {
    setEvaluando(true); setError("");
    try {
      const { error: e } = await supabase.rpc("generar_insights");
      if (e) throw e;
      await cargar();
    } catch (e) {
      const msg = e?.message || String(e);
      setError(/insights|generar_insights|function|does not exist/i.test(msg)
        ? "Falta la migración 20260614_0004 (insights + generar_insights) en Supabase."
        : "No se pudo evaluar: " + msg);
    } finally { setEvaluando(false); }
  }

  const fechaStr = ultima ? new Date(ultima + "T12:00:00").toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" }) : null;

  return (
    <div style={{ paddingBottom: 40 }}>
      <PageHead
        kicker="Sistema · CMMS autónomo"
        title="Vigilante IA"
        sub="Los agentes de calidad de datos corren solos cada noche y dejan su veredicto aquí, aunque nadie abra la app. Vigilan que los módulos de IA reciban datos sanos."
      />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: C.purple, background: tint(C.purple, 10), border: `1px solid ${tint(C.purple, 25)}`, borderRadius: 8, padding: "5px 11px" }}>
            <Clock size={13} /> Corre cada noche · 07:30 UTC
          </span>
          {fechaStr && <span style={{ fontSize: 12.5, color: C.slate }}>Última corrida: <strong style={{ color: C.ink }}>{fechaStr}</strong></span>}
          {!cargando && agentes.length > 0 && (
            <span style={{ fontSize: 12.5, color: C.slate }}>
              {resumen.red > 0 && <strong style={{ color: C.red }}>{resumen.red} crítico · </strong>}
              {resumen.amber > 0 && <strong style={{ color: C.yellow }}>{resumen.amber} atención · </strong>}
              <span style={{ color: C.green }}>{resumen.ok} OK</span>
            </span>
          )}
        </div>
        <button onClick={evaluarAhora} disabled={evaluando || !online}
          title={!online ? "Sin conexión" : "Corre los agentes ahora"}
          style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 700, color: "#fff", background: !online ? C.slate : C.steel, border: "none", borderRadius: 8, padding: "7px 14px", cursor: evaluando || !online ? "default" : "pointer", opacity: evaluando ? 0.7 : 1 }}>
          <RefreshCw size={13} /> {evaluando ? "Evaluando…" : "Evaluar ahora"}
        </button>
      </div>

      {error && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 9, background: tint(C.red, 8), border: `1px solid ${tint(C.red, 35)}`, borderRadius: 10, padding: "11px 14px", marginBottom: 14 }}>
          <AlertTriangle size={16} color={C.red} style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 12.5, color: C.ink, lineHeight: 1.5 }}>{error}</span>
        </div>
      )}

      {cargando ? (
        <InlineSpinner label="Cargando última corrida…" />
      ) : agentes.length === 0 ? (
        <Card>
          <Empty>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <Radar size={26} color={C.slate} />
              <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink }}>Aún no hay corridas</div>
              <div style={{ fontSize: 12.5, color: C.slate, maxWidth: 420, lineHeight: 1.5 }}>
                El vigilante corre cada noche a las 07:30 UTC. Pulsa “Evaluar ahora” para generar la primera ya.
              </div>
            </div>
          </Empty>
        </Card>
      ) : (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {agentes.map((ins) => (
            <AgenteCard key={ins.agente} ins={ins}
              onNav={() => onNavigate?.(NAV_AGENTE[ins.agente] || "alertas")} />
          ))}
        </div>
      )}

      {/* Nota de bloqueo honesto: notificación por correo */}
      <Card style={{ marginTop: 16, background: tint(C.amber, 5), border: `1px solid ${tint(C.amber, 30)}` }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 11 }}>
          <Mail size={18} color={C.amber} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, marginBottom: 3 }}>Notificación por correo — pendiente</div>
            <div style={{ fontSize: 12, color: C.slate, lineHeight: 1.55 }}>
              El envío de un correo cuando hay severidad roja necesita una clave de proveedor de email
              (Resend / SendGrid) en Supabase Secrets. La vigilancia y el registro ya funcionan solos;
              solo falta esa credencial para el aviso automático.
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
