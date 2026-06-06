/**
 * Construye un árbol plano de equipos ordenado por jerarquía padre→hijo.
 * Las RAÍCES (sistemas) se ordenan por un orden canónico de sistema
 * (Propulsión, Generación, Combustible, Hidráulico, Pesca, …); los
 * SUBSISTEMAS dentro de cada sistema, por criticidad (A→B→C) y código.
 * Cada elemento incluye:
 *   - `depth`  (0 = raíz) para indentación visual
 *   - `rootId` (id del sistema raíz ancestro) para colapsar por sistema
 */

// Orden canónico de sistemas (por su código en id_visible: NAVE-PROP → PROP).
export const ORDEN_SISTEMA = [
  "PROP", "GEN", "FUEL", "HYD", "FISH",   // los 5 que pidió el usuario, en ese orden
  "RSW", "NAV", "SAF",                       // calidad de pesca · seguridad/normativa
  "LUB", "COOL", "ELEC",                     // auxiliares de motor / eléctrico
  "WAT", "AIR", "STR",                       // agua/lastre · aire · estructura
];
const CRIT_RANK = { A: 0, B: 1, C: 2 };

function rankSistema(eq) {
  const segs = (eq.id_visible || "").toUpperCase().split("-");
  for (const s of segs) {
    const i = ORDEN_SISTEMA.indexOf(s);
    if (i >= 0) return i;
  }
  return 999; // sistemas no catalogados al final
}
const rankCrit = (e) => CRIT_RANK[e.criticidad] ?? 3;
const porCodigo = (a, b) => (a.id_visible || a.sistema || "").localeCompare(b.id_visible || b.sistema || "", "es");

// Raíces: por orden de sistema → criticidad → código
function ordenarRaices(arr) {
  return [...arr].sort((a, b) => rankSistema(a) - rankSistema(b) || rankCrit(a) - rankCrit(b) || porCodigo(a, b));
}
// Subsistemas: por criticidad → código
function ordenarNivel(arr) {
  return [...arr].sort((a, b) => rankCrit(a) - rankCrit(b) || porCodigo(a, b));
}

export function buildEquipoTree(equipos) {
  const inSet = new Set(equipos.map((e) => e.id));
  const roots = equipos.filter((e) => !e.parent_id || !inSet.has(e.parent_id));
  const visited = new Set();
  const result  = [];

  function traverse(node, depth, rootId) {
    if (visited.has(node.id)) return; // guard circular
    visited.add(node.id);
    result.push({ ...node, depth, rootId });
    ordenarNivel(equipos.filter((c) => c.parent_id === node.id))
      .forEach((c) => traverse(c, depth + 1, rootId));
  }
  ordenarRaices(roots).forEach((r) => traverse(r, 0, r.id));
  // Huérfanos (parent borrado): al final como raíz
  ordenarRaices(equipos.filter((e) => !visited.has(e.id)))
    .forEach((e) => result.push({ ...e, depth: 0, rootId: e.id }));
  return result;
}
