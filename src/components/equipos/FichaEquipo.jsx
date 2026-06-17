import React, { useState } from "react";
import { Plus, Trash2, Calendar, AlertTriangle } from "lucide-react";
import { C, tint } from "../../theme";
import { primaryBtn, ghostBtn, inputStyle, Field } from "../../ui";
import {
  registroVidaEquipo, requiereFechaInstalacionEquipo, tieneFechaInstalacion,
} from "../../lib/plantillaPesquera";

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

// Cuerpo de la ficha técnica para una ventana del WindowManager.
// La ventana aporta el marco (overlay, cabecera, breadcrumb); aquí va el
// contenido desplazable + el pie de acciones. onDone() cierra la ventana.
export function FichaBody({ node, puedeOperar, onSave, onDone }) {
  const [ficha, setFicha] = useState(() => ({ ...(node.ficha || {}) }));
  const [guardando, setGuardando] = useState(false);
  const secciones = [SECCIONES[0], seccionTecnicos(node.tipo_nodo), ...SECCIONES.slice(1)];
  const registro = registroVidaEquipo(node);
  const pideFecha = requiereFechaInstalacionEquipo(node);
  const faltaFecha = pideFecha && !tieneFechaInstalacion({ ...node, ficha });

  const set = (k, v) => setFicha((f) => ({ ...f, [k]: v }));
  const custom = Array.isArray(ficha._custom) ? ficha._custom : [];
  const setCustom = (arr) => setFicha((f) => ({ ...f, _custom: arr }));

  async function guardar() {
    setGuardando(true);
    try {
      const limpio = {};
      for (const [k, v] of Object.entries(ficha)) {
        if (k === "_custom") continue;
        if (v !== "" && v != null) limpio[k] = v;
      }
      if (node.ficha?._registro && !limpio._registro) limpio._registro = node.ficha._registro;
      const cust = custom.filter((c) => c && (c.k || c.v));
      if (cust.length) limpio._custom = cust;
      await onSave(limpio);
      onDone();
    } catch { setGuardando(false); }
  }

  const renderCampo = (k, label, type) => {
    const esInstalacion = k === "fecha_instalacion";
    const requerido = esInstalacion && pideFecha;
    const vacio = esInstalacion && !(ficha[k] ?? "").toString().trim();
    const borde = requerido && vacio ? tint(C.amber, 45) : C.line;
    const fondo = requerido && vacio ? tint(C.amber, 6) : undefined;
    return (
      <Field key={k} label={requerido ? `${label} *` : label}>
        <input type={type || "text"} value={ficha[k] ?? ""} disabled={!puedeOperar}
          onChange={(e) => set(k, e.target.value)}
          style={{ ...inputStyle(), borderColor: borde, background: fondo }} />
      </Field>
    );
  };

  return (
    <>
      <div style={{ flex: 1, overflowY: "auto", padding: "18px 22px" }}>
        {(registro === "fecha" || registro === "mixto") && (
          <div style={{
            display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 16, padding: "11px 13px",
            borderRadius: 9, border: `1px solid ${faltaFecha ? tint(C.amber, 40) : tint(C.purple, 30)}`,
            background: faltaFecha ? tint(C.amber, 7) : tint(C.purple, 6),
          }}>
            {faltaFecha
              ? <AlertTriangle size={18} color={C.amber} style={{ flexShrink: 0, marginTop: 1 }} />
              : <Calendar size={18} color={C.purple} style={{ flexShrink: 0, marginTop: 1 }} />}
            <div style={{ fontSize: 12.5, color: C.ink, lineHeight: 1.5 }}>
              {registro === "mixto" ? (
                <>
                  <strong>Registro mixto:</strong> este equipo usa horómetro y fecha de instalación.
                  {faltaFecha ? " Indica la fecha de instalación abajo." : " Fecha de instalación registrada."}
                </>
              ) : (
                <>
                  <strong>Registro por instalación:</strong> no lleva horómetro; la vida útil se rastrea por fecha.
                  {faltaFecha ? " Completa la fecha de instalación en la sección Operación." : ""}
                </>
              )}
            </div>
          </div>
        )}

        {secciones.map((sec) => (
          <div key={sec.id} style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase", color: C.steel, fontWeight: 700, marginBottom: 8 }}>{sec.titulo}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
              {sec.campos.map(([k, label, type]) => renderCampo(k, label, type))}
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
      <div style={{ padding: "14px 22px", borderTop: `1px solid ${C.line}`, display: "flex", justifyContent: "flex-end", gap: 8, flexShrink: 0 }}>
        <button onClick={onDone} style={ghostBtn}>Cerrar</button>
        {puedeOperar && <button onClick={guardar} disabled={guardando} style={primaryBtn}>{guardando ? "Guardando…" : "Guardar ficha"}</button>}
      </div>
    </>
  );
}
