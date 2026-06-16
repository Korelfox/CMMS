import React, { useState, useEffect } from "react";
import { Ship, Anchor, Fuel, Droplet, Gauge, Check, X, AlertTriangle, ArrowLeft, Camera, ClipboardCheck, Waves, CloudOff, Clock, Trash2, Pencil, Plus, RotateCcw, Wrench } from "lucide-react";
import { insertRow, updateRow, deleteRow, logActivity } from "../../lib/db";
import { useOnline, cacheTable, getCached, queueInsert, nuevoId } from "../../lib/offline";
import { subirFotos, listarFotos, borrarFoto } from "../../lib/fotos";
import { C, archivo, canOperate, isAdmin, tint } from "../../theme";
import EquipoPicker from "../EquipoPicker";
import { Card, Pill, primaryBtn, ghostBtn, thStyle, tdStyle, Empty, Field, inputStyle } from "../../ui";
import { FotoInput, FotoGaleria } from "../Fotos";
import { Bloque, Semaforo, NivelItem, Stepper, StepperRef } from "./widgets";
import { HOY, SEGURIDAD_FIJA } from "./util";

export function VistaFlota({ embarcaciones, mareaAbierta, varadas = [], docsVencidos, puedeOperar, puedeBorrar, onIniciar, onRecalada, onEliminarZarpe, onRetornoFalla }) {
  if (embarcaciones.length === 0) {
    return <Card><Empty><Ship size={30} color={C.amber} style={{ marginBottom: 10 }} /><br />Registra al menos una embarcación para usar el prezarpe.</Empty></Card>;
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
      {embarcaciones.map((n) => {
        const marea = mareaAbierta(n.id);
        const navegando = !!marea;
        const enVarada = (varadas || []).some((v) => v.embarcacion_id === n.id && v.estado === "ejecucion");
        const vencidos = docsVencidos ? docsVencidos(n.id) : [];
        return (
          <Card key={n.id} style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "16px 18px", background: enVarada ? tint(C.indigo, 10) : navegando ? tint(C.cyan, 10) : C.mist, display: "flex", alignItems: "center", gap: 12, borderBottom: `1px solid ${C.line}` }}>
              <div style={{ width: 46, height: 46, borderRadius: 11, background: enVarada ? C.indigo : navegando ? C.cyan : C.steel, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {enVarada ? <Wrench size={23} color="#fff" /> : navegando ? <Ship size={24} color="#fff" /> : <Anchor size={24} color="#fff" />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ ...archivo, fontSize: 17, fontWeight: 800, color: C.abyss }}>{n.nombre}</div>
                <div style={{ fontSize: 11.5, color: C.slate, fontFamily: "'IBM Plex Mono', monospace" }}>{n.codigo}</div>
              </div>
              <Pill tone={enVarada ? "indigo" : navegando ? "cyan" : "slate"}>{enVarada ? "En varada" : navegando ? "Navegando" : "En puerto"}</Pill>
            </div>
            {vencidos.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 18px", background: C.redBg, color: C.red, fontSize: 12, fontWeight: 600, borderBottom: `1px solid ${C.line}` }}>
                <AlertTriangle size={15} /> {vencidos.length} documento{vencidos.length !== 1 ? "s" : ""} vencido{vencidos.length !== 1 ? "s" : ""} — revisar Cumplimiento antes de zarpar
              </div>
            )}
            <div style={{ padding: "14px 18px" }}>
              {navegando ? (
                <div>
                  <div style={{ fontSize: 12.5, color: C.slate, marginBottom: 10 }}>
                    Zarpó {new Date(marea.zarpe_at).toLocaleString("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    {marea._pending && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: "#7a5b00", background: C.amber, padding: "1px 6px", borderRadius: 20 }}><Clock size={9} /> Pendiente</span>}
                  </div>
                  {puedeOperar && (
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => onRecalada(marea)} style={{ ...ghostBtn, flex: 1, justifyContent: "center", padding: "11px", color: C.steel, borderColor: C.steel }}><Anchor size={16} /> Recalada</button>
                      <button onClick={() => onRetornoFalla(marea)} style={{ ...ghostBtn, flex: 1, justifyContent: "center", padding: "11px", color: "#fff", background: C.red, borderColor: C.red }}><AlertTriangle size={16} /> Retorno por falla</button>
                    </div>
                  )}
                  {puedeBorrar && <button onClick={() => onEliminarZarpe(marea)} style={{ ...ghostBtn, width: "100%", justifyContent: "center", padding: "9px", marginTop: 8, color: C.red, borderColor: C.red, fontSize: 12.5 }}><Trash2 size={14} /> Eliminar zarpe (creado por error)</button>}
                </div>
              ) : enVarada ? (
                <div style={{ fontSize: 12.5, color: C.indigo, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontWeight: 600 }}>
                  <Wrench size={14} /> En varada — mantención en curso
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
export function VistaChecklist({ nave, equipos, online, onVolver, onGuardar, onSaveConfig }) {
  const visualEquipos = equipos.filter((e) => e.prezarpe).map((e) => ({ item: e.sistema || e.id_visible, origen: "equipo" }));
  const nivelEquipos = equipos.filter((e) => (e.nivel_tipo || "ninguno") !== "ninguno");

  const [visual, setVisual] = useState({});
  const [niveles, setNiveles] = useState({});
  const [litros, setLitros] = useState({ combustible: 0, agua: 0, aceite: 0 });
  const [horom, setHorom] = useState({});
  const [fotos, setFotos] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [config, setConfig] = useState(() => {
    const c = nave?.prezarpe_config || {};
    return { extra: c.extra || [], excluidos: c.excluidos || [], hor_excluidos: c.hor_excluidos || [], hor_extra: c.hor_extra || [] };
  });
  const [modoEdicion, setModoEdicion] = useState(false);
  const [nuevoItem, setNuevoItem] = useState("");

  const excluidos = new Set(config.excluidos);
  const visualItems = [
    ...SEGURIDAD_FIJA.filter((s) => !excluidos.has(s)).map((s) => ({ item: s, origen: "fijo" })),
    ...visualEquipos.filter((e) => !excluidos.has(e.item)),
    ...(config.extra || []).map((e) => ({ item: e, origen: "extra" })),
  ];

  function saveConfig(c) { setConfig(c); onSaveConfig?.(c); }
  function quitarItem({ item, origen }) {
    const c = origen === "extra"
      ? { ...config, extra: config.extra.filter((x) => x !== item) }
      : { ...config, excluidos: [...config.excluidos, item] };
    saveConfig(c);
    setVisual((v) => { const next = { ...v }; delete next[item]; return next; });
  }
  function restaurarItem(item) {
    saveConfig({ ...config, excluidos: config.excluidos.filter((x) => x !== item) });
  }
  function agregarItem() {
    const t = nuevoItem.trim();
    if (!t || config.extra.includes(t)) return;
    saveConfig({ ...config, extra: [...config.extra, t] });
    setNuevoItem("");
  }

  const [modoEdicionD, setModoEdicionD] = useState(false);

  const horExcluidosSet = new Set(config.hor_excluidos || []);
  const horExtraIds     = config.hor_extra || [];
  const horomEquipos    = [
    ...nivelEquipos.filter((e) => !horExcluidosSet.has(e.id)),
    ...horExtraIds.map((id) => equipos.find((e) => e.id === id)).filter(Boolean),
  ];
  const equiposDisponibles = equipos.filter(
    (e) => !nivelEquipos.some((x) => x.id === e.id) && !horExtraIds.includes(e.id)
  );

  function quitarHorom(eq) {
    const isExtra = horExtraIds.includes(eq.id);
    const c = isExtra
      ? { ...config, hor_extra: horExtraIds.filter((id) => id !== eq.id) }
      : { ...config, hor_excluidos: [...(config.hor_excluidos || []), eq.id] };
    saveConfig(c);
    setHorom((h) => { const next = { ...h }; delete next[eq.id]; return next; });
  }
  function restaurarHorom(eqId) {
    saveConfig({ ...config, hor_excluidos: (config.hor_excluidos || []).filter((id) => id !== eqId) });
  }
  function agregarHorom(eqId) {
    if (!eqId) return;
    saveConfig({ ...config, hor_extra: [...horExtraIds, eqId] });
  }

  const setVis = (it, v) => setVisual((p) => ({ ...p, [it]: p[it] === v ? null : v }));
  const setNiv = (id, campo, v) => setNiveles((p) => ({ ...p, [id]: { ...p[id], [campo]: (p[id]?.[campo] === v ? null : v) } }));

  const hechosVisual = Object.values(visual).filter(Boolean).length;
  const hayFalla = Object.values(visual).includes("falla");
  const hayBajo = Object.values(niveles).some((n) => n?.aceite === "bajo" || n?.agua === "bajo");
  const horomInvalido = horomEquipos.some((e) => { const v = horom[e.id]; return v !== undefined && v !== "" && Number(v) < (e.horas_actual || 0); });
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
    horomEquipos.forEach((e) => { if (horom[e.id] !== undefined && horom[e.id] !== "") horometros[e.id] = Number(horom[e.id]); });
    await onGuardar({
      visual, niveles,
      combustible_l: litros.combustible, agua_l: litros.agua, aceite_l: litros.aceite,
      horometros, apto,
      observaciones: "",
    }, fotos);
    setGuardando(false);
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <button onClick={onVolver} style={{ ...ghostBtn, padding: "7px 12px" }}><ArrowLeft size={15} /> Flota</button>
        <div style={{ ...archivo, fontSize: 18, fontWeight: 800, color: C.abyss }}>Prezarpe · {nave?.nombre}</div>
      </div>

      <Bloque titulo="A · Inspección visual" icon={Ship} extra={
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {!modoEdicion && <span style={{ fontSize: 11.5, color: C.slate }}>{hechosVisual}/{visualItems.length}</span>}
          <button onClick={() => setModoEdicion(!modoEdicion)}
            style={{ padding: "4px 10px", borderRadius: 7,
              border: `1px solid ${modoEdicion ? C.green : C.line}`,
              background: modoEdicion ? tint(C.green, 10) : C.surface,
              color: modoEdicion ? C.green : C.slate,
              fontSize: 12, fontWeight: 700, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 5 }}>
            {modoEdicion ? <><Check size={12}/> Listo</> : <><Pencil size={12}/> Editar lista</>}
          </button>
        </div>
      }>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px,1fr))", gap: 10 }}>
          {visualItems.map(({ item, origen }) => (
            <div key={item} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 12px", border: `1px solid ${modoEdicion ? C.line : C.line}`, borderRadius: 10, background: C.surface }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.ink, display: "inline-flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item}</span>
                {origen === "equipo" && <span style={{ fontSize: 9, fontWeight: 700, color: C.steel, background: tint(C.steel, 14), padding: "1px 6px", borderRadius: 20, flexShrink: 0 }}>EQUIPO</span>}
                {origen === "extra" && <span style={{ fontSize: 9, fontWeight: 700, color: C.purple, background: tint(C.purple, 14), padding: "1px 6px", borderRadius: 20, flexShrink: 0 }}>CUSTOM</span>}
              </span>
              {modoEdicion ? (
                <button onClick={() => quitarItem({ item, origen })}
                  style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${C.red}`, background: C.redBg, color: C.red, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <X size={14}/>
                </button>
              ) : (
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <Semaforo activo={visual[item] === "ok"} tone="green" onClick={() => setVis(item, "ok")}><Check size={16} /></Semaforo>
                  <Semaforo activo={visual[item] === "falla"} tone="red" onClick={() => setVis(item, "falla")}><X size={16} /></Semaforo>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ── Modo edición: agregar y restaurar ── */}
        {modoEdicion && (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input value={nuevoItem} onChange={(e) => setNuevoItem(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") agregarItem(); }}
                placeholder="Agregar ítem personalizado…"
                style={{ ...inputStyle(), flex: 1 }}/>
              <button onClick={agregarItem}
                style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: C.steel, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
                <Plus size={14}/> Agregar
              </button>
            </div>
            {config.excluidos.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 10.5, color: C.slate, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 7 }}>Ítems ocultos</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {config.excluidos.map((exc) => (
                    <div key={exc} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 20, border: `1px solid ${C.line}`, background: C.mist, fontSize: 12.5, color: C.slate }}>
                      <span>{exc}</span>
                      <button onClick={() => restaurarItem(exc)} title="Restaurar"
                        style={{ background: "none", border: "none", cursor: "pointer", color: C.steel, padding: 0, display: "flex", alignItems: "center" }}>
                        <RotateCcw size={12}/>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Bloque>

      {nivelEquipos.length > 0 && (
        <Bloque titulo="B · Niveles de operación" icon={Droplet}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {nivelEquipos.map((eq) => (
              <div key={eq.id} style={{ padding: "12px 14px", border: `1px solid ${C.line}`, borderRadius: 10, background: C.surface, marginLeft: (eq.depth || 0) * 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.abyss, marginBottom: 8 }}>
                  {(eq.depth || 0) > 0 && <span style={{ color: C.slate, fontSize: 12, marginRight: 5 }}>└─</span>}
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

      {(horomEquipos.length > 0 || modoEdicionD) && (
        <Bloque titulo="D · Lectura de horómetros" icon={Gauge} extra={
          <button onClick={() => setModoEdicionD(!modoEdicionD)}
            style={{ padding: "4px 10px", borderRadius: 7,
              border: `1px solid ${modoEdicionD ? C.green : C.line}`,
              background: modoEdicionD ? tint(C.green, 10) : C.surface,
              color: modoEdicionD ? C.green : C.slate,
              fontSize: 12, fontWeight: 700, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 5 }}>
            {modoEdicionD ? <><Check size={12}/> Listo</> : <><Pencil size={12}/> Editar lista</>}
          </button>
        }>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px,1fr))", gap: 12 }}>
            {horomEquipos.map((eq) => {
              const val      = horom[eq.id];
              const ant      = eq.horas_actual || 0;
              const invalida = val !== undefined && val !== "" && Number(val) < ant;
              const isExtra  = horExtraIds.includes(eq.id);
              return (
                <div key={eq.id} style={{ padding: "12px 14px", border: `1px solid ${invalida ? C.red : C.line}`, borderRadius: 10, background: C.surface }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6, marginBottom: 4 }}>
                    <div>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: C.abyss, display: "flex", alignItems: "center", gap: 5 }}>
                        {eq.sistema || eq.id_visible}
                        {isExtra && <span style={{ fontSize: 9, fontWeight: 700, color: C.purple, background: tint(C.purple, 14), padding: "1px 6px", borderRadius: 20 }}>EXTRA</span>}
                      </div>
                      <div style={{ fontSize: 11, color: C.slate, fontFamily: "'IBM Plex Mono', monospace" }}>Anterior: {ant} h</div>
                    </div>
                    {modoEdicionD && (
                      <button onClick={() => quitarHorom(eq)}
                        style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${C.red}`, background: C.redBg, color: C.red, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <X size={13}/>
                      </button>
                    )}
                  </div>
                  {!modoEdicionD && (
                    <>
                      <input type="number" placeholder={`≥ ${ant}`} value={val ?? ""}
                        onChange={(e) => setHorom((p) => ({ ...p, [eq.id]: e.target.value }))}
                        style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${invalida ? C.red : tint(C.sky, 28)}`, fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, fontWeight: 600, color: C.steel, background: tint(C.sky, 9), boxSizing: "border-box" }} />
                      {invalida && <div style={{ fontSize: 10.5, color: C.red, fontWeight: 600, marginTop: 4 }}>Debe ser ≥ {ant} h</div>}
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {/* Modo edición: agregar + restaurar */}
          {modoEdicionD && (
            <div style={{ marginTop: 14 }}>
              {equiposDisponibles.length > 0 && (
                <select onChange={(e) => { agregarHorom(e.target.value); e.target.value = ""; }}
                  style={{ ...inputStyle(), width: "100%", boxSizing: "border-box" }}>
                  <option value="">+ Agregar equipo a horómetros…</option>
                  {equiposDisponibles.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.sistema || e.id_visible} — actual: {e.horas_actual || 0} h
                    </option>
                  ))}
                </select>
              )}
              {(config.hor_excluidos || []).length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 10.5, color: C.slate, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 7 }}>Equipos ocultos</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {(config.hor_excluidos || []).map((eqId) => {
                      const eq = equipos.find((e) => e.id === eqId);
                      return (
                        <div key={eqId} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 20, border: `1px solid ${C.line}`, background: C.mist, fontSize: 12.5, color: C.slate }}>
                          <span>{eq?.sistema || eq?.id_visible || eqId}</span>
                          <button onClick={() => restaurarHorom(eqId)} title="Restaurar"
                            style={{ background: "none", border: "none", cursor: "pointer", color: C.steel, padding: 0, display: "flex", alignItems: "center" }}>
                            <RotateCcw size={12}/>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </Bloque>
      )}

      <Bloque titulo="Evidencia (opcional)" icon={Camera}>
        <FotoInput files={fotos} onChange={setFotos} max={5} disabled={!online} />
        {!online && <div style={{ fontSize: 11, color: "#7a5b00", marginTop: 6 }}>Sin conexión: el prezarpe se guarda igual; las fotos se podrán agregar con señal.</div>}
      </Bloque>

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

// ---------- Pantalla 3: recalada (cierre de marea) ----------
export function VistaRecalada({ marea, nave, equipos, onVolver, onGuardar }) {
  const [litros, setLitros] = useState({ combustible: 0, agua: 0, aceite: 0 });
  const [horom, setHorom] = useState({});
  const [guardando, setGuardando] = useState(false);

  const iniH = marea?.horometros_ini || {};
  const horomInvalido = equipos.some((e) => {
    const v = horom[e.id]; const ant = Number(iniH[e.id] ?? e.horas_actual ?? 0);
    return v !== undefined && v !== "" && Number(v) < ant;
  });

  async function guardar() {
    if (horomInvalido) return;
    if (!window.confirm(`¿Registrar recalada de ${nave?.nombre} y cerrar la marea?`)) return;
    setGuardando(true);
    const horometros_fin = {};
    equipos.forEach((e) => { if (horom[e.id] !== undefined && horom[e.id] !== "") horometros_fin[e.id] = Number(horom[e.id]); });
    await onGuardar({ comb_fin: litros.combustible, agua_fin: litros.agua, aceite_fin: litros.aceite, horometros_fin });
    setGuardando(false);
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <button onClick={onVolver} style={{ ...ghostBtn, padding: "7px 12px" }}><ArrowLeft size={15} /> Flota</button>
        <div style={{ ...archivo, fontSize: 18, fontWeight: 800, color: C.abyss }}>Recalada · {nave?.nombre}</div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, background: tint(C.cyan, 10), border: `1px solid ${C.cyan}`, color: C.steel, padding: "10px 14px", borderRadius: 10, marginBottom: 14, fontSize: 12.5 }}>
        <Anchor size={16} /> <span>Ingresa lo que <strong>quedó</strong> a bordo y la lectura final de horómetros. El sistema calculará el consumo de la marea.</span>
      </div>

      <Bloque titulo="Stock final a bordo" icon={Fuel}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px,1fr))", gap: 12 }}>
          <StepperRef label="Combustible" unidad="L" icon={Fuel} ini={marea?.comb_ini} value={litros.combustible} onChange={(v) => setLitros((p) => ({ ...p, combustible: v }))} step={50} />
          <StepperRef label="Agua dulce" unidad="L" icon={Waves} ini={marea?.agua_ini} value={litros.agua} onChange={(v) => setLitros((p) => ({ ...p, agua: v }))} step={20} />
          <StepperRef label="Aceite" unidad="L" icon={Droplet} ini={marea?.aceite_ini} value={litros.aceite} onChange={(v) => setLitros((p) => ({ ...p, aceite: v }))} step={5} />
        </div>
      </Bloque>

      {equipos.length > 0 && (
        <Bloque titulo="Horómetros finales" icon={Gauge}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px,1fr))", gap: 12 }}>
            {equipos.map((eq) => {
              const ant = Number(iniH[eq.id] ?? eq.horas_actual ?? 0);
              const val = horom[eq.id];
              const invalida = val !== undefined && val !== "" && Number(val) < ant;
              return (
                <div key={eq.id} style={{ padding: "12px 14px", border: `1px solid ${invalida ? C.red : C.line}`, borderRadius: 10, background: C.surface }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: C.abyss }}>{eq.sistema || eq.id_visible}</div>
                  <div style={{ fontSize: 11, color: C.slate, marginBottom: 6, fontFamily: "'IBM Plex Mono', monospace" }}>Al zarpar: {ant} h</div>
                  <input type="number" placeholder={`≥ ${ant}`} value={val ?? ""}
                    onChange={(e) => setHorom((p) => ({ ...p, [eq.id]: e.target.value }))}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${invalida ? C.red : tint(C.sky, 28)}`, fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, fontWeight: 600, color: C.steel, background: tint(C.sky, 9) }} />
                  {invalida && <div style={{ fontSize: 10.5, color: C.red, fontWeight: 600, marginTop: 4 }}>Debe ser ≥ {ant} h</div>}
                </div>
              );
            })}
          </div>
        </Bloque>
      )}

      <button onClick={guardar} disabled={guardando || horomInvalido}
        style={{ ...primaryBtn, width: "100%", justifyContent: "center", padding: "14px", fontSize: 15, opacity: horomInvalido ? 0.5 : 1, cursor: guardando || horomInvalido ? "default" : "pointer" }}>
        <Anchor size={18} /> {guardando ? "Guardando…" : "Registrar recalada y cerrar marea"}
      </button>
    </div>
  );
}

// Stepper que muestra el valor inicial como referencia

export function VistaRetornoFalla({ marea, nave, equipos, onVolver, onGuardar }) {
  const [form, setForm] = useState({
    equipo_id: "", descripcion: "", severidad: "alta", riesgoTrip: false,
  });
  const [enviando, setEnviando] = useState(false);

  if (!marea) return null;
  if (!nave) return (
    <div>
      <button onClick={onVolver} style={{ ...ghostBtn, padding: "7px 12px", marginBottom: 14 }}><ArrowLeft size={15} /> Volver</button>
      <Card><Empty><AlertTriangle size={28} color={C.amber} /><br />No se encontró la embarcación de esta marea.</Empty></Card>
    </div>
  );

  function sistemaLabel() {
    if (!form.equipo_id) return "Sin especificar";
    const eq = equipos.find((e) => e.id === form.equipo_id);
    if (!eq) return "—";
    const padre = eq.parent_id ? equipos.find((p) => p.id === eq.parent_id) : null;
    return padre ? `${padre.sistema} > ${eq.sistema}` : eq.sistema;
  }

  async function enviar() {
    if (!form.descripcion.trim()) return;
    setEnviando(true);
    try {
      await onGuardar({ ...form, sistemaLabel: sistemaLabel() });
    } finally { setEnviando(false); }
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <button onClick={onVolver} style={{ ...ghostBtn, padding: "7px 12px" }}><ArrowLeft size={15} /> Volver</button>
      </div>

      {/* Cabecera de alerta */}
      <Card style={{ borderTop: `5px solid ${C.red}`, marginBottom: 16, background: tint(C.red, 8) }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 54, height: 54, borderRadius: 14, background: C.red, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <AlertTriangle size={28} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: 10.5, letterSpacing: 2, textTransform: "uppercase", color: C.red, fontWeight: 700 }}>Retorno por falla</div>
            <div style={{ ...archivo, fontSize: 22, fontWeight: 800, color: C.abyss, marginTop: 2 }}>{nave.nombre}</div>
            <div style={{ fontSize: 12.5, color: C.slate, marginTop: 2 }}>
              Marea {marea.folio || "—"} · Zarpó {new Date(marea.zarpe_at).toLocaleString("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>
        </div>
      </Card>

      {/* Formulario */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: C.abyss, marginBottom: 16 }}>Informe de falla</div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          {/* Sistema/equipo afectado */}
          <Field label="Sistema o equipo afectado">
            <EquipoPicker equipos={equipos} value={form.equipo_id}
              placeholder="Buscar sistema o equipo afectado…"
              onChange={(eq) => setForm((p) => ({ ...p, equipo_id: eq?.id || "" }))} />
          </Field>

          {/* Severidad */}
          <Field label="Severidad de la falla">
            <div style={{ display: "flex", gap: 8 }}>
              {[
                { v: "media",   lbl: "Media",   desc: "Puede operar limitado",      color: C.amber },
                { v: "alta",    lbl: "Alta",     desc: "No puede pescar",            color: "#E05050" },
                { v: "critica", lbl: "Crítica",  desc: "Riesgo para nave/seguridad", color: "#B91C1C" },
              ].map((s) => (
                <button key={s.v} onClick={() => setForm((p) => ({ ...p, severidad: s.v }))}
                  title={s.desc}
                  style={{
                    flex: 1, padding: "10px 8px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700, textAlign: "center",
                    background: form.severidad === s.v ? s.color : "#fff",
                    color: form.severidad === s.v ? "#fff" : s.color,
                    border: `2px solid ${s.color}`,
                  }}>
                  {s.lbl}
                </button>
              ))}
            </div>
          </Field>
        </div>

        {/* Descripción */}
        <Field label="Descripción de la falla (qué se detectó, qué falló, síntomas)">
          <textarea value={form.descripcion}
            onChange={(e) => setForm((p) => ({ ...p, descripcion: e.target.value }))}
            placeholder="Ej: Motor principal perdió potencia a las 350 RPM, humo negro excesivo, temperatura sobre 100°C. Se decidió retornar a puerto."
            style={{ ...inputStyle(), width: "100%", minHeight: 100, resize: "vertical", fontFamily: "inherit", lineHeight: 1.6 }} />
        </Field>

        {/* Riesgo tripulación */}
        <label style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16, padding: "12px 14px", borderRadius: 8, border: `1px solid ${form.riesgoTrip ? C.red : C.line}`, background: form.riesgoTrip ? tint(C.red, 8) : "#fff", cursor: "pointer" }}>
          <input type="checkbox" checked={form.riesgoTrip}
            onChange={(e) => setForm((p) => ({ ...p, riesgoTrip: e.target.checked }))}
            style={{ width: 18, height: 18, accentColor: C.red }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 13.5, color: form.riesgoTrip ? C.red : C.ink }}>Hubo riesgo para la tripulación</div>
            <div style={{ fontSize: 12, color: C.slate }}>Marcar si la falla puso en peligro la seguridad de las personas a bordo</div>
          </div>
        </label>
      </Card>

      {/* Preview de lo que se generará */}
      <Card style={{ marginBottom: 16, background: tint(C.amber, 10), borderLeft: `4px solid ${C.amber}` }}>
        <div style={{ fontSize: 10.5, letterSpacing: 1.5, textTransform: "uppercase", color: C.slate, fontWeight: 700, marginBottom: 10 }}>
          Al confirmar se generará automáticamente:
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <Pill tone="red">OT Urgente</Pill>
            <span style={{ color: C.ink }}>Orden de trabajo correctiva prioridad <strong>CRÍTICA</strong></span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <Pill tone="yellow">Solicitud</Pill>
            <span style={{ color: C.ink }}>Notificación al Jefe de Mantención con detalle de la falla</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <Pill tone="slate">Cierre de marea</Pill>
            <span style={{ color: C.ink }}>La marea se cierra como <strong>retorno por falla</strong> (distinguible de recalada normal)</span>
          </div>
        </div>
        {form.equipo_id && (
          <div style={{ marginTop: 12, padding: "8px 12px", background: C.surface, borderRadius: 6, fontSize: 12.5, color: C.steel }}>
            Sistema afectado: <strong>{sistemaLabel()}</strong>
          </div>
        )}
      </Card>

      {/* Botones */}
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={enviar} disabled={!form.descripcion.trim() || enviando}
          style={{ ...primaryBtn, background: C.red, borderColor: C.red, padding: "14px 28px", fontSize: 15 }}>
          <AlertTriangle size={18} /> {enviando ? "Enviando…" : "Confirmar retorno por falla"}
        </button>
        <button onClick={onVolver} style={{ ...ghostBtn, padding: "14px 20px" }}>Cancelar</button>
      </div>
    </div>
  );
}

// ---------- Pantalla 4: historial de prezarpes ----------
export function VistaHistorial({ prezarpes, embName, mareas, puedeBorrar, onAbrir, onEliminar }) {
  if (prezarpes.length === 0) {
    return <Card><Empty><ClipboardCheck size={30} color={C.amber} style={{ marginBottom: 10 }} /><br />Aún no hay prezarpes registrados. Inicia uno desde Operación.</Empty></Card>;
  }
  return (
    <Card style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
          <thead><tr>
            <th style={thStyle}>Fecha</th><th style={thStyle}>Embarcación</th>
            <th style={thStyle}>Responsable</th><th style={thStyle}>Marea</th>
            <th style={thStyle}>Veredicto</th><th style={thStyle}></th>{puedeBorrar && <th style={thStyle}></th>}
          </tr></thead>
          <tbody>
            {prezarpes.map((p) => {
              const m = mareas.find((x) => x.id === p.marea_id);
              return (
                <tr key={p.id} style={{ cursor: "pointer" }} onClick={() => onAbrir(p)}>
                  <td style={{ ...tdStyle, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>{p.fecha}</td>
                  <td style={tdStyle}>{embName(p.embarcacion_id)}</td>
                  <td style={{ ...tdStyle, fontSize: 12.5 }}>{p.responsable || "—"}</td>
                  <td style={{ ...tdStyle, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>{m?.folio || "—"}</td>
                  <td style={tdStyle}>
                    <Pill tone={p.apto ? "green" : "red"}>{p.apto ? "Apto" : "No apto"}</Pill>
                    {m?.retorno_falla && <Pill tone="red" style={{ marginLeft: 6 }}>Retorno falla</Pill>}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right", color: C.steel, fontSize: 12, fontWeight: 600 }}>Ver informe ›</td>
                  {puedeBorrar && <td style={tdStyle}><button onClick={(e) => { e.stopPropagation(); onEliminar(p); }} title="Eliminar prezarpe" style={{ background: "none", border: "none", cursor: "pointer", color: C.slate }}><Trash2 size={15} /></button></td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ---------- Pantalla 5: informe de un prezarpe ----------
export function VistaInforme({ prezarpe: p, equipos, embName, online, puedeBorrar, onVolver, onEliminar }) {
  if (!p) return null;
  const eqNom = (id) => { const e = equipos.find((x) => x.id === id); return e?.sistema || e?.id_visible || id; };
  const visual = Object.entries(p.visual || {});
  const niveles = Object.entries(p.niveles || {});
  const horometros = Object.entries(p.horometros || {});

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }} className="no-print">
        <button onClick={onVolver} style={{ ...ghostBtn, padding: "7px 12px" }}><ArrowLeft size={15} /> Historial</button>
        <button onClick={() => window.print()} style={primaryBtn}>Imprimir / PDF</button>
        {puedeBorrar && <button onClick={() => onEliminar(p)} style={{ ...ghostBtn, padding: "7px 12px", color: C.red, borderColor: C.red }}><Trash2 size={15} /> Eliminar</button>}
      </div>

      <div id="informe-prezarpe">
        <Card style={{ borderTop: `5px solid ${p.apto ? C.green : C.red}`, marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
            <div>
              <div style={{ fontSize: 10.5, letterSpacing: 2, textTransform: "uppercase", color: C.slate, fontWeight: 700 }}>Informe de Prezarpe</div>
              <div style={{ ...archivo, fontSize: 22, fontWeight: 800, color: C.abyss, marginTop: 4 }}>{embName(p.embarcacion_id)}</div>
            </div>
            <div style={{ textAlign: "right", fontSize: 11.5, color: C.slate, lineHeight: 1.7 }}>
              <div><strong>Fecha:</strong> {p.fecha}</div>
              <div><strong>Responsable:</strong> {p.responsable || "—"}</div>
              <div style={{ marginTop: 4 }}><Pill tone={p.apto ? "green" : "red"}>{p.apto ? "APTO PARA ZARPAR" : "NO APTO"}</Pill></div>
            </div>
          </div>
        </Card>

        <Bloque titulo="A · Inspección visual" icon={Ship}>
          {visual.length === 0 ? <span style={{ fontSize: 12.5, color: C.slate }}>Sin registros.</span> : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px,1fr))", gap: 8 }}>
              {visual.map(([item, v]) => (
                <div key={item} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", border: `1px solid ${C.line}`, borderRadius: 8 }}>
                  <span style={{ fontSize: 12.5, color: C.ink }}>{item}</span>
                  <Pill tone={v === "ok" ? "green" : "red"}>{v === "ok" ? "OK" : "Falla"}</Pill>
                </div>
              ))}
            </div>
          )}
        </Bloque>

        {niveles.length > 0 && (
          <Bloque titulo="B · Niveles de operación" icon={Droplet}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px,1fr))", gap: 8 }}>
              {niveles.map(([id, n]) => (
                <div key={id} style={{ padding: "8px 12px", border: `1px solid ${C.line}`, borderRadius: 8 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: C.abyss, marginBottom: 4 }}>{eqNom(id)}</div>
                  <div style={{ display: "flex", gap: 12 }}>
                    <span style={{ fontSize: 12 }}>Aceite: <Pill tone={n?.aceite === "bajo" ? "yellow" : "green"}>{n?.aceite === "bajo" ? "Bajo" : "Normal"}</Pill></span>
                    {n?.agua !== undefined && n?.agua !== null && <span style={{ fontSize: 12 }}>Agua: <Pill tone={n?.agua === "bajo" ? "yellow" : "green"}>{n?.agua === "bajo" ? "Bajo" : "Normal"}</Pill></span>}
                  </div>
                </div>
              ))}
            </div>
          </Bloque>
        )}

        <Bloque titulo="C · Abastecimiento a bordo" icon={Fuel}>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", fontSize: 13 }}>
            <div><span style={{ color: C.slate }}>Combustible:</span> <strong>{p.combustible_l || 0} L</strong></div>
            <div><span style={{ color: C.slate }}>Agua dulce:</span> <strong>{p.agua_l || 0} L</strong></div>
            <div><span style={{ color: C.slate }}>Aceite:</span> <strong>{p.aceite_l || 0} L</strong></div>
          </div>
        </Bloque>

        {horometros.length > 0 && (
          <Bloque titulo="D · Horómetros" icon={Gauge}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px,1fr))", gap: 8 }}>
              {horometros.map(([id, v]) => (
                <div key={id} style={{ padding: "8px 12px", border: `1px solid ${C.line}`, borderRadius: 8 }}>
                  <div style={{ fontSize: 12, color: C.slate }}>{eqNom(id)}</div>
                  <div style={{ ...archivo, fontSize: 16, fontWeight: 800, color: C.steel }}>{v} h</div>
                </div>
              ))}
            </div>
          </Bloque>
        )}

        <Bloque titulo="Evidencia" icon={Camera}>
          <FotoGaleria entidad="prezarpe" entidadId={p.id} puedeAgregar={false} puedeBorrar={false} online={online} />
        </Bloque>
      </div>

      <style>{`
        @media print {
          @page { size: A4; margin: 12mm; }
          body { background: #fff !important; }
          .no-print { display: none !important; }
          aside, nav { display: none !important; }
          main { padding: 0 !important; }
        }
      `}</style>
    </div>
  );
}

// ---------- Modal de eliminación con motivo ----------
const MOTIVOS_ELIM = [
  "Creado por error",
  "Datos incorrectos",
  "Zarpe duplicado",
  "Registro de prueba",
  "Se canceló la salida",
  "Otro",
];

export function ModalEliminar({ target, onCancel, onConfirm }) {
  const [motivo, setMotivo] = useState("");
  const [otro, setOtro] = useState("");
  const final = motivo === "Otro" ? otro.trim() : motivo;

  return (
    <div onClick={onCancel}
      style={{ position: "fixed", inset: 0, background: "rgba(6,24,46,.55)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: C.surface, borderRadius: 16, width: "100%", maxWidth: 440, boxShadow: "0 20px 60px rgba(0,0,0,.3)", overflow: "hidden" }}>
        <div style={{ padding: "22px 24px 0" }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: C.redBg, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
            <Trash2 size={24} color={C.red} />
          </div>
          <div style={{ ...archivo, fontSize: 20, fontWeight: 800, color: C.abyss }}>Eliminar zarpe</div>
          <div style={{ fontSize: 13, color: C.slate, marginTop: 6, lineHeight: 1.5 }}>
            <strong style={{ color: C.ink }}>{target.nombre}</strong>{target.fecha ? ` · ${target.fecha}` : ""}. Se borrará el prezarpe, su marea y fotos. Esta acción no se puede deshacer.
          </div>
        </div>

        <div style={{ padding: "16px 24px 0" }}>
          <label style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: C.slate, fontWeight: 700 }}>Motivo de la eliminación</label>
          <select value={motivo} onChange={(e) => setMotivo(e.target.value)}
            style={{ width: "100%", marginTop: 7, padding: "11px 12px", borderRadius: 10, border: `1px solid ${C.line}`, fontSize: 14, fontFamily: "inherit", color: motivo ? C.ink : C.slate, background: C.surface, cursor: "pointer" }}>
            <option value="">— Selecciona un motivo —</option>
            {MOTIVOS_ELIM.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          {motivo === "Otro" && (
            <input value={otro} onChange={(e) => setOtro(e.target.value)} placeholder="Describe el motivo"
              style={{ width: "100%", marginTop: 10, padding: "11px 12px", borderRadius: 10, border: `1px solid ${C.line}`, fontSize: 14, fontFamily: "inherit" }} autoFocus />
          )}
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", padding: "20px 24px 22px" }}>
          <button onClick={onCancel} style={{ ...ghostBtn, padding: "10px 18px" }}>Cancelar</button>
          <button onClick={() => onConfirm(final)} disabled={!final}
            style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "10px 18px", borderRadius: 9, border: "none", background: final ? C.red : tint(C.red, 45), color: "#fff", fontSize: 13.5, fontWeight: 700, cursor: final ? "pointer" : "default", fontFamily: "inherit" }}>
            <Trash2 size={15} /> Eliminar
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Auxiliares visuales ----------
