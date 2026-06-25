import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Microscope, Plus, Trash2, Flame, ChevronDown, ChevronRight, Save, Check, X } from "lucide-react";
import { useAuth } from "../lib/auth";
import { fetchAll, insertRow, updateRow, deleteRow, logActivity } from "../lib/db";
import { candidatosRCA, ESTADOS_RCA, accionesPendientes } from "../lib/rca";
import { MODOS_FALLA_ISO, CAUSAS_FALLA_ISO } from "../lib/fallasISO";
import { C, archivo, canOperate, isAdmin, lk, tint } from "../theme";
import {
  Card, PageHead, Pill, primaryBtn, ghostBtn, inputStyle,
  Field, Empty, ErrorBanner, InlineSpinner,
} from "../ui";
import EquipoPicker from "./EquipoPicker";
import { hoyLocal } from "../lib/fechas";

const HOY = () => hoyLocal();
const estadoMeta = (v) => ESTADOS_RCA.find((e) => e.value === v) || ESTADOS_RCA[0];

export default function RCA() {
  const { profile } = useAuth();
  const [embarcaciones, setEmbarcaciones] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [ots, setOts] = useState([]);
  const [rcas, setRcas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blank());
  const [abierto, setAbierto] = useState(null);   // RCA expandido
  const [dirty, setDirty] = useState({});         // ediciones sin guardar por id
  const [guardadoOk, setGuardadoOk] = useState(null);
  const puedeOperar = canOperate(profile?.rol);
  const puedeBorrar = isAdmin(profile?.rol);

  function blank() {
    return { embarcacion_id: "", equipo_id: "", ot_id: "", falla: "", fecha: HOY() };
  }

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [embs, eqs, otsAll, rs] = await Promise.all([
        fetchAll("embarcaciones", { order: { col: "codigo", asc: true } }),
        fetchAll("equipos"),
        fetchAll("ordenes_trabajo", { order: { col: "fecha", asc: false } }),
        fetchAll("rca", { order: { col: "fecha", asc: false } }),
      ]);
      setEmbarcaciones(embs); setEquipos(eqs); setOts(otsAll); setRcas(rs);
    } catch (e) { setError("No se pudo cargar el análisis de causa raíz. " + e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const embName = (id) => embarcaciones.find((e) => e.id === id)?.nombre || "—";
  const eqName  = (id) => { const e = equipos.find((x) => x.id === id); return e ? (e.sistema || e.id_visible) : null; };
  const otFolio = (id) => ots.find((o) => o.id === id)?.folio || null;

  // Fallas crónicas sin RCA (mismo dato que alimenta Pareto)
  const candidatos = useMemo(() => candidatosRCA(ots, rcas), [ots, rcas]);

  // KPIs
  const abiertos = rcas.filter((r) => r.estado === "abierto").length;
  const pendTotal = rcas.reduce((s, r) => s + accionesPendientes(r), 0);
  const verificados = rcas.filter((r) => r.estado === "verificado").length;

  function iniciarDesdeCandidato(c) {
    setForm({
      embarcacion_id: c.embarcacionId || "",
      equipo_id: c.equipoId || "",
      ot_id: c.ultimaOT?.id || "",
      falla: `Falla recurrente (${c.n}× en 6 meses) · ${c.sistema}${c.modoTop ? ` — ${lk(MODOS_FALLA_ISO, c.modoTop)}` : ""}`,
      fecha: HOY(),
    });
    setShowForm(true); setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function crear() {
    if (!form.falla.trim()) { setError("Describe la falla o problema a analizar."); return; }
    try {
      const nuevo = await insertRow("rca", profile.empresa_id, {
        embarcacion_id: form.embarcacion_id || null,
        equipo_id: form.equipo_id || null,
        ot_id: form.ot_id || null,
        falla: form.falla.trim(), fecha: form.fecha,
        porques: [], acciones: [], estado: "abierto",
        created_by: profile.id,
      });
      setRcas((p) => [nuevo, ...p]);
      logActivity(profile, "Iniciar RCA", nuevo.falla.slice(0, 80));
      setForm(blank()); setShowForm(false); setAbierto(nuevo.id);
    } catch (e) { setError("No se pudo crear el RCA: " + e.message); }
  }

  // Edición local (no persiste hasta Guardar)
  function setCampo(id, campo, valor) {
    setRcas((p) => p.map((r) => (r.id === id ? { ...r, [campo]: valor } : r)));
    setDirty((d) => ({ ...d, [id]: true }));
    if (guardadoOk === id) setGuardadoOk(null);
  }
  const setPorque = (rca, i, texto) => {
    const arr = Array.from({ length: 5 }, (_, k) => (Array.isArray(rca.porques) ? rca.porques[k] : "") || "");
    arr[i] = texto;
    setCampo(rca.id, "porques", arr);
  };
  const setAccion = (rca, i, campo, valor) => {
    const arr = (Array.isArray(rca.acciones) ? rca.acciones : []).map((a, k) => (k === i ? { ...a, [campo]: valor } : a));
    setCampo(rca.id, "acciones", arr);
  };

  async function guardar(rca) {
    setError(null);
    try {
      const porques = (Array.isArray(rca.porques) ? rca.porques : []).map((p) => (p || "").trim());
      while (porques.length && !porques[porques.length - 1]) porques.pop(); // poda vacíos al final
      await updateRow("rca", rca.id, {
        falla: rca.falla, porques,
        causa_codigo: rca.causa_codigo || null, causa_raiz: rca.causa_raiz || null,
        acciones: Array.isArray(rca.acciones) ? rca.acciones : [],
        estado: rca.estado,
      });
      setDirty((d) => { const n = { ...d }; delete n[rca.id]; return n; });
      logActivity(profile, "Guardar RCA", `${rca.falla.slice(0, 60)} · ${estadoMeta(rca.estado).label}`);
      setGuardadoOk(rca.id);
      setTimeout(() => setGuardadoOk((g) => (g === rca.id ? null : g)), 2500);
    } catch (e) { setError("No se pudo guardar: " + e.message); cargar(); }
  }

  async function eliminar(rca) {
    if (!window.confirm(`¿Eliminar el RCA "${rca.falla.slice(0, 60)}"?`)) return;
    const respaldo = rcas;
    setRcas((p) => p.filter((r) => r.id !== rca.id));
    try { await deleteRow("rca", rca.id); logActivity(profile, "Eliminar RCA", rca.falla.slice(0, 60)); }
    catch (e) { setRcas(respaldo); setError("No se pudo eliminar: " + e.message); }
  }

  if (loading) return <div><PageHead kicker="Análisis · Mejora Continua" title="Causa Raíz (RCA)" /><Card><InlineSpinner label="Cargando análisis…" /></Card></div>;

  return (
    <div>
      <PageHead kicker="Análisis · 5 Porqués" title="Causa Raíz (RCA)"
        sub="Para fallas que se repiten: pregunta por qué hasta cinco veces, concluye la causa raíz (codificada ISO 14224) y registra acciones correctivas con responsable. Cierra el ciclo Pareto → RCA → acción → verificación."
        action={puedeOperar && <button onClick={() => { setShowForm(!showForm); setError(null); }} style={primaryBtn}><Plus size={16} /> Nuevo RCA</button>} />

      <ErrorBanner onRetry={cargar}>{error}</ErrorBanner>

      <div className="cmms-collapse-mobile" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 16 }}>
        <KPI label="RCA abiertos" value={abiertos} tone={abiertos ? C.amber : C.green} />
        <KPI label="Acciones pendientes" value={pendTotal} tone={pendTotal ? C.amber : C.green} sub="compromisos sin cumplir" />
        <KPI label="Verificados eficaces" value={`${verificados}/${rcas.length}`} tone={C.green} sub="la falla no volvió" />
        <KPI label="Crónicas sin RCA" value={candidatos.length} tone={candidatos.length ? C.red : C.green} sub="≥3 correctivas en 6 meses" />
      </div>

      {/* Candidatos: fallas crónicas detectadas desde las OTs (dato Pareto) */}
      {candidatos.length > 0 && (
        <Card style={{ marginBottom: 16, borderLeft: `4px solid ${C.red}`, background: tint(C.red, 5) }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <Flame size={15} color={C.red} />
            <span style={{ fontWeight: 700, color: C.red, fontSize: 13 }}>
              Fallas crónicas detectadas — cada una amerita un análisis de causa raíz
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {candidatos.map((c) => (
              <div key={c.key} style={{ display: "flex", alignItems: "center", gap: 10, background: C.surface, borderRadius: 8, padding: "8px 12px", flexWrap: "wrap" }}>
                <span style={{ ...archivo, fontWeight: 800, fontSize: 16, color: C.red, minWidth: 34, textAlign: "center" }}>{c.n}×</span>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <span style={{ fontWeight: 600, fontSize: 13, color: C.ink }}>{c.sistema || eqName(c.equipoId) || "Sistema"}</span>
                  <span style={{ fontSize: 11.5, color: C.slate, marginLeft: 8 }}>{embName(c.embarcacionId)}</span>
                  {c.modoTop && <span style={{ fontSize: 11, color: C.steel, marginLeft: 8 }}>modo dominante: {lk(MODOS_FALLA_ISO, c.modoTop)}</span>}
                </div>
                {puedeOperar && (
                  <button onClick={() => iniciarDesdeCandidato(c)} style={{ ...ghostBtn, fontSize: 12, padding: "4px 12px", color: C.red, borderColor: C.red }}>
                    Iniciar RCA →
                  </button>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Form nuevo RCA */}
      {showForm && (
        <Card style={{ marginBottom: 16, background: C.mist }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: C.abyss, marginBottom: 14 }}>Nuevo Análisis de Causa Raíz</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
            <Field label="Embarcación">
              <select value={form.embarcacion_id} onChange={(e) => setForm({ ...form, embarcacion_id: e.target.value, equipo_id: "" })} style={inputStyle()}>
                <option value="">— Sin asignar —</option>
                {embarcaciones.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
              </select>
            </Field>
            <Field label="Equipo">
              <EquipoPicker equipos={form.embarcacion_id ? equipos.filter((e) => e.embarcacion_id === form.embarcacion_id) : equipos}
                value={form.equipo_id} placeholder="Buscar equipo…"
                onChange={(eq) => setForm({ ...form, equipo_id: eq?.id || "", embarcacion_id: eq?.embarcacion_id || form.embarcacion_id })} />
            </Field>
            <Field label="OT de referencia (opcional)">
              <select value={form.ot_id} onChange={(e) => setForm({ ...form, ot_id: e.target.value })} style={inputStyle()}>
                <option value="">— Ninguna —</option>
                {ots.filter((o) => !form.embarcacion_id || o.embarcacion_id === form.embarcacion_id).slice(0, 60).map((o) => (
                  <option key={o.id} value={o.id}>{o.folio} · {o.sistema || "—"}</option>
                ))}
              </select>
            </Field>
            <Field label="Fecha"><input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} style={inputStyle()} /></Field>
            <Field label="Falla / problema a analizar *" span={4}>
              <input value={form.falla} onChange={(e) => setForm({ ...form, falla: e.target.value })} style={inputStyle()}
                placeholder="Ej: Sobrecalentamiento recurrente del motor principal en marea (3 eventos en 2 meses)" autoFocus />
            </Field>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button onClick={crear} style={primaryBtn}>Crear y analizar</button>
            <button onClick={() => { setShowForm(false); setError(null); }} style={ghostBtn}>Cancelar</button>
          </div>
        </Card>
      )}

      {/* Lista de RCAs */}
      {rcas.length === 0 ? (
        <Card><Empty>
          <Microscope size={30} color={C.slate} style={{ marginBottom: 8 }} /><br />
          Sin análisis de causa raíz aún. Cuando una falla se repita, este es el lugar para matarla de raíz.
        </Empty></Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {rcas.map((r) => {
            const meta = estadoMeta(r.estado);
            const pend = accionesPendientes(r);
            const expanded = abierto === r.id;
            const porques = Array.from({ length: 5 }, (_, i) => (Array.isArray(r.porques) ? r.porques[i] : "") || "");
            const acciones = Array.isArray(r.acciones) ? r.acciones : [];
            return (
              <Card key={r.id} style={{ padding: 0, overflow: "hidden" }}>
                {/* Cabecera */}
                <div onClick={() => setAbierto(expanded ? null : r.id)}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", cursor: "pointer", flexWrap: "wrap", borderBottom: expanded ? `1px solid ${C.line}` : "none" }}>
                  {expanded ? <ChevronDown size={17} color={C.slate} /> : <ChevronRight size={17} color={C.slate} />}
                  <div style={{ flex: "1 1 260px", minWidth: 200 }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5, color: C.ink }}>{r.falla}</div>
                    <div style={{ fontSize: 11.5, color: C.slate, marginTop: 2 }}>
                      {embName(r.embarcacion_id)}{eqName(r.equipo_id) ? ` · ${eqName(r.equipo_id)}` : ""} · {r.fecha}
                      {otFolio(r.ot_id) && <span style={{ fontFamily: "'IBM Plex Mono', monospace", marginLeft: 6, color: C.steel }}>{otFolio(r.ot_id)}</span>}
                    </div>
                  </div>
                  {r.causa_codigo && <Pill tone="cyan">{lk(CAUSAS_FALLA_ISO, r.causa_codigo)}</Pill>}
                  {pend > 0 && <Pill tone="yellow">{pend} acción{pend !== 1 ? "es" : ""} pendiente{pend !== 1 ? "s" : ""}</Pill>}
                  <Pill tone={meta.tone}>{meta.label}</Pill>
                  {puedeBorrar && (
                    <button onClick={(e) => { e.stopPropagation(); eliminar(r); }}
                      style={{ background: "none", border: "none", cursor: "pointer", color: C.slate, padding: 2 }}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>

                {/* Editor */}
                {expanded && (
                  <div style={{ padding: 18, background: C.mist, display: "grid", gap: 14 }}>
                    {/* 5 porqués */}
                    <div>
                      <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: C.slate, fontWeight: 700, marginBottom: 8 }}>Cadena de los 5 porqués</div>
                      <div style={{ display: "grid", gap: 6 }}>
                        {porques.map((p, i) => (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ ...archivo, fontWeight: 800, fontSize: 13, color: p ? C.steel : C.line, minWidth: 64 }}>¿Por qué {i + 1}?</span>
                            <input value={p} disabled={!puedeOperar}
                              onChange={(e) => setPorque(r, i, e.target.value)}
                              style={{ ...inputStyle(), flex: 1 }}
                              placeholder={i === 0 ? "¿Por qué ocurrió la falla?" : "¿Y eso por qué?"} />
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Causa raíz */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10 }}>
                      <Field label="Causa raíz ISO 14224">
                        <select value={r.causa_codigo || ""} disabled={!puedeOperar}
                          onChange={(e) => setCampo(r.id, "causa_codigo", e.target.value || null)} style={inputStyle()}>
                          <option value="">— Selecciona —</option>
                          {CAUSAS_FALLA_ISO.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>
                      </Field>
                      <Field label="Conclusión (causa raíz en palabras del análisis)">
                        <input value={r.causa_raiz || ""} disabled={!puedeOperar}
                          onChange={(e) => setCampo(r.id, "causa_raiz", e.target.value)}
                          style={inputStyle()} placeholder="Ej: el plan PM no incluía limpieza del enfriador de agua de mar" />
                      </Field>
                    </div>

                    {/* Acciones correctivas */}
                    <div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                        <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: C.slate, fontWeight: 700 }}>Acciones correctivas</div>
                        {puedeOperar && (
                          <button onClick={() => setCampo(r.id, "acciones", [...acciones, { descripcion: "", responsable: "", fecha_objetivo: "", done: false }])}
                            style={{ ...ghostBtn, fontSize: 11.5, padding: "3px 10px" }}>
                            <Plus size={12} /> Agregar acción
                          </button>
                        )}
                      </div>
                      {acciones.length === 0 ? (
                        <div style={{ fontSize: 12, color: C.slate, fontStyle: "italic" }}>Sin acciones definidas — un RCA sin acciones no cambia nada.</div>
                      ) : (
                        <div style={{ display: "grid", gap: 6 }}>
                          {acciones.map((a, i) => (
                            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, background: C.surface, borderRadius: 8, padding: "7px 10px", opacity: a.done ? 0.65 : 1 }}>
                              <button disabled={!puedeOperar} onClick={() => setAccion(r, i, "done", !a.done)}
                                title={a.done ? "Reabrir" : "Marcar cumplida"}
                                style={{ width: 18, height: 18, borderRadius: 4, border: `1px solid ${a.done ? C.green : C.line}`, background: a.done ? C.green : "#fff", color: "#fff", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0, flexShrink: 0 }}>
                                {a.done && <Check size={11} />}
                              </button>
                              <input value={a.descripcion || ""} disabled={!puedeOperar}
                                onChange={(e) => setAccion(r, i, "descripcion", e.target.value)}
                                style={{ ...inputStyle(), flex: 2, textDecoration: a.done ? "line-through" : "none" }} placeholder="Qué se hará" />
                              <input value={a.responsable || ""} disabled={!puedeOperar}
                                onChange={(e) => setAccion(r, i, "responsable", e.target.value)}
                                style={{ ...inputStyle(), flex: 1 }} placeholder="Responsable" />
                              <input type="date" value={a.fecha_objetivo || ""} disabled={!puedeOperar}
                                onChange={(e) => setAccion(r, i, "fecha_objetivo", e.target.value)}
                                style={inputStyle(130)} />
                              {puedeOperar && (
                                <button onClick={() => setCampo(r.id, "acciones", acciones.filter((_, k) => k !== i))}
                                  style={{ background: "none", border: "none", cursor: "pointer", color: C.slate, padding: 2 }}>
                                  <X size={13} />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Estado + guardar */}
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                      <Field label="Estado del análisis">
                        <select value={r.estado} disabled={!puedeOperar}
                          onChange={(e) => setCampo(r.id, "estado", e.target.value)} style={inputStyle(220)}>
                          {ESTADOS_RCA.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                      </Field>
                      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
                        {guardadoOk === r.id
                          ? <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: C.green }}><Check size={15} /> Guardado</span>
                          : dirty[r.id] && <span style={{ fontSize: 12.5, fontWeight: 600, color: "#7a5b00" }}>Cambios sin guardar</span>}
                        {puedeOperar && (
                          <button onClick={() => guardar(r)} disabled={!dirty[r.id]}
                            style={{ ...primaryBtn, opacity: dirty[r.id] ? 1 : 0.5, cursor: dirty[r.id] ? "pointer" : "default" }}>
                            <Save size={15} /> Guardar RCA
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Card style={{ marginTop: 16, background: C.mist }}>
        <div style={{ fontSize: 12.5, color: C.slate, lineHeight: 1.7 }}>
          <strong style={{ color: C.ink }}>Método:</strong> parte de la falla observada y pregunta <strong>¿por qué?</strong> hasta
          cinco veces — la causa raíz suele aparecer entre el 3° y el 5° porqué (si la respuesta es "una persona se equivocó",
          sigue preguntando: el sistema permitió el error). Codifica la causa con ISO 14224 para que Pareto agregue datos
          comparables, define acciones con responsable y fecha, y marca <strong>Verificado eficaz</strong> solo cuando la falla
          no se repitió. Los candidatos en rojo salen automáticamente de las OTs correctivas (≥3 en 6 meses, mismo equipo).
        </div>
      </Card>
    </div>
  );
}

function KPI({ label, value, tone, sub }) {
  return (
    <Card style={{ padding: 16 }}>
      <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: C.slate, fontWeight: 600 }}>{label}</div>
      <div style={{ ...archivo, fontSize: 26, fontWeight: 800, color: tone || C.steel, lineHeight: 1, marginTop: 6 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: C.slate, marginTop: 6 }}>{sub}</div>}
    </Card>
  );
}
