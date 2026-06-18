import React, { useEffect, useState, useCallback, useMemo } from "react";
import { History, Search, Download, User } from "lucide-react";
import { fetchAll } from "../lib/db";
import { C, archivo, rolLabel } from "../theme";
import {
  Card, PageHead, Pill, exportBtn, inputStyle, thStyle, tdStyle, Empty, ErrorBanner, InlineSpinner,
} from "../ui";

function fechaCompacta(ts) {
  const d = new Date(ts);
  return d.toLocaleString("es-CL", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}
// Color por categoría de acción (heurístico sobre la primera palabra)
function tonoAccion(accion = "") {
  const a = accion.toLowerCase();
  if (a.startsWith("crear")) return "green";
  if (a.startsWith("eliminar")) return "red";
  if (a.startsWith("editar") || a.startsWith("actualizar")) return "yellow";
  if (a.startsWith("recibir") || a.startsWith("registrar")) return "cyan";
  if (a.startsWith("aprobar") || a.startsWith("avanzar")) return "purple";
  if (a.startsWith("rechazar") || a.startsWith("cerrar")) return "slate";
  return "steel";
}

export default function Bitacora() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [dias, setDias] = useState(30);

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try { setEntries(await fetchAll("bitacora", { order: { col: "fecha", asc: false } })); }
    catch (e) { setError("No se pudo cargar la bitácora. " + e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const desde = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() - dias); return d.getTime();
  }, [dias]);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return entries.filter((e) => {
      if (new Date(e.fecha).getTime() < desde) return false;
      if (!q) return true;
      return (e.accion || "").toLowerCase().includes(q)
        || (e.detalle || "").toLowerCase().includes(q)
        || (e.usuario_nombre || "").toLowerCase().includes(q);
    });
  }, [entries, busqueda, desde]);

  const hoyMS = new Date(); hoyMS.setHours(0, 0, 0, 0);
  const hoy = entries.filter((e) => new Date(e.fecha) >= hoyMS).length;
  const semanaMS = Date.now() - 7 * 86400000;
  const semana = entries.filter((e) => new Date(e.fecha).getTime() >= semanaMS).length;
  const usuarios = useMemo(() => {
    const m = {};
    entries.forEach((e) => { if (e.usuario_nombre) m[e.usuario_nombre] = (m[e.usuario_nombre] || 0) + 1; });
    const ranked = Object.entries(m).sort((a, b) => b[1] - a[1]);
    return { top: ranked[0]?.[0] || "—", topN: ranked[0]?.[1] || 0, total: ranked.length };
  }, [entries]);

  function exportar() {
    const filas = [["Fecha", "Usuario", "Rol", "Acción", "Detalle"],
      ...filtradas.map((e) => [fechaCompacta(e.fecha), e.usuario_nombre, rolLabel(e.rol), e.accion, e.detalle])];
    const csv = filas.map((r) => r.map((c) => { const s = String(c ?? ""); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(";")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "bitacora.csv"; a.click();
  }

  if (loading) return <div><PageHead kicker="Auditoría" title="Bitácora de Actividad" /><Card><InlineSpinner label="Cargando bitácora…" /></Card></div>;

  return (
    <div>
      <PageHead kicker="Auditoría · Trazabilidad" title="Bitácora de Actividad"
        sub="Todo lo que se hace en el sistema queda registrado: quién, cuándo y qué. Solo lectura — no se puede editar ni borrar."
        action={<button onClick={exportar} style={exportBtn}><Download size={15} /> Exportar</button>} />

      <ErrorBanner onRetry={cargar}>{error}</ErrorBanner>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 16 }}>
        <KPI label="Eventos totales" value={entries.length} />
        <KPI label="Hoy" value={hoy} tone={C.steel} />
        <KPI label="Últimos 7 días" value={semana} tone={C.steel} />
        <KPI label="Usuario más activo" value={usuarios.top} sub={`${usuarios.topN} acciones · ${usuarios.total} usuarios`} />
      </div>

      <Card style={{ marginBottom: 14, padding: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, alignItems: "center" }}>
          <div style={{ position: "relative" }}>
            <Search size={14} color={C.slate} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar en acción, detalle o usuario…"
              style={{ ...inputStyle(), paddingLeft: 34 }} />
          </div>
          <select value={dias} onChange={(e) => setDias(+e.target.value)} style={inputStyle()}>
            <option value={1}>Últimas 24 horas</option>
            <option value={7}>Últimos 7 días</option>
            <option value={30}>Últimos 30 días</option>
            <option value={90}>Últimos 90 días</option>
            <option value={3650}>Todo el historial</option>
          </select>
        </div>
      </Card>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 880 }}>
            <thead><tr>
              <th style={thStyle}>Fecha</th><th style={thStyle}>Usuario</th><th style={thStyle}>Rol</th>
              <th style={thStyle}>Acción</th><th style={thStyle}>Detalle</th>
            </tr></thead>
            <tbody>
              {filtradas.length === 0 ? <tr><td colSpan={5}><Empty>
                <History size={32} color={C.line} style={{ marginBottom: 10 }} /><br />
                {entries.length === 0 ? "Aún no hay actividad registrada." : "Sin eventos en el filtro actual."}
              </Empty></td></tr> :
                filtradas.slice(0, 200).map((e) => (
                  <tr key={e.id}>
                    <td style={{ ...tdStyle, fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, whiteSpace: "nowrap" }}>{fechaCompacta(e.fecha)}</td>
                    <td style={tdStyle}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <User size={12} color={C.slate} />
                        <span style={{ fontWeight: 600 }}>{e.usuario_nombre || "Sistema"}</span>
                      </div>
                    </td>
                    <td style={{ ...tdStyle, fontSize: 12, color: C.slate }}>{rolLabel(e.rol)}</td>
                    <td style={tdStyle}><Pill tone={tonoAccion(e.accion)}>{e.accion}</Pill></td>
                    <td style={{ ...tdStyle, fontSize: 12.5, color: C.slate }}>{e.detalle}</td>
                  </tr>))}
            </tbody>
          </table>
        </div>
        {filtradas.length > 200 && (
          <div style={{ padding: "10px 16px", textAlign: "center", fontSize: 11.5, color: C.slate, borderTop: `1px solid ${C.foam}` }}>
            Mostrando los 200 más recientes de {filtradas.length} eventos. Usa la búsqueda o el rango de fechas para refinar.
          </div>
        )}
      </Card>
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
