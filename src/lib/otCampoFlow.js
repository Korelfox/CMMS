// Flujo lineal Campo para OT (Capa 3 — wizard mobile).

export const CAMPO_WIZARD_STEPS = [
  { id: "checklist", label: "Checklist" },
  { id: "fotos", label: "Fotos" },
  { id: "repuestos", label: "Repuestos", optional: true },
  { id: "cierre", label: "Cierre" },
];

export function stepIndex(stepId) {
  return CAMPO_WIZARD_STEPS.findIndex((s) => s.id === stepId);
}

/** Siguiente paso; desde Fotos puede saltar Repuestos (opcional). */
export function nextCampoStep(current, { skipRepuestos = false } = {}) {
  const idx = stepIndex(current);
  if (idx < 0) return "checklist";
  if (current === "fotos" && skipRepuestos) return "cierre";
  return CAMPO_WIZARD_STEPS[idx + 1]?.id ?? current;
}

export function prevCampoStep(current) {
  const idx = stepIndex(current);
  return idx > 0 ? CAMPO_WIZARD_STEPS[idx - 1].id : current;
}

export function findOtEnEjecucion(ots = []) {
  return (ots || []).find((o) => o.estado === "en_ejecucion") || null;
}
