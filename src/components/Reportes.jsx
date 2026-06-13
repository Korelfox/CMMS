import React, { useState, useCallback } from "react";
import { FileText, Printer, ClipboardList, Package, Calendar, Gauge, ClipboardCheck, BookOpen } from "lucide-react";
import { useAuth } from "../lib/auth";
import { fetchAll } from "../lib/db";
import { imprimirInforme } from "../lib/imprimir";
import { C, archivo, clp, num, rolLabel, TIPOS_OT, PRIORIDADES, ESTADOS_OT, lk } from "../theme";
import {
  Card, PageHead, Pill, primaryBtn, ghostBtn, thStyle, tdStyle, Empty, ErrorBanner, InlineSpinner,
} from "../ui";
import { renderMarkdown } from "./Markdown";

const REPORTES = [
  { id: "kpis",     titulo: "KPIs y Confiabilidad", icon: Gauge,         desc: "Disponibilidad, MTBF, MTTR, costos por embarcación." },
  { id: "ots",      titulo: "Órdenes de Trabajo",   icon: ClipboardList, desc: "Listado completo con tipo, costos, MTTR y estado." },
  { id: "inv",      titulo: "Inventario y Stock",   icon: Package,       desc: "Catálogo con clasificación ABC, stock total y valor." },
  { id: "programa", titulo: "Programa Semanal",     icon: Calendar,      desc: "Tareas programadas por día con HH y cumplimiento." },
  { id: "prezarpes", titulo: "Prezarpes",           icon: ClipboardCheck, desc: "Inspecciones de prezarpe por embarcación, con veredicto y abastecimiento." },
  { id: "informes", titulo: "Informes Ejecutivos",  icon: BookOpen,      desc: "Historial de informes generados por IA. Consulta y reimprime cualquier informe anterior." },
];

function fechaLarga() {
  return new Date().toLocaleDateString("es-CL", { day: "2-digit", month: "long", year: "numeric" });
}

export default function Reportes() {
  const { profile, empresa } = useAuth();
  const [tipo, setTipo] = useState(null);
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const cargar = useCallback(async (t) => {
    setLoading(true); setError(null); setTipo(t);
    try {
      if (t === "kpis") {
        const [embs, ots] = await Promise.all([
          fetchAll("embarcaciones", { order: { col: "codigo", asc: true } }),
          fetchAll("ordenes_trabajo"),
        ]);
        setData({ embs, ots });
      } else if (t === "ots") {
        const [embs, ots] = await Promise.all([
          fetchAll("embarcaciones"),
          fetchAll("ordenes_trabajo", { order: { col: "fecha", asc: false } }),
        ]);
        setData({ embs, ots });
      } else if (t === "inv") {
        const [its, stk] = await Promise.all([
          fetchAll("inventario_items", { order: { col: "codigo", asc: true } }),
          fetchAll("stock"),
        ]);
        setData({ its, stk });
      } else if (t === "programa") {
        const [embs, prog] = await Promise.all([
          fetchAll("embarcaciones"),
          fetchAll("programacion", { order: { col: "created_at", asc: true } }),
        ]);
        setData({ embs, prog });
      } else if (t === "prezarpes") {
        const [embs, pzs] = await Promise.all([
          fetchAll("embarcaciones"),
          fetchAll("prezarpes", { order: { col: "created_at", asc: false } }),
        ]);
        setData({ embs, pzs });
      } else if (t === "informes") {
        const rows = await fetchAll("informes_ejecutivos", { order: { col: "created_at", asc: false } });
        setData({ rows });
      }
    } catch (e) { setError("No se pudo generar el reporte. " + e.message); }
    finally { setLoading(false); }
  }, []);

  if (!tipo) {
    return (
      <div>
        <PageHead kicker="Informes Imprimibles" title="Reportes"
          sub="Genera vistas listas para imprimir o exportar a PDF (con la opción 'Guardar como PDF' del navegador)." />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 14 }}>
          {REPORTES.map((r) => {
            const Icon = r.icon;
            return (
              <Card key={r.id} style={{ padding: 22, cursor: "pointer" }} onClick={() => cargar(r.id)}>
                <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12 }}>
                  <div style={{ width: 46, height: 46, borderRadius: 11, background: C.mist, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Icon size={22} color={C.steel} />
                  </div>
                  <div>
                    <div style={{ ...archivo, fontSize: 16, fontWeight: 700, color: C.abyss }}>{r.titulo}</div>
                  </div>
                </div>
                <div style={{ fontSize: 13, color: C.slate, lineHeight: 1.5 }}>{r.desc}</div>
              </Card>);
          })}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHead kicker="Reporte" title={REPORTES.find((r) => r.id === tipo)?.titulo}
        action={<div style={{ display: "flex", gap: 8 }} className="no-print">
          <button onClick={() => setTipo(null)} style={ghostBtn}>← Reportes</button>
          <button onClick={() => window.print()} style={primaryBtn}><Printer size={15} /> Imprimir</button>
        </div>} />

      <ErrorBanner onRetry={() => cargar(tipo)}>{error}</ErrorBanner>

      {loading ? <Card><InlineSpinner label="Generando…" /></Card> : (
        <div id="report-content">
          <ReportHeader empresa={empresa} profile={profile} titulo={REPORTES.find((r) => r.id === tipo)?.titulo} />
          {tipo === "kpis" && <ReporteKPIs {...data} />}
          {tipo === "ots" && <ReporteOTs {...data} />}
          {tipo === "inv" && <ReporteInv {...data} />}
          {tipo === "programa" && <ReportePrograma {...data} />}
          {tipo === "prezarpes" && <ReportePrezarpes {...data} />}
          {tipo === "informes" && <ReporteInformes rows={data.rows || []} empresa={empresa} />}
        </div>
      )}

      <style>{`
        @media print {
          @page { size: A4; margin: 12mm; }
          body { background: #fff !important; }
          .no-print { display: none !important; }
          aside, nav { display: none !important; }
          main { padding: 0 !important; }
          #report-content { padding: 0 !important; }
        }
      `}</style>
    </div>
  );
}

function ReportHeader({ empresa, profile, titulo }) {
  return (
    <Card style={{ padding: 20, marginBottom: 14, borderTop: `5px solid ${C.steel}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 10.5, letterSpacing: 2, textTransform: "uppercase", color: C.slate, fontWeight: 700 }}>{empresa?.nombre || "CMMS"}</div>
          <div style={{ ...archivo, fontSize: 22, fontWeight: 800, color: C.abyss, marginTop: 4 }}>{titulo}</div>
          {empresa?.puerto_base && <div style={{ fontSize: 12, color: C.slate, marginTop: 2 }}>{empresa.puerto_base}</div>}
        </div>
        <div style={{ textAlign: "right", fontSize: 11, color: C.slate, lineHeight: 1.7 }}>
          <div><strong>Fecha:</strong> {fechaLarga()}</div>
          <div><strong>Generado por:</strong> {profile?.nombre || "—"}</div>
          <div><strong>Rol:</strong> {rolLabel(profile?.rol)}</div>
        </div>
      </div>
    </Card>
  );
}

function ReporteKPIs({ embs = [], ots = [] }) {
  const correctivas = ots.filter((o) => o.tipo === "correctivo");
  const cerradas = ots.filter((o) => o.estado === "cerrada");
  const proactivas = ots.filter((o) => ["preventivo", "predictivo", "modificativo"].includes(o.tipo));
  const mtbf = correctivas.length ? correctivas.reduce((s, o) => s + (Number(o.hrs_oper_desde) || 0), 0) / correctivas.length : 0;
  const mttr = cerradas.length ? cerradas.reduce((s, o) => s + (Number(o.mttr_horas) || 0), 0) / cerradas.length : 0;
  const disp = (mtbf + mttr) > 0 ? (mtbf / (mtbf + mttr)) * 100 : 100;
  const propProactivo = ots.length ? (proactivas.length / ots.length) * 100 : 0;
  const costoMO = ots.reduce((s, o) => s + (Number(o.costo_mo) || 0), 0);
  const costoMat = ots.reduce((s, o) => s + (Number(o.costo_mat) || 0), 0);

  return (
    <Card>
      <div style={{ ...archivo, fontWeight: 700, fontSize: 15, color: C.abyss, marginBottom: 12 }}>Indicadores Globales</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 18 }}>
        <Big label="Disponibilidad" value={`${disp.toFixed(1)}%`} />
        <Big label="MTBF" value={`${num(mtbf, 0)}h`} />
        <Big label="MTTR" value={`${num(mttr, 1)}h`} />
        <Big label="Proactividad" value={`${propProactivo.toFixed(0)}%`} />
      </div>

      <div style={{ ...archivo, fontWeight: 700, fontSize: 15, color: C.abyss, marginBottom: 12 }}>Costos de Mantenimiento</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 18 }}>
        <Big label="Mano de Obra" value={clp(costoMO)} />
        <Big label="Materiales" value={clp(costoMat)} />
        <Big label="Costo Total" value={clp(costoMO + costoMat)} />
      </div>

      <div style={{ ...archivo, fontWeight: 700, fontSize: 15, color: C.abyss, marginBottom: 12 }}>Por Embarcación</div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr>
          <th style={thStyle}>Embarcación</th>
          <th style={{ ...thStyle, textAlign: "right" }}>OTs</th>
          <th style={{ ...thStyle, textAlign: "right" }}>Abiertas</th>
          <th style={{ ...thStyle, textAlign: "right" }}>MTBF (h)</th>
          <th style={{ ...thStyle, textAlign: "right" }}>MTTR (h)</th>
          <th style={{ ...thStyle, textAlign: "right" }}>Costo MO</th>
          <th style={{ ...thStyle, textAlign: "right" }}>Costo Mat.</th>
          <th style={{ ...thStyle, textAlign: "right" }}>Total</th>
        </tr></thead>
        <tbody>
          {embs.map((e) => {
            const eo = ots.filter((o) => o.embarcacion_id === e.id);
            const ec = eo.filter((o) => o.tipo === "correctivo");
            const ek = eo.filter((o) => o.estado === "cerrada");
            const eMtbf = ec.length ? ec.reduce((s, o) => s + (Number(o.hrs_oper_desde) || 0), 0) / ec.length : 0;
            const eMttr = ek.length ? ek.reduce((s, o) => s + (Number(o.mttr_horas) || 0), 0) / ek.length : 0;
            const eMO = eo.reduce((s, o) => s + (Number(o.costo_mo) || 0), 0);
            const eMat = eo.reduce((s, o) => s + (Number(o.costo_mat) || 0), 0);
            return (
              <tr key={e.id}>
                <td style={tdStyle}><strong>{e.nombre}</strong></td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{eo.length}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{eo.filter((o) => o.estado !== "cerrada").length}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{num(eMtbf, 0)}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{num(eMttr, 1)}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{clp(eMO)}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{clp(eMat)}</td>
                <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600 }}>{clp(eMO + eMat)}</td>
              </tr>);
          })}
          <tr style={{ background: C.mist, fontWeight: 700 }}>
            <td style={tdStyle}>TOTAL</td>
            <td style={{ ...tdStyle, textAlign: "right" }}>{ots.length}</td>
            <td style={{ ...tdStyle, textAlign: "right" }}>{ots.filter((o) => o.estado !== "cerrada").length}</td>
            <td style={{ ...tdStyle, textAlign: "right" }}>—</td>
            <td style={{ ...tdStyle, textAlign: "right" }}>—</td>
            <td style={{ ...tdStyle, textAlign: "right" }}>{clp(costoMO)}</td>
            <td style={{ ...tdStyle, textAlign: "right" }}>{clp(costoMat)}</td>
            <td style={{ ...tdStyle, textAlign: "right" }}>{clp(costoMO + costoMat)}</td>
          </tr>
        </tbody>
      </table>
    </Card>
  );
}

function ReporteOTs({ embs = [], ots = [] }) {
  const eName = (id) => embs.find((e) => e.id === id)?.nombre || "—";
  const totMO = ots.reduce((s, o) => s + (Number(o.costo_mo) || 0), 0);
  const totMat = ots.reduce((s, o) => s + (Number(o.costo_mat) || 0), 0);
  return (
    <Card>
      <div style={{ ...archivo, fontWeight: 700, fontSize: 15, color: C.abyss, marginBottom: 12 }}>
        {ots.length} órdenes de trabajo · MO {clp(totMO)} · Materiales {clp(totMat)} · Total {clp(totMO + totMat)}
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead><tr>
          <th style={thStyle}>Folio</th><th style={thStyle}>Fecha</th><th style={thStyle}>Embarcación</th>
          <th style={thStyle}>Sistema</th><th style={thStyle}>Tipo</th><th style={thStyle}>Prioridad</th>
          <th style={{ ...thStyle, textAlign: "right" }}>Costo MO</th>
          <th style={{ ...thStyle, textAlign: "right" }}>Costo Mat.</th>
          <th style={{ ...thStyle, textAlign: "right" }}>Total</th>
          <th style={thStyle}>Estado</th>
        </tr></thead>
        <tbody>
          {ots.length === 0 ? <tr><td colSpan={10}><Empty>Sin OTs registradas.</Empty></td></tr> : (
            <>
              {ots.map((o) => (
                <tr key={o.id}>
                  <td style={{ ...tdStyle, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>{o.folio}</td>
                  <td style={tdStyle}>{o.fecha}</td>
                  <td style={tdStyle}>{eName(o.embarcacion_id)}</td>
                  <td style={tdStyle}>{o.sistema}</td>
                  <td style={tdStyle}>{lk(TIPOS_OT, o.tipo)}</td>
                  <td style={tdStyle}>{lk(PRIORIDADES, o.prioridad)}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{clp(o.costo_mo || 0)}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{clp(o.costo_mat || 0)}</td>
                  <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600 }}>{clp((o.costo_mo || 0) + (o.costo_mat || 0))}</td>
                  <td style={tdStyle}>{lk(ESTADOS_OT, o.estado)}</td>
                </tr>))}
              <tr style={{ background: C.mist, fontWeight: 700 }}>
                <td style={tdStyle} colSpan={6}>TOTAL</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{clp(totMO)}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{clp(totMat)}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{clp(totMO + totMat)}</td>
                <td style={tdStyle}></td>
              </tr>
            </>
          )}
        </tbody>
      </table>
    </Card>
  );
}

function ReporteInv({ its = [], stk = [] }) {
  const enriquecidos = its.map((i) => {
    const total = stk.filter((s) => s.item_id === i.id).reduce((acc, x) => acc + (Number(x.cantidad) || 0), 0);
    return { ...i, total, valor: total * (i.precio || 0) };
  }).sort((a, b) => b.valor - a.valor);
  const totalVal = enriquecidos.reduce((s, x) => s + x.valor, 0);
  let cum = 0;
  const conABC = enriquecidos.map((x) => { cum += x.valor; const pct = totalVal ? cum / totalVal : 0; return { ...x, abc: pct <= 0.8 ? "A" : pct <= 0.95 ? "B" : "C" }; });

  return (
    <Card>
      <div style={{ ...archivo, fontWeight: 700, fontSize: 15, color: C.abyss, marginBottom: 12 }}>
        Inventario · {its.length} ítems · Valor total {clp(totalVal)}
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead><tr>
          <th style={thStyle}>Código</th><th style={{ ...thStyle, textAlign: "center" }}>ABC</th>
          <th style={thStyle}>Descripción</th><th style={thStyle}>Categoría</th>
          <th style={{ ...thStyle, textAlign: "right" }}>Stock</th>
          <th style={{ ...thStyle, textAlign: "right" }}>Mín</th>
          <th style={{ ...thStyle, textAlign: "right" }}>Precio</th>
          <th style={{ ...thStyle, textAlign: "right" }}>Valor</th>
        </tr></thead>
        <tbody>
          {conABC.map((i) => (
            <tr key={i.id}>
              <td style={{ ...tdStyle, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>{i.codigo}</td>
              <td style={{ ...tdStyle, textAlign: "center", fontWeight: 700 }}>{i.abc}</td>
              <td style={tdStyle}>{i.descripcion}</td>
              <td style={tdStyle}>{i.categoria}</td>
              <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600 }}>{i.total}</td>
              <td style={{ ...tdStyle, textAlign: "right" }}>{i.stock_min}</td>
              <td style={{ ...tdStyle, textAlign: "right" }}>{clp(i.precio)}</td>
              <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600 }}>{clp(i.valor)}</td>
            </tr>))}
        </tbody>
      </table>
    </Card>
  );
}

function ReportePrograma({ embs = [], prog = [] }) {
  const eName = (id) => embs.find((e) => e.id === id)?.nombre || "—";
  const totalHH = prog.reduce((s, x) => s + (x.hh || 0), 0);
  const done = prog.filter((x) => x.done).length;
  const cump = prog.length ? (done / prog.length) * 100 : 0;
  return (
    <Card>
      <div style={{ ...archivo, fontWeight: 700, fontSize: 15, color: C.abyss, marginBottom: 12 }}>
        Programa Semanal · {prog.length} tareas · {num(totalHH, 1)}h · {cump.toFixed(0)}% cumplimiento
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead><tr>
          <th style={thStyle}>Día</th><th style={thStyle}>Embarcación</th>
          <th style={thStyle}>Sistema</th><th style={thStyle}>Tipo</th>
          <th style={{ ...thStyle, textAlign: "right" }}>HH</th>
          <th style={thStyle}>Folio OT</th><th style={thStyle}>Estado</th>
        </tr></thead>
        <tbody>
          {prog.length === 0 ? <tr><td colSpan={7}><Empty>Sin tareas programadas.</Empty></td></tr> :
            prog.map((p) => (
              <tr key={p.id}>
                <td style={{ ...tdStyle, fontWeight: 700 }}>{p.dia}</td>
                <td style={tdStyle}>{eName(p.embarcacion_id)}</td>
                <td style={tdStyle}>{p.sistema}</td>
                <td style={tdStyle}>{p.tipo}</td>
                <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600 }}>{p.hh}h</td>
                <td style={{ ...tdStyle, fontFamily: "'IBM Plex Mono', monospace" }}>{p.ot_folio || "—"}</td>
                <td style={tdStyle}>{p.done ? "✓ Hecho" : "Pendiente"}</td>
              </tr>))}
        </tbody>
      </table>
    </Card>
  );
}

function ReportePrezarpes({ embs = [], pzs = [] }) {
  const eName = (id) => embs.find((e) => e.id === id)?.nombre || "—";
  const aptos = pzs.filter((p) => p.apto).length;
  const noAptos = pzs.length - aptos;
  return (
    <Card>
      <div style={{ ...archivo, fontWeight: 700, fontSize: 15, color: C.abyss, marginBottom: 12 }}>
        {pzs.length} prezarpes · {aptos} aptos · {noAptos} no aptos
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead><tr>
          <th style={thStyle}>Fecha</th><th style={thStyle}>Embarcación</th><th style={thStyle}>Responsable</th>
          <th style={{ ...thStyle, textAlign: "right" }}>Combustible</th>
          <th style={{ ...thStyle, textAlign: "right" }}>Agua</th>
          <th style={{ ...thStyle, textAlign: "right" }}>Aceite</th>
          <th style={thStyle}>Veredicto</th>
        </tr></thead>
        <tbody>
          {pzs.length === 0 ? <tr><td colSpan={7}><Empty>Sin prezarpes registrados.</Empty></td></tr> :
            pzs.map((p) => (
              <tr key={p.id}>
                <td style={tdStyle}>{p.fecha}</td>
                <td style={tdStyle}>{eName(p.embarcacion_id)}</td>
                <td style={tdStyle}>{p.responsable || "—"}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{p.combustible_l || 0} L</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{p.agua_l || 0} L</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{p.aceite_l || 0} L</td>
                <td style={tdStyle}><Pill tone={p.apto ? "green" : "red"}>{p.apto ? "Apto" : "No apto"}</Pill></td>
              </tr>))}
        </tbody>
      </table>
    </Card>
  );
}

function ReporteInformes({ rows = [], empresa }) {
  const [selected, setSelected] = useState(null);

  if (selected) {
    const ctx = selected.contexto_json || {};
    const ocStats = ctx.ocStats || null;
    const anio = Number((selected.fecha || "").slice(0, 4)) || new Date().getFullYear();

    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }} className="no-print">
          <button onClick={() => setSelected(null)} style={ghostBtn}>← Informes</button>
          <div style={{ ...archivo, fontSize: 17, fontWeight: 700, color: C.abyss }}>
            {selected.periodo_label} &nbsp;·&nbsp; {selected.fecha}
          </div>
          <button
            onClick={() => imprimirInforme({ contexto: ctx, ocStats, texto: selected.texto_md, hoy: selected.fecha, empresa, meses: selected.periodo_meses, anio })}
            style={{ ...primaryBtn, marginLeft: "auto" }}
          >
            <Printer size={15} /> Reimprimir
          </button>
        </div>

        <Card style={{ padding: "28px 32px" }}>
          <article style={{ maxWidth: 780 }}>
            {renderMarkdown(selected.texto_md)}
          </article>
        </Card>
      </div>
    );
  }

  return (
    <Card>
      <div style={{ ...archivo, fontWeight: 700, fontSize: 15, color: C.abyss, marginBottom: 12 }}>
        {rows.length} informe{rows.length !== 1 ? "s" : ""} guardado{rows.length !== 1 ? "s" : ""}
      </div>
      {rows.length === 0 ? (
        <Empty>
          Aún no hay informes guardados. Genera uno en{" "}
          <strong>Inteligencia → Informe Ejecutivo</strong> y pulsa el botón guardar.
        </Empty>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>
            <th style={thStyle}>Fecha</th>
            <th style={thStyle}>Período</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Naves</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Riesgo alto</th>
            <th style={{ ...thStyle, textAlign: "right" }}>PMs vencidos</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Gasto año</th>
            <th style={thStyle}></th>
          </tr></thead>
          <tbody>
            {rows.map((r) => {
              const ctx = r.contexto_json || {};
              return (
                <tr key={r.id} style={{ cursor: "pointer" }} onClick={() => setSelected(r)}>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{r.fecha}</td>
                  <td style={tdStyle}>{r.periodo_label}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{ctx.flota?.totalNaves ?? "—"}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>
                    <span style={{ color: (ctx.confiabilidad?.equiposRiesgoAlto || 0) > 0 ? C.red : C.green, fontWeight: 600 }}>
                      {ctx.confiabilidad?.equiposRiesgoAlto ?? "—"}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>
                    <span style={{ color: (ctx.mantenimiento?.pmVencidos || 0) > 0 ? C.red : C.green, fontWeight: 600 }}>
                      {ctx.mantenimiento?.pmVencidos ?? "—"}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{ctx.costos?.gastoAnioFlota != null ? clp(ctx.costos.gastoAnioFlota) : "—"}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>
                    <span style={{ fontSize: 12, color: C.cyan, fontWeight: 600 }}>Ver →</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function Big({ label, value }) {
  return (
    <div style={{ background: C.mist, padding: 14, borderRadius: 8 }}>
      <div style={{ fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase", color: C.slate, fontWeight: 700 }}>{label}</div>
      <div style={{ ...archivo, fontSize: 22, fontWeight: 800, color: C.steel, marginTop: 4 }}>{value}</div>
    </div>
  );
}
