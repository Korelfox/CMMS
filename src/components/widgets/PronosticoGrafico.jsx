import React, { useMemo } from "react";
import {
  ComposedChart, Line, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import { C } from "../../theme";
import { serieGrafico48h } from "../../lib/clima";

export default function PronosticoGrafico({ horario = [] }) {
  const data = useMemo(() => serieGrafico48h(horario), [horario]);
  if (!data.length) return null;

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.slate, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8 }}>
        Próximas 48 horas
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={data} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid stroke={C.line} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="hora"
            tick={{ fontSize: 10, fill: C.slate }}
            interval={7}
            tickLine={false}
          />
          <YAxis
            yAxisId="viento"
            tick={{ fontSize: 10, fill: C.steel }}
            tickLine={false}
            axisLine={false}
            width={32}
            label={{ value: "kn", angle: -90, position: "insideLeft", fontSize: 10, fill: C.steel }}
          />
          <YAxis
            yAxisId="oleaje"
            orientation="right"
            tick={{ fontSize: 10, fill: C.cyan }}
            tickLine={false}
            axisLine={false}
            width={32}
            label={{ value: "m", angle: 90, position: "insideRight", fontSize: 10, fill: C.cyan }}
          />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${C.line}` }}
            formatter={(v, name) => {
              if (name === "vientoKn") return [`${Math.round(v)} kn`, "Viento"];
              if (name === "oleajeM") return [`${Number(v).toFixed(1)} m`, "Oleaje"];
              if (name === "precipMm") return [`${Number(v).toFixed(1)} mm`, "Lluvia"];
              return [v, name];
            }}
            labelFormatter={(l) => `Hora ${l}`}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 6 }}
            formatter={(v) => (v === "vientoKn" ? "Viento (kn)" : v === "oleajeM" ? "Oleaje (m)" : "Lluvia (mm)")}
          />
          <Bar yAxisId="oleaje" dataKey="precipMm" name="precipMm" fill={C.steel} opacity={0.25} barSize={6} />
          <Line yAxisId="viento" type="monotone" dataKey="vientoKn" name="vientoKn"
            stroke={C.steel} strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
          <Line yAxisId="oleaje" type="monotone" dataKey="oleajeM" name="oleajeM"
            stroke={C.cyan} strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Rosa de vientos: flecha apunta hacia donde sopla el viento. */
export function FlechaViento({ grados, kn, label, size = 52 }) {
  if (grados == null) return null;
  const rot = (Number(grados) + 180) % 360;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
      <div style={{
        width: size, height: size, position: "relative",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <svg
          viewBox="0 0 40 40"
          width={size}
          height={size}
          style={{ transform: `rotate(${rot}deg)`, transition: "transform 0.3s ease" }}
          aria-hidden
        >
          <circle cx="20" cy="20" r="18" fill="none" stroke={C.line} strokeWidth="1" />
          <path
            d="M20 10 L20 30 M20 10 L14 18 M20 10 L26 18"
            stroke={C.steel}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.steel, textAlign: "center" }}>
        {label || "—"}
      </div>
      {kn != null && (
        <div style={{ fontSize: 10, color: C.slate }}>{Math.round(kn)} kn</div>
      )}
    </div>
  );
}
