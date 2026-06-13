// ============================================================
//  Procesamiento de facturas de proveedores.
//  Funciones puras para coincidencia difusa de ítems, parsing de
//  montos en formato chileno y validación antes de guardar.
// ============================================================

// Parsea montos en formato chileno: "1.234.567,89" → 1234567.89
export function parseMontoCLP(str) {
  if (str == null || str === "") return null;
  const s = String(str).trim().replace(/[$\s]/g, "");
  const partes = s.split(",");
  const entero = partes[0].replace(/\./g, "");
  const dec    = partes[1] ?? "0";
  const n = parseFloat(`${entero}.${dec}`);
  return isNaN(n) ? null : n;
}

function normalizar(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Similitud por tokens compartidos (0–1). Umbral práctico de coincidencia: ≥ 0.35
export function scoreMatch(a, b) {
  const ta = new Set(normalizar(a).split(" ").filter((t) => t.length >= 2));
  const tb = new Set(normalizar(b).split(" ").filter((t) => t.length >= 2));
  if (ta.size === 0 || tb.size === 0) return 0;
  let comunes = 0;
  for (const t of ta) if (tb.has(t)) comunes++;
  return comunes / Math.max(ta.size, tb.size);
}

// Ordena los ítems de inventario por similitud a la descripción extraída (score > 0).
export function matchItem(descripcion, inventario = []) {
  if (!descripcion) return [];
  return inventario
    .map((item) => ({
      item,
      score: Math.max(
        scoreMatch(descripcion, item.descripcion || ""),
        scoreMatch(descripcion, item.codigo || ""),
      ),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
}

// Calcula neto, IVA y total desde las líneas de la factura.
export function calcularTotales(lineas, ivaPct = 19) {
  const neto = lineas.reduce((s, l) => s + (Number(l.precio_total) || 0), 0);
  const iva  = Math.round(neto * (ivaPct / 100));
  return { neto, iva, total: neto + iva };
}

// Validación de campos mínimos antes de guardar.
export function validarFactura(factura) {
  const errores = [];
  if (!factura.proveedor?.trim()) errores.push("Proveedor es requerido.");
  if (!factura.fecha)             errores.push("Fecha es requerida.");
  if (!factura.lineas?.length)    errores.push("La factura debe tener al menos un ítem.");
  if (factura.lineas?.some((l) => !(Number(l.cantidad) > 0)))
    errores.push("Todos los ítems deben tener cantidad mayor a 0.");
  return errores;
}

// Formatea RUT chileno: "765432109" → "76.543.210-9"
export function formatRUT(rut) {
  if (!rut) return "";
  const clean = String(rut).replace(/[^0-9kK]/g, "");
  if (clean.length < 2) return String(rut);
  const body = clean.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const dv   = clean.slice(-1).toUpperCase();
  return `${body}-${dv}`;
}
