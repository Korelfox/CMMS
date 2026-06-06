/**
 * Construye un árbol plano de equipos ordenado por jerarquía padre→hijo,
 * y dentro de cada nivel por CRITICIDAD (A → B → C → sin clasificar) y luego
 * por código. Cada elemento incluye:
 *   - `depth`  (0 = raíz) para indentación visual
 *   - `rootId` (id del sistema raíz ancestro) para colapsar por sistema
 * Exportada para que cualquier módulo la use con orden consistente.
 */
const CRIT_RANK = { A: 0, B: 1, C: 2 };

function ordenarNivel(arr) {
  return [...arr].sort((a, b) => {
    const ra = CRIT_RANK[a.criticidad] ?? 3;
    const rb = CRIT_RANK[b.criticidad] ?? 3;
    if (ra !== rb) return ra - rb;
    return (a.id_visible || a.sistema || "").localeCompare(b.id_visible || b.sistema || "", "es");
  });
}

export function buildEquipoTree(equipos) {
  const inSet = new Set(equipos.map((e) => e.id));
  // Raíces: sin parent o con parent fuera del conjunto
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
  // Raíces ordenadas por criticidad → lo más crítico primero
  ordenarNivel(roots).forEach((r) => traverse(r, 0, r.id));
  // Huérfanos (parent borrado): al final como raíz
  ordenarNivel(equipos.filter((e) => !visited.has(e.id)))
    .forEach((e) => result.push({ ...e, depth: 0, rootId: e.id }));
  return result;
}
