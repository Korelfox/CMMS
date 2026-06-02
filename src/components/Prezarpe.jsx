import React, { useState, useEffect, useCallback } from "react";
import {
  Ship, Anchor, Fuel, Droplet, Gauge, Check, X, AlertTriangle,
  ArrowLeft, Camera, ClipboardCheck, Waves, CloudOff, Clock, Trash2,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { fetchAll, insertRow, updateRow, deleteRow, logActivity } from "../lib/db";
import { useOnline, cacheTable, getCached, queueInsert, nuevoId } from "../lib/offline";
import { subirFotos, listarFotos, borrarFoto } from "../lib/fotos";
import { C, archivo, canOperate, isAdmin } from "../theme";
import { Card, PageHead, Pill, primaryBtn, ghostBtn, thStyle, tdStyle, InlineSpinner, ErrorBanner, Empty } from "../ui";
import { FotoInput, FotoGaleria } from "./Fotos";

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
  const [prezarpes, setPrezarpes] = useState([]);
  const [vista, setVista] = useState("flota");
  const [nave, setNave] = useState(null);
  const [mareaRec, setMareaRec] = useState(null);   // marea a cerrar en recalada
  const [prezarpeSel, setPrezarpeSel] = useState(null);  // informe abierto
  const [confirmar, setConfirmar] = useState(null);      // modal de eliminación con motivo
  const puedeOperar = canOperate(profile?.rol);
  const puedeBorrar = isAdmin(profile?.rol);   // eliminar prezarpe/marea: solo administración

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [embs, eqs, ms, pzs] = await Promise.all([
        fetchAll("embarcaciones", { order: { col: "codigo", asc: true } }),
        fetchAll("equipos", { order: { col: "id_visible", asc: true } }),
        fetchAll("mareas", { order: { col: "zarpe_at", asc: false } }),
        fetchAll("prezarpes", { order: { col: "created_at", asc: false } }),
      ]);
      setEmbarcaciones(embs); setEquipos(eqs); setMareas(ms); setPrezarpes(pzs); setUsandoCache(false);
      cacheTable("embarcaciones", embs); cacheTable("equipos", eqs); cacheTable("mareas", ms); cacheTable("prezarpes", pzs);
    } catch (e) {
      const [embs, eqs, ms, pzs] = await Promise.all([getCached("embarcaciones"), getCached("equipos"), getCached("mareas"), getCached("prezarpes")]);
      setEmbarcaciones(embs); setEquipos(eqs); setMareas(ms); setPrezarpes(pzs); setUsandoCache(true);
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
  const eqNom = (id) => { const e = equipos.find((x) => x.id === id); return e?.sistema || e?.id_visible || "Equipo"; };
  const mareaAbierta = (embId) => mareas.find((m) => m.embarcacion_id === embId && m.estado === "navegando");

  // Arma la descripción de no conformidades a partir del checklist.
  function observacionesDe(payload) {
    const obs = [];
    Object.entries(payload.visual || {}).forEach(([k, v]) => { if (v === "falla") obs.push(`${k}: falla`); });
    Object.entries(payload.niveles || {}).forEach(([id, n]) => {
      if (n?.aceite === "bajo") obs.push(`${eqNom(id)}: aceite bajo`);
      if (n?.agua === "bajo") obs.push(`${eqNom(id)}: agua chaqueta baja`);
    });
    return obs;
  }

  function abrirRecalada(m) {
    if (!online) { setError("Registrar la recalada requiere conexión."); return; }
    setMareaRec(m); setVista("recalada");
  }

  async function guardarRecalada(m, datos) {
    try {
      await updateRow("mareas", m.id, {
        estado: "cerrada", recalada_at: new Date().toISOString(),
        comb_fin: datos.comb_fin, agua_fin: datos.agua_fin, aceite_fin: datos.aceite_fin,
        horometros_fin: datos.horometros_fin,
      });
      logActivity(profile, "Recalada", embName(m.embarcacion_id));
      setVista("flota"); setMareaRec(null); setError(null);
      await cargar();
    } catch (e) { setError("No se pudo registrar la recalada: " + e.message); }
  }

  // Guarda el prezarpe: abre la marea + registra el checklist. El trigger de
  // la base aplica los horómetros a los equipos (también al sincronizar offline).
  async function guardarPrezarpe(payload, fotos = []) {
    const mareaId = nuevoId();
    const prezId = nuevoId();
    const folio = `M-${String(mareas.length + 1).padStart(3, "0")}`;
    const marea = { id: mareaId, empresa_id: profile.empresa_id, embarcacion_id: nave.id, folio, estado: "navegando", zarpe_at: new Date().toISOString(), responsable: profile.nombre || "", created_by: profile.id,
      comb_ini: payload.combustible_l, agua_ini: payload.agua_l, aceite_ini: payload.aceite_l, horometros_ini: payload.horometros };
    const prez = { id: prezId, empresa_id: profile.empresa_id, embarcacion_id: nave.id, marea_id: mareaId, fecha: HOY(), responsable: profile.nombre || "", ...payload, created_by: profile.id };

    // Si el prezarpe NO es apto, se genera una solicitud para el Jefe de Mantención.
    let sol = null;
    if (!payload.apto) {
      const obs = observacionesDe(payload);
      sol = {
        id: nuevoId(), empresa_id: profile.empresa_id,
        folio: `SOL-PZ-${Date.now().toString().slice(-6)}`,
        solicitante: profile.nombre || "", embarcacion_id: nave.id, sistema: "Prezarpe",
        descripcion: `Prezarpe NO APTO de ${nave.nombre}. ${obs.length ? "Observaciones: " + obs.join("; ") + "." : ""}`.trim(),
        prioridad: "alta", fecha: HOY(), estado: "pendiente", created_by: profile.id,
      };
    }

    try {
      if (online) {
        const { empresa_id: _a, ...mRest } = marea; await insertRow("mareas", profile.empresa_id, mRest);
        const { empresa_id: _b, ...pRest } = prez; await insertRow("prezarpes", profile.empresa_id, pRest);
        if (sol) { const { empresa_id: _c, ...sRest } = sol; await insertRow("solicitudes", profile.empresa_id, sRest); }
        if (fotos.length) await subirFotos(fotos, { empresaId: profile.empresa_id, entidad: "prezarpe", entidadId: prezId, profileId: profile.id });
        logActivity(profile, "Prezarpe", `${nave.nombre} · ${payload.apto ? "APTO" : "NO APTO" + (sol ? " · solicitud generada" : "")}`);
        await cargar();
      } else {
        await queueInsert("mareas", marea, `Zarpe ${nave.nombre}`);
        await queueInsert("prezarpes", prez, `Prezarpe ${nave.nombre}`);
        if (sol) await queueInsert("solicitudes", sol, `Solicitud prezarpe ${nave.nombre}`);
        setMareas((p) => [{ ...marea, _pending: true }, ...p]);
      }
      setVista("flota"); setNave(null); setError(null);
    } catch (e) { setError("No se pudo guardar el prezarpe: " + e.message); }
  }

  // Abre el modal de eliminación (pide motivo). Solo administración.
  function pedirEliminarPrezarpe(p) {
    setConfirmar({ prezId: p.id, mareaId: p.marea_id, nombre: embName(p.embarcacion_id), fecha: p.fecha });
  }
  function pedirEliminarZarpe(m) {
    const prez = prezarpes.find((p) => p.marea_id === m.id);
    setConfirmar({ prezId: prez?.id || null, mareaId: m.id, nombre: embName(m.embarcacion_id), fecha: prez?.fecha });
  }

  // Ejecuta la eliminación con el motivo elegido: borra fotos + prezarpe +
  // marea, y registra el motivo en la bitácora. Las horas ya aplicadas al
  // equipo no se revierten (corregir en Equipos si fue error de horómetro).
  async function ejecutarEliminacion(motivo) {
    const t = confirmar; setConfirmar(null);
    if (!t) return;
    if (!online) { setError("Eliminar requiere conexión."); return; }
    try {
      if (t.prezId) {
        try { const fs = await listarFotos("prezarpe", t.prezId); for (const f of fs) await borrarFoto(f); } catch { /* sin fotos */ }
        await deleteRow("prezarpes", t.prezId);
      }
      if (t.mareaId) await deleteRow("mareas", t.mareaId);
      logActivity(profile, "Eliminar zarpe", `${t.nombre}${t.fecha ? " · " + t.fecha : ""} · Motivo: ${motivo}`);
      setVista("flota"); setPrezarpeSel(null); setError(null);
      await cargar();
    } catch (e) { setError("No se pudo eliminar: " + e.message); }
  }

  if (loading) return <div><PageHead kicker="Flota · Operación" title="Prezarpe & Mareas" /><Card><InlineSpinner label="Cargando flota…" /></Card></div>;

  return (
    <div>
      <PageHead kicker="Flota · Operación" title="Prezarpe & Mareas"
        sub="Antes de cada zarpe, inspecciona la embarcación y registra niveles, abastecimiento y horómetros. La lectura de horómetros actualiza el Plan Preventivo."
        action={(vista === "flota" || vista === "historial") && (
          <div style={{ display: "flex", gap: 8 }} className="no-print">
            <button onClick={() => setVista("flota")} style={vista === "flota" ? primaryBtn : ghostBtn}>Operación</button>
            <button onClick={() => setVista("historial")} style={vista === "historial" ? primaryBtn : ghostBtn}>Historial</button>
          </div>
        )} />

      <ErrorBanner onRetry={cargar}>{error}</ErrorBanner>

      {(!online || usandoCache) && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: C.yellowBg, border: `1px solid ${C.amber}`, color: "#7a5b00", padding: "10px 14px", borderRadius: 10, marginBottom: 14, fontSize: 13 }}>
          <CloudOff size={17} />
          <span>{online ? "Mostrando la última copia guardada en este dispositivo." : "Sin conexión: puedes registrar el prezarpe igual; se sube solo al recuperar señal. La recalada requiere conexión."}</span>
        </div>
      )}

      {vista === "flota" && (
        <VistaFlota embarcaciones={embarcaciones} mareaAbierta={mareaAbierta} puedeOperar={puedeOperar} puedeBorrar={puedeBorrar}
          onIniciar={(n) => { setNave(n); setVista("checklist"); }} onRecalada={abrirRecalada} onEliminarZarpe={pedirEliminarZarpe} />
      )}
      {vista === "checklist" && (
        <VistaChecklist nave={nave} equipos={equipos.filter((e) => e.embarcacion_id === nave.id)} online={online}
          onVolver={() => { setVista("flota"); setNave(null); }} onGuardar={guardarPrezarpe} />
      )}
      {vista === "recalada" && (
        <VistaRecalada marea={mareaRec} nave={embarcaciones.find((e) => e.id === mareaRec?.embarcacion_id)}
          equipos={equipos.filter((e) => e.embarcacion_id === mareaRec?.embarcacion_id && (e.nivel_tipo || "ninguno") !== "ninguno")}
          onVolver={() => { setVista("flota"); setMareaRec(null); }} onGuardar={(datos) => guardarRecalada(mareaRec, datos)} />
      )}
      {vista === "historial" && (
        <VistaHistorial prezarpes={prezarpes} embName={embName} mareas={mareas} puedeBorrar={puedeBorrar}
          onAbrir={(p) => { setPrezarpeSel(p); setVista("informe"); }} onEliminar={pedirEliminarPrezarpe} />
      )}
      {vista === "informe" && (
        <VistaInforme prezarpe={prezarpeSel} equipos={equipos} embName={embName} online={online} puedeBorrar={puedeBorrar}
          onVolver={() => { setVista("historial"); setPrezarpeSel(null); }} onEliminar={pedirEliminarPrezarpe} />
      )}

      {confirmar && <ModalEliminar target={confirmar} onCancel={() => setConfirmar(null)} onConfirm={ejecutarEliminacion} />}
    </div>
  );
}

// ---------- Pantalla 1: flota ----------
function VistaFlota({ embarcaciones, mareaAbierta, puedeOperar, puedeBorrar, onIniciar, onRecalada, onEliminarZarpe }) {
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
                  {puedeBorrar && <button onClick={() => onEliminarZarpe(marea)} style={{ ...ghostBtn, width: "100%", justifyContent: "center", padding: "9px", marginTop: 8, color: C.red, borderColor: C.red, fontSize: 12.5 }}><Trash2 size={14} /> Eliminar zarpe (creado por error)</button>}
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
function VistaChecklist({ nave, equipos, online, onVolver, onGuardar }) {
  const visualEquipos = equipos.filter((e) => e.prezarpe).map((e) => ({ item: e.sistema || e.id_visible, origen: "equipo" }));
  const visualItems = [...visualEquipos, ...SEGURIDAD_FIJA.map((s) => ({ item: s, origen: "fijo" }))];
  const nivelEquipos = equipos.filter((e) => (e.nivel_tipo || "ninguno") !== "ninguno");

  const [visual, setVisual] = useState({});
  const [niveles, setNiveles] = useState({});
  const [litros, setLitros] = useState({ combustible: 0, agua: 0, aceite: 0 });
  const [horom, setHorom] = useState({});
  const [fotos, setFotos] = useState([]);
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
    }, fotos);
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
function VistaRecalada({ marea, nave, equipos, onVolver, onGuardar }) {
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

      <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#EAF4FF", border: `1px solid ${C.cyan}`, color: C.steel, padding: "10px 14px", borderRadius: 10, marginBottom: 14, fontSize: 12.5 }}>
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
                <div key={eq.id} style={{ padding: "12px 14px", border: `1px solid ${invalida ? C.red : C.line}`, borderRadius: 10, background: "#fff" }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: C.abyss }}>{eq.sistema || eq.id_visible}</div>
                  <div style={{ fontSize: 11, color: C.slate, marginBottom: 6, fontFamily: "'IBM Plex Mono', monospace" }}>Al zarpar: {ant} h</div>
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

      <button onClick={guardar} disabled={guardando || horomInvalido}
        style={{ ...primaryBtn, width: "100%", justifyContent: "center", padding: "14px", fontSize: 15, opacity: horomInvalido ? 0.5 : 1, cursor: guardando || horomInvalido ? "default" : "pointer" }}>
        <Anchor size={18} /> {guardando ? "Guardando…" : "Registrar recalada y cerrar marea"}
      </button>
    </div>
  );
}

// Stepper que muestra el valor inicial como referencia
function StepperRef({ label, unidad, icon, ini, value, onChange, step }) {
  return (
    <div>
      <Stepper label={label} unidad={unidad} icon={icon} value={value} onChange={onChange} step={step} />
      {ini !== undefined && ini !== null && <div style={{ fontSize: 10.5, color: C.slate, marginTop: 4, paddingLeft: 4 }}>Al zarpar: {ini} {unidad}</div>}
    </div>
  );
}

// ---------- Pantalla 4: historial de prezarpes ----------
function VistaHistorial({ prezarpes, embName, mareas, puedeBorrar, onAbrir, onEliminar }) {
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
                  <td style={tdStyle}><Pill tone={p.apto ? "green" : "red"}>{p.apto ? "Apto" : "No apto"}</Pill></td>
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
function VistaInforme({ prezarpe: p, equipos, embName, online, puedeBorrar, onVolver, onEliminar }) {
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

function ModalEliminar({ target, onCancel, onConfirm }) {
  const [motivo, setMotivo] = useState("");
  const [otro, setOtro] = useState("");
  const final = motivo === "Otro" ? otro.trim() : motivo;

  return (
    <div onClick={onCancel}
      style={{ position: "fixed", inset: 0, background: "rgba(6,24,46,.55)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 440, boxShadow: "0 20px 60px rgba(0,0,0,.3)", overflow: "hidden" }}>
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
            style={{ width: "100%", marginTop: 7, padding: "11px 12px", borderRadius: 10, border: `1px solid ${C.line}`, fontSize: 14, fontFamily: "inherit", color: motivo ? C.ink : C.slate, background: "#fff", cursor: "pointer" }}>
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
            style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "10px 18px", borderRadius: 9, border: "none", background: final ? C.red : "#E4B4B0", color: "#fff", fontSize: 13.5, fontWeight: 700, cursor: final ? "pointer" : "default", fontFamily: "inherit" }}>
            <Trash2 size={15} /> Eliminar
          </button>
        </div>
      </div>
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
