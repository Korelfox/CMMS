import React, { useState, useMemo, useEffect } from "react";
import { Fish, Plus, Trash2, Settings, BookOpen, ChevronDown, ChevronRight, Check, LayoutDashboard, Download, ExternalLink, Fuel } from "lucide-react";
import { ComposedChart, Bar, Line, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, Legend } from "recharts";
import { insertRow, updateRow, deleteRow, upsertRow, logActivity } from "../../lib/db";
import { supabase } from "../../lib/supabase";
import { C, archivo, clp, num, isAdmin, canOperate, tint } from "../../theme";
import { Card, Pill, FilterBtn, primaryBtn, ghostBtn, inputStyle, bluInput, thStyle, tdStyle, Field, Empty, GuiaColapsable } from "../../ui";


export default function TabConfig({ profile, conf, setConf, setError }) {
  const [form, setForm] = useState(conf);
  const [saved, setSaved] = useState(false);
  useEffect(() => { setForm(conf); }, [conf]);

  async function guardar() {
    try {
      const { error } = await supabase.from("empresas").update({
        precio_combustible_l:   form.precio_combustible_l,
        precio_aceite_l:        form.precio_aceite_l,
        parte_tripulacion_pct:  form.parte_tripulacion_pct,
      }).eq("id", profile.empresa_id);
      if (error) throw error;
      setConf(form);
      setSaved(true); setTimeout(() => setSaved(false), 2500);
      logActivity(profile, "Config rentabilidad", `Comb $${form.precio_combustible_l}/L · Parte ${form.parte_tripulacion_pct}%`);
    } catch (e) { setError("No se pudo guardar la configuración: " + e.message); }
  }

  return (
    <Card style={{ maxWidth: 540 }}>
      <div style={{ fontWeight: 700, fontSize: 15, color: C.abyss, marginBottom: 4 }}>Valores por defecto de la empresa</div>
      <div style={{ fontSize: 12.5, color: C.slate, marginBottom: 20, lineHeight: 1.6 }}>
        Estos precios se pre-llenan al abrir cada marea. Puedes ajustarlos por marea sin modificar este default.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
        <Field label="Precio combustible ($/L)">
          <input type="number" value={form.precio_combustible_l || 0}
            onChange={(e) => setForm((p) => ({ ...p, precio_combustible_l: +e.target.value }))}
            style={{ ...bluInput, width: "100%" }} />
        </Field>
        <Field label="Precio aceite ($/L)">
          <input type="number" value={form.precio_aceite_l || 0}
            onChange={(e) => setForm((p) => ({ ...p, precio_aceite_l: +e.target.value }))}
            style={{ ...bluInput, width: "100%" }} />
        </Field>
        <Field label="Parte de la tripulación (% del líquido)">
          <input type="number" min={0} max={100} value={form.parte_tripulacion_pct || 50}
            onChange={(e) => setForm((p) => ({ ...p, parte_tripulacion_pct: +e.target.value }))}
            style={{ ...bluInput, width: "100%", borderColor: C.cyan }} />
        </Field>
      </div>
      <button onClick={guardar} style={{ ...primaryBtn, gap: 8 }}>
        {saved ? <><Check size={15} /> Guardado</> : "Guardar configuración"}
      </button>
      <div style={{ marginTop: 20, padding: "12px 14px", background: C.mist, borderRadius: 8, fontSize: 12.5, color: C.slate, lineHeight: 1.6 }}>
        <strong style={{ color: C.ink }}>Modelo a la parte:</strong> el líquido a repartir es el bruto menos los gastos del pozo (combustible, víveres, hielo, carnada). La tripulación recibe su porcentaje del líquido. El armador paga por separado el aceite y el mantenimiento.
      </div>
    </Card>
  );
}
