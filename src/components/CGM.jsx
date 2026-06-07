import React, { useEffect, useState, useCallback } from "react";
import { DollarSign, ChevronDown, ChevronRight, AlertCircle, Save, Check } from "lucide-react";
import { useAuth } from "../lib/auth";
import { fetchAll, upsertRow, logActivity } from "../lib/db";
import { buildEquipoTree } from "../lib/equipTree";
import { useArbolColapsable, BotonesColapsar, EquipoNodoLabel, fondoTipo } from "../lib/arbolColapsable";
import { cgmCalcular as calcular } from "../lib/calculos";
import { C, archivo, clp, isAdmin } from "../theme";
import { Card, PageHead, Pill, primaryBtn, bluInput, FilterBtn, Empty, ErrorBanner, InlineSpinner } from "../ui";

// Valores por defecto LIMPIOS: cero hasta que el usuario ingrese costos.
// Así un equipo solo aporta costo cuando realmente se cargan sus datos.
const DEFAULT_CGM = {
  hh_c: 0, hh_p: 0, c_hh: 0,
  rep: 0, fung: 0,
  hrs_par: 0, val_prod: 0, g_extra: 0,
  val_inv: 0, val_eq: 0, vida: 0,
};
// Fórmula CGM (modelo Pascual) en lib/calculos: Cg = Ci + Cf + Ca + Ai.

export default function CGM() {
  const { profile } = useAuth();
  const [embarcaciones, setEmbarcaciones] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [datos, setDatos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filtro, setFiltro] = useState("all");
  const [abierto, setAbierto] = useState(null);
  const [dirty, setDirty] = useState({});        // equipos con cambios sin guardar
  const [guardadoOk, setGuardadoOk] = useState(null);  // feedback "✓ guardado"
  const [guardando, setGuardando] = useState(null);
  const puedeOperar = isAdmin(profile?.rol);  // editar costos/CGM: Jefe Mantención y superiores

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [embs, eqs, cs] = await Promise.all([
        fetchAll("embarcaciones", { order: { col: "codigo", asc: true } }),
        fetchAll("equipos", { order: { col: "id_visible", asc: true } }),
        fetchAll("cgm"),
      ]);
      setEmbarcaciones(embs); setEquipos(eqs); setDatos(cs);
    } catch (e) { setError("No se pudo cargar el CGM. " + e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  function getCGM(equipoId) {
    const found = datos.find((c) => c.equipo_id === equipoId);
    return found || { ...DEFAULT_CGM, equipo_id: equipoId };
  }
  function embName(id) { return embarcaciones.find((e) => e.id === id)?.nombre || "—"; }

  // Edita el parámetro solo en memoria (no guarda hasta pulsar "Guardar cambios").
  // Así los KPIs y barras muestran el efecto al instante, pero la base solo se
  // actualiza cuando el usuario confirma.
  function setCampo(equipoId, campo, valor) {
    setDatos((p) => {
      const i = p.findIndex((c) => c.equipo_id === equipoId);
      if (i >= 0) { const copy = [...p]; copy[i] = { ...copy[i], [campo]: valor }; return copy; }
      return [...p, { ...DEFAULT_CGM, equipo_id: equipoId, [campo]: valor, empresa_id: profile.empresa_id }];
    });
    setDirty((d) => ({ ...d, [equipoId]: true }));
    if (guardadoOk === equipoId) setGuardadoOk(null);
  }

  // Guarda en la base los parámetros del equipo (INSERT o UPDATE por equipo_id).
  async function guardar(equipoId) {
    const c = getCGM(equipoId);
    setError(null); setGuardando(equipoId);
    try {
      await upsertRow("cgm", profile.empresa_id, {
        equipo_id: equipoId,
        hh_c: c.hh_c, hh_p: c.hh_p, c_hh: c.c_hh,
        rep: c.rep, fung: c.fung,
        hrs_par: c.hrs_par, val_prod: c.val_prod, g_extra: c.g_extra,
        val_inv: c.val_inv, val_eq: c.val_eq, vida: c.vida,
      }, "equipo_id");
      setDirty((d) => { const n = { ...d }; delete n[equipoId]; return n; });
      const eq = equipos.find((e) => e.id === equipoId);
      logActivity(profile, "Guardar CGM", `${eq?.sistema || ""} · ${embName(eq?.embarcacion_id)}`);
      setGuardadoOk(equipoId);
      setTimeout(() => setGuardadoOk((g) => (g === equipoId ? null : g)), 2500);
    } catch (e) { setError("No se pudo guardar: " + e.message); cargar(); }
    finally { setGuardando(null); }
  }

  const filtrados = buildEquipoTree(filtro === "all" ? equipos : equipos.filter((e) => e.embarcacion_id === filtro));
  // Orden jerárquico (igual que Plan Preventivo), sin reordenar por costo.
  const enriquecidos = filtrados.map((eq) => { const c = getCGM(eq.id); return { eq, c, calc: calcular(c) }; });
  const arbol = useArbolColapsable(filtrados);

  // ── Rollup jerárquico ──────────────────────────────────────────
  // Los costos se ingresan en las HOJAS (componentes). Cada nodo padre
  // (sistema/subsistema) muestra la SUMA de sus descendientes con costo.
  const esHoja = (eq) => !arbol.tieneHijos(eq);
  const agg = new Map(); // id → { Ci, Cf, Ca, Ai, total, nData }
  filtrados.forEach((eq) => {
    if (esHoja(eq)) {
      const calc = calcular(getCGM(eq.id));
      const conDato = datos.some((d) => d.equipo_id === eq.id) ? 1 : 0;
      agg.set(eq.id, { ...calc, nData: conDato });
    } else {
      agg.set(eq.id, { Ci: 0, Cf: 0, Ca: 0, Ai: 0, total: 0, nData: 0 });
    }
  });
  // Acumular hijo → padre, del más profundo al más superficial.
  [...filtrados].sort((a, b) => b.depth - a.depth).forEach((eq) => {
    if (eq.parent_id && agg.has(eq.parent_id)) {
      const p = agg.get(eq.parent_id), c = agg.get(eq.id);
      p.Ci += c.Ci; p.Cf += c.Cf; p.Ca += c.Ca; p.Ai += c.Ai; p.total += c.total; p.nData += c.nData;
    }
  });

  // KPIs: solo hojas, para no duplicar al sumar padres.
  const hojas = filtrados.filter(esHoja);
  const totalMes = hojas.reduce((s, eq) => s + agg.get(eq.id).total, 0);
  const totalCi = hojas.reduce((s, eq) => s + agg.get(eq.id).Ci, 0);
  const totalCf = hojas.reduce((s, eq) => s + agg.get(eq.id).Cf, 0);
  const pctFallas = totalMes > 0 ? (totalCf / totalMes) * 100 : 0;
  const masCaro = hojas.reduce((m, eq) => { const t = agg.get(eq.id).total; return (!m || t > m.total ? { eq, total: t } : m); }, null);

  if (loading) return <div><PageHead kicker="Optimización · Pascual" title="Costo Global de Mantención" /><Card><InlineSpinner label="Cargando CGM…" /></Card></div>;

  if (equipos.length === 0) {
    return (
      <div>
        <PageHead kicker="Optimización · Pascual" title="Costo Global de Mantención" />
        <Card><Empty>
          <AlertCircle size={32} color={C.amber} style={{ marginBottom: 10 }} /><br />
          No hay equipos registrados. Carga equipos primero para calcular su costo global.
        </Empty></Card>
      </div>
    );
  }

  return (
    <div>
      <PageHead kicker="Optimización Económica · Pascual / ISO 55000" title="Costo Global de Mantención"
        sub="Cg = Ci + Cf + Ca + Ai. Captura los 4 componentes de costo por equipo y descubre dónde se va el dinero realmente." />

      <ErrorBanner onRetry={cargar}>{error}</ErrorBanner>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 16 }}>
        <KPI label="CGM Total Flota / mes" value={clp(totalMes)} tone={C.gold} sub={`${clp(totalMes * 12)} al año`} />
        <KPI label="Costo Intervenciones" value={clp(totalCi)} sub={`${totalMes > 0 ? Math.round((totalCi / totalMes) * 100) : 0}% del total`} />
        <KPI label="Costo de Fallas" value={clp(totalCf)} tone={pctFallas > 30 ? C.red : C.steel} sub={`${pctFallas.toFixed(0)}% del total · ${pctFallas > 30 ? "alto" : "ok"}`} />
        <KPI label="Equipo más Costoso" value={masCaro && masCaro.total > 0 ? clp(masCaro.total) : "—"} tone={C.red} sub={masCaro && masCaro.total > 0 ? masCaro.eq.sistema : "sin costos aún"} />
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <FilterBtn active={filtro === "all"} onClick={() => setFiltro("all")}>Todas ({equipos.length})</FilterBtn>
        {embarcaciones.map((v) => (
          <FilterBtn key={v.id} active={filtro === v.id} onClick={() => setFiltro(v.id)} color={v.color}>
            {v.nombre} ({equipos.filter((e) => e.embarcacion_id === v.id).length})
          </FilterBtn>
        ))}
      </div>

      <BotonesColapsar conHijos={arbol.conHijos} colapsarTodo={arbol.colapsarTodo} />

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {enriquecidos.filter(({ eq }) => arbol.visible(eq)).map(({ eq, c }) => {
          const a = agg.get(eq.id);
          const hoja = esHoja(eq);
          const expanded = hoja && abierto === eq.id;
          const pct = totalMes > 0 ? (a.total / totalMes) * 100 : 0;
          return (
            <Card key={eq.id} style={{ padding: 0, overflow: "hidden" }}>
              <div onClick={() => hoja && setAbierto(expanded ? null : eq.id)}
                style={{ display: "grid", gridTemplateColumns: "auto 2fr repeat(4, 1fr) 1.2fr auto", gap: 14, padding: "14px 18px", alignItems: "center", cursor: hoja ? "pointer" : "default", background: fondoTipo(eq), borderBottom: expanded ? `1px solid ${C.line}` : "none" }}>
                {hoja ? (expanded ? <ChevronDown size={18} color={C.slate} /> : <ChevronRight size={18} color={C.slate} />) : <span style={{ width: 18 }} />}
                <EquipoNodoLabel eq={eq} tieneHijos={arbol.tieneHijos(eq)} colapsado={arbol.estaColapsado(eq)}
                  onToggle={() => arbol.toggle(eq.id)} nSub={arbol.nSubDe(eq)} embName={embName} />
                <Bar label="Ci" v={a.Ci} max={a.total} color={C.steel} />
                <Bar label="Cf" v={a.Cf} max={a.total} color={C.red} />
                <Bar label="Ca" v={a.Ca} max={a.total} color={C.amber} />
                <Bar label="Ai" v={a.Ai} max={a.total} color={C.purple} />
                <div style={{ textAlign: "right" }}>
                  <div style={{ ...archivo, fontSize: 17, fontWeight: 800, color: a.total > 0 ? C.gold : C.line }}>{clp(a.total)}</div>
                  <div style={{ fontSize: 11, color: C.slate, fontFamily: "'IBM Plex Mono', monospace" }}>
                    {hoja ? `${pct.toFixed(1)}% · /mes` : `∑ ${a.nData} con costo`}
                  </div>
                </div>
                {hoja
                  ? <Pill tone={pct > 25 ? "red" : pct > 15 ? "yellow" : "green"}>{pct > 25 ? "Alto" : pct > 15 ? "Medio" : "Bajo"}</Pill>
                  : <Pill tone="steel">Resumen</Pill>}
              </div>

              {expanded && (
                <div style={{ padding: 18, background: C.mist }}>
                  <Section title="Intervenciones (mensual)">
                    <CellEdit label="HH Correctivo (h/mes)" value={c.hh_c} disabled={!puedeOperar} onChange={(v) => setCampo(eq.id, "hh_c", v)} />
                    <CellEdit label="HH Preventivo (h/mes)" value={c.hh_p} disabled={!puedeOperar} onChange={(v) => setCampo(eq.id, "hh_p", v)} />
                    <CellEdit label="Costo por HH ($)" value={c.c_hh} disabled={!puedeOperar} onChange={(v) => setCampo(eq.id, "c_hh", v)} step={1000} />
                  </Section>
                  <Section title="Materiales (mensual)">
                    <CellEdit label="Repuestos ($)" value={c.rep} disabled={!puedeOperar} onChange={(v) => setCampo(eq.id, "rep", v)} step={1000} />
                    <CellEdit label="Fungibles ($)" value={c.fung} disabled={!puedeOperar} onChange={(v) => setCampo(eq.id, "fung", v)} step={1000} />
                  </Section>
                  <Section title="Costo de Paro (mensual)">
                    <CellEdit label="Horas de paro (h/mes)" value={c.hrs_par} disabled={!puedeOperar} onChange={(v) => setCampo(eq.id, "hrs_par", v)} />
                    <CellEdit label="Lucro cesante ($/h)" value={c.val_prod} disabled={!puedeOperar} onChange={(v) => setCampo(eq.id, "val_prod", v)} step={1000} />
                    <CellEdit label="Gastos extras ($)" value={c.g_extra} disabled={!puedeOperar} onChange={(v) => setCampo(eq.id, "g_extra", v)} step={1000} />
                  </Section>
                  <Section title="Activos">
                    <CellEdit label="Inventario inmovilizado ($)" value={c.val_inv} disabled={!puedeOperar} onChange={(v) => setCampo(eq.id, "val_inv", v)} step={1000} />
                    <CellEdit label="Valor del equipo ($)" value={c.val_eq} disabled={!puedeOperar} onChange={(v) => setCampo(eq.id, "val_eq", v)} step={10000} />
                    <CellEdit label="Vida útil (años)" value={c.vida} disabled={!puedeOperar} onChange={(v) => setCampo(eq.id, "vida", v)} />
                  </Section>

                  <div style={{ marginTop: 14, padding: 12, background: C.surface, border: `1px solid ${C.line}`, borderRadius: 9 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12 }}>
                      <ResVal label="Ci · Intervenciones" v={a.Ci} color={C.steel} />
                      <ResVal label="Cf · Fallas" v={a.Cf} color={C.red} />
                      <ResVal label="Ca · Almacén" v={a.Ca} color={C.amber} />
                      <ResVal label="Ai · Amortización" v={a.Ai} color={C.purple} />
                      <ResVal label="Total / mes" v={a.total} color={C.gold} big />
                    </div>
                  </div>

                  {puedeOperar && (
                    <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12 }}>
                      {guardadoOk === eq.id
                        ? <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: C.green }}><Check size={15} /> Cambios guardados</span>
                        : dirty[eq.id] && <span style={{ fontSize: 12.5, fontWeight: 600, color: "#7a5b00" }}>Tienes cambios sin guardar</span>}
                      <button onClick={() => guardar(eq.id)} disabled={!dirty[eq.id] || guardando === eq.id}
                        style={{ ...primaryBtn, opacity: dirty[eq.id] && guardando !== eq.id ? 1 : 0.5, cursor: dirty[eq.id] && guardando !== eq.id ? "pointer" : "default" }}>
                        <Save size={15} /> {guardando === eq.id ? "Guardando…" : "Guardar cambios"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </Card>);
        })}
      </div>

      <Card style={{ marginTop: 16, background: C.mist }}>
        <div style={{ fontSize: 12.5, color: C.slate, lineHeight: 1.7 }}>
          <strong style={{ color: C.ink }}>Modelo Pascual:</strong>{" "}
          <strong>Ci</strong> = mano de obra + repuestos + fungibles ·{" "}
          <strong>Cf</strong> = horas de paro × lucro cesante + gastos extra ·{" "}
          <strong>Ca</strong> = inventario × 20% ÷ 12 (costo de capital sobre inventario inmovilizado) ·{" "}
          <strong>Ai</strong> = valor del equipo ÷ (vida × 12).{" "}
          Si Cf supera el 30% del total, el equipo está sufriendo demasiadas fallas no controladas y conviene revisar su plan preventivo.
        </div>
      </Card>
    </div>
  );
}

function Bar({ label, v, max, color }) {
  const w = max > 0 ? Math.min(100, (v / max) * 100) : 0;
  return (
    <div>
      <div style={{ fontSize: 10, letterSpacing: 0.5, color: C.slate, fontWeight: 600, textTransform: "uppercase" }}>{label}</div>
      <div style={{ height: 6, background: C.foam, borderRadius: 4, marginTop: 4, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${w}%`, background: color }} />
      </div>
      <div style={{ fontSize: 10.5, color: C.slate, marginTop: 2, fontFamily: "'IBM Plex Mono', monospace" }}>{clp(v)}</div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: C.slate, fontWeight: 700, marginBottom: 8 }}>{title}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>{children}</div>
    </div>
  );
}

function CellEdit({ label, value, disabled, onChange, step = 1 }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: C.slate, marginBottom: 4 }}>{label}</div>
      <input type="number" step={step} value={value || 0} disabled={disabled}
        onChange={(e) => onChange(+e.target.value)} style={bluInput} />
    </div>
  );
}

function ResVal({ label, v, color, big }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, letterSpacing: 0.5, color: C.slate, fontWeight: 600, textTransform: "uppercase" }}>{label}</div>
      <div style={{ ...archivo, fontSize: big ? 18 : 14, fontWeight: 800, color, marginTop: 4 }}>{clp(v)}</div>
    </div>
  );
}

function KPI({ label, value, tone, sub }) {
  return (
    <Card style={{ padding: 16 }}>
      <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: C.slate, fontWeight: 600 }}>{label}</div>
      <div style={{ ...archivo, fontSize: 22, fontWeight: 800, color: tone || C.steel, lineHeight: 1.1, marginTop: 6 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: C.slate, marginTop: 6 }}>{sub}</div>}
    </Card>
  );
}
