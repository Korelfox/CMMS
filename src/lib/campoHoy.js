const PRIO = { critica: 0, alta: 1, media: 2, baja: 3 };

// Sube el árbol de equipos (max 3 saltos) hasta llegar al nodo sistema,
// recogiendo los nombres intermedios. Permite contextualizar un componente:
// "Filtro combustible" → ruta "Motor Principal" en lugar de solo "FUEL".
export function rutaEquipo(eq, equipoPorId) {
  if (!eq) return "";
  const parts = [];
  let cur = eq.parent_id ? equipoPorId.get(eq.parent_id) : null;
  while (cur && parts.length < 3) {
    if (cur.tipo_nodo === "sistema") break;
    parts.unshift(cur.nombre || cur.id_visible || "");
    cur = cur.parent_id ? equipoPorId.get(cur.parent_id) : null;
  }
  return parts.filter(Boolean).join(" › ");
}
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
