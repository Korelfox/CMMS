import React, { useEffect, useState, useCallback } from "react";
import { CalendarClock, Check, AlertCircle } from "lucide-react";
import { useAuth } from "../lib/auth";
import { fetchAll, updateRow, logActivity } from "../lib/db";
import { buildEquipoTree } from "../lib/equipTree";
import { C, num, canOperate, PM_INTERVALS } from "../theme";
import {
  Card, PageHead, Pill, primaryBtn, ghostBtn, bluInput,
  thStyle, tdStyle, FilterBtn, Empty, ErrorBanner, InlineSpinner,
} from "../ui";

export default function PlanPM() {
  const { profile } = useAuth();
  const [embarcaciones, setEmbarcaciones] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filtro, setFiltro] = useState("all");
  const puedeOperar = canOperate(profile?.rol);

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [embs, eqs] = await Promise.all([
        fetchAll("embarcaciones", { order: { col: "codigo", asc: true } }),
        fetchAll("equipos", { order: { col: "id_visible", asc: true } }),
      ]);
      setEmbarcaciones(embs); setEquipos(eqs);
    } catch (e) {
      setError("No se pudieron cargar los datos. " + e.message);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  function embName(id) { return embarcaciones.find((e) => e.id === id)?.nombre || "â€”"; }
  const lista = buildEquipoTree(filtro === "all" ? equipos : equipos.filter((e) => e.embarcacion_id === filtro));

  function statusInterval(elapsed, iv) {
    if (elapsed >= iv) return ["red", "Vencido"];
    if (elapsed >= iv * 0.9) return ["yellow", "PrÃ³ximo"];
    return ["green", "OK"];
  }

  function onChangeLocal(id, campo, valor) {
    setEquipos((p) => p.map((e) => (e.id === id ? { ...e, [campo]: valor } : e)));
  }
  async function commit(id, campo, valor) {
    const previo = equipos.find((e) => e.id === id)?.[campo];
    if (previo === valor) return;
    onChangeLocal(id, campo, valor);
    try { await updateRow("equipos", id, { [campo]: valor }); }
    catch (e) { onChangeLocal(id, campo, previo); setError("No se pudo guardar: " + e.message); }
  }

  // Registrar que se realizÃ³ el PM: hrs Ãºlt. PM = hrs actuales, fecha = hoy
  async function registrarPM(eq) {
    if (!window.confirm(`Â¿Registrar mantenimiento preventivo de "${eq.sistema}" a las ${num(eq.horas_actual)}h? Esto reinicia el contador de horas.`)) return;
    const previo = { horas_ult_pm: eq.horas_ult_pm, fecha_ult_pm: eq.fecha_ult_pm };
    const hoy = new Date().toISOString().slice(0, 10);
    setEquipos((p) => p.map((e) => (e.id === eq.id ? { ...e, horas_ult_pm: e.horas_actual, fecha_ult_pm: hoy } : e)));
    try {
      await updateRow("equipos", eq.id, { horas_ult_pm: eq.horas_actual, fecha_ult_pm: hoy });
      logActivity(profile, "Registrar PM", `${eq.id_visible} Â· ${eq.sistema} a ${num(eq.horas_actual)}h`);
    } catch (e) {
      setEquipos((p) => p.map((x) => (x.id === eq.id ? { ...x, ...previo } : x)));
      setError("No se pudo registrar el PM: " + e.message);
    }
  }

  if (loading) return <div><PageHead kicker="Mantenimiento Preventivo" title="Plan Preventivo" /><Card><InlineSpinner label="Cargando plan preventivoâ€¦" /></Card></div>;

  if (equipos.length === 0) {
    return (
      <div>
        <PageHead kicker="Mantenimiento Preventivo" title="Plan Preventivo" />
        <ErrorBanner onRetry={cargar}>{error}</ErrorBanner>
        <Card><Empty>
          <AlertCircle size={32} color={C.amber} style={{ marginBottom: 10 }} /><br />
          No hay equipos registrados. Ve al mÃ³dulo <strong>Equipos</strong> y carga la maquinaria de tu flota; aquÃ­ aparecerÃ¡ su plan preventivo.
        </Empty></Card>
      </div>
    );
  }

  return (
    <div>
      <PageHead kicker="Mantenimiento Preventivo Â· Mora GutiÃ©rrez" title="Plan Preventivo"
        sub="Intervalos 50h / 100h / 250h / 500h. Ingresa las horas y los semÃ¡foros se calculan solos. Al hacer el PM, pulsa âœ“ para reiniciar el contador." />

      <ErrorBanner onRetry={cargar}>{error}</ErrorBanner>

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
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1020 }}>
            <thead><tr>
              <th style={thStyle}>Equipo</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Hrs Act.</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Hrs Ãšlt. PM</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Transcurridas</th>
              {PM_INTERVALS.map((iv) => <th key={iv} style={{ ...thStyle, textAlign: "center" }}>{iv}h</th>)}
              <th style={{ ...thStyle, textAlign: "center" }}>Prioridad</th>
              {puedeOperar && <th style={{ ...thStyle, textAlign: "center" }}>PM</th>}
            </tr></thead>
            <tbody>
              {lista.map((e) => {
                const elapsed = (e.horas_actual || 0) - (e.horas_ult_pm || 0);
                const estados = PM_INTERVALS.map((iv) => statusInterval(elapsed, iv));
                const prio = estados.some((s) => s[1] === "Vencido") ? ["red", "Alta"]
                  : estados.some((s) => s[1] === "PrÃ³ximo") ? ["yellow", "Media"] : ["green", "Baja"];
                return (
                  <tr key={e.id}>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 600 }}>{e.sistema}</div>
                      <div style={{ fontSize: 11, color: C.slate }}>{embName(e.embarcacion_id)} Â· <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{e.id_visible}</span></div>
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right" }}><input type="number" value={e.horas_actual} disabled={!puedeOperar} onChange={(ev) => onChangeLocal(e.id, "horas_actual", +ev.target.value)} onBlur={(ev) => commit(e.id, "horas_actual", +ev.target.value)} style={{ ...bluInput, width: 84, textAlign: "right" }} /></td>
                    <td style={{ ...tdStyle, textAlign: "right" }}><input type="number" value={e.horas_ult_pm} disabled={!puedeOperar} onChange={(ev) => onChangeLocal(e.id, "horas_ult_pm", +ev.target.value)} onBlur={(ev) => commit(e.id, "horas_ult_pm", +ev.target.value)} style={{ ...bluInput, width: 84, textAlign: "right" }} /></td>
                    <td style={{ ...tdStyle, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>{num(elapsed)}h</td>
                    {estados.map(([tone, label], i) => <td key={i} style={{ ...tdStyle, textAlign: "center" }}><Pill tone={tone}>{label}</Pill></td>)}
                    <td style={{ ...tdStyle, textAlign: "center" }}><Pill tone={prio[0]}>{prio[1]}</Pill></td>
                    {puedeOperar && <td style={{ ...tdStyle, textAlign: "center" }}>
                      <button onClick={() => registrarPM(e)} title="Registrar PM realizado" style={{ width: 30, height: 30, borderRadius: 7, border: `1.5px solid ${C.green}`, background: "#fff", color: C.green, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Check size={15} /></button>
                    </td>}
                  </tr>);
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card style={{ marginTop: 16, background: C.mist }}>
        <div style={{ fontSize: 12.5, color: C.slate, lineHeight: 1.7 }}>
          <strong style={{ color: C.ink }}>CÃ³mo funciona:</strong> "Transcurridas" = Horas actuales âˆ’ Horas Ãºltima PM. Cada intervalo se evalÃºa contra ese valor.
          {" "}<Pill tone="green">OK</Pill> al dÃ­a Â· <Pill tone="yellow">PrÃ³ximo</Pill> â‰¥ 90% del intervalo Â· <Pill tone="red">Vencido</Pill> alcanzado o superado.
          {" "}El botÃ³n <strong style={{ color: C.ink }}>âœ“</strong> registra el PM hecho y reinicia el contador.
        </div>
      </Card>
    </div>
  );
}


