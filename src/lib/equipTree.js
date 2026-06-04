/**
 * Construye un árbol plano de equipos ordenado por jerarquía padre→hijo.
 * Cada elemento tiene `depth` (0 = raíz) para indentación visual.
 * Exportada desde aquí para que cualquier módulo la use sin importar desde un componente.
 */
export function buildEquipoTree(equipos) {
  const inSet = new Set(equipos.map((e) => e.id));
  // Raíces: sin parent o con parent fuera del conjunto
  const roots = equipos.filter((e) => !e.parent_id || !inSet.has(e.parent_id));
  const visited = new Set();
  const result  = [];

  function traverse(node, depth) {
    if (visited.has(node.id)) return; // guard circular
    visited.add(node.id);
    result.push({ ...node, depth });
    equipos.filter((c) => c.parent_id === node.id).forEach((c) => traverse(c, depth + 1));
  }
  roots.forEach((r) => traverse(r, 0));
  // Huérfanos (parent borrado): al final como raíz
  equipos.filter((e) => !visited.has(e.id)).forEach((e) => result.push({ ...e, depth: 0 }));
  return result;
}

/**
 * Renderiza las <option> de un select de equipos con jerarquía visual.
 * Uso: {equipoOptions(equiposDeNave)}
 */
export function equipoOptions(equipos, placeholder = "— Ninguno —") {
  const tree = buildEquipoTree(equipos);
  return [
    placeholder ? <option key="__none" value="">{placeholder}</option> : null,
    ...tree.map((eq) => (
      <option key={eq.id} value={eq.id}>
        {"　".repeat(eq.depth)}{eq.depth > 0 ? "└─ " : ""}{eq.id_visible} · {eq.sistema}
      </option>
    )),
  ].filter(Boolean);
}
