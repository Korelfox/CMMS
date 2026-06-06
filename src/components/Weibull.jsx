import React, { useEffect, useState, useCallback } from "react";
import { TrendingUp, ChevronDown, ChevronRight, AlertCircle, Save, Check } from "lucide-react";
import { useAuth } from "../lib/auth";
import { fetchAll, upsertRow, logActivity } from "../lib/db";
import { buildEquipoTree } from "../lib/equipTree";
import { C, archivo, clp, num, isAdmin } from "../theme";
import { Card, PageHead, Pill, primaryBtn, bluInput, inputStyle, FilterBtn, Empty, ErrorBanner, InlineSpinner } from "../ui";

const DEFAULT_W = { beta: 2.0, eta: 1000, gamma: 0, cf: 50000, ci: 12000, notas: "" };

// â”€â”€â”€â”€â”€ Funciones matemÃ¡ticas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// FunciÃ³n gamma Î“(z) por aproximaciÃ³n de Lanczos. Precisa para los rangos tÃ­picos de Weibull.
function gammaFunc(z) {
  if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gammaFunc(1 - z));
  z -= 1;
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  let x = c[0];
  for (let i = 1; i < c.length; i++) x += c[i] / (z + i);
  const t = z + c.length - 1.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
}

// MTBF para Weibull biparamÃ©trica: MTBF = Î· Â· Î“(1 + 1/Î²) + Î³
function calcMTBF(beta, eta, gamma) {
  if (!beta || !eta) return 0;
  return eta * gammaFunc(1 + 1 / beta) + (gamma || 0);
}

// Tiempo Ã³ptimo de intervenciÃ³n preventiva (Pascual):
//   Ts* = Î· Â· (1 / (r Â· (Î² âˆ’ 1)))^(1/Î²) + Î³
// Donde r = Cf / Ci. Solo vÃ¡lido para Î² > 1 (degradaciÃ³n con el tiempo).
function calcTsOpt(beta, eta, gamma, cf, ci) {
  if (beta <= 1) return null;
  if (!cf || !ci || cf <= 0 || ci <= 0) return null;
  const r = cf / ci;
  if (r <= 0) return null;
  const factor = 1 / (r * (beta - 1));
  if (factor <= 0) return null;
  return eta * Math.pow(factor, 1 / beta) + (gamma || 0);
}

// DecisiÃ³n: Reparar / Preventivo / Overhaul / Reemplazo
function decidir(beta, mtbf, tsOpt, r) {
  if (beta <= 1) {
    return { tipo: "InspecciÃ³n", tone: "yellow",
      raz: "Î² â‰¤ 1: las fallas son aleatorias o de mortalidad infantil. El PM por calendario no ayuda; conviene inspecciÃ³n por condiciÃ³n." };
  }
  if (mtbf < 200 && r > 3) {
    return { tipo: "Reemplazo", tone: "red",
      raz: "MTBF muy bajo y el costo de falla supera ampliamente al de intervenciÃ³n: la operaciÃ³n pierde dinero, conviene reemplazar." };
  }
  if (tsOpt && tsOpt < mtbf * 0.3 && beta > 2) {
    return { tipo: "Overhaul", tone: "purple",
      raz: "La degradaciÃ³n es agresiva (Î² > 2) y el Ã³ptimo cae muy temprano. Una intervenciÃ³n mayor (overhaul) puede reiniciar el reloj y mejorar la vida Ãºtil." };
  }
  if (tsOpt && tsOpt > 0) {
    return { tipo: "PM Preventivo", tone: "green",
      raz: `Programa PM en Ts* = ${num(tsOpt, 0)} h. Es el punto donde el costo total se minimiza.` };
  }
  return { tipo: "Reparar (correctivo)", tone: "slate",
    raz: "No hay Ã³ptimo claro. MantÃ©n estrategia correctiva y revisa parÃ¡metros con mÃ¡s datos." };
}

export default function Weibull() {
  const { profile } = useAuth();
  const [embarcaciones, setEmbarcaciones] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [datos, setDatos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filtro, setFiltro] = useState("all");
  const [abierto, setAbierto] = useState(null);
  const [dirty, setDirty] = useState({});        // equipos con cambios sin guardar
  const [guardadoOk, setGuardadoOk] = useState(null);  // feedback "âœ“ guardado"
  const [guardando, setGuardando] = useState(null);
  const puedeOperar = isAdmin(profile?.rol);  // editar parÃ¡metros/costos: Jefe MantenciÃ³n y superiores

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [embs, eqs, ws] = await Promise.all([
        fetchAll("embarcaciones", { order: { col: "codigo", asc: true } }),
        fetchAll("equipos", { order: { col: "id_visible", asc: true } }),
        fetchAll("weibull"),
      ]);
      setEmbarcaciones(embs); setEquipos(eqs); setDatos(ws);
    } catch (e) {
      setError("No se pudo cargar la optimizaciÃ³n Weibull. " +
        (e.message.includes("does not exist") ? "Recuerda correr el parche 04_parche_weibull.sql en Supabase." : e.message));
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  function getW(equipoId) {
    const found = datos.find((c) => c.equipo_id === equipoId);
    return found || { ...DEFAULT_W, equipo_id: equipoId };
  }
  function embName(id) { return embarcaciones.find((e) => e.id === id)?.nombre || "â€”"; }

  // Edita el parÃ¡metro solo en memoria; los cÃ¡lculos (MTBF, Ts*, decisiÃ³n) se
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

  // Guarda en la base los parÃ¡metros Weibull del equipo (INSERT o UPDATE).
  async function guardar(equipoId) {
    const w = getW(equipoId);
    setError(null); setGuardando(equipoId);
    try {
      await upsertRow("weibull", profile.empresa_id, {
        equipo_id: equipoId,
        beta: w.beta, eta: w.eta, gamma: w.gamma,
        cf: w.cf, ci: w.ci, notas: w.notas,
      }, "equipo_id");
      setDirty((d) => { const n = { ...d }; delete n[equipoId]; return n; });
      const eq = equipos.find((e) => e.id === equipoId);
      logActivity(profile, "Guardar Weibull", `${eq?.sistema || ""} Â· ${embName(eq?.embarcacion_id)}`);
      setGuardadoOk(equipoId);
      setTimeout(() => setGuardadoOk((g) => (g === equipoId ? null : g)), 2500);
    } catch (e) { setError("No se pudo guardar: " + e.message); cargar(); }
    finally { setGuardando(null); }
  }

  const filtrados = buildEquipoTree(filtro === "all" ? equipos : equipos.filter((e) => e.embarcacion_id === filtro));
  const enriquecidos = filtrados.map((eq) => {
    const w = getW(eq.id);
    const mtbf = calcMTBF(w.beta, w.eta, w.gamma);
    const tsOpt = calcTsOpt(w.beta, w.eta, w.gamma, w.cf, w.ci);
    const r = w.ci > 0 ? w.cf / w.ci : 0;
    return { eq, w, mtbf, tsOpt, r, dec: decidir(w.beta, mtbf, tsOpt, r) };
  }).sort((a, b) => (a.mtbf || 1e9) - (b.mtbf || 1e9));

  const numDegradan = enriquecidos.filter((x) => x.w.beta > 1).length;
  const conPM = enriquecidos.filter((x) => x.dec.tipo === "PM Preventivo").length;
  const conReemp = enriquecidos.filter((x) => x.dec.tipo === "Reemplazo" || x.dec.tipo === "Overhaul").length;
  const mtbfProm = enriquecidos.length ? enriquecidos.reduce((s, x) => s + x.mtbf, 0) / enriquecidos.length : 0;

  if (loading) return <div><PageHead kicker="OptimizaciÃ³n Â· Pascual" title="OptimizaciÃ³n Weibull" /><Card><InlineSpinner label="Calculando Ã³ptimosâ€¦" /></Card></div>;

  if (equipos.length === 0) {
    return (
      <div>
        <PageHead kicker="OptimizaciÃ³n Â· Pascual" title="OptimizaciÃ³n Weibull" />
        <Card><Empty>
          <AlertCircle size={32} color={C.amber} style={{ marginBottom: 10 }} /><br />
          No hay equipos registrados. Carga equipos primero para optimizar su mantenimiento.
        </Empty></Card>
      </div>
    );
  }

  return (
    <div>
      <PageHead kicker="OptimizaciÃ³n Â· Pascual / Weibull" title="OptimizaciÃ³n Weibull"
        sub="Calcula el tiempo Ã³ptimo de intervenciÃ³n preventiva y la decisiÃ³n Reparar / PM / Overhaul / Reemplazar a partir del factor de forma (Î²), vida caracterÃ­stica (Î·) y los costos Cf/Ci." />

      <ErrorBanner onRetry={cargar}>{error}</ErrorBanner>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 16 }}>
        <KPI label="Equipos analizados" value={enriquecidos.length} />
        <KPI label="Con degradaciÃ³n (Î² > 1)" value={numDegradan} tone={C.amber} sub={`${enriquecidos.length - numDegradan} aleatorios`} />
        <KPI label="Recomendados con PM" value={conPM} tone={C.green} sub="Ã³ptimo Ts* vÃ¡lido" />
        <KPI label="Overhaul / Reemplazo" value={conReemp} tone={conReemp ? C.red : C.green} sub="requieren intervenciÃ³n mayor" />
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
        {enriquecidos.map(({ eq, w, mtbf, tsOpt, r, dec }) => {
          const expanded = abierto === eq.id;
          return (
            <Card key={eq.id} style={{ padding: 0, overflow: "hidden" }}>
              <div onClick={() => setAbierto(expanded ? null : eq.id)}
                style={{ display: "grid", gridTemplateColumns: "auto 2fr 0.8fr 1fr 1fr 0.7fr 1.3fr auto", gap: 14, padding: "14px 18px", alignItems: "center", cursor: "pointer", borderBottom: expanded ? `1px solid ${C.line}` : "none" }}>
                {expanded ? <ChevronDown size={18} color={C.slate} /> : <ChevronRight size={18} color={C.slate} />}
                <div>
                  <div style={{ fontWeight: 700, color: C.abyss }}>{eq.sistema}</div>
                  <div style={{ fontSize: 11.5, color: C.slate, fontFamily: "'IBM Plex Mono', monospace" }}>{embName(eq.embarcacion_id)} Â· {eq.id_visible}</div>
                </div>
                <Stat label="Î²" value={(w.beta || 0).toFixed(1)} />
                <Stat label="MTBF" value={`${num(mtbf, 0)}h`} />
                <Stat label="Ts*" value={tsOpt ? `${num(tsOpt, 0)}h` : "â€”"} color={tsOpt ? C.green : C.slate} />
                <Stat label="r" value={(r || 0).toFixed(1)} color={r > 5 ? C.red : C.steel} />
                <div>
                  <div style={{ fontSize: 10, letterSpacing: 0.5, color: C.slate, fontWeight: 600, textTransform: "uppercase" }}>RecomendaciÃ³n</div>
                  <div style={{ marginTop: 3 }}><Pill tone={dec.tone}>{dec.tipo}</Pill></div>
                </div>
                <div style={{ fontSize: 10, color: C.slate }}>{expanded ? "Ocultar" : "Detalle"}</div>
              </div>

              {expanded && (
                <div style={{ padding: 18, background: C.mist }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 14 }}>
                    <Group title="ParÃ¡metros Weibull">
                      <CellEdit label="Î² Â· forma" step={0.1} value={w.beta} disabled={!puedeOperar} onChange={(v) => setCampo(eq.id, "beta", Math.max(0.1, v))} />
                      <CellEdit label="Î· Â· vida caracterÃ­stica (h)" step={50} value={w.eta} disabled={!puedeOperar} onChange={(v) => setCampo(eq.id, "eta", Math.max(0, v))} />
                      <CellEdit label="Î³ Â· umbral (h)" step={10} value={w.gamma} disabled={!puedeOperar} onChange={(v) => setCampo(eq.id, "gamma", Math.max(0, v))} />
                    </Group>
                    <Group title="Costos econÃ³micos">
                      <CellEdit label="Cf Â· costo por falla ($)" step={1000} value={w.cf} disabled={!puedeOperar} onChange={(v) => setCampo(eq.id, "cf", Math.max(0, v))} />
                      <CellEdit label="Ci Â· costo PM ($)" step={1000} value={w.ci} disabled={!puedeOperar} onChange={(v) => setCampo(eq.id, "ci", Math.max(0, v))} />
                      <div>
                        <div style={{ fontSize: 11, color: C.slate, marginBottom: 4 }}>r = Cf / Ci</div>
                        <div style={{ ...archivo, fontSize: 18, fontWeight: 800, color: r > 5 ? C.red : C.steel }}>{r.toFixed(2)}</div>
                      </div>
                    </Group>
                    <Group title="Resultados">
                      <div>
                        <div style={{ fontSize: 11, color: C.slate, marginBottom: 4 }}>MTBF estimado</div>
                        <div style={{ ...archivo, fontSize: 18, fontWeight: 800, color: C.steel }}>{num(mtbf, 0)} h</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: C.slate, marginBottom: 4 }}>Tiempo Ã³ptimo PM</div>
                        <div style={{ ...archivo, fontSize: 18, fontWeight: 800, color: tsOpt ? C.green : C.slate }}>{tsOpt ? `${num(tsOpt, 0)} h` : "no aplica"}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: C.slate, marginBottom: 4 }}>RazÃ³n Ts*/MTBF</div>
                        <div style={{ ...archivo, fontSize: 18, fontWeight: 800, color: C.steel }}>{tsOpt && mtbf > 0 ? `${((tsOpt / mtbf) * 100).toFixed(0)}%` : "â€”"}</div>
                      </div>
                    </Group>
                  </div>

                  <div style={{ padding: "12px 16px", background: C.surface, border: `1px solid ${C.line}`, borderRadius: 9 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                      <span style={{ fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase", color: C.slate, fontWeight: 700 }}>DecisiÃ³n recomendada:</span>
                      <Pill tone={dec.tone}>{dec.tipo}</Pill>
                    </div>
                    <div style={{ fontSize: 12.5, color: C.slate, lineHeight: 1.6 }}>{dec.raz}</div>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 11, color: C.slate, marginBottom: 4 }}>Notas / observaciones</div>
                    <input value={w.notas || ""} disabled={!puedeOperar}
                      onChange={(e) => setCampo(eq.id, "notas", e.target.value)}
                      style={inputStyle()} placeholder="HistÃ³rico de revisiones, decisiones tomadas, etc." />
                  </div>

                  {puedeOperar && (
                    <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12 }}>
                      {guardadoOk === eq.id
                        ? <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: C.green }}><Check size={15} /> Cambios guardados</span>
                        : dirty[eq.id] && <span style={{ fontSize: 12.5, fontWeight: 600, color: "#7a5b00" }}>Tienes cambios sin guardar</span>}
                      <button onClick={() => guardar(eq.id)} disabled={!dirty[eq.id] || guardando === eq.id}
                        style={{ ...primaryBtn, opacity: dirty[eq.id] && guardando !== eq.id ? 1 : 0.5, cursor: dirty[eq.id] && guardando !== eq.id ? "pointer" : "default" }}>
                        <Save size={15} /> {guardando === eq.id ? "Guardandoâ€¦" : "Guardar cambios"}
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
          <strong style={{ color: C.ink }}>InterpretaciÃ³n del factor de forma Î²:</strong>{" "}
          Î² &lt; 1 = mortalidad infantil (fallas iniciales) Â·{" "}
          Î² â‰ˆ 1 = aleatorias (tasa constante) Â·{" "}
          Î² &gt; 1 = degradaciÃ³n con la edad (envejecimiento).{" "}
          La fÃ³rmula <strong>Ts* = Î· Â· (1/(rÂ·(Î²âˆ’1)))^(1/Î²) + Î³</strong> solo tiene sentido cuando Î² &gt; 1 (hay envejecimiento) y r = Cf/Ci es positivo.
          Si todavÃ­a no tienes historial estadÃ­stico real, parte con valores tÃ­picos por sistema: motores diÃ©sel Î² â‰ˆ 2.5, bombas hidrÃ¡ulicas Î² â‰ˆ 2.0, sistemas elÃ©ctricos Î² â‰ˆ 1.2.
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
        onChange={(e) => onChange(+e.target.value)} style={bluInput} />
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


