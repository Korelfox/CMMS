import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  Timer, Save, ChevronDown, ChevronRight, History, AlertCircle, CheckCircle2,
  CornerDownRight, ShieldCheck, Calendar, TrendingUp, Zap, Ship,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { fetchAll, insertRow, logActivity, rpcCall } from "../lib/db";
import { validarLectura, tendenciaHorasDia, diasDesde, modoHorometro, puntoHorometro, idsBajoPunto, compararPuntosHorometro } from "../lib/horometro";
import { buildEquipoTree } from "../lib/equipTree";
import { useArbolColapsable, BotonesColapsar, colorTipo, fondoTipo } from "../lib/arbolColapsable";
import { C, num, canOperate, tint, shadow, archivo } from "../theme";
import {
  Card, Pill, FilterBtn, primaryBtn, ghostBtn, inputStyle,
  thStyle, tdStyle, Empty, InlineSpinner, GuiaColapsable,
  ModuleShell, StatGrid, HeroStat, Toolbar, Section,
} from "../ui";

function toneAntiguedad(dias) {
  if (dias == null) return ["slate", "Sin lecturas"];
  if (dias <= 7) return ["green", `hace ${Math.round(dias)} d`];
  if (dias <= 30) return ["yellow", `hace ${Math.round(dias)} d`];
  return ["red", `hace ${Math.round(dias)} d`];
}

const URGENCY_META = {
  red: { color: C.red, label: "Atrasado", grad: `linear-gradient(135deg, ${tint(C.red, 14)} 0%, ${tint(C.red, 4)} 100%)` },
  yellow: { color: C.amber, label: "Por actualizar", grad: `linear-gradient(135deg, ${tint(C.amber, 14)} 0%, ${tint(C.amber, 4)} 100%)` },
  green: { color: C.green, label: "Al día", grad: `linear-gradient(135deg, ${tint(C.green, 12)} 0%, ${tint(C.green, 3)} 100%)` },
  slate: { color: C.slate, label: "Sin historial", grad: `linear-gradient(135deg, ${tint(C.slate, 10)} 0%, transparent 100%)` },
};

function HorometroLecturaCard({
  item, embName, puedeOperar, valores, setValores, fechas, setFechas, onSave, guardando,
}) {
  const { eq, ultima, tone, label, hxd } = item;
  const meta = URGENCY_META[tone] || URGENCY_META.slate;
  const horas = eq.horas_actual ?? 0;
  const valor = valores[eq.id] ?? "";
  const hasVal = String(valor).trim() !== "";
  const nuevo = hasVal ? Number(valor) : null;
  const delta = nuevo != null && !Number.isNaN(nuevo) ? nuevo - horas : null;
  const hoy = new Date().toLocaleDateString("en-CA");

  return (
    <div
      className="horo-lectura-card"
      style={{
        position: "relative",
        borderRadius: 14,
        border: `1px solid ${hasVal ? tint(C.sky, 35) : tint(meta.color, 28)}`,
        background: hasVal ? tint(C.sky, 5) : C.surface,
        boxShadow: hasVal ? `0 0 0 1px ${tint(C.sky, 18)}, ${shadow.sm}` : shadow.sm,
        overflow: "hidden",
        transition: "border-color .2s, box-shadow .2s, transform .15s",
      }}
    >
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: meta.color }} />
      <div style={{ padding: "16px 18px 14px 22px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.abyss, lineHeight: 1.25 }}>{eq.sistema}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginTop: 6 }}>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 700, color: C.steel }}>{eq.id_visible}</span>
              <span style={{ fontSize: 11, color: C.slate }}>{embName(eq.embarcacion_id)}</span>
            </div>
          </div>
          <Pill tone={tone}>{label}</Pill>
        </div>

        <div style={{
          display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center",
          padding: "14px 16px", borderRadius: 12, background: meta.grad, marginBottom: 14,
        }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: 1.4, textTransform: "uppercase", color: C.slate, fontWeight: 700 }}>Horas actuales</div>
            <div style={{ ...archivo, fontSize: 36, fontWeight: 800, color: C.abyss, lineHeight: 1.1, marginTop: 4 }}>
              {num(horas)}<span style={{ fontSize: 18, color: C.steel, marginLeft: 4 }}>h</span>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            {hxd != null && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, color: C.cyan, fontWeight: 700 }}>
                <TrendingUp size={13} />{num(hxd, 1)} h/día
              </div>
            )}
            {ultima && (
              <div style={{ fontSize: 10.5, color: C.slate, marginTop: hxd != null ? 4 : 0 }}>
                {new Date(ultima.fecha).toLocaleDateString("es-CL")}
              </div>
            )}
          </div>
        </div>

        {puedeOperar ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 10 }}>
            <div>
              <label style={{ display: "block", fontSize: 10, letterSpacing: 1.1, textTransform: "uppercase", color: C.slate, fontWeight: 700, marginBottom: 6 }}>
                <Calendar size={11} style={{ display: "inline", verticalAlign: -2, marginRight: 4 }} />Fecha
              </label>
              <input
                type="date"
                max={hoy}
                value={fechas[eq.id] ?? hoy}
                onChange={(ev) => setFechas((p) => ({ ...p, [eq.id]: ev.target.value }))}
                className="horo-input-date"
                style={{ ...inputStyle(), width: "100%", fontSize: 12.5, padding: "10px 12px" }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 10, letterSpacing: 1.1, textTransform: "uppercase", color: C.slate, fontWeight: 700, marginBottom: 6 }}>
                Nueva lectura
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type="number"
                  min={horas}
                  step="0.1"
                  placeholder={String(num(horas))}
                  value={valor}
                  onChange={(ev) => setValores((p) => ({ ...p, [eq.id]: ev.target.value }))}
                  onKeyDown={(ev) => { if (ev.key === "Enter" && hasVal) onSave(); }}
                  className="horo-input-horas"
                  style={{
                    ...inputStyle(),
                    width: "100%",
                    fontSize: 22,
                    fontWeight: 800,
                    fontFamily: "'IBM Plex Mono', monospace",
                    textAlign: "right",
                    padding: "10px 36px 10px 12px",
                    borderColor: hasVal ? C.sky : tint(meta.color, 35),
                    background: hasVal ? tint(C.sky, 6) : C.surface,
                  }}
                />
                <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 13, fontWeight: 700, color: C.steel }}>h</span>
              </div>
              {delta != null && delta > 0 && (
                <div style={{ fontSize: 11.5, color: C.cyan, fontWeight: 700, marginTop: 6, textAlign: "right" }}>
                  +{num(delta, delta % 1 ? 1 : 0)} h desde la última
                </div>
              )}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: C.slate, fontStyle: "italic" }}>Solo lectura — sin permiso de operación</div>
        )}
      </div>

      {puedeOperar && hasVal && (
        <button
          type="button"
          onClick={onSave}
          disabled={guardando}
          style={{
            ...primaryBtn,
            width: "100%",
            borderRadius: 0,
            padding: "12px 18px",
            justifyContent: "center",
            background: C.cyan,
            borderColor: C.cyan,
            fontSize: 13,
          }}
        >
          <Save size={15} />{guardando ? "Guardando…" : "Registrar lectura"}
        </button>
      )}
    </div>
  );
}

export default function Horometros({ navParams }) {
  const { profile } = useAuth();
  const [embarcaciones, setEmbarcaciones] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [lecturas, setLecturas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [okMsg, setOkMsg] = useState(null);
  const [filtro, setFiltro] = useState("all");
  const [valores, setValores] = useState({});
  const [fechas, setFechas] = useState({});
  const [histAbierto, setHistAbierto] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [ultimoLog, setUltimoLog] = useState(null);
  const [auditViols, setAuditViols] = useState(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditAbierto, setAuditAbierto] = useState(false);
  const puedeOperar = canOperate(profile?.rol);

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [em, eq, lec] = await Promise.all([
        fetchAll("embarcaciones", { order: { col: "codigo", asc: true } }),
        fetchAll("equipos", { order: { col: "id_visible", asc: true } }),
        fetchAll("lecturas_horometro", { order: { col: "fecha", asc: false } }),
      ]);
      setEmbarcaciones(em); setEquipos(eq); setLecturas(lec);
    } catch (e) { setError("No se pudieron cargar los horómetros. " + e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    if (navParams?.embFiltro) setFiltro(navParams.embFiltro);
    if (navParams?.equipoId) setHistAbierto(navParams.equipoId);
  }, [navParams?.embFiltro, navParams?.equipoId]);

  const cargarUltimoLog = useCallback(async () => {
    try {
      const rows = await fetchAll("horometro_health_log", {
        order: { col: "chequeado_en", asc: false }, limit: 1,
      });
      setUltimoLog(rows[0] ?? null);
    } catch { /* tabla puede no existir */ }
  }, []);
  useEffect(() => { cargarUltimoLog(); }, [cargarUltimoLog]);

  const byId = useMemo(() => new Map(equipos.map((e) => [e.id, e])), [equipos]);
  const lecturasDe = useCallback((id) => lecturas.filter((l) => l.equipo_id === id), [lecturas]);
  const embName = useCallback((id) => embarcaciones.find((e) => e.id === id)?.nombre || "—", [embarcaciones]);

  const equiposNave = useMemo(
    () => (filtro === "all" ? equipos : equipos.filter((e) => e.embarcacion_id === filtro)),
    [equipos, filtro]);

  const lista = useMemo(() => {
    return buildEquipoTree(equiposNave.filter((e) => puntoHorometro(e, byId) !== null));
  }, [equiposNave, byId]);

  const arbol = useArbolColapsable(lista);
  const listaVisible = lista.filter((eq) => arbol.visible(eq));

  const puntosPropios = useMemo(() => {
    return equiposNave
      .filter((e) => modoHorometro(e) === "propio")
      .map((e) => {
        const lecs = lecturasDe(e.id);
        const ultima = lecs[0];
        const dias = diasDesde(ultima?.fecha);
        const [tone, label] = toneAntiguedad(dias);
        const hxd = tendenciaHorasDia(lecs);
        return { eq: e, ultima, dias, tone, label, hxd, lecs };
      })
      .sort((a, b) => compararPuntosHorometro(a.eq, b.eq, embName));
  }, [equiposNave, lecturasDe, embName]);

  const kpis = useMemo(() => {
    const puntos = equiposNave.filter((e) => modoHorometro(e) === "propio");
    const dias = puntos.map((e) => diasDesde(lecturasDe(e.id)[0]?.fecha));
    return {
      puntos: puntos.length,
      alDia: dias.filter((d) => d != null && d <= 7).length,
      atrasados: dias.filter((d) => d == null || d > 30).length,
      pendientesLectura: dias.filter((d) => d == null || d > 7).length,
    };
  }, [equiposNave, lecturasDe]);

  const pendientes = Object.entries(valores).filter(([, v]) => String(v).trim() !== "");
  const heroVariant = kpis.atrasados > 0 ? "critical" : kpis.pendientesLectura > 0 ? "warn" : "ok";

  async function guardarLecturas(soloIds = null) {
    const entries = Object.entries(valores).filter(([, v]) => String(v).trim() !== "");
    const aGuardar = soloIds ? entries.filter(([id]) => soloIds.includes(id)) : entries;
    if (!aGuardar.length) return;
    setGuardando(true); setError(null); setOkMsg(null);
    const guardadas = [];
    try {
      for (const [puntoId, valor] of aGuardar) {
        const eq = byId.get(puntoId);
        if (!eq) continue;

        const horas = Number(valor);
        const fechaLec = fechas[puntoId] ? new Date(fechas[puntoId] + "T12:00:00") : new Date();
        const todasLecs = lecturasDe(puntoId);
        const ultimaFecha = todasLecs[0]?.fecha ? new Date(todasLecs[0].fecha) : null;
        const esRetroactiva = ultimaFecha !== null && fechaLec < ultimaFecha;
        const lecPrev = esRetroactiva
          ? (todasLecs.find((l) => new Date(l.fecha) <= fechaLec) ?? null)
          : (todasLecs[0] ?? null);
        const v = validarLectura({
          horasPrev: lecPrev ? Number(lecPrev.horas) : (eq.horas_actual ?? null),
          fechaPrev: lecPrev?.fecha ?? null,
          horas,
        });
        if (!v.ok) { setError(`${eq.id_visible}: ${v.error}`); continue; }
        if (v.warning && !window.confirm(`${eq.id_visible} · ${eq.sistema}\n\n${v.warning}\n\n¿Guardar de todas formas?`)) continue;

        const row = await insertRow("lecturas_horometro", profile.empresa_id, {
          equipo_id: puntoId, horas,
          horas_anterior: lecPrev ? Number(lecPrev.horas) : (eq.horas_actual ?? null),
          fuente: "manual", usuario_id: profile.id, usuario_nombre: profile.nombre || "",
          fecha: fechaLec.toISOString(),
        });

        const ids = idsBajoPunto(puntoId, equipos, byId);
        if (!esRetroactiva) {
          setEquipos((p) => p.map((x) => ids.includes(x.id) ? { ...x, horas_actual: horas } : x));
        }

        setLecturas((p) => [row, ...p]);
        setValores((p) => { const n = { ...p }; delete n[puntoId]; return n; });
        setFechas((p) => { const n = { ...p }; delete n[puntoId]; return n; });
        guardadas.push(esRetroactiva
          ? `${eq.id_visible} (historial ${fechas[puntoId]})`
          : `${eq.id_visible} (+${ids.length - 1} comp.)`);
      }
      if (guardadas.length) {
        setOkMsg(`${guardadas.length} lectura(s) guardada(s) y propagada(s): ${guardadas.join(", ")}`);
        logActivity(profile, "Registrar lecturas de horómetro", guardadas.join(", "));
      }
    } catch (e) { setError("No se pudo guardar: " + e.message); }
    finally { setGuardando(false); }
  }

  async function guardarUna(puntoId) {
    await guardarLecturas([puntoId]);
  }

  async function verificarAhora() {
    setAuditLoading(true);
    try {
      const viols = await rpcCall("fn_audit_horometro", { p_empresa_id: profile.empresa_id });
      setAuditViols(viols);
      setAuditAbierto(true);
    } catch (e) { setError("Auditoría de horómetro: " + e.message); }
    finally { setAuditLoading(false); }
  }

  const tieneVivo = auditViols !== null;
  const nViols = tieneVivo ? auditViols.length : (ultimoLog?.n_violaciones ?? null);
  const sev = nViols === null ? null : nViols === 0 ? "ok" : nViols <= 2 ? "aviso" : "critico";
  const sevColor = { ok: C.green, aviso: C.yellow, critico: C.red }[sev] ?? C.steel;
  const sevLabel = { ok: "Sin violaciones", aviso: `${nViols} aviso(s)`, critico: `${nViols} violación(es) crítica(s)` }[sev];
  const fechaStr = tieneVivo ? "ahora"
    : ultimoLog ? new Date(ultimoLog.chequeado_en).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" }) : null;
  const TIPO_META = {
    horas_desincronizadas: { label: "Desincronización", tone: "red" },
    pm_silenciado: { label: "PM silenciado", tone: "yellow" },
    fuente_huerfana: { label: "Fuente huérfana", tone: "red" },
  };

  return (
    <ModuleShell
      kicker="Operación · Dato crítico de flota"
      title="Horómetros"
      sub="Registra las horas de operación en motores y generadores. Una lectura alimenta PM, MTBF, Weibull, CGM y toda la cadena de mantenimiento."
      loading={loading}
      error={error}
      onRetry={cargar}
      action={puedeOperar && (
        <button
          onClick={guardarLecturas}
          disabled={guardando || !pendientes.length}
          style={{
            ...primaryBtn,
            padding: "11px 20px",
            fontSize: 14,
            background: pendientes.length ? C.cyan : undefined,
            borderColor: pendientes.length ? C.cyan : undefined,
            opacity: pendientes.length ? 1 : 0.55,
            boxShadow: pendientes.length ? `0 6px 20px ${tint(C.cyan, 28)}` : "none",
          }}
        >
          <Save size={16} />
          {guardando ? "Guardando…" : pendientes.length ? `Guardar ${pendientes.length} lectura(s)` : "Sin cambios"}
        </button>
      )}
      toolbar={(
        <Toolbar
          left={(
            <>
              <FilterBtn active={filtro === "all"} onClick={() => setFiltro("all")}>
                <Ship size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />Todas
              </FilterBtn>
              {embarcaciones.map((v) => (
                <FilterBtn key={v.id} active={filtro === v.id} onClick={() => setFiltro(v.id)} color={v.color}>{v.nombre}</FilterBtn>
              ))}
            </>
          )}
          right={puntosPropios.length > 0 && (
            <span style={{ fontSize: 12, color: C.slate, fontWeight: 600 }}>
              {puntosPropios.length} punto{puntosPropios.length !== 1 ? "s" : ""} de horómetro
            </span>
          )}
        />
      )}
    >
      <style>{`
        .horo-lectura-card:hover { transform: translateY(-1px); }
        .horo-lectura-card:focus-within { box-shadow: 0 0 0 2px color-mix(in srgb, ${C.sky} 25%, transparent), ${shadow.md}; }
        .horo-input-horas:focus { outline: none; border-color: ${C.sky} !important; box-shadow: 0 0 0 3px ${tint(C.sky, 18)}; }
        .horo-input-date:focus { outline: none; border-color: ${C.cyan} !important; box-shadow: 0 0 0 3px ${tint(C.cyan, 15)}; }
        .horo-bandeja { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
        @media (max-width: 640px) { .horo-bandeja { grid-template-columns: 1fr; } }
      `}</style>

      {okMsg && (
        <Card style={{
          marginBottom: 16, padding: "12px 18px",
          border: `1px solid ${tint(C.green, 40)}`, background: tint(C.green, 8),
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <CheckCircle2 size={18} color={C.green} />
          <span style={{ fontSize: 13, color: C.green, fontWeight: 600 }}>{okMsg}</span>
        </Card>
      )}

      <StatGrid
        hero={(
          <HeroStat
            variant={heroVariant}
            icon={Timer}
            label="Salud de lecturas"
            value={kpis.atrasados > 0 ? `${kpis.atrasados} atrasado${kpis.atrasados !== 1 ? "s" : ""}` : `${kpis.alDia}/${kpis.puntos} al día`}
            sub={kpis.atrasados > 0
              ? "Prioriza las tarjetas marcadas en rojo — alimentan todo el plan preventivo"
              : kpis.pendientesLectura > 0
                ? `${kpis.pendientesLectura} equipo(s) sin lectura reciente (≤7 d)`
                : "Todas las lecturas están actualizadas esta semana"}
          />
        )}
        stats={[
          { label: "Puntos de horómetro", value: kpis.puntos, sub: "motores y generadores", icon: Timer, tone: C.steel },
          { label: "Lectura al día", value: kpis.alDia, sub: "actualizado ≤7 días", icon: CheckCircle2, tone: C.green },
          { label: "Sin lectura / atrasados", value: kpis.atrasados, sub: ">30 días o nunca", icon: AlertCircle, tone: kpis.atrasados ? C.red : C.green },
        ]}
      />

      {/* Supervisor compacto */}
      <Card style={{
        marginBottom: 20, padding: "12px 16px",
        border: sev && sev !== "ok" ? `1px solid ${tint(sevColor, 35)}` : `1px solid ${C.foam}`,
        background: sev && sev !== "ok" ? tint(sevColor, 5) : C.surface,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <ShieldCheck size={16} color={sev ? sevColor : C.steel} />
            <span style={{ fontSize: 12.5, fontWeight: 700, color: C.ink }}>Integridad del horómetro</span>
            {sev && <Pill tone={sev === "ok" ? "green" : sev === "aviso" ? "yellow" : "red"}>{sevLabel}</Pill>}
            {fechaStr && <span style={{ fontSize: 11, color: C.slate }}>· {fechaStr}</span>}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {auditAbierto && (
              <button type="button" onClick={() => { setAuditAbierto(false); setAuditViols(null); }} style={{ ...ghostBtn, fontSize: 12, padding: "6px 12px" }}>
                Cerrar
              </button>
            )}
            <button type="button" onClick={verificarAhora} disabled={auditLoading} style={{ ...ghostBtn, fontSize: 12, padding: "6px 12px", color: C.cyan, borderColor: tint(C.cyan, 35) }}>
              <ShieldCheck size={13} />{auditLoading ? "Verificando…" : "Verificar ahora"}
            </button>
          </div>
        </div>
        {auditAbierto && auditViols !== null && (
          <div style={{ marginTop: 12, borderTop: `1px solid ${C.foam}`, paddingTop: 10 }}>
            {auditViols.length === 0 ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.green, fontSize: 13, fontWeight: 600 }}>
                <CheckCircle2 size={15} />Todo correcto — sin violaciones en el flujo de horas.
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead><tr>
                  {["Tipo", "Equipo", "Actual", "Esperadas", "Detalle"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "4px 10px", fontSize: 10.5, textTransform: "uppercase", color: C.slate }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {auditViols.map((v, i) => {
                    const m = TIPO_META[v.tipo_violacion] ?? { label: v.tipo_violacion, tone: "slate" };
                    return (
                      <tr key={i} style={{ borderTop: `1px solid ${C.foam}` }}>
                        <td style={{ padding: "6px 10px" }}><Pill tone={m.tone}>{m.label}</Pill></td>
                        <td style={{ padding: "6px 10px", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700 }}>{v.id_visible}</td>
                        <td style={{ padding: "6px 10px", fontFamily: "'IBM Plex Mono', monospace" }}>{v.horas_actual != null ? `${v.horas_actual} h` : "—"}</td>
                        <td style={{ padding: "6px 10px", fontFamily: "'IBM Plex Mono', monospace" }}>{v.horas_esperadas != null ? `${v.horas_esperadas} h` : "—"}</td>
                        <td style={{ padding: "6px 10px", color: C.slate, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={v.detalle}>{v.detalle}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </Card>

      {puntosPropios.length === 0 ? (
        <Section title="Bandeja de lectura" description="Sin puntos de horómetro en este filtro">
          <Empty>
            <Timer size={32} color={C.line} style={{ marginBottom: 10 }} /><br />
            Sin equipos con horómetro propio. Ve a <strong>Equipos</strong> → <strong>⚙ Config. operacional</strong> y asigna <em>Punto propio</em> a motores y generadores.
          </Empty>
        </Section>
      ) : (
        <Section
          title="Bandeja de lectura"
          description="Ingresa las horas en el orden operacional de la flota — Motor principal, generadores y compresor. La lectura se propaga al subárbol automáticamente."
          padding={18}
          style={{ marginBottom: 20 }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            <Zap size={15} color={C.cyan} />
            <span style={{ fontSize: 12.5, color: C.slate, fontWeight: 600 }}>
              {kpis.atrasados > 0
                ? `${kpis.atrasados} máquina(s) requieren lectura — orden: Motor principal → Motor generador → Motor diesel → Gen. emergencia → Compresor`
                : "Orden: Motor principal · Motor generador · Motor diesel · Generador emergencia · Compresor frigorífico"}
            </span>
          </div>
          <div className="horo-bandeja">
            {puntosPropios.map((item) => (
              <HorometroLecturaCard
                key={item.eq.id}
                item={item}
                embName={embName}
                puedeOperar={puedeOperar}
                valores={valores}
                setValores={setValores}
                fechas={fechas}
                setFechas={setFechas}
                onSave={() => guardarUna(item.eq.id)}
                guardando={guardando}
              />
            ))}
          </div>
        </Section>
      )}

      {/* Jerarquía de herencia */}
      {listaVisible.length > 0 && (
        <Section
          title="Jerarquía de herencia"
          description="Componentes que heredan horas del motor o generador ascendiente"
          padding={0}
        >
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.foam}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <BotonesColapsar conHijos={arbol.conHijos} colapsarTodo={arbol.colapsarTodo} />
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
              <thead><tr>
                <th style={thStyle}>Sistema / Equipo</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Horas</th>
                <th style={thStyle}>Origen</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Tendencia</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Hist.</th>
              </tr></thead>
              <tbody>
                {listaVisible.map((eq) => {
                  const modo = modoHorometro(eq);
                  const puntoId = puntoHorometro(eq, byId);
                  const esPropio = modo === "propio";
                  const punto = puntoId ? byId.get(puntoId) : null;
                  const horas = punto?.horas_actual ?? null;
                  const tieneHijos = arbol.tieneHijos(eq);
                  const colapsado = arbol.estaColapsado(eq);
                  const nSub = arbol.nSubDe(eq);
                  const lecs = esPropio ? lecturasDe(eq.id) : [];
                  const ultima = lecs[0];
                  const dias = esPropio ? diasDesde(ultima?.fecha) : null;
                  const [tone, label] = toneAntiguedad(dias);
                  const hxd = esPropio ? tendenciaHorasDia(lecs) : null;
                  const abierto = histAbierto === eq.id;
                  return ([
                    <tr key={eq.id} style={{ background: fondoTipo(eq) }}>
                      <td style={tdStyle}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: eq.depth * 16 }}>
                          <span style={{ width: 3, height: 16, borderRadius: 2, background: colorTipo(eq), flexShrink: 0 }} />
                          {tieneHijos ? (
                            <button type="button" onClick={() => arbol.toggle(eq.id)} title={colapsado ? "Expandir" : "Colapsar"}
                              style={{ background: "none", border: "none", cursor: "pointer", color: C.steel, padding: 0, display: "flex" }}>
                              {colapsado ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                            </button>
                          ) : eq.depth > 0 ? <CornerDownRight size={14} color={C.slate} /> : <span style={{ width: 16 }} />}
                          <div style={{ minWidth: 0 }}>
                            <span style={{ fontWeight: eq.depth === 0 ? 700 : 600, color: C.abyss, fontSize: 13 }}>{eq.sistema}</span>
                            <span style={{ fontSize: 11, color: C.slate, marginLeft: 7, fontFamily: "'IBM Plex Mono', monospace" }}>{eq.id_visible}</span>
                            {colapsado && nSub > 0 && <span style={{ fontSize: 11, color: C.steel, marginLeft: 7 }}>▸ {nSub}</span>}
                          </div>
                        </div>
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 13, color: C.steel }}>
                        {horas != null ? `${num(horas)} h` : "—"}
                      </td>
                      <td style={tdStyle}>
                        {esPropio ? (
                          <><Pill tone={tone}>{label}</Pill>
                            {ultima && <span style={{ marginLeft: 8, fontSize: 11, color: C.slate }}>{new Date(ultima.fecha).toLocaleDateString("es-CL")}</span>}
                          </>
                        ) : (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, color: C.cyan }}>
                            <CornerDownRight size={12} /> de {punto?.sistema || "—"}
                          </span>
                        )}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        {hxd != null ? <span style={{ fontWeight: 700, color: C.cyan, fontFamily: "'IBM Plex Mono', monospace" }}>{num(hxd, 1)} h/día</span> : <span style={{ color: C.line }}>—</span>}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        {esPropio && (
                          <button type="button" onClick={() => setHistAbierto(abierto ? null : eq.id)} disabled={!lecs.length}
                            style={{
                              background: abierto ? C.steel : "none",
                              border: `1px solid ${abierto ? C.steel : C.line}`,
                              borderRadius: 6, cursor: lecs.length ? "pointer" : "default",
                              color: abierto ? "#fff" : (lecs.length ? C.steel : C.line),
                              padding: "3px 8px", display: "inline-flex", alignItems: "center", gap: 4,
                            }}>
                            <History size={13} /> {lecs.length || ""}
                          </button>
                        )}
                      </td>
                    </tr>,
                    abierto && (
                      <tr key={eq.id + "-h"}>
                        <td colSpan={5} style={{ padding: "10px 18px 14px", background: tint(C.steel, 6), borderBottom: `1px solid ${C.line}` }}>
                          <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead><tr>
                              {["Fecha", "Horas", "Δ desde anterior", "Registrada por", "Nota"].map((h) => (
                                <th key={h} style={{ textAlign: "left", padding: "4px 10px", fontSize: 10.5, textTransform: "uppercase", color: C.slate }}>{h}</th>
                              ))}
                            </tr></thead>
                            <tbody>
                              {lecs.slice(0, 12).map((l) => (
                                <tr key={l.id}>
                                  <td style={{ padding: "4px 10px", fontSize: 12 }}>{new Date(l.fecha).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" })}</td>
                                  <td style={{ padding: "4px 10px", fontSize: 12, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700 }}>{num(l.horas)} h</td>
                                  <td style={{ padding: "4px 10px", fontSize: 12, color: C.cyan, fontFamily: "'IBM Plex Mono', monospace" }}>{l.horas_anterior != null ? `+${num(Number(l.horas) - Number(l.horas_anterior))} h` : "—"}</td>
                                  <td style={{ padding: "4px 10px", fontSize: 12 }}>{l.usuario_nombre || "—"}</td>
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
        </Section>
      )}

      {pendientes.length > 0 && puedeOperar && (
        <div style={{
          position: "sticky", bottom: 16, zIndex: 25, marginTop: 8,
          animation: "cmms-fade-in .25s ease both",
        }}>
          <Card style={{
            padding: "14px 20px",
            display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
            border: `1px solid ${tint(C.cyan, 35)}`,
            background: `linear-gradient(135deg, ${tint(C.cyan, 12)} 0%, ${C.surface} 55%)`,
            boxShadow: `0 12px 40px ${tint(C.abyss, 18)}, 0 0 0 1px ${tint(C.cyan, 12)}`,
          }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", color: C.cyan, fontWeight: 700 }}>Listo para guardar</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: C.abyss, marginTop: 4 }}>
                {pendientes.length} lectura{pendientes.length !== 1 ? "s" : ""} pendiente{pendientes.length !== 1 ? "s" : ""}
              </div>
            </div>
            <button
              type="button"
              onClick={guardarLecturas}
              disabled={guardando}
              style={{
                ...primaryBtn,
                padding: "12px 24px",
                fontSize: 14,
                background: C.cyan,
                borderColor: C.cyan,
                boxShadow: `0 6px 18px ${tint(C.cyan, 30)}`,
              }}
            >
              <Save size={16} />{guardando ? "Guardando y propagando…" : "Guardar todas las lecturas"}
            </button>
          </Card>
        </div>
      )}

      <GuiaColapsable titulo="¿Cómo funciona la herencia de horómetro?" icon={Timer}>
        <ul style={{ margin: 0, paddingLeft: 18, color: C.slate }}>
          <li><strong>Configurar equipos</strong>: ve a <strong>Equipos</strong> → botón <strong>⚙ Config. operacional</strong> por fila. Ahí defines Propio / Hereda / No aplica.</li>
          <li><strong>Propio</strong>: máquina con horómetro real (Motor Principal, Generador). Registra aquí en la bandeja de lectura.</li>
          <li><strong>Hereda</strong>: componentes usan las horas del motor ascendiente — una lectura propaga al subárbol.</li>
          <li><strong>No aplica</strong>: estructura sin registro de horas — no aparecen en esta vista.</li>
          <li>El sistema <strong>rechaza lecturas decrecientes</strong> y advierte saltos imposibles (&gt;24 h/día).</li>
        </ul>
      </GuiaColapsable>
    </ModuleShell>
  );
}
