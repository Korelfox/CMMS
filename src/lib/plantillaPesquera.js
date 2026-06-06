// ============================================================
//  Plantilla de jerarquía estándar para nave pesquera
//  Basada en ISO 14224 adaptada a flota pesquera artesanal.
//  Niveles cargados: 3 (Sistema) y 4 (Subsistema), más sensores
//  de instrumentación (nivel 7) en subsistemas clave.
//
//  Estructura de cada nodo:
//    cod    → código estructurado (id_visible)
//    nom    → nombre legible (sistema)
//    crit   → criticidad A | B | C
//    tipo   → tipo_nodo: sistema | subsistema | instrumento
//    hijos  → array de subnodos (opcional)
// ============================================================

export const PLANTILLA_PESQUERA = [
  {
    cod: "PROP", nom: "Propulsión Principal", crit: "A", tipo: "sistema",
    hijos: [
      { cod: "PROP-MTR", nom: "Motor Principal",     crit: "A", tipo: "subsistema" },
      { cod: "PROP-RED", nom: "Reductora",           crit: "A", tipo: "subsistema" },
      { cod: "PROP-EJE", nom: "Eje y Bocina",        crit: "A", tipo: "subsistema" },
      { cod: "PROP-HEL", nom: "Hélice",              crit: "A", tipo: "subsistema" },
      { cod: "PROP-TIM", nom: "Timón y Gobierno",    crit: "A", tipo: "subsistema" },
    ],
  },
  {
    cod: "LUB", nom: "Lubricación Motor", crit: "B", tipo: "sistema",
    hijos: [
      { cod: "LUB-BMP", nom: "Bomba de Aceite",  crit: "B", tipo: "subsistema" },
      { cod: "LUB-TNK", nom: "Tanque de Aceite", crit: "B", tipo: "subsistema" },
      { cod: "LUB-FLT", nom: "Filtros de Aceite", crit: "B", tipo: "subsistema" },
      { cod: "LUB-SEN-P", nom: "Sensor Presión Aceite", crit: "B", tipo: "instrumento" },
    ],
  },
  {
    cod: "COOL", nom: "Enfriamiento Motor", crit: "B", tipo: "sistema",
    hijos: [
      { cod: "COOL-BAM", nom: "Bomba Agua de Mar",     crit: "B", tipo: "subsistema" },
      { cod: "COOL-BAD", nom: "Bomba Agua Dulce",      crit: "B", tipo: "subsistema" },
      { cod: "COOL-INT", nom: "Intercambiador de Calor", crit: "B", tipo: "subsistema" },
      { cod: "COOL-SEN-T", nom: "Sensor Temperatura Motor", crit: "B", tipo: "instrumento" },
    ],
  },
  {
    cod: "FUEL", nom: "Sistema Combustible", crit: "A", tipo: "sistema",
    hijos: [
      { cod: "FUEL-TNK", nom: "Tanques Combustible",   crit: "A", tipo: "subsistema" },
      { cod: "FUEL-BMP", nom: "Bombas Combustible",    crit: "A", tipo: "subsistema" },
      { cod: "FUEL-FLT", nom: "Filtros Combustible",   crit: "A", tipo: "subsistema" },
      { cod: "FUEL-INY", nom: "Inyectores",            crit: "A", tipo: "subsistema" },
      { cod: "FUEL-SEP", nom: "Separador Agua-Combustible", crit: "A", tipo: "subsistema" },
    ],
  },
  {
    cod: "GEN", nom: "Generación Eléctrica", crit: "A", tipo: "sistema",
    hijos: [
      { cod: "GEN-PRN", nom: "Generador Principal",  crit: "A", tipo: "subsistema" },
      { cod: "GEN-EMG", nom: "Generador Emergencia", crit: "A", tipo: "subsistema" },
      { cod: "GEN-ALT", nom: "Alternador",           crit: "A", tipo: "subsistema" },
      { cod: "GEN-REG", nom: "Regulador de Voltaje", crit: "A", tipo: "subsistema" },
    ],
  },
  {
    cod: "ELEC", nom: "Sistema Eléctrico", crit: "B", tipo: "sistema",
    hijos: [
      { cod: "ELEC-TAB", nom: "Tablero Principal",    crit: "B", tipo: "subsistema" },
      { cod: "ELEC-INT", nom: "Interruptores",        crit: "B", tipo: "subsistema" },
      { cod: "ELEC-BAT", nom: "Banco de Baterías",    crit: "B", tipo: "subsistema" },
      { cod: "ELEC-CAB", nom: "Cables y Conductores", crit: "B", tipo: "subsistema" },
    ],
  },
  {
    cod: "HYD", nom: "Hidráulico Pesquero", crit: "A", tipo: "sistema",
    hijos: [
      { cod: "HYD-PMP", nom: "Bomba Hidráulica",      crit: "A", tipo: "subsistema" },
      { cod: "HYD-VLV", nom: "Válvulas de Control",   crit: "A", tipo: "subsistema" },
      { cod: "HYD-MNG", nom: "Mangueras Hidráulicas", crit: "A", tipo: "subsistema" },
      { cod: "HYD-CIL", nom: "Cilindros Hidráulicos", crit: "A", tipo: "subsistema" },
      { cod: "HYD-ENF", nom: "Enfriador Hidráulico",  crit: "B", tipo: "subsistema" },
      { cod: "HYD-SEN-P", nom: "Sensor Presión Hidráulica", crit: "A", tipo: "instrumento" },
    ],
  },
  {
    cod: "FISH", nom: "Equipo de Pesca", crit: "A", tipo: "sistema",
    hijos: [
      { cod: "FISH-WIN", nom: "Winche Principal",  crit: "A", tipo: "subsistema" },
      { cod: "FISH-WAX", nom: "Winche Auxiliar",   crit: "A", tipo: "subsistema" },
      { cod: "FISH-PWB", nom: "Power Block",       crit: "A", tipo: "subsistema" },
      { cod: "FISH-GRU", nom: "Pluma / Grúa",      crit: "A", tipo: "subsistema" },
      { cod: "FISH-NRD", nom: "Redes y Artes",     crit: "A", tipo: "subsistema" },
    ],
  },
  {
    cod: "RSW", nom: "Refrigeración RSW", crit: "A", tipo: "sistema",
    hijos: [
      { cod: "RSW-CMP", nom: "Compresor",        crit: "A", tipo: "subsistema" },
      { cod: "RSW-CND", nom: "Condensador",      crit: "A", tipo: "subsistema" },
      { cod: "RSW-EVA", nom: "Evaporador / Chiller", crit: "A", tipo: "subsistema" },
      { cod: "RSW-BAM", nom: "Bomba Agua de Mar", crit: "A", tipo: "subsistema" },
      { cod: "RSW-BOD", nom: "Bodegas de Pesca",  crit: "A", tipo: "subsistema" },
      { cod: "RSW-SEN-T", nom: "Sensor Temperatura RSW", crit: "A", tipo: "instrumento" },
    ],
  },
  {
    cod: "NAV", nom: "Navegación y Electrónica", crit: "A", tipo: "sistema",
    hijos: [
      { cod: "NAV-GPS", nom: "GPS / Plotter",       crit: "A", tipo: "subsistema" },
      { cod: "NAV-VMS", nom: "VMS Satelital",       crit: "A", tipo: "subsistema" },
      { cod: "NAV-RAD", nom: "Radar",               crit: "A", tipo: "subsistema" },
      { cod: "NAV-SON", nom: "Sonda / Ecosonda",    crit: "A", tipo: "subsistema" },
      { cod: "NAV-VHF", nom: "VHF / Radio",         crit: "A", tipo: "subsistema" },
      { cod: "NAV-PIL", nom: "Piloto Automático",   crit: "B", tipo: "subsistema" },
    ],
  },
  {
    cod: "SAF", nom: "Seguridad", crit: "A", tipo: "sistema",
    hijos: [
      { cod: "SAF-ACH", nom: "Bombas de Achique",   crit: "A", tipo: "subsistema" },
      { cod: "SAF-EXT", nom: "Extintores",          crit: "A", tipo: "subsistema" },
      { cod: "SAF-BAL", nom: "Balsa Salvavidas",    crit: "A", tipo: "subsistema" },
      { cod: "SAF-EPI", nom: "EPIRB / Baliza",      crit: "A", tipo: "subsistema" },
      { cod: "SAF-CHA", nom: "Chalecos y EPP",      crit: "A", tipo: "subsistema" },
    ],
  },
  {
    cod: "WAT", nom: "Agua y Lastre", crit: "B", tipo: "sistema",
    hijos: [
      { cod: "WAT-TND", nom: "Tanques Agua Dulce", crit: "B", tipo: "subsistema" },
      { cod: "WAT-BMP", nom: "Bombas de Agua",     crit: "B", tipo: "subsistema" },
      { cod: "WAT-LST", nom: "Tanques de Lastre",  crit: "B", tipo: "subsistema" },
    ],
  },
  {
    cod: "STR", nom: "Casco y Estructura", crit: "B", tipo: "sistema",
    hijos: [
      { cod: "STR-CAS", nom: "Casco",            crit: "B", tipo: "subsistema" },
      { cod: "STR-CUB", nom: "Cubierta",         crit: "B", tipo: "subsistema" },
      { cod: "STR-MAM", nom: "Mamparos",         crit: "B", tipo: "subsistema" },
      { cod: "STR-ANO", nom: "Ánodos de Sacrificio", crit: "B", tipo: "subsistema" },
    ],
  },
  {
    cod: "AIR", nom: "Aire de Arranque", crit: "B", tipo: "sistema",
    hijos: [
      { cod: "AIR-CMP", nom: "Compresor de Aire",   crit: "B", tipo: "subsistema" },
      { cod: "AIR-BOT", nom: "Botellas de Aire",    crit: "B", tipo: "subsistema" },
    ],
  },
];

// Cuenta total de nodos de la plantilla
export function contarNodosPlantilla() {
  return PLANTILLA_PESQUERA.reduce((s, sis) => s + 1 + (sis.hijos?.length || 0), 0);
}

// Metadatos de tipos de nodo (para íconos/colores en la UI)
export const TIPO_NODO_META = {
  sistema:      { label: "Sistema",       color: "#2563EB" },
  subsistema:   { label: "Subsistema",    color: "#0891B2" },
  componente:   { label: "Componente",    color: "#059669" },
  instrumento:  { label: "Instrumento",   color: "#7C3AED" },
  equipo:       { label: "Equipo",        color: "#64748B" },
};

export const CRITICIDAD_TONE = { A: "red", B: "yellow", C: "green" };
