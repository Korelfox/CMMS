import React, { useState } from "react";
import { X, Plus, Trash2, FileText } from "lucide-react";
import { C, tint } from "../../theme";
import { primaryBtn, ghostBtn, inputStyle, Field } from "../../ui";
import { TIPO_NODO_META } from "../../lib/plantillaPesquera";

// ── Plantilla de campos de la ficha técnica ──────────────────────────────
// Secciones comunes a todo equipo/componente.
const SECCIONES = [
  { id: "placa", titulo: "Identificación / Placa", campos: [
    ["fabricante", "Fabricante"], ["modelo_placa", "Modelo (placa)"], ["n_serie", "N° de Serie"],
    ["tag", "N° de Placa / TAG"], ["anio", "Año de fabricación"], ["pais_origen", "País de origen"],
  ] },
  { id: "ubic", titulo: "Ubicación a bordo", campos: [
    ["ubicacion", "Compartimento / Sala"], ["posicion", "Posición (babor / estribor / centro)"],
  ] },
  { id: "comercial", titulo: "Comercial / Garantía", campos: [
    ["proveedor", "Proveedor"], ["fecha_compra", "Fecha de compra", "date"], ["costo", "Costo", "number"],
    ["oc_factura", "N° OC / Factura"],
    ["garantia_ini", "Garantía desde", "date"], ["garantia_fin", "Garantía hasta", "date"],
  ] },
  { id: "operacion", titulo: "Instalación / Operación", campos: [
    ["fecha_instalacion", "Fecha de instalación", "date"], ["horas_instalacion", "Horas al instalar", "number"],
  ] },
  { id: "doc", titulo: "Documentación (enlaces)", campos: [
    ["manual_url", "Enlace a Manual"], ["plano_url", "Enlace a Plano"], ["certificado_url", "Certificado"],
  ] },
];

// Datos técnicos sugeridos según el tipo de nodo.
const TECNICOS_INSTRUMENTO = [
  ["rango", "Rango de medición"], ["unidad", "Unidad"], ["senal", "Señal de salida"],
  ["ult_calibracion", "Última calibración", "date"], ["prox_calibracion", "Próxima calibración", "date"],
];
const TECNICOS_GENERAL = [
  ["potencia", "Potencia (kW / HP)"], ["rpm", "RPM"], ["voltaje", "Voltaje / Fase"],
  ["caudal", "Caudal"], ["presion", "Presión de trabajo"], ["capacidad", "Capacidad"],
  ["lubricante", "Tipo de lubricante / aceite"], ["cap_carter", "Capacidad de cárter"],
  ["peso", "Peso"], ["dimensiones", "Dimensiones"], ["par_apriete", "Pares de apriete"],
];

const seccionTecnicos = (tipo) => ({
  id: "tecnicos", titulo: "Datos técnicos",
  campos: tipo === "instrumento" ? TECNICOS_INSTRUMENTO : TECNICOS_GENERAL,
});

// Cuenta campos con valor (para el indicador de "ficha cargada").
export function fichaTieneDatos(ficha) {
  if (!ficha || typeof ficha !== "object") return false;
  const { _custom, notas, ...resto } = ficha;
  const algo = Object.values(resto).some((v) => v !== "" && v != null);
  const cust = Array.isArray(_custom) && _custom.some((c) => c && (c.k || c.v));
  return algo || cust || (!!notas && notas.trim() !== "");
}

export default function FichaEquipo({ node, puedeOperar, onSave, onClose }) {
  const [ficha, setFicha] = useState(() => ({ ...(node.ficha || {}) }));
  const [guardando, setGuardando] = useState(false);
  const meta = TIPO_NODO_META[node.tipo_nodo] || TIPO_NODO_META.equipo;
  const secciones = [SECCIONES[0], seccionTecnicos(node.tipo_nodo), ...SECCIONES.slice(1)];

  const set = (k, v) => setFicha((f) => ({ ...f, [k]: v }));
  const custom = Array.isArray(ficha._custom) ? ficha._custom : [];
  const setCustom = (arr) => setFicha((f) => ({ ...f, _custom: arr }));

  async function guardar() {
    setGuardando(true);
    try {
      // Limpia campos vacíos para no engordar el JSON.
      const limpio = {};
      for (const [k, v] of Object.entries(ficha)) {
        if (k === "_custom") continue;
        if (v !== "" && v != null) limpio[k] = v;
      }
      const cust = custom.filter((c) => c && (c.k || c.v));
      if (cust.length) limpio._custom = cust;
      await onSave(limpio);
      onClose();
    } catch { setGuardando(false); }
  }

  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(6,24,46,.55)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: C.surface, borderRadius: 16, width: "100%", maxWidth: 820, maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,.3)", overflow: "hidden" }}>

        {/* Cabecera */}
        <div style={{ padding: "18px 22px", borderBottom: `1px solid ${C.line}`, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: tint(meta.color, 14), display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <FileText size={20} color={meta.color} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 15.5, color: C.abyss, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{node.sistema}</div>
            <div style={{ fontSize: 12, color: C.slate, fontFamily: "'IBM Plex Mono', monospace" }}>{node.id_visible} · {meta.label}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.slate, padding: 4 }}><X size={20} /></button>
        </div>

        {/* Cuerpo desplazable */}
        <div style={{ padding: "18px 22px", overflowY: "auto" }}>
          {secciones.map((sec) => (
            <div key={sec.id} style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase", color: C.steel, fontWeight: 700, marginBottom: 8 }}>{sec.titulo}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                {sec.campos.map(([k, label, type]) => (
                  <Field key={k} label={label}>
                    <input type={type || "text"} value={ficha[k] ?? ""} disabled={!puedeOperar}
                      onChange={(e) => set(k, e.target.value)} style={inputStyle()} />
                  </Field>
                ))}
              </div>
            </div>
          ))}

          {/* Notas */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase", color: C.steel, fontWeight: 700, marginBottom: 8 }}>Notas / Observaciones</div>
            <textarea value={ficha.notas ?? ""} disabled={!puedeOperar} rows={3}
              onChange={(e) => set("notas", e.target.value)}
              style={{ ...inputStyle(), width: "100%", resize: "vertical", fontFamily: "inherit" }} />
          </div>

          {/* Campos personalizados */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase", color: C.steel, fontWeight: 700 }}>Campos personalizados</div>
              {puedeOperar && (
                <button onClick={() => setCustom([...custom, { k: "", v: "" }])} style={{ ...ghostBtn, fontSize: 12, padding: "4px 10px" }}><Plus size={13} /> Agregar campo</button>
              )}
            </div>
            {custom.length === 0
              ? <div style={{ fontSize: 12, color: C.slate, fontStyle: "italic" }}>Sin campos personalizados.</div>
              : custom.map((c, i) => (
                <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                  <input value={c.k} disabled={!puedeOperar} placeholder="Etiqueta" onChange={(e) => setCustom(custom.map((x, j) => j === i ? { ...x, k: e.target.value } : x))} style={{ ...inputStyle(), flex: 1 }} />
                  <input value={c.v} disabled={!puedeOperar} placeholder="Valor" onChange={(e) => setCustom(custom.map((x, j) => j === i ? { ...x, v: e.target.value } : x))} style={{ ...inputStyle(), flex: 2 }} />
                  {puedeOperar && (
                    <button onClick={() => setCustom(custom.filter((_, j) => j !== i))} style={{ background: "none", border: "none", cursor: "pointer", color: C.slate, padding: 4 }}><Trash2 size={16} /></button>
                  )}
                </div>
              ))}
          </div>
        </div>

        {/* Pie */}
        <div style={{ padding: "14px 22px", borderTop: `1px solid ${C.line}`, display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onClose} style={ghostBtn}>Cerrar</button>
          {puedeOperar && <button onClick={guardar} disabled={guardando} style={primaryBtn}>{guardando ? "Guardando…" : "Guardar ficha"}</button>}
        </div>
      </div>
    </div>
  );
}
