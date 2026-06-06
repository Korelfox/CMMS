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
import { buildEquipoTree } from "../lib/equipTree";
import { Card, PageHead, Pill, primaryBtn, ghostBtn, thStyle, tdStyle, InlineSpinner, ErrorBanner, Empty, Field, inputStyle } from "../ui";
import { FotoInput, FotoGaleria } from "./Fotos";

const HOY = () => new Date().toISOString().slice(0, 10);
// Ãtems de seguridad estÃ¡ndar (lista fija para toda la flota)
const SEGURIDAD_FIJA = ["Sistema de gobierno", "Bombas de achique", "Luces de navegaciÃ³n", "Equipo de seguridad"];

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
  const [documentos, setDocumentos] = useState([]);
  const [vista, setVista] = useState("flota");
  const [nave, setNave] = useState(null);
  const [mareaRec,   setMareaRec]   = useState(null); // marea a cerrar en recalada
  const [mareaFalla, setMareaFalla] = useState(null); // marea retorno por falla
  const [prezarpeSel, setPrezarpeSel] = useState(null);  // informe abierto
  const [confirmar, setConfirmar] = useState(null);      // modal de eliminaciÃ³n con motivo
  const puedeOperar = canOperate(profile?.rol);
  const puedeBorrar = isAdmin(profile?.rol);   // eliminar prezarpe/marea: solo administraciÃ³n

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [embs, eqs, ms, pzs, docs] = await Promise.all([
        fetchAll("embarcaciones", { order: { col: "codigo", asc: true } }),
        fetchAll("equipos", { order: { col: "id_visible", asc: true } }),
        fetchAll("mareas", { order: { col: "zarpe_at", asc: false } }),
        fetchAll("prezarpes", { order: { col: "created_at", asc: false } }),
        fetchAll("documentos"),
      ]);
      setEmbarcaciones(embs); setEquipos(eqs); setMareas(ms); setPrezarpes(pzs); setDocumentos(docs); setUsandoCache(false);
      cacheTable("embarcaciones", embs); cacheTable("equipos", eqs); cacheTable("mareas", ms); cacheTable("prezarpes", pzs); cacheTable("documentos", docs);
    } catch (e) {
      const [embs, eqs, ms, pzs, docs] = await Promise.all([getCached("embarcaciones"), getCached("equipos"), getCached("mareas"), getCached("prezarpes"), getCached("documentos")]);
      setEmbarcaciones(embs); setEquipos(eqs); setMareas(ms); setPrezarpes(pzs); setDocumentos(docs); setUsandoCache(true);
      if (!embs.length) setError("No se pudo cargar y no hay copia local. ConÃ©ctate al menos una vez.");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => {
    const f = () => cargar();
    window.addEventListener("cmms-synced", f);
    return () => window.removeEventListener("cmms-synced", f);
  }, [cargar]);

  const embName = (id) => embarcaciones.find((e) => e.id === id)?.nombre || "â€”";
  const eqNom = (id) => { const e = equipos.find((x) => x.id === id); return e?.sistema || e?.id_visible || "Equipo"; };
  const mareaAbierta = (embId) => mareas.find((m) => m.embarcacion_id === embId && m.estado === "navegando");
  // Documentos vencidos de una nave (aviso de cumplimiento al zarpar)
  const docsVencidos = (embId) => {
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    return documentos.filter((d) => d.embarcacion_id === embId && d.vencimiento && new Date(d.vencimiento + "T00:00:00") < hoy);
  };

  // Arma la descripciÃ³n de no conformidades a partir del checklist.
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
    if (!online) { setError("Registrar la recalada requiere conexiÃ³n."); return; }
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

  async function guardarRetornoFalla(marea, datos) {
    if (!online) { setError("Registrar retorno por falla requiere conexiÃ³n."); return; }
    try {
      // 1) Cerrar la marea como retorno por falla
      await updateRow("mareas", marea.id, {
        estado: "cerrada", recalada_at: new Date().toISOString(),
        retorno_falla: true, falla_descripcion: datos.descripcion,
        falla_equipo_id: datos.equipo_id || null,
        falla_severidad: datos.severidad, falla_riesgo_trip: datos.riesgoTrip,
      });
      // 2) OT urgente para el jefe de mantenciÃ³n
      const detalle = [
        `ðŸš¨ RETORNO POR FALLA Â· ${embName(marea.embarcacion_id)}`,
        `Sistema/Equipo: ${datos.sistemaLabel}`,
        `Severidad: ${datos.severidad.toUpperCase()}`,
        datos.riesgoTrip ? "âš ï¸ RIESGO PARA LA TRIPULACIÃ“N" : null,
        `DescripciÃ³n: ${datos.descripcion}`,
      ].filter(Boolean).join("\n");
      await insertRow("ordenes_trabajo", profile.empresa_id, {
        folio: `OT-RF-${Date.now().toString().slice(-6)}`,
        embarcacion_id: marea.embarcacion_id, equipo_id: datos.equipo_id || null,
        sistema: datos.sistemaLabel, tipo: "correctivo", prioridad: "critica",
        descripcion: detalle, fecha: HOY(), estado: "solicitada", created_by: profile.id,
      });
      // 3) Solicitud visible para el Jefe de MantenciÃ³n
      await insertRow("solicitudes", profile.empresa_id, {
        folio: `SOL-RF-${Date.now().toString().slice(-6)}`,
        solicitante: profile.nombre || "", embarcacion_id: marea.embarcacion_id,
        sistema: datos.sistemaLabel,
        descripcion: `RETORNO POR FALLA [${datos.severidad.toUpperCase()}] Â· ${embName(marea.embarcacion_id)} Â· ${datos.descripcion}`,
        prioridad: "alta", fecha: HOY(), estado: "pendiente", created_by: profile.id,
      });
      logActivity(profile, "Retorno por falla", `${embName(marea.embarcacion_id)} Â· ${datos.sistemaLabel} Â· ${datos.severidad}`);
      setVista("flota"); setMareaFalla(null); setError(null);
      await cargar();
    } catch (e) { setError("No se pudo registrar el retorno por falla: " + e.message); }
  }

  // Guarda el prezarpe: abre la marea + registra el checklist. El trigger de
  // la base aplica los horÃ³metros a los equipos (tambiÃ©n al sincronizar offline).
  async function guardarPrezarpe(payload, fotos = []) {
    const mareaId = nuevoId();
    const prezId = nuevoId();
    const folio = `M-${String(mareas.length + 1).padStart(3, "0")}`;
    const marea = { id: mareaId, empresa_id: profile.empresa_id, embarcacion_id: nave.id, folio, estado: "navegando", zarpe_at: new Date().toISOString(), responsable: profile.nombre || "", created_by: profile.id,
      comb_ini: payload.combustible_l, agua_ini: payload.agua_l, aceite_ini: payload.aceite_l, horometros_ini: payload.horometros };
    const prez = { id: prezId, empresa_id: profile.empresa_id, embarcacion_id: nave.id, marea_id: mareaId, fecha: HOY(), responsable: profile.nombre || "", ...payload, created_by: profile.id };

    // Si el prezarpe NO es apto, se genera una solicitud para el Jefe de MantenciÃ³n.
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
        logActivity(profile, "Prezarpe", `${nave.nombre} Â· ${payload.apto ? "APTO" : "NO APTO" + (sol ? " Â· solicitud generada" : "")}`);
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

  // Abre el modal de eliminaciÃ³n (pide motivo). Solo administraciÃ³n.
  function pedirEliminarPrezarpe(p) {
    setConfirmar({ prezId: p.id, mareaId: p.marea_id, nombre: embName(p.embarcacion_id), fecha: p.fecha });
  }
  function pedirEliminarZarpe(m) {
    const prez = prezarpes.find((p) => p.marea_id === m.id);
    setConfirmar({ prezId: prez?.id || null, mareaId: m.id, nombre: embName(m.embarcacion_id), fecha: prez?.fecha });
  }

  // Ejecuta la eliminaciÃ³n con el motivo elegido: borra fotos + prezarpe +
  // marea, y registra el motivo en la bitÃ¡cora. Las horas ya aplicadas al
  // equipo no se revierten (corregir en Equipos si fue error de horÃ³metro).
  async function ejecutarEliminacion(motivo) {
    const t = confirmar; setConfirmar(null);
    if (!t) return;
    if (!online) { setError("Eliminar requiere conexiÃ³n."); return; }
    try {
      if (t.prezId) {
        try { const fs = await listarFotos("prezarpe", t.prezId); for (const f of fs) await borrarFoto(f); } catch { /* sin fotos */ }
        await deleteRow("prezarpes", t.prezId);
      }
      if (t.mareaId) await deleteRow("mareas", t.mareaId);
      logActivity(profile, "Eliminar zarpe", `${t.nombre}${t.fecha ? " Â· " + t.fecha : ""} Â· Motivo: ${motivo}`);
      setVista("flota"); setPrezarpeSel(null); setError(null);
      await cargar();
    } catch (e) { setError("No se pudo eliminar: " + e.message); }
  }

  if (loading) return <div><PageHead kicker="Flota Â· OperaciÃ³n" title="Prezarpe & Mareas" /><Card><InlineSpinner label="Cargando flotaâ€¦" /></Card></div>;

  return (
    <div>
      <PageHead kicker="Flota Â· OperaciÃ³n" title="Prezarpe & Mareas"
        sub="Antes de cada zarpe, inspecciona la embarcaciÃ³n y registra niveles, abastecimiento y horÃ³metros. La lectura de horÃ³metros actualiza el Plan Preventivo."
        action={(vista === "flota" || vista === "historial") && (
          <div style={{ display: "flex", gap: 8 }} className="no-print">
            <button onClick={() => setVista("flota")} style={vista === "flota" ? primaryBtn : ghostBtn}>OperaciÃ³n</button>
            <button onClick={() => setVista("historial")} style={vista === "historial" ? primaryBtn : ghostBtn}>Historial</button>
          </div>
        )} />

      <ErrorBanner onRetry={cargar}>{error}</ErrorBanner>

      {(!online || usandoCache) && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: C.yellowBg, border: `1px solid ${C.amber}`, color: "#7a5b00", padding: "10px 14px", borderRadius: 10, marginBottom: 14, fontSize: 13 }}>
          <CloudOff size={17} />
          <span>{online ? "Mostrando la Ãºltima copia guardada en este dispositivo." : "Sin conexiÃ³n: puedes registrar el prezarpe igual; se sube solo al recuperar seÃ±al. La recalada requiere conexiÃ³n."}</span>
        </div>
      )}

      {vista === "flota" && (
        <VistaFlota embarcaciones={embarcaciones} mareaAbierta={mareaAbierta} docsVencidos={docsVencidos} puedeOperar={puedeOperar} puedeBorrar={puedeBorrar}
          onIniciar={(n) => { setNave(n); setVista("checklist"); }} onRecalada={abrirRecalada} onEliminarZarpe={pedirEliminarZarpe}
          onRetornoFalla={(m) => { setMareaFalla(m); setVista("retorno_falla"); }} />
      )}
      {vista === "checklist" && (
        <VistaChecklist nave={nave} equipos={buildEquipoTree(equipos.filter((e) => e.embarcacion_id === nave.id))} online={online}
          onVolver={() => { setVista("flota"); setNave(null); }} onGuardar={guardarPrezarpe} />
      )}
      {vista === "recalada" && (
        <VistaRecalada marea={mareaRec} nave={embarcaciones.find((e) => e.id === mareaRec?.embarcacion_id)}
          equipos={buildEquipoTree(equipos.filter((e) => e.embarcacion_id === mareaRec?.embarcacion_id && (e.nivel_tipo || "ninguno") !== "ninguno"))}
          onVolver={() => { setVista("flota"); setMareaRec(null); }} onGuardar={(datos) => guardarRecalada(mareaRec, datos)} />
      )}
      {vista === "retorno_falla" && mareaFalla && (
        <VistaRetornoFalla
          marea={mareaFalla} nave={embarcaciones.find((e) => e.id === mareaFalla?.embarcacion_id)}
          equipos={buildEquipoTree(equipos.filter((e) => e.embarcacion_id === mareaFalla?.embarcacion_id))}
          onVolver={() => { setVista("flota"); setMareaFalla(null); }}
          onGuardar={(datos) => guardarRetornoFalla(mareaFalla, datos)} />
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
function VistaFlota({ embarcaciones, mareaAbierta, docsVencidos, puedeOperar, puedeBorrar, onIniciar, onRecalada, onEliminarZarpe, onRetornoFalla }) {
  if (embarcaciones.length === 0) {
    return <Card><Empty><Ship size={30} color={C.amber} style={{ marginBottom: 10 }} /><br />Registra al menos una embarcaciÃ³n para usar el prezarpe.</Empty></Card>;
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
      {embarcaciones.map((n) => {
        const marea = mareaAbierta(n.id);
        const navegando = !!marea;
        const vencidos = docsVencidos ? docsVencidos(n.id) : [];
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
            {vencidos.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 18px", background: C.redBg, color: C.red, fontSize: 12, fontWeight: 600, borderBottom: `1px solid ${C.line}` }}>
                <AlertTriangle size={15} /> {vencidos.length} documento{vencidos.length !== 1 ? "s" : ""} vencido{vencidos.length !== 1 ? "s" : ""} â€” revisar Cumplimiento antes de zarpar
              </div>
            )}
            <div style={{ padding: "14px 18px" }}>
              {navegando ? (
                <div>
                  <div style={{ fontSize: 12.5, color: C.slate, marginBottom: 10 }}>
                    ZarpÃ³ {new Date(marea.zarpe_at).toLocaleString("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
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
      : window.confirm(`Marcar ${nave.nombre} como NO APTA? Se registrarÃ¡ el prezarpe con las observaciones.`);
    if (!ok) return;
    setGuardando(true);
    // Solo horÃ³metros con lectura ingresada
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
        <div style={{ ...archivo, fontSize: 18, fontWeight: 800, color: C.abyss }}>Prezarpe Â· {nave?.nombre}</div>
      </div>

      <Bloque titulo="A Â· InspecciÃ³n visual" icon={Ship} extra={<span style={{ fontSize: 11.5, color: C.slate }}>{hechosVisual}/{visualItems.length}</span>}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px,1fr))", gap: 10 }}>
          {visualItems.map(({ item, origen }) => (
            <div key={item} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 12px", border: `1px solid ${C.line}`, borderRadius: 10, background: C.surface }}>
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
        <Bloque titulo="B Â· Niveles de operaciÃ³n" icon={Droplet}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {nivelEquipos.map((eq) => (
              <div key={eq.id} style={{ padding: "12px 14px", border: `1px solid ${C.line}`, borderRadius: 10, background: C.surface, marginLeft: (eq.depth || 0) * 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.abyss, marginBottom: 8 }}>
                  {(eq.depth || 0) > 0 && <span style={{ color: C.slate, fontSize: 12, marginRight: 5 }}>â””â”€</span>}
                  {eq.sistema || eq.id_visible} <span style={{ fontSize: 10.5, fontWeight: 600, color: C.slate }}>Â· {eq.nivel_tipo === "aceite_agua" ? "aceite + agua chaqueta" : "solo aceite"}</span>
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

      <Bloque titulo="C Â· Abastecimiento a bordo" icon={Fuel}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px,1fr))", gap: 12 }}>
          <Stepper label="Combustible" unidad="L" icon={Fuel} value={litros.combustible} onChange={(v) => setLitros((p) => ({ ...p, combustible: v }))} step={50} />
          <Stepper label="Agua dulce" unidad="L" icon={Waves} value={litros.agua} onChange={(v) => setLitros((p) => ({ ...p, agua: v }))} step={20} />
          <Stepper label="Aceite" unidad="L" icon={Droplet} value={litros.aceite} onChange={(v) => setLitros((p) => ({ ...p, aceite: v }))} step={5} />
        </div>
      </Bloque>

      {nivelEquipos.length > 0 && (
        <Bloque titulo="D Â· Lectura de horÃ³metros" icon={Gauge}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px,1fr))", gap: 12 }}>
            {nivelEquipos.map((eq) => {
              const val = horom[eq.id];
              const ant = eq.horas_actual || 0;
              const invalida = val !== undefined && val !== "" && Number(val) < ant;
              return (
                <div key={eq.id} style={{ padding: "12px 14px", border: `1px solid ${invalida ? C.red : C.line}`, borderRadius: 10, background: C.surface }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: C.abyss }}>{eq.sistema || eq.id_visible}</div>
                  <div style={{ fontSize: 11, color: C.slate, marginBottom: 6, fontFamily: "'IBM Plex Mono', monospace" }}>Anterior: {ant} h</div>
                  <input type="number" placeholder={`â‰¥ ${ant}`} value={val ?? ""}
                    onChange={(e) => setHorom((p) => ({ ...p, [eq.id]: e.target.value }))}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${invalida ? C.red : "#CFE3F2"}`, fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, fontWeight: 600, color: C.steel, background: "#F2F8FD" }} />
                  {invalida && <div style={{ fontSize: 10.5, color: C.red, fontWeight: 600, marginTop: 4 }}>Debe ser â‰¥ {ant} h</div>}
                </div>
              );
            })}
          </div>
        </Bloque>
      )}

      <Bloque titulo="Evidencia (opcional)" icon={Camera}>
        <FotoInput files={fotos} onChange={setFotos} max={5} disabled={!online} />
        {!online && <div style={{ fontSize: 11, color: "#7a5b00", marginTop: 6 }}>Sin conexiÃ³n: el prezarpe se guarda igual; las fotos se podrÃ¡n agregar con seÃ±al.</div>}
      </Bloque>

      <Card style={{ marginTop: 16, borderTop: `4px solid ${sugerencia === "apto" ? C.green : C.amber}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          {sugerencia === "apto" ? <Check size={20} color={C.green} /> : <AlertTriangle size={20} color={C.amber} />}
          <span style={{ fontSize: 13.5, color: C.slate }}>
            {sugerencia === "apto" ? "Sin observaciones detectadas. Puedes declarar la embarcaciÃ³n apta." : "Hay Ã­tems en falla o niveles bajos. Revisa antes de declarar el veredicto."}
          </span>
        </div>
        {horomInvalido && <div style={{ fontSize: 12.5, color: C.red, fontWeight: 600, marginBottom: 10 }}>Corrige las lecturas de horÃ³metro (deben ser â‰¥ a la anterior) para poder guardar.</div>}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={() => guardar(true)} disabled={guardando || horomInvalido}
            style={{ flex: 1, minWidth: 160, justifyContent: "center", display: "inline-flex", alignItems: "center", gap: 8, padding: "14px", borderRadius: 10, border: "none", cursor: guardando || horomInvalido ? "default" : "pointer", fontSize: 15, fontWeight: 800, fontFamily: "inherit", background: C.green, color: "#fff", opacity: horomInvalido ? 0.5 : 1 }}>
            <Check size={18} /> {guardando ? "Guardandoâ€¦" : "APTO PARA ZARPAR"}
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
    if (!window.confirm(`Â¿Registrar recalada de ${nave?.nombre} y cerrar la marea?`)) return;
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
        <div style={{ ...archivo, fontSize: 18, fontWeight: 800, color: C.abyss }}>Recalada Â· {nave?.nombre}</div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#EAF4FF", border: `1px solid ${C.cyan}`, color: C.steel, padding: "10px 14px", borderRadius: 10, marginBottom: 14, fontSize: 12.5 }}>
        <Anchor size={16} /> <span>Ingresa lo que <strong>quedÃ³</strong> a bordo y la lectura final de horÃ³metros. El sistema calcularÃ¡ el consumo de la marea.</span>
      </div>

      <Bloque titulo="Stock final a bordo" icon={Fuel}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px,1fr))", gap: 12 }}>
          <StepperRef label="Combustible" unidad="L" icon={Fuel} ini={marea?.comb_ini} value={litros.combustible} onChange={(v) => setLitros((p) => ({ ...p, combustible: v }))} step={50} />
          <StepperRef label="Agua dulce" unidad="L" icon={Waves} ini={marea?.agua_ini} value={litros.agua} onChange={(v) => setLitros((p) => ({ ...p, agua: v }))} step={20} />
          <StepperRef label="Aceite" unidad="L" icon={Droplet} ini={marea?.aceite_ini} value={litros.aceite} onChange={(v) => setLitros((p) => ({ ...p, aceite: v }))} step={5} />
        </div>
      </Bloque>

      {equipos.length > 0 && (
        <Bloque titulo="HorÃ³metros finales" icon={Gauge}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px,1fr))", gap: 12 }}>
            {equipos.map((eq) => {
              const ant = Number(iniH[eq.id] ?? eq.horas_actual ?? 0);
              const val = horom[eq.id];
              const invalida = val !== undefined && val !== "" && Number(val) < ant;
              return (
                <div key={eq.id} style={{ padding: "12px 14px", border: `1px solid ${invalida ? C.red : C.line}`, borderRadius: 10, background: C.surface }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: C.abyss }}>{eq.sistema || eq.id_visible}</div>
                  <div style={{ fontSize: 11, color: C.slate, marginBottom: 6, fontFamily: "'IBM Plex Mono', monospace" }}>Al zarpar: {ant} h</div>
                  <input type="number" placeholder={`â‰¥ ${ant}`} value={val ?? ""}
                    onChange={(e) => setHorom((p) => ({ ...p, [eq.id]: e.target.value }))}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${invalida ? C.red : "#CFE3F2"}`, fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, fontWeight: 600, color: C.steel, background: "#F2F8FD" }} />
                  {invalida && <div style={{ fontSize: 10.5, color: C.red, fontWeight: 600, marginTop: 4 }}>Debe ser â‰¥ {ant} h</div>}
                </div>
              );
            })}
          </div>
        </Bloque>
      )}

      <button onClick={guardar} disabled={guardando || horomInvalido}
        style={{ ...primaryBtn, width: "100%", justifyContent: "center", padding: "14px", fontSize: 15, opacity: horomInvalido ? 0.5 : 1, cursor: guardando || horomInvalido ? "default" : "pointer" }}>
        <Anchor size={18} /> {guardando ? "Guardandoâ€¦" : "Registrar recalada y cerrar marea"}
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

// ---------- Pantalla: retorno por falla ----------
function VistaRetornoFalla({ marea, nave, equipos, onVolver, onGuardar }) {
  const [form, setForm] = useState({
    equipo_id: "", descripcion: "", severidad: "alta", riesgoTrip: false,
  });
  const [enviando, setEnviando] = useState(false);

  if (!marea) return null;
  if (!nave) return (
    <div>
      <button onClick={onVolver} style={{ ...ghostBtn, padding: "7px 12px", marginBottom: 14 }}><ArrowLeft size={15} /> Volver</button>
      <Card><Empty><AlertTriangle size={28} color={C.amber} /><br />No se encontrÃ³ la embarcaciÃ³n de esta marea.</Empty></Card>
    </div>
  );

  function sistemaLabel() {
    if (!form.equipo_id) return "Sin especificar";
    const eq = equipos.find((e) => e.id === form.equipo_id);
    if (!eq) return "â€”";
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
      <Card style={{ borderTop: `5px solid ${C.red}`, marginBottom: 16, background: "#FEF2F2" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 54, height: 54, borderRadius: 14, background: C.red, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <AlertTriangle size={28} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: 10.5, letterSpacing: 2, textTransform: "uppercase", color: C.red, fontWeight: 700 }}>Retorno por falla</div>
            <div style={{ ...archivo, fontSize: 22, fontWeight: 800, color: C.abyss, marginTop: 2 }}>{nave.nombre}</div>
            <div style={{ fontSize: 12.5, color: C.slate, marginTop: 2 }}>
              Marea {marea.folio || "â€”"} Â· ZarpÃ³ {new Date(marea.zarpe_at).toLocaleString("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
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
            <select value={form.equipo_id} onChange={(e) => setForm((p) => ({ ...p, equipo_id: e.target.value }))}
              style={{ ...inputStyle(), borderColor: C.red }}>
              <option value="">â€” Seleccionar sistema â€”</option>
              {equipos.map((eq) => (
                <option key={eq.id} value={eq.id}>
                  {"ã€€".repeat(eq.depth || 0)}{(eq.depth || 0) > 0 ? "â””â”€ " : ""}{eq.id_visible} Â· {eq.sistema}
                </option>
              ))}
            </select>
          </Field>

          {/* Severidad */}
          <Field label="Severidad de la falla">
            <div style={{ display: "flex", gap: 8 }}>
              {[
                { v: "media",   lbl: "Media",   desc: "Puede operar limitado",      color: C.amber },
                { v: "alta",    lbl: "Alta",     desc: "No puede pescar",            color: "#E05050" },
                { v: "critica", lbl: "CrÃ­tica",  desc: "Riesgo para nave/seguridad", color: "#B91C1C" },
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

        {/* DescripciÃ³n */}
        <Field label="DescripciÃ³n de la falla (quÃ© se detectÃ³, quÃ© fallÃ³, sÃ­ntomas)">
          <textarea value={form.descripcion}
            onChange={(e) => setForm((p) => ({ ...p, descripcion: e.target.value }))}
            placeholder="Ej: Motor principal perdiÃ³ potencia a las 350 RPM, humo negro excesivo, temperatura sobre 100Â°C. Se decidiÃ³ retornar a puerto."
            style={{ ...inputStyle(), width: "100%", minHeight: 100, resize: "vertical", fontFamily: "inherit", lineHeight: 1.6 }} />
        </Field>

        {/* Riesgo tripulaciÃ³n */}
        <label style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16, padding: "12px 14px", borderRadius: 8, border: `1px solid ${form.riesgoTrip ? C.red : C.line}`, background: form.riesgoTrip ? "#FEF2F2" : "#fff", cursor: "pointer" }}>
          <input type="checkbox" checked={form.riesgoTrip}
            onChange={(e) => setForm((p) => ({ ...p, riesgoTrip: e.target.checked }))}
            style={{ width: 18, height: 18, accentColor: C.red }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 13.5, color: form.riesgoTrip ? C.red : C.ink }}>Hubo riesgo para la tripulaciÃ³n</div>
            <div style={{ fontSize: 12, color: C.slate }}>Marcar si la falla puso en peligro la seguridad de las personas a bordo</div>
          </div>
        </label>
      </Card>

      {/* Preview de lo que se generarÃ¡ */}
      <Card style={{ marginBottom: 16, background: "#FFFBEB", borderLeft: `4px solid ${C.amber}` }}>
        <div style={{ fontSize: 10.5, letterSpacing: 1.5, textTransform: "uppercase", color: C.slate, fontWeight: 700, marginBottom: 10 }}>
          Al confirmar se generarÃ¡ automÃ¡ticamente:
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <Pill tone="red">OT Urgente</Pill>
            <span style={{ color: C.ink }}>Orden de trabajo correctiva prioridad <strong>CRÃTICA</strong></span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <Pill tone="yellow">Solicitud</Pill>
            <span style={{ color: C.ink }}>NotificaciÃ³n al Jefe de MantenciÃ³n con detalle de la falla</span>
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
          <AlertTriangle size={18} /> {enviando ? "Enviandoâ€¦" : "Confirmar retorno por falla"}
        </button>
        <button onClick={onVolver} style={{ ...ghostBtn, padding: "14px 20px" }}>Cancelar</button>
      </div>
    </div>
  );
}

// ---------- Pantalla 4: historial de prezarpes ----------
function VistaHistorial({ prezarpes, embName, mareas, puedeBorrar, onAbrir, onEliminar }) {
  if (prezarpes.length === 0) {
    return <Card><Empty><ClipboardCheck size={30} color={C.amber} style={{ marginBottom: 10 }} /><br />AÃºn no hay prezarpes registrados. Inicia uno desde OperaciÃ³n.</Empty></Card>;
  }
  return (
    <Card style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
          <thead><tr>
            <th style={thStyle}>Fecha</th><th style={thStyle}>EmbarcaciÃ³n</th>
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
                  <td style={{ ...tdStyle, fontSize: 12.5 }}>{p.responsable || "â€”"}</td>
                  <td style={{ ...tdStyle, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>{m?.folio || "â€”"}</td>
                  <td style={tdStyle}>
                    <Pill tone={p.apto ? "green" : "red"}>{p.apto ? "Apto" : "No apto"}</Pill>
                    {m?.retorno_falla && <Pill tone="red" style={{ marginLeft: 6 }}>Retorno falla</Pill>}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right", color: C.steel, fontSize: 12, fontWeight: 600 }}>Ver informe â€º</td>
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
              <div><strong>Responsable:</strong> {p.responsable || "â€”"}</div>
              <div style={{ marginTop: 4 }}><Pill tone={p.apto ? "green" : "red"}>{p.apto ? "APTO PARA ZARPAR" : "NO APTO"}</Pill></div>
            </div>
          </div>
        </Card>

        <Bloque titulo="A Â· InspecciÃ³n visual" icon={Ship}>
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
          <Bloque titulo="B Â· Niveles de operaciÃ³n" icon={Droplet}>
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

        <Bloque titulo="C Â· Abastecimiento a bordo" icon={Fuel}>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", fontSize: 13 }}>
            <div><span style={{ color: C.slate }}>Combustible:</span> <strong>{p.combustible_l || 0} L</strong></div>
            <div><span style={{ color: C.slate }}>Agua dulce:</span> <strong>{p.agua_l || 0} L</strong></div>
            <div><span style={{ color: C.slate }}>Aceite:</span> <strong>{p.aceite_l || 0} L</strong></div>
          </div>
        </Bloque>

        {horometros.length > 0 && (
          <Bloque titulo="D Â· HorÃ³metros" icon={Gauge}>
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

// ---------- Modal de eliminaciÃ³n con motivo ----------
const MOTIVOS_ELIM = [
  "Creado por error",
  "Datos incorrectos",
  "Zarpe duplicado",
  "Registro de prueba",
  "Se cancelÃ³ la salida",
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
        style={{ background: C.surface, borderRadius: 16, width: "100%", maxWidth: 440, boxShadow: "0 20px 60px rgba(0,0,0,.3)", overflow: "hidden" }}>
        <div style={{ padding: "22px 24px 0" }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: C.redBg, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
            <Trash2 size={24} color={C.red} />
          </div>
          <div style={{ ...archivo, fontSize: 20, fontWeight: 800, color: C.abyss }}>Eliminar zarpe</div>
          <div style={{ fontSize: 13, color: C.slate, marginTop: 6, lineHeight: 1.5 }}>
            <strong style={{ color: C.ink }}>{target.nombre}</strong>{target.fecha ? ` Â· ${target.fecha}` : ""}. Se borrarÃ¡ el prezarpe, su marea y fotos. Esta acciÃ³n no se puede deshacer.
          </div>
        </div>

        <div style={{ padding: "16px 24px 0" }}>
          <label style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: C.slate, fontWeight: 700 }}>Motivo de la eliminaciÃ³n</label>
          <select value={motivo} onChange={(e) => setMotivo(e.target.value)}
            style={{ width: "100%", marginTop: 7, padding: "11px 12px", borderRadius: 10, border: `1px solid ${C.line}`, fontSize: 14, fontFamily: "inherit", color: motivo ? C.ink : C.slate, background: C.surface, cursor: "pointer" }}>
            <option value="">â€” Selecciona un motivo â€”</option>
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
    <div style={{ padding: "12px 14px", border: `1px solid ${C.line}`, borderRadius: 10, background: C.surface }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
        <Icon size={15} color={C.steel} />
        <span style={{ fontSize: 12.5, fontWeight: 600, color: C.ink }}>{label}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button onClick={() => onChange(Math.max(0, value - step))} style={stepBtn}>âˆ’</button>
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
