import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Receipt, Upload, CheckCircle2, AlertTriangle, Trash2, Plus,
  RefreshCw, Package, Warehouse, Edit3, RotateCcw,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { fetchAll, insertRow, updateRow, upsertRow, logActivity } from "../lib/db";
import { matchItem, calcularTotales, validarFactura, formatRUT } from "../lib/facturas";
import { C, clp, archivo } from "../theme";
import { Card, PageHead, ErrorBanner, InlineSpinner, inputStyle, primaryBtn, ghostBtn } from "../ui";
import { hoyLocal } from "../lib/fechas";

// ── Utilidades de imagen ───────────────────────────────────────────────────────

async function resizeImage(file, maxWidth = 1600) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxWidth / img.naturalWidth);
      const canvas = document.createElement("canvas");
      canvas.width  = Math.round(img.naturalWidth  * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("No se pudo comprimir la imagen"))),
        "image/jpeg",
        0.92,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("No se pudo leer la imagen")); };
    img.src = url;
  });
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ── Construcción del form desde datos OCR ────────────────────────────────────

function initForm(ocr, inventario) {
  const lineas = (ocr.items || []).map((it) => {
    const ms = matchItem(it.descripcion || "", inventario);
    return {
      _key:           Math.random().toString(36).slice(2),
      descripcion:    String(it.descripcion || ""),
      codigo:         String(it.codigo || ""),
      cantidad:       Number(it.cantidad) || 1,
      unidad:         String(it.unidad || "UN"),
      precio_unitario: Number(it.precio_unitario) || 0,
      precio_total:    Number(it.precio_total) || 0,
      item_id:         ms[0]?.score >= 0.5 ? ms[0].item.id : null,
      matches:         ms.slice(0, 6),
    };
  });
  return {
    folio:         String(ocr.folio || ""),
    fecha:         String(ocr.fecha || hoyLocal()),
    proveedor:     String(ocr.proveedor || ""),
    rut_proveedor: formatRUT(ocr.rut_proveedor || ""),
    notas:         String(ocr.observaciones || ""),
    iva_pct:       19,
    moneda:        "CLP",
    ocr_raw:       ocr,
    lineas,
  };
}

// ── Helpers de color / presentación ─────────────────────────────────────────

function scoreDots(score) {
  if (score >= 0.7) return "●●●";
  if (score >= 0.4) return "●●○";
  return "●○○";
}

// ── Componente principal ───────────────────────────────────────────────────────

export default function OcrFacturas() {
  const { profile } = useAuth();

  const [stage,   setStage]   = useState("idle");  // idle | ocr | review | saving | success
  const [errMsg,  setErrMsg]  = useState(null);
  const [preview, setPreview] = useState(null);     // blob URL del thumbnail
  const [form,    setForm]    = useState(null);
  const [bodegaId, setBodegaId] = useState("");
  const [actualizarPrecios, setActualizarPrecios] = useState(true);
  const [savedResult, setSavedResult] = useState(null);

  const [bodegas,   setBodegas]   = useState([]);
  const [invItems,  setInvItems]  = useState([]);
  const [stockData, setStockData] = useState([]);
  const [dataErr,   setDataErr]   = useState(null);

  const inputRef = useRef(null);

  useEffect(() => {
    Promise.all([
      fetchAll("bodegas",          { order: { col: "codigo", asc: true } }),
      fetchAll("inventario_items", { order: { col: "codigo", asc: true } }),
      fetchAll("stock"),
    ])
      .then(([b, its, stk]) => {
        setBodegas(b);
        setInvItems(its);
        setStockData(stk);
        if (b.length > 0) setBodegaId(b[0].id);
      })
      .catch((e) => setDataErr("No se pudo cargar el catálogo: " + e.message));
  }, []);

  // ── Manejo de archivo ────────────────────────────────────────────────────────

  async function handleFile(file) {
    if (!file) return;
    const TIPOS = ["image/jpeg", "image/png", "image/webp"];
    if (!TIPOS.includes(file.type)) {
      setErrMsg("Solo se aceptan JPG, PNG o WebP. Para PDF usa una captura de pantalla.");
      return;
    }
    setErrMsg(null);
    setPreview(URL.createObjectURL(file));
    setStage("ocr");

    try {
      const resized = await resizeImage(file, 1600);
      const b64     = await blobToBase64(resized);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Sesión expirada. Vuelve a iniciar sesión.");

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ocr-factura`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization:  `Bearer ${session.access_token}`,
            apikey:         import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ image_base64: b64, media_type: "image/jpeg" }),
        },
      );

      const res = await resp.json();
      if (!resp.ok || res.error) throw new Error(res.error || "Error al procesar la imagen");

      setForm(initForm(res.data, invItems));
      setStage("review");
    } catch (e) {
      setErrMsg(e.message);
      setStage("idle");
    }
  }

  function onDrop(e) {
    e.preventDefault();
    handleFile(e.dataTransfer?.files?.[0]);
  }

  // ── Edición del form ─────────────────────────────────────────────────────────

  function setField(key, val) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  function setLinea(lineaKey, key, val) {
    setForm((f) => ({
      ...f,
      lineas: f.lineas.map((l) => {
        if (l._key !== lineaKey) return l;
        const next = { ...l, [key]: val };
        // Recalcula precio_total si cambia cantidad o precio_unitario
        if (key === "cantidad" || key === "precio_unitario") {
          next.precio_total = Math.round(Number(next.cantidad) * Number(next.precio_unitario));
        }
        return next;
      }),
    }));
  }

  function onItemIdChange(lineaKey, newItemId) {
    const invItem = invItems.find((i) => i.id === newItemId);
    setForm((f) => ({
      ...f,
      lineas: f.lineas.map((l) => {
        if (l._key !== lineaKey) return l;
        const precioItem = invItem?.precio || 0;
        return {
          ...l,
          item_id:         newItemId || null,
          precio_unitario: l.precio_unitario > 0 ? l.precio_unitario : precioItem,
          precio_total:    l.precio_total   > 0 ? l.precio_total   : Math.round(l.cantidad * precioItem),
        };
      }),
    }));
  }

  function eliminarLinea(lineaKey) {
    setForm((f) => ({ ...f, lineas: f.lineas.filter((l) => l._key !== lineaKey) }));
  }

  function agregarLinea() {
    setForm((f) => ({
      ...f,
      lineas: [
        ...f.lineas,
        {
          _key: Math.random().toString(36).slice(2),
          descripcion: "", codigo: "", cantidad: 1, unidad: "UN",
          precio_unitario: 0, precio_total: 0,
          item_id: null, matches: [],
        },
      ],
    }));
  }

  // ── Totales derivados ────────────────────────────────────────────────────────

  const totales = useMemo(
    () => (form ? calcularTotales(form.lineas, form.iva_pct) : { neto: 0, iva: 0, total: 0 }),
    [form],
  );

  // ── Guardar ──────────────────────────────────────────────────────────────────

  async function confirmar() {
    const errores = validarFactura(form);
    if (errores.length > 0) { setErrMsg(errores[0]); return; }
    setErrMsg(null);
    setStage("saving");

    try {
      const año     = new Date().getFullYear();
      const sufijo  = form.folio || Date.now().toString().slice(-6);
      const folioOC = `FACT-${año}-${sufijo}`;

      // 1. Registro de compra (estado: recibida, sin flujo de aprobación)
      const compra = await insertRow("compras", profile.empresa_id, {
        folio:           folioOC,
        fecha:           form.fecha,
        proveedor:       form.proveedor.trim(),
        estado:          "recibida",
        fecha_recepcion: form.fecha,
        bodega_destino:  bodegaId || null,
        numero_factura:  form.folio || null,
        iva_pct:         form.iva_pct,
        moneda:          form.moneda,
        notas:           form.notas || null,
        created_by:      profile.id,
      });

      let stockAct = 0;
      let preciosAct = 0;

      for (const linea of form.lineas) {
        // 2. Líneas de compra
        await insertRow("compras_items", profile.empresa_id, {
          compra_id:         compra.id,
          item_id:           linea.item_id || null,
          cantidad:          Number(linea.cantidad),
          precio:            Number(linea.precio_unitario),
          descuento_pct:     0,
          cantidad_recibida: linea.item_id ? Number(linea.cantidad) : 0,
        });

        // 3. Stock: upsert sumando al existente
        if (linea.item_id && bodegaId) {
          const prev = stockData.find(
            (s) => s.item_id === linea.item_id && s.bodega_id === bodegaId,
          );
          const cantPrev = Number(prev?.cantidad) || 0;
          await upsertRow(
            "stock",
            profile.empresa_id,
            { item_id: linea.item_id, bodega_id: bodegaId, cantidad: cantPrev + Number(linea.cantidad) },
            "item_id,bodega_id",
          );
          stockAct++;
        }

        // 4. Actualizar precio en catálogo (opcional)
        if (actualizarPrecios && linea.item_id && linea.precio_unitario > 0) {
          await updateRow("inventario_items", linea.item_id, {
            precio: Number(linea.precio_unitario),
          });
          preciosAct++;
        }
      }

      await logActivity(
        profile,
        "OCR Factura",
        `${folioOC} · ${form.proveedor} · ${form.lineas.length} ítem(s) · ${clp(totales.total)}`,
      );

      setSavedResult({ folioOC, stockAct, preciosAct, itemsTotal: form.lineas.length });
      setStage("success");
    } catch (e) {
      setErrMsg(e.message);
      setStage("review");
    }
  }

  function reiniciar() {
    setStage("idle");
    setForm(null);
    setPreview(null);
    setErrMsg(null);
    setSavedResult(null);
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div>
      <PageHead
        kicker="Almacén & Compras"
        title="OCR Facturas"
        sub="Sube una foto de factura de proveedor: Claude Vision extrae ítems y precios, y actualiza el stock automáticamente."
        Icon={Receipt}
      />

      <ErrorBanner>{dataErr}</ErrorBanner>
      {errMsg && (
        <div style={{ background: "#fef2f2", border: `1px solid ${C.red}`, borderRadius: 8, padding: "10px 16px", marginBottom: 16, color: C.red, fontSize: 14 }}>
          <AlertTriangle size={14} style={{ marginRight: 6, verticalAlign: "middle" }} />
          {errMsg}
        </div>
      )}

      {stage === "idle"    && <DropZone inputRef={inputRef} onFile={handleFile} onDrop={onDrop} />}
      {stage === "ocr"     && <OcrSpinner previewUrl={preview} />}
      {stage === "review"  && (
        <ReviewForm
          form={form}
          bodegas={bodegas}
          invItems={invItems}
          totales={totales}
          bodegaId={bodegaId}
          setBodegaId={setBodegaId}
          actualizarPrecios={actualizarPrecios}
          setActualizarPrecios={setActualizarPrecios}
          previewUrl={preview}
          setField={setField}
          setLinea={setLinea}
          onItemIdChange={onItemIdChange}
          eliminarLinea={eliminarLinea}
          agregarLinea={agregarLinea}
          onConfirm={confirmar}
          onReiniciar={reiniciar}
        />
      )}
      {stage === "saving"  && <SavingSpinner />}
      {stage === "success" && <SuccessView result={savedResult} onReiniciar={reiniciar} />}
    </div>
  );
}

// ── DropZone ──────────────────────────────────────────────────────────────────

function DropZone({ inputRef, onFile, onDrop }) {
  const [over, setOver] = useState(false);
  return (
    <Card>
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { setOver(false); onDrop(e); }}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${over ? C.blue : C.line}`,
          borderRadius: 12,
          padding: "64px 32px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
          cursor: "pointer",
          background: over ? `${C.blue}0d` : "transparent",
          transition: "all .18s",
        }}
      >
        <div style={{ background: `${C.blue}18`, borderRadius: "50%", padding: 20 }}>
          <Receipt size={40} color={C.blue} />
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>
          Arrastra una factura aquí
        </div>
        <div style={{ fontSize: 13, color: C.slate, textAlign: "center" }}>
          o haz click para seleccionar · JPG, PNG o WebP · Max ~5 MB
        </div>
        <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
          {["📸 Foto de factura", "🖼️ Captura de pantalla", "📷 Imagen escaneada"].map((t) => (
            <div key={t} style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 20, padding: "4px 12px", fontSize: 12, color: C.slate }}>
              {t}
            </div>
          ))}
        </div>
        <button
          style={{ ...primaryBtn, marginTop: 8 }}
          onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
        >
          <Upload size={15} /> Seleccionar imagen
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          style={{ display: "none" }}
          onChange={(e) => onFile(e.target.files?.[0])}
        />
      </div>
    </Card>
  );
}

// ── Spinners ───────────────────────────────────────────────────────────────────

function OcrSpinner({ previewUrl }) {
  return (
    <Card>
      <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
        {previewUrl && (
          <img
            src={previewUrl}
            alt="Factura"
            style={{ width: 220, borderRadius: 8, border: `1px solid ${C.line}`, objectFit: "contain", maxHeight: 300 }}
          />
        )}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 12, paddingTop: 24 }}>
          <InlineSpinner label="Claude Vision está leyendo la factura…" />
          <div style={{ fontSize: 13, color: C.slate }}>
            Extrayendo proveedor, ítems, cantidades y precios. Esto toma ~15 segundos.
          </div>
        </div>
      </div>
    </Card>
  );
}

function SavingSpinner() {
  return (
    <Card>
      <InlineSpinner label="Guardando factura y actualizando stock…" />
    </Card>
  );
}

// ── ReviewForm ────────────────────────────────────────────────────────────────

function ReviewForm({
  form, bodegas, invItems, totales,
  bodegaId, setBodegaId,
  actualizarPrecios, setActualizarPrecios,
  previewUrl,
  setField, setLinea, onItemIdChange, eliminarLinea, agregarLinea,
  onConfirm, onReiniciar,
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Layout 2 columnas en pantallas anchas */}
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>

        {/* Columna izquierda: preview */}
        <div style={{ width: 260, flexShrink: 0, position: "sticky", top: 16 }}>
          <Card>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.slate, marginBottom: 8, textTransform: "uppercase", letterSpacing: ".06em" }}>
              Documento original
            </div>
            {previewUrl && (
              <img
                src={previewUrl}
                alt="Factura"
                style={{ width: "100%", borderRadius: 6, border: `1px solid ${C.line}`, objectFit: "contain" }}
              />
            )}
            <button onClick={onReiniciar} style={{ ...ghostBtn, width: "100%", marginTop: 12, fontSize: 12 }}>
              <RotateCcw size={13} /> Cambiar imagen
            </button>
          </Card>
        </div>

        {/* Columna derecha: form */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Encabezado de la factura */}
          <Card>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 12 }}>
              Datos del encabezado
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Proveedor *">
                <input
                  style={inputStyle}
                  value={form.proveedor}
                  onChange={(e) => setField("proveedor", e.target.value)}
                  placeholder="Razón social"
                />
              </Field>
              <Field label="RUT proveedor">
                <input
                  style={inputStyle}
                  value={form.rut_proveedor}
                  onChange={(e) => setField("rut_proveedor", e.target.value)}
                  placeholder="76.543.210-9"
                />
              </Field>
              <Field label="Nro. factura (folio)">
                <input
                  style={inputStyle}
                  value={form.folio}
                  onChange={(e) => setField("folio", e.target.value)}
                  placeholder="Folio del proveedor"
                />
              </Field>
              <Field label="Fecha *">
                <input
                  type="date"
                  style={inputStyle}
                  value={form.fecha}
                  onChange={(e) => setField("fecha", e.target.value)}
                />
              </Field>
            </div>
            <div style={{ marginTop: 12 }}>
              <Field label="Observaciones">
                <input
                  style={inputStyle}
                  value={form.notas}
                  onChange={(e) => setField("notas", e.target.value)}
                  placeholder="Notas adicionales"
                />
              </Field>
            </div>
          </Card>

          {/* Tabla de ítems */}
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                Ítems extraídos ({form.lineas.length})
              </div>
              <button onClick={agregarLinea} style={{ ...ghostBtn, fontSize: 12 }}>
                <Plus size={13} /> Agregar ítem
              </button>
            </div>

            {form.lineas.length === 0 ? (
              <div style={{ color: C.slate, fontSize: 13, padding: "16px 0" }}>
                Sin ítems. Usa "Agregar ítem" para añadir manualmente.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {form.lineas.map((linea) => (
                  <LineaRow
                    key={linea._key}
                    linea={linea}
                    invItems={invItems}
                    onChange={(k, v) => setLinea(linea._key, k, v)}
                    onItemId={(id) => onItemIdChange(linea._key, id)}
                    onDelete={() => eliminarLinea(linea._key)}
                  />
                ))}
              </div>
            )}
          </Card>

          {/* Totales + destino */}
          <Card>
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start" }}>

              {/* Totales */}
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 10 }}>
                  Resumen
                </div>
                <TotalRow label="Neto"  value={clp(totales.neto)}  />
                <TotalRow label={`IVA ${form.iva_pct}%`} value={clp(totales.iva)} />
                <TotalRow label="Total" value={clp(totales.total)} bold />
              </div>

              {/* Destino + opciones */}
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 10 }}>
                  Destino del stock
                </div>
                <Field label="Bodega">
                  <select
                    style={inputStyle}
                    value={bodegaId}
                    onChange={(e) => setBodegaId(e.target.value)}
                  >
                    <option value="">— Sin asignar bodega —</option>
                    {bodegas.map((b) => (
                      <option key={b.id} value={b.id}>{b.codigo} – {b.nombre}</option>
                    ))}
                  </select>
                </Field>

                <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, cursor: "pointer", fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={actualizarPrecios}
                    onChange={(e) => setActualizarPrecios(e.target.checked)}
                  />
                  <span style={{ color: C.text }}>Actualizar precio unitario en catálogo</span>
                </label>
              </div>
            </div>

            {/* Resumen de vinculación */}
            <MatchSummary lineas={form.lineas} bodegaId={bodegaId} />
          </Card>

          {/* Botones */}
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onReiniciar} style={{ ...ghostBtn }}>
              <RotateCcw size={14} /> Cancelar
            </button>
            <button onClick={onConfirm} style={{ ...primaryBtn, flex: 1 }}>
              <CheckCircle2 size={15} /> Confirmar e ingresar al stock
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── LineaRow ─────────────────────────────────────────────────────────────────

function LineaRow({ linea, invItems, onChange, onItemId, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const vinculado = invItems.find((i) => i.id === linea.item_id);

  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: "10px 12px" }}>
      {/* Fila principal */}
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        {/* Descripción */}
        <div style={{ flex: 3 }}>
          <div style={{ fontSize: 11, color: C.slate, marginBottom: 3 }}>Descripción</div>
          <input
            style={{ ...inputStyle, fontSize: 13 }}
            value={linea.descripcion}
            onChange={(e) => onChange("descripcion", e.target.value)}
            placeholder="Descripción del ítem"
          />
        </div>
        {/* Cantidad */}
        <div style={{ width: 64 }}>
          <div style={{ fontSize: 11, color: C.slate, marginBottom: 3 }}>Cant.</div>
          <input
            type="number"
            min="0"
            step="any"
            style={{ ...inputStyle, fontSize: 13 }}
            value={linea.cantidad}
            onChange={(e) => onChange("cantidad", e.target.value)}
          />
        </div>
        {/* Unidad */}
        <div style={{ width: 64 }}>
          <div style={{ fontSize: 11, color: C.slate, marginBottom: 3 }}>Unidad</div>
          <input
            style={{ ...inputStyle, fontSize: 13 }}
            value={linea.unidad}
            onChange={(e) => onChange("unidad", e.target.value)}
          />
        </div>
        {/* Precio unit */}
        <div style={{ width: 100 }}>
          <div style={{ fontSize: 11, color: C.slate, marginBottom: 3 }}>P. Unit.</div>
          <input
            type="number"
            min="0"
            style={{ ...inputStyle, fontSize: 13 }}
            value={linea.precio_unitario}
            onChange={(e) => onChange("precio_unitario", e.target.value)}
          />
        </div>
        {/* Precio total */}
        <div style={{ width: 100 }}>
          <div style={{ fontSize: 11, color: C.slate, marginBottom: 3 }}>Total</div>
          <input
            type="number"
            min="0"
            style={{ ...inputStyle, fontSize: 13 }}
            value={linea.precio_total}
            onChange={(e) => onChange("precio_total", e.target.value)}
          />
        </div>
        {/* Acciones */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingTop: 18 }}>
          <button
            title="Vincular al inventario"
            onClick={() => setExpanded((x) => !x)}
            style={{ ...ghostBtn, padding: "4px 6px", fontSize: 12 }}
          >
            <Edit3 size={13} />
          </button>
          <button
            title="Eliminar ítem"
            onClick={onDelete}
            style={{ ...ghostBtn, padding: "4px 6px", color: C.red }}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Fila de vinculación (expandible) */}
      {expanded && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.line}` }}>
          <div style={{ fontSize: 11, color: C.slate, marginBottom: 4 }}>
            <Package size={11} style={{ verticalAlign: "middle", marginRight: 4 }} />
            Vincular al catálogo de inventario
          </div>
          <select
            style={{ ...inputStyle, fontSize: 12 }}
            value={linea.item_id || ""}
            onChange={(e) => onItemId(e.target.value || null)}
          >
            <option value="">— Sin vincular (no actualiza stock) —</option>
            {linea.matches.length > 0 && (
              <optgroup label={`Coincidencias para "${linea.descripcion.slice(0, 30)}…"`}>
                {linea.matches.map(({ item, score }) => (
                  <option key={item.id} value={item.id}>
                    {scoreDots(score)} {item.codigo} – {item.descripcion}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label="Todo el catálogo">
              {invItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.codigo} – {item.descripcion}
                </option>
              ))}
            </optgroup>
          </select>
          {vinculado && (
            <div style={{ marginTop: 4, fontSize: 12, color: C.green }}>
              <CheckCircle2 size={11} style={{ verticalAlign: "middle", marginRight: 4 }} />
              Vinculado: {vinculado.codigo} – {vinculado.descripcion}
            </div>
          )}
        </div>
      )}

      {/* Chip de vinculación (cuando no está expandido) */}
      {!expanded && linea.item_id && vinculado && (
        <div style={{ marginTop: 6, fontSize: 11, color: C.green, display: "flex", alignItems: "center", gap: 4 }}>
          <CheckCircle2 size={11} />
          {vinculado.codigo} – {vinculado.descripcion}
        </div>
      )}
      {!expanded && linea.item_id === null && linea.matches.length > 0 && (
        <div style={{ marginTop: 6, fontSize: 11, color: C.amber, display: "flex", alignItems: "center", gap: 4 }}>
          <AlertTriangle size={11} />
          Posible coincidencia: {linea.matches[0].item.codigo} ({Math.round(linea.matches[0].score * 100)}%)
          {" · "}
          <span
            style={{ cursor: "pointer", textDecoration: "underline" }}
            onClick={() => onItemId(linea.matches[0].item.id)}
          >
            Vincular
          </span>
          {" · "}
          <span
            style={{ cursor: "pointer", textDecoration: "underline" }}
            onClick={() => setExpanded(true)}
          >
            Ver más
          </span>
        </div>
      )}
    </div>
  );
}

// ── MatchSummary ──────────────────────────────────────────────────────────────

function MatchSummary({ lineas, bodegaId }) {
  const vinculadas = lineas.filter((l) => l.item_id).length;
  const total      = lineas.length;
  const conStock   = bodegaId ? vinculadas : 0;

  return (
    <div style={{ marginTop: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
      <Chip icon={<Package size={13} />} label={`${vinculadas}/${total} ítems vinculados`} color={vinculadas === total ? C.green : C.amber} />
      <Chip icon={<Warehouse size={13} />} label={bodegaId ? `${conStock} actualizarán el stock` : "Sin bodega seleccionada"} color={bodegaId ? C.blue : C.slate} />
      {!bodegaId && (
        <div style={{ fontSize: 12, color: C.amber, alignSelf: "center" }}>
          <AlertTriangle size={12} style={{ verticalAlign: "middle", marginRight: 4 }} />
          Sin bodega: la factura se registra pero el stock no se actualiza.
        </div>
      )}
    </div>
  );
}

// ── SuccessView ───────────────────────────────────────────────────────────────

function SuccessView({ result, onReiniciar }) {
  return (
    <Card>
      <div style={{ textAlign: "center", padding: "32px 16px" }}>
        <div style={{ background: `${C.green}20`, borderRadius: "50%", width: 72, height: 72, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
          <CheckCircle2 size={36} color={C.green} />
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: C.text, marginBottom: 6 }}>
          Factura ingresada
        </div>
        <div style={{ fontSize: 14, color: C.slate, marginBottom: 24 }}>
          {result.folioOC}
        </div>

        <div style={{ display: "flex", justifyContent: "center", gap: 20, marginBottom: 28, flexWrap: "wrap" }}>
          <StatBox label="Ítems procesados" value={result.itemsTotal} />
          <StatBox label="Stock actualizado" value={result.stockAct} color={C.green} />
          {result.preciosAct > 0 && (
            <StatBox label="Precios actualizados" value={result.preciosAct} color={C.blue} />
          )}
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button onClick={onReiniciar} style={primaryBtn}>
            <RefreshCw size={14} /> Procesar otra factura
          </button>
        </div>
      </div>
    </Card>
  );
}

// ── Micro-componentes ─────────────────────────────────────────────────────────

function Field({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: C.slate, marginBottom: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em" }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function TotalRow({ label, value, bold }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: bold ? 15 : 13, fontWeight: bold ? 800 : 400, color: bold ? C.text : C.slate, borderTop: bold ? `1px solid ${C.line}` : undefined, marginTop: bold ? 4 : 0, paddingTop: bold ? 6 : 3 }}>
      <span>{label}</span>
      <span style={{ fontFamily: archivo, color: bold ? C.text : C.slate }}>{value}</span>
    </div>
  );
}

function Chip({ icon, label, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, background: `${color}18`, border: `1px solid ${color}44`, borderRadius: 20, padding: "3px 10px", fontSize: 12, color }}>
      {icon}{label}
    </div>
  );
}

function StatBox({ label, value, color }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 10, padding: "12px 24px", textAlign: "center" }}>
      <div style={{ fontSize: 28, fontWeight: 800, color: color || C.text }}>{value}</div>
      <div style={{ fontSize: 12, color: C.slate }}>{label}</div>
    </div>
  );
}
