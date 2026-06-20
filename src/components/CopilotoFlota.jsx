import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  Bot, Send, RotateCcw, Copy, Check, AlertCircle, Sparkles, Trash2,
} from "lucide-react";
import { useFleetData } from "../hooks/useFleetData";
import { supabase } from "../lib/supabase";
import { evaluarPlanes } from "../lib/pm";
import { riesgoFlota } from "../lib/riesgo";
import { construirContextoCopiloto } from "../lib/contextoIA";
import { renderMarkdown } from "./Markdown";
import { useAuth } from "../lib/auth";
import { C } from "../theme";
import { Card, PageHead, Pill, ErrorBanner, InlineSpinner } from "../ui";
import { hoyLocal } from "../lib/fechas";

const CHIPS = [
  "Resume el estado de la flota",
  "¿Qué equipos tienen mayor riesgo de falla?",
  "¿Cuántos PMs han vencido y en qué naves?",
  "Prioridades de mantenimiento para esta semana",
  "¿Hay repuestos críticos sin stock?",
  "¿Cuál es el estado del backlog de OTs?",
];

const SPEC = [
  { tabla: "embarcaciones",      opts: { order: { col: "codigo", asc: true } } },
  "equipos",
  "planes_pm",
  "ordenes_trabajo",
  "inventario_items",
  "inventario_item_destinos",
  "stock",
  { tabla: "lecturas_horometro", opts: { order: { col: "fecha", asc: false } }, soft: true },
];

export default function CopilotoFlota() {
  const { empresa } = useAuth();
  const [raw, loading, error, reload] = useFleetData(SPEC);
  const [messages, setMessages] = useState([]);
  const [input, setInput]       = useState("");
  const [streaming, setStreaming]   = useState(false);
  const [streamText, setStreamText] = useState("");
  const [genError, setGenError]     = useState(null);
  const abortRef  = useRef(null);
  const bottomRef = useRef(null);

  useEffect(() => () => { if (abortRef.current) abortRef.current.abort(); }, []);

  const hoy = useMemo(() => hoyLocal(), []);

  const data = useMemo(() => {
    if (!raw) return null;
    const planesEval    = evaluarPlanes(raw.planes_pm, raw.equipos);
    const riesgoRanking = riesgoFlota({ planesEval, ots: raw.ordenes_trabajo, equipos: raw.equipos, hoy });
    return {
      embs:       raw.embarcaciones,
      equipos:    raw.equipos,
      planesEval,
      riesgoRanking,
      ots:        raw.ordenes_trabajo,
      items:      raw.inventario_items,
      destinos:   raw.inventario_item_destinos,
      stock:      raw.stock,
      lecturas:   raw.lecturas_horometro,
    };
  }, [raw, hoy]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, streamText]);

  const contexto = useMemo(() => {
    if (!data) return null;
    return construirContextoCopiloto({
      empresa,
      embarcaciones: data.embs,
      equipos:       data.equipos,
      planesEval:    data.planesEval,
      riesgoRanking: data.riesgoRanking,
      ots:           data.ots,
      items:         data.items,
      destinos:      data.destinos,
      stock:         data.stock,
      lecturas:      data.lecturas,
      hoy,
    });
  }, [data, empresa, hoy]);

  const enviar = useCallback(async (texto = null) => {
    const content = (texto ?? input).trim();
    if (!content || streaming || !contexto) return;

    const newMsg  = { role: "user", content };
    const history = [...messages, newMsg];
    setMessages(history);
    setInput("");
    setGenError(null);
    setStreamText("");
    setStreaming(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Sesión no válida. Vuelve a iniciar sesión.");

      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/copiloto-flota`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
          "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ messages: history, contexto }),
        signal: ctrl.signal,
      });

      if (!resp.ok) {
        let payload = {};
        try { payload = await resp.json(); } catch { /* sin json */ }
        const msg = resp.status === 503 || payload.error === "FALTA_API_KEY"
          ? "FALTA_API_KEY"
          : (payload.error || `Error ${resp.status} del servidor.`);
        setGenError(msg);
        setStreaming(false);
        return;
      }

      const reader    = resp.body.getReader();
      const decoder   = new TextDecoder();
      let buf = "", accumulated = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const blocks = buf.split("\n\n");
        buf = blocks.pop() || "";
        for (const block of blocks) {
          const line = block.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          const raw = line.slice(5).trim();
          if (!raw) continue;
          let obj;
          try { obj = JSON.parse(raw); } catch { continue; }
          if (obj.text)  { accumulated += obj.text; setStreamText(accumulated); }
          if (obj.error) setGenError(obj.error);
        }
      }
      if (accumulated) {
        setMessages((prev) => [...prev, { role: "assistant", content: accumulated }]);
        setStreamText("");
      }
    } catch (e) {
      if (e.name !== "AbortError") setGenError(e.message || String(e));
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [input, messages, streaming, contexto]);

  const cancelar = useCallback(() => { abortRef.current?.abort(); }, []);
  const limpiar  = useCallback(() => {
    setMessages([]); setStreamText(""); setGenError(null);
  }, []);

  if (loading) return (
    <div>
      <PageHead kicker="Inteligencia · IA" title="Copiloto de Flota" />
      <Card><InlineSpinner label="Cargando datos de la flota…" /></Card>
    </div>
  );

  const pmVencidos  = contexto?.mantenimiento?.pmVencidos  ?? 0;
  const enRojo      = contexto?.riesgo?.enZonaRoja         ?? 0;
  const otsAbiertas = contexto?.mantenimiento?.otsAbiertas ?? 0;
  const nNaves      = contexto?.flota?.length              ?? 0;
  const sinStock    = contexto?.inventario?.repuestosCriticosSinStock?.length ?? 0;
  const noMessages  = messages.length === 0 && !streamText;

  return (
    <div>
      <PageHead
        kicker="Inteligencia · IA"
        title="Copiloto de Flota"
        sub={`Pregunta sobre el estado de tu flota. Claude tiene acceso al contexto real: equipos, PMs, OTs, riesgo e inventario de ${contexto?.empresa || "tu empresa"}.`}
      />
      <ErrorBanner onRetry={reload}>{error}</ErrorBanner>

      {/* Context bar */}
      {contexto && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          <Pill tone="steel">{nNaves} nave{nNaves !== 1 ? "s" : ""}</Pill>
          <Pill tone="steel">{contexto.equipos?.total || 0} equipos · {contexto.equipos?.criticidadA || 0} crit A</Pill>
          <Pill tone={pmVencidos > 0 ? "red" : "green"}>{pmVencidos} PM{pmVencidos !== 1 ? "s" : ""} vencido{pmVencidos !== 1 ? "s" : ""}</Pill>
          <Pill tone={enRojo > 0 ? "red" : "green"}>{enRojo} en zona roja</Pill>
          <Pill tone={otsAbiertas > 5 ? "yellow" : "steel"}>{otsAbiertas} OT{otsAbiertas !== 1 ? "s" : ""} abiertas</Pill>
          {sinStock > 0 && <Pill tone="red">{sinStock} rep. crítico{sinStock !== 1 ? "s" : ""} sin stock</Pill>}
        </div>
      )}

      {/* Messages */}
      {noMessages ? (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: C.cyan, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Bot size={22} color="#fff" />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14.5, color: C.abyss, marginBottom: 5 }}>Copiloto IA · listo</div>
              <div style={{ fontSize: 13, color: C.slate, lineHeight: 1.65 }}>
                Tengo acceso al estado actual de{" "}
                <strong style={{ color: C.ink }}>{contexto?.empresa || "tu flota"}</strong> —{" "}
                {nNaves} nave{nNaves !== 1 ? "s" : ""}, {contexto?.equipos?.total || 0} equipos
                ({contexto?.equipos?.criticidadA || 0} de criticidad A).
                {pmVencidos > 0 && <> Hay <strong style={{ color: C.red }}>{pmVencidos} PM{pmVencidos !== 1 ? "s" : ""} vencido{pmVencidos !== 1 ? "s" : ""}</strong>.</>}
                {" "}Pregúntame lo que necesites.
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {CHIPS.map((chip) => (
              <button key={chip} onClick={() => enviar(chip)} disabled={streaming || !contexto}
                style={{ padding: "8px 14px", borderRadius: 20, border: `1px solid ${C.line}`, background: "transparent", color: C.ink, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}>
                {chip}
              </button>
            ))}
          </div>
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 12 }}>
          {messages.map((m, i) => (
            <MessageBubble key={i} role={m.role} content={m.content} />
          ))}
          {streamText && <MessageBubble role="assistant" content={streamText} streaming />}
          {streaming && !streamText && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 4px" }}>
              <Sparkles size={16} color={C.cyan} className="pulse" />
              <span style={{ fontSize: 13, color: C.slate }}>Analizando la flota…</span>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )}

      {genError === "FALTA_API_KEY" && (
        <Card style={{ borderLeft: `5px solid ${C.amber}`, marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 10, fontSize: 13, color: C.ink }}>
            <AlertCircle size={18} color={C.amber} style={{ flexShrink: 0 }} />
            <span>
              <strong>Falta configurar la clave de Claude</strong>{" "}
              (<code style={codeStyle}>ANTHROPIC_API_KEY</code>) en Supabase → Edge Functions → Secrets.
            </span>
          </div>
        </Card>
      )}
      {genError && genError !== "FALTA_API_KEY" && (
        <Card style={{ borderLeft: `5px solid ${C.red}`, marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 10, fontSize: 13, color: C.ink }}>
            <AlertCircle size={18} color={C.red} style={{ flexShrink: 0 }} />
            <span>{genError}</span>
          </div>
        </Card>
      )}

      {/* Input bar sticky */}
      <div style={{ position: "sticky", bottom: 20, zIndex: 10, marginTop: 16 }}>
        <div style={{
          background: "var(--card-bg)",
          border: `1px solid ${C.line}`,
          borderRadius: 14,
          padding: "12px 14px",
          boxShadow: "0 4px 20px rgba(0,0,0,.12)",
          backdropFilter: "blur(8px)",
        }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); }
              }}
              placeholder="Escribe tu pregunta… (Enter envía · Shift+Enter nueva línea)"
              rows={2}
              disabled={streaming}
              style={{ flex: 1, padding: "9px 12px", borderRadius: 9, border: `1px solid ${C.line}`, fontSize: 13, resize: "none", fontFamily: "inherit", background: "var(--card-bg)", color: C.ink, outline: "none", lineHeight: 1.5, boxSizing: "border-box" }}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {!streaming ? (
                <button onClick={() => enviar()} disabled={!input.trim() || !contexto}
                  style={{ ...btnPrimary, opacity: !input.trim() || !contexto ? 0.5 : 1, cursor: !input.trim() || !contexto ? "not-allowed" : "pointer" }}>
                  <Send size={17} />
                </button>
              ) : (
                <button onClick={cancelar} style={{ ...btnPrimary, background: C.slate }}>
                  <RotateCcw size={17} />
                </button>
              )}
              {messages.length > 0 && !streaming && (
                <button onClick={limpiar} title="Nueva conversación" style={btnGhost}>
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          </div>
          {messages.length > 0 && (
            <div style={{ fontSize: 11, color: C.slate, marginTop: 6, paddingLeft: 2 }}>
              {messages.length} mensaje{messages.length !== 1 ? "s" : ""} · contexto actualizado {hoy}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.35} }
        @keyframes blink  { 0%,100%{opacity:1} 50%{opacity:0}  }
        .pulse  { animation: pulse 1.4s ease-in-out infinite; }
        .cursor { animation: blink 1s step-start infinite; display:inline-block; width:8px; height:15px; background:${C.cyan}; vertical-align:middle; margin-left:2px; }
      `}</style>
    </div>
  );
}

function MessageBubble({ role, content, streaming = false }) {
  const [copiado, setCopiado] = useState(false);
  const isUser = role === "user";

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch { /* sin permiso de portapapeles */ }
  };

  return (
    <div style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start", gap: 8, alignItems: "flex-start" }}>
      {!isUser && (
        <div style={{ width: 30, height: 30, borderRadius: 8, background: C.cyan, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
          <Bot size={16} color="#fff" />
        </div>
      )}
      <div style={{
        maxWidth: "76%",
        background:   isUser ? C.cyan : "var(--card-bg)",
        color:        isUser ? "#fff"  : C.ink,
        borderRadius: isUser ? "14px 14px 4px 14px" : "4px 14px 14px 14px",
        padding:      "10px 14px",
        boxShadow:    "0 1px 4px rgba(0,0,0,.08)",
        border:       isUser ? "none" : `1px solid ${C.line}`,
        position:     "relative",
      }}>
        {isUser ? (
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{content}</p>
        ) : (
          <div style={{ fontSize: 13.5, paddingRight: content && !streaming ? 20 : 0 }}>
            {renderMarkdown(content)}
            {streaming && <span className="cursor" />}
          </div>
        )}
        {!isUser && !streaming && content && (
          <button onClick={copiar}
            style={{ position: "absolute", top: 6, right: 8, background: "none", border: "none", cursor: "pointer", padding: 3, opacity: copiado ? 1 : 0.35, transition: "opacity .2s" }}
            title="Copiar">
            {copiado ? <Check size={13} color={C.green} /> : <Copy size={13} color={C.slate} />}
          </button>
        )}
      </div>
    </div>
  );
}

const btnPrimary = { display: "flex", alignItems: "center", justifyContent: "center", width: 42, height: 42, borderRadius: 10, border: "none", background: C.cyan, color: "#fff", cursor: "pointer", flexShrink: 0 };
const btnGhost   = { display: "flex", alignItems: "center", justifyContent: "center", width: 42, height: 42, borderRadius: 10, border: `1px solid ${C.line}`, background: "transparent", color: C.slate, cursor: "pointer", flexShrink: 0 };
const codeStyle  = { background: "var(--card-bg)", border: `1px solid ${C.line}`, borderRadius: 5, padding: "1px 6px", fontSize: 12, margin: "0 3px", fontFamily: "monospace" };
