import React, { useState } from "react";
import {
  Ship, Anchor, Fuel, Droplet, Gauge, Check, X, AlertTriangle,
  ArrowLeft, Camera, ClipboardCheck, ChevronRight, Waves,
} from "lucide-react";
import { C, archivo } from "../theme";
import { Card, PageHead, Pill, primaryBtn, ghostBtn } from "../ui";

// ============================================================
//  MOCKUP / VISTA PREVIA — Prezarpe & Mareas
//  Datos de ejemplo en memoria. NO toca Supabase ni guarda nada.
//  Sirve solo para validar el flujo y el diseño visual.
// ============================================================

const FLOTA_DEMO = [
  { id: "dm", nombre: "Don Miguel", codigo: "DM", estado: "en_puerto" },
  { id: "ec", nombre: "Estrella del Carmen", codigo: "EC", estado: "navegando", zarpe: "Hoy 05:40" },
];

// Equipos con su marca de niveles (decisión #1): "aceite" o "aceite_agua"
const EQUIPOS_DEMO = [
  { id: "mp", nombre: "Motor Principal", niveles: "aceite_agua", horometro: 1240 },
  { id: "mg", nombre: "Motor Generador", niveles: "aceite_agua", horometro: 860 },
  { id: "cm", nombre: "Contramarcha", niveles: "aceite", horometro: 1240 },
];

// Origen "equipo": viene del módulo Equipos (marcado para prezarpe).
// Origen "fijo": ítem de seguridad estándar que no siempre es un equipo registrado.
const INSPECCION_VISUAL = [
  { item: "Motor Principal", origen: "equipo" },
  { item: "Motor Generador", origen: "equipo" },
  { item: "Contramarcha", origen: "equipo" },
  { item: "Sistema de gobierno", origen: "fijo" },
  { item: "Bombas de achique", origen: "fijo" },
  { item: "Luces de navegación", origen: "fijo" },
  { item: "Equipo de seguridad", origen: "fijo" },
];

export default function Prezarpe() {
  const [vista, setVista] = useState("flota");      // "flota" | "checklist"
  const [nave, setNave] = useState(null);

  return (
    <div>
      <PageHead kicker="Flota · Operación" title="Prezarpe & Mareas"
        sub="Antes de cada zarpe, el maquinista inspecciona la embarcación y registra niveles, abastecimiento y horómetros." />

      {/* Aviso de vista previa */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, background: C.purpleBg || "#EFE9FB", border: `1px dashed ${C.purple}`, color: C.purple, padding: "10px 14px", borderRadius: 10, marginBottom: 16, fontSize: 13 }}>
        <ClipboardCheck size={16} />
        <span><strong>Vista previa (mockup).</strong> Datos de ejemplo · todavía no se guarda nada. Sirve para revisar el flujo y el diseño.</span>
      </div>

      {vista === "flota"
        ? <VistaFlota onIniciar={(n) => { setNave(n); setVista("checklist"); }} />
        : <VistaChecklist nave={nave} onVolver={() => setVista("flota")} />}
    </div>
  );
}

// ---------- Pantalla 1: tarjetas de embarcaciones ----------
function VistaFlota({ onIniciar }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
      {FLOTA_DEMO.map((n) => {
        const enPuerto = n.estado === "en_puerto";
        return (
          <Card key={n.id} style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "16px 18px", background: enPuerto ? C.mist : "#EAF4FF", display: "flex", alignItems: "center", gap: 12, borderBottom: `1px solid ${C.line}` }}>
              <div style={{ width: 46, height: 46, borderRadius: 11, background: enPuerto ? C.steel : C.cyan, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {enPuerto ? <Anchor size={24} color="#fff" /> : <Ship size={24} color="#fff" />}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ ...archivo, fontSize: 17, fontWeight: 800, color: C.abyss }}>{n.nombre}</div>
                <div style={{ fontSize: 11.5, color: C.slate, fontFamily: "'IBM Plex Mono', monospace" }}>{n.codigo}</div>
              </div>
              <Pill tone={enPuerto ? "slate" : "cyan"}>{enPuerto ? "En puerto" : "Navegando"}</Pill>
            </div>
            <div style={{ padding: "14px 18px" }}>
              {enPuerto ? (
                <button onClick={() => onIniciar(n)} style={{ ...primaryBtn, width: "100%", justifyContent: "center", padding: "12px" }}>
                  <ClipboardCheck size={17} /> Iniciar prezarpe
                </button>
              ) : (
                <div>
                  <div style={{ fontSize: 12.5, color: C.slate, marginBottom: 10 }}>Zarpó {n.zarpe} · marea en curso</div>
                  <button style={{ ...ghostBtn, width: "100%", justifyContent: "center", padding: "11px", color: C.steel, borderColor: C.steel }}>
                    <Anchor size={16} /> Registrar recalada
                  </button>
                </div>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ---------- Pantalla 2: checklist de prezarpe ----------
function VistaChecklist({ nave, onVolver }) {
  const [visual, setVisual] = useState({});       // item -> "ok" | "falla"
  const [niveles, setNiveles] = useState({});     // eqId -> { aceite, agua }
  const [litros, setLitros] = useState({ combustible: 600, agua: 200, aceite: 40 });
  const [horom, setHorom] = useState({});         // eqId -> lectura nueva
  const [apto, setApto] = useState(null);

  const setVis = (it, v) => setVisual((p) => ({ ...p, [it]: p[it] === v ? null : v }));
  const setNiv = (id, campo, v) => setNiveles((p) => ({ ...p, [id]: { ...p[id], [campo]: (p[id]?.[campo] === v ? null : v) } }));

  // Progreso y veredicto sugerido
  const totalVisual = INSPECCION_VISUAL.length;
  const hechosVisual = Object.values(visual).filter(Boolean).length;
  const hayFalla = Object.values(visual).includes("falla");
  const hayBajo = Object.values(niveles).some((n) => n?.aceite === "bajo" || n?.agua === "bajo");
  const sugerencia = hayFalla || hayBajo ? "no_apto" : "apto";

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <button onClick={onVolver} style={{ ...ghostBtn, padding: "7px 12px" }}><ArrowLeft size={15} /> Flota</button>
        <div style={{ ...archivo, fontSize: 18, fontWeight: 800, color: C.abyss }}>Prezarpe · {nave?.nombre}</div>
      </div>

      {/* BLOQUE A — Inspección visual */}
      <Bloque titulo="A · Inspección visual" icon={Ship}
        extra={<span style={{ fontSize: 11.5, color: C.slate }}>{hechosVisual}/{totalVisual}</span>}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px,1fr))", gap: 10 }}>
          {INSPECCION_VISUAL.map(({ item, origen }) => (
            <div key={item} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 12px", border: `1px solid ${C.line}`, borderRadius: 10, background: "#fff" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.ink, display: "inline-flex", alignItems: "center", gap: 6 }}>
                {item}
                {origen === "equipo" && <span style={{ fontSize: 9, fontWeight: 700, color: C.steel, background: "#E4EFF8", padding: "1px 6px", borderRadius: 20, letterSpacing: 0.3 }}>EQUIPO</span>}
              </span>
              <div style={{ display: "flex", gap: 6 }}>
                <Semaforo activo={visual[item] === "ok"} tone="green" onClick={() => setVis(item, "ok")}><Check size={16} /></Semaforo>
                <Semaforo activo={visual[item] === "falla"} tone="red" onClick={() => setVis(item, "falla")}><X size={16} /></Semaforo>
              </div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11.5, color: C.slate, marginTop: 10 }}>
          Los marcados <strong>EQUIPO</strong> se agregan/quitan desde el módulo Equipos (opción "incluir en prezarpe"). Los demás son ítems de seguridad estándar.
        </div>
      </Bloque>

      {/* BLOQUE B — Niveles de operación (cualitativo, según marca del equipo) */}
      <Bloque titulo="B · Niveles de operación" icon={Droplet}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {EQUIPOS_DEMO.map((eq) => (
            <div key={eq.id} style={{ padding: "12px 14px", border: `1px solid ${C.line}`, borderRadius: 10, background: "#fff" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.abyss, marginBottom: 8 }}>
                {eq.nombre} <span style={{ fontSize: 10.5, fontWeight: 600, color: C.slate }}>· {eq.niveles === "aceite_agua" ? "aceite + agua chaqueta" : "solo aceite"}</span>
              </div>
              <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
                <NivelItem label="Aceite" estado={niveles[eq.id]?.aceite} onSet={(v) => setNiv(eq.id, "aceite", v)} />
                {eq.niveles === "aceite_agua" && <NivelItem label="Agua chaqueta" estado={niveles[eq.id]?.agua} onSet={(v) => setNiv(eq.id, "agua", v)} />}
              </div>
            </div>
          ))}
        </div>
      </Bloque>

      {/* BLOQUE C — Abastecimiento en litros */}
      <Bloque titulo="C · Abastecimiento a bordo" icon={Fuel}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px,1fr))", gap: 12 }}>
          <Stepper label="Combustible" unidad="L" icon={Fuel} value={litros.combustible} onChange={(v) => setLitros((p) => ({ ...p, combustible: v }))} step={50} />
          <Stepper label="Agua dulce" unidad="L" icon={Waves} value={litros.agua} onChange={(v) => setLitros((p) => ({ ...p, agua: v }))} step={20} />
          <Stepper label="Aceite" unidad="L" icon={Droplet} value={litros.aceite} onChange={(v) => setLitros((p) => ({ ...p, aceite: v }))} step={5} />
        </div>
      </Bloque>

      {/* BLOQUE D — Horómetros (con validación >= anterior) */}
      <Bloque titulo="D · Lectura de horómetros" icon={Gauge}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px,1fr))", gap: 12 }}>
          {EQUIPOS_DEMO.map((eq) => {
            const val = horom[eq.id];
            const invalida = val !== undefined && val !== "" && Number(val) < eq.horometro;
            return (
              <div key={eq.id} style={{ padding: "12px 14px", border: `1px solid ${invalida ? C.red : C.line}`, borderRadius: 10, background: "#fff" }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: C.abyss }}>{eq.nombre}</div>
                <div style={{ fontSize: 11, color: C.slate, marginBottom: 6, fontFamily: "'IBM Plex Mono', monospace" }}>Anterior: {eq.horometro} h</div>
                <input type="number" placeholder={`≥ ${eq.horometro}`} value={val ?? ""}
                  onChange={(e) => setHorom((p) => ({ ...p, [eq.id]: e.target.value }))}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${invalida ? C.red : "#CFE3F2"}`, fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, fontWeight: 600, color: C.steel, background: "#F2F8FD" }} />
                {invalida && <div style={{ fontSize: 10.5, color: C.red, fontWeight: 600, marginTop: 4 }}>Debe ser igual o mayor a {eq.horometro} h</div>}
              </div>
            );
          })}
        </div>
      </Bloque>

      {/* Adjuntar foto (placeholder) */}
      <Bloque titulo="Evidencia (opcional)" icon={Camera}>
        <button style={{ ...ghostBtn, padding: "10px 16px" }}><Camera size={16} /> Agregar foto</button>
        <span style={{ fontSize: 11.5, color: C.slate, marginLeft: 10 }}>Se guardaría en la nube, organizada por embarcación y marea.</span>
      </Bloque>

      {/* Veredicto */}
      <Card style={{ marginTop: 16, borderTop: `4px solid ${sugerencia === "apto" ? C.green : C.amber}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          {sugerencia === "apto"
            ? <Check size={20} color={C.green} />
            : <AlertTriangle size={20} color={C.amber} />}
          <span style={{ fontSize: 13.5, color: C.slate }}>
            {sugerencia === "apto"
              ? "Sin observaciones detectadas. Puedes declarar la embarcación apta."
              : "Hay ítems en falla o niveles bajos. Si no es apta, se generará una solicitud al Jefe de Mantención."}
          </span>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={() => setApto("apto")}
            style={{ flex: 1, minWidth: 160, justifyContent: "center", display: "inline-flex", alignItems: "center", gap: 8, padding: "14px", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 15, fontWeight: 800, fontFamily: "inherit", background: apto === "apto" ? C.green : C.greenBg, color: apto === "apto" ? "#fff" : C.green }}>
            <Check size={18} /> APTO PARA ZARPAR
          </button>
          <button onClick={() => setApto("no_apto")}
            style={{ flex: 1, minWidth: 160, justifyContent: "center", display: "inline-flex", alignItems: "center", gap: 8, padding: "14px", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 15, fontWeight: 800, fontFamily: "inherit", background: apto === "no_apto" ? C.red : C.redBg, color: apto === "no_apto" ? "#fff" : C.red }}>
            <X size={18} /> NO APTO
          </button>
        </div>
        {apto && (
          <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 9, background: C.mist, fontSize: 12.5, color: C.slate }}>
            (Mockup) Aquí se guardaría el prezarpe, se abriría la marea de <strong>{nave?.nombre}</strong>, se actualizarían los horómetros{apto === "no_apto" ? " y se generaría una solicitud por las observaciones." : "."}
          </div>
        )}
      </Card>
    </div>
  );
}

// ---------- Auxiliares visuales ----------
function Bloque({ titulo, icon: Icon, extra, children }) {
  return (
    <Card style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <Icon size={17} color={C.steel} />
          <span style={{ ...archivo, fontWeight: 700, fontSize: 14, color: C.abyss }}>{titulo}</span>
        </div>
        {extra}
      </div>
      {children}
    </Card>
  );
}

function Semaforo({ activo, tone, onClick, children }) {
  const col = tone === "green" ? C.green : C.red;
  const bg = tone === "green" ? C.greenBg : C.redBg;
  return (
    <button onClick={onClick}
      style={{ width: 40, height: 36, borderRadius: 9, border: `1.5px solid ${activo ? col : C.line}`, background: activo ? col : bg, color: activo ? "#fff" : col, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
      {children}
    </button>
  );
}

function NivelItem({ label, estado, onSet }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 12.5, color: C.slate, minWidth: 96 }}>{label}</span>
      <button onClick={() => onSet("ok")}
        style={{ padding: "6px 11px", borderRadius: 8, border: `1.5px solid ${estado === "ok" ? C.green : C.line}`, background: estado === "ok" ? C.green : C.greenBg, color: estado === "ok" ? "#fff" : C.green, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Normal</button>
      <button onClick={() => onSet("bajo")}
        style={{ padding: "6px 11px", borderRadius: 8, border: `1.5px solid ${estado === "bajo" ? C.amber : C.line}`, background: estado === "bajo" ? C.amber : C.yellowBg, color: estado === "bajo" ? "#fff" : "#7a5b00", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Bajo</button>
    </div>
  );
}

function Stepper({ label, unidad, icon: Icon, value, onChange, step = 1 }) {
  return (
    <div style={{ padding: "12px 14px", border: `1px solid ${C.line}`, borderRadius: 10, background: "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
        <Icon size={15} color={C.steel} />
        <span style={{ fontSize: 12.5, fontWeight: 600, color: C.ink }}>{label}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button onClick={() => onChange(Math.max(0, value - step))} style={stepBtn}>−</button>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 4, background: "#F2F8FD", border: "1px solid #CFE3F2", borderRadius: 8, padding: "4px 8px" }}>
          <input type="number" value={value}
            onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
            style={{ width: "100%", border: "none", background: "transparent", textAlign: "center", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 16, color: C.steel, outline: "none" }} />
          <span style={{ fontSize: 11, color: C.slate }}>{unidad}</span>
        </div>
        <button onClick={() => onChange(value + step)} style={stepBtn}>+</button>
      </div>
    </div>
  );
}

const stepBtn = { width: 34, height: 34, borderRadius: 8, border: `1px solid ${C.line}`, background: C.mist, color: C.steel, fontSize: 20, fontWeight: 700, cursor: "pointer", lineHeight: 1 };
