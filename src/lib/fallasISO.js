// ============================================================
//  Catálogos de codificación de fallas — ISO 14224 (cap. 8, anexo B)
//  Al cerrar una OT correctiva se registra:
//   - MODO de falla: cómo se manifestó (lo que se observa).
//   - CAUSA de falla: causa raíz (por qué ocurrió).
//   - MECANISMO: proceso físico/químico del deterioro.
//  Con fallas codificadas, Pareto / Weibull / MTBF analizan datos
//  comparables entre equipos y períodos — no texto libre.
// ============================================================

// Modos de falla típicos de maquinaria rotativa / naval (ISO 14224 B.6)
export const MODOS_FALLA_ISO = [
  { value: "no_arranca",        label: "No arranca / falla al arrancar" },
  { value: "parada_espuria",    label: "Parada espuria / se detiene solo" },
  { value: "baja_potencia",     label: "Baja potencia / rendimiento" },
  { value: "sobrecalentamiento", label: "Sobrecalentamiento" },
  { value: "fuga_externa_proceso", label: "Fuga externa (combustible/aceite)" },
  { value: "fuga_externa_refrig",  label: "Fuga externa (agua/refrigerante)" },
  { value: "fuga_interna",      label: "Fuga interna (sellos, válvulas)" },
  { value: "vibracion",         label: "Vibración anormal" },
  { value: "ruido",             label: "Ruido anormal" },
  { value: "baja_presion",      label: "Baja presión (aceite/hidráulica)" },
  { value: "alta_presion",      label: "Presión alta / sobrepresión" },
  { value: "desgaste",          label: "Desgaste excesivo" },
  { value: "rotura",            label: "Rotura / fractura de componente" },
  { value: "atasco",            label: "Atasco / bloqueo mecánico" },
  { value: "deformacion",       label: "Deformación / desalineación" },
  { value: "corrosion_modo",    label: "Corrosión visible / picaduras" },
  { value: "falla_electrica",   label: "Falla eléctrica (corto, aislamiento)" },
  { value: "lectura_anormal",   label: "Lectura/parámetro anormal (instrumento)" },
  { value: "sin_senal",         label: "Sin señal / no responde (instrumento)" },
  { value: "consumo_excesivo",  label: "Consumo excesivo (aceite/combustible)" },
  { value: "otro",              label: "Otro" },
];

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
