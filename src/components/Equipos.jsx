import React, { useEffect, useState, useCallback } from "react";
import { Ship, Plus, Trash2, Download, AlertCircle, GitBranch, Layers, Cpu, Wrench, Box, Hash, ChevronDown, ChevronRight } from "lucide-react";
import { useAuth } from "../lib/auth";
import { fetchAll, insertRow, updateRow, deleteRow, logActivity } from "../lib/db";
import { C, isAdmin, canOperate, ESTADOS_EQUIPO, estadoLabel, tint } from "../theme";
import { buildEquipoTree } from "../lib/equipTree";
import { PLANTILLA_PESQUERA, contarNodosPlantilla, TIPO_NODO_META, CRITICIDAD_TONE } from "../lib/plantillaPesquera";
import {
  Card, PageHead, Pill, primaryBtn, ghostBtn, exportBtn, inputStyle, bluInput,
  thStyle, tdStyle, FilterBtn, Field, Empty, ErrorBanner, InlineSpinner, GuiaColapsable,
} from "../ui";

const TIPO_NODOS = [
  { value: "equipo",      label: "Equipo (genérico)" },
  { value: "sistema",     label: "Sistema (nivel 3)" },
  { value: "subsistema",  label: "Subsistema (nivel 4)" },
  { value: "componente",  label: "Componente (nivel 5)" },
  { value: "instrumento", label: "Instrumento / Sensor (nivel 7)" },
];
const CRITICIDADES = [
  { value: "",  label: "— Sin clasificar" },
  { value: "A", label: "A · Crítico" },
  { value: "B", label: "B · Importante" },
  { value: "C", label: "C · Menor" },
];
const ICONO_TIPO = { sistema: Layers, subsistema: GitBranch, componente: Wrench, instrumento: Cpu, equipo: Box };

// Tipo de niveles que se revisan en el prezarpe para este equipo
const NIVEL_TIPOS = [
  { value: "ninguno", label: "— No aplica" },
  { value: "aceite",  label: "Solo aceite" },
  { value: "aceite_agua", label: "Aceite + agua chaqueta" },
];


function blankForm(embId = "") {
  return { embarcacion_id: embId, id_visible: "", sistema: "", subsistema: "", marca: "", modelo: "", parent_id: "", tipo_nodo: "equipo", criticidad: "" };
}

export default function Equipos() {
  const { profile } = useAuth();
  const [embarcaciones, setEmbarcaciones] = useState([]);
  const [equipos, setEquipos]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [filtro, setFiltro]     = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState(blankForm());
  const [precargando, setPrecargando] = useState(false);
  const [colapsados,  setColapsados]  = useState(() => new Set());
  const [initColapso, setInitColapso] = useState(false);
  const puedeOperar = canOperate(profile?.rol);
  const puedeBorrar = isAdmin(profile?.rol);

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [embs, eqs] = await Promise.all([
        fetchAll("embarcaciones", { order: { col: "codigo", asc: true } }),
        fetchAll("equipos",       { order: { col: "id_visible", asc: true } }),
      ]);
      setEmbarcaciones(embs); setEquipos(eqs);
      if (embs.length && !form.embarcacion_id) setForm((f) => ({ ...f, embarcacion_id: embs[0].id }));
    } catch (e) { setError("No se pudieron cargar los equipos. " + e.message); }
    finally { setLoading(false); }
  }, []); // eslint-disable-line
  useEffect(() => { cargar(); }, [cargar]);

  function embName(id)  { return embarcaciones.find((e) => e.id === id)?.nombre || "—"; }
  function embColor(id) { return embarcaciones.find((e) => e.id === id)?.color  || C.steel; }
  function eqName(id)   { const e = equipos.find((q) => q.id === id); return e ? `${e.id_visible} · ${e.sistema}` : "—"; }

  // Lista en orden de árbol según filtro de nave
  const baseList = filtro === "all" ? equipos : equipos.filter((e) => e.embarcacion_id === filtro);
  const lista    = buildEquipoTree(baseList);

  // ── Colapso por sistema raíz ──
  const conHijos = new Set();
  lista.forEach((e) => { if (e.depth > 0 && e.rootId) conHijos.add(e.rootId); });
  const listaVisible = lista.filter((e) => e.depth === 0 || !colapsados.has(e.rootId));

  // Contraer todos los sistemas por defecto (una sola vez, al cargar)
  useEffect(() => {
    if (!initColapso && conHijos.size > 0) {
      setColapsados(new Set([...conHijos]));
      setInitColapso(true);
    }
  }, [lista]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleColapso(rootId) {
    setColapsados((prev) => {
      const n = new Set(prev);
      n.has(rootId) ? n.delete(rootId) : n.add(rootId);
      return n;
    });
  }
  const colapsarTodo = (v) => setColapsados(v ? new Set([...conHijos]) : new Set());

  // Padres disponibles para un equipo (misma nave, no él mismo ni sus hijos)
  function padresDisponibles(eqId, embId) {
    const candidatos = equipos.filter((e) => e.embarcacion_id === embId && e.id !== eqId);
    // Excluir descendientes del equipo actual (para no crear ciclos)
    const descendants = new Set();
    function markDesc(id) { equipos.filter((c) => c.parent_id === id).forEach((c) => { descendants.add(c.id); markDesc(c.id); }); }
    if (eqId) markDesc(eqId);
    return candidatos.filter((c) => !descendants.has(c.id));
  }

  async function agregar() {
    if (!form.embarcacion_id || !form.sistema.trim()) return;
    const emb   = embarcaciones.find((e) => e.id === form.embarcacion_id);
    const idVis = form.id_visible.trim() || `${emb?.codigo || "EQ"}-${form.sistema.slice(0, 6).toUpperCase().replace(/\s/g, "")}`;
    try {
      const nuevo = await insertRow("equipos", profile.empresa_id, {
        embarcacion_id: form.embarcacion_id,
        id_visible:     idVis,
        sistema:        form.sistema.trim(),
        marca:          form.marca.trim(),
        modelo:         form.modelo.trim(),
        parent_id:      form.parent_id || null,
        tipo_nodo:      form.tipo_nodo || "equipo",
        criticidad:     form.criticidad || null,
        created_by:     profile.id,
      });
      setEquipos((p) => [...p, nuevo]);
      logActivity(profile, "Crear equipo", `${idVis} · ${nuevo.sistema}${form.parent_id ? ` (sub de ${eqName(form.parent_id)})` : ""} (${emb?.nombre})`);
      setForm(blankForm(form.embarcacion_id));
      setShowForm(false);
    } catch (e) { setError("No se pudo crear el equipo: " + e.message); }
  }

  // Precarga el árbol estándar de sistemas pesqueros para la nave filtrada.
  async function precargarPlantilla() {
    const emb = embarcaciones.find((e) => e.id === filtro);
    if (!emb) { setError("Selecciona primero una embarcación en los filtros."); return; }
    const total = contarNodosPlantilla();
    if (!window.confirm(`¿Precargar la plantilla pesquera estándar en "${emb.nombre}"?\n\nSe crearán ${total} nodos (sistemas → subsistemas → componentes → sensores). Puedes borrar después los que no apliquen a esta nave.`)) return;

    setPrecargando(true); setError(null);
    const creados = [];
    // Inserta un nodo y, recursivamente, todos sus descendientes (cualquier profundidad)
    async function insertarNodo(nodo, parentId) {
      const row = await insertRow("equipos", profile.empresa_id, {
        embarcacion_id: emb.id, id_visible: `${emb.codigo}-${nodo.cod}`,
        sistema: nodo.nom, tipo_nodo: nodo.tipo, criticidad: nodo.crit,
        parent_id: parentId, created_by: profile.id,
      });
      creados.push(row);
      for (const hijo of nodo.hijos || []) await insertarNodo(hijo, row.id);
    }
    try {
      for (const sis of PLANTILLA_PESQUERA) await insertarNodo(sis, null);
      setEquipos((p) => [...p, ...creados]);
      logActivity(profile, "Precargar plantilla pesquera", `${emb.nombre} · ${creados.length} nodos`);
    } catch (e) {
      setError("Se interrumpió la precarga: " + e.message + ". Recarga la página para ver lo que sí se creó.");
      setEquipos((p) => [...p, ...creados]);
    } finally { setPrecargando(false); }
  }

  function onChangeLocal(id, campo, valor) { setEquipos((p) => p.map((e) => e.id === id ? { ...e, [campo]: valor } : e)); }
  async function commit(id, campo, valor) {
    const previo = equipos.find((e) => e.id === id)?.[campo];
    if (previo === valor) return;
    onChangeLocal(id, campo, valor);
    try { await updateRow("equipos", id, { [campo]: valor }); }
    catch (e) { onChangeLocal(id, campo, previo); setError("No se pudo guardar el cambio: " + e.message); }
  }

  async function eliminar(id) {
    const eq = equipos.find((e) => e.id === id);
    const hijos = equipos.filter((e) => e.parent_id === id);
    const aviso = hijos.length > 0 ? `\n⚠️ Tiene ${hijos.length} subsistema(s) que quedarán como raíz.` : "";
    if (!window.confirm(`¿Eliminar el equipo "${eq?.sistema}"? Se borrarán también su criticidad, costos y planes asociados.${aviso}`)) return;
    const respaldo = equipos;
    setEquipos((p) => p.filter((e) => e.id !== id));
    try {
      await deleteRow("equipos", id);
      logActivity(profile, "Eliminar equipo", `${eq?.id_visible} · ${eq?.sistema}`);
    } catch (e) { setEquipos(respaldo); setError("No se pudo eliminar: " + e.message); }
  }

  function exportar() {
    const filas = [
      ["ID", "Embarcación", "Sistema padre", "Sistema / Equipo", "Marca", "Modelo", "Horas Actuales", "Hrs Últ PM", "Estado"],
      ...equipos.map((e) => [
        e.id_visible, embName(e.embarcacion_id),
        e.parent_id ? eqName(e.parent_id) : "",
        e.sistema, e.marca, e.modelo, e.horas_actual, e.horas_ult_pm, estadoLabel(e.estado),
      ]),
    ];
    const csv = filas.map((r) => r.map((c) => { const s = String(c ?? ""); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(";")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "equipos.csv"; a.click();
  }

  if (loading) return <div><PageHead kicker="Taxonomía ISO 14224" title="Registro de Equipos" /><Card><InlineSpinner label="Cargando equipos…" /></Card></div>;

  if (!loading && embarcaciones.length === 0) {
    return (
      <div>
        <PageHead kicker="Taxonomía ISO 14224" title="Registro de Equipos" />
        <ErrorBanner onRetry={cargar}>{error}</ErrorBanner>
        <Card><Empty>
          <AlertCircle size={32} color={C.amber} style={{ marginBottom: 10 }} /><br />
          Primero debes registrar al menos una <strong>embarcación</strong>. Ve al módulo <strong>Embarcaciones</strong> y agrega tu flota.
        </Empty></Card>
      </div>
    );
  }

  // Equipos de la nave seleccionada en el form (para el select de padre)
  const candidatosPadre = equipos.filter((e) => e.embarcacion_id === form.embarcacion_id);

  return (
    <div>
      <PageHead kicker="Taxonomía ISO 14224 · Jerarquía funcional" title="Registro de Equipos"
        sub="Estructura árbol: sistema raíz → subsistemas. Las horas alimentan el Plan Preventivo, Criticidad y Costo Global."
        action={<div style={{ display: "flex", gap: 8 }}>
          <button onClick={exportar} style={exportBtn}><Download size={15} /> Exportar CSV</button>
          {puedeOperar && <button onClick={() => setShowForm(!showForm)} style={primaryBtn}><Plus size={16} /> Agregar Equipo</button>}
        </div>} />

      <ErrorBanner onRetry={cargar}>{error}</ErrorBanner>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <FilterBtn active={filtro === "all"} onClick={() => setFiltro("all")}>Todas ({equipos.length})</FilterBtn>
        {embarcaciones.map((v) => (
          <FilterBtn key={v.id} active={filtro === v.id} onClick={() => setFiltro(v.id)} color={v.color}>
            {v.nombre} ({equipos.filter((e) => e.embarcacion_id === v.id).length})
          </FilterBtn>
        ))}
        {conHijos.size > 0 && (
          <>
            <div style={{ width: 1, alignSelf: "stretch", background: C.line, margin: "0 2px" }} />
            <button onClick={() => colapsarTodo(true)} style={{ ...ghostBtn, fontSize: 12, padding: "6px 12px" }}><ChevronRight size={13} /> Colapsar todo</button>
            <button onClick={() => colapsarTodo(false)} style={{ ...ghostBtn, fontSize: 12, padding: "6px 12px" }}><ChevronDown size={13} /> Expandir todo</button>
          </>
        )}
      </div>

      {/* Precarga de plantilla pesquera (solo con una nave seleccionada) */}
      {puedeOperar && filtro !== "all" && (
        <Card style={{ marginBottom: 16, background: `${C.cyan}0D`, border: `1px solid ${C.cyan}40`, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <Layers size={22} color={C.cyan} style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontWeight: 700, fontSize: 13.5, color: C.abyss }}>Plantilla pesquera ISO 14224</div>
            <div style={{ fontSize: 12, color: C.slate, marginTop: 2 }}>
              Genera el árbol estándar de {contarNodosPlantilla()} nodos (14 sistemas + subsistemas + sensores) para <strong>{embName(filtro)}</strong>. Borra después lo que no aplique.
            </div>
          </div>
          <button onClick={precargarPlantilla} disabled={precargando}
            style={{ ...primaryBtn, background: C.cyan, borderColor: C.cyan, flexShrink: 0 }}>
            {precargando ? "Precargando…" : <><Layers size={15} /> Precargar plantilla</>}
          </button>
        </Card>
      )}

      {showForm && (
        <Card style={{ marginBottom: 16, background: C.mist }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: C.abyss, marginBottom: 14 }}>Nuevo Equipo / Subsistema</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 12 }}>
            <Field label="Embarcación">
              <select value={form.embarcacion_id}
                onChange={(e) => setForm({ ...form, embarcacion_id: e.target.value, parent_id: "" })}
                style={inputStyle()}>
                {embarcaciones.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
              </select>
            </Field>
            <Field label="Sistema padre (opcional — si es subsistema)">
              <select value={form.parent_id} onChange={(e) => setForm({ ...form, parent_id: e.target.value })} style={inputStyle()}>
                <option value="">— Ninguno (sistema raíz) —</option>
                {buildEquipoTree(candidatosPadre).map((eq) => (
                  <option key={eq.id} value={eq.id}>
                    {"　".repeat(eq.depth)}{eq.depth > 0 ? "└─ " : ""}{eq.id_visible} · {eq.sistema}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="ID visible (opcional)">
              <input value={form.id_visible} onChange={(e) => setForm({ ...form, id_visible: e.target.value })} style={inputStyle()} placeholder="auto" />
            </Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12 }}>
            <Field label="Sistema / Equipo">
              <input value={form.sistema} onChange={(e) => setForm({ ...form, sistema: e.target.value })} style={inputStyle()} placeholder="Motor Principal, Bomba Hidráulica…" />
            </Field>
            <Field label="Marca">
              <input value={form.marca} onChange={(e) => setForm({ ...form, marca: e.target.value })} style={inputStyle()} />
            </Field>
            <Field label="Modelo">
              <input value={form.modelo} onChange={(e) => setForm({ ...form, modelo: e.target.value })} style={inputStyle()} />
            </Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
            <Field label="Tipo de nodo (nivel ISO 14224)">
              <select value={form.tipo_nodo} onChange={(e) => setForm({ ...form, tipo_nodo: e.target.value })} style={inputStyle()}>
                {TIPO_NODOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </Field>
            <Field label="Criticidad">
              <select value={form.criticidad} onChange={(e) => setForm({ ...form, criticidad: e.target.value })} style={inputStyle()}>
                {CRITICIDADES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </Field>
          </div>
          {form.parent_id && (
            <div style={{ marginTop: 10, padding: "8px 12px", background: `${C.cyan}14`, borderRadius: 7, fontSize: 12.5, color: C.steel }}>
              <GitBranch size={13} style={{ display: "inline", verticalAlign: "middle", marginRight: 5 }} />
              Subsistema de: <strong>{eqName(form.parent_id)}</strong>
            </div>
          )}

          {/* ── Nota de ejemplo de jerarquía ── */}
          <NotaJerarquia compacta />

          {/* ── Guía de nomenclatura del código de equipo ── */}
          <GuiaColapsable titulo="Guía del código de equipo (ID visible)" icon={Hash} tone={C.steel}>
            <div style={{ marginBottom: 8 }}>
              Formato: <code style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: C.steel }}>NAVE-SISTEMA[-SUBSISTEMA]</code>
              {" — "}el mismo que genera la plantilla pesquera, para que toda la flota sea consistente.
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, color: C.slate }}>
              <li><strong style={{ color: C.abyss }}>Sistema raíz:</strong> <code style={{ fontFamily: "'IBM Plex Mono', monospace", color: C.steel }}>AUR-PROP</code> (Propulsión de la nave Aurora)</li>
              <li><strong style={{ color: C.abyss }}>Subsistema:</strong> <code style={{ fontFamily: "'IBM Plex Mono', monospace", color: C.steel }}>AUR-PROP-MTR</code> (Motor, hijo de Propulsión)</li>
              <li>Códigos de sistema sugeridos: PROP, HYD, RSW, GEN, ELEC, FUEL, NAV, SAF, FISH…</li>
              <li>Si lo dejas vacío, se genera uno automático a partir del nombre.</li>
            </ul>
          </GuiaColapsable>

          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button onClick={agregar} style={primaryBtn}>Guardar</button>
            <button onClick={() => setShowForm(false)} style={ghostBtn}>Cancelar</button>
          </div>
        </Card>
      )}

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1340 }}>
            <thead><tr>
              <th style={thStyle}>ID</th>
              <th style={thStyle}>Nave</th>
              <th style={thStyle}>Sistema / Equipo</th>
              <th style={thStyle}>Subsistema de</th>
              <th style={thStyle}>Marca</th>
              <th style={thStyle}>Modelo</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Horas</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Hrs PM</th>
              <th style={thStyle}>Estado</th>
              <th style={{ ...thStyle, textAlign: "center" }}>Prezarpe</th>
              <th style={thStyle}>Niveles</th>
              <th style={{ ...thStyle, textAlign: "center" }}>Aceite</th>
              {puedeBorrar && <th style={thStyle}></th>}
            </tr></thead>
            <tbody>
              {lista.length === 0
                ? <tr><td colSpan={puedeBorrar ? 13 : 12}><Empty>{equipos.length === 0 ? <NotaJerarquia /> : "Sin equipos para este filtro."}</Empty></td></tr>
                : listaVisible.map((e) => {
                  const padres = padresDisponibles(e.id, e.embarcacion_id);
                  const esRaizConHijos = e.depth === 0 && conHijos.has(e.id);
                  const colapsado = colapsados.has(e.id);
                  const nSub = esRaizConHijos ? lista.filter((x) => x.rootId === e.id && x.depth > 0).length : 0;
                  return (
                    <tr key={e.id} style={{ background: e.depth > 0 ? tint(C.steel, 5) : undefined }}>

                      {/* ID */}
                      <td style={tdStyle}>
                        <input value={e.id_visible} disabled={!puedeOperar}
                          onChange={(ev) => onChangeLocal(e.id, "id_visible", ev.target.value)}
                          onBlur={(ev) => commit(e.id, "id_visible", ev.target.value)}
                          style={{ ...bluInput, width: 150 }} />
                      </td>

                      {/* Nave */}
                      <td style={tdStyle}>
                        <select value={e.embarcacion_id} disabled={!puedeOperar}
                          onChange={(ev) => commit(e.id, "embarcacion_id", ev.target.value)}
                          style={{ ...inputStyle(165), fontWeight: 600, color: embColor(e.embarcacion_id) }}>
                          {embarcaciones.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
                        </select>
                      </td>

                      {/* Sistema — colapsable + indentación de árbol + tipo + criticidad */}
                      <td style={tdStyle}>
                        <div style={{ display: "flex", alignItems: "center" }}>
                          {esRaizConHijos ? (
                            <button onClick={() => toggleColapso(e.id)} title={colapsado ? "Expandir" : "Colapsar"}
                              style={{ background: "none", border: "none", cursor: "pointer", color: C.steel, padding: 0, marginRight: 4, display: "flex", alignItems: "center", flexShrink: 0 }}>
                              {colapsado ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                            </button>
                          ) : e.depth > 0 ? (
                            <span style={{ marginLeft: (e.depth - 1) * 14, marginRight: 5, color: C.slate, fontSize: 13, flexShrink: 0 }}>└─</span>
                          ) : <span style={{ width: 20, flexShrink: 0 }} />}
                          {(() => {
                            const Ico = ICONO_TIPO[e.tipo_nodo] || ICONO_TIPO.equipo;
                            const meta = TIPO_NODO_META[e.tipo_nodo] || TIPO_NODO_META.equipo;
                            return <Ico size={13} color={meta.color} style={{ marginRight: 5, flexShrink: 0 }} title={meta.label} />;
                          })()}
                          <input value={e.sistema} disabled={!puedeOperar}
                            onChange={(ev) => onChangeLocal(e.id, "sistema", ev.target.value)}
                            onBlur={(ev) => commit(e.id, "sistema", ev.target.value)}
                            style={{ ...bluInput, width: Math.max(150, 230 - e.depth * 14), color: e.depth === 0 ? C.abyss : C.ink, fontWeight: e.depth === 0 ? 700 : 400 }} />
                          {e.criticidad && <span style={{ marginLeft: 6, flexShrink: 0 }}><Pill tone={CRITICIDAD_TONE[e.criticidad]}>{e.criticidad}</Pill></span>}
                          {colapsado && nSub > 0 && <span style={{ marginLeft: 8, fontSize: 11.5, color: C.steel, fontWeight: 600, flexShrink: 0 }}>▸ {nSub}</span>}
                        </div>
                      </td>

                      {/* Subsistema de (padre inline editable) */}
                      <td style={tdStyle}>
                        <select value={e.parent_id || ""} disabled={!puedeOperar}
                          onChange={(ev) => commit(e.id, "parent_id", ev.target.value || null)}
                          style={{ ...inputStyle(210), fontSize: 12.5, color: e.parent_id ? C.steel : C.line }}>
                          <option value="">— Raíz —</option>
                          {padres.map((p) => <option key={p.id} value={p.id}>{p.id_visible} · {p.sistema}</option>)}
                        </select>
                      </td>

                      {/* Marca / Modelo */}
                      <td style={tdStyle}><input value={e.marca || ""} disabled={!puedeOperar} onChange={(ev) => onChangeLocal(e.id, "marca", ev.target.value)} onBlur={(ev) => commit(e.id, "marca", ev.target.value)} style={inputStyle(120)} /></td>
                      <td style={tdStyle}><input value={e.modelo || ""} disabled={!puedeOperar} onChange={(ev) => onChangeLocal(e.id, "modelo", ev.target.value)} onBlur={(ev) => commit(e.id, "modelo", ev.target.value)} style={inputStyle(120)} /></td>

                      {/* Horas */}
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        <input type="number" value={e.horas_actual} disabled={!puedeOperar}
                          onChange={(ev) => onChangeLocal(e.id, "horas_actual", +ev.target.value)}
                          onBlur={(ev) => commit(e.id, "horas_actual", +ev.target.value)}
                          style={{ ...bluInput, width: 80, textAlign: "right" }} />
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        <input type="number" value={e.horas_ult_pm} disabled={!puedeOperar}
                          onChange={(ev) => onChangeLocal(e.id, "horas_ult_pm", +ev.target.value)}
                          onBlur={(ev) => commit(e.id, "horas_ult_pm", +ev.target.value)}
                          style={{ ...bluInput, width: 80, textAlign: "right" }} />
                      </td>

                      {/* Estado */}
                      <td style={tdStyle}>
                        <select value={e.estado} disabled={!puedeOperar}
                          onChange={(ev) => commit(e.id, "estado", ev.target.value)}
                          style={inputStyle(120)}>
                          {ESTADOS_EQUIPO.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                      </td>

                      {/* Prezarpe */}
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        <input type="checkbox" checked={!!e.prezarpe} disabled={!puedeOperar}
                          onChange={(ev) => commit(e.id, "prezarpe", ev.target.checked)}
                          title="Incluir en inspección de prezarpe"
                          style={{ width: 16, height: 16, cursor: puedeOperar ? "pointer" : "default", accentColor: C.steel }} />
                      </td>

                      {/* Niveles */}
                      <td style={tdStyle}>
                        <select value={e.nivel_tipo || "ninguno"} disabled={!puedeOperar}
                          onChange={(ev) => commit(e.id, "nivel_tipo", ev.target.value)}
                          style={inputStyle(155)}>
                          {NIVEL_TIPOS.map((n) => <option key={n.value} value={n.value}>{n.label}</option>)}
                        </select>
                      </td>

                      {/* Consume aceite */}
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        <input type="checkbox" checked={!!e.consume_aceite} disabled={!puedeOperar}
                          onChange={(ev) => commit(e.id, "consume_aceite", ev.target.checked)}
                          title="Consume aceite del motor (para repartir consumo por horas)"
                          style={{ width: 16, height: 16, cursor: puedeOperar ? "pointer" : "default", accentColor: C.steel }} />
                      </td>

                      {puedeBorrar && (
                        <td style={tdStyle}>
                          <button onClick={() => eliminar(e.id)} style={{ background: "none", border: "none", cursor: "pointer", color: C.slate }}>
                            <Trash2 size={15} />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ── Nota de ejemplo: nueva jerarquía de sistemas ──────────────────
const EJEMPLOS_JERARQUIA = [
  {
    sistema: "Propulsión",
    color: "#2563EB",
    hijos: ["Motor Principal", "Reductora / Caja de cambios", "Eje y bocina", "Hélice"],
  },
  {
    sistema: "Generación Eléctrica",
    color: "#D97706",
    hijos: ["Generador Principal", "Generador de Emergencia", "Tablero eléctrico"],
  },
  {
    sistema: "Hidráulico",
    color: "#059669",
    hijos: ["Bomba Hidráulica", "Cilindros (popa / proa)", "Válvulas de control"],
  },
  {
    sistema: "Enfriamiento",
    color: "#0891B2",
    hijos: ["Bomba agua de mar", "Bomba agua dulce", "Intercambiador de calor"],
  },
];

function NotaJerarquia({ compacta = false }) {
  const [abierta, setAbierta] = useState(false);

  if (compacta) {
    return (
      <div style={{ marginTop: 14, borderTop: `1px solid ${C.line}`, paddingTop: 12 }}>
        <button onClick={() => setAbierta((p) => !p)}
          style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 7, color: C.steel, fontSize: 12.5, fontWeight: 600, padding: 0 }}>
          <GitBranch size={14} />
          {abierta ? "▲ Ocultar ejemplo de jerarquía" : "▼ Ver ejemplo: cómo estructurar sistemas y subsistemas"}
        </button>
        {abierta && <EjemploArbol />}
      </div>
    );
  }

  // Versión completa para lista vacía
  return (
    <div style={{ textAlign: "left", padding: "8px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <GitBranch size={20} color={C.cyan} />
        <span style={{ fontWeight: 700, fontSize: 15, color: C.abyss }}>Nueva funcionalidad: Jerarquía de sistemas</span>
      </div>
      <p style={{ fontSize: 13, color: C.slate, marginBottom: 14, lineHeight: 1.6 }}>
        Ahora puedes crear <strong>subsistemas</strong> asignando un "Sistema padre" al registrar un equipo.
        Esto te permite organizar la flota como un árbol funcional, igual que IBM Maximo o SAP PM.
      </p>
      <EjemploArbol />
      <div style={{ marginTop: 14, padding: "10px 14px", background: `${C.cyan}12`, borderRadius: 8, fontSize: 12.5, color: C.steel, lineHeight: 1.6 }}>
        <strong>¿Cómo empezar?</strong> Crea primero los sistemas raíz (ej. <em>Propulsión</em>) sin padre.
        Luego crea los subsistemas (ej. <em>Motor Principal</em>) seleccionando el sistema raíz como padre.
        En las Órdenes de Trabajo, Plan PM y Análisis verás los equipos en este orden jerárquico.
      </div>
    </div>
  );
}

function EjemploArbol() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginTop: 12 }}>
      {EJEMPLOS_JERARQUIA.map((ej) => (
        <div key={ej.sistema} style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 9, padding: "12px 14px" }}>
          {/* Sistema raíz */}
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: ej.color, flexShrink: 0 }} />
            <span style={{ fontWeight: 700, fontSize: 13, color: C.abyss }}>{ej.sistema}</span>
            <span style={{ fontSize: 10.5, color: C.slate, background: C.foam, borderRadius: 4, padding: "1px 6px" }}>sistema raíz</span>
          </div>
          {/* Hijos */}
          {ej.hijos.map((h, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 6, marginBottom: 4 }}>
              <span style={{ color: C.slate, fontSize: 13, flexShrink: 0 }}>└─</span>
              <span style={{ fontSize: 12.5, color: C.slate }}>{h}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
