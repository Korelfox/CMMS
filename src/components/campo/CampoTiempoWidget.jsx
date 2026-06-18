import React, { useCallback, useEffect, useState } from "react";
import { Cloud, Wind, Waves, RefreshCw, Sun, CloudRain, CloudFog } from "lucide-react";
import { useAuth } from "../../lib/auth";
import { fetchPronosticoOperacional } from "../../lib/pronosticoApi";
import {
  etiquetaClima,
  evaluarSemáforosOperacionales,
  precipProximasHoras,
  peorSemáforo,
  direccionViento,
} from "../../lib/clima";
import { C, tint, archivo } from "../../theme";
import { Pill } from "../../ui";

const TONE_BG = {
  green: `linear-gradient(135deg, ${tint(C.green, 10)} 0%, ${C.surface} 55%)`,
  yellow: `linear-gradient(135deg, ${tint(C.amber, 12)} 0%, ${C.surface} 55%)`,
  red: `linear-gradient(135deg, ${tint(C.red, 10)} 0%, ${C.surface} 55%)`,
};

const TONE_ACCENT = { green: C.green, yellow: C.amber, red: C.red };

function iconoClima(code) {
  const c = Number(code);
  if (c === 0) return Sun;
  if (c <= 3) return Cloud;
  if (c <= 48) return CloudFog;
  if (c <= 82) return CloudRain;
  return Cloud;
}

function relojLocal() {
  const d = new Date();
  return {
    hora: d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" }),
    fecha: d.toLocaleDateString("es-CL", { weekday: "short", day: "numeric", month: "short" }),
  };
}

export default function CampoTiempoWidget() {
  const { empresa } = useAuth();
  const [datos, setDatos] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloj, setReloj] = useState(relojLocal);

  const cargar = useCallback(async (signal) => {
    if (!empresa?.puerto_base) {
      setLoading(false);
      setError(true);
      return;
    }
    setLoading(true);
    setError(false);
    try {
      const json = await fetchPronosticoOperacional(empresa.puerto_base, { signal });
      setDatos(json);
    } catch (e) {
      if (e.name !== "AbortError") setError(true);
    } finally {
      setLoading(false);
    }
  }, [empresa?.puerto_base]);

  useEffect(() => {
    const ctrl = new AbortController();
    cargar(ctrl.signal);
    return () => ctrl.abort();
  }, [cargar]);

  useEffect(() => {
    const t = setInterval(() => setReloj(relojLocal()), 30000);
    return () => clearInterval(t);
  }, []);

  if (loading) {
    return (
      <div
        aria-hidden
        style={{
          height: 88,
          borderRadius: 14,
          marginBottom: 14,
          background: `linear-gradient(90deg, ${tint(C.steel, 8)} 0%, ${C.mist} 50%, ${tint(C.steel, 8)} 100%)`,
          backgroundSize: "200% 100%",
          animation: "cmms-shimmer 1.2s ease-in-out infinite",
        }}
      />
    );
  }

  if (error || !datos?.actual) return null;

  const actual = datos.actual;
  const precip6h = precipProximasHoras(datos.horario, 6);
  const sem = peorSemáforo(evaluarSemáforosOperacionales(actual, precip6h));
  const tone = sem.tone || "green";
  const IconClima = iconoClima(actual.climaCode);
  const temp = actual.tempC != null ? Math.round(actual.tempC) : "—";
  const viento = actual.vientoKn != null ? Math.round(actual.vientoKn) : "—";
  const oleaje = actual.oleajeM != null ? Number(actual.oleajeM).toFixed(1) : "—";
  const dir = direccionViento(actual.vientoDir);

  return (
    <div
      style={{
        position: "relative",
        marginBottom: 14,
        padding: "12px 14px 12px 18px",
        borderRadius: 14,
        border: `1px solid ${tint(TONE_ACCENT[tone] || C.line, 28)}`,
        background: TONE_BG[tone] || TONE_BG.green,
        overflow: "hidden",
        boxShadow: "0 4px 18px rgba(8,20,32,.06)",
      }}
    >
      <div style={{
        position: "absolute", left: 0, top: 0, bottom: 0, width: 4,
        background: TONE_ACCENT[tone] || C.green,
      }} />

      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12, flexShrink: 0,
          background: tint(TONE_ACCENT[tone] || C.sky, 12),
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <IconClima size={22} color={TONE_ACCENT[tone] || C.sky} strokeWidth={2} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.slate, textTransform: "capitalize" }}>
                {reloj.fecha} · {reloj.hora}
              </div>
              <div style={{
                fontSize: 13, fontWeight: 600, color: C.ink, marginTop: 2,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {datos.puerto || empresa?.puerto_base || "Puerto"}
                <span style={{ color: C.slate, fontWeight: 500 }}> · {etiquetaClima(actual.climaCode)}</span>
              </div>
            </div>
            <div style={{ ...archivo, fontSize: 26, fontWeight: 800, color: C.ink, lineHeight: 1, flexShrink: 0 }}>
              {temp}°
            </div>
          </div>

          <div style={{
            display: "flex", alignItems: "center", gap: 14, marginTop: 10, flexWrap: "wrap",
          }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, color: C.steel, fontWeight: 600 }}>
              <Wind size={14} /> {viento} kn {dir}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, color: C.steel, fontWeight: 600 }}>
              <Waves size={14} /> {oleaje} m
            </span>
            <span style={{ marginLeft: "auto" }}>
              <Pill tone={tone === "yellow" ? "yellow" : tone === "red" ? "red" : "green"}>
                {sem.label}
              </Pill>
            </span>
          </div>
        </div>

        <button
          type="button"
          className="cmms-campo-touch"
          onClick={() => cargar()}
          aria-label="Actualizar clima"
          style={{
            border: "none", background: "none", padding: 6, cursor: "pointer",
            color: C.slate, flexShrink: 0, alignSelf: "flex-start",
          }}
        >
          <RefreshCw size={16} />
        </button>
      </div>
    </div>
  );
}
