const PRIO = { critica: 0, alta: 1, media: 2, baja: 3 };

/** Nombre legible del equipo (campo `sistema` en BD). */
export function nombreEquipo(eq) {
  if (!eq) return "";
  return (eq.sistema || eq.nombre || eq.id_visible || "").trim();
}

/** Nodo sistema raíz del equipo en el árbol. */
export function sistemaRaiz(eq, equipoPorId) {
  if (!eq) return null;
  let cur = eq;
  let raiz = eq.tipo_nodo === "sistema" ? eq : null;
  const seen = new Set([eq.id]);
  while (cur?.parent_id && !seen.has(cur.parent_id)) {
    const p = equipoPorId.get(cur.parent_id);
    if (!p) break;
    seen.add(p.id);
    if (p.tipo_nodo === "sistema") raiz = p;
    cur = p;
  }
  return raiz;
}

// Sube el árbol hasta el sistema, recogiendo subsistemas intermedios.
// Ej.: "Propulsión › Motor › Bomba FW" para contextualizar un componente.
export function rutaEquipo(eq, equipoPorId) {
  if (!eq) return "";
  const raiz = sistemaRaiz(eq, equipoPorId);
  const parts = [];
  let cur = eq.parent_id ? equipoPorId.get(eq.parent_id) : null;
  const seen = new Set();
  while (cur && !seen.has(cur.id) && parts.length < 4) {
    seen.add(cur.id);
    if (cur.tipo_nodo === "sistema") break;
    const n = nombreEquipo(cur);
    if (n) parts.unshift(n);
    cur = cur.parent_id ? equipoPorId.get(cur.parent_id) : null;
  }
  const raizNom = raiz ? nombreEquipo(raiz) : "";
  if (raizNom && raizNom !== nombreEquipo(eq) && !parts.includes(raizNom)) {
    return [raizNom, ...parts].filter(Boolean).join(" › ");
  }
  return parts.filter(Boolean).join(" › ");
}

/**
 * Etiqueta de equipo para el ejecutor en Campo.
 * titulo: qué equipo/componente · lineaEquipo: código + ubicación en la nave.
 */
export function describeEquipoCampo(eq, equipoPorId) {
  if (!eq) return { titulo: "", lineaEquipo: "" };

  const codigo = (eq.id_visible || "").trim();
  const nombre = nombreEquipo(eq);
  const raiz = sistemaRaiz(eq, equipoPorId);
  const nombreRaiz = raiz ? nombreEquipo(raiz) : "";
  const ruta = rutaEquipo(eq, equipoPorId);
  const mm = [eq.marca, eq.modelo].filter(Boolean).join(" ").trim();

  let titulo = nombre || codigo || "Equipo";
  if (eq.tipo_nodo !== "sistema" && nombreRaiz && titulo === nombreRaiz && codigo) {
    const tail = codigo.split("-").slice(-2).join("-");
    if (tail && tail !== codigo) titulo = `${nombreRaiz} · ${tail.replace(/-/g, " ")}`;
  }

  const lineaParts = [];
  if (codigo) lineaParts.push(codigo);
  if (ruta) lineaParts.push(ruta);
  else if (nombreRaiz && nombreRaiz !== titulo) lineaParts.push(nombreRaiz);
  if (mm) lineaParts.push(mm);
  if (eq.criticidad) lineaParts.push(`Crit. ${eq.criticidad}`);

  return { titulo, lineaEquipo: lineaParts.join(" · ") };
}

/** OT + equipo → textos para listas y wizard Campo. */
export function describeOtCampo(ot, eq, equipoPorId) {
  const trabajo = (ot?.descripcion || "").trim();
  if (!eq) {
    return {
      titulo: (ot?.sistema || ot?.folio || "OT").trim(),
      lineaEquipo: ot?.folio || "",
      trabajo,
    };
  }
  const { titulo, lineaEquipo } = describeEquipoCampo(eq, equipoPorId);
  return { titulo, lineaEquipo, trabajo };
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
