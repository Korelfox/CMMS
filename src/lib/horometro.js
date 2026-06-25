// ============================================================
//  Lógica pura de lecturas de horómetro
//  - validarLectura: integridad de la lectura (no decreciente,
//    ritmo físicamente posible ≤ 24 h/día → warning si lo supera).
//  - tendenciaHorasDia: ritmo de uso (h/día) desde el historial.
//  - diasHasta: proyección de días hasta unas horas objetivo
//    (p. ej. próximo PM) dada la tendencia.
// ============================================================

export const MAX_HORAS_DIA = 24;
const MS_DIA = 86400000;

// Valida una lectura nueva contra la última conocida.
// → { ok:false, error }  rechazo duro (no se guarda)
// → { ok:true, warning } se puede guardar pero conviene confirmar
// → { ok:true }          limpia
export function validarLectura({ horasPrev = null, fechaPrev = null, horas, fecha = new Date() }) {
  const h = Number(horas);
  if (!Number.isFinite(h) || h < 0) {
    return { ok: false, error: "La lectura debe ser un número mayor o igual a 0." };
  }
  if (horasPrev == null) return { ok: true };

  const prev = Number(horasPrev);
  if (h < prev) {
    return { ok: false, error: `La lectura (${h} h) no puede ser menor que la anterior (${prev} h). Si el horómetro fue reemplazado, registra una nota.` };
  }

  const delta = h - prev;
  if (fechaPrev != null) {
    const dias = Math.max((new Date(fecha) - new Date(fechaPrev)) / MS_DIA, 0);
    const maxPosible = Math.max(dias, 1) * MAX_HORAS_DIA; // mismo día: tope 24 h
    if (delta > maxPosible) {
      return {
        ok: true,
        warning: `Salto de ${Math.round(delta)} h en ${Math.max(dias, 1).toFixed(1)} día(s) supera el máximo físico (~${Math.round(maxPosible)} h). Verifica la lectura antes de guardar.`,
      };
    }
  }
  return { ok: true };
}

// Tendencia de uso en horas/día: pendiente entre la primera y la última de las
// últimas `n` lecturas (ordenadas por fecha). null si no hay datos suficientes.
// Requiere ≥3 días de cobertura para evitar inflación por lecturas agrupadas en un solo día.
export function tendenciaHorasDia(lecturas, n = 6) {
  const ordenadas = (lecturas || [])
    .filter((l) => l && l.fecha != null && Number.isFinite(Number(l.horas)))
    .slice()
    .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  const ventana = ordenadas.slice(-n);
  if (ventana.length < 2) return null;
  const dias = (new Date(ventana[ventana.length - 1].fecha) - new Date(ventana[0].fecha)) / MS_DIA;
  if (dias < 3) return null;
  const delta = Number(ventana[ventana.length - 1].horas) - Number(ventana[0].horas);
  if (delta < 0) return null;
  return delta / dias;
}

// Días estimados hasta alcanzar horasObjetivo, dada la tendencia (h/día).
// null si no hay tendencia válida; 0 si ya se alcanzó/superó.
export function diasHasta(horasActual, horasObjetivo, horasPorDia) {
  if (!Number.isFinite(horasPorDia) || horasPorDia <= 0) return null;
  const restante = Number(horasObjetivo) - Number(horasActual);
  if (!Number.isFinite(restante)) return null;
  return restante <= 0 ? 0 : restante / horasPorDia;
}

// Días transcurridos desde una fecha (para semáforo de "lectura al día").
export function diasDesde(fecha, hoy = new Date()) {
  if (!fecha) return null;
  return Math.max((hoy - new Date(fecha)) / MS_DIA, 0);
}

// ── Herencia de horómetro ────────────────────────────────────────────────
// El horómetro vive en la MÁQUINA (modo 'propio'); sus componentes 'hereda'
// usan esas horas. Los nodos 'no' (estructura) quedan fuera.
export const modoHorometro = (eq) => eq?.horometro || "hereda";

// Devuelve el id del nodo que TIENE el horómetro para `equipo`:
//  - él mismo si es 'propio'
//  - el ancestro 'propio' más cercano si 'hereda'
//  - horas_fuente_id si no hay ancestro propio (p. ej. reductora hermana del motor)
//  - null si es 'no', o si no hay fuente válida
export function puntoHorometro(equipo, byId) {
  if (!equipo || modoHorometro(equipo) === "no") return null;
  if (modoHorometro(equipo) === "propio") return equipo.id;

  let cur = equipo;
  const seen = new Set();
  while (cur?.parent_id && !seen.has(cur.parent_id)) {
    seen.add(cur.parent_id);
    cur = byId.get(cur.parent_id);
    if (!cur) break;
    if (modoHorometro(cur) === "propio") return cur.id;
  }

  const fuenteId = equipo.horas_fuente_id;
  if (fuenteId) {
    const fuente = byId.get(fuenteId);
    if (fuente && modoHorometro(fuente) === "propio") return fuenteId;
  }
  return null;
}

// ids de los equipos cuyo punto de horómetro es `propioId` (el propio + sus
// descendientes que heredan). Sirve para propagar una lectura a todo el subárbol.
export function idsBajoPunto(propioId, equipos, byId) {
  return equipos.filter((e) => puntoHorometro(e, byId) === propioId).map((e) => e.id);
}

/** Orden de lectura en bandeja: rol operacional de la máquina (flota pesquera). */
const ORDEN_ROL_HOROMETRO = [
  { id: "motor_principal", re: /motor\s+principal/i },
  { id: "motor_generador", re: /motor\s+generador/i },
  { id: "motor_diesel", re: /motor\s+diesel/i },
  { id: "generador_emergencia", re: /generador\s+(de\s+)?emergencia/i },
  { id: "compresor_frigorifico", re: /compresor\s+frigor[ií]fic/i },
];

function textoEquipoHorometro(eq) {
  return `${eq?.sistema || ""} ${eq?.id_visible || ""}`;
}

/** Índice de prioridad (menor = primero en bandeja). Equipos no listados al final. */
export function prioridadPuntoHorometro(equipo) {
  const t = textoEquipoHorometro(equipo);
  for (let i = 0; i < ORDEN_ROL_HOROMETRO.length; i++) {
    if (ORDEN_ROL_HOROMETRO[i].re.test(t)) return i;
  }
  return ORDEN_ROL_HOROMETRO.length;
}

/** Comparador para bandeja de horómetros (rol → nave → nombre). */
export function compararPuntosHorometro(a, b, embNameFn = null) {
  const pa = prioridadPuntoHorometro(a);
  const pb = prioridadPuntoHorometro(b);
  if (pa !== pb) return pa - pb;
  if (embNameFn) {
    const ce = embNameFn(a.embarcacion_id).localeCompare(embNameFn(b.embarcacion_id), "es");
    if (ce !== 0) return ce;
  }
  return (a.sistema || "").localeCompare(b.sistema || "", "es");
}
