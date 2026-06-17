import React, { useEffect, useState } from "react";
import { TrendingUp, ChevronDown, ChevronRight, AlertCircle, Save, Check } from "lucide-react";
import { useAuth } from "../lib/auth";
import { upsertRow, logActivity } from "../lib/db";
import { useFleetData } from "../hooks/useFleetData";
import { buildEquipoTree } from "../lib/equipTree";
import { useArbolColapsable, BotonesColapsar, EquipoNodoLabel, fondoTipo } from "../lib/arbolColapsable";
import { calcMTBF, calcTsOpt, decidir, muestrasTBF, ajustarWeibull } from "../lib/calculos";
import { C, archivo, num, isAdmin } from "../theme";
import { Card, PageHead, Pill, primaryBtn, bluInput, inputStyle, FilterBtn, Empty, ErrorBanner, InlineSpinner } from "../ui";

// Valores iniciales sugeridos en el editor (β típico de degradación). El análisis
// solo se considera "real" cuando el componente tiene una fila guardada en weibull.
const DEFAULT_W = { beta: 2.0, eta: 1000, gamma: 0, cf: 50000, ci: 12000, notas: "", unidad: "h" };

// Prioridad de urgencia de las decisiones (mayor = más urgente) para el rollup.
const DECISION_RANK = {
  "Reemplazo": 5, "Overhaul": 4, "Inspección": 3, "PM Preventivo": 2, "Reparar (correctivo)": 1,
};

// Funciones de confiabilidad Weibull (gamma, MTBF, Ts*, decisión) en lib/calculos.

const SPEC = [
  { tabla: "embarcaciones", opts: { order: { col: "codigo",    asc: true } } },
  { tabla: "equipos",       opts: { order: { col: "id_visible", asc: true } } },
  "weibull",
  "ordenes_trabajo",
];

export default function Weibull() {
  const { profile } = useAuth();
  const [raw, loading, error, reload] = useFleetData(SPEC);
  const [datos, setDatos] = useState([]);
  useEffect(() => { if (raw?.weibull) setDatos(raw.weibull); }, [raw?.weibull]);
  const [filtro, setFiltro] = useState("all");
  const [abierto, setAbierto] = useState(null);
  const [dirty, setDirty] = useState({});
  const [guardadoOk, setGuardadoOk] = useState(null);
  const [guardando, setGuardando] = useState(null);
  const [guardarError, setGuardarError] = useState(null);
  const puedeOperar = isAdmin(profile?.rol);

  const embarcaciones = raw?.embarcaciones   || [];
  const equipos       = raw?.equipos         || [];
  const ots           = raw?.ordenes_trabajo || [];

  function getW(equipoId) {
    const found = datos.find((c) => c.equipo_id === equipoId);
    return found || { ...DEFAULT_W, equipo_id: equipoId };
  }
  function embName(id) { return embarcaciones.find((e) => e.id === id)?.nombre || "—"; }

  // Edita el parámetro solo en memoria; los cálculos (MTBF, Ts*, decisión) se
  // actualizan al instante, pero la base solo cambia al pulsar "Guardar cambios".
  function setCampo(equipoId, campo, valor) {
    setDatos((p) => {
      const i = p.findIndex((c) => c.equipo_id === equipoId);
      if (i >= 0) { const copy = [...p]; copy[i] = { ...copy[i], [campo]: valor }; return copy; }
      return [...p, { ...DEFAULT_W, equipo_id: equipoId, [campo]: valor, empresa_id: profile.empresa_id }];
    });
    setDirty((d) => ({ ...d, [equipoId]: true }));
    if (guardadoOk === equipoId) setGuardadoOk(null);
  }

  // Guarda en la base los parámetros Weibull del equipo (INSERT o UPDATE).
  async function guardar(equipoId) {
    const w = getW(equipoId);
    setGuardarError(null); setGuardando(equipoId);
    try {
      await upsertRow("weibull", profile.empresa_id, {
        equipo_id: equipoId,
        beta: w.beta, eta: w.eta, gamma: w.gamma,
        cf: w.cf, ci: w.ci, notas: w.notas,
        unidad: w.unidad || "h",
      }, "equipo_id");
      setDirty((d) => { const n = { ...d }; delete n[equipoId]; return n; });
      const eq = equipos.find((e) => e.id === equipoId);
      logActivity(profile, "Guardar Weibull", `${eq?.sistema || ""} · ${embName(eq?.embarcacion_id)}`);
      setGuardadoOk(equipoId);
      setTimeout(() => setGuardadoOk((g) => (g === equipoId ? null : g)), 2500);
    } catch (e) { setGuardarError("No se pudo guardar: " + e.message); }
    finally { setGuardando(null); }
  }

  const filtrados = buildEquipoTree(filtro === "all" ? equipos : equipos.filter((e) => e.embarcacion_id === filtro));
  const arbol = useArbolColapsable(filtrados); // orden jerárquico (igual que Plan Preventivo)
  const esHoja    = (eq) => !arbol.tieneHijos(eq);
  const analizado = (eqId) => datos.some((d) => d.equipo_id === eqId); // tiene parámetros Weibull cargados

  // ── Rollup jerárquico de confiabilidad ─────────────────────────
  // Se analiza en las HOJAS (componentes con historial de fallas). NO se
  // promedian β/η (no tiene sentido entre componentes distintos): cada padre
  // resume la decisión más urgente, la distribución, el peor MTBF / mayor r
  // y la cobertura del análisis de sus descendientes.
  const info = new Map(); // id → { hoja, analizado, mtbf, tsOpt, r, dec, beta, peorMTBF, mayorR, urgente, dist, nAnalizados, nLeaves }
  filtrados.forEach((eq) => {
    if (esHoja(eq)) {
      if (analizado(eq.id)) {
        const w = getW(eq.id);
        const mtbf = calcMTBF(w.beta, w.eta, w.gamma);
        const tsOpt = calcTsOpt(w.beta, w.eta, w.gamma, w.cf, w.ci);
        const r = w.ci > 0 ? w.cf / w.ci : 0;
        const dec = decidir(w.beta, mtbf, tsOpt, r);
        info.set(eq.id, { hoja: true, analizado: true, mtbf, tsOpt, r, dec, beta: w.beta,
          peorMTBF: mtbf, mayorR: r, peorUnidad: w.unidad || 'h', urgente: dec, dist: { [dec.tipo]: 1 }, nAnalizados: 1, nLeaves: 1 });
      } else {
        info.set(eq.id, { hoja: true, analizado: false, peorMTBF: null, mayorR: null, peorUnidad: null, urgente: null, dist: {}, nAnalizados: 0, nLeaves: 1 });
      }
    } else {
      info.set(eq.id, { hoja: false, analizado: false, peorMTBF: null, mayorR: null, peorUnidad: null, urgente: null, dist: {}, nAnalizados: 0, nLeaves: 0 });
    }
  });
  [...filtrados].sort((a, b) => b.depth - a.depth).forEach((eq) => {
    if (eq.parent_id && info.has(eq.parent_id)) {
      const p = info.get(eq.parent_id), c = info.get(eq.id);
      p.nAnalizados += c.nAnalizados; p.nLeaves += c.nLeaves;
      if (c.peorMTBF != null && (p.peorMTBF == null || c.peorMTBF < p.peorMTBF)) { p.peorMTBF = c.peorMTBF; p.peorUnidad = c.peorUnidad; }
      if (c.mayorR != null) p.mayorR = p.mayorR == null ? c.mayorR : Math.max(p.mayorR, c.mayorR);
      if (c.urgente && (!p.urgente || DECISION_RANK[c.urgente.tipo] > DECISION_RANK[p.urgente.tipo])) p.urgente = c.urgente;
      for (const t in c.dist) p.dist[t] = (p.dist[t] || 0) + c.dist[t];
    }
  });

  // KPIs: solo hojas analizadas.
  const hojasAn = filtrados.filter((eq) => esHoja(eq) && analizado(eq.id));
  const numDegradan = hojasAn.filter((eq) => info.get(eq.id).beta > 1).length;
  const conPM = hojasAn.filter((eq) => info.get(eq.id).dec.tipo === "PM Preventivo").length;
  const conReemp = hojasAn.filter((eq) => { const t = info.get(eq.id).dec.tipo; return t === "Reemplazo" || t === "Overhaul"; }).length;

  if (loading) return <div><PageHead kicker="Optimización · Pascual" title="Optimización Weibull" /><Card><InlineSpinner label="Calculando óptimos…" /></Card></div>;

  if (equipos.length === 0) {
    return (
      <div>
        <PageHead kicker="Optimización · Pascual" title="Optimización Weibull" />
        <Card><Empty>
          <AlertCircle size={32} color={C.amber} style={{ marginBottom: 10 }} /><br />
          No hay equipos registrados. Carga equipos primero para optimizar su mantenimiento.
        </Empty></Card>
      </div>
    );
  }

  return (
    <div>
      <PageHead kicker="Optimización · Pascual / Weibull" title="Optimización Weibull"
        sub="Calcula el tiempo óptimo de intervención preventiva y la decisión Reparar / PM / Overhaul / Reemplazar a partir del factor de forma (β), vida característica (η) y los costos Cf/Ci." />

      <ErrorBanner onRetry={reload}>{error}</ErrorBanner>
      <ErrorBanner>{guardarError}</ErrorBanner>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 16 }}>
        <KPI label="Componentes analizados" value={hojasAn.length} sub={`de ${filtrados.filter(esHoja).length} componentes`} />
        <KPI label="Con degradación (β > 1)" value={numDegradan} tone={C.amber} sub={`${hojasAn.length - numDegradan} aleatorios`} />
        <KPI label="Recomendados con PM" value={conPM} tone={C.green} sub="óptimo Ts* válido" />
        <KPI label="Overhaul / Reemplazo" value={conReemp} tone={conReemp ? C.red : C.green} sub="requieren intervención mayor" />
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
        {filtrados.filter((eq) => arbol.visible(eq)).map((eq) => {
          const i = info.get(eq.id);

          // ── Nodo padre: resumen de confiabilidad (rollup, no editable) ──
          if (!i.hoja) {
            return (
              <Card key={eq.id} style={{ padding: "12px 18px", background: fondoTipo(eq) }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                  <span style={{ width: 18, flexShrink: 0 }} />
                  <div style={{ flex: "1 1 240px", minWidth: 200 }}>
                    <EquipoNodoLabel eq={eq} tieneHijos={arbol.tieneHijos(eq)} colapsado={arbol.estaColapsado(eq)}
                      onToggle={() => arbol.toggle(eq.id)} nSub={arbol.nSubDe(eq)} embName={embName} />
                  </div>
                  {i.nAnalizados === 0 ? (
                    <span style={{ fontSize: 12, color: C.slate, fontStyle: "italic" }}>Sin componentes analizados ({i.nLeaves})</span>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, color: C.slate, fontWeight: 600 }}>Más urgente</span>
                        {i.urgente && <Pill tone={i.urgente.tone}>{i.urgente.tipo}</Pill>}
                      </div>
                      <Stat label="Peor MTBF" value={i.peorMTBF != null ? `${num(i.peorMTBF, 0)}${i.peorUnidad || 'h'}` : "—"} />
                      <Stat label="r máx" value={i.mayorR != null ? i.mayorR.toFixed(1) : "—"} color={i.mayorR > 5 ? C.red : C.steel} />
                      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                        {Object.entries(i.dist).sort((a, b) => (DECISION_RANK[b[0]] || 0) - (DECISION_RANK[a[0]] || 0)).map(([t, n]) => (
                          <span key={t} style={{ fontSize: 10.5, color: C.slate, background: C.foam, borderRadius: 4, padding: "1px 6px" }}>{n} {t}</span>
                        ))}
                      </div>
                      <span style={{ fontSize: 11, color: C.slate, fontFamily: "'IBM Plex Mono', monospace" }}>{i.nAnalizados}/{i.nLeaves} analizados</span>
                    </div>
                  )}
                </div>
              </Card>);
          }

          // ── Nodo hoja: análisis editable (valores en vivo según parámetros) ──
          const w = getW(eq.id);
          const an = i.analizado;
          const mtbf = calcMTBF(w.beta, w.eta, w.gamma);
          const tsOpt = calcTsOpt(w.beta, w.eta, w.gamma, w.cf, w.ci);
          const r = w.ci > 0 ? w.cf / w.ci : 0;
          const dec = decidir(w.beta, mtbf, tsOpt, r);
          const expanded = abierto === eq.id;
          // Estimación desde historial real: TBF de OTs correctivas del equipo
          const muestras = muestrasTBF(ots, eq.id);
          const fit = ajustarWeibull(muestras);
          return (
            <Card key={eq.id} style={{ padding: 0, overflow: "hidden" }}>
              <div onClick={() => setAbierto(expanded ? null : eq.id)}
                style={{ display: "grid", gridTemplateColumns: "auto 2fr 0.8fr 1fr 1fr 0.7fr 1.3fr auto", gap: 14, padding: "14px 18px", alignItems: "center", cursor: "pointer", background: fondoTipo(eq), borderBottom: expanded ? `1px solid ${C.line}` : "none" }}>
                {expanded ? <ChevronDown size={18} color={C.slate} /> : <ChevronRight size={18} color={C.slate} />}
                <EquipoNodoLabel eq={eq} tieneHijos={arbol.tieneHijos(eq)} colapsado={arbol.estaColapsado(eq)}
                  onToggle={() => arbol.toggle(eq.id)} nSub={arbol.nSubDe(eq)} embName={embName} />
                <Stat label="β" value={an ? (w.beta || 0).toFixed(1) : "—"} />
                <Stat label="MTBF" value={an ? `${num(mtbf, 0)}${w.unidad || 'h'}` : "—"} />
                <Stat label="Ts*" value={an && tsOpt ? `${num(tsOpt, 0)}${w.unidad || 'h'}` : "—"} color={tsOpt ? C.green : C.slate} />
                <Stat label="r" value={an ? (r || 0).toFixed(1) : "—"} color={r > 5 ? C.red : C.steel} />
                <div>
                  <div style={{ fontSize: 10, letterSpacing: 0.5, color: C.slate, fontWeight: 600, textTransform: "uppercase" }}>Recomendación</div>
                  <div style={{ marginTop: 3 }}>{an ? <Pill tone={dec.tone}>{dec.tipo}</Pill> : <span style={{ fontSize: 11, color: C.slate, fontStyle: "italic" }}>Sin analizar</span>}</div>
                </div>
                <div style={{ fontSize: 10, color: C.slate }}>{expanded ? "Ocultar" : an ? "Detalle" : "Analizar"}</div>
              </div>

              {expanded && (
                <div style={{ padding: 18, background: C.mist }}>
                  {/* Estimación β/η desde el historial real de fallas (OTs correctivas) */}
                  <div style={{ marginBottom: 14, padding: "10px 14px", background: C.surface, border: `1px solid ${fit ? C.cyan : C.line}`, borderRadius: 9, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <TrendingUp size={15} color={fit ? C.cyan : C.slate} style={{ flexShrink: 0 }} />
                    {fit ? (
                      <>
                        <span style={{ fontSize: 12.5, color: C.ink }}>
                          <strong>Historial real:</strong> {fit.n} fallas con TBF registrado ·
                          β̂ = <strong>{fit.beta.toFixed(2)}</strong> ·
                          η̂ = <strong>{num(fit.eta, 0)} h</strong> ·
                          ajuste R² = {fit.r2.toFixed(2)}
                        </span>
                        {puedeOperar && (
                          <button
                            onClick={() => { setCampo(eq.id, "beta", +fit.beta.toFixed(2)); setCampo(eq.id, "eta", Math.round(fit.eta)); }}
                            style={{ ...primaryBtn, padding: "5px 12px", fontSize: 12 }}>
                            Usar estos parámetros
                          </button>
                        )}
                      </>
                    ) : (
                      <span style={{ fontSize: 12, color: C.slate }}>
                        {muestras.length === 0
                          ? "Sin historial: ninguna OT correctiva de este equipo registra «horas desde última falla». Captúralas al crear la OT para estimar β/η con datos reales."
                          : `Historial insuficiente: ${muestras.length} falla${muestras.length !== 1 ? "s" : ""} con TBF registrado — se necesitan ≥ 3 para estimar β/η.`}
                      </span>
                    )}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 14 }}>
                    <Group title="Parámetros Weibull">
                      <CellEdit label="β · forma" step={0.1} value={w.beta} disabled={!puedeOperar} onChange={(v) => setCampo(eq.id, "beta", Math.max(0.1, v))} />
                      <CellEdit label={`η · vida característica (${w.unidad || 'h'})`} step={50} value={w.eta} disabled={!puedeOperar} onChange={(v) => setCampo(eq.id, "eta", Math.max(0, v))} />
                      <CellEdit label={`γ · umbral (${w.unidad || 'h'})`} step={10} value={w.gamma} disabled={!puedeOperar} onChange={(v) => setCampo(eq.id, "gamma", Math.max(0, v))} />
                      <div>
                        <div style={{ fontSize: 11, color: C.slate, marginBottom: 4 }}>Unidad de tiempo</div>
                        <select value={w.unidad || "h"} disabled={!puedeOperar}
                          onChange={(e) => setCampo(eq.id, "unidad", e.target.value)}
                          style={{ ...inputStyle(), width: "100%", padding: "6px 8px", fontSize: 13, cursor: puedeOperar ? "pointer" : "default" }}>
                          <option value="h">Horas (h)</option>
                          <option value="d">Días (d)</option>
                        </select>
                      </div>
                    </Group>
                    <Group title="Costos económicos">
                      <CellEdit label="Cf · costo por falla ($)" step={1000} value={w.cf} disabled={!puedeOperar} onChange={(v) => setCampo(eq.id, "cf", Math.max(0, v))} />
                      <CellEdit label="Ci · costo PM ($)" step={1000} value={w.ci} disabled={!puedeOperar} onChange={(v) => setCampo(eq.id, "ci", Math.max(0, v))} />
                      <div>
                        <div style={{ fontSize: 11, color: C.slate, marginBottom: 4 }}>r = Cf / Ci</div>
                        <div style={{ ...archivo, fontSize: 18, fontWeight: 800, color: r > 5 ? C.red : C.steel }}>{r.toFixed(2)}</div>
                      </div>
                    </Group>
                    <Group title="Resultados">
                      <div>
                        <div style={{ fontSize: 11, color: C.slate, marginBottom: 4 }}>MTBF estimado</div>
                        <div style={{ ...archivo, fontSize: 18, fontWeight: 800, color: C.steel }}>{num(mtbf, 0)} {w.unidad || 'h'}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: C.slate, marginBottom: 4 }}>Tiempo óptimo PM</div>
                        <div style={{ ...archivo, fontSize: 18, fontWeight: 800, color: tsOpt ? C.green : C.slate }}>{tsOpt ? `${num(tsOpt, 0)} ${w.unidad || 'h'}` : "no aplica"}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: C.slate, marginBottom: 4 }}>Razón Ts*/MTBF</div>
                        <div style={{ ...archivo, fontSize: 18, fontWeight: 800, color: C.steel }}>{tsOpt && mtbf > 0 ? `${((tsOpt / mtbf) * 100).toFixed(0)}%` : "—"}</div>
                      </div>
                    </Group>
                  </div>

                  <div style={{ padding: "12px 16px", background: C.surface, border: `1px solid ${C.line}`, borderRadius: 9 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                      <span style={{ fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase", color: C.slate, fontWeight: 700 }}>Decisión recomendada:</span>
                      <Pill tone={dec.tone}>{dec.tipo}</Pill>
                    </div>
                    <div style={{ fontSize: 12.5, color: C.slate, lineHeight: 1.6 }}>{dec.raz}</div>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 11, color: C.slate, marginBottom: 4 }}>Notas / observaciones</div>
                    <input value={w.notas || ""} disabled={!puedeOperar}
                      onChange={(e) => setCampo(eq.id, "notas", e.target.value)}
                      style={inputStyle()} placeholder="Histórico de revisiones, decisiones tomadas, etc." />
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
          <strong style={{ color: C.ink }}>Interpretación del factor de forma β:</strong>{" "}
          β &lt; 1 = mortalidad infantil (fallas iniciales) ·{" "}
          β ≈ 1 = aleatorias (tasa constante) ·{" "}
          β &gt; 1 = degradación con la edad (envejecimiento).{" "}
          La fórmula <strong>Ts* = η · (1/(r·(β−1)))^(1/β) + γ</strong> solo tiene sentido cuando β &gt; 1 (hay envejecimiento) y r = Cf/Ci es positivo.
          Si todavía no tienes historial estadístico real, parte con valores típicos por sistema: motores diésel β ≈ 2.5, bombas hidráulicas β ≈ 2.0, sistemas eléctricos β ≈ 1.2.
        </div>
      </Card>
    </div>
  );
}

function Group({ title, children }) {
  return (
    <div>
      <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: C.slate, fontWeight: 700, marginBottom: 10 }}>{title}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>{children}</div>
    </div>
  );
}

function CellEdit({ label, value, disabled, onChange, step = 1 }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: C.slate, marginBottom: 4 }}>{label}</div>
      <input type="number" step={step} value={value || 0} disabled={disabled}
        onFocus={(e) => e.target.select()} onChange={(e) => onChange(+e.target.value)} style={bluInput} />
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div>
      <div style={{ fontSize: 10, letterSpacing: 0.5, color: C.slate, fontWeight: 600, textTransform: "uppercase" }}>{label}</div>
      <div style={{ ...archivo, fontSize: 17, fontWeight: 800, color: color || C.steel, marginTop: 2 }}>{value}</div>
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
