import React, { useEffect, useState, useCallback } from "react";
import { Activity, AlertTriangle, Download } from "lucide-react";
import { useAuth } from "../lib/auth";
import { fetchAll, upsertRow, logActivity } from "../lib/db";
import { C, archivo, canOperate } from "../theme";
import { Card, PageHead, Pill, exportBtn, thStyle, tdStyle, Empty, ErrorBanner, InlineSpinner, FilterBtn } from "../ui";

// Dimensiones del modelo INGEMAN / Parra & Crespo
const DIMS = [
  { key: "frec",  label: "Frecuencia",  desc: "qué tan seguido falla" },
  { key: "prod",  label: "Producción",  desc: "impacto en la captura" },
  { key: "seg",   label: "Seguridad",   desc: "riesgo a la tripulación" },
  { key: "amb",   label: "Ambiente",    desc: "impacto ambiental" },
  { key: "costo", label: "Costo",       desc: "costo de la falla" },
];
const DEFAULT = { frec: 3, prod: 3, seg: 2, amb: 2, costo: 3 };
const calcCT = (c) => (c.frec || 0) * ((c.prod || 0) + (c.seg || 0) + (c.amb || 0) + (c.costo || 0));
const catCT = (ct) => ct >= 50 ? ["red", "Alta"] : ct >= 20 ? ["yellow", "Media"] : ["green", "Baja"];

export default function Criticidad() {
  const { profile } = useAuth();
  const [embarcaciones, setEmbarcaciones] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [crit, setCrit] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filtro, setFiltro] = useState("all");
  const puedeOperar = canOperate(profile?.rol);

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

  const filtrados = filtro === "all" ? equipos : equipos.filter((e) => e.embarcacion_id === filtro);
  const lista = filtrados.map((eq) => { const c = getC(eq.id); return { eq, c, ct: calcCT(c) }; })
    .sort((a, b) => b.ct - a.ct);

  const altas = lista.filter((x) => x.ct >= 50).length;
  const medias = lista.filter((x) => x.ct >= 20 && x.ct < 50).length;
  const bajas = lista.filter((x) => x.ct < 20).length;
  const promedio = lista.length ? Math.round(lista.reduce((s, x) => s + x.ct, 0) / lista.length) : 0;

  function exportar() {
    const filas = [["Equipo", "Embarcación", "F", "P", "S", "A", "C", "CT", "Categoría"],
      ...lista.map(({ eq, c, ct }) => [eq.id_visible, embName(eq.embarcacion_id), c.frec, c.prod, c.seg, c.amb, c.costo, ct, catCT(ct)[1]])];
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
              {lista.map(({ eq, c, ct }) => {
                const [tone, label] = catCT(ct);
                return (
                  <tr key={eq.id}>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 600 }}>{eq.sistema}</div>
                      <div style={{ fontSize: 11, color: C.slate }}>{embName(eq.embarcacion_id)} · <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{eq.id_visible}</span></div>
                    </td>
                    {DIMS.map((d) => (
                      <td key={d.key} style={{ ...tdStyle, textAlign: "center" }}>
                        <ScoreSelector value={c[d.key] || DEFAULT[d.key]} onChange={(v) => setScore(eq.id, d.key, v)} disabled={!puedeOperar} />
                      </td>
                    ))}
                    <td style={{ ...tdStyle, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 14 }}>{ct}</td>
                    <td style={{ ...tdStyle, textAlign: "center" }}><Pill tone={tone}>{label}</Pill></td>
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
