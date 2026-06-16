import React, { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";
import { Anchor, ExternalLink } from "lucide-react";
import { C } from "../../theme";
import { analizarMarea, etiquetaEventoMarea, referenciasMareaOficial } from "../../lib/clima";

export default function PronosticoMarea({ horario = [], puertoLabel = "" }) {
  const info = useMemo(() => analizarMarea(horario), [horario]);
  const refs = useMemo(() => referenciasMareaOficial(puertoLabel), [puertoLabel]);
  const data = info?.serie || [];
  if (!data.length) return null;

  const pleamarLbl = etiquetaEventoMarea(info.pleamar);
  const bajamarLbl = etiquetaEventoMarea(info.bajamar);

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Anchor size={13} color={C.cyan} />
          <span style={{ fontSize: 11, fontWeight: 700, color: C.slate, letterSpacing: 0.5, textTransform: "uppercase" }}>
            Marea estimada (48 h)
          </span>
        </div>
        {info.actualM != null && (
          <span style={{ fontSize: 11, color: C.steel, fontWeight: 600 }}>
            Actual ~{info.actualM.toFixed(1)} m MSL
          </span>
        )}
      </div>
      <ResponsiveContainer width="100%" height={120}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid stroke={C.line} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="hora" tick={{ fontSize: 10, fill: C.slate }} interval={7} tickLine={false} />
          <YAxis
            tick={{ fontSize: 10, fill: C.cyan }}
            tickLine={false}
            axisLine={false}
            width={36}
            tickFormatter={(v) => `${v}`}
            label={{ value: "m", angle: -90, position: "insideLeft", fontSize: 10, fill: C.cyan }}
          />
          <ReferenceLine y={0} stroke={C.line} strokeDasharray="4 4" />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${C.line}` }}
            formatter={(v) => [`${Number(v).toFixed(2)} m MSL`, "Nivel"]}
            labelFormatter={(l) => `Hora ${l}`}
          />
          <Line type="monotone" dataKey="mareaM" stroke={C.cyan} strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
      {(pleamarLbl || bajamarLbl) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 11, color: C.steel, marginTop: 6 }}>
          {pleamarLbl && <span>{pleamarLbl}</span>}
          {bajamarLbl && <span>{bajamarLbl}</span>}
        </div>
      )}
      <div style={{ fontSize: 10, color: C.slate, marginTop: 6, lineHeight: 1.4 }}>
        Estimación modelada (MSL). No usar para navegación ni reemplaza tablas SHOA/Directemar.
        {refs.localidad && <span> Referencia oficial: {refs.localidad}.</span>}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
        <a href={refs.shoa} target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 11, fontWeight: 600, color: C.steel, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
          <ExternalLink size={12} /> Tablas SHOA
        </a>
        <a href={refs.directemar} target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 11, fontWeight: 600, color: C.steel, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
          <ExternalLink size={12} /> Avisos Directemar
        </a>
      </div>
    </div>
  );
}
