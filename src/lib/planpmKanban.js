/** Columnas kanban del plan preventivo (semáforo). */
export const PM_KANBAN_COLS = [
  { value: "red", label: "Vencido", tone: "red" },
  { value: "yellow", label: "Próximo", tone: "yellow" },
  { value: "green", label: "OK", tone: "green" },
];

export function ordenarPlanesPM(lista) {
  const prio = { red: 0, yellow: 1, green: 2 };
  return [...lista].sort((a, b) => {
    const pa = prio[a.tone] ?? 9;
    const pb = prio[b.tone] ?? 9;
    if (pa !== pb) return pa - pb;
    const ratioA = a.limite > 0 ? a.elapsed / a.limite : 0;
    const ratioB = b.limite > 0 ? b.elapsed / b.limite : 0;
    if (ratioB !== ratioA) return ratioB - ratioA;
    return (a.plan?.descripcion || "").localeCompare(b.plan?.descripcion || "", "es");
  });
}
