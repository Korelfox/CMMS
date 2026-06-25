import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Waves, Plus, ChevronDown, ChevronRight, History, AlertCircle, CheckCircle2 } from "lucide-react";
import { useAuth } from "../lib/auth";
import { fetchAll, insertRow, logActivity } from "../lib/db";
import { TIPOS_PDM, PARAMETROS_PDM, evaluarMedicion, seriesPdM } from "../lib/pdm";
import { C, num, canOperate, tint, lk } from "../theme";
import {
  Card, PageHead, Pill, FilterBtn, primaryBtn, ghostBtn, inputStyle,
  thStyle, tdStyle, Field, Empty, ErrorBanner, InlineSpinner, GuiaColapsable,
} from "../ui";
import EquipoPicker from "./EquipoPicker";
import ComboInput from "./ComboInput";
import { hoyLocal } from "../lib/fechas";

const HOY = () => hoyLocal();
const blank = () => ({ equipo_id: "", tipo: "aceite", parametro: "", valor: "", unidad: "", limite_alerta: "", limite_critico: "", fecha: HOY(), nota: "" });

export default function Pdm({ navParams }) {
  const { profile } = useAuth();
  const [embarcaciones, setEmbarcaciones] = useState([]);
  const [equipos, setEquipos]     = useState([]);
  const [mediciones, setMediciones] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [filtro, setFiltro]       = useState("all");
  const [tipoFiltro, setTipoFiltro] = useState("all");
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm]           = useState(blank());
  const [histAbierta, setHistAbierta] = useState(null);  // key de serie expandida
  const puedeOperar = canOperate(profile?.rol);

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [em, eq, med] = await Promise.all([
        fetchAll("embarcaciones", { order: { col: "codigo", asc: true } }),
        fetchAll("equipos",       { order: { col: "id_visible", asc: true } }),
        fetchAll("mediciones_pdm", { order: { col: "fecha", asc: false } }),
      ]);
      setEmbarcaciones(em); setEquipos(eq); setMediciones(med);
    } catch (e) { setError("No se pudieron cargar las mediciones. " + e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    if (navParams?.embFiltro) setFiltro(navParams.embFiltro);
    if (navParams?.equipoId) setForm((f) => ({ ...f, equipo_id: navParams.equipoId }));
  }, [navParams?.embFiltro, navParams?.equipoId]);

  const eqDe = useCallback((id) => equipos.find((e) => e.id === id), [equipos]);

  // Series (equipo+tipo+parámetro) → la [0] es la última medición.
  const series = useMemo(() => {
    const todas = [...seriesPdM(mediciones).entries()].map(([key, lista]) => {
      const ult = lista[0];
      const eq = eqDe(ult.equipo_id);
      const estado = evaluarMedicion(ult.valor, ult.limite_alerta, ult.limite_critico);
      const prev = lista[1];
      const delta = prev ? Number(ult.valor) - Number(prev.valor) : null;
      return { key, lista, ult, eq, estado, delta };
    });
    return todas
      .filter((s) => filtro === "all" || s.eq?.embarcacion_id === filtro)
      .filter((s) => tipoFiltro === "all" || s.ult.tipo === tipoFiltro)
      .sort((a, b) => {
        const orden = { critico: 0, alerta: 1, ok: 2, sin_limites: 3 };
        return (orden[a.estado.key] - orden[b.estado.key]) || (new Date(b.ult.fecha) - new Date(a.ult.fecha));
      });
  }, [mediciones, filtro, tipoFiltro, eqDe]);

  useEffect(() => {
    if (!navParams?.equipoId) return;
    const match = series.find((s) => s.ult.equipo_id === navParams.equipoId);
    if (match) setHistAbierta(match.key);
  }, [navParams?.equipoId, series]);

  const kpis = useMemo(() => ({
    total:   series.length,
    alerta:  series.filter((s) => s.estado.key === "alerta").length,
    critico: series.filter((s) => s.estado.key === "critico").length,
  }), [series]);

  // Al escribir el parámetro: si coincide con uno sugerido (o con una serie ya
  // existente del mismo equipo), precarga unidad y límites.
  function onParametro(v) {
    setForm((f) => {
      const nuevo = { ...f, parametro: v };
      const previa = mediciones.find((m) => m.equipo_id === f.equipo_id && m.tipo === f.tipo && m.parametro === v);
      const sugerido = (PARAMETROS_PDM[f.tipo] || []).find(([n]) => n === v);
      if (previa) {
        nuevo.unidad = previa.unidad || nuevo.unidad;
        nuevo.limite_alerta = previa.limite_alerta ?? nuevo.limite_alerta;
        nuevo.limite_critico = previa.limite_critico ?? nuevo.limite_critico;
      } else if (sugerido) {
        const [, unidad, alerta, critico] = sugerido;
        if (!nuevo.unidad) nuevo.unidad = unidad;
        if (nuevo.limite_alerta === "") nuevo.limite_alerta = alerta ?? "";
        if (nuevo.limite_critico === "") nuevo.limite_critico = critico ?? "";
      }
      return nuevo;
    });
  }

  async function registrar() {
    if (!form.equipo_id || !form.parametro.trim() || form.valor === "") {
      setError("Indica al menos el equipo, el parámetro y el valor medido."); return;
    }
    try {
      const row = await insertRow("mediciones_pdm", profile.empresa_id, {
        equipo_id: form.equipo_id, tipo: form.tipo, parametro: form.parametro.trim(),
        valor: Number(form.valor), unidad: form.unidad.trim() || null,
        limite_alerta: form.limite_alerta === "" ? null : Number(form.limite_alerta),
        limite_critico: form.limite_critico === "" ? null : Number(form.limite_critico),
        fecha: form.fecha, nota: form.nota.trim() || null,
        usuario_nombre: profile.nombre || "",
      });
      setMediciones((p) => [row, ...p]);
      const estado = evaluarMedicion(row.valor, row.limite_alerta, row.limite_critico);
      logActivity(profile, "Registrar medición PdM", `${eqDe(form.equipo_id)?.id_visible} · ${form.parametro}: ${form.valor} ${form.unidad} (${estado.label})`);
      setForm((f) => ({ ...blank(), equipo_id: f.equipo_id, tipo: f.tipo, fecha: f.fecha })); // listo para la siguiente del mismo equipo
      setError(null);
    } catch (e) { setError("No se pudo registrar la medición: " + e.message); }
  }

  if (loading) return <div><PageHead kicker="Análisis · Predictivo" title="Predictivo (PdM)" /><Card><InlineSpinner label="Cargando mediciones…" /></Card></div>;

  return (
    <div>
      <PageHead kicker="Análisis · Mantenimiento por Condición" title="Predictivo (PdM)"
        sub="Resultados de análisis de aceite, vibración y termografía con límites de alerta/crítico. La condición manda: una tendencia que cruza el límite gatilla intervención antes de la falla."
        action={puedeOperar && <button onClick={() => { setShowForm(!showForm); setError(null); }} style={primaryBtn}><Plus size={16} /> Registrar medición</button>} />

      <ErrorBanner onRetry={cargar}>{error}</ErrorBanner>

      {/* KPIs */}
      <div className="cmms-collapse-mobile" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 16 }}>
        {[
          ["Series monitoreadas", kpis.total, C.steel, Waves],
          ["En alerta", kpis.alerta, kpis.alerta ? C.amber : C.green, AlertCircle],
          ["En crítico", kpis.critico, kpis.critico ? C.red : C.green, kpis.critico ? AlertCircle : CheckCircle2],
        ].map(([lbl, val, tone, Icon]) => (
          <Card key={lbl} style={{ padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 10.5, letterSpacing: 1.1, textTransform: "uppercase", color: C.slate, fontWeight: 700 }}>{lbl}</div>
              <div style={{ fontSize: 25, fontWeight: 800, color: tone, marginTop: 6 }}>{val}</div>
            </div>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: tint(tone, 12), display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon size={19} color={tone} />
            </div>
          </Card>
        ))}
      </div>

      {/* Formulario */}
      {showForm && (
        <Card style={{ marginBottom: 16, background: C.mist }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: C.abyss, marginBottom: 14 }}>Nueva medición</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
            <Field label="Equipo / componente" span={2}>
              <EquipoPicker equipos={equipos} value={form.equipo_id}
                onChange={(eq) => setForm({ ...form, equipo_id: eq?.id || "" })} />
            </Field>
            <Field label="Tipo de inspección">
              <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value, parametro: "", unidad: "", limite_alerta: "", limite_critico: "" })} style={inputStyle()}>
                {TIPOS_PDM.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </Field>
            <Field label="Fecha"><input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} style={inputStyle()} /></Field>

            <Field label="Parámetro (con límites sugeridos)" span={2}>
              <ComboInput value={form.parametro} onChange={onParametro}
                options={(PARAMETROS_PDM[form.tipo] || []).map(([n]) => n)}
                placeholder="Hierro (Fe), Velocidad RMS, Temperatura…" />
            </Field>
            <Field label="Valor medido"><input type="number" step="any" value={form.valor} onFocus={(e) => e.target.select()} onChange={(e) => setForm({ ...form, valor: e.target.value })} style={inputStyle()} /></Field>
            <Field label="Unidad"><input value={form.unidad} onChange={(e) => setForm({ ...form, unidad: e.target.value })} style={inputStyle()} placeholder="ppm, mm/s, °C" /></Field>

            <Field label="Límite alerta (amarillo)"><input type="number" step="any" value={form.limite_alerta} onFocus={(e) => e.target.select()} onChange={(e) => setForm({ ...form, limite_alerta: e.target.value })} style={inputStyle()} /></Field>
            <Field label="Límite crítico (rojo)"><input type="number" step="any" value={form.limite_critico} onFocus={(e) => e.target.select()} onChange={(e) => setForm({ ...form, limite_critico: e.target.value })} style={inputStyle()} /></Field>
            <Field label="Nota (laboratorio, punto de medición…)" span={2}>
              <input value={form.nota} onChange={(e) => setForm({ ...form, nota: e.target.value })} style={inputStyle()} placeholder="Muestra N° / punto de medición / observación" />
            </Field>
          </div>
          {form.valor !== "" && (
            <div style={{ marginTop: 10 }}>
              {(() => { const ev = evaluarMedicion(form.valor, form.limite_alerta === "" ? null : form.limite_alerta, form.limite_critico === "" ? null : form.limite_critico);
                return <Pill tone={ev.tone}>Resultado: {ev.label}</Pill>; })()}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button onClick={registrar} style={primaryBtn}>Guardar medición</button>
            <button onClick={() => setShowForm(false)} style={ghostBtn}>Cerrar</button>
          </div>
        </Card>
      )}

      {/* Filtros */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <FilterBtn active={filtro === "all"} onClick={() => setFiltro("all")}>Toda la flota</FilterBtn>
        {embarcaciones.map((v) => (
          <FilterBtn key={v.id} active={filtro === v.id} onClick={() => setFiltro(v.id)} color={v.color}>{v.nombre}</FilterBtn>
        ))}
        <div style={{ width: 1, alignSelf: "stretch", background: C.line, margin: "0 2px" }} />
        <FilterBtn active={tipoFiltro === "all"} onClick={() => setTipoFiltro("all")}>Todos los tipos</FilterBtn>
        {TIPOS_PDM.map((t) => (
          <FilterBtn key={t.value} active={tipoFiltro === t.value} onClick={() => setTipoFiltro(t.value)}>{t.label}</FilterBtn>
        ))}
      </div>

      {series.length === 0 ? (
        <Card><Empty>
          <Waves size={30} color={C.line} style={{ marginBottom: 10 }} /><br />
          Aún no hay mediciones para este filtro. Registra el primer análisis de aceite, vibración o termografía con "Registrar medición".
        </Empty></Card>
      ) : (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1020 }}>
              <thead><tr>
                <th style={thStyle}>Equipo</th>
                <th style={thStyle}>Tipo</th>
                <th style={thStyle}>Parámetro</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Última medición</th>
                <th style={{ ...thStyle, textAlign: "right" }} title="Variación respecto a la medición anterior">Δ</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Límites (A / C)</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Estado</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Historial</th>
              </tr></thead>
              <tbody>
                {series.map((s) => {
                  const abierta = histAbierta === s.key;
                  return ([
                    <tr key={s.key}>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 700, color: C.abyss, fontSize: 13 }}>{s.eq?.sistema || "—"}</div>
                        <div style={{ fontSize: 11, color: C.slate, fontFamily: "'IBM Plex Mono', monospace" }}>{s.eq?.id_visible}</div>
                      </td>
                      <td style={tdStyle}>{lk(TIPOS_PDM, s.ult.tipo)}</td>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>{s.ult.parametro}</td>
                      <td style={{ ...tdStyle, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700 }}>
                        {num(s.ult.valor, 2)} {s.ult.unidad || ""}
                        <div style={{ fontSize: 10.5, color: C.slate, fontWeight: 400 }}>{new Date(s.ult.fecha + "T00:00:00").toLocaleDateString("es-CL")}</div>
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", color: s.delta == null ? C.line : s.delta > 0 ? C.red : C.green }}>
                        {s.delta == null ? "—" : `${s.delta > 0 ? "▲" : s.delta < 0 ? "▼" : "="} ${num(Math.abs(s.delta), 2)}`}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", fontSize: 12, fontFamily: "'IBM Plex Mono', monospace", color: C.slate }}>
                        {s.ult.limite_alerta != null ? num(s.ult.limite_alerta, 1) : "—"} / {s.ult.limite_critico != null ? num(s.ult.limite_critico, 1) : "—"}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "center" }}><Pill tone={s.estado.tone}>{s.estado.label}</Pill></td>
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        <button onClick={() => setHistAbierta(abierta ? null : s.key)}
                          style={{ background: abierta ? C.steel : "none", border: `1px solid ${abierta ? C.steel : C.line}`, borderRadius: 6, cursor: "pointer", color: abierta ? "#fff" : C.steel, padding: "3px 8px", display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <History size={13} /> {s.lista.length} {abierta ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        </button>
                      </td>
                    </tr>,
                    abierta && (
                      <tr key={s.key + "-h"}>
                        <td colSpan={8} style={{ padding: "10px 18px 14px", background: tint(C.steel, 6), borderBottom: `1px solid ${C.line}` }}>
                          <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead><tr>
                              {["Fecha", "Valor", "Estado", "Registrada por", "Nota"].map((h) => (
                                <th key={h} style={{ textAlign: "left", padding: "4px 10px", fontSize: 10.5, textTransform: "uppercase", color: C.slate, letterSpacing: 0.4 }}>{h}</th>
                              ))}
                            </tr></thead>
                            <tbody>
                              {s.lista.slice(0, 15).map((m) => {
                                const ev = evaluarMedicion(m.valor, m.limite_alerta, m.limite_critico);
                                return (
                                  <tr key={m.id}>
                                    <td style={{ padding: "4px 10px", fontSize: 12 }}>{new Date(m.fecha + "T00:00:00").toLocaleDateString("es-CL")}</td>
                                    <td style={{ padding: "4px 10px", fontSize: 12, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700 }}>{num(m.valor, 2)} {m.unidad || ""}</td>
                                    <td style={{ padding: "4px 10px" }}><Pill tone={ev.tone}>{ev.label}</Pill></td>
                                    <td style={{ padding: "4px 10px", fontSize: 12 }}>{m.usuario_nombre || "—"}</td>
                                    <td style={{ padding: "4px 10px", fontSize: 12, color: C.slate }}>{m.nota || ""}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    ),
                  ]);
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <GuiaColapsable titulo="¿Cómo usar el predictivo?" icon={Waves}>
        <ul style={{ margin: 0, paddingLeft: 18, color: C.slate }}>
          <li><strong>Análisis de aceite</strong>: registra los resultados del laboratorio (Fe, Cu, Si, agua, viscosidad). Hierro subiendo = desgaste interno; silicio = entrada de polvo/sello roto.</li>
          <li><strong>Vibración</strong>: velocidad RMS según ISO 10816 (límites sugeridos clase III). Subidas sostenidas = desalineación, rodamientos, desbalance.</li>
          <li><strong>Termografía</strong>: ΔT en conexiones eléctricas y descansos. ΔT &gt; 25 °C entre fases = conexión deficiente.</li>
          <li>El semáforo usa los <strong>límites que tú defines</strong> (sugeridos al elegir el parámetro; ajústalos al manual del fabricante). <strong>Crítico</strong> → genera una OT predictiva.</li>
        </ul>
      </GuiaColapsable>
    </div>
  );
}
