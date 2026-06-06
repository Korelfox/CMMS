// ============================================================
//  Plantilla de jerarquía estándar para nave pesquera
//  Basada en ISO 14224 adaptada a flota pesquera artesanal.
//  Profundidad variable: el Motor Principal se desglosa en
//  subsistemas (lubricación, enfriamiento, inyección) y componentes;
//  `hijos` puede anidarse a cualquier nivel.
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
      {
        cod: "PROP-MTR", nom: "Motor Principal", crit: "A", tipo: "subsistema",
        hijos: [
          { cod: "MTR-CIL", nom: "Cilindros y Pistones", crit: "A", tipo: "componente" },
          { cod: "MTR-VLV", nom: "Válvulas",             crit: "A", tipo: "componente" },
          { cod: "MTR-TUR", nom: "Turbo / Turbina",      crit: "A", tipo: "componente" },
          {
            cod: "MTR-LUB", nom: "Lubricación", crit: "A", tipo: "componente",
            hijos: [
              { cod: "MTR-LUB-BMP", nom: "Bomba de Aceite",       crit: "A", tipo: "componente" },
              { cod: "MTR-LUB-FLT", nom: "Filtro de Aceite",      crit: "A", tipo: "componente" },
              { cod: "MTR-LUB-TNK", nom: "Tanque de Aceite",      crit: "A", tipo: "componente" },
              { cod: "MTR-LUB-SEN", nom: "Sensor Presión Aceite", crit: "A", tipo: "instrumento" },
            ],
          },
          {
            cod: "MTR-COOL", nom: "Enfriamiento", crit: "A", tipo: "componente",
            hijos: [
              { cod: "MTR-COOL-RAD", nom: "Radiador / Intercambiador", crit: "A", tipo: "componente" },
              { cod: "MTR-COOL-BAM", nom: "Bomba Agua de Mar",        crit: "A", tipo: "componente" },
              { cod: "MTR-COOL-BAD", nom: "Bomba Agua Dulce",         crit: "A", tipo: "componente" },
              { cod: "MTR-COOL-SEN", nom: "Sensor Temperatura",       crit: "A", tipo: "instrumento" },
            ],
          },
          {
            cod: "MTR-FUEL", nom: "Inyección de Combustible", crit: "A", tipo: "componente",
            hijos: [
              { cod: "MTR-FUEL-FLT", nom: "Filtro Fino Combustible", crit: "A", tipo: "componente" },
              { cod: "MTR-FUEL-INY", nom: "Inyectores",             crit: "A", tipo: "componente" },
              { cod: "MTR-FUEL-BMP", nom: "Bomba de Inyección",     crit: "A", tipo: "componente" },
            ],
          },
        ],
      },
      { cod: "PROP-RED", nom: "Reductora",        crit: "A", tipo: "subsistema" },
      { cod: "PROP-EJE", nom: "Eje y Bocina",     crit: "A", tipo: "subsistema" },
      { cod: "PROP-HEL", nom: "Hélice",           crit: "A", tipo: "subsistema" },
      { cod: "PROP-TIM", nom: "Timón y Gobierno", crit: "A", tipo: "subsistema" },
    ],
  },
  {
    cod: "FUEL", nom: "Combustible de Nave", crit: "A", tipo: "sistema",
    hijos: [
      { cod: "FUEL-TNK", nom: "Tanques de Combustible",     crit: "A", tipo: "subsistema" },
      { cod: "FUEL-BMP", nom: "Bomba de Trasiego",          crit: "A", tipo: "subsistema" },
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

// Cuenta total de nodos de la plantilla (recursivo, soporta cualquier profundidad)
export function contarNodosPlantilla() {
  const contar = (nodos) => (nodos || []).reduce((s, n) => s + 1 + contar(n.hijos), 0);
  return contar(PLANTILLA_PESQUERA);
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
