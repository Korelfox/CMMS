import React, { useState, useEffect, useCallback } from "react";
import {
  Ship, Anchor, Fuel, Droplet, Gauge, Check, X, AlertTriangle,
  ArrowLeft, Camera, ClipboardCheck, Waves, CloudOff, Clock,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { fetchAll, insertRow, updateRow, logActivity } from "../lib/db";
import { useOnline, cacheTable, getCached, queueInsert, nuevoId } from "../lib/offline";
import { C, archivo, canOperate } from "../theme";
import { Card, PageHead, Pill, primaryBtn, ghostBtn, InlineSpinner, ErrorBanner, Empty } from "../ui";

const HOY = () => new Date().toISOString().slice(0, 10);
// Ítems de seguridad estándar (lista fija para toda la flota)
const SEGURIDAD_FIJA = ["Sistema de gobierno", "Bombas de achique", "Luces de navegación", "Equipo de seguridad"];

export default function Prezarpe() {
  const { profile } = useAuth();
  const online = useOnline();
  const [embarcaciones, setEmbarcaciones] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [mareas, setMareas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [usandoCache, setUsandoCache] = useState(false);
  const [vista, setVista] = useState("flota");
  const [nave, setNave] = useState(null);
  const puedeOperar = canOperate(profile?.rol);

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [embs, eqs, ms] = await Promise.all([
        fetchAll("embarcaciones", { order: { col: "codigo", asc: true } }),
        fetchAll("equipos", { order: { col: "id_visible", asc: true } }),
        fetchAll("mareas", { order: { col: "zarpe_at", asc: false } }),
      ]);
      setEmbarcaciones(embs); setEquipos(eqs); setMareas(ms); setUsandoCache(false);
      cacheTable("embarcaciones", embs); cacheTable("equipos", eqs); cacheTable("mareas", ms);
    } catch (e) {
      const [embs, eqs, ms] = await Promise.all([getCached("embarcaciones"), getCached("equipos"), getCached("mareas")]);
      setEmbarcaciones(embs); setEquipos(eqs); setMareas(ms); setUsandoCache(true);
      if (!embs.length) setError("No se pudo cargar y no hay copia local. Conéctate al menos una vez.");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => {
    const f = () => cargar();
    window.addEventListener("cmms-synced", f);
    return () => window.removeEventListener("cmms-synced", f);
  }, [cargar]);

  const embName = (id) => embarcaciones.find((e) => e.id === id)?.nombre || "—";
  const mareaAbierta = (embId) => mareas.find((m) => m.embarcacion_id === embId && m.estado === "navegando");

  async function registrarRecalada(m) {
    if (!online) { setError("Registrar la recalada requiere conexión."); return; }
    if (!window.confirm(`¿Registrar recalada de ${embName(m.embarcacion_id)} y cerrar la marea?`)) return;
    try {
      await updateRow("mareas", m.id, { estado: "cerrada", recalada_at: new Date().toISOString() });
      logActivity(profile, "Recalada", embName(m.embarcacion_id));
      cargar();
    } catch (e) { setError("No se pudo registrar la recalada: " + e.message); }
  }

  // Guarda el prezarpe: abre la marea + registra el checklist. El trigger de
  // la base aplica los horómetros a los equipos (también al sincronizar offline).
  async function guardarPrezarpe(payload) {
    const mareaId = nuevoId();
    const prezId = nuevoId();
    const folio = `M-${String(mareas.length + 1).padStart(3, "0")}`;
    const marea = { id: mareaId, empresa_id: profile.empresa_id, embarcacion_id: nave.id, folio, estado: "navegando", zarpe_at: new Date().toISOString(), responsable: profile.nombre || "", created_by: profile.id };
    const prez = { id: prezId, empresa_id: profile.empresa_id, embarcacion_id: nave.id, marea_id: mareaId, fecha: HOY(), responsable: profile.nombre || "", ...payload, created_by: profile.id };
    try {
      if (online) {
        const { empresa_id: _a, ...mRest } = marea; await insertRow("mareas", profile.empresa_id, mRest);
        const { empresa_id: _b, ...pRest } = prez; await insertRow("prezarpes", profile.empresa_id, pRest);
        logActivity(profile, "Prezarpe", `${nave.nombre} · ${payload.apto ? "APTO" : "NO APTO"}`);
        await cargar();
      } else {
        await queueInsert("mareas", marea, `Zarpe ${nave.nombre}`);
        await queueInsert("prezarpes", prez, `Prezarpe ${nave.nombre}`);
        setMareas((p) => [{ ...marea, _pending: true }, ...p]);
      }
      setVista("flota"); setNave(null); setError(null);
    } catch (e) { setError("No se pudo guardar el prezarpe: " + e.message); }
  }

  if (loading) return <div><PageHead kicker="Flota · Operación" title="Prezarpe & Mareas" /><Card><InlineSpinner label="Cargando flota…" /></Card></div>;

  return (
    <div>
      <PageHead kicker="Flota · Operación" title="Prezarpe & Mareas"
        sub="Antes de cada zarpe, inspecciona la embarcación y registra niveles, abastecimiento y horómetros. La lectura de horómetros actualiza el Plan Preventivo." />

      <ErrorBanner onRetry={cargar}>{error}</ErrorBanner>

      {(!online || usandoCache) && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: C.yellowBg, border: `1px solid ${C.amber}`, color: "#7a5b00", padding: "10px 14px", borderRadius: 10, marginBottom: 14, fontSize: 13 }}>
          <CloudOff size={17} />
          <span>{online ? "Mostrando la última copia guardada en este dispositivo." : "Sin conexión: puedes registrar el prezarpe igual; se sube solo al recuperar señal. La recalada requiere conexión."}</span>
        </div>
      )}

      {vista === "flota"
        ? <VistaFlota embarcaciones={embarcaciones} mareaAbierta={mareaAbierta} puedeOperar={puedeOperar}
            onIniciar={(n) => { setNave(n); setVista("checklist"); }} onRecalada={registrarRecalada} />
        : <VistaChecklist nave={nave} equipos={equipos.filter((e) => e.embarcacion_id === nave.id)}
            onVolver={() => { setVista("flota"); setNave(null); }} onGuardar={guardarPrezarpe} />}
    </div>
  );
}

// ---------- Pantalla 1: flota ----------
function VistaFlota({ embarcaciones, mareaAbierta, puedeOperar, onIniciar, onRecalada }) {
  if (embarcaciones.length === 0) {
    return <Card><Empty><Ship size={30} color={C.amber} style={{ marginBottom: 10 }} /><br />Registra al menos una embarcación para usar el prezarpe.</Empty></Card>;
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
      {embarcaciones.map((n) => {
        const marea = mareaAbierta(n.id);
        const navegando = !!marea;
        return (
          <Card key={n.id} style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "16px 18px", background: navegando ? "#EAF4FF" : C.mist, display: "flex", alignItems: "center", gap: 12, borderBottom: `1px solid ${C.line}` }}>
              <div style={{ width: 46, height: 46, borderRadius: 11, background: navegando ? C.cyan : C.steel, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {navegando ? <Ship size={24} color="#fff" /> : <Anchor size={24} color="#fff" />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ ...archivo, fontSize: 17, fontWeight: 800, color: C.abyss }}>{n.nombre}</div>
                <div style={{ fontSize: 11.5, color: C.slate, fontFamily: "'IBM Plex Mono', monospace" }}>{n.codigo}</div>
              </div>
              <Pill tone={navegando ? "cyan" : "slate"}>{navegando ? "Navegando" : "En puerto"}</Pill>
            </div>
            <div style={{ padding: "14px 18px" }}>
              {navegando ? (
                <div>
                  <div style={{ fontSize: 12.5, color: C.slate, marginBottom: 10 }}>
                    Zarpó {new Date(marea.zarpe_at).toLocaleString("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    {marea._pending && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: "#7a5b00", background: C.amber, padding: "1px 6px", borderRadius: 20 }}><Clock size={9} /> Pendiente</span>}
                  </div>
                  {puedeOperar && <button onClick={() => onRecalada(marea)} style={{ ...ghostBtn, width: "100%", justifyContent: "center", padding: "11px", color: C.steel, borderColor: C.steel }}><Anchor size={16} /> Registrar recalada</button>}
                </div>
              ) : (
                puedeOperar
                  ? <button onClick={() => onIniciar(n)} style={{ ...primaryBtn, width: "100%", justifyContent: "center", padding: "12px" }}><ClipboardCheck size={17} /> Iniciar prezarpe</button>
                  : <div style={{ fontSize: 12.5, color: C.slate, textAlign: "center" }}>En puerto</div>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ---------- Pantalla 2: checklist ----------
function VistaChecklist({ nave, equipos, onVolver, onGuardar }) {
  const visualEquipos = equipos.filter((e) => e.prezarpe).map((e) => ({ item: e.sistema || e.id_visible, origen: "equipo" }));
  const visualItems = [...visualEquipos, ...SEGURIDAD_FIJA.map((s) => ({ item: s, origen: "fijo" }))];
  const nivelEquipos = equipos.filter((e) => (e.nivel_tipo || "ninguno") !== "ninguno");

  const [visual, setVisual] = useState({});
  const [niveles, setNiveles] = useState({});
  const [litros, setLitros] = useState({ combustible: 0, agua: 0, aceite: 0 });
  const [horom, setHorom] = useState({});
  const [guardando, setGuardando] = useState(false);

  const setVis = (it, v) => setVisual((p) => ({ ...p, [it]: p[it] === v ? null : v }));
  const setNiv = (id, campo, v) => setNiveles((p) => ({ ...p, [id]: { ...p[id], [campo]: (p[id]?.[campo] === v ? null : v) } }));

  const hechosVisual = Object.values(visual).filter(Boolean).length;
  const hayFalla = Object.values(visual).includes("falla");
  const hayBajo = Object.values(niveles).some((n) => n?.aceite === "bajo" || n?.agua === "bajo");
  const horomInvalido = nivelEquipos.some((e) => { const v = horom[e.id]; return v !== undefined && v !== "" && Number(v) < (e.horas_actual || 0); });
  const sugerencia = hayFalla || hayBajo ? "no_apto" : "apto";

  async function guardar(apto) {
    if (horomInvalido) return;
    const ok = apto
      ? window.confirm(`Declarar ${nave.nombre} APTA para zarpar?`)
      : window.confirm(`Marcar ${nave.nombre} como NO APTA? Se registrará el prezarpe con las observaciones.`);
    if (!ok) return;
    setGuardando(true);
    // Solo horómetros con lectura ingresada
    const horometros = {};
    nivelEquipos.forEach((e) => { if (horom[e.id] !== undefined && horom[e.id] !== "") horometros[e.id] = Number(horom[e.id]); });
    await onGuardar({
      visual, niveles,
      combustible_l: litros.combustible, agua_l: litros.agua, aceite_l: litros.aceite,
      horometros, apto,
      observaciones: "",
    });
    setGuardando(false);
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <button onClick={onVolver} style={{ ...ghostBtn, padding: "7px 12px" }}><ArrowLeft size={15} /> Flota</button>
        <div style={{ ...archivo, fontSize: 18, fontWeight: 800, color: C.abyss }}>Prezarpe · {nave?.nombre}</div>
      </div>

      <Bloque titulo="A · Inspección visual" icon={Ship} extra={<span style={{ fontSize: 11.5, color: C.slate }}>{hechosVisual}/{visualItems.length}</span>}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px,1fr))", gap: 10 }}>
          {visualItems.map(({ item, origen }) => (
            <div key={item} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 12px", border: `1px solid ${C.line}`, borderRadius: 10, background: "#fff" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.ink, display: "inline-flex", alignItems: "center", gap: 6 }}>
                {item}
                {origen === "equipo" && <span style={{ fontSize: 9, fontWeight: 700, color: C.steel, background: "#E4EFF8", padding: "1px 6px", borderRadius: 20 }}>EQUIPO</span>}
              </span>
              <div style={{ display: "flex", gap: 6 }}>
                <Semaforo activo={visual[item] === "ok"} tone="green" onClick={() => setVis(item, "ok")}><Check size={16} /></Semaforo>
                <Semaforo activo={visual[item] === "falla"} tone="red" onClick={() => setVis(item, "falla")}><X size={16} /></Semaforo>
              </div>
            </div>
          ))}
        </div>
      </Bloque>

      {nivelEquipos.length > 0 && (
        <Bloque titulo="B · Niveles de operación" icon={Droplet}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {nivelEquipos.map((eq) => (
              <div key={eq.id} style={{ padding: "12px 14px", border: `1px solid ${C.line}`, borderRadius: 10, background: "#fff" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.abyss, marginBottom: 8 }}>
                  {eq.sistema || eq.id_visible} <span style={{ fontSize: 10.5, fontWeight: 600, color: C.slate }}>· {eq.nivel_tipo === "aceite_agua" ? "aceite + agua chaqueta" : "solo aceite"}</span>
                </div>
                <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
                  <NivelItem label="Aceite" estado={niveles[eq.id]?.aceite} onSet={(v) => setNiv(eq.id, "aceite", v)} />
                  {eq.nivel_tipo === "aceite_agua" && <NivelItem label="Agua chaqueta" estado={niveles[eq.id]?.agua} onSet={(v) => setNiv(eq.id, "agua", v)} />}
                </div>
              </div>
            ))}
          </div>
        </Bloque>
      )}

      <Bloque titulo="C · Abastecimiento a bordo" icon={Fuel}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px,1fr))", gap: 12 }}>
          <Stepper label="Combustible" unidad="L" icon={Fuel} value={litros.combustible} onChange={(v) => setLitros((p) => ({ ...p, combustible: v }))} step={50} />
          <Stepper label="Agua dulce" unidad="L" icon={Waves} value={litros.agua} onChange={(v) => setLitros((p) => ({ ...p, agua: v }))} step={20} />
          <Stepper label="Aceite" unidad="L" icon={Droplet} value={litros.aceite} onChange={(v) => setLitros((p) => ({ ...p, aceite: v }))} step={5} />
        </div>
      </Bloque>

      {nivelEquipos.length > 0 && (
        <Bloque titulo="D · Lectura de horómetros" icon={Gauge}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px,1fr))", gap: 12 }}>
            {nivelEquipos.map((eq) => {
              const val = horom[eq.id];
              const ant = eq.horas_actual || 0;
              const invalida = val !== undefined && val !== "" && Number(val) < ant;
              return (
                <div key={eq.id} style={{ padding: "12px 14px", border: `1px solid ${invalida ? C.red : C.line}`, borderRadius: 10, background: "#fff" }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: C.abyss }}>{eq.sistema || eq.id_visible}</div>
                  <div style={{ fontSize: 11, color: C.slate, marginBottom: 6, fontFamily: "'IBM Plex Mono', monospace" }}>Anterior: {ant} h</div>
                  <input type="number" placeholder={`≥ ${ant}`} value={val ?? ""}
                    onChange={(e) => setHorom((p) => ({ ...p, [eq.id]: e.target.value }))}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${invalida ? C.red : "#CFE3F2"}`, fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, fontWeight: 600, color: C.steel, background: "#F2F8FD" }} />
                  {invalida && <div style={{ fontSize: 10.5, color: C.red, fontWeight: 600, marginTop: 4 }}>Debe ser ≥ {ant} h</div>}
                </div>
              );
            })}
          </div>
        </Bloque>
      )}

      <Card style={{ marginTop: 16, borderTop: `4px solid ${sugerencia === "apto" ? C.green : C.amber}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          {sugerencia === "apto" ? <Check size={20} color={C.green} /> : <AlertTriangle size={20} color={C.amber} />}
          <span style={{ fontSize: 13.5, color: C.slate }}>
            {sugerencia === "apto" ? "Sin observaciones detectadas. Puedes declarar la embarcación apta." : "Hay ítems en falla o niveles bajos. Revisa antes de declarar el veredicto."}
          </span>
        </div>
        {horomInvalido && <div style={{ fontSize: 12.5, color: C.red, fontWeight: 600, marginBottom: 10 }}>Corrige las lecturas de horómetro (deben ser ≥ a la anterior) para poder guardar.</div>}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={() => guardar(true)} disabled={guardando || horomInvalido}
            style={{ flex: 1, minWidth: 160, justifyContent: "center", display: "inline-flex", alignItems: "center", gap: 8, padding: "14px", borderRadius: 10, border: "none", cursor: guardando || horomInvalido ? "default" : "pointer", fontSize: 15, fontWeight: 800, fontFamily: "inherit", background: C.green, color: "#fff", opacity: horomInvalido ? 0.5 : 1 }}>
            <Check size={18} /> {guardando ? "Guardando…" : "APTO PARA ZARPAR"}
          </button>
          <button onClick={() => guardar(false)} disabled={guardando || horomInvalido}
            style={{ flex: 1, minWidth: 160, justifyContent: "center", display: "inline-flex", alignItems: "center", gap: 8, padding: "14px", borderRadius: 10, border: `1.5px solid ${C.red}`, cursor: guardando || horomInvalido ? "default" : "pointer", fontSize: 15, fontWeight: 800, fontFamily: "inherit", background: C.redBg, color: C.red, opacity: horomInvalido ? 0.5 : 1 }}>
            <X size={18} /> NO APTO
          </button>
        </div>
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
    <button onClick={onClick} style={{ width: 40, height: 36, borderRadius: 9, border: `1.5px solid ${activo ? col : C.line}`, background: activo ? col : bg, color: activo ? "#fff" : col, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
      {children}
    </button>
  );
}

function NivelItem({ label, estado, onSet }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 12.5, color: C.slate, minWidth: 96 }}>{label}</span>
      <button onClick={() => onSet("ok")} style={{ padding: "6px 11px", borderRadius: 8, border: `1.5px solid ${estado === "ok" ? C.green : C.line}`, background: estado === "ok" ? C.green : C.greenBg, color: estado === "ok" ? "#fff" : C.green, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Normal</button>
      <button onClick={() => onSet("bajo")} style={{ padding: "6px 11px", borderRadius: 8, border: `1.5px solid ${estado === "bajo" ? C.amber : C.line}`, background: estado === "bajo" ? C.amber : C.yellowBg, color: estado === "bajo" ? "#fff" : "#7a5b00", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Bajo</button>
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
          <input type="number" value={value} onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
            style={{ width: "100%", border: "none", background: "transparent", textAlign: "center", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 16, color: C.steel, outline: "none" }} />
          <span style={{ fontSize: 11, color: C.slate }}>{unidad}</span>
        </div>
        <button onClick={() => onChange(value + step)} style={stepBtn}>+</button>
      </div>
    </div>
  );
}

const stepBtn = { width: 34, height: 34, borderRadius: 8, border: `1px solid ${C.line}`, background: C.mist, color: C.steel, fontSize: 20, fontWeight: 700, cursor: "pointer", lineHeight: 1 };
