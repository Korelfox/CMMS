import React, { useEffect, useState, useCallback } from "react";
import { Activity, AlertTriangle, Download } from "lucide-react";
import { useAuth } from "../lib/auth";
import { fetchAll, upsertRow, logActivity } from "../lib/db";
import { buildEquipoTree } from "../lib/equipTree";
import { useArbolColapsable, BotonesColapsar, EquipoNodoLabel, fondoTipo } from "../lib/arbolColapsable";
import { calcCT, catCT } from "../lib/calculos";
import { C, archivo, isAdmin } from "../theme";
import { Card, PageHead, Pill, exportBtn, thStyle, tdStyle, Empty, ErrorBanner, InlineSpinner, FilterBtn, GuiaColapsable } from "../ui";

// Dimensiones del modelo INGEMAN / Parra & Crespo
const DIMS = [
  { key: "frec",  label: "Frecuencia",  desc: "qué tan seguido falla" },
  { key: "prod",  label: "Producción",  desc: "impacto en la captura" },
  { key: "seg",   label: "Seguridad",   desc: "riesgo a la tripulación" },
  { key: "amb",   label: "Ambiente",    desc: "impacto ambiental" },
  { key: "costo", label: "Costo",       desc: "costo de la falla" },
];
const DEFAULT = { frec: 3, prod: 3, seg: 2, amb: 2, costo: 3 };

export default function Criticidad() {
  const { profile } = useAuth();
  const [embarcaciones, setEmbarcaciones] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [crit, setCrit] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filtro, setFiltro] = useState("all");
  const puedeOperar = isAdmin(profile?.rol);  // análisis de criticidad: Jefe Mantención y superiores

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [embs, eqs, cs] = await Promise.all([
        fetchAll("embarcaciones", { order: { col: "codigo", asc: true } }),
        fetchAll("equipos", { order: { col: "id_visible", asc: true } }),
        fetchAll("criticidad"),
      ]);
      setEmbarcaciones(embs); setEquipos(eqs); setCrit(cs);
    } catch (e) { setError("No se pudo cargar la criticidad. " + e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  function getC(equipoId) {
    const found = crit.find((c) => c.equipo_id === equipoId);
    return found || { ...DEFAULT, equipo_id: equipoId };
  }
  function embName(id) { return embarcaciones.find((e) => e.id === id)?.nombre || "—"; }

  async function setScore(equipoId, dim, v) {
    const current = getC(equipoId);
    const next = { ...current, [dim]: v };
    // Optimista
    setCrit((p) => {
      const i = p.findIndex((c) => c.equipo_id === equipoId);
      if (i >= 0) { const copy = [...p]; copy[i] = { ...copy[i], [dim]: v }; return copy; }
      return [...p, { ...next, empresa_id: profile.empresa_id }];
    });
    try {
      await upsertRow("criticidad", profile.empresa_id, {
        equipo_id: equipoId, frec: next.frec, prod: next.prod, seg: next.seg, amb: next.amb, costo: next.costo,
      }, "equipo_id");
      const eq = equipos.find((x) => x.id === equipoId);
      logActivity(profile, "Editar criticidad", `${eq?.id_visible || ""} · ${dim}=${v}`);
    } catch (e) {
      setError("No se pudo guardar: " + e.message);
      cargar();
    }
  }

  const filtrados = buildEquipoTree(filtro === "all" ? equipos : equipos.filter((e) => e.embarcacion_id === filtro));
  const arbol = useArbolColapsable(filtrados);
  const esHoja   = (eq) => !arbol.tieneHijos(eq);
  const evaluado = (eqId) => crit.some((c) => c.equipo_id === eqId); // tiene puntaje cargado

  // ── Rollup jerárquico de criticidad ────────────────────────────
  // Se puntúa en las HOJAS (componentes). Cada padre (sistema/subsistema)
  // hereda el CT MÁXIMO de sus descendientes (peor caso, RCM/ISO 14224) y
  // muestra la distribución Alta/Media/Baja de lo evaluado bajo él.
  const info = new Map(); // id → { hoja, evaluado, ct, alta, media, baja, nEval }
  filtrados.forEach((eq) => {
    if (esHoja(eq)) {
      const ev = evaluado(eq.id);
      const ct = ev ? calcCT(getC(eq.id)) : null;
      const cat = ct == null ? null : catCT(ct)[1];
      info.set(eq.id, { hoja: true, evaluado: ev, ct,
        alta: cat === "Alta" ? 1 : 0, media: cat === "Media" ? 1 : 0, baja: cat === "Baja" ? 1 : 0, nEval: ev ? 1 : 0 });
    } else {
      info.set(eq.id, { hoja: false, evaluado: false, ct: null, alta: 0, media: 0, baja: 0, nEval: 0 });
    }
  });
  [...filtrados].sort((a, b) => b.depth - a.depth).forEach((eq) => {
    if (eq.parent_id && info.has(eq.parent_id)) {
      const p = info.get(eq.parent_id), c = info.get(eq.id);
      p.alta += c.alta; p.media += c.media; p.baja += c.baja; p.nEval += c.nEval;
      if (c.ct != null) p.ct = p.ct == null ? c.ct : Math.max(p.ct, c.ct);
    }
  });

  // KPIs: solo hojas evaluadas, para no contar el "Media fantasma".
  const hojasEval = filtrados.filter((eq) => esHoja(eq) && evaluado(eq.id));
  const altas   = hojasEval.filter((eq) => info.get(eq.id).ct >= 50).length;
  const medias  = hojasEval.filter((eq) => { const ct = info.get(eq.id).ct; return ct >= 20 && ct < 50; }).length;
  const bajas   = hojasEval.filter((eq) => info.get(eq.id).ct < 20).length;
  const promedio = hojasEval.length ? Math.round(hojasEval.reduce((s, eq) => s + info.get(eq.id).ct, 0) / hojasEval.length) : 0;

  function exportar() {
    const filas = [["Equipo", "Embarcación", "F", "P", "S", "A", "C", "CT", "Categoría"],
      ...filtrados.filter(esHoja).map((eq) => {
        const c = getC(eq.id); const ev = evaluado(eq.id); const ct = ev ? calcCT(c) : "";
        return [eq.id_visible, embName(eq.embarcacion_id), ev ? c.frec : "", ev ? c.prod : "", ev ? c.seg : "", ev ? c.amb : "", ev ? c.costo : "", ct, ev ? catCT(ct)[1] : "Sin clasificar"];
      })];
    const csv = filas.map((r) => r.map((c) => { const s = String(c ?? ""); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(";")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "criticidad.csv"; a.click();
  }

  if (loading) return <div><PageHead kicker="Análisis · INGEMAN" title="Criticidad de Equipos" /><Card><InlineSpinner label="Cargando criticidad…" /></Card></div>;

  if (equipos.length === 0) {
    return (
      <div>
        <PageHead kicker="Análisis · INGEMAN" title="Criticidad de Equipos" />
        <Card><Empty>
          <AlertTriangle size={32} color={C.amber} style={{ marginBottom: 10 }} /><br />
          No hay equipos registrados. Carga equipos primero para asignarles criticidad.
        </Empty></Card>
      </div>
    );
  }

  return (
    <div>
      <PageHead kicker="Análisis · Parra & Crespo / INGEMAN" title="Criticidad de Equipos"
        sub="CT = Frecuencia × (Producción + Seguridad + Ambiente + Costo). Cada dimensión 1–5. Define dónde concentrar los recursos."
        action={<button onClick={exportar} style={exportBtn}><Download size={15} /> Exportar</button>} />

      <ErrorBanner onRetry={cargar}>{error}</ErrorBanner>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 16 }}>
        <KPI label="Equipos Críticos" value={altas} tone={altas ? C.red : C.green} sub="CT ≥ 50 · prioridad alta" />
        <KPI label="Criticidad Media" value={medias} tone={C.amber} sub="CT 20–49" />
        <KPI label="Baja Criticidad" value={bajas} tone={C.green} sub="CT < 20" />
        <KPI label="Promedio Flota" value={promedio} tone={catCT(promedio)[0] === "red" ? C.red : catCT(promedio)[0] === "yellow" ? C.amber : C.green} sub={catCT(promedio)[1]} />
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <FilterBtn active={filtro === "all"} onClick={() => setFiltro("all")}>Todas ({equipos.length})</FilterBtn>
        {embarcaciones.map((v) => (
          <FilterBtn key={v.id} active={filtro === v.id} onClick={() => setFiltro(v.id)} color={v.color}>
            {v.nombre} ({equipos.filter((e) => e.embarcacion_id === v.id).length})
          </FilterBtn>
        ))}
      </div>

      <GuiaColapsable titulo="Cómo puntuar las 5 dimensiones (1–5) de forma consistente" icon={Activity}>
        <div style={{ marginBottom: 8 }}>
          Usa la misma vara en toda la flota. Escala <strong>1 = muy bajo</strong> … <strong>5 = muy alto</strong>:
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            {[
              ["Frecuencia", "Cada cuánto falla. 1 = casi nunca · 3 = una vez por temporada · 5 = falla seguido"],
              ["Producción", "Impacto en la captura. 1 = sigue pescando · 3 = opera limitado · 5 = detiene la pesca"],
              ["Seguridad", "Riesgo a la tripulación. 1 = nulo · 3 = riesgo moderado · 5 = pone en peligro vidas"],
              ["Ambiente", "Impacto ambiental. 1 = ninguno · 3 = derrame menor contenible · 5 = contaminación grave"],
              ["Costo", "Costo de la falla. 1 = repuesto menor · 3 = intervención media · 5 = reparación mayor / varada"],
            ].map(([dim, d]) => (
              <tr key={dim}>
                <td style={{ padding: "4px 8px", fontWeight: 700, color: C.abyss, whiteSpace: "nowrap", verticalAlign: "top", borderBottom: `1px solid ${C.foam}` }}>{dim}</td>
                <td style={{ padding: "4px 8px", color: C.slate, borderBottom: `1px solid ${C.foam}` }}>{d}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 8, color: C.slate }}>
          <strong style={{ color: C.abyss }}>CT = Frecuencia × (Producción + Seguridad + Ambiente + Costo).</strong>
          {" "}CT ≥ 50 = crítico (rojo) · 20–49 = medio · &lt; 20 = bajo. Define dónde concentrar recursos.
        </div>
      </GuiaColapsable>

      <BotonesColapsar conHijos={arbol.conHijos} colapsarTodo={arbol.colapsarTodo} />

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1000 }}>
            <thead><tr>
              <th style={thStyle}>Equipo</th>
              {DIMS.map((d) => <th key={d.key} style={{ ...thStyle, textAlign: "center" }} title={d.desc}>{d.label[0]}</th>)}
              <th style={{ ...thStyle, textAlign: "right" }}>CT</th>
              <th style={{ ...thStyle, textAlign: "center" }}>Categoría</th>
            </tr></thead>
            <tbody>
              {filtrados.filter((eq) => arbol.visible(eq)).map((eq) => {
                const i = info.get(eq.id);

                // ── Nodo padre: resumen (CT máximo + distribución) ──
                if (!i.hoja) {
                  return (
                    <tr key={eq.id} style={{ background: fondoTipo(eq) }}>
                      <td style={tdStyle}>
                        <EquipoNodoLabel eq={eq} tieneHijos={arbol.tieneHijos(eq)} colapsado={arbol.estaColapsado(eq)}
                          onToggle={() => arbol.toggle(eq.id)} nSub={arbol.nSubDe(eq)} embName={embName} />
                      </td>
                      <td style={{ ...tdStyle }} colSpan={DIMS.length}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: C.steel, textTransform: "uppercase", letterSpacing: 0.5 }}>Resumen</span>
                          {i.nEval === 0
                            ? <span style={{ fontSize: 12, color: C.slate, fontStyle: "italic" }}>sin componentes evaluados</span>
                            : <>
                                <Pill tone="red">{i.alta} Alta</Pill>
                                <Pill tone="yellow">{i.media} Media</Pill>
                                <Pill tone="green">{i.baja} Baja</Pill>
                              </>}
                        </div>
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 14 }}>
                        {i.ct == null ? <span style={{ color: C.line }}>—</span> : i.ct}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        {i.ct == null ? <span style={{ color: C.line }}>—</span> : <Pill tone={catCT(i.ct)[0]}>{catCT(i.ct)[1]} · máx</Pill>}
                      </td>
                    </tr>);
                }

                // ── Nodo hoja: puntuación editable ──
                const c = getC(eq.id);
                const ev = i.evaluado;
                return (
                  <tr key={eq.id} style={{ background: fondoTipo(eq) }}>
                    <td style={tdStyle}>
                      <EquipoNodoLabel eq={eq} tieneHijos={arbol.tieneHijos(eq)} colapsado={arbol.estaColapsado(eq)}
                        onToggle={() => arbol.toggle(eq.id)} nSub={arbol.nSubDe(eq)} embName={embName} />
                    </td>
                    {DIMS.map((d) => (
                      <td key={d.key} style={{ ...tdStyle, textAlign: "center" }}>
                        <ScoreSelector value={ev ? c[d.key] : null} onChange={(v) => setScore(eq.id, d.key, v)} disabled={!puedeOperar} />
                      </td>
                    ))}
                    <td style={{ ...tdStyle, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 14 }}>
                      {ev ? i.ct : <span style={{ color: C.line }}>—</span>}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      {ev ? <Pill tone={catCT(i.ct)[0]}>{catCT(i.ct)[1]}</Pill> : <span style={{ fontSize: 11, color: C.slate, fontStyle: "italic" }}>Sin clasificar</span>}
                    </td>
                  </tr>);
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card style={{ marginTop: 16, background: C.mist }}>
        <div style={{ fontSize: 12.5, color: C.slate, lineHeight: 1.7 }}>
          <strong style={{ color: C.ink }}>Cómo usarlo:</strong> haz clic en los números 1–5 de cada columna para definir el puntaje de cada dimensión.
          <strong style={{ color: C.ink }}> CT</strong> se recalcula al instante con la fórmula <em>Frecuencia × (Producción + Seguridad + Ambiente + Costo)</em>.
          <strong style={{ color: C.ink }}> F</strong> = frecuencia de falla · <strong style={{ color: C.ink }}>P</strong> = impacto producción ·
          <strong style={{ color: C.ink }}> S</strong> = seguridad · <strong style={{ color: C.ink }}>A</strong> = ambiente · <strong style={{ color: C.ink }}>C</strong> = costo.
          Los equipos <Pill tone="red">Alta</Pill> deben ir primero en el plan preventivo y stock crítico.
        </div>
      </Card>
    </div>
  );
}

function ScoreSelector({ value, onChange, disabled }) {
  return (
    <div style={{ display: "inline-flex", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => {
        const sel = value === n;
        return (
          <button key={n} disabled={disabled} onClick={() => onChange(n)}
            style={{ width: 24, height: 24, borderRadius: 5, border: `1px solid ${sel ? C.steel : C.line}`, background: sel ? C.steel : "#fff", color: sel ? "#fff" : C.slate, fontSize: 11.5, fontWeight: 700, cursor: disabled ? "default" : "pointer", padding: 0 }}>
            {n}
          </button>);
      })}
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
