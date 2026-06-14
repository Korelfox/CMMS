import React, { useState, useMemo } from "react";
import { Save, CornerDownRight, Users, AlertTriangle } from "lucide-react";
import { C, tint, NIVEL_TIPOS } from "../../theme";
import { useEquiposData } from "./equiposStore";
import { puntoHorometro, idsBajoPunto } from "../../lib/horometro";

// Cuerpo de "Configuración operacional" para una ventana del WindowManager.
// La ventana aporta el marco; aquí va el contenido + pie de acciones.
// onDone() cierra la ventana.

const MODOS_HOR = [
  {
    value: "propio",
    label: "Punto propio",
    desc: "Este equipo tiene su propio horómetro (motor, generador, bomba). Las lecturas se ingresan aquí y se propagan a sus componentes.",
  },
  {
    value: "hereda",
    label: "Hereda horas",
    desc: "Usa las horas del ascendiente con horómetro propio más cercano (filtros, enfriadores, componentes acoplados a la máquina).",
  },
  {
    value: "no",
    label: "No aplica",
    desc: "Sin registro de horas: estructura, mamparos, casco, equipos estáticos, seguridad pasiva.",
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

  // Datos vivos del store — siempre frescos aunque el árbol haya cambiado.
  const { equipos } = useEquiposData();
  const byId = useMemo(() => new Map(equipos.map((e) => [e.id, e])), [equipos]);

  // Resuelve la herencia con el modo actualmente seleccionado.
  // Simulamos que el nodo tiene el modo elegido para ver el resultado inmediatamente.
  const nodoSimulado = useMemo(() => ({ ...node, horometro: hor }), [node, hor]);
  const puntoId  = useMemo(() => puntoHorometro(nodoSimulado, byId), [nodoSimulado, byId]);
  const puntoDato = puntoId ? byId.get(puntoId) : null;

  // Para "propio": muestra cuántos componentes heredarían de este nodo.
  const subHeredando = useMemo(() => {
    if (hor !== "propio") return [];
    return idsBajoPunto(node.id, equipos, byId)
      .filter((id) => id !== node.id)
      .map((id) => byId.get(id))
      .filter(Boolean);
  }, [hor, node.id, equipos, byId]);

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
      /* onSave muestra el error vía setError en Equipos */
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

          {/* ── Resolución en tiempo real de la herencia ── */}
          {hor === "hereda" && (
            <div style={{
              marginTop: 8, padding: "9px 12px", borderRadius: 8,
              border: `1px solid ${puntoDato ? tint(C.cyan, 35) : tint(C.amber, 35)}`,
              background: puntoDato ? tint(C.cyan, 7) : tint(C.amber, 7),
            }}>
              {puntoDato ? (
                <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                  <CornerDownRight size={14} color={C.cyan} style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: 12.5, color: C.slate }}>Heredará horas de</span>
                  <strong style={{ fontSize: 13, color: C.abyss }}>{puntoDato.sistema}</strong>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: C.steel, background: tint(C.steel, 10), borderRadius: 5, padding: "1px 6px" }}>
                    {puntoDato.id_visible}
                  </span>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <AlertTriangle size={15} color={C.amber} style={{ flexShrink: 0, marginTop: 1 }} />
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: C.amber }}>Sin ascendiente con horómetro propio</div>
                    <div style={{ fontSize: 11.5, color: C.slate, marginTop: 3, lineHeight: 1.5 }}>
                      Ningún equipo en la cadena de padres está configurado como "Punto propio".
                      Este componente quedará sin horas hasta que un ascendiente lo tenga.
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Para "propio": lista de componentes que heredan ── */}
          {hor === "propio" && subHeredando.length > 0 && (
            <div style={{
              marginTop: 8, padding: "10px 12px", borderRadius: 8,
              border: `1px solid ${tint(C.steel, 25)}`, background: tint(C.steel, 5),
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <Users size={13} color={C.steel} />
                <span style={{ fontSize: 12, fontWeight: 700, color: C.ink }}>
                  {subHeredando.length} componente{subHeredando.length !== 1 ? "s" : ""} heredan horas de este equipo
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {subHeredando.map((e) => (
                  <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                    <CornerDownRight size={11} color={C.slate} style={{ flexShrink: 0 }} />
                    <span style={{ color: C.ink, fontWeight: 600 }}>{e.sistema}</span>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: C.steel }}>{e.id_visible}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
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
            <input type="checkbox" checked={aco}
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
            Niveles físicos que el capitán o maquinista verifica antes de zarpar.
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

      {/* ── Pie ── */}
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
