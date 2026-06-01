import React, { useEffect, useState, useCallback } from "react";
import { DollarSign, ChevronDown, ChevronRight, AlertCircle, Save, Check } from "lucide-react";
import { useAuth } from "../lib/auth";
import { fetchAll, upsertRow, logActivity } from "../lib/db";
import { C, archivo, clp, isAdmin } from "../theme";
import { Card, PageHead, Pill, primaryBtn, bluInput, FilterBtn, Empty, ErrorBanner, InlineSpinner } from "../ui";

// Valores por defecto (mismos que el schema)
const DEFAULT_CGM = {
  hh_c: 4, hh_p: 3, c_hh: 12000,
  rep: 25000, fung: 4000,
  hrs_par: 4, val_prod: 40000, g_extra: 5000,
  val_inv: 25000, val_eq: 600000, vida: 15,
};
// Tasa anual de costo de capital sobre inventario (Pascual)
const TASA_INV = 0.20;

// Fórmulas mensuales:
//   Ci = (hh_c + hh_p) × c_hh + rep + fung           [intervenciones]
//   Cf = hrs_par × val_prod + g_extra                [fallas / lucro cesante]
//   Ca = val_inv × tasa / 12                         [almacenamiento]
//   Ai = val_eq / (vida × 12)                        [amortización]
//   Cg = Ci + Cf + Ca + Ai
function calcular(c) {
  const Ci = ((c.hh_c || 0) + (c.hh_p || 0)) * (c.c_hh || 0) + (c.rep || 0) + (c.fung || 0);
  const Cf = (c.hrs_par || 0) * (c.val_prod || 0) + (c.g_extra || 0);
  const Ca = ((c.val_inv || 0) * TASA_INV) / 12;
  const Ai = (c.val_eq || 0) / Math.max(1, (c.vida || 1) * 12);
  return { Ci, Cf, Ca, Ai, total: Ci + Cf + Ca + Ai };
}

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

  const filtrados = filtro === "all" ? equipos : equipos.filter((e) => e.embarcacion_id === filtro);
  const enriquecidos = filtrados.map((eq) => { const c = getCGM(eq.id); return { eq, c, calc: calcular(c) }; })
    .sort((a, b) => b.calc.total - a.calc.total);

  const totalMes = enriquecidos.reduce((s, x) => s + x.calc.total, 0);
  const totalCi = enriquecidos.reduce((s, x) => s + x.calc.Ci, 0);
  const totalCf = enriquecidos.reduce((s, x) => s + x.calc.Cf, 0);
  const pctFallas = totalMes > 0 ? (totalCf / totalMes) * 100 : 0;
  const masCaro = enriquecidos[0];

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
        <KPI label="Equipo más Costoso" value={masCaro ? clp(masCaro.calc.total) : "—"} tone={C.red} sub={masCaro?.eq?.sistema || ""} />
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <FilterBtn active={filtro === "all"} onClick={() => setFiltro("all")}>Todas ({equipos.length})</FilterBtn>
        {embarcaciones.map((v) => (
          <FilterBtn key={v.id} active={filtro === v.id} onClick={() => setFiltro(v.id)} color={v.color}>
            {v.nombre} ({equipos.filter((e) => e.embarcacion_id === v.id).length})
          </FilterBtn>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {enriquecidos.map(({ eq, c, calc }) => {
          const expanded = abierto === eq.id;
          const pct = totalMes > 0 ? (calc.total / totalMes) * 100 : 0;
          return (
            <Card key={eq.id} style={{ padding: 0, overflow: "hidden" }}>
              <div onClick={() => setAbierto(expanded ? null : eq.id)}
                style={{ display: "grid", gridTemplateColumns: "auto 2fr repeat(4, 1fr) 1.2fr auto", gap: 14, padding: "14px 18px", alignItems: "center", cursor: "pointer", borderBottom: expanded ? `1px solid ${C.line}` : "none" }}>
                {expanded ? <ChevronDown size={18} color={C.slate} /> : <ChevronRight size={18} color={C.slate} />}
                <div>
                  <div style={{ fontWeight: 700, color: C.abyss }}>{eq.sistema}</div>
                  <div style={{ fontSize: 11.5, color: C.slate, fontFamily: "'IBM Plex Mono', monospace" }}>{embName(eq.embarcacion_id)} · {eq.id_visible}</div>
                </div>
                <Bar label="Ci" v={calc.Ci} max={calc.total} color={C.steel} />
                <Bar label="Cf" v={calc.Cf} max={calc.total} color={C.red} />
                <Bar label="Ca" v={calc.Ca} max={calc.total} color={C.amber} />
                <Bar label="Ai" v={calc.Ai} max={calc.total} color={C.purple} />
                <div style={{ textAlign: "right" }}>
                  <div style={{ ...archivo, fontSize: 17, fontWeight: 800, color: C.gold }}>{clp(calc.total)}</div>
                  <div style={{ fontSize: 11, color: C.slate, fontFamily: "'IBM Plex Mono', monospace" }}>{pct.toFixed(1)}% · /mes</div>
                </div>
                <Pill tone={pct > 25 ? "red" : pct > 15 ? "yellow" : "green"}>{pct > 25 ? "Alto" : pct > 15 ? "Medio" : "Bajo"}</Pill>
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

                  <div style={{ marginTop: 14, padding: 12, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 9 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12 }}>
                      <ResVal label="Ci · Intervenciones" v={calc.Ci} color={C.steel} />
                      <ResVal label="Cf · Fallas" v={calc.Cf} color={C.red} />
                      <ResVal label="Ca · Almacén" v={calc.Ca} color={C.amber} />
                      <ResVal label="Ai · Amortización" v={calc.Ai} color={C.purple} />
                      <ResVal label="Total / mes" v={calc.total} color={C.gold} big />
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
