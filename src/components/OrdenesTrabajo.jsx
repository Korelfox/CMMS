import React, { useEffect, useState, useCallback } from "react";
import { ClipboardList, Plus, Trash2, Download, CloudOff, Clock, ChevronDown, DollarSign, Check, Camera } from "lucide-react";
import { useAuth } from "../lib/auth";
import { fetchAll, insertRow, updateRow, deleteRow, logActivity } from "../lib/db";
import { useOnline, cacheTable, getCached, queueInsert, nuevoId } from "../lib/offline";
import { buildEquipoTree } from "../lib/equipTree";
import { subirFotos } from "../lib/fotos";
import { C, clp, num, isAdmin, canOperate, TIPOS_OT, PRIORIDADES, ESTADOS_OT, lk, tn } from "../theme";
import {
  Card, PageHead, Pill, primaryBtn, ghostBtn, exportBtn, inputStyle, bluInput,
  thStyle, tdStyle, FilterBtn, Field, Empty, ErrorBanner, InlineSpinner,
} from "../ui";
import { FotoInput, FotoGaleria } from "./Fotos";

const HOY = () => new Date().toISOString().slice(0, 10);

export default function OrdenesTrabajo({ navParams }) {
  const { profile } = useAuth();
  const online = useOnline();
  const [embarcaciones, setEmbarcaciones] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [ots, setOts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [usandoCache, setUsandoCache] = useState(false);
  const [filtro, setFiltro] = useState("all");
  const [otDestacadaId, setOtDestacadaId] = useState(navParams?.otId || null);  // OT abierta desde Alertas
  const [modoCostos, setModoCostos] = useState(false);  // ediciÃ³n de costos por fila
  const [costoOk, setCostoOk] = useState(null);          // feedback "âœ“ guardado" por OT
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blank());
  const [fotos, setFotos] = useState([]);          // fotos en memoria para la nueva OT
  const [fotosOT, setFotosOT] = useState(null);    // OT cuya galerÃ­a de fotos estÃ¡ abierta
  const puedeOperar = canOperate(profile?.rol);
  const puedeBorrar = isAdmin(profile?.rol);
  const puedeCostos = isAdmin(profile?.rol);  // valorizar costos: Jefe MantenciÃ³n y superiores

  function blank() {
    return { embarcacion_id: "", equipo_id: "", sistema: "", tipo: "preventivo", prioridad: "media",
      estado: "solicitada", fecha: HOY(), descripcion: "", mttr_horas: 0, hrs_oper_desde: 0, costo_mo: 0, costo_mat: 0 };
  }

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [embs, eqs, o] = await Promise.all([
        fetchAll("embarcaciones", { order: { col: "codigo", asc: true } }),
        fetchAll("equipos", { order: { col: "id_visible", asc: true } }),
        fetchAll("ordenes_trabajo", { order: { col: "fecha", asc: false } }),
      ]);
      setEmbarcaciones(embs); setEquipos(eqs); setOts(o);
      setUsandoCache(false);
      // Guarda copia local para poder trabajar sin seÃ±al
      cacheTable("embarcaciones", embs); cacheTable("equipos", eqs); cacheTable("ordenes_trabajo", o);
    } catch (e) {
      // Sin seÃ±al o error de red â†’ trabajamos con la Ãºltima copia local
      const [embs, eqs, o] = await Promise.all([
        getCached("embarcaciones"), getCached("equipos"), getCached("ordenes_trabajo"),
      ]);
      setEmbarcaciones(embs); setEquipos(eqs); setOts(o); setUsandoCache(true);
      if (embs.length === 0 && o.length === 0) setError("No se pudieron cargar las Ã³rdenes y no hay copia local. ConÃ©ctate al menos una vez para guardar los datos.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // Al llegar desde una alerta de OT resaltamos esa orden; si se navega
  // al mÃ³dulo sin contexto (ej. desde el menÃº), se limpia la destacada.
  useEffect(() => {
    if (navParams?.otId) { setOtDestacadaId(navParams.otId); setFiltro("all"); }
    else { setOtDestacadaId(null); }
  }, [navParams]);

  // Cambiar de filtro manualmente quita el modo "OT seÃ±alada".
  function aplicarFiltro(f) { setFiltro(f); setOtDestacadaId(null); }

  // Cuando el outbox se vacÃ­a (volviÃ³ la seÃ±al y subiÃ³ todo), recargamos del servidor.
  useEffect(() => {
    const onSynced = () => cargar();
    window.addEventListener("cmms-synced", onSynced);
    return () => window.removeEventListener("cmms-synced", onSynced);
  }, [cargar]);

  function embName(id) { return embarcaciones.find((e) => e.id === id)?.nombre || "â€”"; }
  const equiposDeNave = form.embarcacion_id ? equipos.filter((e) => e.embarcacion_id === form.embarcacion_id) : [];

  // Si venimos de una alerta, mostramos solo esa OT; si no, el filtro normal.
  const otDestacada = otDestacadaId ? ots.find((o) => o.id === otDestacadaId) : null;
  const lista = otDestacada ? [otDestacada]
    : filtro === "all" ? ots
    : ["solicitada", "planificada", "programada", "en_ejecucion", "cerrada"].includes(filtro)
      ? ots.filter((o) => o.estado === filtro)
      : ots.filter((o) => o.embarcacion_id === filtro);

  // KPIs rÃ¡pidos
  const abiertas = ots.filter((o) => o.estado !== "cerrada").length;
  const costoTotal = ots.reduce((s, o) => s + (o.costo_mo || 0) + (o.costo_mat || 0), 0);
  const preventivas = ots.filter((o) => o.tipo === "preventivo").length;
  const propProactivo = ots.length ? Math.round((preventivas / ots.length) * 100) : 0;

  async function crear() {
    if (!form.descripcion.trim() || !form.embarcacion_id) { setError("Indica al menos la embarcaciÃ³n y una descripciÃ³n."); return; }
    const id = nuevoId();
    const fila = {
      id,
      folio: online ? `OT-${String(ots.length + 1).padStart(3, "0")}` : `OT-S/N-${new Date().toISOString().slice(5, 16).replace("T", "-").replace(":", "")}`,
      empresa_id: profile.empresa_id,
      embarcacion_id: form.embarcacion_id,
      equipo_id: form.equipo_id || null,
      sistema: form.sistema.trim(),
      tipo: form.tipo, prioridad: form.prioridad, estado: form.estado,
      descripcion: form.descripcion.trim(), fecha: form.fecha,
      mttr_horas: form.mttr_horas, hrs_oper_desde: form.hrs_oper_desde,
      costo_mo: form.costo_mo, costo_mat: form.costo_mat,
      created_by: profile.id,
    };

    if (online) {
      try {
        const { empresa_id, ...resto } = fila;
        const nueva = await insertRow("ordenes_trabajo", profile.empresa_id, resto);
        setOts((p) => [nueva, ...p]);
        logActivity(profile, "Crear OT", `${fila.folio} Â· ${embName(form.embarcacion_id)} Â· ${lk(TIPOS_OT, form.tipo)} Â· ${form.descripcion}`);
        // Subir fotos opcionales asociadas a la OT reciÃ©n creada
        if (fotos.length) {
          const { errores } = await subirFotos(fotos, { empresaId: profile.empresa_id, entidad: "ot", entidadId: nueva.id, profileId: profile.id });
          if (errores.length) setError("La OT se creÃ³, pero algunas fotos no se subieron: " + errores[0]);
        }
        setForm(blank()); setFotos([]); setShowForm(false);
      } catch (e) { setError("No se pudo crear la OT: " + e.message); }
    } else {
      // Sin seÃ±al: a la cola. Sube sola al recuperar conexiÃ³n.
      await queueInsert("ordenes_trabajo", fila, `OT ${embName(form.embarcacion_id)} Â· ${form.descripcion}`);
      setOts((p) => [{ ...fila, _pending: true }, ...p]);
      if (fotos.length) setError("La OT quedÃ³ en cola (sin conexiÃ³n). Las fotos se podrÃ¡n adjuntar al recuperar seÃ±al desde el botÃ³n de cÃ¡mara.");
      setForm(blank()); setFotos([]); setShowForm(false);
    }
  }

  async function eliminar(id) {
    const ot = ots.find((o) => o.id === id);
    if (!window.confirm(`Â¿Eliminar la orden ${ot?.folio}?`)) return;
    const respaldo = ots;
    setOts((p) => p.filter((o) => o.id !== id));
    try { await deleteRow("ordenes_trabajo", id); logActivity(profile, "Eliminar OT", ot?.folio || id); }
    catch (e) { setOts(respaldo); setError("No se pudo eliminar: " + e.message); }
  }

  // Avanza/cambia el estado de una OT (Solicitada â†’ â€¦ â†’ Cerrada).
  async function cambiarEstado(ot, nuevoEstado) {
    if (!nuevoEstado || nuevoEstado === ot.estado) return;
    const anterior = ot.estado;
    // ActualizaciÃ³n optimista: la UI cambia al instante.
    setOts((p) => p.map((o) => (o.id === ot.id ? { ...o, estado: nuevoEstado } : o)));
    setError(null);
    try {
      await updateRow("ordenes_trabajo", ot.id, { estado: nuevoEstado });
      logActivity(profile, "Cambiar estado OT", `${ot.folio}: ${lk(ESTADOS_OT, anterior)} â†’ ${lk(ESTADOS_OT, nuevoEstado)}`);
    } catch (e) {
      // Si falla, revertimos al estado anterior.
      setOts((p) => p.map((o) => (o.id === ot.id ? { ...o, estado: anterior } : o)));
      setError("No se pudo cambiar el estado: " + e.message);
    }
  }

  // EdiciÃ³n de costos: actualiza en memoria (el total se recalcula al instante).
  function editarCosto(otId, campo, valor) {
    setOts((p) => p.map((o) => (o.id === otId ? { ...o, [campo]: valor } : o)));
    if (costoOk === otId) setCostoOk(null);
  }

  // Guarda los costos de una OT al salir del campo (onBlur).
  async function guardarCosto(ot) {
    setError(null);
    try {
      await updateRow("ordenes_trabajo", ot.id, { costo_mo: ot.costo_mo || 0, costo_mat: ot.costo_mat || 0 });
      logActivity(profile, "Editar costos OT", `${ot.folio} Â· MO ${clp(ot.costo_mo || 0)} Â· Mat ${clp(ot.costo_mat || 0)}`);
      setCostoOk(ot.id);
      setTimeout(() => setCostoOk((c) => (c === ot.id ? null : c)), 2000);
    } catch (e) { setError("No se pudieron guardar los costos: " + e.message); cargar(); }
  }

  function exportar() {
    const filas = [["Folio", "Fecha", "EmbarcaciÃ³n", "Sistema", "Tipo", "Prioridad", "DescripciÃ³n", "MTTR", "Costo MO", "Costo Mat", "Estado"],
      ...ots.map((o) => [o.folio, o.fecha, embName(o.embarcacion_id), o.sistema, lk(TIPOS_OT, o.tipo), lk(PRIORIDADES, o.prioridad), o.descripcion, o.mttr_horas, o.costo_mo, o.costo_mat, lk(ESTADOS_OT, o.estado)])];
    const csv = filas.map((r) => r.map((c) => { const s = String(c ?? ""); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(";")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "ordenes_trabajo.csv"; a.click();
  }

  if (loading) return <div><PageHead kicker="Nivel Operativo" title="Ã“rdenes de Trabajo" /><Card><InlineSpinner label="Cargando Ã³rdenesâ€¦" /></Card></div>;

  return (
    <div>
      <PageHead kicker="Nivel Operativo Â· Libbrecht" title="Ã“rdenes de Trabajo"
        sub="Flujo: Solicitada â†’ Planificada â†’ Programada â†’ En ejecuciÃ³n â†’ Cerrada. Registra costos, MTTR y horas de operaciÃ³n."
        action={<div style={{ display: "flex", gap: 8 }}>
          <button onClick={exportar} style={exportBtn}><Download size={15} /> Exportar</button>
          {puedeOperar && <button onClick={() => { setShowForm(!showForm); setError(null); }} style={primaryBtn}><Plus size={16} /> Nueva OT</button>}
        </div>} />

      <ErrorBanner onRetry={cargar}>{error}</ErrorBanner>

      {(!online || usandoCache) && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: C.yellowBg, border: `1px solid ${C.amber}`, color: "#7a5b00", padding: "10px 14px", borderRadius: 10, marginBottom: 14, fontSize: 13 }}>
          <CloudOff size={17} />
          <span>
            {online
              ? "Mostrando la Ãºltima copia guardada en este dispositivo."
              : "Sin conexiÃ³n. Puedes crear OTs igual: quedarÃ¡n en este dispositivo y se subirÃ¡n solas al recuperar seÃ±al."}
          </span>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 16 }}>
        <MiniStat label="OTs Totales" value={ots.length} sub={`${abiertas} abiertas`} />
        <MiniStat label="Abiertas" value={abiertas} tone={abiertas ? C.yellow : C.green} />
        <MiniStat label="Proactivo" value={`${propProactivo}%`} tone={propProactivo >= 60 ? C.green : C.yellow} sub={`${preventivas} preventivas`} />
        <MiniStat label="Costo Total" value={clp(costoTotal)} tone={C.gold}
          onClick={puedeCostos ? () => setModoCostos((v) => !v) : undefined}
          hint={modoCostos ? "Cerrar ediciÃ³n" : "Ingresar costos"} />
      </div>

      {showForm && (
        <Card style={{ marginBottom: 16, background: C.mist }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: C.abyss, marginBottom: 14 }}>Nueva Orden de Trabajo</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
            <Field label="EmbarcaciÃ³n">
              <select value={form.embarcacion_id} onChange={(e) => setForm({ ...form, embarcacion_id: e.target.value, equipo_id: "" })} style={inputStyle()}>
                <option value="">â€” Selecciona â€”</option>
                {embarcaciones.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
              </select>
            </Field>
            <Field label="Equipo (opcional)">
              <select value={form.equipo_id} disabled={!form.embarcacion_id} onChange={(e) => {
                const eq = equipos.find((x) => x.id === e.target.value);
                setForm({ ...form, equipo_id: e.target.value, sistema: eq?.sistema || form.sistema });
              }} style={inputStyle()}>
                <option value="">â€” Ninguno â€”</option>
                {buildEquipoTree(equiposDeNave).map((eq) => (
                  <option key={eq.id} value={eq.id}>
                    {"ã€€".repeat(eq.depth)}{eq.depth > 0 ? "â””â”€ " : ""}{eq.id_visible} Â· {eq.sistema}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Sistema"><input value={form.sistema} onChange={(e) => setForm({ ...form, sistema: e.target.value })} style={inputStyle()} placeholder="Motor Principal" /></Field>
            <Field label="Fecha"><input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} style={inputStyle()} /></Field>

            <Field label="Tipo"><select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} style={inputStyle()}>{TIPOS_OT.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></Field>
            <Field label="Prioridad"><select value={form.prioridad} onChange={(e) => setForm({ ...form, prioridad: e.target.value })} style={inputStyle()}>{PRIORIDADES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></Field>
            <Field label="Estado"><select value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })} style={inputStyle()}>{ESTADOS_OT.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></Field>
            <Field label="MTTR (hrs paro)"><input type="number" value={form.mttr_horas} onChange={(e) => setForm({ ...form, mttr_horas: +e.target.value })} style={bluInput} /></Field>

            <Field label="DescripciÃ³n" span={2}><input value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} style={inputStyle()} placeholder="Trabajo a realizar" /></Field>
            <Field label="Costo MO ($)"><input type="number" value={form.costo_mo} onChange={(e) => setForm({ ...form, costo_mo: +e.target.value })} style={bluInput} /></Field>
            <Field label="Costo Mat. ($)"><input type="number" value={form.costo_mat} onChange={(e) => setForm({ ...form, costo_mat: +e.target.value })} style={bluInput} /></Field>
          </div>
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 11, color: C.slate, marginBottom: 6, fontWeight: 600 }}>Fotos (opcional)</div>
            <FotoInput files={fotos} onChange={setFotos} max={5} disabled={!online} />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button onClick={crear} style={primaryBtn}>Guardar OT</button>
            <button onClick={() => { setShowForm(false); setError(null); }} style={ghostBtn}>Cancelar</button>
          </div>
        </Card>
      )}

      {otDestacada && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, background: C.mist, border: `1px solid ${C.line}`, borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 13 }}>
          <span style={{ color: C.steel }}>Mostrando la orden <strong>{otDestacada.folio}</strong> seÃ±alada desde Alertas. Cambia su estado en la columna Estado.</span>
          <button onClick={() => setOtDestacadaId(null)} style={{ ...ghostBtn, padding: "5px 12px", fontSize: 12.5, whiteSpace: "nowrap" }}>Ver todas</button>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <FilterBtn active={!otDestacada && filtro === "all"} onClick={() => aplicarFiltro("all")}>Todas ({ots.length})</FilterBtn>
        {ESTADOS_OT.map((s) => {
          const n = ots.filter((o) => o.estado === s.value).length;
          return <FilterBtn key={s.value} active={!otDestacada && filtro === s.value} onClick={() => aplicarFiltro(s.value)}>{s.label} ({n})</FilterBtn>;
        })}
      </div>

      {modoCostos && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, background: C.goldBg || "#FBF3DD", border: `1px solid ${C.gold}`, borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 13 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "#7a5b00" }}>
            <DollarSign size={16} /> Modo ediciÃ³n de costos: ingresa mano de obra (MO) y materiales (Mat) de cada orden. Se guarda al salir del campo.
          </span>
          <button onClick={() => setModoCostos(false)} style={{ ...ghostBtn, padding: "5px 12px", fontSize: 12.5, whiteSpace: "nowrap" }}>Listo</button>
        </div>
      )}

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 960 }}>
            <thead><tr>
              <th style={thStyle}>Folio</th><th style={thStyle}>Fecha</th><th style={thStyle}>EmbarcaciÃ³n</th>
              <th style={thStyle}>Sistema</th><th style={thStyle}>Tipo</th><th style={thStyle}>Prioridad</th>
              <th style={thStyle}>DescripciÃ³n</th><th style={{ ...thStyle, textAlign: "right" }}>Costo</th>
              <th style={thStyle}>Estado</th><th style={thStyle}></th>
            </tr></thead>
            <tbody>
              {lista.length === 0 ? <tr><td colSpan={10}><Empty>Sin Ã³rdenes en este filtro.</Empty></td></tr> :
                lista.map((o) => (
                  <React.Fragment key={o.id}>
                  <tr style={o._pending ? { background: C.yellowBg } : undefined}>
                    <td style={{ ...tdStyle, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, color: C.steel }}>
                      {o.folio}
                      {o._pending && <span title="Pendiente de sincronizar" style={{ display: "inline-flex", alignItems: "center", gap: 3, marginLeft: 6, fontSize: 10, fontFamily: "'Archivo',sans-serif", fontWeight: 700, color: "#7a5b00", background: C.amber, padding: "1px 6px", borderRadius: 20 }}><Clock size={9} /> Pendiente</span>}
                    </td>
                    <td style={{ ...tdStyle, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>{o.fecha}</td>
                    <td style={tdStyle}>{embName(o.embarcacion_id)}</td>
                    <td style={tdStyle}>{o.sistema}</td>
                    <td style={tdStyle}><Pill tone={tn(TIPOS_OT, o.tipo)}>{lk(TIPOS_OT, o.tipo)}</Pill></td>
                    <td style={tdStyle}><Pill tone={tn(PRIORIDADES, o.prioridad)}>{lk(PRIORIDADES, o.prioridad)}</Pill></td>
                    <td style={{ ...tdStyle, maxWidth: 220 }}>{o.descripcion}</td>
                    {modoCostos && puedeCostos && !o._pending && online ? (
                      <td style={tdStyle}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                          <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, color: C.slate, fontWeight: 600 }}>
                            MO <input type="number" step={1000} value={o.costo_mo || 0}
                              onChange={(e) => editarCosto(o.id, "costo_mo", +e.target.value)} onBlur={() => guardarCosto(o)}
                              style={{ ...bluInput, width: 96, padding: "4px 7px", fontSize: 12 }} /></label>
                          <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, color: C.slate, fontWeight: 600 }}>
                            Mat <input type="number" step={1000} value={o.costo_mat || 0}
                              onChange={(e) => editarCosto(o.id, "costo_mat", +e.target.value)} onBlur={() => guardarCosto(o)}
                              style={{ ...bluInput, width: 96, padding: "4px 7px", fontSize: 12 }} /></label>
                          {costoOk === o.id && <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, color: C.green, fontWeight: 600 }}><Check size={11} /> guardado</span>}
                        </div>
                      </td>
                    ) : (
                      <td style={{ ...tdStyle, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>{clp((o.costo_mo || 0) + (o.costo_mat || 0))}</td>
                    )}
                    <td style={tdStyle}>
                      {puedeOperar && !o._pending && online
                        ? <EstadoSelect estado={o.estado} onChange={(nuevo) => cambiarEstado(o, nuevo)} />
                        : <Pill tone={tn(ESTADOS_OT, o.estado)}>{lk(ESTADOS_OT, o.estado)}</Pill>}
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        {!o._pending && online && (
                          <button onClick={() => setFotosOT(fotosOT === o.id ? null : o.id)} title="Fotos" style={{ background: "none", border: "none", cursor: "pointer", color: fotosOT === o.id ? C.steel : C.slate }}><Camera size={15} /></button>
                        )}
                        {puedeBorrar && !o._pending && <button onClick={() => eliminar(o.id)} title="Eliminar" style={{ background: "none", border: "none", cursor: "pointer", color: C.slate }}><Trash2 size={15} /></button>}
                      </div>
                    </td>
                  </tr>
                  {fotosOT === o.id && (
                    <tr>
                      <td colSpan={10} style={{ ...tdStyle, background: C.mist }}>
                        <div style={{ fontSize: 11, color: C.slate, fontWeight: 600, marginBottom: 8 }}>Fotos de {o.folio}</div>
                        <FotoGaleria entidad="ot" entidadId={o.id} puedeAgregar={puedeOperar} puedeBorrar={puedeBorrar} online={online} />
                      </td>
                    </tr>
                  )}
                  </React.Fragment>))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// Selector de estado: permite avanzar la OT de Solicitada hasta Cerrada
// (y corregir si fuera necesario). Se ve como una pÃ­ldora con el color del estado.
function EstadoSelect({ estado, onChange }) {
  const map = {
    green: [C.green, C.greenBg], yellow: [C.yellow, C.yellowBg], slate: [C.slate, C.foam],
    steel: [C.steel, "#E4EFF8"], purple: [C.purple, C.purpleBg], red: [C.red, C.redBg],
  };
  const [fg, bg] = map[tn(ESTADOS_OT, estado)] || map.slate;
  return (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <select
        value={estado}
        onChange={(e) => onChange(e.target.value)}
        title="Cambiar estado de la orden"
        style={{
          appearance: "none", WebkitAppearance: "none", MozAppearance: "none",
          background: bg, color: fg, border: `1px solid ${fg}40`, borderRadius: 20,
          padding: "4px 26px 4px 11px", fontSize: 11.5, fontWeight: 600,
          cursor: "pointer", fontFamily: "inherit",
        }}
      >
        {ESTADOS_OT.map((s) => (
          <option key={s.value} value={s.value} style={{ background: C.surface, color: C.ink }}>{s.label}</option>
        ))}
      </select>
      <ChevronDown size={13} color={fg} style={{ position: "absolute", right: 8, pointerEvents: "none" }} />
    </div>
  );
}

function MiniStat({ label, value, unit, tone, sub, onClick, hint }) {
  return (
    <Card onClick={onClick} title={onClick ? hint : undefined}
      style={{ padding: 16, cursor: onClick ? "pointer" : "default" }}>
      <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: C.slate, fontWeight: 600 }}>{label}</div>
      <div style={{ fontFamily: "'Archivo', sans-serif", fontSize: 26, fontWeight: 800, color: tone || C.steel, lineHeight: 1, marginTop: 8 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: C.slate, marginTop: 6 }}>{sub}</div>}
      {onClick && <div style={{ fontSize: 10.5, color: C.gold, fontWeight: 700, marginTop: 6 }}>{hint} â€º</div>}
    </Card>
  );
}
