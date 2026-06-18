const PRIO = { critica: 0, alta: 1, media: 2, baja: 3 };
const ESTADO = { en_ejecucion: 0, programada: 1, planificada: 2, solicitada: 3 };

export function ordenarOtsCampo(ots) {
  return [...ots].sort((a, b) => {
    const ea = ESTADO[a.estado] ?? 9;
    const eb = ESTADO[b.estado] ?? 9;
    if (ea !== eb) return ea - eb;
    return (PRIO[a.prioridad] ?? 9) - (PRIO[b.prioridad] ?? 9);
  });
}

export function agruparProgramacion(items, hoy) {
  const pendientes = items.filter((p) => !p.done);
  const hoyList = [];
  const atrasadas = [];
  const proximas = [];

  for (const p of pendientes) {
    const f = (p.fecha_programada || "").slice(0, 10);
    if (!f) continue;
    if (f === hoy) hoyList.push(p);
    else if (f < hoy) atrasadas.push(p);
    else proximas.push(p);
  }

  atrasadas.sort((a, b) => (a.fecha_programada || "").localeCompare(b.fecha_programada || ""));
  proximas.sort((a, b) => (a.fecha_programada || "").localeCompare(b.fecha_programada || ""));

  return { hoy: hoyList, atrasadas, proximas: proximas.slice(0, 7) };
}

export function labelProgFecha(fechaStr, hoy) {
  const f = (fechaStr || "").slice(0, 10);
  if (f === hoy) return "Hoy";
  if (f < hoy) return "Atrasada";
  const d = new Date(f + "T12:00:00");
  const dias = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  return `${dias[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
}
