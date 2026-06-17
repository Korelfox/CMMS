/** Columnas kanban del plan preventivo (orden de lectura: al día → atención). */
export const PM_KANBAN_COLS = [
  { value: "green", label: "OK", tone: "green", flex: "1 1 208px", minWidth: 195 },
  { value: "yellow", label: "Próximo", tone: "yellow", flex: "0 0 230px", minWidth: 214 },
  { value: "red", label: "Vencido", tone: "red", flex: "0 0 246px", minWidth: 230 },
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
