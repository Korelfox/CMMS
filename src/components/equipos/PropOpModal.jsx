import React, { useState, useMemo, useEffect } from "react";
import { Save, CornerDownRight, Users, AlertTriangle, Calendar, FileText } from "lucide-react";
import { C, tint, NIVEL_TIPOS } from "../../theme";
import { useEquiposData } from "./equiposStore";
import { puntoHorometro, idsBajoPunto } from "../../lib/horometro";
import {
  registroVidaCliente, registroVidaPlantilla, REGISTRO_VIDA_CLIENTE, datosRegistroVidaCliente,
} from "../../lib/plantillaPesquera";

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

function RadioCard({ label, desc, checked, onChange, color = C.steel, disabled = false }) {
  return (
    <label onClick={disabled ? undefined : onChange} style={{
      display: "flex", alignItems: "flex-start", gap: 10, cursor: disabled ? "default" : "pointer",
      padding: "9px 11px", borderRadius: 9, marginBottom: 4,
      background: checked ? tint(color, 10) : "transparent",
      border: `1px solid ${checked ? color : C.line}`,
      transition: "all .12s", opacity: disabled ? 0.55 : 1,
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

export function PropOpBody({ node, onSave, onDone, puedeOperar = true, embedded = false }) {
  const [regCliente, setRegCliente] = useState(() => registroVidaCliente(node));
  const [hor, setHor] = useState(node.horometro || "hereda");
  const [horasFuenteId, setHorasFuenteId] = useState(node.horas_fuente_id || "");
  const [aco, setAco] = useState(!!node.consume_aceite);
  const [niv, setNiv] = useState(node.nivel_tipo || "ninguno");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    setRegCliente(registroVidaCliente(node));
    setHor(node.horometro || "hereda");
    setHorasFuenteId(node.horas_fuente_id || "");
    setAco(!!node.consume_aceite);
    setNiv(node.nivel_tipo || "ninguno");
  }, [node.id, node.horometro, node.horas_fuente_id, node.consume_aceite, node.nivel_tipo, node.ficha?._registro]); // eslint-disable-line react-hooks/exhaustive-deps -- usa campos estables de node; el objeto cambia cada render

  const soloInstalacion = regCliente === "fecha";
  const usaHorometro = regCliente === "horas" || regCliente === "mixto";
  const regPlantilla = registroVidaPlantilla(node);
  const overridePlantilla = regCliente !== regPlantilla
    && !(regCliente === "horas" && (regPlantilla === "horas" || regPlantilla === "hereda_horas"));

  const { equipos } = useEquiposData();
  const byId = useMemo(() => new Map(equipos.map((e) => [e.id, e])), [equipos]);

  const nodoSimulado = useMemo(() => ({
    ...node,
    horometro: soloInstalacion ? "no" : hor,
    horas_fuente_id: hor === "hereda" && horasFuenteId ? horasFuenteId : null,
  }), [node, hor, horasFuenteId, soloInstalacion]);
  const puntoId  = useMemo(() => (usaHorometro && hor === "hereda" ? puntoHorometro(nodoSimulado, byId) : null), [nodoSimulado, byId, usaHorometro, hor]);
  const puntoDato = puntoId ? byId.get(puntoId) : null;

  const puntosPropios = useMemo(() => equipos
    .filter((e) => e.id !== node.id && e.embarcacion_id === node.embarcacion_id && e.horometro === "propio")
    .sort((a, b) => (a.id_visible || "").localeCompare(b.id_visible || "", "es")),
  [equipos, node.id, node.embarcacion_id]);

  const fuenteExplicita = hor === "hereda" && !!horasFuenteId;
  const fuentePorJerarquia = hor === "hereda" && !horasFuenteId && !!puntoDato;

  const subHeredando = useMemo(() => {
    if (hor !== "propio") return [];
    return idsBajoPunto(node.id, equipos, byId)
      .filter((id) => id !== node.id)
      .map((id) => byId.get(id))
      .filter(Boolean);
  }, [hor, node.id, equipos, byId]);

  function elegirRegistro(value) {
    if (!puedeOperar) return;
    setRegCliente(value);
    if (value === "fecha") setHor("no");
    else if (hor === "no") setHor("hereda");
  }

  async function guardar() {
    setGuardando(true);
    try {
      const base = datosRegistroVidaCliente(regCliente, hor, { ...node, consume_aceite: aco });
      await onSave(node.id, {
        horometro: base.horometro,
        horas_fuente_id: base.horometro === "hereda" && horasFuenteId ? horasFuenteId : null,
        consume_aceite: base.horometro === "propio" ? aco : false,
        nivel_tipo: soloInstalacion ? "ninguno" : niv,
        ficha: base.ficha,
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
    <div style={embedded ? { display: "flex", flexDirection: "column", margin: "-16px -20px -20px", minHeight: 360 } : undefined}>
      <div style={{ flex: 1, overflowY: "auto", padding: embedded ? "16px 20px 4px" : "18px 20px 4px" }}>

        {/* ── Tipo de registro (ajuste cliente) ── */}
        <div style={{ marginBottom: 22 }}>
          <div style={secLbl}>Registro de vida</div>
          {REGISTRO_VIDA_CLIENTE.map((m) => (
            <RadioCard key={m.value} label={m.label} desc={m.desc}
              checked={regCliente === m.value} onChange={() => elegirRegistro(m.value)}
              color={m.value === "fecha" ? C.purple : m.value === "mixto" ? C.cyan : C.steel}
              disabled={!puedeOperar} />
          ))}
          {overridePlantilla && (
            <div style={{ fontSize: 11.5, color: C.slate, marginTop: 6, fontStyle: "italic" }}>
              Plantilla sugiere: {REGISTRO_VIDA_CLIENTE.find((o) => o.value === regPlantilla || (regPlantilla === "hereda_horas" && o.value === "horas"))?.label ?? regPlantilla}
            </div>
          )}
        </div>

        {regCliente === "mixto" && (
          <div style={{
            display: "flex", gap: 9, alignItems: "flex-start", marginBottom: 18, padding: "10px 12px",
            borderRadius: 8, border: `1px solid ${tint(C.cyan, 35)}`, background: tint(C.cyan, 7),
          }}>
            <Calendar size={16} color={C.cyan} style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ fontSize: 12.5, color: C.slate, lineHeight: 1.5 }}>
              <strong style={{ color: C.ink }}>Registro mixto.</strong> Configura el horómetro abajo y la <strong>fecha de instalación</strong> en la pestaña Ficha.
            </div>
          </div>
        )}

        {soloInstalacion ? (
          <div style={{
            display: "flex", gap: 10, alignItems: "flex-start", padding: "12px 14px", borderRadius: 9,
            border: `1px solid ${tint(C.purple, 30)}`, background: tint(C.purple, 6),
          }}>
            <FileText size={18} color={C.purple} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink, marginBottom: 4 }}>
                Rastreo por fecha de instalación
              </div>
              <div style={{ fontSize: 12.5, color: C.slate, lineHeight: 1.55 }}>
                Este equipo no usa horómetro. Completa la <strong>fecha de instalación</strong> en la pestaña Ficha → Instalación / Operación.
              </div>
              <div style={{ marginTop: 10, fontSize: 12, color: C.steel }}>
                Horómetro: <strong>No aplica</strong>
              </div>
            </div>
          </div>
        ) : (
        <>
        <div style={{ marginBottom: 22 }}>
          <div style={secLbl}>Horómetro</div>
          {MODOS_HOR.filter((m) => m.value !== "no").map((m) => (
            <RadioCard key={m.value} label={m.label} desc={m.desc}
              checked={hor === m.value} onChange={() => puedeOperar && setHor(m.value)} color={C.steel}
              disabled={!puedeOperar} />
          ))}

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

        <div style={{ marginBottom: 22 }}>
          <div style={secLbl}>Fuente de horas</div>
          {hor !== "hereda" ? (
            <div style={{
              padding: "10px 12px", borderRadius: 8,
              border: `1px solid ${C.line}`, background: tint(C.slate, 4),
              fontSize: 12.5, color: C.slate, lineHeight: 1.5,
            }}>
              Solo aplica con modo <strong style={{ color: C.ink }}>Hereda horas</strong>.
              Úsalo para enlazar equipos hermanos al motor principal (reductora, eje, hélice bajo Propulsión).
            </div>
          ) : (
            <>
              <select
                value={horasFuenteId}
                disabled={!puedeOperar}
                onChange={(ev) => setHorasFuenteId(ev.target.value)}
                style={{
                  width: "100%", boxSizing: "border-box", border: `1px solid ${C.line}`,
                  borderRadius: 8, background: C.surface, padding: "8px 10px",
                  fontSize: 13, color: C.ink, outline: "none", fontFamily: "inherit",
                }}
              >
                <option value="">Automático — ascendiente en la jerarquía</option>
                {puntosPropios.map((e) => (
                  <option key={e.id} value={e.id}>{e.id_visible} · {e.sistema}</option>
                ))}
              </select>
              <div style={{ fontSize: 11.5, color: C.slate, marginTop: 6, lineHeight: 1.45 }}>
                Elige el motor u otra máquina con horómetro propio cuando este equipo no cuelga directamente de ella.
              </div>

              <div style={{
                marginTop: 8, padding: "9px 12px", borderRadius: 8,
                border: `1px solid ${puntoDato ? tint(C.cyan, 35) : tint(C.amber, 35)}`,
                background: puntoDato ? tint(C.cyan, 7) : tint(C.amber, 7),
              }}>
                {puntoDato ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                    <CornerDownRight size={14} color={C.cyan} style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: 12.5, color: C.slate }}>
                      {fuenteExplicita ? "Fuente explícita:" : "Heredará horas de"}
                    </span>
                    <strong style={{ fontSize: 13, color: C.abyss }}>{puntoDato.sistema}</strong>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: C.steel, background: tint(C.steel, 10), borderRadius: 5, padding: "1px 6px" }}>
                      {puntoDato.id_visible}
                    </span>
                    {fuentePorJerarquia && (
                      <span style={{ fontSize: 11, color: C.slate, fontStyle: "italic" }}>(por jerarquía)</span>
                    )}
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <AlertTriangle size={15} color={C.amber} style={{ flexShrink: 0, marginTop: 1 }} />
                    <div>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: C.amber }}>Sin fuente de horas</div>
                      <div style={{ fontSize: 11.5, color: C.slate, marginTop: 3, lineHeight: 1.5 }}>
                        {horasFuenteId
                          ? "La fuente seleccionada no tiene horómetro propio. Elige otra máquina o deja el modo automático."
                          : "Ningún ascendiente tiene horómetro propio. Selecciona una máquina en el desplegable (p. ej. Motor Principal)."}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div style={{ marginBottom: 22 }}>
          <div style={secLbl}>Consumo de lubricante</div>
          <label style={{
            display: "flex", alignItems: "flex-start", gap: 10,
            cursor: hor === "propio" && puedeOperar ? "pointer" : "default",
            padding: "10px 12px", borderRadius: 9,
            border: `1px solid ${hor === "propio" && aco ? C.gold : C.line}`,
            background: hor === "propio" && aco ? tint(C.gold, 8) : tint(C.slate, 4),
            opacity: hor !== "propio" ? 0.45 : 1, transition: "all .12s",
          }}>
            <input type="checkbox" checked={aco}
              disabled={!puedeOperar || hor !== "propio"}
              onChange={(ev) => hor === "propio" && setAco(ev.target.checked)}
              style={{ width: 16, height: 16, accentColor: C.gold, cursor: hor === "propio" && puedeOperar ? "pointer" : "default", marginTop: 2, flexShrink: 0 }}
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

        <div style={{ marginBottom: 20 }}>
          <div style={secLbl}>Revisión de niveles en prezarpe</div>
          <div style={{ fontSize: 11.5, color: C.slate, marginBottom: 10, lineHeight: 1.4 }}>
            Niveles físicos que el capitán o maquinista verifica antes de zarpar.
          </div>
          {NIVEL_TIPOS.map((n) => {
            const sel = niv === n.value;
            return (
              <RadioCard key={n.value} label={n.label} desc=""
                checked={sel}
                onChange={() => puedeOperar && setNiv(n.value)}
                color={C.green}
                disabled={!puedeOperar}
              />
            );
          })}
        </div>
        </>
        )}
      </div>

      <div style={{ padding: "12px 20px", borderTop: `1px solid ${C.line}`, display: "flex", justifyContent: "flex-end", gap: 8, flexShrink: 0 }}>
        <button onClick={onDone} style={{
          padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.line}`,
          background: C.surface, cursor: "pointer", fontSize: 13, color: C.slate, fontWeight: 600,
        }}>
          {puedeOperar ? "Cancelar" : "Cerrar"}
        </button>
        {puedeOperar && (
        <button onClick={guardar} disabled={guardando} style={{
          padding: "8px 18px", borderRadius: 8, border: "none", background: C.steel,
          color: "#fff", cursor: guardando ? "default" : "pointer", fontSize: 13,
          fontWeight: 700, display: "flex", alignItems: "center", gap: 7,
          opacity: guardando ? 0.7 : 1,
        }}>
          <Save size={14} /> {guardando ? "Guardando…" : "Guardar cambios"}
        </button>
        )}
      </div>
    </div>
  );
}
