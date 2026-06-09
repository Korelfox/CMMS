import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Timer, Save, ChevronDown, ChevronRight, History, AlertCircle, CheckCircle2 } from "lucide-react";
import { useAuth } from "../lib/auth";
import { fetchAll, insertRow, updateRow, logActivity } from "../lib/db";
import { validarLectura, tendenciaHorasDia, diasDesde } from "../lib/horometro";
import { C, num, canOperate, tint } from "../theme";
import {
  Card, PageHead, Pill, FilterBtn, primaryBtn, inputStyle,
  thStyle, tdStyle, Empty, ErrorBanner, InlineSpinner, GuiaColapsable,
} from "../ui";

// Semáforo de antigüedad de la última lectura
function toneAntiguedad(dias) {
  if (dias == null) return ["slate", "Sin lecturas"];
  if (dias <= 7)  return ["green",  `hace ${Math.round(dias)} d`];
  if (dias <= 30) return ["yellow", `hace ${Math.round(dias)} d`];
  return ["red", `hace ${Math.round(dias)} d`];
}

export default function Horometros() {
  const { profile } = useAuth();
  const [embarcaciones, setEmbarcaciones] = useState([]);
  const [equipos, setEquipos]   = useState([]);
  const [lecturas, setLecturas] = useState([]);
  const [planes, setPlanes]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [okMsg, setOkMsg]       = useState(null);
  const [filtro, setFiltro]     = useState("all");
  const [valores, setValores]   = useState({});      // equipoId → texto ingresado
  const [mostrarTodos, setMostrarTodos] = useState(false);
  const [histAbierto, setHistAbierto]   = useState(null);
  const [guardando, setGuardando]       = useState(false);
  const puedeOperar = canOperate(profile?.rol);

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [em, eq, lec, pl] = await Promise.all([
        fetchAll("embarcaciones", { order: { col: "codigo", asc: true } }),
        fetchAll("equipos",       { order: { col: "id_visible", asc: true } }),
        fetchAll("lecturas_horometro", { order: { col: "fecha", asc: false } }),
        fetchAll("planes_pm"),
      ]);
      setEmbarcaciones(em); setEquipos(eq); setLecturas(lec); setPlanes(pl);
    } catch (e) { setError("No se pudieron cargar los horómetros. " + e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const lecturasDe = useCallback(
    (eqId) => lecturas.filter((l) => l.equipo_id === eqId),
    [lecturas]);

  // Equipos "con horómetro": tienen plan PM, horas registradas o lecturas previas.
  const conPlan = useMemo(() => new Set(planes.map((p) => p.equipo_id)), [planes]);
  const conLectura = useMemo(() => new Set(lecturas.map((l) => l.equipo_id)), [lecturas]);
  const lista = useMemo(() => equipos
    .filter((e) => filtro === "all" || e.embarcacion_id === filtro)
    .filter((e) => mostrarTodos || conPlan.has(e.id) || conLectura.has(e.id) || Number(e.horas_actual) > 0),
  [equipos, filtro, mostrarTodos, conPlan, conLectura]);

  const kpis = useMemo(() => {
    const conDatos = lista.map((e) => diasDesde(lecturasDe(e.id)[0]?.fecha));
    return {
      total:    lista.length,
      alDia:    conDatos.filter((d) => d != null && d <= 7).length,
      atrasada: conDatos.filter((d) => d == null || d > 30).length,
    };
  }, [lista, lecturasDe]);

  const pendientes = Object.entries(valores).filter(([, v]) => String(v).trim() !== "");

  async function guardarLecturas() {
    if (!pendientes.length) return;
    setGuardando(true); setError(null); setOkMsg(null);
    const guardadas = [];
    try {
      for (const [eqId, valor] of pendientes) {
        const eq = equipos.find((x) => x.id === eqId);
        if (!eq) continue;
        const ultima = lecturasDe(eqId)[0];
        const v = validarLectura({
          horasPrev: eq.horas_actual ?? null,
          fechaPrev: ultima?.fecha ?? null,
          horas: Number(valor),
        });
        if (!v.ok) { setError(`${eq.id_visible}: ${v.error}`); continue; }
        if (v.warning && !window.confirm(`${eq.id_visible} · ${eq.sistema}\n\n${v.warning}\n\n¿Guardar de todas formas?`)) continue;

        const row = await insertRow("lecturas_horometro", profile.empresa_id, {
          equipo_id: eqId, horas: Number(valor), horas_anterior: eq.horas_actual ?? null,
          fuente: "manual", usuario_id: profile.id, usuario_nombre: profile.nombre || "",
        });
        await updateRow("equipos", eqId, { horas_actual: Number(valor) });
        setLecturas((p) => [row, ...p]);
        setEquipos((p) => p.map((x) => x.id === eqId ? { ...x, horas_actual: Number(valor) } : x));
        setValores((p) => { const n = { ...p }; delete n[eqId]; return n; });
        guardadas.push(eq.id_visible);
      }
      if (guardadas.length) {
        setOkMsg(`${guardadas.length} lectura(s) guardada(s): ${guardadas.join(", ")}`);
        logActivity(profile, "Registrar lecturas de horómetro", guardadas.join(", "));
      }
    } catch (e) { setError("No se pudo guardar: " + e.message); }
    finally { setGuardando(false); }
  }

  if (loading) return <div><PageHead kicker="Operación · Datos de Operación" title="Horómetros" /><Card><InlineSpinner label="Cargando horómetros…" /></Card></div>;

  return (
    <div>
      <PageHead kicker="Operación · Datos de Operación" title="Horómetros"
        sub="Registro formal de lecturas de horas por equipo: con trazabilidad (quién/cuándo), validación y tendencia de uso. Estas horas alimentan el Plan Preventivo, MTBF, Weibull y CGM."
        action={puedeOperar && (
          <button onClick={guardarLecturas} disabled={guardando || !pendientes.length}
            style={{ ...primaryBtn, opacity: pendientes.length ? 1 : 0.5 }}>
            <Save size={15} /> {guardando ? "Guardando…" : `Guardar ${pendientes.length || ""} lectura(s)`}
          </button>
        )} />

      <ErrorBanner onRetry={cargar}>{error}</ErrorBanner>
      {okMsg && (
        <Card style={{ marginBottom: 14, padding: "10px 16px", border: `1px solid ${tint(C.green, 40)}`, background: tint(C.green, 8), display: "flex", alignItems: "center", gap: 8 }}>
          <CheckCircle2 size={16} color={C.green} /><span style={{ fontSize: 12.5, color: C.green, fontWeight: 600 }}>{okMsg}</span>
        </Card>
      )}

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 16 }}>
        {[
          ["Equipos con horómetro", kpis.total, C.steel, Timer],
          ["Lectura al día (≤7 d)", kpis.alDia, C.green, CheckCircle2],
          ["Sin lectura / atrasada (>30 d)", kpis.atrasada, kpis.atrasada ? C.red : C.green, AlertCircle],
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

      {/* Filtros */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <FilterBtn active={filtro === "all"} onClick={() => setFiltro("all")}>Todas</FilterBtn>
        {embarcaciones.map((v) => (
          <FilterBtn key={v.id} active={filtro === v.id} onClick={() => setFiltro(v.id)} color={v.color}>{v.nombre}</FilterBtn>
        ))}
        <label style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.slate, fontWeight: 600, cursor: "pointer" }}>
          <input type="checkbox" checked={mostrarTodos} onChange={(e) => setMostrarTodos(e.target.checked)} style={{ accentColor: C.steel }} />
          Mostrar todos los equipos
        </label>
      </div>

      {lista.length === 0 ? (
        <Card><Empty>
          <Timer size={30} color={C.line} style={{ marginBottom: 10 }} /><br />
          No hay equipos con horómetro para este filtro. Activa "Mostrar todos los equipos" para registrar la primera lectura de cualquier equipo.
        </Empty></Card>
      ) : (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
              <thead><tr>
                <th style={thStyle}>Equipo</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Horas actuales</th>
                <th style={thStyle}>Última lectura</th>
                <th style={{ ...thStyle, textAlign: "right" }} title="Ritmo de uso de las últimas lecturas">Tendencia</th>
                {puedeOperar && <th style={{ ...thStyle, textAlign: "right" }}>Nueva lectura (h)</th>}
                <th style={{ ...thStyle, textAlign: "center" }}>Historial</th>
              </tr></thead>
              <tbody>
                {lista.map((e) => {
                  const lecs = lecturasDe(e.id);
                  const ultima = lecs[0];
                  const dias = diasDesde(ultima?.fecha);
                  const [tone, label] = toneAntiguedad(dias);
                  const hxd = tendenciaHorasDia(lecs);
                  const abierto = histAbierto === e.id;
                  return ([
                    <tr key={e.id}>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 700, color: C.abyss, fontSize: 13 }}>{e.sistema}</div>
                        <div style={{ fontSize: 11, color: C.slate, fontFamily: "'IBM Plex Mono', monospace" }}>
                          {e.id_visible}{filtro === "all" && <> · {embarcaciones.find((v) => v.id === e.embarcacion_id)?.nombre}</>}
                        </div>
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: C.steel }}>
                        {num(e.horas_actual || 0)} h
                      </td>
                      <td style={tdStyle}>
                        <Pill tone={tone}>{label}</Pill>
                        {ultima && <span style={{ marginLeft: 8, fontSize: 11.5, color: C.slate }}>{new Date(ultima.fecha).toLocaleDateString("es-CL")} · {ultima.usuario_nombre || "—"}</span>}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        {hxd != null
                          ? <span style={{ fontWeight: 700, color: C.cyan, fontFamily: "'IBM Plex Mono', monospace" }}>{num(hxd, 1)} h/día</span>
                          : <span style={{ color: C.line }}>—</span>}
                      </td>
                      {puedeOperar && (
                        <td style={{ ...tdStyle, textAlign: "right" }}>
                          <input type="number" min={e.horas_actual || 0} placeholder={`≥ ${num(e.horas_actual || 0)}`}
                            value={valores[e.id] ?? ""}
                            onChange={(ev) => setValores((p) => ({ ...p, [e.id]: ev.target.value }))}
                            onKeyDown={(ev) => { if (ev.key === "Enter") guardarLecturas(); }}
                            style={{ ...inputStyle(130), textAlign: "right", borderColor: (valores[e.id] ?? "") !== "" ? C.steel : undefined }} />
                        </td>
                      )}
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        <button onClick={() => setHistAbierto(abierto ? null : e.id)} disabled={!lecs.length}
                          title={lecs.length ? `${lecs.length} lectura(s)` : "Sin lecturas registradas"}
                          style={{ background: abierto ? C.steel : "none", border: `1px solid ${abierto ? C.steel : C.line}`, borderRadius: 6, cursor: lecs.length ? "pointer" : "default", color: abierto ? "#fff" : (lecs.length ? C.steel : C.line), padding: "3px 8px", display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <History size={13} /> {lecs.length || ""} {abierto ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        </button>
                      </td>
                    </tr>,
                    abierto && (
                      <tr key={e.id + "-hist"}>
                        <td colSpan={puedeOperar ? 6 : 5} style={{ padding: "10px 18px 14px", background: tint(C.steel, 6), borderBottom: `1px solid ${C.line}` }}>
                          <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead><tr>
                              {["Fecha", "Horas", "Δ desde anterior", "Registrada por", "Fuente", "Nota"].map((h) => (
                                <th key={h} style={{ textAlign: "left", padding: "4px 10px", fontSize: 10.5, textTransform: "uppercase", color: C.slate, letterSpacing: 0.4 }}>{h}</th>
                              ))}
                            </tr></thead>
                            <tbody>
                              {lecs.slice(0, 12).map((l) => (
                                <tr key={l.id}>
                                  <td style={{ padding: "4px 10px", fontSize: 12 }}>{new Date(l.fecha).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" })}</td>
                                  <td style={{ padding: "4px 10px", fontSize: 12, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700 }}>{num(l.horas)} h</td>
                                  <td style={{ padding: "4px 10px", fontSize: 12, color: C.cyan, fontFamily: "'IBM Plex Mono', monospace" }}>{l.horas_anterior != null ? `+${num(Number(l.horas) - Number(l.horas_anterior))} h` : "—"}</td>
                                  <td style={{ padding: "4px 10px", fontSize: 12 }}>{l.usuario_nombre || "—"}</td>
                                  <td style={{ padding: "4px 10px", fontSize: 12, color: C.slate }}>{l.fuente}</td>
                                  <td style={{ padding: "4px 10px", fontSize: 12, color: C.slate }}>{l.nota || ""}</td>
                                </tr>
                              ))}
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

      <GuiaColapsable titulo="¿Por qué registrar lecturas en vez de editar las horas a mano?" icon={Timer}>
        <ul style={{ margin: 0, paddingLeft: 18, color: C.slate }}>
          <li>Cada lectura queda con <strong>fecha, usuario y valor anterior</strong>: trazabilidad auditable (ISO 55001).</li>
          <li>El sistema <strong>rechaza lecturas decrecientes</strong> y advierte saltos físicamente imposibles (&gt;24 h/día).</li>
          <li>La <strong>tendencia h/día</strong> permite proyectar cuándo vence el próximo PM y detectar cambios de régimen de uso.</li>
          <li>Registra al menos <strong>una lectura semanal</strong> por equipo crítico (verde = al día, rojo = atrasada).</li>
        </ul>
      </GuiaColapsable>
    </div>
  );
}
