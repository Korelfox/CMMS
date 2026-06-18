import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  Plus, Trash2, Check, X, ShoppingCart, PackagePlus, Search, AlertCircle,
  AlertTriangle, Printer, Eye, Edit2, Ban, SquarePen, List, Columns3, Table2,
} from "lucide-react";
import { insertRow, updateRow, deleteRow, upsertRow, fetchAll, logActivity } from "../../lib/db";
import { C, archivo, clp, isAdmin, tint } from "../../theme";
import { Card, Pill, primaryBtn, ghostBtn, FilterBtn, inputStyle, bluInput, thStyle, tdStyle, Field, Empty, Section, EmptyState } from "../../ui";
import ComprasKanban from "./ComprasKanban";
import ComprasQueuePanel from "./ComprasQueuePanel";
import { ordenarOCs } from "../../lib/comprasKanban";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { HOY, skey } from "./util";

const VISTA_KEY = "cmms-almacen-compras-vista";
const VISTAS = [
  { id: "cola", label: "Cola", icon: List },
  { id: "kanban", label: "Kanban", icon: Columns3 },
  { id: "tabla", label: "Tabla", icon: Table2 },
];

// ── Constantes del módulo ─────────────────────────────────────
const URGENCIAS = [
  { value: "normal",  label: "Normal",  color: C.slate },
  { value: "urgente", label: "Urgente", color: C.amber },
  { value: "critico", label: "Crítico", color: C.red   },
];
const CONDICIONES_PAGO = ["Contado", "15 días", "30 días", "45 días", "60 días", "90 días"];
const MONEDAS          = ["CLP", "USD", "EUR"];

const FORM_EMPTY = (bodegas) => ({
  proveedor: "", proveedor_contacto: "", proveedor_email: "",
  bodega_destino: bodegas[0]?.id || "",
  lead_dias: 7, fecha_entrega_esperada: "",
  ref_proveedor: "", notas: "",
  urgencia: "normal", condicion_pago: "30 días", moneda: "CLP", iva_pct: 19,
  items: [],
});

// Cálculo neto por línea: cantidad × precio × (1 − descuento/100)
const lineNeto = (it) =>
  (it.cantidad || 0) * (it.precio || 0) * (1 - ((it.descuento_pct || 0) / 100));

// ETA calculada desde fecha de emisión + lead_dias
const calcETA = (fecha, lead_dias) => {
  if (!fecha || !lead_dias) return null;
  const d = new Date(fecha);
  d.setDate(d.getDate() + Number(lead_dias));
  return d.toISOString().slice(0, 10);
};

// ── Componente principal ──────────────────────────────────────
export default function TabCompras({
  profile, items, bodegas, compras, comprasItems, stockMap,
  itemDesc, itemPrecio, whName, ocInit, onOcInitUsed, initialCompraId, onCompraNavUsed, recargar, setError,
}) {
  const [showForm,   setShowForm]   = useState(false);
  const [form,       setForm]       = useState(() => FORM_EMPTY(bodegas));
  const [editOcId,   setEditOcId]   = useState(null);
  const [detalleId,  setDetalleId]  = useState(null);
  const [autoEditId, setAutoEditId] = useState(null); // abre el detalle directo en modo edición de líneas
  const [line,       setLine]       = useState({ item_id: "", cantidad: 1, precio: 0, descuento_pct: 0 });
  const [recepPanel, setRecepPanel] = useState(null);
  const [recepCants, setRecepCants] = useState({});
  const [recepFact,  setRecepFact]  = useState("");
  const [fEstado,    setFEstado]    = useState("all");
  const [fProv,      setFProv]      = useState("all");
  const [fBusca,     setFBusca]     = useState("");
  const [vista,      setVista]      = useState("kanban");
  const [selectedId, setSelectedId] = useState(null);

  const isMobile = useMediaQuery("(max-width: 1024px)");
  const isTabla = vista === "tabla";

  const puedeOperar  = isAdmin(profile?.rol);
  const puedeAprobar = isAdmin(profile?.rol);
  const puedeBorrar  = isAdmin(profile?.rol);

  // Inicializar desde botón "Reponer" en TabStock
  React.useEffect(() => {
    if (ocInit?.items?.length > 0) {
      setForm((f) => ({
        ...f,
        proveedor: ocInit.proveedor || f.proveedor,
        urgencia:  "urgente",
        items: ocInit.items.map((i) => ({ ...i, descuento_pct: 0 })),
      }));
      setShowForm(true);
      onOcInitUsed?.();
    }
  }, [ocInit]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!initialCompraId || !compras.length) return;
    if (!compras.some((c) => c.id === initialCompraId)) return;
    setSelectedId(initialCompraId);
    setDetalleId(initialCompraId);
    setVista("cola");
    onCompraNavUsed?.();
  }, [initialCompraId, compras, onCompraNavUsed]);

  useEffect(() => {
    const saved = localStorage.getItem(VISTA_KEY);
    if (saved && VISTAS.some((v) => v.id === saved)) setVista(saved);
  }, []);

  useEffect(() => {
    localStorage.setItem(VISTA_KEY, vista);
  }, [vista]);

  // ── Helpers de ítems ─────────────────────────────────────────
  const itemCodigo    = (id) => items.find((i) => i.id === id)?.codigo    || "";
  const itemCategoria = (id) => items.find((i) => i.id === id)?.categoria || "";
  const itemUnidad    = (id) => items.find((i) => i.id === id)?.unidad    || "u";

  const totalItem = (id) =>
    bodegas.reduce((s, b) => s + (stockMap.get(skey(id, b.id)) || 0), 0);

  const sugerencias = items
    .map((i) => ({ ...i, total: totalItem(i.id) }))
    .filter((i) => (i.stock_min || 0) > 0 && i.total <= i.stock_min)
    .map((i) => ({ ...i, sugerido: Math.max((i.stock_max || 0) - i.total, 1) }));

  // ── Cálculos financieros ──────────────────────────────────────
  const ocLines    = (oc) => comprasItems.filter((it) => it.compra_id === oc.id);
  const ocSubtotal = (oc) => ocLines(oc).reduce((s, it) => s + lineNeto(it), 0);
  const ocIva      = (oc) => ocSubtotal(oc) * ((oc.iva_pct ?? 19) / 100);
  const ocTotal    = (oc) => ocSubtotal(oc) + ocIva(oc);

  const pendienteTotal = compras
    .filter((o) => !["recibida", "cancelada"].includes(o.estado))
    .reduce((s, o) => s + ocTotal(o), 0);

  const urgentesAbiertas = compras.filter(
    (o) =>
      ["critico", "urgente"].includes(o.urgencia || "normal") &&
      !["recibida", "cancelada"].includes(o.estado)
  ).length;

  // ── Filtros ───────────────────────────────────────────────────
  const proveedores = [...new Set(compras.map((o) => o.proveedor).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b, "es")
  );
  const qOC = fBusca.trim().toLowerCase();
  const comprasFiltradas = compras.filter(
    (o) =>
      (fEstado === "all" || o.estado === fEstado) &&
      (fProv   === "all" || o.proveedor === fProv) &&
      (!qOC ||
        (o.folio          || "").toLowerCase().includes(qOC) ||
        (o.proveedor      || "").toLowerCase().includes(qOC) ||
        (o.ref_proveedor  || "").toLowerCase().includes(qOC) ||
        (o.notas          || "").toLowerCase().includes(qOC) ||
        (o.numero_factura || "").toLowerCase().includes(qOC))
  );
  const hayFiltro = fEstado !== "all" || fProv !== "all" || !!qOC;

  const listaOrdenada = useMemo(() => ordenarOCs(comprasFiltradas), [comprasFiltradas]);
  const selectedOC = useMemo(
    () => listaOrdenada.find((o) => o.id === selectedId) || listaOrdenada[0] || null,
    [listaOrdenada, selectedId],
  );
  const ocLinesCount = (oc) => ocLines(oc).length;

  useEffect(() => {
    if (selectedId && !compras.some((o) => o.id === selectedId)) setSelectedId(null);
  }, [compras, selectedId]);

  useEffect(() => {
    if (!isTabla && !selectedId && listaOrdenada.length > 0) setSelectedId(listaOrdenada[0].id);
  }, [vista, fEstado, fProv, fBusca, listaOrdenada.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Gestión de líneas del formulario ─────────────────────────
  function addLine() {
    if (!line.item_id) return;
    setForm((f) => ({
      ...f,
      items: [
        ...f.items,
        {
          item_id:       line.item_id,
          cantidad:      line.cantidad,
          precio:        line.precio || itemPrecio(line.item_id) || 0,
          descuento_pct: line.descuento_pct || 0,
        },
      ],
    }));
    setLine({ item_id: "", cantidad: 1, precio: 0, descuento_pct: 0 });
  }
  function rmLine(idx) {
    setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
  }
  function updLine(idx, field, val) {
    setForm((f) => ({ ...f, items: f.items.map((it, i) => (i === idx ? { ...it, [field]: val } : it)) }));
  }

  const formSubtotal = form.items.reduce(
    (s, it) => s + it.cantidad * (it.precio || 0) * (1 - (it.descuento_pct || 0) / 100),
    0
  );
  const formIva   = formSubtotal * ((form.iva_pct || 19) / 100);
  const formTotal = formSubtotal + formIva;

  // ── Folio correlativo robusto (OC-AÑO-NNNN) ─────────────────
  function generarFolio() {
    const year   = new Date().getFullYear();
    const prefix = `OC-${year}-`;
    const nums   = compras
      .map((o) => (o.folio?.startsWith(prefix) ? parseInt(o.folio.slice(prefix.length)) : 0))
      .filter((n) => n > 0);
    const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
    return `${prefix}${String(next).padStart(4, "0")}`;
  }

  // ── CRUD ──────────────────────────────────────────────────────
  async function crearOC() {
    if (!form.proveedor.trim() || form.items.length === 0) {
      setError("Indica el proveedor y al menos un ítem."); return;
    }
    const folio = generarFolio();
    try {
      const cab = await insertRow("compras", profile.empresa_id, {
        folio, fecha: HOY(), estado: "solicitada", created_by: profile.id,
        proveedor:              form.proveedor.trim(),
        proveedor_contacto:     form.proveedor_contacto.trim() || null,
        proveedor_email:        form.proveedor_email.trim()    || null,
        bodega_destino:         form.bodega_destino,
        lead_dias:              form.lead_dias,
        fecha_entrega_esperada: form.fecha_entrega_esperada    || null,
        ref_proveedor:          form.ref_proveedor.trim()      || null,
        notas:                  form.notas.trim()              || null,
        urgencia:               form.urgencia,
        condicion_pago:         form.condicion_pago,
        moneda:                 form.moneda,
        iva_pct:                form.iva_pct,
      });
      for (const it of form.items) {
        await insertRow("compras_items", profile.empresa_id, {
          compra_id: cab.id, item_id: it.item_id,
          cantidad: it.cantidad, precio: it.precio, descuento_pct: it.descuento_pct || 0,
        });
      }
      logActivity(profile, "Crear OC", `${folio} · ${form.proveedor} · ${form.items.length} ítem(s)`);
      setForm(FORM_EMPTY(bodegas)); setShowForm(false); recargar();
    } catch (e) { setError("No se pudo crear la OC: " + e.message); }
  }

  function abrirEditar(oc) {
    setForm({
      proveedor:              oc.proveedor              || "",
      proveedor_contacto:     oc.proveedor_contacto     || "",
      proveedor_email:        oc.proveedor_email        || "",
      bodega_destino:         oc.bodega_destino         || bodegas[0]?.id || "",
      lead_dias:              oc.lead_dias              || 7,
      fecha_entrega_esperada: oc.fecha_entrega_esperada || "",
      ref_proveedor:          oc.ref_proveedor          || "",
      notas:                  oc.notas                  || "",
      urgencia:               oc.urgencia               || "normal",
      condicion_pago:         oc.condicion_pago         || "30 días",
      moneda:                 oc.moneda                 || "CLP",
      iva_pct:                oc.iva_pct                ?? 19,
      items: [],
    });
    setEditOcId(oc.id); setShowForm(false);
  }

  async function guardarEdicion() {
    const oc = compras.find((o) => o.id === editOcId); if (!oc) return;
    try {
      await updateRow("compras", editOcId, {
        proveedor:              form.proveedor.trim(),
        proveedor_contacto:     form.proveedor_contacto.trim() || null,
        proveedor_email:        form.proveedor_email.trim()    || null,
        bodega_destino:         form.bodega_destino,
        lead_dias:              form.lead_dias,
        fecha_entrega_esperada: form.fecha_entrega_esperada    || null,
        ref_proveedor:          form.ref_proveedor.trim()      || null,
        notas:                  form.notas.trim()              || null,
        urgencia:               form.urgencia,
        condicion_pago:         form.condicion_pago,
        moneda:                 form.moneda,
        iva_pct:                form.iva_pct,
      });
      logActivity(profile, "Editar OC", `${oc.folio} — datos actualizados`);
      setEditOcId(null); setForm(FORM_EMPTY(bodegas)); recargar();
    } catch (e) { setError("No se pudo guardar: " + e.message); }
  }

  async function avanzar(oc) {
    const flow = { solicitada: "aprobada", aprobada: "enviada", enviada: "recibida" };
    const next = flow[oc.estado]; if (!next) return;
    try {
      if (next === "recibida") {
        for (const it of ocLines(oc)) {
          const prev = stockMap.get(skey(it.item_id, oc.bodega_destino)) || 0;
          await upsertRow("stock", profile.empresa_id,
            { item_id: it.item_id, bodega_id: oc.bodega_destino, cantidad: prev + it.cantidad },
            "item_id,bodega_id");
          await insertRow("movimientos", profile.empresa_id, {
            fecha: HOY(), tipo: "entrada", item_id: it.item_id, bodega_to: oc.bodega_destino,
            cantidad: it.cantidad, responsable: "Compras",
            motivo: `Recepción ${oc.folio}`, created_by: profile.id,
          });
        }
        await updateRow("compras", oc.id, { estado: "recibida", fecha_recepcion: HOY() });
        logActivity(profile, "Recibir OC", `${oc.folio} → ${whName(oc.bodega_destino)}`);
      } else if (next === "aprobada") {
        await updateRow("compras", oc.id, {
          estado: "aprobada",
          aprobado_por: profile?.nombre || profile?.email || "Admin",
        });
        logActivity(profile, "Aprobar OC", oc.folio);
      } else {
        await updateRow("compras", oc.id, { estado: next });
        logActivity(profile, "Avanzar OC", `${oc.folio} → ${next}`);
      }
      recargar();
    } catch (e) { setError("No se pudo avanzar la OC: " + e.message); }
  }

  async function cancelarOC(oc) {
    if (!window.confirm(`¿Cancelar la orden ${oc.folio}? No se puede deshacer.`)) return;
    try {
      await updateRow("compras", oc.id, { estado: "cancelada" });
      logActivity(profile, "Cancelar OC", oc.folio);
      recargar();
    } catch (e) { setError("No se pudo cancelar: " + e.message); }
  }

  async function eliminar(id) {
    const o = compras.find((x) => x.id === id);
    if (!window.confirm(`¿Eliminar permanentemente la orden ${o?.folio}?`)) return;
    try {
      await deleteRow("compras", id);
      logActivity(profile, "Eliminar OC", o?.folio);
      recargar();
    } catch (e) { setError("No se pudo eliminar: " + e.message); }
  }

  // ── Recepción parcial ─────────────────────────────────────────
  function abrirRecepcion(oc) {
    const cants = {};
    ocLines(oc).forEach((it) => {
      cants[it.id] = Math.max(0, it.cantidad - (it.cantidad_recibida || 0));
    });
    setRecepCants(cants); setRecepFact(""); setRecepPanel(oc.id);
  }

  async function confirmarRecepcion(oc) {
    const its = ocLines(oc);
    try {
      let todoRecibido = true;
      for (const it of its) {
        const yaRecibido = it.cantidad_recibida || 0;
        const aRecibir   = Math.min(Math.max(0, +recepCants[it.id] || 0), it.cantidad - yaRecibido);
        const nuevoTotal = yaRecibido + aRecibir;
        if (nuevoTotal < it.cantidad) todoRecibido = false;
        if (aRecibir <= 0) continue;
        const prevStock = stockMap.get(skey(it.item_id, oc.bodega_destino)) || 0;
        await upsertRow("stock", profile.empresa_id,
          { item_id: it.item_id, bodega_id: oc.bodega_destino, cantidad: prevStock + aRecibir },
          "item_id,bodega_id");
        await insertRow("movimientos", profile.empresa_id, {
          fecha: HOY(), tipo: "entrada", item_id: it.item_id, bodega_to: oc.bodega_destino,
          cantidad: aRecibir, responsable: profile.nombre || "Compras",
          motivo: `Recepción ${todoRecibido ? "completa" : "parcial"} ${oc.folio}`,
          created_by: profile.id,
        });
        await updateRow("compras_items", it.id, { cantidad_recibida: nuevoTotal });
      }
      const updates = {};
      if (todoRecibido) { updates.estado = "recibida"; updates.fecha_recepcion = HOY(); }
      if (recepFact.trim()) updates.numero_factura = recepFact.trim();
      if (Object.keys(updates).length > 0) await updateRow("compras", oc.id, updates);
      logActivity(
        profile,
        todoRecibido ? "Recibir OC completa" : "Recepción parcial OC",
        `${oc.folio}${recepFact ? " · Fact. " + recepFact : ""}`
      );
      setRecepPanel(null); setRecepCants({}); setRecepFact(""); recargar();
    } catch (e) { setError("No se pudo procesar la recepción: " + e.message); }
  }

  // ── Generar OC desde sugerencias ─────────────────────────────
  function crearDesdeSugerencias() {
    if (sugerencias.length === 0) return;
    setForm({
      ...FORM_EMPTY(bodegas),
      proveedor: sugerencias[0].proveedor || "",
      urgencia:  "urgente",
      items: sugerencias.map((s) => ({
        item_id: s.id, cantidad: s.sugerido, precio: s.precio || 0, descuento_pct: 0,
      })),
    });
    setShowForm(true); setEditOcId(null);
  }

  // ── Semáforo ETA ──────────────────────────────────────────────
  function etaSemaforo(oc) {
    if (["recibida", "cancelada"].includes(oc.estado)) return null;
    const eta = oc.fecha_entrega_esperada || calcETA(oc.fecha, oc.lead_dias);
    if (!eta) return null;
    const dias = Math.ceil((new Date(eta) - new Date(HOY())) / 86400000);
    if (dias < 0)  return { color: C.red,   label: `${Math.abs(dias)}d atrasada`, eta };
    if (dias <= 3) return { color: C.amber,  label: `en ${dias}d`, eta };
    return               { color: C.green,  label: `en ${dias}d`, eta };
  }

  // ── Imprimir / Exportar PDF ───────────────────────────────────
  async function imprimirOC(oc) {
    // La ventana se abre de inmediato (dentro del gesto del usuario) para que el popup no sea bloqueado
    const w = window.open("", "_blank", "width=920,height=820,scrollbars=yes");
    if (!w) { setError("No se pudo abrir la ventana — permite popups para este sitio."); return; }
    const its     = ocLines(oc);
    const sub     = its.reduce((s, it) => s + lineNeto(it), 0);
    const ivaPct  = oc.iva_pct ?? 19;
    const iva     = sub * (ivaPct / 100);
    const total   = sub + iva;
    const empresa = profile?.empresa_nombre || "CMMS Korelfox";
    // Armador: usuario admin_empresa de la organización (respaldo: super admin, luego quien imprime)
    let armador = profile?.nombre || "—";
    try {
      const profs = await fetchAll("profiles");
      const arm = profs.find((p) => p.rol === "admin_empresa") || profs.find((p) => p.rol === "super_admin");
      if (arm?.nombre) armador = arm.nombre;
    } catch { /* sin conexión: usa el respaldo */ }
    const urgInfo = URGENCIAS.find((u) => u.value === (oc.urgencia || "normal"));
    const etaStr  = oc.fecha_entrega_esperada || calcETA(oc.fecha, oc.lead_dias) || "A convenir";
    const hasDcto = its.some((it) => (it.descuento_pct || 0) > 0);

    const rows = its.map((it, i) => `
      <tr>
        <td class="c">${i + 1}</td>
        <td class="mono b blue">${itemCodigo(it.item_id)}</td>
        <td>${itemDesc(it.item_id)}</td>
        <td class="r slate">${itemUnidad(it.item_id)}</td>
        <td class="r mono">${it.cantidad}</td>
        <td class="r mono">${clp(it.precio || 0)}</td>
        ${hasDcto ? `<td class="r mono amber">${(it.descuento_pct || 0) > 0 ? it.descuento_pct + "%" : "—"}</td>` : ""}
        <td class="r mono b">${clp(lineNeto(it))}</td>
      </tr>`).join("");

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>Orden de Compra ${oc.folio}</title>
<style>
@page { margin: 16mm 20mm; size: A4; }
*    { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #0A1A2A; }
.wrap { max-width: 780px; margin: 0 auto; padding: 20px 0; }
.hdr  { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 14px; border-bottom: 3px solid #06182E; margin-bottom: 18px; }
.co-name { font-size: 20px; font-weight: 900; color: #06182E; }
.co-sub  { font-size: 10.5px; color: #B37D00; margin-top: 3px; font-style: italic; }
.co-armador { font-size: 10.5px; color: #0A1A2A; margin-top: 8px; }
.co-armador strong { font-weight: 700; }
.oc-lbl  { font-size: 9px; text-transform: uppercase; letter-spacing: 1.2px; color: #5A7184; margin-bottom: 4px; }
.oc-num  { font-size: 28px; font-weight: 900; color: #06182E; font-family: monospace; }
.oc-date { font-size: 10px; color: #5A7184; margin-top: 4px; }
.badge   { display: inline-block; padding: 3px 9px; border-radius: 10px; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 5px; }
.badge-normal  { background: #E8F1F8; color: #5A7184; }
.badge-urgente { background: #FCF3D6; color: #996600; }
.badge-critico { background: #FBE3E1; color: #D8443C; }
.info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
.info-box  { border: 1px solid #D6E2EC; border-radius: 5px; padding: 10px 12px; }
.info-box h3 { font-size: 8.5px; text-transform: uppercase; letter-spacing: 1px; color: #5A7184; font-weight: 700; margin-bottom: 7px; }
.info-box p  { font-size: 11px; line-height: 1.65; }
.terms { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; }
.term  { border: 1px solid #D6E2EC; border-radius: 5px; padding: 7px 10px; }
.term-lbl { font-size: 8px; text-transform: uppercase; letter-spacing: 0.8px; color: #5A7184; font-weight: 700; margin-bottom: 3px; }
.term-val { font-size: 11px; font-weight: 600; }
table { width: 100%; border-collapse: collapse; }
thead th { background: #06182E; color: #fff; padding: 7px 9px; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.4px; font-weight: 600; }
tbody tr:nth-child(even) { background: #F4F8FB; }
tbody td { padding: 7px 9px; font-size: 11px; border-bottom: 1px solid #EEF3F7; vertical-align: middle; }
.r { text-align: right; } .c { text-align: center; }
.mono { font-family: monospace; } .b { font-weight: 700; }
.blue { color: #1C5C9B; } .slate { color: #5A7184; } .amber { color: #B37D00; }
.totals-wrap { display: flex; justify-content: flex-end; margin-top: 14px; }
.totals { border: 1px solid #D6E2EC; border-radius: 6px; overflow: hidden; min-width: 240px; }
.t-row { display: flex; justify-content: space-between; gap: 30px; padding: 6px 14px; font-size: 11px; border-bottom: 1px solid #EEF3F7; }
.t-row.grand { background: #06182E; color: #fff; font-weight: 700; font-size: 13px; border: none; }
.t-row .lbl  { color: #5A7184; }
.t-row.grand .lbl { color: rgba(255,255,255,.7); }
.t-row .val  { font-family: monospace; font-weight: 600; }
.notes { border-left: 3px solid #E0A526; background: #FCF3D6; border-radius: 4px; padding: 9px 12px; margin: 14px 0; font-size: 10.5px; }
.notes strong { font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.8px; color: #996600; display: block; margin-bottom: 4px; }
.sigs { display: grid; grid-template-columns: 1fr 1fr; gap: 50px; margin-top: 32px; }
.sig { text-align: center; }
.sig-line { border-top: 1px solid #0A1A2A; margin-bottom: 6px; }
.sig p { font-size: 10px; color: #5A7184; }
.sig .sig-name { font-weight: 700; color: #0A1A2A; font-size: 11px; margin-top: 2px; }
.doc-footer { font-size: 9px; color: #5A7184; text-align: center; margin-top: 18px; padding-top: 10px; border-top: 1px solid #E8F1F8; }
</style></head><body><div class="wrap">
  <div class="hdr">
    <div>
      <div class="oc-lbl">Sistema de Gestión de Mantenimiento (CMMS)</div>
      <div class="co-name">CMMS Korelfox</div>
      <div class="co-sub">La energía que impulsa tu rumbo</div>
      <div class="co-armador">Armador: <strong>${armador}</strong></div>
    </div>
    <div style="text-align:right">
      <div class="oc-lbl">Orden de Compra</div>
      <div class="oc-num">${oc.folio}</div>
      <div class="oc-date">Emitida: ${oc.fecha}</div>
      <span class="badge badge-${oc.urgencia || "normal"}">${urgInfo?.label || "Normal"}</span>
    </div>
  </div>
  <div class="info-grid">
    <div class="info-box">
      <h3>Proveedor</h3>
      <p><strong>${oc.proveedor || "—"}</strong><br>
        ${oc.proveedor_contacto ? `Contacto: ${oc.proveedor_contacto}<br>` : ""}
        ${oc.proveedor_email    ? `Email: ${oc.proveedor_email}<br>`       : ""}
        ${oc.ref_proveedor      ? `Ref.: ${oc.ref_proveedor}`              : ""}
      </p>
    </div>
    <div class="info-box">
      <h3>Destino de Entrega</h3>
      <p><strong>${whName(oc.bodega_destino)}</strong><br>${empresa}
        ${oc.numero_factura ? `<br>Factura/Guía: <strong>${oc.numero_factura}</strong>` : ""}
      </p>
    </div>
  </div>
  <div class="terms">
    <div class="term"><div class="term-lbl">Fecha entrega</div><div class="term-val">${etaStr}</div></div>
    <div class="term"><div class="term-lbl">Condición pago</div><div class="term-val">${oc.condicion_pago || "30 días"}</div></div>
    <div class="term"><div class="term-lbl">Moneda / IVA</div><div class="term-val">${oc.moneda || "CLP"} · ${ivaPct}%</div></div>
    <div class="term"><div class="term-lbl">Estado</div><div class="term-val" style="text-transform:capitalize">${oc.estado}</div></div>
  </div>
  <table>
    <thead><tr>
      <th class="c" style="width:28px">N°</th>
      <th style="width:90px">Código</th>
      <th>Descripción</th>
      <th class="r" style="width:48px">Unid.</th>
      <th class="r" style="width:55px">Cant.</th>
      <th class="r" style="width:85px">P. Unit.</th>
      ${hasDcto ? `<th class="r" style="width:55px">Desc.</th>` : ""}
      <th class="r" style="width:90px">Total neto</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="totals-wrap">
    <div class="totals">
      <div class="t-row"><span class="lbl">Subtotal neto</span><span class="val">${clp(sub)}</span></div>
      <div class="t-row"><span class="lbl">IVA (${ivaPct}%)</span><span class="val">${clp(iva)}</span></div>
      <div class="t-row grand"><span class="lbl">TOTAL ${oc.moneda || "CLP"}</span><span class="val">${clp(total)}</span></div>
    </div>
  </div>
  ${oc.notas ? `<div class="notes"><strong>Notas y condiciones especiales</strong>${oc.notas}</div>` : ""}
  <div class="sigs">
    <div class="sig"><div class="sig-line"></div><p>Solicitado por</p><div class="sig-name">${profile?.nombre || "—"}</div></div>
    <div class="sig"><div class="sig-line"></div><p>Aprobado por</p><div class="sig-name">${oc.aprobado_por || "—"}</div></div>
  </div>
  <p class="doc-footer">Generado el ${new Date().toLocaleDateString("es-CL")} · CMMS Korelfox · Válido con firma autorizante</p>
</div></body></html>`;

    w.document.write(html);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 500);
  }

  // ── Guard ─────────────────────────────────────────────────────
  if (items.length === 0 || bodegas.length === 0) {
    return (
      <Card>
        <Empty>
          <AlertCircle size={28} color={C.amber} /><br />
          Necesitas ítems en Inventario y al menos una bodega para crear órdenes de compra.
        </Empty>
      </Card>
    );
  }

  const isEditing   = !!editOcId;
  const showAnyForm = showForm || isEditing;

  const ocDetailSideProps = {
    itemCodigo,
    itemDesc,
    itemUnidad,
    whName,
    puedeOperar,
    puedeAprobar,
    profile,
    items,
    recargar,
    setError,
    autoEdit: autoEditId,
    onAutoEditConsumed: () => setAutoEditId(null),
    onImprimir: imprimirOC,
    onAbrirEditar: abrirEditar,
    onAvanzar: avanzar,
    onAbrirRecepcion: abrirRecepcion,
    onCancelar: cancelarOC,
    onStartLineEdit: (id) => { setAutoEditId(id); setSelectedId(id); },
  };

  return (
    <div>
      {/* ── KPIs ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 16 }}>
        <KpiCard label="OCs Abiertas"      color={C.steel}
          value={compras.filter((o) => !["recibida","cancelada"].includes(o.estado)).length}
          sub={`${compras.length} totales`} />
        <KpiCard label="Valor Pendiente"   color={C.gold}
          value={clp(pendienteTotal)} sub="no recibido aún" />
        <KpiCard label="Ítems Bajo Mínimo" color={sugerencias.length ? C.red : C.green}
          value={sugerencias.length} sub="requieren reposición" />
        <KpiCard label="Críticas / Urgentes" color={urgentesAbiertas > 0 ? C.red : C.green}
          value={urgentesAbiertas} sub="en curso" />
      </div>

      {/* ── Sugerencias reposición ── */}
      {sugerencias.length > 0 && puedeOperar && (
        <Card style={{ marginBottom: 16, border: `1px solid ${C.amber}`, background: C.yellowBg }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <PackagePlus size={17} color={C.amber} />
              <strong style={{ color: C.abyss, fontSize: 14 }}>Sugerencias de Reposición</strong>
            </div>
            <button onClick={crearDesdeSugerencias} style={{ ...primaryBtn, background: C.amber }}>
              <ShoppingCart size={15} /> Generar OC sugerida
            </button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {sugerencias.map((s) => (
              <div key={s.id} style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 7, padding: "6px 10px", fontSize: 12 }}>
                <strong>{s.descripcion}</strong>
                <span style={{ color: C.slate }}> · {s.total}/{s.stock_min}</span>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: C.green, fontWeight: 600 }}> → {s.sugerido}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        {puedeOperar && (
          <button onClick={() => { setShowForm(!showForm); setEditOcId(null); setForm(FORM_EMPTY(bodegas)); setError(null); }} style={primaryBtn}>
            <Plus size={16} /> Nueva OC
          </button>
        )}
      </div>

      {/* ── Formulario crear / editar ── */}
      {showAnyForm && (
        <Card style={{ marginBottom: 16, background: C.mist, border: isEditing ? `1px solid ${C.amber}` : undefined }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: C.abyss, marginBottom: 16 }}>
            {isEditing ? `Editar ${compras.find((o) => o.id === editOcId)?.folio}` : "Nueva Orden de Compra"}
          </div>

          <SectionLabel>Proveedor</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 1.5fr", gap: 12, marginBottom: 14 }}>
            <Field label="Nombre del proveedor">
              <input value={form.proveedor} onChange={(e) => setForm({ ...form, proveedor: e.target.value })} style={inputStyle()} placeholder="Ferretería Industrial S.A." />
            </Field>
            <Field label="Contacto / representante">
              <input value={form.proveedor_contacto} onChange={(e) => setForm({ ...form, proveedor_contacto: e.target.value })} style={inputStyle()} placeholder="Juan Pérez" />
            </Field>
            <Field label="Email proveedor">
              <input type="email" value={form.proveedor_email} onChange={(e) => setForm({ ...form, proveedor_email: e.target.value })} style={inputStyle()} placeholder="ventas@proveedor.cl" />
            </Field>
          </div>

          <SectionLabel>Logística y prioridad</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 80px 1fr 1.5fr", gap: 12, marginBottom: 14 }}>
            <Field label="Bodega destino">
              <select value={form.bodega_destino} onChange={(e) => setForm({ ...form, bodega_destino: e.target.value })} style={inputStyle()}>
                {bodegas.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
              </select>
            </Field>
            <Field label="Fecha entrega esperada">
              <input type="date" value={form.fecha_entrega_esperada} onChange={(e) => setForm({ ...form, fecha_entrega_esperada: e.target.value })} style={inputStyle()} />
            </Field>
            <Field label="Lead días">
              <input type="number" value={form.lead_dias} onFocus={(e) => e.target.select()} onChange={(e) => setForm({ ...form, lead_dias: +e.target.value })} style={bluInput} min={0} />
            </Field>
            <Field label="Urgencia">
              <select value={form.urgencia} onChange={(e) => setForm({ ...form, urgencia: e.target.value })}
                style={{ ...inputStyle(), fontWeight: 600, color: form.urgencia === "critico" ? "var(--c-red)" : form.urgencia === "urgente" ? "var(--c-amber)" : undefined }}>
                {URGENCIAS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
              </select>
            </Field>
            <Field label="Ref. proveedor">
              <input value={form.ref_proveedor} onChange={(e) => setForm({ ...form, ref_proveedor: e.target.value })} style={inputStyle()} placeholder="PO-00123" />
            </Field>
          </div>

          <SectionLabel>Condiciones comerciales</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 80px 3fr", gap: 12, marginBottom: 14 }}>
            <Field label="Condición de pago">
              <select value={form.condicion_pago} onChange={(e) => setForm({ ...form, condicion_pago: e.target.value })} style={inputStyle()}>
                {CONDICIONES_PAGO.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Moneda">
              <select value={form.moneda} onChange={(e) => setForm({ ...form, moneda: e.target.value })} style={inputStyle()}>
                {MONEDAS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="IVA %">
              <input type="number" value={form.iva_pct} onFocus={(e) => e.target.select()} onChange={(e) => setForm({ ...form, iva_pct: +e.target.value })} style={bluInput} min={0} max={100} />
            </Field>
            <Field label="Notas y condiciones especiales">
              <input value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} style={{ ...inputStyle(), width: "100%" }} placeholder="Instrucciones de entrega, urgencia, condiciones…" />
            </Field>
          </div>

          {/* Ítems — solo al crear */}
          {!isEditing && (
            <>
              <SectionLabel>Ítems a solicitar</SectionLabel>
              <div style={{ display: "grid", gridTemplateColumns: "3fr 70px 120px 80px auto", gap: 10, alignItems: "flex-end", marginBottom: 10 }}>
                <Field label="Ítem (código, descripción o categoría)">
                  <ItemPicker items={items} value={line.item_id}
                    onChange={(id) => setLine({ ...line, item_id: id, precio: id ? (itemPrecio(id) || 0) : 0 })} />
                </Field>
                <Field label="Cantidad">
                  <input type="number" value={line.cantidad} onFocus={(e) => e.target.select()} onChange={(e) => setLine({ ...line, cantidad: +e.target.value })} style={bluInput} min={0.01} step="any" />
                </Field>
                <Field label="Precio unit.">
                  <input type="number" value={line.precio || ""} onFocus={(e) => e.target.select()} onChange={(e) => setLine({ ...line, precio: +e.target.value })} style={bluInput} min={0} placeholder="$" />
                </Field>
                <Field label="Desc. %">
                  <input type="number" value={line.descuento_pct || 0} onFocus={(e) => e.target.select()} onChange={(e) => setLine({ ...line, descuento_pct: +e.target.value })} style={bluInput} min={0} max={100} step={0.5} />
                </Field>
                <button onClick={addLine} style={{ ...ghostBtn, alignSelf: "flex-end" }}><Plus size={15} /> Agregar</button>
              </div>

              {form.items.length > 0 && (
                <div style={{ border: `1px solid ${C.line}`, borderRadius: 8, overflow: "hidden", marginBottom: 14 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: C.foam }}>
                        {["Código","Descripción","Cant.","P. Unit.","Desc. %","Total neto",""].map((h, i) => (
                          <th key={i} style={{ ...thStyle, fontSize: 11, textAlign: i >= 2 && i <= 5 ? "right" : "left" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {form.items.map((it, idx) => {
                        const neto = it.cantidad * (it.precio || 0) * (1 - (it.descuento_pct || 0) / 100);
                        return (
                          <tr key={idx} style={{ borderBottom: `1px solid ${C.foam}` }}>
                            <td style={{ ...tdStyle, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: C.steel, fontSize: 11 }}>{itemCodigo(it.item_id)}</td>
                            <td style={{ ...tdStyle, fontSize: 12.5 }}>{itemDesc(it.item_id)}</td>
                            <td style={{ ...tdStyle, textAlign: "right" }}>
                              <input type="number" min={0.01} step="any" value={it.cantidad}
                                onFocus={(e) => e.target.select()}
                                onChange={(e) => updLine(idx, "cantidad", +e.target.value)}
                                style={{ ...bluInput, width: 68, textAlign: "right", padding: "4px 6px", fontSize: 12 }} />
                            </td>
                            <td style={{ ...tdStyle, textAlign: "right" }}>
                              <input type="number" min={0} step="any" value={it.precio || 0}
                                onFocus={(e) => e.target.select()}
                                onChange={(e) => updLine(idx, "precio", +e.target.value)}
                                style={{ ...bluInput, width: 90, textAlign: "right", padding: "4px 6px", fontSize: 12 }} />
                            </td>
                            <td style={{ ...tdStyle, textAlign: "right" }}>
                              <input type="number" min={0} max={100} step={0.5} value={it.descuento_pct || 0}
                                onFocus={(e) => e.target.select()}
                                onChange={(e) => updLine(idx, "descuento_pct", +e.target.value)}
                                style={{ ...bluInput, width: 56, textAlign: "right", padding: "4px 6px", fontSize: 12 }} />
                            </td>
                            <td style={{ ...tdStyle, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>{clp(neto)}</td>
                            <td style={tdStyle}><button onClick={() => rmLine(idx)} style={{ background: "none", border: "none", cursor: "pointer", color: C.slate }}><X size={14} /></button></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div style={{ background: C.foam, padding: "10px 14px", display: "flex", justifyContent: "flex-end", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
                    <div style={{ fontSize: 12, color: C.slate }}>Subtotal neto: <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, color: C.ink, marginLeft: 10 }}>{clp(formSubtotal)}</span></div>
                    <div style={{ fontSize: 12, color: C.slate }}>IVA ({form.iva_pct}%): <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, color: C.ink, marginLeft: 10 }}>{clp(formIva)}</span></div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.gold, marginTop: 2 }}>
                      Total {form.moneda}: <span style={{ fontFamily: "'IBM Plex Mono', monospace", marginLeft: 8 }}>{clp(formTotal)}</span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {isEditing && (
            <div style={{ fontSize: 12, color: C.slate, padding: "8px 12px", background: tint(C.amber, 8), borderRadius: 7, marginBottom: 12 }}>
              <AlertCircle size={13} style={{ display: "inline", verticalAlign: "middle", marginRight: 5 }} color={C.amber} />
              Se actualizan los datos de cabecera. Las líneas de ítems no se modifican aquí.
            </div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            {isEditing ? (
              <>
                <button onClick={guardarEdicion} style={primaryBtn}><Check size={15} /> Guardar cambios</button>
                <button onClick={() => { setEditOcId(null); setForm(FORM_EMPTY(bodegas)); }} style={ghostBtn}>Cancelar</button>
              </>
            ) : (
              <>
                <button onClick={crearOC} style={primaryBtn}><Plus size={15} /> Crear OC</button>
                <button onClick={() => { setShowForm(false); setForm(FORM_EMPTY(bodegas)); }} style={ghostBtn}>Cancelar</button>
              </>
            )}
          </div>
        </Card>
      )}

      {/* ── Panel recepción parcial ── */}
      {recepPanel && (() => {
        const oc  = compras.find((o) => o.id === recepPanel);
        const its = ocLines(oc);
        return (
          <Card style={{ marginBottom: 16, borderLeft: `4px solid ${C.cyan}`, background: tint(C.cyan, 8) }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: C.slate, fontWeight: 700 }}>Recepción de mercadería</div>
                <div style={{ fontWeight: 800, fontSize: 15, color: C.abyss, marginTop: 2 }}>
                  {oc.folio} · {oc.proveedor} — indica cantidades efectivamente recibidas
                </div>
              </div>
              <button onClick={() => setRecepPanel(null)} style={{ background: "none", border: "none", cursor: "pointer", color: C.slate }}><X size={18} /></button>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 12 }}>
              <thead><tr>
                <th style={thStyle}>Ítem</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Ordenado</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Ya recibido</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Pendiente</th>
                <th style={{ ...thStyle, textAlign: "center", width: 130 }}>Recibir ahora</th>
              </tr></thead>
              <tbody>
                {its.map((it) => {
                  const yaRecibido = it.cantidad_recibida || 0;
                  const pend = Math.max(0, it.cantidad - yaRecibido);
                  return (
                    <tr key={it.id}>
                      <td style={tdStyle}>
                        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: C.steel }}>{itemCodigo(it.item_id)}</div>
                        <div style={{ fontSize: 12.5 }}>{itemDesc(it.item_id)}</div>
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace" }}>{it.cantidad}</td>
                      <td style={{ ...tdStyle, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", color: yaRecibido > 0 ? C.green : C.slate }}>{yaRecibido}</td>
                      <td style={{ ...tdStyle, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", color: pend > 0 ? C.amber : C.green, fontWeight: 700 }}>{pend}</td>
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        {pend > 0 ? (
                          <input type="number" min={0} max={pend} value={recepCants[it.id] ?? pend}
                            onFocus={(e) => e.target.select()} onChange={(e) => setRecepCants((p) => ({ ...p, [it.id]: Math.min(+e.target.value, pend) }))}
                            style={{ ...bluInput, width: 70, textAlign: "center" }} />
                        ) : <span style={{ fontSize: 12, color: C.green }}>✓ Completo</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ marginBottom: 12 }}>
              <Field label="N° Factura / Guía de despacho (opcional)">
                <input value={recepFact} onChange={(e) => setRecepFact(e.target.value)}
                  style={inputStyle(300)} placeholder="FAC-00123 o GD-00456" />
              </Field>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => confirmarRecepcion(oc)} style={primaryBtn}><Check size={15} /> Confirmar recepción</button>
              <button onClick={() => setRecepPanel(null)} style={ghostBtn}>Cancelar</button>
            </div>
          </Card>
        );
      })()}

      {/* ── Barra de filtros ── */}
      {compras.length > 0 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ position: "relative", flex: "1 1 240px", maxWidth: 300 }}>
            <Search size={15} color={C.slate} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
            <input value={fBusca} onChange={(e) => setFBusca(e.target.value)}
              placeholder="Folio, proveedor, ref., factura…"
              style={{ ...inputStyle(), width: "100%", paddingLeft: 32, fontSize: 13 }} />
          </div>
          {VISTAS.map((v) => {
            const Icon = v.icon;
            return (
              <FilterBtn key={v.id} active={vista === v.id} onClick={() => setVista(v.id)}>
                <Icon size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />
                {v.label}
              </FilterBtn>
            );
          })}
          <div style={{ width: 1, alignSelf: "stretch", background: C.line, margin: "0 4px" }} />
          {[
            ["all",        "Todos",      C.slate ],
            ["solicitada", "Solicitada", C.slate ],
            ["aprobada",   "Aprobada",   C.purple],
            ["enviada",    "Enviada",    C.steel ],
            ["recibida",   "Recibida",   C.green ],
            ["cancelada",  "Cancelada",  C.red   ],
          ].map(([v, lbl, tone]) => {
            const active = fEstado === v;
            const n = v === "all" ? null : compras.filter((o) => o.estado === v).length;
            return (
              <FilterBtn key={v} active={active} color={active ? tone : undefined} onClick={() => setFEstado(v)}>
                {lbl}{n != null && n > 0 ? ` (${n})` : ""}
              </FilterBtn>
            );
          })}
          {proveedores.length > 0 && (
            <select value={fProv} onChange={(e) => setFProv(e.target.value)} style={{ ...inputStyle(180), fontSize: 12.5 }}>
              <option value="all">Todos los proveedores</option>
              {proveedores.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          )}
          {hayFiltro && (
            <button onClick={() => { setFEstado("all"); setFProv("all"); setFBusca(""); }}
              style={{ padding: "6px 10px", borderRadius: 7, border: `1px solid ${C.line}`, background: "none", color: C.slate, fontSize: 12, cursor: "pointer" }}>
              <X size={13} style={{ display: "inline", verticalAlign: "middle" }} /> Limpiar
            </button>
          )}
          <span style={{ marginLeft: "auto", fontSize: 12, color: C.slate }}>
            {comprasFiltradas.length} de {compras.length} OCs
          </span>
        </div>
      )}

      {!isTabla ? (
        <Section
          title={vista === "kanban" ? "Tablero kanban" : "Cola y detalle"}
          description={vista === "kanban" ? "Columnas por estado del flujo · click en tarjeta para gestionar la OC" : isMobile ? "Selecciona una OC · detalle debajo" : "Cola a la izquierda · detalle y acciones a la derecha"}
          padding={0}
          style={{ marginBottom: 0 }}
        >
          {listaOrdenada.length === 0 ? (
            <EmptyState icon={ShoppingCart} title="Sin OCs en este filtro" description={compras.length === 0 ? "Crea la primera orden de compra." : "Prueba otro filtro o limpia la búsqueda."} />
          ) : vista === "kanban" ? (
            <div className={`inv-kanban-with-detail${selectedOC ? " has-detail" : ""}`}>
              <ComprasKanban lista={listaOrdenada} selectedId={selectedOC?.id} onSelect={setSelectedId}
                ocTotal={ocTotal} ocLinesCount={ocLinesCount} etaSemaforo={etaSemaforo} />
              {selectedOC && (
                <div style={{ padding: 16, borderLeft: isMobile ? "none" : `1px solid ${C.foam}`, borderTop: isMobile ? `1px solid ${C.foam}` : "none", minHeight: 420, overflowY: "auto", maxHeight: "calc(100vh - 280px)" }}>
                  <OCDetailSide oc={selectedOC} its={ocLines(selectedOC)} {...ocDetailSideProps} />
                </div>
              )}
            </div>
          ) : (
            <div className={`inv-split-container${isMobile ? " inv-split-stack" : ""}`}>
              <ComprasQueuePanel lista={listaOrdenada} selectedId={selectedOC?.id} onSelect={setSelectedId}
                busqueda={fBusca} setBusqueda={setFBusca} ocTotal={ocTotal} ocLinesCount={ocLinesCount} etaSemaforo={etaSemaforo}
                panelHeight={isMobile ? "auto" : "calc(100vh - 320px)"} />
              {(!isMobile || selectedOC) && selectedOC && (
                <div style={{ overflowY: "auto", maxHeight: "calc(100vh - 280px)" }}>
                  <OCDetailSide oc={selectedOC} its={ocLines(selectedOC)} {...ocDetailSideProps} />
                </div>
              )}
            </div>
          )}
        </Section>
      ) : (
      <Section title="Tabla completa" description="Listado clásico con filas expandibles" padding={0}>
      {/* ── Tabla principal ── */}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1000 }}>
            <thead><tr>
              <th style={thStyle}>Folio</th>
              <th style={thStyle}>Fecha</th>
              <th style={thStyle}>Proveedor</th>
              <th style={thStyle}>Ítems</th>
              <th style={thStyle}>Destino</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Total</th>
              <th style={thStyle}>ETA</th>
              <th style={thStyle}>Estado</th>
              <th style={thStyle}>Acciones</th>
              {puedeBorrar && <th style={thStyle}></th>}
            </tr></thead>
            <tbody>
              {comprasFiltradas.length === 0 ? (
                <tr><td colSpan={puedeBorrar ? 10 : 9}>
                  <Empty>{compras.length === 0 ? "Sin órdenes de compra." : "Sin OCs para los filtros seleccionados."}</Empty>
                </td></tr>
              ) : comprasFiltradas.map((o) => {
                const its      = ocLines(o);
                const sub      = ocSubtotal(o);
                const tot      = ocTotal(o);
                const urg      = URGENCIAS.find((u) => u.value === (o.urgencia || "normal"));
                const isOpen   = detalleId === o.id;
                const cancelada = o.estado === "cancelada";
                return (
                  <React.Fragment key={o.id}>
                    <tr style={{ opacity: cancelada ? 0.5 : 1, background: isOpen ? tint(C.sky, 5) : undefined }}>
                      {/* Folio + indicador urgencia */}
                      <td style={{ ...tdStyle, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, color: C.steel }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          {o.urgencia && o.urgencia !== "normal" && (
                            <AlertTriangle size={12} color={urg?.color} />
                          )}
                          <button onClick={() => setDetalleId(isOpen ? null : o.id)}
                            title={isOpen ? "Cerrar detalle" : "Ver detalle"}
                            style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit", fontWeight: 700, fontSize: 13, color: C.steel }}>
                            {o.folio}
                          </button>
                        </div>
                        {urg && urg.value !== "normal" && (
                          <div style={{ fontSize: 10, color: urg.color, fontWeight: 700, marginTop: 1 }}>{urg.label}</div>
                        )}
                      </td>
                      <td style={{ ...tdStyle, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: C.slate }}>{o.fecha}</td>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 600 }}>{o.proveedor}</div>
                        {o.proveedor_contacto && <div style={{ fontSize: 11, color: C.slate }}>{o.proveedor_contacto}</div>}
                        {o.condicion_pago && <div style={{ fontSize: 10, color: C.slate }}>Pago: {o.condicion_pago}</div>}
                      </td>
                      <td style={{ ...tdStyle, maxWidth: 240 }}>
                        {its.slice(0, 2).map((it, idx) => (
                          <div key={idx} style={{ fontSize: 12, lineHeight: 1.5 }}>
                            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: C.steel, fontSize: 11 }}>{itemCodigo(it.item_id)}</span>
                            <span style={{ color: C.ink }}> {it.cantidad}× {itemDesc(it.item_id)}</span>
                          </div>
                        ))}
                        {its.length > 2 && <div style={{ fontSize: 11, color: C.slate }}>+{its.length - 2} más…</div>}
                      </td>
                      <td style={{ ...tdStyle, fontSize: 12 }}>{whName(o.bodega_destino)}</td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: C.gold }}>{clp(tot)}</div>
                        <div style={{ fontSize: 10, color: C.slate }}>neto {clp(sub)}</div>
                      </td>
                      <td style={tdStyle}>
                        {(() => {
                          const s = etaSemaforo(o);
                          return s ? (
                            <div>
                              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: C.slate }}>{s.eta}</div>
                              <div style={{ fontSize: 11, fontWeight: 700, color: s.color, marginTop: 2 }}>● {s.label}</div>
                            </div>
                          ) : o.estado === "recibida" ? (
                            <span style={{ fontSize: 11, color: C.green }}>✓ {o.fecha_recepcion}</span>
                          ) : <span style={{ fontSize: 11, color: C.slate }}>—</span>;
                        })()}
                      </td>
                      <td style={{ ...tdStyle, minWidth: 160 }}>
                        <OCStepper estado={o.estado} />
                      </td>
                      <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          <button onClick={() => setDetalleId(isOpen ? null : o.id)} title="Ver detalle"
                            style={{ ...ghostBtn, padding: "4px 8px" }}>
                            <Eye size={13} />
                          </button>
                          <button onClick={() => imprimirOC(o)} title="Imprimir / PDF"
                            style={{ ...ghostBtn, padding: "4px 8px" }}>
                            <Printer size={13} />
                          </button>
                          {!["recibida","cancelada"].includes(o.estado) && puedeOperar && (
                            <button onClick={() => { setDetalleId(o.id); setAutoEditId(o.id); }}
                              title="Editar cantidades solicitadas"
                              style={{ ...ghostBtn, padding: "4px 8px", color: C.sky,
                                borderColor: tint(C.sky, 55), background: tint(C.sky, 9) }}>
                              <SquarePen size={13} />
                            </button>
                          )}
                          {o.estado === "solicitada" && puedeOperar && (
                            <button onClick={() => abrirEditar(o)} title="Editar cabecera OC"
                              style={{ ...ghostBtn, padding: "4px 8px" }}>
                              <Edit2 size={13} />
                            </button>
                          )}
                          {!["recibida","cancelada"].includes(o.estado) && puedeAprobar && (
                            o.estado === "enviada" ? (
                              <button onClick={() => abrirRecepcion(o)}
                                style={{ ...primaryBtn, padding: "4px 10px", fontSize: 12, background: C.cyan, borderColor: C.cyan }}>
                                ↓ Recibir
                              </button>
                            ) : (
                              <button onClick={() => avanzar(o)} style={{ ...ghostBtn, padding: "4px 10px", fontSize: 12 }}>
                                {o.estado === "solicitada" ? "Aprobar" : "Enviar →"}
                              </button>
                            )
                          )}
                          {!["recibida","cancelada"].includes(o.estado) && puedeAprobar && (
                            <button onClick={() => cancelarOC(o)} title="Cancelar OC"
                              style={{ ...ghostBtn, padding: "4px 8px", color: C.red, borderColor: C.red }}>
                              <Ban size={13} />
                            </button>
                          )}
                          {o.estado === "cancelada" && (
                            <span style={{ fontSize: 11, color: C.red }}>Cancelada</span>
                          )}
                          {o.numero_factura && (
                            <div style={{ fontSize: 10, color: C.slate, width: "100%", marginTop: 2 }}>
                              Fact. {o.numero_factura}
                            </div>
                          )}
                        </div>
                      </td>
                      {puedeBorrar && (
                        <td style={tdStyle}>
                          <button onClick={() => eliminar(o.id)} style={{ background: "none", border: "none", cursor: "pointer", color: C.slate }}>
                            <Trash2 size={15} />
                          </button>
                        </td>
                      )}
                    </tr>

                    {/* Fila de detalle expandible */}
                    {isOpen && (
                      <tr>
                        <td colSpan={puedeBorrar ? 10 : 9} style={{ padding: 0, borderTop: `2px solid ${C.sky}`, background: tint(C.sky, 4) }}>
                          <OCDetallePanel
                            oc={o} its={its}
                            itemCodigo={itemCodigo} itemDesc={itemDesc} itemUnidad={itemUnidad}
                            whName={whName}
                            puedeOperar={puedeOperar} profile={profile}
                            items={items} recargar={recargar} setError={setError}
                            autoEdit={autoEditId === o.id}
                            onAutoEditConsumed={() => setAutoEditId(null)}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>
      )}
    </div>
  );
}

// ── Panel lateral kanban/cola con acciones ────────────────────
function OCDetailSide({ oc, its, itemCodigo, itemDesc, itemUnidad, whName, puedeOperar, puedeAprobar, profile, items, recargar, setError,
  autoEdit, onAutoEditConsumed, onImprimir, onAbrirEditar, onAvanzar, onAbrirRecepcion, onCancelar, onStartLineEdit }) {
  return (
    <div data-testid="oc-detail-side" style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.line}`, overflow: "hidden" }}>
      <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.foam}`, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 800, fontSize: 16, color: C.sky }}>{oc.folio}</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.abyss, marginTop: 2 }}>{oc.proveedor}</div>
        </div>
        <OCStepper estado={oc.estado} />
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          <button type="button" onClick={() => onImprimir(oc)} title="Imprimir" style={{ ...ghostBtn, padding: "4px 8px" }}><Printer size={13} /></button>
          {!["recibida", "cancelada"].includes(oc.estado) && puedeOperar && (
            <button type="button" onClick={() => onStartLineEdit(oc.id)} title="Editar cantidades"
              style={{ ...ghostBtn, padding: "4px 8px", color: C.sky, borderColor: tint(C.sky, 55), background: tint(C.sky, 9) }}>
              <SquarePen size={13} />
            </button>
          )}
          {oc.estado === "solicitada" && puedeOperar && (
            <button type="button" onClick={() => onAbrirEditar(oc)} title="Editar cabecera" style={{ ...ghostBtn, padding: "4px 8px" }}><Edit2 size={13} /></button>
          )}
          {!["recibida", "cancelada"].includes(oc.estado) && puedeAprobar && (
            oc.estado === "enviada" ? (
              <button type="button" onClick={() => onAbrirRecepcion(oc)} style={{ ...primaryBtn, padding: "4px 10px", fontSize: 12, background: C.cyan, borderColor: C.cyan }}>↓ Recibir</button>
            ) : (
              <button type="button" onClick={() => onAvanzar(oc)} style={{ ...ghostBtn, padding: "4px 10px", fontSize: 12 }}>
                {oc.estado === "solicitada" ? "Aprobar" : "Enviar →"}
              </button>
            )
          )}
          {!["recibida", "cancelada"].includes(oc.estado) && puedeAprobar && (
            <button type="button" onClick={() => onCancelar(oc)} title="Cancelar OC" style={{ ...ghostBtn, padding: "4px 8px", color: C.red, borderColor: C.red }}><Ban size={13} /></button>
          )}
        </div>
      </div>
      <OCDetallePanel
        oc={oc} its={its}
        itemCodigo={itemCodigo} itemDesc={itemDesc} itemUnidad={itemUnidad}
        whName={whName} puedeOperar={puedeOperar} profile={profile}
        items={items} recargar={recargar} setError={setError}
        autoEdit={autoEdit === oc.id}
        onAutoEditConsumed={onAutoEditConsumed}
      />
    </div>
  );
}

// ── Panel de detalle expandible ───────────────────────────────
function OCDetallePanel({ oc, its, itemCodigo, itemDesc, itemUnidad, whName,
                          puedeOperar, profile, items, recargar, setError,
                          autoEdit, onAutoEditConsumed }) {
  const [modoEdicion, setModoEdicion] = useState(false);
  const [lineEdits,   setLineEdits]   = useState({});
  const [linesToDel,  setLinesToDel]  = useState(new Set());
  const [newLine,     setNewLine]     = useState({ item_id: "", cantidad: 1, precio: 0, descuento_pct: 0 });
  const [guardando,   setGuardando]   = useState(false);

  const canEdit = puedeOperar && !["recibida", "cancelada"].includes(oc.estado);

  // Icono "Editar cantidades" de la tabla: abre el panel ya en modo edición
  React.useEffect(() => {
    if (autoEdit && canEdit && !modoEdicion) { iniciarEdicion(); onAutoEditConsumed?.(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEdit]);

  function iniciarEdicion() {
    const edits = {};
    its.forEach((it) => { edits[it.id] = { cantidad: it.cantidad, precio: it.precio || 0, descuento_pct: it.descuento_pct || 0 }; });
    setLineEdits(edits); setLinesToDel(new Set());
    setNewLine({ item_id: "", cantidad: 1, precio: 0, descuento_pct: 0 });
    setModoEdicion(true);
  }
  function cancelarEdicion() { setModoEdicion(false); setLineEdits({}); setLinesToDel(new Set()); }
  function setEdit(id, field, val) { setLineEdits((p) => ({ ...p, [id]: { ...p[id], [field]: val } })); }
  function toggleDel(id) { setLinesToDel((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; }); }

  async function guardarLineas() {
    setGuardando(true);
    try {
      for (const it of its) {
        if (linesToDel.has(it.id)) {
          await deleteRow("compras_items", it.id);
        } else {
          const e = lineEdits[it.id];
          if (e) await updateRow("compras_items", it.id, { cantidad: e.cantidad, precio: e.precio, descuento_pct: e.descuento_pct });
        }
      }
      if (newLine.item_id) {
        await insertRow("compras_items", profile.empresa_id, {
          compra_id: oc.id, item_id: newLine.item_id,
          cantidad: newLine.cantidad, precio: newLine.precio, descuento_pct: newLine.descuento_pct || 0,
        });
      }
      logActivity(profile, "Editar líneas OC", `${oc.folio} — cantidades actualizadas`);
      setModoEdicion(false); setLineEdits({}); setLinesToDel(new Set()); recargar();
    } catch (e) { setError("No se pudo guardar: " + e.message); }
    finally { setGuardando(false); }
  }

  // Valores a mostrar (edits en modo edición, originales si no)
  const displayIts = its.map((it) => {
    if (!modoEdicion) return it;
    const e = lineEdits[it.id] || {};
    return { ...it, cantidad: e.cantidad ?? it.cantidad, precio: e.precio ?? (it.precio || 0), descuento_pct: e.descuento_pct ?? (it.descuento_pct || 0) };
  });
  const activeIts   = modoEdicion ? displayIts.filter((it) => !linesToDel.has(it.id)) : displayIts;
  const newLineNeto = newLine.item_id ? newLine.cantidad * (newLine.precio || 0) * (1 - (newLine.descuento_pct || 0) / 100) : 0;
  const subtotal    = activeIts.reduce((s, it) => s + lineNeto(it), 0) + newLineNeto;
  const ivaPct      = oc.iva_pct ?? 19;
  const iva         = subtotal * (ivaPct / 100);
  const total       = subtotal + iva;
  const etaStr      = oc.fecha_entrega_esperada || calcETA(oc.fecha, oc.lead_dias) || "—";
  const hasDcto     = activeIts.some((it) => (it.descuento_pct || 0) > 0) || (newLine.descuento_pct || 0) > 0;

  // Ítems ya incluidos en la OC (para excluir del picker)
  const itemIdsEnOc = new Set(its.map((it) => it.item_id));

  return (
    <div style={{ padding: "16px 20px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 14 }}>
        <InfoTile label="Proveedor">
          <div style={{ fontWeight: 600 }}>{oc.proveedor}</div>
          {oc.proveedor_contacto && <div style={{ fontSize: 12, color: C.slate }}>{oc.proveedor_contacto}</div>}
          {oc.proveedor_email    && <div style={{ fontSize: 12, color: C.steel }}>{oc.proveedor_email}</div>}
        </InfoTile>
        <InfoTile label="Destino / ETA">
          <div style={{ fontWeight: 600 }}>{whName(oc.bodega_destino)}</div>
          <div style={{ fontSize: 12, color: C.slate, fontFamily: "'IBM Plex Mono', monospace" }}>{etaStr}</div>
          {oc.condicion_pago && <div style={{ fontSize: 11, color: C.slate }}>Pago: {oc.condicion_pago}</div>}
        </InfoTile>
        <InfoTile label="Ref. / Factura">
          {oc.ref_proveedor  && <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, fontSize: 12 }}>{oc.ref_proveedor}</div>}
          {oc.numero_factura && <div style={{ fontFamily: "'IBM Plex Mono', monospace", color: C.green, fontSize: 12 }}>Fact. {oc.numero_factura}</div>}
          {!oc.ref_proveedor && !oc.numero_factura && <span style={{ color: C.line, fontSize: 12 }}>—</span>}
          <div style={{ fontSize: 11, color: C.slate }}>Moneda: {oc.moneda || "CLP"}</div>
        </InfoTile>
        <InfoTile label="Aprobación">
          {oc.aprobado_por ? (
            <div style={{ fontWeight: 600, fontSize: 12 }}>{oc.aprobado_por}</div>
          ) : (
            <div style={{ color: C.slate, fontSize: 12 }}>{oc.estado === "solicitada" ? "Pendiente" : "—"}</div>
          )}
          {oc.fecha_recepcion && <div style={{ fontSize: 12, color: C.green }}>Recibida: {oc.fecha_recepcion}</div>}
        </InfoTile>
      </div>

      {oc.notas && (
        <div style={{ fontSize: 12, color: C.ink, padding: "8px 12px", background: tint(C.amber, 7), borderRadius: 6, borderLeft: `3px solid ${C.amber}`, marginBottom: 12 }}>
          {oc.notas}
        </div>
      )}

      {/* Cabecera de tabla con botón editar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.slate, textTransform: "uppercase", letterSpacing: 0.6 }}>
          Líneas de la orden
        </div>
        {canEdit && !modoEdicion && (
          <button onClick={iniciarEdicion}
            style={{ ...ghostBtn, padding: "4px 10px", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 5 }}>
            <Edit2 size={12} /> Editar cantidades
          </button>
        )}
        {modoEdicion && (
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={guardarLineas} disabled={guardando}
              style={{ ...primaryBtn, padding: "5px 12px", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 5 }}>
              <Check size={12} /> {guardando ? "Guardando…" : "Guardar"}
            </button>
            <button onClick={cancelarEdicion} disabled={guardando} style={{ ...ghostBtn, padding: "5px 10px", fontSize: 12 }}>
              Cancelar
            </button>
          </div>
        )}
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 12 }}>
        <thead>
          <tr style={{ background: C.foam }}>
            {[
              ["Código",     "left",  90],
              ["Descripción","left",  null],
              ["Unid.",      "right", 52],
              ["Cant.",      "right", 58],
              ["P. Unit.",   "right", 90],
              ...(hasDcto ? [["Desc. %", "right", 62]] : []),
              ["Total neto", "right", 96],
              ["Recibido",   "right", 88],
              ...(modoEdicion ? [["", "center", 36]] : []),
            ].map(([h, al, w], i) => (
              <th key={i} style={{ ...thStyle, background: "transparent", textAlign: al, width: w || undefined, fontSize: 11 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {activeIts.map((it) => {
            const neto      = lineNeto(it);
            const recibido  = it.cantidad_recibida || 0;
            const completo  = recibido >= it.cantidad;
            const marcado   = linesToDel.has(it.id);
            return (
              <tr key={it.id} style={{ borderBottom: `1px solid ${C.foam}`, opacity: marcado ? 0.35 : 1 }}>
                <td style={{ ...tdStyle, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: C.steel, fontSize: 11 }}>{itemCodigo(it.item_id)}</td>
                <td style={{ ...tdStyle, fontSize: 12.5 }}>{itemDesc(it.item_id)}</td>
                <td style={{ ...tdStyle, textAlign: "right", fontSize: 11, color: C.slate }}>{itemUnidad(it.item_id)}</td>

                {/* Cantidad */}
                <td style={{ ...tdStyle, textAlign: "right" }}>
                  {modoEdicion && !marcado ? (
                    <input type="number" min={0.01} step="any" value={lineEdits[it.id]?.cantidad ?? it.cantidad}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setEdit(it.id, "cantidad", +e.target.value)}
                      style={{ ...bluInput, width: 68, textAlign: "right", padding: "4px 6px", fontSize: 12 }} />
                  ) : (
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{it.cantidad}</span>
                  )}
                </td>

                {/* Precio unit. */}
                <td style={{ ...tdStyle, textAlign: "right" }}>
                  {modoEdicion && !marcado ? (
                    <input type="number" min={0} step="any" value={lineEdits[it.id]?.precio ?? (it.precio || 0)}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setEdit(it.id, "precio", +e.target.value)}
                      style={{ ...bluInput, width: 90, textAlign: "right", padding: "4px 6px", fontSize: 12 }} />
                  ) : (
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{clp(it.precio || 0)}</span>
                  )}
                </td>

                {/* Descuento */}
                {hasDcto && (
                  <td style={{ ...tdStyle, textAlign: "right" }}>
                    {modoEdicion && !marcado ? (
                      <input type="number" min={0} max={100} step={0.5} value={lineEdits[it.id]?.descuento_pct ?? (it.descuento_pct || 0)}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => setEdit(it.id, "descuento_pct", +e.target.value)}
                        style={{ ...bluInput, width: 56, textAlign: "right", padding: "4px 6px", fontSize: 12 }} />
                    ) : (
                      <span style={{ color: (it.descuento_pct || 0) > 0 ? C.amber : C.line }}>
                        {(it.descuento_pct || 0) > 0 ? `${it.descuento_pct}%` : "—"}
                      </span>
                    )}
                  </td>
                )}

                <td style={{ ...tdStyle, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>{clp(neto)}</td>
                <td style={{ ...tdStyle, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", color: completo ? C.green : recibido > 0 ? C.amber : C.slate, fontWeight: completo ? 700 : 400 }}>
                  {recibido}/{it.cantidad}
                </td>

                {/* Quitar línea */}
                {modoEdicion && (
                  <td style={{ ...tdStyle, width: 36 }}>
                    {recibido === 0 && (
                      <button onClick={() => toggleDel(it.id)} title={marcado ? "Restaurar" : "Quitar"}
                        style={{ background: "none", border: "none", cursor: "pointer",
                          color: marcado ? C.green : C.red, padding: 2, display: "flex", alignItems: "center" }}>
                        {marcado ? <Check size={13} /> : <X size={13} />}
                      </button>
                    )}
                  </td>
                )}
              </tr>
            );
          })}

          {/* Fila para agregar nueva línea en modo edición */}
          {modoEdicion && (
            <tr style={{ borderBottom: `1px solid ${C.foam}`, background: tint(C.sky, 6) }}>
              <td colSpan={2} style={{ ...tdStyle }}>
                <select value={newLine.item_id}
                  onChange={(e) => {
                    const id = e.target.value;
                    const precio = items.find((i) => i.id === id)?.precio || 0;
                    setNewLine((p) => ({ ...p, item_id: id, precio }));
                  }}
                  style={{ ...inputStyle(), fontSize: 12, width: "100%" }}>
                  <option value="">+ Agregar ítem…</option>
                  {items.filter((i) => !itemIdsEnOc.has(i.id)).map((i) => (
                    <option key={i.id} value={i.id}>{i.codigo} — {i.descripcion}</option>
                  ))}
                </select>
              </td>
              <td style={{ ...tdStyle, textAlign: "right", fontSize: 11, color: C.slate }}>
                {newLine.item_id ? items.find((i) => i.id === newLine.item_id)?.unidad || "u" : ""}
              </td>
              <td style={{ ...tdStyle, textAlign: "right" }}>
                <input type="number" min={0.01} step="any" value={newLine.cantidad}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setNewLine((p) => ({ ...p, cantidad: +e.target.value }))}
                  style={{ ...bluInput, width: 68, textAlign: "right", padding: "4px 6px", fontSize: 12 }} />
              </td>
              <td style={{ ...tdStyle, textAlign: "right" }}>
                <input type="number" min={0} step="any" value={newLine.precio}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setNewLine((p) => ({ ...p, precio: +e.target.value }))}
                  style={{ ...bluInput, width: 90, textAlign: "right", padding: "4px 6px", fontSize: 12 }} />
              </td>
              {hasDcto && (
                <td style={{ ...tdStyle, textAlign: "right" }}>
                  <input type="number" min={0} max={100} step={0.5} value={newLine.descuento_pct}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setNewLine((p) => ({ ...p, descuento_pct: +e.target.value }))}
                    style={{ ...bluInput, width: 56, textAlign: "right", padding: "4px 6px", fontSize: 12 }} />
                </td>
              )}
              <td style={{ ...tdStyle, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", color: C.sky, fontWeight: 600 }}>
                {newLine.item_id ? clp(newLineNeto) : "—"}
              </td>
              <td style={tdStyle} />
              <td style={tdStyle} />
            </tr>
          )}
        </tbody>
      </table>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 8, minWidth: 230, overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 14px", fontSize: 12, borderBottom: `1px solid ${C.foam}` }}>
            <span style={{ color: C.slate }}>Subtotal neto</span>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>{clp(subtotal)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 14px", fontSize: 12, borderBottom: `1px solid ${C.foam}` }}>
            <span style={{ color: C.slate }}>IVA ({ivaPct}%)</span>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>{clp(iva)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "9px 14px", fontSize: 14, fontWeight: 700, background: C.navBg1, color: C.navFg }}>
            <span style={{ opacity: 0.8 }}>Total {oc.moneda || "CLP"}</span>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{clp(total)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Micro-componentes de presentación ─────────────────────────
function KpiCard({ label, value, sub, color }) {
  return (
    <Card style={{ padding: 14 }}>
      <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: C.slate, fontWeight: 600 }}>{label}</div>
      <div style={{ fontFamily: "'Archivo', sans-serif", fontSize: 24, fontWeight: 800, color, marginTop: 6 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.slate, marginTop: 2 }}>{sub}</div>}
    </Card>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: C.slate, fontWeight: 700, marginBottom: 8, paddingBottom: 4, borderBottom: `1px solid ${C.foam}` }}>
      {children}
    </div>
  );
}

function InfoTile({ label, children }) {
  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 7, padding: "10px 12px" }}>
      <div style={{ fontSize: 9, letterSpacing: 1, textTransform: "uppercase", color: C.slate, fontWeight: 700, marginBottom: 5 }}>{label}</div>
      {children}
    </div>
  );
}

// ── Buscador de ítems ─────────────────────────────────────────
function ItemPicker({ items, value, onChange, placeholder = "Buscar por código, descripción o categoría…" }) {
  const [query, setQuery] = useState("");
  const [open,  setOpen]  = useState(false);
  const [hi,    setHi]    = useState(0);
  const blurT    = useRef(null);
  const selected = items.find((i) => i.id === value);

  const filtered = useMemo(() => {
    const q   = query.trim().toLowerCase();
    const src = q
      ? items.filter((i) =>
          (i.codigo      || "").toLowerCase().includes(q) ||
          (i.descripcion || "").toLowerCase().includes(q) ||
          (i.categoria   || "").toLowerCase().includes(q))
      : items;
    return src.slice(0, 50);
  }, [query, items]);

  function pick(item) { onChange(item.id); setQuery(""); setOpen(false); }
  function clear()    { onChange(""); setQuery(""); }

  function onKey(e) {
    if      (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setHi((h) => Math.min(h + 1, filtered.length - 1)); }
    else if (e.key === "ArrowUp")   { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Enter")     { if (open && filtered[hi]) { e.preventDefault(); pick(filtered[hi]); } }
    else if (e.key === "Escape")    { setOpen(false); }
  }

  const displayVal = open || !selected ? query : `${selected.codigo} · ${selected.descripcion}`;

  return (
    <div style={{ position: "relative" }}>
      <Search size={14} color={C.slate} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", zIndex: 1 }} />
      {selected && !open && (
        <button onClick={clear} title="Quitar ítem"
          style={{ position: "absolute", right: 7, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: C.slate, padding: 0, zIndex: 1, display: "flex" }}>
          <X size={13} />
        </button>
      )}
      <input value={displayVal} placeholder={placeholder}
        onChange={(e) => { setQuery(e.target.value); onChange(""); setOpen(true); setHi(0); }}
        onFocus={() => { setOpen(true); if (selected) setQuery(""); }}
        onKeyDown={onKey}
        onBlur={() => { blurT.current = setTimeout(() => { setOpen(false); if (!selected) setQuery(""); }, 150); }}
        style={{ ...inputStyle(), paddingLeft: 30, paddingRight: selected && !open ? 26 : 10, width: "100%",
          fontWeight: selected && !open ? 600 : 400, color: selected && !open ? C.steel : C.ink }}
      />
      {open && filtered.length > 0 && (
        <div onMouseDown={(e) => e.preventDefault()}
          style={{ position: "absolute", zIndex: 50, top: "100%", left: 0, right: 0, marginTop: 3, maxHeight: 320, overflowY: "auto",
            background: C.surface, border: `1px solid ${C.line}`, borderRadius: 8, boxShadow: "0 10px 28px rgba(8,20,32,.18)" }}>
          {filtered.map((item, i) => (
            <div key={item.id} onClick={() => pick(item)} onMouseEnter={() => setHi(i)}
              style={{ padding: "7px 11px", cursor: "pointer", background: i === hi ? tint(C.steel, 12) : "transparent", borderBottom: `1px solid ${C.foam}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 11, color: C.steel, minWidth: 90, flexShrink: 0 }}>{item.codigo}</span>
                <span style={{ fontSize: 12.5, color: C.ink, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.descripcion}</span>
                {item.categoria && <span style={{ fontSize: 11, color: C.slate, background: tint(C.steel, 14), borderRadius: 4, padding: "1px 6px", flexShrink: 0 }}>{item.categoria}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Timeline visual de estado ─────────────────────────────────
const OC_STEPS = [
  { key: "solicitada", label: "Solicitada" },
  { key: "aprobada",   label: "Aprobada"   },
  { key: "enviada",    label: "Enviada"     },
  { key: "recibida",   label: "Recibida"   },
];

function OCStepper({ estado }) {
  if (estado === "cancelada") {
    return <span style={{ fontSize: 11, color: C.red, fontWeight: 600 }}>✕ Cancelada</span>;
  }
  const idx = OC_STEPS.findIndex((s) => s.key === estado);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
      {OC_STEPS.map((step, i) => {
        const done    = i < idx;
        const current = i === idx;
        const color   = done || current ? (estado === "recibida" ? C.green : C.cyan) : C.line;
        return (
          <React.Fragment key={step.key}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: color,
                border: current ? `2px solid ${color}` : "none",
                boxShadow: current ? `0 0 0 3px color-mix(in srgb, ${color} 20%, transparent)` : "none",
                flexShrink: 0 }} />
              <span style={{ fontSize: 8.5, color: current ? color : done ? C.slate : C.line, fontWeight: current ? 700 : 400, whiteSpace: "nowrap" }}>
                {step.label}
              </span>
            </div>
            {i < OC_STEPS.length - 1 && (
              <div style={{ width: 22, height: 2, background: done ? color : C.line, marginBottom: 11, flexShrink: 0 }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
