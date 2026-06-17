/** Columnas kanban por estado operacional del equipo (orden de lectura: flota sana → atención). */
export const EQ_KANBAN_COLS = [
  { value: "operativo", label: "Operativo", tone: "green", flex: "1 1 250px", minWidth: 234 },
  { value: "en_reparacion", label: "En reparación", tone: "steel", flex: "0 0 232px", minWidth: 216 },
  { value: "desgaste", label: "Desgaste", tone: "yellow", flex: "0 0 218px", minWidth: 202 },
  { value: "fuera_servicio", label: "Fuera de servicio", tone: "red", flex: "0 0 234px", minWidth: 218 },
];

export function kanbanEstadoKey(eq) {
  const e = eq?.estado || "operativo";
  return EQ_KANBAN_COLS.some((c) => c.value === e) ? e : "operativo";
}

const PRIO_ESTADO = { fuera_servicio: 0, en_reparacion: 1, desgaste: 2, operativo: 3 };
const PRIO_CRIT = { A: 0, B: 1, C: 2, "": 3 };

export function ordenarEquipos(lista) {
  return [...lista].sort((a, b) => {
    const ea = kanbanEstadoKey(a.equipo);
    const eb = kanbanEstadoKey(b.equipo);
    const pa = PRIO_ESTADO[ea] ?? 9;
    const pb = PRIO_ESTADO[eb] ?? 9;
    if (pa !== pb) return pa - pb;
    const ca = PRIO_CRIT[a.equipo?.criticidad ?? ""] ?? 3;
    const cb = PRIO_CRIT[b.equipo?.criticidad ?? ""] ?? 3;
    if (ca !== cb) return ca - cb;
    if (a.brecha && !b.brecha) return -1;
    if (!a.brecha && b.brecha) return 1;
    return (a.equipo?.id_visible || "").localeCompare(b.equipo?.id_visible || "", "es");
  });
}
