import React, { useState, useEffect, useCallback } from "react";
import {
  Ship, Anchor, Fuel, Droplet, Gauge, Check, X, AlertTriangle,
  ArrowLeft, Camera, ClipboardCheck, Waves, CloudOff, Clock, Trash2,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { fetchAll, insertRow, updateRow, deleteRow, logActivity } from "../lib/db";
import { useOnline, cacheTable, getCached, queueInsert, nuevoId } from "../lib/offline";
import { subirFotos, listarFotos, borrarFoto } from "../lib/fotos";
import { C, canOperate, isAdmin } from "../theme";
import { buildEquipoTree } from "../lib/equipTree";
import { Card, PageHead, Pill, primaryBtn, ghostBtn, InlineSpinner, ErrorBanner, Empty, Field } from "../ui";
import { FotoInput, FotoGaleria } from "./Fotos";
import { HOY, SEGURIDAD_FIJA } from "./prezarpe/util";
import { VistaFlota, VistaChecklist, VistaRecalada, VistaRetornoFalla, VistaHistorial, VistaInforme, ModalEliminar } from "./prezarpe/vistas";


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
  const [confirmar, setConfirmar] = useState(null);      // modal de eliminación con motivo
  const puedeOperar = canOperate(profile?.rol);
  const puedeBorrar = isAdmin(profile?.rol);   // eliminar prezarpe/marea: solo administración

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
    } catch {
      const [embs, eqs, ms, pzs, docs] = await Promise.all([getCached("embarcaciones"), getCached("equipos"), getCached("mareas"), getCached("prezarpes"), getCached("documentos")]);
      setEmbarcaciones(embs); setEquipos(eqs); setMareas(ms); setPrezarpes(pzs); setDocumentos(docs); setUsandoCache(true);
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
  // Documentos vencidos de una nave (aviso de cumplimiento al zarpar)
  const docsVencidos = (embId) => {
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    return documentos.filter((d) => d.embarcacion_id === embId && d.vencimiento && new Date(d.vencimiento + "T00:00:00") < hoy);
  };

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
      // Lecturas ISO 14224 para horómetros de fin de marea + propagación a descendientes
      const horosFin = datos.horometros_fin || {};
      if (Object.keys(horosFin).length > 0) {
        const byIdRec = new Map(equipos.map((e) => [e.id, e]));
        const recaladaAt = new Date().toISOString();
        for (const [eqId, horas] of Object.entries(horosFin)) {
          const eq = byIdRec.get(eqId);
          if (!eq) continue;
          await insertRow("lecturas_horometro", profile.empresa_id, {
            equipo_id: eqId, horas: Number(horas), horas_anterior: eq.horas_actual ?? null,
            fuente: "recalada", usuario_id: profile.id, usuario_nombre: profile.nombre || "",
            fecha: recaladaAt,
          });
        }
      }
      logActivity(profile, "Recalada", embName(m.embarcacion_id));
      setVista("flota"); setMareaRec(null); setError(null);
      await cargar();
    } catch (e) { setError("No se pudo registrar la recalada: " + e.message); }
  }

  async function guardarRetornoFalla(marea, datos) {
    if (!online) { setError("Registrar retorno por falla requiere conexión."); return; }
    try {
      // 1) Cerrar la marea como retorno por falla
      await updateRow("mareas", marea.id, {
        estado: "cerrada", recalada_at: new Date().toISOString(),
        retorno_falla: true, falla_descripcion: datos.descripcion,
        falla_equipo_id: datos.equipo_id || null,
        falla_severidad: datos.severidad, falla_riesgo_trip: datos.riesgoTrip,
      });
      // 2) OT urgente para el jefe de mantención
      const detalle = [
        `🚨 RETORNO POR FALLA · ${embName(marea.embarcacion_id)}`,
        `Sistema/Equipo: ${datos.sistemaLabel}`,
        `Severidad: ${datos.severidad.toUpperCase()}`,
        datos.riesgoTrip ? "⚠️ RIESGO PARA LA TRIPULACIÓN" : null,
        `Descripción: ${datos.descripcion}`,
      ].filter(Boolean).join("\n");
      await insertRow("ordenes_trabajo", profile.empresa_id, {
        folio: `OT-RF-${Date.now().toString().slice(-6)}`,
        embarcacion_id: marea.embarcacion_id, equipo_id: datos.equipo_id || null,
        sistema: datos.sistemaLabel, tipo: "correctivo", prioridad: "critica",
        descripcion: detalle, fecha: HOY(), estado: "solicitada", created_by: profile.id,
      });
      // 3) Solicitud visible para el Jefe de Mantención
      await insertRow("solicitudes", profile.empresa_id, {
        folio: `SOL-RF-${Date.now().toString().slice(-6)}`,
        solicitante: profile.nombre || "", embarcacion_id: marea.embarcacion_id,
        sistema: datos.sistemaLabel,
        descripcion: `RETORNO POR FALLA [${datos.severidad.toUpperCase()}] · ${embName(marea.embarcacion_id)} · ${datos.descripcion}`,
        prioridad: "alta", fecha: HOY(), estado: "pendiente", created_by: profile.id,
      });
      logActivity(profile, "Retorno por falla", `${embName(marea.embarcacion_id)} · ${datos.sistemaLabel} · ${datos.severidad}`);
      setVista("flota"); setMareaFalla(null); setError(null);
      await cargar();
    } catch (e) { setError("No se pudo registrar el retorno por falla: " + e.message); }
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
        // Lecturas ISO 14224 para cada horómetro del prezarpe + propagación a descendientes
        const byIdPz = new Map(equipos.map((e) => [e.id, e]));
        const zarpeAt = new Date().toISOString();
        for (const [eqId, horas] of Object.entries(payload.horometros || {})) {
          const eq = byIdPz.get(eqId);
          if (!eq) continue;
          await insertRow("lecturas_horometro", profile.empresa_id, {
            equipo_id: eqId, horas: Number(horas), horas_anterior: eq.horas_actual ?? null,
            fuente: "prezarpe", usuario_id: profile.id, usuario_nombre: profile.nombre || "",
            fecha: zarpeAt,
          });
        }
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

  // Persiste la configuración del prezarpe (ítems extra / excluidos) en la embarcación.
  async function guardarConfigPrezarpe(config) {
    if (!nave) return;
    try {
      await updateRow("embarcaciones", nave.id, { prezarpe_config: config });
      setEmbarcaciones((prev) => prev.map((e) => e.id === nave.id ? { ...e, prezarpe_config: config } : e));
      setNave((prev) => prev ? { ...prev, prezarpe_config: config } : prev);
    } catch (e) { setError("No se pudo guardar la configuración del checklist: " + e.message); }
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
        <VistaFlota embarcaciones={embarcaciones} mareaAbierta={mareaAbierta} docsVencidos={docsVencidos} puedeOperar={puedeOperar} puedeBorrar={puedeBorrar}
          onIniciar={(n) => { setNave(n); setVista("checklist"); }} onRecalada={abrirRecalada} onEliminarZarpe={pedirEliminarZarpe}
          onRetornoFalla={(m) => { setMareaFalla(m); setVista("retorno_falla"); }} />
      )}
      {vista === "checklist" && (
        <VistaChecklist nave={nave} equipos={buildEquipoTree(equipos.filter((e) => e.embarcacion_id === nave.id))} online={online}
          onVolver={() => { setVista("flota"); setNave(null); }} onGuardar={guardarPrezarpe} onSaveConfig={guardarConfigPrezarpe} />
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
