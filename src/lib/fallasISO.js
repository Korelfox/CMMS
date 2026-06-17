// ============================================================
//  Codificación de fallas — ISO 14224 (cap. 8, anexo B).
//  Al cerrar una OT correctiva se registra:
//   - MODO de falla: cómo se manifestó (lo observado).
//   - CAUSA de falla: causa raíz (por qué ocurrió).
//   - MECANISMO: proceso físico/químico del deterioro.
//
//  El MODO se estructura en 3 NIVELES (ISO 14224) para análisis
//  estadístico válido y benchmarking de industria:
//     CLASE  →  GRUPO  →  CÓDIGO (mnemónico ISO)  →  modo local
//  El "value" local (granular) se guarda en la OT; el código ISO
//  estandarizado (VIB, ELP, FTS…) permite comparar contra OREDA y
//  entre flotas. clase/grupo se derivan del value vía modoMeta().
// ============================================================

// Taxonomía de modos de falla: clase → grupo → modos {value, codigo, label, mec}.
// codigo = mnemónico ISO 14224 (B.6). Varios modos locales pueden compartir
// código ISO: el value da detalle, el código da la categoría benchmarkable.
// mec = mecanismos de deterioro PLAUSIBLES (B.2) para ese modo (1º = primario);
// cruza modo↔mecanismo para guiar/validar la codificación. [] = sin restricción.
export const FALLA_TAXONOMIA = [
  {
    clase: "Función y desempeño",
    grupos: [
      { grupo: "Arranque y parada", modos: [
        { value: "no_arranca",     codigo: "FTS", label: "No arranca / falla al arrancar", mec: ["mecanico", "electrico"] },
        { value: "parada_espuria", codigo: "UST", label: "Parada espuria / se detiene solo", mec: ["mecanico", "electrico", "instrumentacion"] },
      ]},
      { grupo: "Capacidad y salida", modos: [
        { value: "baja_potencia",  codigo: "LOO", label: "Baja potencia / rendimiento", mec: ["mecanico", "material", "influencia_externa"] },
      ]},
      { grupo: "Parámetros de operación", modos: [
        { value: "sobrecalentamiento", codigo: "OHE", label: "Sobrecalentamiento", mec: ["mecanico", "material", "influencia_externa"] },
        { value: "baja_presion",       codigo: "PDE", label: "Baja presión (aceite/hidráulica)", mec: ["mecanico", "material"] },
        { value: "alta_presion",       codigo: "PDE", label: "Presión alta / sobrepresión", mec: ["mecanico", "influencia_externa"] },
        { value: "consumo_excesivo",   codigo: "PDE", label: "Consumo excesivo (aceite/combustible)", mec: ["material", "mecanico"] },
      ]},
    ],
  },
  {
    clase: "Fugas y contención",
    grupos: [
      { grupo: "Fuga externa", modos: [
        { value: "fuga_externa_proceso", codigo: "ELP", label: "Fuga externa (combustible/aceite)", mec: ["mecanico", "material"] },
        { value: "fuga_externa_refrig",  codigo: "ELU", label: "Fuga externa (agua/refrigerante)", mec: ["mecanico", "material"] },
      ]},
      { grupo: "Fuga interna", modos: [
        { value: "fuga_interna", codigo: "INL", label: "Fuga interna (sellos, válvulas)", mec: ["mecanico", "material"] },
      ]},
    ],
  },
  {
    clase: "Integridad mecánica",
    grupos: [
      { grupo: "Vibración y ruido", modos: [
        { value: "vibracion", codigo: "VIB", label: "Vibración anormal", mec: ["mecanico"] },
        { value: "ruido",     codigo: "NOI", label: "Ruido anormal", mec: ["mecanico"] },
      ]},
      { grupo: "Daño estructural", modos: [
        { value: "rotura",        codigo: "BRD", label: "Rotura / fractura de componente", mec: ["material", "mecanico"] },
        { value: "deformacion",   codigo: "STD", label: "Deformación / desalineación", mec: ["mecanico", "material"] },
        { value: "desgaste",      codigo: "STD", label: "Desgaste excesivo", mec: ["material", "mecanico"] },
        { value: "corrosion_modo", codigo: "STD", label: "Corrosión visible / picaduras", mec: ["material"] },
      ]},
      { grupo: "Obstrucción", modos: [
        { value: "atasco", codigo: "PLU", label: "Atasco / bloqueo mecánico", mec: ["mecanico", "influencia_externa"] },
      ]},
    ],
  },
  {
    clase: "Eléctrico e instrumentación",
    grupos: [
      { grupo: "Eléctrico", modos: [
        { value: "falla_electrica", codigo: "ELF", label: "Falla eléctrica (corto, aislamiento)", mec: ["electrico"] },
      ]},
      { grupo: "Instrumentación", modos: [
        { value: "lectura_anormal", codigo: "AIR", label: "Lectura/parámetro anormal (instrumento)", mec: ["instrumentacion", "electrico"] },
        { value: "sin_senal",       codigo: "FTF", label: "Sin señal / no responde (instrumento)", mec: ["instrumentacion", "electrico"] },
      ]},
    ],
  },
  {
    clase: "Otros",
    grupos: [
      { grupo: "No especificado", modos: [
        { value: "otro", codigo: "OTH", label: "Otro", mec: [] },
      ]},
    ],
  },
];

// Índice value → { value, codigo, label, grupo, clase } (fuente para roll-up).
const MODO_INDEX = (() => {
  const m = new Map();
  for (const c of FALLA_TAXONOMIA)
    for (const g of c.grupos)
      for (const mo of g.modos)
        m.set(mo.value, { ...mo, grupo: g.grupo, clase: c.clase });
  return m;
})();

// Metadatos de un modo por su value (o texto libre heredado → fallback).
export function modoMeta(value) {
  if (!value) return { value: "", codigo: "—", label: "Sin codificar", grupo: "Sin codificar", clase: "Sin codificar" };
  return MODO_INDEX.get(value)
    || { value, codigo: "—", label: value, grupo: "Sin clasificar", clase: "Sin clasificar" };
}

// Cruce modo↔mecanismo: mecanismos de deterioro plausibles para un modo
// (1º = primario). [] = sin restricción (modo "otro" / desconocido).
export function mecanismosProbables(value) {
  return MODO_INDEX.get(value)?.mec || [];
}

// ¿El mecanismo elegido es plausible para el modo? Guía ISO 14224 (no bloqueante):
// true si coincide, si no hay restricción, o si falta alguno de los dos.
export function coherenteModoMecanismo(value, mecanismo) {
  if (!value || !mecanismo) return true;
  const p = mecanismosProbables(value);
  return p.length === 0 || p.includes(mecanismo);
}

// Lista plana (back-compat con quien importe MODOS_FALLA_ISO).
export const MODOS_FALLA_ISO = [...MODO_INDEX.values()].map((m) => ({ value: m.value, label: m.label }));

// Nombre ISO corto por código (para etiquetas de benchmarking).
export const CODIGO_ISO = {
  FTS: "Falla al arrancar", UST: "Parada espuria", LOO: "Baja salida",
  OHE: "Sobrecalentamiento", PDE: "Desviación de parámetro",
  ELP: "Fuga externa (proceso)", ELU: "Fuga externa (utilidad)", INL: "Fuga interna",
  VIB: "Vibración", NOI: "Ruido", BRD: "Rotura / colapso", STD: "Deficiencia estructural",
  PLU: "Obstrucción", ELF: "Falla eléctrica", AIR: "Lectura anormal",
  FTF: "Falla de función", OTH: "Otro",
};
export const codigoLabel = (codigo) =>
  (codigo && CODIGO_ISO[codigo]) ? `${codigo} · ${CODIGO_ISO[codigo]}` : (codigo || "—");

// Causas raíz (ISO 14224 B.3)
export const CAUSAS_FALLA_ISO = [
  { value: "desgaste_normal",   label: "Desgaste normal / fin de vida útil" },
  { value: "fatiga",            label: "Fatiga del material" },
  { value: "corrosion",         label: "Corrosión / ambiente marino" },
  { value: "cavitacion",        label: "Cavitación / erosión" },
  { value: "falta_lubricacion", label: "Lubricación deficiente o ausente" },
  { value: "contaminacion",     label: "Contaminación (agua, partículas, biológica)" },
  { value: "sobrecarga",        label: "Sobrecarga / operación fuera de rango" },
  { value: "error_operacion",   label: "Error de operación" },
  { value: "error_mantencion",  label: "Error de mantención / montaje" },
  { value: "defecto_material",  label: "Defecto de material o fabricación" },
  { value: "diseno_inadecuado", label: "Diseño / selección inadecuada" },
  { value: "causa_externa",     label: "Causa externa (golpe, clima, red de pesca)" },
  { value: "sin_determinar",    label: "Sin determinar" },
];

// Mecanismos de deterioro (ISO 14224 B.2)
export const MECANISMOS_FALLA_ISO = [
  { value: "mecanico",      label: "Mecánico (desgaste, fractura, atasco)" },
  { value: "material",      label: "Material (corrosión, erosión, fatiga)" },
  { value: "instrumentacion", label: "Instrumentación (descalibrado, sin señal)" },
  { value: "electrico",     label: "Eléctrico (cortocircuito, aislamiento)" },
  { value: "influencia_externa", label: "Influencia externa (bloqueo, contaminación)" },
  { value: "misc",          label: "Misceláneo / otro" },
];

// ¿La OT amerita codificación de falla? (eventos de falla reales)
export const requiereCodigoFalla = (ot) => ot?.tipo === "correctivo";
