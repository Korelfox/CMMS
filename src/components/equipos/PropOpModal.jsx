import React, { useState } from "react";
import { Save } from "lucide-react";
import { C, tint, NIVEL_TIPOS } from "../../theme";

// Cuerpo de "Configuración operacional" para una ventana del WindowManager.
// La ventana aporta el marco (overlay, cabecera, breadcrumb); aquí va el
// contenido desplazable + el pie de acciones. onDone() cierra la ventana.

const MODOS_HOR = [
  {
    value: "propio",
    label: "Punto propio",
    desc: "Este equipo tiene su propio contador de horas. Aquí se registran las lecturas periódicas.",
  },
  {
    value: "hereda",
    label: "Hereda",
    desc: "Usa las horas del equipo ascendiente con horómetro propio más cercano (p.ej., un filtro usa las horas de su motor).",
  },
  {
    value: "no",
    label: "No aplica",
    desc: "Sin registro de horas: estructuras, mamparos, casco, equipos estáticos, sistemas de seguridad pasiva.",
  },
];

function RadioCard({ label, desc, checked, onChange, color = C.steel }) {
  return (
    <label onClick={onChange} style={{
      display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer",
      padding: "9px 11px", borderRadius: 9, marginBottom: 4,
      background: checked ? tint(color, 10) : "transparent",
      border: `1px solid ${checked ? color : C.line}`,
      transition: "all .12s",
    }}>
      <div style={{
        width: 16, height: 16, borderRadius: "50%",
        border: `2px solid ${checked ? color : C.line}`,
        flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", marginTop: 2,
      }}>
        {checked && <div style={{ width: 7, height: 7, borderRadius: "50%", background: color }} />}
      </div>
      <div>
        <div style={{ fontWeight: 600, fontSize: 13, color: checked ? color : C.ink, lineHeight: 1.2 }}>{label}</div>
        {desc && <div style={{ fontSize: 11.5, color: C.slate, marginTop: 2, lineHeight: 1.4 }}>{desc}</div>}
      </div>
    </label>
  );
}

export function PropOpBody({ node, onSave, onDone }) {
  const [hor, setHor] = useState(node.horometro || "hereda");
  const [aco, setAco] = useState(!!node.consume_aceite);
  const [niv, setNiv] = useState(node.nivel_tipo || "ninguno");
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    setGuardando(true);
    try {
      await onSave(node.id, {
        horometro: hor,
        consume_aceite: hor === "propio" ? aco : false,
        nivel_tipo: niv,
      });
      onDone();
    } catch {
      // El padre muestra el error vía setError; la ventana permanece abierta.
    } finally {
      setGuardando(false);
    }
  }

  const secLbl = {
    fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.9,
    fontWeight: 700, color: C.slate, marginBottom: 10,
  };

  return (
    <>
      {/* Cuerpo desplazable */}
      <div style={{ flex: 1, overflowY: "auto", padding: "18px 20px 4px" }}>
        {/* ── Horómetro ── */}
        <div style={{ marginBottom: 22 }}>
          <div style={secLbl}>Horómetro</div>
          {MODOS_HOR.map((m) => (
            <RadioCard key={m.value} label={m.label} desc={m.desc}
              checked={hor === m.value} onChange={() => setHor(m.value)} color={C.steel} />
          ))}
        </div>

        {/* ── Consume aceite (solo propio) ── */}
        <div style={{ marginBottom: 22 }}>
          <div style={secLbl}>Consumo de lubricante</div>
          <label style={{
            display: "flex", alignItems: "flex-start", gap: 10,
            cursor: hor === "propio" ? "pointer" : "default",
            padding: "10px 12px", borderRadius: 9,
            border: `1px solid ${hor === "propio" && aco ? C.gold : C.line}`,
            background: hor === "propio" && aco ? tint(C.gold, 8) : tint(C.slate, 4),
            opacity: hor !== "propio" ? 0.45 : 1, transition: "all .12s",
          }}>
            <input
              type="checkbox" checked={aco}
              disabled={hor !== "propio"}
              onChange={(ev) => hor === "propio" && setAco(ev.target.checked)}
              style={{ width: 16, height: 16, accentColor: C.gold, cursor: hor === "propio" ? "pointer" : "default", marginTop: 2, flexShrink: 0 }}
            />
            <div>
              <div style={{ fontWeight: 600, fontSize: 13, color: C.ink, lineHeight: 1.2 }}>Registrar consumo de aceite</div>
              <div style={{ fontSize: 11.5, color: C.slate, marginTop: 2, lineHeight: 1.4 }}>
                {hor === "propio"
                  ? "Aparece en el reporte de consumos por marea. El aceite total de la nave se distribuye entre los motores proporcionalmente a sus horas."
                  : "Solo disponible para máquinas con horómetro propio."}
              </div>
            </div>
          </label>
        </div>

        {/* ── Niveles prezarpe ── */}
        <div style={{ marginBottom: 20 }}>
          <div style={secLbl}>Revisión de niveles en prezarpe</div>
          <div style={{ fontSize: 11.5, color: C.slate, marginBottom: 10, lineHeight: 1.4 }}>
            Niveles físicos que el capitán/maquinista verifica al zarpar.
          </div>
          {NIVEL_TIPOS.map((n) => {
            const sel = niv === n.value;
            const dis = hor === "no";
            return (
              <RadioCard key={n.value} label={n.label} desc=""
                checked={sel && !dis}
                onChange={() => !dis && setNiv(n.value)}
                color={C.green}
              />
            );
          })}
          {hor === "no" && (
            <div style={{ fontSize: 11, color: C.slate, marginTop: 4, fontStyle: "italic" }}>
              No aplica a equipos sin horómetro.
            </div>
          )}
        </div>
      </div>

      {/* Pie */}
      <div style={{ padding: "12px 20px", borderTop: `1px solid ${C.line}`, display: "flex", justifyContent: "flex-end", gap: 8, flexShrink: 0 }}>
        <button onClick={onDone} style={{
          padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.line}`,
          background: C.surface, cursor: "pointer", fontSize: 13, color: C.slate, fontWeight: 600,
        }}>
          Cancelar
        </button>
        <button onClick={guardar} disabled={guardando} style={{
          padding: "8px 18px", borderRadius: 8, border: "none", background: C.steel,
          color: "#fff", cursor: guardando ? "default" : "pointer", fontSize: 13,
          fontWeight: 700, display: "flex", alignItems: "center", gap: 7,
          opacity: guardando ? 0.7 : 1,
        }}>
          <Save size={14} /> {guardando ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </>
  );
}
