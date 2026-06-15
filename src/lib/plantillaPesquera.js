// ============================================================
//  Plantilla de jerarquía estándar para nave pesquera
//  Basada en ISO 14224 + SFI (grupos 61-67) + práctica de sala de
//  máquinas marina (CAT / Cummins / MAN / SERTICA) y CMMS marino.
//
//  Formato del campo pm (planes preventivos precargados):
//    [descripcion, intervalo_horas]           → disparador por horas
//    [descripcion, null, unidad_calendario]   → disparador calendario
//      unidad_calendario: "diario"|"semanal"|"mensual"|"trimestral"|"semestral"|"anual"
//
//  Profundidad variable (hasta 6 niveles funcionales):
//    Sistema → Subsistema → Sub-subsistema → Componente
//  Los REPUESTOS (nivel 6 / SKU) NO son nodos de equipos: se
//  crean como inventario_items ligados al componente.
//
//  Estructura de cada nodo:
//    cod    → código estructurado, ruta completa
//    nom    → nombre legible
//    crit   → criticidad A | B | C
//    tipo   → tipo_nodo: sistema | subsistema | componente | instrumento
//    mtbf   → MTBF objetivo en horas (opcional)
//    rep    → repuestos: [ [sku, descripcion, tipo], ... ]
//    pm     → planes PM: [ [desc, horas] | [desc, null, unidad_cal] ]
//    basico → true = esencial (modo Básico); false = solo modo Completo
//    hijos  → array de subnodos (opcional)
// ============================================================

const comp = (cod, nom, { rep = [], pm = [], basico = true, crit = "A", param = null } = {}) =>
  ({ cod, nom, crit, tipo: "componente", rep, pm, basico, ...(param ? { param } : {}) });
const inst = (cod, nom, opts = {}) => ({ ...comp(cod, nom, opts), tipo: "instrumento" });

// ── Umbrales de condición ISO 13374 / ISO 10816 / ISO 4413 ───────────────────
// Cada constante es el valor de equipos.parametros_criticos (JSONB).
// Estructura: { tipo, parametro, unidad, min_alerta?, min_critico?, max_alerta?, max_critico?, norma }
// Valores de referencia para diesel marino; ajustar según motor específico en Ficha técnica.
const PM_ACEITE = [
  { tipo: "presion",     parametro: "Presión de Aceite",     unidad: "bar", min_alerta: 2.0, min_critico: 1.5, norma: "ISO 13374" },
  { tipo: "temperatura", parametro: "Temperatura de Aceite", unidad: "°C",  max_alerta: 105, max_critico: 110, norma: "ISO 13374" },
];
const PM_ACE_SIMPLE = [
  { tipo: "presion", parametro: "Presión de Aceite", unidad: "bar", min_alerta: 2.0, min_critico: 1.5, norma: "ISO 13374" },
];
const PM_REFRIG = [
  { tipo: "temperatura", parametro: "Temperatura Refrigerante", unidad: "°C", max_alerta: 90, max_critico: 95, norma: "ISO 13374" },
];
const PM_EGT = [
  { tipo: "temperatura", parametro: "Temperatura Escape (EGT)", unidad: "°C", max_alerta: 520, max_critico: 550, norma: "ISO 13374" },
];
const PM_BOOST = [
  { tipo: "presion", parametro: "Presión Sobrealimentación", unidad: "bar", min_alerta: 1.2, min_critico: 1.0, max_alerta: 2.2, max_critico: 2.5, norma: "ISO 13374" },
];
const PM_RPM_VIB = [
  { tipo: "velocidad",  parametro: "RPM Motor",             unidad: "rpm",  max_alerta: 2000, max_critico: 2200, norma: "ISO 3046"  },
  { tipo: "vibracion",  parametro: "Vibración Carcasa RMS", unidad: "mm/s", max_alerta: 4.5,  max_critico: 7.1,  norma: "ISO 10816" },
];
const PM_FUEL_P = [
  { tipo: "presion", parametro: "Presión Suministro Combustible", unidad: "bar", min_alerta: 2.0, min_critico: 1.5, norma: "ISO 13374" },
];
const PM_ACE_RED = [
  { tipo: "presion",     parametro: "Presión Aceite Reductora",     unidad: "bar", min_alerta: 4.0, min_critico: 3.0, norma: "ISO 13374" },
  { tipo: "temperatura", parametro: "Temperatura Aceite Reductora", unidad: "°C",  max_alerta: 85,  max_critico: 95,  norma: "ISO 13374" },
];
const PM_VOLTAJE = [
  { tipo: "voltaje",    parametro: "Voltaje Alternador", unidad: "V",  min_alerta: 210, min_critico: 200, max_alerta: 235, max_critico: 245, norma: "IEC 60092" },
  { tipo: "frecuencia", parametro: "Frecuencia",         unidad: "Hz", min_alerta: 49,  min_critico: 48,  max_alerta: 51,  max_critico: 52,  norma: "IEC 60092" },
];
const PM_HID_P = [
  { tipo: "presion", parametro: "Presión Sistema Hidráulico", unidad: "bar", min_alerta: 160, min_critico: 140, max_alerta: 210, max_critico: 230, norma: "ISO 4413" },
];
const PM_HPU_MTR = [
  { tipo: "presion",     parametro: "Presión Aceite Motor HPU", unidad: "bar", min_alerta: 2.0, min_critico: 1.5, norma: "ISO 13374" },
  { tipo: "temperatura", parametro: "Temperatura Motor HPU",    unidad: "°C",  max_alerta: 105, max_critico: 110, norma: "ISO 13374" },
];
const PM_RSW_T = [
  { tipo: "temperatura", parametro: "Temperatura Bodega RSW", unidad: "°C", max_alerta: 2, max_critico: 4, norma: "ISO 5552" },
];
const PM_VIVERO = [
  { tipo: "oxigeno",     parametro: "Oxígeno Disuelto",        unidad: "mg/L", min_alerta: 5.0, min_critico: 3.0, norma: "FAO" },
  { tipo: "temperatura", parametro: "Temperatura Agua Vivero", unidad: "°C",   max_alerta: 12,  max_critico: 15,  norma: "FAO" },
];
const PM_VIB = [
  { tipo: "vibracion", parametro: "Vibración Carcasa RMS", unidad: "mm/s", max_alerta: 4.5, max_critico: 7.1, norma: "ISO 10816" },
];

// ============================================================
//  SFI 611 — MOTOR PRINCIPAL
// ============================================================
const MOTOR_PRINCIPAL = {
  cod: "PROP-MTR", nom: "Motor Principal", crit: "A", tipo: "subsistema", mtbf: 12000,
  hijos: [
    // ── 1. Bloque y Tren Alternativo ──
    {
      cod: "PROP-MTR-BLK", nom: "Bloque y Tren Alternativo", crit: "A", tipo: "subsistema",
      hijos: [
        comp("PROP-MTR-BLK-BLK", "Bloque Motor (Monoblock)", { basico: false, rep: [
          ["BLK-3406-CAT", "Bloque CAT 3406 (OEM)", "oem"],
          ["JD-BLK-001", "Kit de Juntas de Bloque", "generico"],
        ] }),
        comp("PROP-MTR-BLK-CAM", "Camisas de Cilindro", { basico: false, rep: [
          ["CAM-3406-CAT", "Camisa CAT 3406 (OEM)", "oem"],
          ["CAM-3406-ALT", "Camisa Alternativa", "alternativo"],
          ["ORI-CAM-001", "O-Rings de Camisa (kit)", "generico"],
        ] }),
        comp("PROP-MTR-BLK-PIS", "Pistones", { basico: false, rep: [
          ["PIS-3406-CAT", "Pistón CAT 3406 (OEM)", "oem"],
          ["PIS-3406-ALT", "Pistón Alternativo (MarinePower)", "alternativo"],
        ],
        // SFI 611 PM-8000H
        pm: [["Overhaul mayor de pistones y anillos", 8000]] }),
        comp("PROP-MTR-BLK-SEG", "Segmentos (Anillos)", { basico: false, rep: [
          ["SEG-3406-CAT", "Segmentos CAT 3406 (kit)", "oem"],
          ["SEG-3406-NSK", "Segmentos NSK (alternativo)", "alternativo"],
        ] }),
        comp("PROP-MTR-BLK-BIE", "Bielas y Cojinetes de Biela", { basico: false, rep: [
          ["BIE-3406-CAT", "Biela CAT 3406 (OEM)", "oem"],
          ["COJ-BIE-CAT", "Cojinetes de Biela (kit)", "oem"],
          ["COJ-BIE-ALT", "Cojinetes de Biela (alternativo)", "alternativo"],
        ] }),
        comp("PROP-MTR-BLK-CIG", "Cigüeñal", { basico: false, rep: [
          ["CIG-3406-CAT", "Cigüeñal CAT 3406 (OEM)", "oem"],
        ] }),
        comp("PROP-MTR-BLK-BAN", "Cojinetes de Bancada", { basico: false, rep: [
          ["COJ-BAN-CAT", "Cojinetes de Bancada CAT (kit OEM)", "oem"],
          ["COJ-BAN-ALT", "Cojinetes de Bancada (alternativo)", "alternativo"],
        ] }),
        comp("PROP-MTR-BLK-VOL", "Volante (Flywheel)", { basico: false, rep: [
          ["VOL-3406-CAT", "Volante CAT (OEM)", "oem"],
          ["COR-DENT-CAT", "Corona Dentada (ring gear)", "generico"],
        ] }),
        comp("PROP-MTR-BLK-DMP", "Amortiguador Torsional (Damper)", { basico: false,
          rep: [["DMP-3406-CAT", "Damper CAT 3406 (OEM)", "oem"]],
          pm: [["Inspección visual / por condición", 6000]] }),
      ],
    },
    // ── 2. Culata y Distribución ──
    {
      cod: "PROP-MTR-CUL", nom: "Culata y Distribución", crit: "A", tipo: "subsistema",
      hijos: [
        comp("PROP-MTR-CUL-CUL", "Culata (conjunto)", { basico: false, rep: [
          ["CUL-3406-CAT", "Culata CAT 3406 (OEM)", "oem"],
          ["JD-CUL-3406", "Junta de Culata (OEM)", "oem"],
          ["JD-CUL-ALT", "Junta de Culata (alternativo)", "alternativo"],
        ] }),
        comp("PROP-MTR-CUL-VLV", "Tren de Válvulas (adm./escape, guías, muelles)", {
          rep: [
            ["VIN-3406-CAT", "Válvula Admisión CAT (OEM)", "oem"],
            ["VES-3406-CAT", "Válvula Escape CAT (OEM)", "oem"],
            ["KIT-VLV-3406", "Kit Guías y Muelles", "generico"],
          ],
          // SFI 611 PM-1000H + PM-2000H
          pm: [
            ["Revisión y calce de válvulas", 1000],
            ["Medición de compresión de cilindros", 2000],
            ["Boroscopía de cilindros", 2000],
          ] }),
        comp("PROP-MTR-CUL-BAL", "Balancines y Empujadores", { basico: false, rep: [
          ["BAL-3406-CAT", "Balancines CAT (kit OEM)", "oem"],
        ] }),
        comp("PROP-MTR-CUL-LEV", "Árbol de Levas", { basico: false, rep: [
          ["LEV-3406-CAT", "Árbol de Levas CAT (OEM)", "oem"],
        ],
        // SFI 611 PM-2000H
        pm: [["Inspección de árbol de levas", 2000]] }),
        comp("PROP-MTR-CUL-DIS", "Distribución (engranajes / correa, tensor)", {
          rep: [
            ["COR-DIST-CAT", "Correa/Engranaje Distribución (OEM)", "oem"],
            ["TEN-DIST-CAT", "Tensor de Distribución", "alternativo"],
          ],
          pm: [["Revisión de correas y tensores", 1000]] }),
      ],
    },
    // ── 3. Lubricación ──
    {
      cod: "PROP-MTR-LUB", nom: "Sistema de Lubricación", crit: "A", tipo: "subsistema",
      hijos: [
        comp("PROP-MTR-LUB-BMP", "Bomba de Aceite", { basico: false, rep: [
          ["BMP-ACE-CAT", "Bomba Aceite CAT (OEM)", "oem"],
          ["BMP-ACE-SKF", "Bomba Aceite SKF (alternativo)", "alternativo"],
        ] }),
        comp("PROP-MTR-LUB-CAR", "Cárter (Sump)", { basico: false, rep: [
          ["CAR-3406-CAT", "Cárter CAT (OEM)", "oem"],
          ["JD-CAR-001", "Junta de Cárter (kit)", "generico"],
        ] }),
        comp("PROP-MTR-LUB-FLT", "Filtro de Aceite", {
          rep: [
            ["FLT-ACE-CAT", "Filtro Aceite CAT (OEM)", "oem"],
            ["FLT-ACE-DON", "Filtro Aceite Donaldson", "alternativo"],
            ["FLT-ACE-GEN", "Filtro Aceite Genérico Certificado", "generico"],
          ],
          // SFI 611 PM-250H
          pm: [
            ["Cambio de aceite de motor", 250],
            ["Cambio de filtro de aceite", 250],
            ["Análisis de aceite (muestra a laboratorio)", 1000],
          ] }),
        comp("PROP-MTR-LUB-ENF", "Enfriador de Aceite", { basico: false,
          rep: [
            ["ENF-ACE-CAT", "Enfriador Aceite CAT (OEM)", "oem"],
            ["ENF-ACE-ALT", "Enfriador Aceite Alternativo", "alternativo"],
          ],
          pm: [["Limpieza de radiador / intercambiador de calor", 4000]] }),
        comp("PROP-MTR-LUB-VAL", "Válvula Reguladora / Seguridad", { basico: false, rep: [
          ["VAL-ACE-CAT", "Válvula Aceite CAT (OEM)", "oem"],
        ] }),
        comp("PROP-MTR-LUB-BRE", "Respiradero del Cárter (Breather)", {
          rep: [
            ["BRE-CAT", "Respiradero CAT (OEM)", "oem"],
            ["BRE-GEN", "Respiradero Genérico", "generico"],
          ],
          // SFI 611 PM-250H limpieza respiradero
          pm: [
            ["Limpieza de compresor del turboalimentador", 250],
            ["Inspección visual / por condición", 1000],
          ] }),
        inst("PROP-MTR-LUB-SEN", "Sensor de Presión / Temperatura Aceite", {
          param: PM_ACEITE,
          rep: [
            ["SEN-PRE-CAT", "Sensor Presión Aceite CAT (OEM)", "oem"],
            ["SEN-TEM-CAT", "Sensor Temperatura Aceite CAT (OEM)", "oem"],
          ],
          pm: [["Calibración de sensores / instrumentos", 4000]] }),
      ],
    },
    // ── 4. Refrigeración – Agua Dulce (SFI 632) ──
    {
      cod: "PROP-MTR-FW", nom: "Refrigeración – Agua Dulce", crit: "A", tipo: "subsistema",
      hijos: [
        comp("PROP-MTR-FW-BMP", "Bomba de Agua Dulce", {
          rep: [
            ["BMP-AD-CAT", "Bomba Agua Dulce CAT (OEM)", "oem"],
            ["BMP-AD-SKF", "Bomba Agua Dulce SKF (alternativo)", "alternativo"],
            ["BRG-6312-ZZ", "Rodamiento 6312-ZZ", "generico"],
          ],
          // SFI 632 PM-1000H limpieza circuito
          pm: [
            ["Limpieza de circuito de agua dulce", 1000],
            ["Engrase / lubricación general", 2000],
          ] }),
        comp("PROP-MTR-FW-TER", "Termostato", {
          rep: [
            ["TER-CAT", "Termostato CAT (OEM)", "oem"],
            ["TER-GEN", "Termostato Genérico", "generico"],
          ],
          pm: [["Inspección visual / por condición", 2000]] }),
        comp("PROP-MTR-FW-INT", "Intercambiador de Calor A.D.", { basico: false,
          rep: [
            ["INT-CAL-CAT", "Intercambiador CAT (OEM)", "oem"],
            ["INT-CAL-ALT", "Intercambiador Alternativo", "alternativo"],
            ["KIT-JD-INT", "Kit Juntas Intercambiador", "generico"],
          ],
          // SFI 632: Semanal glicol + mensual muestreo + 4000H cambio
          pm: [
            ["Verificar concentración de refrigerante (glicol)", null, "semanal"],
            ["Muestreo de refrigerante / análisis de laboratorio", null, "mensual"],
            ["Limpieza de radiador / intercambiador de calor", 1000],
            ["Cambio de refrigerante de agua dulce", 4000],
          ] }),
        comp("PROP-MTR-FW-EXP", "Tanque de Expansión", { basico: false, rep: [
          ["TAP-EXP-CAT", "Tapa Tanque Expansión (OEM)", "oem"],
          ["JD-EXP-001", "Junta Tanque Expansión", "generico"],
        ] }),
        comp("PROP-MTR-FW-MNG", "Mangueras y Abrazaderas A.D.", {
          rep: [
            ["MNG-AD-CAT", "Manguera Agua Dulce CAT (OEM)", "oem"],
            ["MNG-AD-GEN", "Manguera Agua Dulce Genérica", "generico"],
          ],
          pm: [["Inspección visual / por condición", 2000]] }),
        inst("PROP-MTR-FW-SEN", "Sensor de Temperatura A.D.", { param: PM_REFRIG, rep: [
          ["SEN-TEM-CAT", "Sensor Temperatura CAT (OEM)", "oem"],
          ["SEN-TEM-ALT", "Sensor Temperatura Alternativo", "alternativo"],
        ] }),
      ],
    },
    // ── 5. Refrigeración – Agua de Mar (SFI 631) ──
    {
      cod: "PROP-MTR-SW", nom: "Refrigeración – Agua de Mar", crit: "A", tipo: "subsistema",
      hijos: [
        comp("PROP-MTR-SW-TOM", "Toma de Mar (Sea Chest) y Válvula", { basico: false, rep: [
          ["VAL-TOM-OEM", "Válvula Toma de Mar (OEM)", "oem"],
          ["JD-TOM-001", "Junta Toma de Mar (kit)", "generico"],
        ] }),
        comp("PROP-MTR-SW-FIL", "Filtro / Strainer de Agua de Mar", {
          rep: [
            ["STR-AM-OEM", "Canasto Filtro Agua Mar (OEM)", "oem"],
            ["JD-STR-001", "Junta Filtro Agua Mar", "generico"],
          ],
          // SFI 631 Semanal limpieza strainer
          pm: [
            ["Inspección visual / por condición", null, "semanal"],
            ["Inspección visual / por condición", 250],
          ] }),
        comp("PROP-MTR-SW-BMP", "Bomba de Agua de Mar (Impeller)", {
          rep: [
            ["IMP-AM-OEM", "Impeller Bomba Agua Mar (OEM)", "oem"],
            ["IMP-AM-ALT", "Impeller Alternativo", "alternativo"],
            ["KIT-SEL-AM", "Kit Sellos/Junta Bomba Agua Mar", "generico"],
          ],
          // SFI 631: PM-500H cambio impulsor (Korelfox 500H vs anterior 1000H)
          pm: [
            ["Revisión de bomba de agua de mar (impeller)", 500],
            ["Limpieza de radiador / intercambiador de calor", 1000],
            ["Desincrustación química de intercambiadores", 2000],
            ["Overhaul de bomba de agua de mar", 4000],
          ] }),
        comp("PROP-MTR-SW-ANO", "Ánodos de Zinc del Motor", {
          rep: [
            ["ANO-ZN-OEM", "Ánodo de Zinc Motor (OEM)", "oem"],
            ["ANO-ZN-GEN", "Ánodo de Zinc Genérico", "generico"],
          ],
          pm: [["Inspección de ánodos de sacrificio", 1000]] }),
        comp("PROP-MTR-SW-MNG", "Mangueras y Líneas de Agua de Mar", {
          rep: [
            ["MNG-AM-OEM", "Manguera Agua Mar (OEM)", "oem"],
            ["MNG-AM-GEN", "Manguera Agua Mar Genérica", "generico"],
          ],
          pm: [["Inspección visual / por condición", 2000]] }),
      ],
    },
    // ── 6. Combustible (SFI 613) ──
    {
      cod: "PROP-MTR-FUEL", nom: "Sistema de Combustible", crit: "A", tipo: "subsistema",
      hijos: [
        comp("PROP-MTR-FUEL-BMP", "Bomba de Alimentación", { basico: false, rep: [
          ["BMP-COMB-CAT", "Bomba Alimentación CAT (OEM)", "oem"],
          ["BMP-COMB-ALT", "Bomba Alimentación Alternativa", "alternativo"],
        ] }),
        comp("PROP-MTR-FUEL-INJ", "Bomba de Inyección / Common Rail", { basico: false,
          rep: [["BINJ-3406-CAT", "Bomba Inyección CAT (OEM)", "oem"]],
          pm: [["Revisión de bomba de inyección", 4000]] }),
        comp("PROP-MTR-FUEL-INY", "Inyectores", {
          rep: [
            ["INY-3406-CAT", "Inyectores CAT 3406 (kit)", "oem"],
            ["INY-3406-ALT", "Inyectores Alternativos (kit)", "alternativo"],
          ],
          // SFI 613: PM-1000H prueba retorno + PM-4000H banco pruebas
          pm: [
            ["Prueba de retorno de inyectores", 1000],
            ["Banco de pruebas de inyectores", 4000],
          ] }),
        comp("PROP-MTR-FUEL-FT1", "Filtro Primario (separador Racor)", {
          rep: [
            ["FT1-RAC-OEM", "Elemento Racor Primario (OEM)", "oem"],
            ["FT1-RAC-DON", "Elemento Racor Donaldson", "alternativo"],
            ["FT1-RAC-GEN", "Elemento Racor Genérico", "generico"],
          ],
          // SFI 613: drenaje diario + cambio 500H
          pm: [
            ["Verificar fugas (combustible, aceite, refrigerante)", null, "diario"],
            ["Cambio de filtros de combustible", 500],
          ] }),
        comp("PROP-MTR-FUEL-FT2", "Filtro Secundario (fino)", {
          rep: [
            ["FT2-CAT", "Filtro Fino CAT (OEM)", "oem"],
            ["FT2-DON", "Filtro Fino Donaldson", "alternativo"],
            ["FT2-GEN", "Filtro Fino Genérico", "generico"],
          ],
          pm: [
            ["Cambio de filtros de combustible", 500],
            ["Limpieza de tanque diario de combustible", 2000],
          ] }),
        comp("PROP-MTR-FUEL-MNG", "Cañerías y Mangueras de Combustible", { basico: false, rep: [
          ["MNG-COMB-CAT", "Manguera Combustible CAT (OEM)", "oem"],
          ["MNG-COMB-ALT", "Manguera Combustible Alternativa", "alternativo"],
        ],
        pm: [["Inspección de líneas y mangueras de combustible", null, "semanal"]] }),
        inst("PROP-MTR-FUEL-SEN", "Sensor de Presión de Combustible", { param: PM_FUEL_P, rep: [
          ["SEN-PRE-COMB-CAT", "Sensor Presión Combustible CAT (OEM)", "oem"],
          ["SEN-PRE-COMB-ALT", "Sensor Presión Combustible Alternativo", "alternativo"],
        ] }),
      ],
    },
    // ── 7. Admisión y Sobrealimentación (SFI 612 Turbo) ──
    {
      cod: "PROP-MTR-AIR", nom: "Admisión y Sobrealimentación", crit: "A", tipo: "subsistema",
      hijos: [
        comp("PROP-MTR-AIR-FIL", "Filtro de Aire", {
          rep: [
            ["FIL-AIRE-CAT", "Filtro Aire CAT (OEM)", "oem"],
            ["FIL-AIRE-GEN", "Filtro Aire Genérico", "generico"],
          ],
          pm: [["Cambio de filtro de aire", 500]] }),
        comp("PROP-MTR-AIR-TUR", "Turbocompresor", { basico: false,
          rep: [
            ["TUR-3406-CAT", "Turbocompresor CAT 3406 (OEM)", "oem"],
            ["TUR-3406-ALT", "Cartucho Turbo Alternativo", "alternativo"],
            ["KIT-SEL-TUR", "Kit Sellos Turbo", "generico"],
          ],
          // SFI 612: PM-250H hasta PM-8000H (Korelfox completo)
          pm: [
            ["Limpieza de compresor del turboalimentador", 250],
            ["Medición de holguras axiales del turbo", 1000],
            ["Inspección de cojinetes del turboalimentador", 2000],
            ["Balanceo dinámico del turboalimentador", 4000],
            ["Overhaul completo de turboalimentador", 8000],
          ] }),
        comp("PROP-MTR-AIR-ACC", "Enfriador de Aire de Carga (Aftercooler)", { basico: false,
          rep: [
            ["ACC-3406-CAT", "Aftercooler CAT (OEM)", "oem"],
            ["KIT-ORI-ACC", "Kit O-Rings Aftercooler", "generico"],
          ],
          // SFI 611 PM-500H limpieza intercooler (Korelfox: 500H vs anterior 3000H)
          pm: [["Limpieza de radiador / intercambiador de calor", 500]] }),
        comp("PROP-MTR-AIR-MAN", "Múltiple de Admisión", { basico: false, rep: [
          ["JD-MAN-ADM", "Junta Múltiple Admisión (kit)", "generico"],
        ] }),
        inst("PROP-MTR-AIR-SEN", "Sensor de Presión de Sobrealimentación (Boost)", { param: PM_BOOST, rep: [
          ["SEN-BOOST-CAT", "Sensor Boost CAT (OEM)", "oem"],
          ["SEN-BOOST-ALT", "Sensor Boost Alternativo", "alternativo"],
        ] }),
      ],
    },
    // ── 8. Escape ──
    {
      cod: "PROP-MTR-EXH", nom: "Sistema de Escape", crit: "A", tipo: "subsistema",
      hijos: [
        comp("PROP-MTR-EXH-MAN", "Múltiple de Escape", { basico: false, rep: [
          ["MAN-ESC-CAT", "Múltiple Escape CAT (OEM)", "oem"],
          ["JD-MAN-ESC", "Junta Múltiple Escape (kit)", "generico"],
        ] }),
        comp("PROP-MTR-EXH-COD", "Codo de Escape Húmedo (Wet Elbow)", {
          rep: [
            ["COD-ESC-OEM", "Codo Escape Húmedo (OEM)", "oem"],
            ["COD-ESC-ALT", "Codo Escape Húmedo Alternativo", "alternativo"],
            ["JD-COD-001", "Junta Codo de Escape", "generico"],
          ],
          // SFI 611 semanal inspección escape
          pm: [
            ["Inspección de sistema de escape", null, "semanal"],
            ["Inspección visual / por condición", 1000],
          ] }),
        comp("PROP-MTR-EXH-FUE", "Fuelle / Junta de Expansión", { basico: false, rep: [
          ["FUE-ESC-OEM", "Fuelle de Escape (OEM)", "oem"],
        ] }),
        comp("PROP-MTR-EXH-SIL", "Silenciador", { basico: false, rep: [
          ["SIL-ESC-OEM", "Silenciador (OEM)", "oem"],
        ] }),
        inst("PROP-MTR-EXH-EGT", "Sensor de Temperatura de Gases (EGT)", {
          param: PM_EGT,
          rep: [
            ["EGT-CAT", "Sensor EGT CAT (OEM)", "oem"],
            ["EGT-ALT", "Sensor EGT Alternativo", "alternativo"],
          ],
          pm: [["Calibración de sensores / instrumentos", 4000]] }),
      ],
    },
    // ── 9. Arranque ──
    {
      cod: "PROP-MTR-START", nom: "Sistema de Arranque", crit: "A", tipo: "subsistema",
      hijos: [
        comp("PROP-MTR-START-MTR", "Motor de Arranque", { basico: false, rep: [
          ["MTR-START-CAT", "Motor Arranque CAT (OEM)", "oem"],
          ["MTR-START-ALT", "Motor Arranque Alternativo", "alternativo"],
          ["ESC-START-GEN", "Escobillas/Carbones (kit)", "generico"],
        ] }),
        comp("PROP-MTR-START-SOL", "Solenoide / Relé de Arranque", {
          rep: [
            ["SOL-START-CAT", "Solenoide CAT (OEM)", "oem"],
            ["SOL-START-ALT", "Solenoide Alternativo", "alternativo"],
          ] }),
        comp("PROP-MTR-START-BAT", "Baterías de Arranque", {
          rep: [
            ["BAT-12V-100AH-CAT", "Batería 12V 100Ah (OEM)", "oem"],
            ["BAT-12V-100AH-MAT", "Batería 12V 100Ah Matin", "alternativo"],
            ["BAT-12V-100AH-GEN", "Batería 12V 100Ah Genérica", "generico"],
          ],
          pm: [["Revisión de banco de baterías", 500]] }),
        comp("PROP-MTR-START-CHR", "Cargador / Alternador de Carga", { basico: false, rep: [
          ["CHR-CAT", "Cargador/Alternador CAT (OEM)", "oem"],
          ["CHR-ALT", "Cargador/Alternador Alternativo", "alternativo"],
        ] }),
        comp("PROP-MTR-START-CAB", "Cables y Bornes de Arranque", {
          rep: [
            ["CAB-50-CAT", "Cable 50mm CAT (OEM)", "oem"],
            ["CAB-50-GEN", "Cable 50mm Genérico", "generico"],
          ],
          pm: [["Inspección visual / por condición", 1000]] }),
      ],
    },
    // ── 10. Control, Monitoreo y Seguridad (ronda diaria/semanal) ──
    {
      cod: "PROP-MTR-CTRL", nom: "Control, Monitoreo y Seguridad", crit: "A", tipo: "subsistema",
      hijos: [
        comp("PROP-MTR-CTRL-ECU", "Controlador (ECU / Governor)", { basico: false, rep: [
          ["ECU-3406-CAT", "ECU CAT 3406 (OEM)", "oem"],
          ["ECU-3406-ALT", "ECU Alternativa", "alternativo"],
        ] }),
        comp("PROP-MTR-CTRL-PNL", "Panel / Tacómetro", { basico: false, rep: [
          ["PNL-CAT", "Panel CAT (OEM)", "oem"],
          ["PNL-ALT", "Panel Alternativo", "alternativo"],
        ] }),
        inst("PROP-MTR-CTRL-RPM", "Sensor de RPM", { param: PM_RPM_VIB, rep: [
          ["RPM-CAT", "Sensor RPM CAT (OEM)", "oem"],
          ["RPM-ALT", "Sensor RPM Alternativo", "alternativo"],
        ] }),
        comp("PROP-MTR-CTRL-SAF", "Paradas de Seguridad (sobrevel. / baja presión)", {
          rep: [["KIT-SAF-CAT", "Kit Paradas de Seguridad (OEM)", "oem"]],
          // SFI 611 PM-D-001 (diario) + PM-S-001 (semanal) + PM-1000H
          pm: [
            ["Verificar presión y temperatura de operación (ronda)", null, "diario"],
            ["Verificar nivel de aceite en cárter", null, "diario"],
            ["Verificar fugas (combustible, aceite, refrigerante)", null, "diario"],
            ["Inspección visual de soportes y montajes", null, "semanal"],
            ["Inspección de aislación térmica", null, "semanal"],
            ["Prueba de alarmas y paradas de seguridad", 1000],
          ] }),
        comp("PROP-MTR-CTRL-CAB", "Cableado / Arnés Electrónico", { basico: false, rep: [
          ["CAB-ELEC-CAT", "Arnés CAT (OEM)", "oem"],
          ["CAB-ELEC-ALT", "Arnés Alternativo", "alternativo"],
          ["CAB-ELEC-GEN", "Cableado Genérico", "generico"],
        ] }),
      ],
    },
  ],
};

// ============================================================
//  SFI 621 — MOTOR GENERADOR
// ============================================================
const MOTOR_GENERADOR = {
  cod: "GEN-MTR", nom: "Motor Generador", crit: "A", tipo: "subsistema", mtbf: 18000,
  hijos: [
    {
      cod: "GEN-MTR-BLK", nom: "Bloque y Tren Alternativo", crit: "A", tipo: "subsistema",
      hijos: [
        comp("GEN-MTR-BLK-PIS", "Pistones y Segmentos", { basico: false, rep: [
          ["PIS-GEN-OEM", "Pistón Generador (OEM)", "oem"],
          ["SEG-GEN-OEM", "Segmentos Generador (kit)", "oem"],
        ] }),
        comp("GEN-MTR-BLK-CAM", "Camisas de Cilindro", { basico: false, rep: [
          ["CAM-GEN-OEM", "Camisa Generador (OEM)", "oem"],
          ["ORI-CAM-001", "O-Rings de Camisa (kit)", "generico"],
        ] }),
        comp("GEN-MTR-BLK-BIE", "Bielas y Cojinetes", { basico: false, rep: [
          ["COJ-BIE-GEN", "Cojinetes de Biela Generador (kit)", "oem"],
        ] }),
        comp("GEN-MTR-BLK-CIG", "Cigüeñal y Cojinetes de Bancada", { basico: false, rep: [
          ["CIG-GEN-OEM", "Cigüeñal Generador (OEM)", "oem"],
          ["COJ-BAN-GEN", "Cojinetes de Bancada (kit)", "oem"],
        ] }),
      ],
    },
    {
      cod: "GEN-MTR-CUL", nom: "Culata y Válvulas", crit: "A", tipo: "subsistema",
      hijos: [
        comp("GEN-MTR-CUL-CUL", "Culata (conjunto)", { basico: false, rep: [
          ["CUL-GEN-OEM", "Culata Generador (OEM)", "oem"],
          ["JD-CUL-GEN", "Junta de Culata Generador", "oem"],
        ] }),
        comp("GEN-MTR-CUL-VLV", "Tren de Válvulas", {
          rep: [["KIT-VLV-GEN", "Kit Válvulas/Guías/Muelles", "generico"]],
          // SFI 621 PM-1000H (Korelfox: 1000H vs anterior 3000H)
          pm: [["Revisión y calce de válvulas", 1000]] }),
      ],
    },
    {
      cod: "GEN-MTR-LUB", nom: "Sistema de Lubricación", crit: "A", tipo: "subsistema",
      hijos: [
        comp("GEN-MTR-LUB-BMP", "Bomba de Aceite", { basico: false, rep: [
          ["BMP-GEN-CAT", "Bomba Aceite Generador (OEM)", "oem"],
        ] }),
        comp("GEN-MTR-LUB-FLT", "Filtro de Aceite", {
          rep: [
            ["FLT-GEN-CAT", "Filtro Aceite Generador (OEM)", "oem"],
            ["FLT-GEN-DON", "Filtro Aceite Donaldson", "alternativo"],
            ["FLT-GEN-GEN", "Filtro Aceite Genérico", "generico"],
          ],
          // SFI 621 PM-250H
          pm: [
            ["Cambio de aceite de motor", 250],
            ["Cambio de filtro de aceite", 250],
          ] }),
        comp("GEN-MTR-LUB-ENF", "Enfriador de Aceite", { basico: false,
          rep: [["ENF-GEN-OEM", "Enfriador Aceite Generador (OEM)", "oem"]],
          pm: [["Limpieza de radiador / intercambiador de calor", 4000]] }),
        inst("GEN-MTR-LUB-SEN", "Sensor de Presión de Aceite", { param: PM_ACE_SIMPLE, rep: [
          ["SEN-PRE-CAT", "Sensor Presión CAT (OEM)", "oem"],
          ["SEN-PRE-ALT", "Sensor Presión Alternativo", "alternativo"],
        ] }),
      ],
    },
    {
      cod: "GEN-MTR-FW", nom: "Refrigeración – Agua Dulce", crit: "A", tipo: "subsistema",
      hijos: [
        comp("GEN-MTR-FW-BMP", "Bomba de Agua Dulce", {
          rep: [["BMP-AD-GEN", "Bomba Agua Dulce Generador (OEM)", "oem"]],
          pm: [["Engrase / lubricación general", 2000]] }),
        comp("GEN-MTR-FW-TER", "Termostato", {
          rep: [["TER-GEN-OEM", "Termostato Generador (OEM)", "oem"]],
          pm: [["Inspección visual / por condición", 2000]] }),
        comp("GEN-MTR-FW-INT", "Intercambiador de Calor", { basico: false,
          rep: [["INT-GEN-OEM", "Intercambiador Generador (OEM)", "oem"], ["KIT-JD-INT", "Kit Juntas Intercambiador", "generico"]],
          pm: [["Limpieza de radiador / intercambiador de calor", 4000]] }),
        inst("GEN-MTR-FW-SEN", "Sensor de Temperatura A.D.", { param: PM_REFRIG, rep: [
          ["SEN-TEM-CAT", "Sensor Temperatura CAT (OEM)", "oem"],
        ] }),
      ],
    },
    {
      cod: "GEN-MTR-SW", nom: "Refrigeración – Agua de Mar", crit: "A", tipo: "subsistema",
      hijos: [
        comp("GEN-MTR-SW-FIL", "Filtro / Strainer de Agua de Mar", {
          rep: [["STR-AM-GEN", "Canasto Filtro Agua Mar Generador", "generico"]],
          pm: [["Inspección visual / por condición", 250]] }),
        comp("GEN-MTR-SW-BMP", "Bomba de Agua de Mar (Impeller)", {
          rep: [
            ["IMP-AM-GEN-OEM", "Impeller Bomba Agua Mar Generador (OEM)", "oem"],
            ["IMP-AM-GEN-ALT", "Impeller Alternativo", "alternativo"],
          ],
          pm: [["Revisión de bomba de agua de mar (impeller)", 500]] }),
        comp("GEN-MTR-SW-ANO", "Ánodos de Zinc", {
          rep: [["ANO-ZN-GEN", "Ánodo de Zinc Genérico", "generico"]],
          pm: [["Inspección de ánodos de sacrificio", 1000]] }),
      ],
    },
    {
      cod: "GEN-MTR-FUEL", nom: "Sistema de Combustible", crit: "A", tipo: "subsistema",
      hijos: [
        comp("GEN-MTR-FUEL-INY", "Inyectores", {
          rep: [
            ["INY-GEN-CAT", "Inyectores Generador (OEM)", "oem"],
            ["INY-GEN-ALT", "Inyectores Generador Alternativos", "alternativo"],
          ],
          pm: [["Revisión / calibración de inyectores", 4000]] }),
        comp("GEN-MTR-FUEL-FLT", "Filtro de Combustible (separador Racor)", {
          rep: [
            ["FLT-COMB-GEN-CAT", "Filtro Combustible Generador (OEM)", "oem"],
            ["FLT-COMB-GEN-DON", "Filtro Combustible Donaldson", "alternativo"],
            ["FLT-COMB-GEN-GEN", "Filtro Combustible Genérico", "generico"],
          ],
          pm: [["Cambio de filtros de combustible", 500]] }),
        comp("GEN-MTR-FUEL-BMP", "Bomba de Combustible", { basico: false, rep: [
          ["BMP-COMB-GEN-OEM", "Bomba Combustible Generador (OEM)", "oem"],
        ] }),
      ],
    },
    {
      cod: "GEN-MTR-AEX", nom: "Admisión y Escape", crit: "A", tipo: "subsistema",
      hijos: [
        comp("GEN-MTR-AEX-FIL", "Filtro de Aire", {
          rep: [["FIL-AIRE-GEN-OEM", "Filtro Aire Generador (OEM)", "oem"], ["FIL-AIRE-GEN", "Filtro Aire Genérico", "generico"]],
          pm: [["Cambio de filtro de aire", 500]] }),
        comp("GEN-MTR-AEX-TUR", "Turbocompresor", { basico: false,
          rep: [["TUR-GEN-OEM", "Turbo Generador (OEM)", "oem"], ["KIT-SEL-TUR", "Kit Sellos Turbo", "generico"]],
          pm: [["Inspección de turbocompresor", 4000]] }),
        comp("GEN-MTR-AEX-COD", "Codo de Escape Húmedo (Wet Elbow)", {
          rep: [["COD-ESC-GEN-OEM", "Codo Escape Húmedo Generador (OEM)", "oem"]],
          pm: [["Inspección visual / por condición", 1000]] }),
      ],
    },
    // ── SFI 621: Alternador con termografía / overhaul ──
    {
      cod: "GEN-MTR-ALT", nom: "Alternador", crit: "A", tipo: "subsistema",
      hijos: [
        comp("GEN-MTR-ALT-ALT", "Alternador Principal", { basico: false, rep: [
          ["ALT-220V-CAT", "Alternador 220V (OEM)", "oem"],
          ["ALT-220V-SKF", "Alternador 220V SKF (alternativo)", "alternativo"],
        ],
        // SFI 621 PM-2000H termografía + PM-4000H devanados + PM-8000H overhaul
        pm: [
          ["Termografía de alternador / generador", 2000],
          ["Inspección de aislamiento de devanados", 4000],
          ["Overhaul completo de generador", 8000],
        ] }),
        comp("GEN-MTR-ALT-BRG", "Rodamiento Alternador", {
          rep: [
            ["BRG-6312-ZZ-FAG", "Rodamiento 6312-ZZ FAG (OEM)", "oem"],
            ["BRG-6312-ZZ-SKF", "Rodamiento 6312-ZZ SKF (alternativo)", "alternativo"],
          ],
          pm: [["Engrase / lubricación general", 2000]] }),
        comp("GEN-MTR-ALT-REG", "Regulador de Voltaje (AVR)", {
          rep: [
            ["REG-220V-CAT", "AVR 220V (OEM)", "oem"],
            ["REG-220V-ALT", "AVR 220V Alternativo", "alternativo"],
          ],
          // SFI 621 semanal prueba AVR
          pm: [["Prueba de alarmas y paradas de seguridad", null, "semanal"]] }),
        inst("GEN-MTR-ALT-VOL", "Sensor de Voltaje / Frecuencia", {
          param: PM_VOLTAJE,
          rep: [
            ["VOL-CAT", "Sensor Voltaje (OEM)", "oem"],
            ["FRE-CAT", "Sensor Frecuencia (OEM)", "oem"],
          ],
          pm: [["Calibración de sensores / instrumentos", 4000]] }),
      ],
    },
    {
      cod: "GEN-MTR-START", nom: "Sistema de Arranque", crit: "A", tipo: "subsistema",
      hijos: [
        comp("GEN-MTR-START-MTR", "Motor de Arranque", { basico: false, rep: [
          ["MTR-START-CAT", "Motor Arranque (OEM)", "oem"],
          ["MTR-START-ALT", "Motor Arranque Alternativo", "alternativo"],
        ] }),
        comp("GEN-MTR-START-BAT", "Baterías", {
          rep: [
            ["BAT-12V-100AH-CAT", "Batería 12V 100Ah (OEM)", "oem"],
            ["BAT-12V-100AH-GEN", "Batería 12V 100Ah Genérica", "generico"],
          ],
          pm: [["Revisión de banco de baterías", 500]] }),
      ],
    },
    {
      cod: "GEN-MTR-CTRL", nom: "Control y Seguridad", crit: "A", tipo: "subsistema",
      hijos: [
        comp("GEN-MTR-CTRL-ECU", "Controlador / Panel", { basico: false, rep: [
          ["ECU-GEN-CAT", "ECU/Panel Generador (OEM)", "oem"],
          ["ECU-GEN-ALT", "ECU/Panel Alternativo", "alternativo"],
        ] }),
        comp("GEN-MTR-CTRL-SAF", "Paradas de Seguridad", {
          rep: [["KIT-SAF-GEN", "Kit Paradas de Seguridad Generador (OEM)", "oem"]],
          // SFI 621 diario + semanal + 1000H
          pm: [
            ["Verificar presión y temperatura de operación (ronda)", null, "diario"],
            ["Prueba de alarmas y paradas de seguridad", 1000],
          ] }),
        comp("GEN-MTR-CTRL-CAB", "Cableado Electrónico", { basico: false, rep: [
          ["CAB-GEN-CAT", "Cableado Generador (OEM)", "oem"],
          ["CAB-GEN-ALT", "Cableado Generador Alternativo", "alternativo"],
        ] }),
      ],
    },
  ],
};

// ============================================================
//  SFI 652 — CENTRAL / GRUPO HIDRÁULICO (HPU / Power Pack)
// ============================================================
const CENTRAL_HIDRAULICA = {
  cod: "HPU", nom: "Central/Grupo Hidráulico", crit: "A", tipo: "sistema",
  hijos: [
    {
      cod: "HPU-MTR", nom: "Motor Diésel (accionador)", crit: "A", tipo: "subsistema", mtbf: 15000,
      hijos: [
        comp("HPU-MTR-ACE", "Aceite y Filtro de Motor", {
          rep: [
            ["FLT-ACE-HPU-OEM", "Filtro de Aceite Motor HPU (OEM)", "oem"],
            ["FLT-ACE-HPU-DON", "Filtro de Aceite Donaldson", "alternativo"],
            ["ACE-15W40-CK4", "Aceite Motor 15W-40 CK-4 (balde)", "generico"],
          ],
          pm: [["Cambio de aceite de motor", 250], ["Análisis de aceite (muestra a laboratorio)", 1000]] }),
        comp("HPU-MTR-FCO", "Filtros de Combustible", {
          rep: [
            ["FLT-COMB-HPU-OEM", "Filtro Combustible HPU (OEM)", "oem"],
            ["FLT-COMB-HPU-DON", "Filtro Combustible Donaldson", "alternativo"],
            ["FLT-SEP-HPU-GEN", "Separador Agua-Combustible (elemento)", "generico"],
          ],
          pm: [["Cambio de filtros de combustible", 500]] }),
        comp("HPU-MTR-INY", "Inyectores", { basico: false,
          rep: [
            ["INY-HPU-OEM", "Inyectores HPU (kit)", "oem"],
            ["INY-HPU-ALT", "Inyectores Alternativos (kit)", "alternativo"],
          ],
          pm: [["Revisión / calibración de inyectores", 4000]] }),
        comp("HPU-MTR-COR", "Correas y Tensores", {
          rep: [
            ["COR-HPU-OEM", "Correa HPU (OEM)", "oem"],
            ["COR-HPU-GEN", "Correa Genérica Equivalente", "generico"],
          ],
          pm: [["Revisión de correas y tensores", 1000]] }),
        comp("HPU-MTR-REF", "Refrigeración (impeller / agua)", {
          rep: [
            ["IMP-HPU-OEM", "Impeller Bomba Agua Mar HPU (OEM)", "oem"],
            ["IMP-HPU-ALT", "Impeller Alternativo", "alternativo"],
            ["ANT-COOL-GEN", "Refrigerante / Anticorrosivo (galón)", "generico"],
          ],
          pm: [["Revisión de bomba de agua de mar (impeller)", 500], ["Limpieza de radiador / intercambiador de calor", 2000]] }),
        inst("HPU-MTR-SEN", "Sensores (presión / temperatura)", {
          param: PM_HPU_MTR,
          rep: [
            ["SEN-PRE-HPU-OEM", "Sensor Presión Aceite HPU (OEM)", "oem"],
            ["SEN-TEM-HPU-OEM", "Sensor Temperatura HPU (OEM)", "oem"],
          ],
          pm: [["Prueba de alarmas y paradas de seguridad", 1000]] }),
      ],
    },
    {
      cod: "HPU-BMB", nom: "Bomba Hidráulica (accionada)", crit: "A", tipo: "subsistema", mtbf: 12000,
      hijos: [
        comp("HPU-BMB-BMB", "Bomba Hidráulica Principal", { basico: false,
          rep: [
            ["BMB-HID-OEM", "Bomba Hidráulica (OEM)", "oem"],
            ["BMB-HID-ALT", "Bomba Hidráulica Alternativa", "alternativo"],
            ["KIT-REP-BMB-HID", "Kit de Reparación de Bomba", "generico"],
          ],
          // SFI 652 PM-2000H muestreo + PM-8000H overhaul
          pm: [
            ["Análisis de aceite (muestra a laboratorio)", 500],
            ["Revisión de mangueras y presión hidráulica", 1000],
            ["Muestreo de aceite hidráulico", 2000],
            ["Overhaul de bombas hidráulicas", 8000],
          ] }),
        comp("HPU-BMB-ACO", "Acoplamiento / Cardán", {
          rep: [
            ["ACO-HPU-OEM", "Acoplamiento Elástico (OEM)", "oem"],
            ["ACO-HPU-GEN", "Inserto/Taco de Acoplamiento", "generico"],
          ],
          pm: [["Engrase / lubricación general", 500]] }),
        comp("HPU-BMB-SEL", "Sello Mecánico", { basico: false,
          rep: [
            ["SEL-BMB-HID-OEM", "Sello Mecánico Bomba (OEM)", "oem"],
            ["SEL-BMB-HID-GEN", "Kit de Sellos (genérico)", "generico"],
          ],
          pm: [["Inspección visual / por condición", 4000]] }),
      ],
    },
    {
      cod: "HPU-TNK", nom: "Estanque / Depósito de Aceite", crit: "B", tipo: "subsistema",
      hijos: [
        comp("HPU-TNK-TNK", "Estanque Hidráulico", {
          rep: [
            ["ACE-HID-ISO46", "Aceite Hidráulico ISO VG 46 (tambor)", "generico"],
            ["JD-TNK-001", "Junta Tapa de Estanque (kit)", "generico"],
          ],
          // SFI 652: diario nivel + 4000H cambio aceite (Korelfox 4000H vs anterior 2000H)
          pm: [
            ["Verificar fugas (combustible, aceite, refrigerante)", null, "diario"],
            ["Cambio de aceite hidráulico", 4000],
          ] }),
        comp("HPU-TNK-RES", "Respiradero / Breather", {
          rep: [
            ["BRE-HPU-OEM", "Respiradero con Filtro (OEM)", "oem"],
            ["BRE-HPU-GEN", "Respiradero Genérico", "generico"],
          ],
          pm: [["Inspección visual / por condición", 1000]] }),
        inst("HPU-TNK-NVL", "Indicador de Nivel / Temperatura", {
          rep: [["NVL-HPU-OEM", "Visor Nivel-Temperatura (OEM)", "oem"]],
          // SFI 652 semanal fugas + mensual filtros
          pm: [
            ["Inspección visual / por condición", null, "semanal"],
            ["Revisión de estado de filtros del compresor RSW", null, "mensual"],
            ["Inspección visual / por condición", 2000],
          ] }),
      ],
    },
    {
      cod: "HPU-VLV", nom: "Válvulas y Manifold", crit: "A", tipo: "subsistema",
      hijos: [
        comp("HPU-VLV-DIR", "Válvula Direccional", {
          rep: [
            ["VLV-DIR-OEM", "Válvula Direccional (OEM)", "oem"],
            ["VLV-DIR-ALT", "Válvula Direccional Alternativa", "alternativo"],
            ["KIT-SEL-VLV", "Kit de Sellos de Válvula", "generico"],
          ],
          pm: [["Inspección visual / por condición", 2000]] }),
        comp("HPU-VLV-ALI", "Válvula de Alivio (presión)", {
          rep: [
            ["VLV-ALI-OEM", "Válvula de Alivio (OEM)", "oem"],
            ["VLV-ALI-ALT", "Válvula de Alivio Alternativa", "alternativo"],
          ],
          pm: [["Revisión de mangueras y presión hidráulica", 1000]] }),
        comp("HPU-VLV-MAN", "Manifold / Bloque de Válvulas", { basico: false,
          rep: [
            ["MAN-HPU-OEM", "Manifold Hidráulico (OEM)", "oem"],
            ["KIT-SEL-MAN", "Kit de Sellos de Manifold", "generico"],
          ],
          pm: [["Inspección visual / por condición", 4000]] }),
      ],
    },
    {
      cod: "HPU-FLT", nom: "Filtros Hidráulicos", crit: "A", tipo: "subsistema",
      hijos: [
        comp("HPU-FLT-PRE", "Filtro de Presión", {
          rep: [
            ["FLT-PRE-HPU-OEM", "Filtro de Presión (OEM)", "oem"],
            ["FLT-PRE-HPU-PAR", "Filtro de Presión Parker", "alternativo"],
            ["FLT-PRE-HPU-GEN", "Filtro de Presión Genérico", "generico"],
          ],
          pm: [["Cambio de filtro hidráulico", 1000]] }),
        comp("HPU-FLT-RET", "Filtro de Retorno", {
          rep: [
            ["FLT-RET-HPU-OEM", "Filtro de Retorno (OEM)", "oem"],
            ["FLT-RET-HPU-PAR", "Filtro de Retorno Parker", "alternativo"],
            ["FLT-RET-HPU-GEN", "Filtro de Retorno Genérico", "generico"],
          ],
          pm: [["Cambio de filtro hidráulico", 1000]] }),
        comp("HPU-FLT-SUC", "Filtro de Succión (strainer)", {
          rep: [
            ["FLT-SUC-HPU-OEM", "Strainer de Succión (OEM)", "oem"],
            ["FLT-SUC-HPU-GEN", "Strainer Genérico", "generico"],
          ],
          pm: [["Limpieza de radiador / intercambiador de calor", 1000]] }),
      ],
    },
    comp("HPU-ENF", "Enfriador de Aceite Hidráulico", { crit: "B", basico: false,
      rep: [
        ["ENF-HPU-OEM", "Enfriador Hidráulico (OEM)", "oem"],
        ["ENF-HPU-ALT", "Enfriador Hidráulico Alternativo", "alternativo"],
      ],
      pm: [["Limpieza de radiador / intercambiador de calor", 1000]] }),
    inst("HPU-SEN-P", "Sensor de Presión Hidráulica", {
      param: PM_HID_P,
      rep: [
        ["SEN-PRE-HID-OEM", "Sensor Presión Hidráulica (OEM)", "oem"],
        ["SEN-PRE-HID-ALT", "Sensor Presión Hidráulica Alternativo", "alternativo"],
      ],
      pm: [["Calibración de sensores / instrumentos", 2000]] }),
  ],
};

// ============================================================
//  PLANTILLA_PESQUERA — árbol completo de la nave
// ============================================================
export const PLANTILLA_PESQUERA = [
  // ── Propulsión Principal (SFI 611-613) ─────────────────────────
  {
    cod: "PROP", nom: "Propulsión Principal", crit: "A", tipo: "sistema",
    hijos: [
      MOTOR_PRINCIPAL,
      {
        cod: "PROP-RED", nom: "Reductora", crit: "A", tipo: "subsistema",
        hijos: [
          comp("PROP-RED-ACE", "Aceite y Filtro de Reductora", {
            rep: [["FLT-RED-OEM", "Filtro Reductora (OEM)", "oem"], ["ACE-RED-GEN", "Aceite Reductora (balde)", "generico"]],
            pm: [["Cambio de aceite de reductora", 1000]] }),
          comp("PROP-RED-CAJ", "Caja Reductora (engranajes)", { basico: false,
            rep: [["RED-OEM", "Reductora completa (OEM)", "oem"], ["KIT-JD-RED", "Kit Juntas Reductora", "generico"]] }),
          comp("PROP-RED-EMB", "Embrague (Clutch)", { basico: false,
            rep: [["KIT-EMB-OEM", "Kit de Embrague (OEM)", "oem"]],
            pm: [["Inspección visual / por condición", 4000]] }),
          comp("PROP-RED-ENF", "Enfriador de Aceite de Reductora", { basico: false,
            rep: [["ENF-RED-OEM", "Enfriador Reductora (OEM)", "oem"]],
            pm: [["Limpieza de radiador / intercambiador de calor", 4000]] }),
          inst("PROP-RED-SEN", "Sensor Presión/Temp Reductora", {
            param: PM_ACE_RED,
            rep: [["SEN-PRE-RED", "Sensor Presión Reductora", "oem"]] }),
        ],
      },
      {
        cod: "PROP-EJE", nom: "Eje y Bocina", crit: "A", tipo: "subsistema",
        hijos: [
          comp("PROP-EJE-EJE", "Eje de Cola", { basico: false, rep: [["EJE-OEM", "Eje de Cola (OEM)", "oem"]] }),
          comp("PROP-EJE-BOC", "Bocina (Stern Tube)", { basico: false, rep: [["BOC-OEM", "Bocina (OEM)", "oem"]] }),
          comp("PROP-EJE-SEL", "Sello de Bocina", {
            rep: [["SEL-BOC-OEM", "Sello de Bocina (OEM)", "oem"], ["KIT-SEL-BOC", "Kit Sellos Bocina", "generico"]],
            pm: [["Inspección visual / por condición", 2000]] }),
          comp("PROP-EJE-CHU", "Chumaceras de Apoyo", {
            rep: [["CHU-OEM", "Chumacera de Apoyo (OEM)", "oem"]],
            pm: [["Engrase / lubricación general", 1000]] }),
          comp("PROP-EJE-ACO", "Acoplamiento / Brida", { basico: false,
            rep: [["ACO-EJE-OEM", "Acoplamiento de Eje (OEM)", "oem"]] }),
        ],
      },
      {
        cod: "PROP-HEL", nom: "Hélice", crit: "A", tipo: "subsistema",
        hijos: [
          comp("PROP-HEL-HEL", "Hélice", { basico: false, rep: [["HEL-OEM", "Hélice (OEM)", "oem"]] }),
          comp("PROP-HEL-ANO", "Ánodos de Eje / Hélice", {
            rep: [["ANO-EJE-GEN", "Ánodo de Eje (genérico)", "generico"]],
            pm: [["Inspección de ánodos de sacrificio", 1000]] }),
        ],
      },
    ],
  },

  // ── Gobierno / Servotimón (SFI 642) ────────────────────────────
  {
    cod: "STEER", nom: "Gobierno / Servotimón", crit: "A", tipo: "sistema",
    hijos: [
      comp("STEER-PWR", "Servomotor / Power Pack del Timón", { basico: false,
        rep: [["BMP-TIM-OEM", "Bomba Hidráulica del Timón (OEM)", "oem"], ["MOT-TIM-OEM", "Motor Eléctrico Servotimón", "oem"]],
        // SFI 642: semanal prueba + mensual cambio bomba activa + 2000H engrase
        pm: [
          ["Prueba operacional del sistema de gobierno", null, "semanal"],
          ["Cambio de bomba activa del timón", null, "mensual"],
          ["Engrase / lubricación general", 2000],
          ["Prueba de emergencia del gobierno", null, "semestral"],
        ] }),
      comp("STEER-CIL", "Cilindros / Actuador del Timón", {
        rep: [["KIT-SEL-TIM", "Kit Sellos Cilindro Timón", "generico"]],
        pm: [["Inspección visual / por condición", 2000]] }),
      comp("STEER-TIM", "Mecha y Pala del Timón", { basico: false,
        rep: [["CASQ-TIM-OEM", "Casquillo/Bocina de Mecha (OEM)", "oem"]] }),
      comp("STEER-EMG", "Gobierno de Emergencia", {
        rep: [["BMB-MAN-TIM", "Bomba Manual de Emergencia", "oem"]],
        pm: [["Prueba de emergencia del gobierno", null, "semestral"]] }),
      inst("STEER-FBK", "Telemotor / Retroalimentación", {
        rep: [["FBK-TIM-OEM", "Transmisor de Posición (feedback)", "oem"]],
        // SFI 642 anual calibración
        pm: [["Calibración de sensores / instrumentos", null, "anual"]] }),
    ],
  },

  // ── Generadores Electricidad (SFI 621-622) ──────────────────────
  {
    cod: "GEN", nom: "Generadores Electricidad", crit: "A", tipo: "sistema",
    hijos: [
      MOTOR_GENERADOR,
      { cod: "GEN-EMG", nom: "Generador de Emergencia", crit: "A", tipo: "subsistema" },
    ],
  },

  // ── Combustible de Nave ─────────────────────────────────────────
  {
    cod: "FUEL", nom: "Combustible de Nave", crit: "A", tipo: "sistema",
    hijos: [
      { cod: "FUEL-TNK", nom: "Tanques de Combustible",     crit: "A", tipo: "subsistema" },
      { cod: "FUEL-BMP", nom: "Bomba de Trasiego",          crit: "A", tipo: "subsistema" },
      { cod: "FUEL-SEP", nom: "Separador Agua-Combustible", crit: "A", tipo: "subsistema" },
    ],
  },

  // ── Sistema Eléctrico (SFI 622 Tablero) ────────────────────────
  {
    cod: "ELEC", nom: "Sistema Eléctrico", crit: "B", tipo: "sistema",
    hijos: [
      // SFI 622 — Tablero Principal expandido con PM calendario
      {
        cod: "ELEC-TAB", nom: "Tablero Principal", crit: "B", tipo: "subsistema",
        hijos: [
          comp("ELEC-TAB-PNL", "Tablero e Interruptores Principales", { crit: "B",
            rep: [["KIT-FUS-GEN", "Kit de Fusibles/Relés (repuesto)", "generico"]],
            // SFI 622: mensual, trimestral, semestral, anual
            pm: [
              ["Limpieza interior de tablero eléctrico", null, "mensual"],
              ["Torque de conexiones del tablero", null, "trimestral"],
              ["Termografía del tablero principal", null, "semestral"],
              ["Prueba de disparo de protecciones", null, "anual"],
            ] }),
        ],
      },
      { cod: "ELEC-INT", nom: "Interruptores",        crit: "B", tipo: "subsistema" },
      { cod: "ELEC-BAT", nom: "Banco de Baterías",    crit: "B", tipo: "subsistema" },
      { cod: "ELEC-CAB", nom: "Cables y Conductores", crit: "B", tipo: "subsistema" },
      {
        cod: "ELEC-ALU", nom: "Alumbrado y Luces de Navegación", crit: "A", tipo: "subsistema",
        hijos: [
          comp("ELEC-ALU-NAV", "Luces de Navegación (reglamentarias)", {
            rep: [["LUZ-NAV-OEM", "Set Luces de Navegación (OEM)", "oem"], ["AMP-NAV-GEN", "Ampolletas/LED Náuticos", "generico"]],
            pm: [["Inspección visual / por condición", 1000]] }),
          comp("ELEC-ALU-CUB", "Proyectores de Cubierta", {
            rep: [["PROY-CUB-OEM", "Proyector de Cubierta (OEM)", "oem"]],
            pm: [["Inspección visual / por condición", 2000]] }),
          comp("ELEC-ALU-EMG", "Alumbrado de Emergencia", {
            rep: [["LUZ-EMG-OEM", "Luminaria de Emergencia (OEM)", "oem"]],
            pm: [["Prueba de alarmas y paradas de seguridad", 1000]] }),
        ],
      },
      {
        cod: "ELEC-MON", nom: "Monitoreo y Alarmas de Máquinas", crit: "A", tipo: "subsistema",
        hijos: [
          comp("ELEC-MON-PNL", "Panel de Alarmas y Monitoreo", { basico: false,
            rep: [["PNL-ALM-OEM", "Panel de Alarmas (OEM)", "oem"]],
            pm: [["Prueba de alarmas y paradas de seguridad", 1000]] }),
          inst("ELEC-MON-SEN", "Sensores de Alarma (nivel, temp, presión)", {
            param: PM_VIB,
            rep: [["SEN-ALM-GEN", "Sensores de Alarma (kit)", "generico"]],
            pm: [["Calibración de sensores / instrumentos", 4000]] }),
        ],
      },
    ],
  },

  // ── Central Hidráulica / Power Pack (SFI 652) ──────────────────
  CENTRAL_HIDRAULICA,

  // ── Aire Comprimido (SFI 641) ───────────────────────────────────
  {
    cod: "AIR", nom: "Aire Comprimido", crit: "B", tipo: "sistema",
    hijos: [
      {
        cod: "AIR-ARR", nom: "Aire de Arranque", crit: "B", tipo: "subsistema",
        hijos: [
          comp("AIR-ARR-CMP", "Compresor de Aire de Arranque", { basico: false,
            rep: [["CMP-ARR-OEM", "Compresor Arranque (OEM)", "oem"], ["KIT-VLV-CMP", "Kit Válvulas Compresor", "generico"]],
            // SFI 641: diario drenar + semanal válv seg + 500H aceite + 1000H válvulas + 4000H segmentos + 8000H overhaul
            pm: [
              ["Drenar condensados del compresor de arranque", null, "diario"],
              ["Prueba de alarmas y paradas de seguridad", null, "semanal"],
              ["Cambio de aceite de compresor de arranque", 500],
              ["Inspección de válvulas de descarga del compresor", 1000],
              ["Cambio de segmentos del compresor de arranque", 4000],
              ["Overhaul completo de compresor de arranque", 8000],
            ] }),
          comp("AIR-ARR-BOT", "Botellas de Aire de Arranque", {
            rep: [["VLV-BOT-OEM", "Válvula Botella de Aire", "oem"]],
            pm: [["Inspección visual / por condición", 2000]] }),
        ],
      },
      {
        cod: "AIR-SRV", nom: "Aire de Servicio / Control", crit: "B", tipo: "subsistema",
        hijos: [
          comp("AIR-SRV-CMP", "Compresor de Servicio", { basico: false,
            rep: [["CMP-SRV-OEM", "Compresor de Servicio (OEM)", "oem"]],
            pm: [["Inspección visual / por condición", 2000]] }),
          comp("AIR-SRV-SEC", "Secador / Filtro de Aire", {
            rep: [["FLT-AIRE-SRV", "Filtro/Secador de Aire", "generico"]],
            pm: [["Inspección visual / por condición", 1000]] }),
        ],
      },
    ],
  },

  // ── Equipos de Pesca (SFI 651-653) ─────────────────────────────
  {
    cod: "FISH", nom: "Equipo de Pesca (Trampas / Centolla)", crit: "A", tipo: "sistema",
    hijos: [
      // SFI 651 — Winches de Pesca
      comp("FISH-VIR", "Virador de Trampas (Pot Hauler)", {
        rep: [["VIR-OEM", "Virador Hidráulico (OEM)", "oem"], ["MOT-VIR-OEM", "Motor Hidráulico Virador", "oem"], ["KIT-SEL-VIR", "Kit Sellos Virador", "generico"]],
        // SFI 651: diario nivel + semanal lubricación + mensual frenos + 1000H aceite + 2000H engranajes + 4000H overhaul frenos
        pm: [
          ["Verificar nivel de aceite en cárter", null, "diario"],
          ["Lubricación de cables de pesca", null, "semanal"],
          ["Inspección de frenos de winches", null, "mensual"],
          ["Cambio de aceite en reductores de winche", 1000],
          ["Revisión de winche / power block", 1000],
          ["Inspección de engranajes del winche", 2000],
          ["Overhaul de frenos hidráulicos del winche", 4000],
          ["Engrase / lubricación general", 500],
        ] }),
      comp("FISH-LAN", "Lanzador / Rampa de Lanzamiento", {
        rep: [["ROD-LAN-GEN", "Rodillos de Lanzamiento", "generico"]],
        pm: [["Inspección visual / por condición", 1000]] }),
      comp("FISH-PAS", "Pasacabos / Enrollador de Línea", {
        rep: [["PAS-OEM", "Pasacabos (OEM)", "oem"]],
        pm: [["Engrase / lubricación general", 1000]] }),
      comp("FISH-TRA", "Trampas / Nasas", { basico: false,
        rep: [["TRA-CENT", "Trampa de Centolla (estándar)", "generico"], ["RED-TRA", "Paño/Red de Trampa (repuesto)", "generico"]] }),
      comp("FISH-LIN", "Boyas, Líneas y Orinques", {
        rep: [["BOYA-GEN", "Boya de Señalización", "generico"], ["LIN-GROUND", "Línea madre / orinque (rollo)", "generico"]],
        pm: [["Inspección visual / por condición", 500]] }),
      comp("FISH-CAR", "Pañol / Cámara de Carnada", { basico: false,
        pm: [["Inspección visual / por condición", 2000]] }),
      // SFI 653 — Grúas y Plumas
      comp("FISH-GRU", "Pluma / Davit de Izado", { basico: false,
        rep: [["KIT-SEL-GRU", "Kit Sellos Cilindro Pluma", "generico"]],
        // SFI 653: semanal estructural + mensual cables + semestral END + anual certificación
        pm: [
          ["Inspección estructural de grúas y plumas", null, "semanal"],
          ["Inspección de cables y eslingas de grúas", null, "mensual"],
          ["Ensayo de discontinuidades (END) en soldaduras", null, "semestral"],
          ["Certificación de carga de grúas", null, "anual"],
        ] }),
    ],
  },

  // ── Viveros y Manejo de Captura ─────────────────────────────────
  {
    cod: "CATCH", nom: "Viveros y Manejo de Captura", crit: "A", tipo: "sistema",
    hijos: [
      comp("CATCH-VIV", "Estanques / Viveros (centolla viva)", { basico: false,
        rep: [["JD-VIV-GEN", "Juntas/Sellos de Estanque", "generico"]],
        pm: [["Inspección visual / por condición", 1000]] }),
      comp("CATCH-BMP", "Bombas de Circulación de Agua de Mar", {
        rep: [["BMP-CIR-OEM", "Bomba de Circulación (OEM)", "oem"], ["BMP-CIR-ALT", "Bomba de Circulación Alternativa", "alternativo"], ["KIT-SEL-CIR", "Kit Sellos Bomba", "generico"]],
        pm: [["Revisión de bomba de agua de mar (impeller)", 1000], ["Engrase / lubricación general", 500]] }),
      comp("CATCH-OXI", "Sistema de Oxigenación / Aireación", {
        rep: [["DIF-OXI-GEN", "Difusores de Oxígeno", "generico"], ["REG-OXI-OEM", "Regulador de Oxígeno", "oem"]],
        pm: [["Inspección visual / por condición", 500]] }),
      comp("CATCH-FIL", "Filtración / Recambio de Agua", {
        rep: [["FLT-VIV-GEN", "Filtro de Vivero", "generico"]],
        pm: [["Inspección visual / por condición", 250]] }),
      comp("CATCH-CLA", "Mesa de Clasificación / Picking", { basico: false }),
      inst("CATCH-SEN", "Sensores de Calidad de Agua (O₂, temp)", {
        param: PM_VIVERO,
        rep: [["SEN-OXI-OEM", "Sensor de Oxígeno Disuelto", "oem"], ["SEN-TEM-VIV", "Sensor de Temperatura Vivero", "oem"]],
        pm: [["Calibración de sensores / instrumentos", 2000]] }),
    ],
  },

  // ── Refrigeración RSW / Planta Frigorífica (SFI 661-663) ────────
  {
    cod: "RSW", nom: "Refrigeración RSW / Carnada", crit: "A", tipo: "sistema",
    hijos: [
      // SFI 661 — Compresor Frigorífico (expandido desde stub vacío)
      {
        cod: "RSW-CMP", nom: "Compresor Frigorífico", crit: "A", tipo: "subsistema",
        hijos: [
          comp("RSW-CMP-CMP", "Compresor Frigorífico (conjunto)", {
            rep: [
              ["FLT-CMP-RSW-GEN", "Filtro de Aceite Compresor RSW", "generico"],
              ["VAL-CMP-RSW-OEM", "Válvulas de Compresor RSW (kit)", "oem"],
              ["ACE-CMP-RSW-GEN", "Aceite de Compresor Frigorífico", "generico"],
            ],
            // SFI 661: diario parámetros + semanal nivel + mensual filtros + 1000H + 2000H + 4000H + 8000H
            pm: [
              ["Verificar presión alta, baja y temperaturas frigoríficas", null, "diario"],
              ["Verificar nivel de aceite del compresor frigorífico", null, "semanal"],
              ["Verificar estado de filtros del compresor RSW", null, "mensual"],
              ["Cambio de filtros de aceite de compresor RSW", 1000],
              ["Análisis de aceite de compresor frigorífico", 2000],
              ["Cambio de válvulas del compresor frigorífico", 4000],
              ["Overhaul completo de compresor frigorífico", 8000],
            ] }),
        ],
      },
      // SFI 662 — Condensador
      {
        cod: "RSW-CND", nom: "Condensador RSW", crit: "A", tipo: "subsistema",
        hijos: [
          comp("RSW-CND-SER", "Serpentines / Intercambiador RSW", {
            rep: [["JD-CND-GEN", "Junta/Sello Condensador", "generico"]],
            // SFI 662: semanal limpieza + mensual serpentines + 1000H profunda + 2000H fugas
            pm: [
              ["Limpieza visual del condensador RSW", null, "semanal"],
              ["Limpieza de serpentines del condensador", null, "mensual"],
              ["Limpieza profunda de condensador RSW", 1000],
              ["Prueba de fugas de refrigerante", 2000],
            ] }),
        ],
      },
      // SFI 663 — Evaporador / Chiller
      {
        cod: "RSW-EVA", nom: "Evaporador / Chiller RSW", crit: "A", tipo: "subsistema",
        hijos: [
          comp("RSW-EVA-EVA", "Evaporador RSW (conjunto)", {
            // SFI 663: semanal + mensual + semestral + anual
            pm: [
              ["Limpieza de evaporador RSW", null, "semanal"],
              ["Verificación de ventiladores de evaporador", null, "mensual"],
              ["Deshielo completo de evaporador RSW", null, "semestral"],
              ["Prueba de eficiencia frigorífica", null, "anual"],
            ] }),
        ],
      },
      { cod: "RSW-BAM", nom: "Bomba Agua de Mar RSW",   crit: "A", tipo: "subsistema" },
      { cod: "RSW-BOD", nom: "Bodegas de Pesca",        crit: "A", tipo: "subsistema" },
      inst("RSW-SEN-T", "Sensor Temperatura RSW", { crit: "A",
        param: PM_RSW_T,
        pm: [["Calibración de sensores / instrumentos", null, "semestral"]] }),
    ],
  },

  // ── Navegación ──────────────────────────────────────────────────
  {
    cod: "NAV", nom: "Navegación", crit: "A", tipo: "sistema",
    hijos: [
      { cod: "NAV-GPS", nom: "GPS / Plotter",       crit: "A", tipo: "subsistema" },
      { cod: "NAV-RAD", nom: "Radar",               crit: "A", tipo: "subsistema" },
      { cod: "NAV-SON", nom: "Sonda / Ecosonda",    crit: "A", tipo: "subsistema" },
      { cod: "NAV-GIR", nom: "Girocompás / Compás", crit: "A", tipo: "subsistema" },
      { cod: "NAV-AIS", nom: "AIS",                 crit: "A", tipo: "subsistema" },
      { cod: "NAV-PIL", nom: "Piloto Automático",   crit: "B", tipo: "subsistema" },
    ],
  },

  // ── Comunicaciones (GMDSS) ──────────────────────────────────────
  {
    cod: "COMM", nom: "Comunicaciones (GMDSS)", crit: "A", tipo: "sistema",
    hijos: [
      { cod: "COMM-VHF",  nom: "VHF / DSC",                crit: "A", tipo: "subsistema" },
      { cod: "COMM-MFHF", nom: "MF / HF",                  crit: "A", tipo: "subsistema" },
      { cod: "COMM-SAT",  nom: "Inmarsat-C / Satelital",   crit: "A", tipo: "subsistema" },
      { cod: "COMM-VMS",  nom: "VMS Satelital",            crit: "A", tipo: "subsistema" },
      comp("COMM-EPI", "EPIRB / Baliza de Emergencia", {
        rep: [["BAT-EPIRB-OEM", "Batería EPIRB (OEM)", "oem"]],
        pm: [["Prueba de alarmas y paradas de seguridad", 2000]] }),
      comp("COMM-SART", "SART / Radar Transponder", {
        rep: [["BAT-SART-OEM", "Batería SART (OEM)", "oem"]],
        pm: [["Prueba de alarmas y paradas de seguridad", 2000]] }),
      { cod: "COMM-NTX",  nom: "NAVTEX",                   crit: "B", tipo: "subsistema" },
    ],
  },

  // ── Contraincendios ─────────────────────────────────────────────
  {
    cod: "FIRE", nom: "Contraincendios", crit: "A", tipo: "sistema",
    hijos: [
      comp("FIRE-BMP", "Bomba Contraincendios Principal", { basico: false,
        rep: [["BMP-CI-OEM", "Bomba CI (OEM)", "oem"], ["KIT-SEL-CI", "Kit Sellos Bomba CI", "generico"]],
        pm: [["Prueba de alarmas y paradas de seguridad", 1000], ["Engrase / lubricación general", 2000]] }),
      comp("FIRE-EMG", "Bomba CI de Emergencia", { basico: false,
        rep: [["BMP-CI-EMG-OEM", "Bomba CI Emergencia (OEM)", "oem"]],
        pm: [["Prueba de alarmas y paradas de seguridad", 1000]] }),
      comp("FIRE-RED", "Colector, Hidrantes y Mangueras", {
        rep: [["MNG-CI-GEN", "Manguera CI 1½\" (rollo)", "generico"], ["BOQ-CI-GEN", "Boquilla/Lanza CI", "generico"]],
        pm: [["Inspección visual / por condición", 500]] }),
      comp("FIRE-FIJ", "Sistema Fijo Sala de Máquinas (CO₂ / espuma)", { basico: false,
        rep: [["KIT-CO2-OEM", "Botellón CO₂ / carga", "oem"]],
        pm: [["Inspección visual / por condición", 2000]] }),
      comp("FIRE-DET", "Detección (humo / calor) y Paro Remoto", {
        rep: [["DET-HUM-OEM", "Detector de Humo", "oem"], ["DET-CAL-OEM", "Detector de Calor", "oem"]],
        pm: [["Prueba de alarmas y paradas de seguridad", 1000]] }),
      comp("FIRE-EXT", "Extintores Portátiles", {
        rep: [["EXT-PQS-6", "Extintor PQS 6kg", "generico"], ["EXT-CO2-5", "Extintor CO₂ 5kg", "generico"]],
        pm: [["Control de extintores", 1000]] }),
    ],
  },

  // ── Achique y Sentinas ──────────────────────────────────────────
  {
    cod: "BILGE", nom: "Achique y Sentinas", crit: "A", tipo: "sistema",
    hijos: [
      comp("BILGE-BMP", "Bombas de Achique", {
        rep: [["BMP-ACH-OEM", "Bomba de Achique (OEM)", "oem"], ["BMP-ACH-ALT", "Bomba de Achique Alternativa", "alternativo"], ["KIT-SEL-ACH", "Kit Sellos Bomba Achique", "generico"]],
        pm: [["Prueba de alarmas y paradas de seguridad", 1000], ["Engrase / lubricación general", 1000]] }),
      comp("BILGE-COL", "Colector y Válvulas de Sentina", {
        rep: [["VLV-SEN-OEM", "Válvula de Sentina (OEM)", "oem"]],
        pm: [["Inspección visual / por condición", 1000]] }),
      comp("BILGE-ALM", "Alarmas de Nivel de Sentina", {
        rep: [["SEN-NIV-OEM", "Sensor de Nivel de Sentina", "oem"]],
        pm: [["Prueba de alarmas y paradas de seguridad", 500]] }),
      comp("BILGE-EDU", "Eductor / Achique de Emergencia", { basico: false,
        rep: [["EDU-OEM", "Eductor (OEM)", "oem"]],
        pm: [["Inspección visual / por condición", 2000]] }),
    ],
  },

  // ── Medio Ambiente (MARPOL) ─────────────────────────────────────
  {
    cod: "ENV", nom: "Medio Ambiente (MARPOL)", crit: "A", tipo: "sistema",
    hijos: [
      comp("ENV-OWS", "Separador de Aguas Oleosas (OWS)", { basico: false,
        rep: [["FLT-OWS-OEM", "Elemento Filtrante OWS (OEM)", "oem"], ["KIT-SEL-OWS", "Kit Sellos OWS", "generico"]],
        pm: [["Inspección visual / por condición", 1000]] }),
      comp("ENV-OCM", "Monitor de Contenido de Aceite (15 ppm)", {
        rep: [["CEL-OCM-OEM", "Celda/Sensor OCM (OEM)", "oem"]],
        pm: [["Calibración de sensores / instrumentos", 2000]] }),
      comp("ENV-LOD", "Tanque de Lodos (Sludge)", { basico: false,
        pm: [["Inspección visual / por condición", 4000]] }),
      comp("ENV-AGS", "Tratamiento / Tanque de Aguas Servidas", { basico: false,
        rep: [["KIT-AGS-OEM", "Kit Mantención Planta Aguas Servidas", "oem"]],
        pm: [["Inspección visual / por condición", 2000]] }),
    ],
  },

  // ── Seguridad (Salvamento) ──────────────────────────────────────
  {
    cod: "SAF", nom: "Seguridad (Salvamento)", crit: "A", tipo: "sistema",
    hijos: [
      comp("SAF-BAL", "Balsa Salvavidas", {
        rep: [["KIT-BAL-SRV", "Servicio Anual Balsa (kit)", "oem"]],
        pm: [["Revisión de balsa salvavidas", null, "anual"]] }),
      comp("SAF-CHA", "Chalecos y Trajes de Inmersión", {
        rep: [["CHA-SV-GEN", "Chaleco Salvavidas", "generico"], ["TRA-INM-GEN", "Traje de Inmersión", "generico"]],
        pm: [["Inspección visual / por condición", null, "semestral"]] }),
      comp("SAF-ARO", "Aros Salvavidas y Señales", {
        rep: [["ARO-SV-GEN", "Aro Salvavidas", "generico"], ["LUZ-ARO-GEN", "Luz/Rabiza de Aro", "generico"]],
        pm: [["Inspección visual / por condición", null, "semestral"]] }),
      comp("SAF-PIR", "Señales Pirotécnicas", { basico: false,
        rep: [["PIR-KIT", "Set Pirotécnico (bengalas/cohetes)", "generico"]],
        pm: [["Inspección visual / por condición", null, "anual"]] }),
      comp("SAF-BOT", "Botiquín / Primeros Auxilios", {
        rep: [["BOT-1AUX", "Botiquín Náutico (recarga)", "generico"]],
        pm: [["Inspección visual / por condición", null, "anual"]] }),
    ],
  },

  // ── Ventilación y Climatización ─────────────────────────────────
  {
    cod: "HVAC", nom: "Ventilación y Climatización", crit: "B", tipo: "sistema",
    hijos: [
      comp("HVAC-SM", "Ventilación Sala de Máquinas", {
        rep: [["VEN-SM-OEM", "Ventilador/Extractor Sala Máquinas", "oem"], ["COR-VEN-GEN", "Correa de Ventilador", "generico"]],
        pm: [["Inspección visual / por condición", 1000]] }),
      comp("HVAC-AC", "Aire Acondicionado de Acomodación", { basico: false,
        rep: [["FLT-AC-GEN", "Filtros de A/C", "generico"], ["GAS-AC-GEN", "Carga de Refrigerante", "generico"]],
        pm: [["Inspección visual / por condición", 2000]] }),
      comp("HVAC-BOD", "Ventilación de Bodegas / Pañoles", {
        rep: [["VEN-BOD-OEM", "Ventilador de Bodega", "oem"]],
        pm: [["Inspección visual / por condición", 2000]] }),
    ],
  },

  // ── Agua, Lastre y Potable ──────────────────────────────────────
  {
    cod: "WAT", nom: "Agua, Lastre y Potable", crit: "B", tipo: "sistema",
    hijos: [
      { cod: "WAT-LST", nom: "Tanques y Bombas de Lastre", crit: "B", tipo: "subsistema" },
      { cod: "WAT-TND", nom: "Tanques de Agua Dulce",      crit: "B", tipo: "subsistema" },
      {
        cod: "WAT-POT", nom: "Planta de Agua Potable", crit: "B", tipo: "subsistema",
        hijos: [
          comp("WAT-POT-GEN", "Generador de Agua Dulce (ósmosis/evaporador)", { basico: false,
            rep: [["MEM-RO-OEM", "Membrana de Ósmosis (OEM)", "oem"], ["FLT-RO-GEN", "Prefiltros RO", "generico"]],
            pm: [["Inspección visual / por condición", 2000]] }),
          comp("WAT-POT-HID", "Grupo Hidróforo", {
            rep: [["BMP-HID-OEM", "Bomba Hidróforo (OEM)", "oem"], ["MEM-HID-GEN", "Membrana/Diafragma Estanque", "generico"]],
            pm: [["Engrase / lubricación general", 2000]] }),
          comp("WAT-POT-CAL", "Calentador de Agua", { basico: false,
            rep: [["RES-CAL-GEN", "Resistencia/Ánodo Calentador", "generico"]],
            pm: [["Inspección visual / por condición", 2000]] }),
          comp("WAT-POT-UV", "Esterilizador UV / Potabilización", {
            rep: [["LAM-UV-GEN", "Lámpara UV", "generico"]],
            pm: [["Inspección visual / por condición", 1000]] }),
        ],
      },
    ],
  },

  // ── Habitabilidad y Fonda ───────────────────────────────────────
  {
    cod: "HOTEL", nom: "Habitabilidad y Fonda", crit: "C", tipo: "sistema",
    hijos: [
      comp("HOTEL-COC", "Cocina / Equipos de Fonda", {
        rep: [["RES-COC-GEN", "Resistencias/Quemadores Cocina", "generico"]],
        pm: [["Inspección visual / por condición", 2000]] }),
      comp("HOTEL-REF", "Refrigeración de Víveres (Provisión)", { basico: false,
        rep: [["GAS-REF-GEN", "Carga Refrigerante Cámara Víveres", "generico"], ["FLT-REF-GEN", "Filtro Deshidratador", "generico"]],
        pm: [["Inspección visual / por condición", 2000]] }),
      comp("HOTEL-ACS", "Agua Caliente Sanitaria", { basico: false,
        pm: [["Inspección visual / por condición", 4000]] }),
    ],
  },

  // ── Casco y Estructura ──────────────────────────────────────────
  {
    cod: "STR", nom: "Casco y Estructura", crit: "B", tipo: "sistema",
    hijos: [
      { cod: "STR-CAS", nom: "Casco",            crit: "B", tipo: "subsistema" },
      { cod: "STR-CUB", nom: "Cubierta",         crit: "B", tipo: "subsistema" },
      { cod: "STR-MAM", nom: "Mamparos",         crit: "B", tipo: "subsistema" },
      { cod: "STR-ANO", nom: "Ánodos de Sacrificio", crit: "B", tipo: "subsistema" },
    ],
  },

  // ── Fondeo y Amarre ─────────────────────────────────────────────
  {
    cod: "ANCH", nom: "Fondeo y Amarre", crit: "B", tipo: "sistema",
    hijos: [
      comp("ANCH-MOL", "Molinete (Windlass)", { basico: false,
        rep: [["MOT-MOL-OEM", "Motor Molinete (OEM)", "oem"], ["KIT-FRE-MOL", "Kit de Freno/Embrague", "generico"]],
        pm: [["Engrase / lubricación general", 1000], ["Inspección visual / por condición", 2000]] }),
      comp("ANCH-CAB", "Cabrestantes de Amarre", {
        rep: [["KIT-SEL-CAB", "Kit Sellos Cabrestante", "generico"]],
        pm: [["Engrase / lubricación general", 1000]] }),
      comp("ANCH-ANC", "Ancla y Cadena", { basico: false,
        rep: [["GRIL-ANC-GEN", "Grilletes/Eslabón de Cadena", "generico"]],
        pm: [["Inspección visual / por condición", 4000]] }),
      comp("ANCH-BIT", "Bitas, Guías y Cabos", {
        rep: [["CABO-AMA-GEN", "Cabo de Amarre", "generico"]],
        pm: [["Inspección visual / por condición", 2000]] }),
    ],
  },
];

// ── Predicado de inclusión por modo de precarga ──
export function nodoIncluido(nodo, modo = "completo") {
  if (modo === "completo") return true;
  const hijos = nodo.hijos || [];
  if (hijos.length === 0) return nodo.basico !== false;
  return hijos.some((h) => nodoIncluido(h, modo));
}

export function contarNodosPlantilla(modo = "completo") {
  const contar = (nodos) => (nodos || []).reduce(
    (s, n) => nodoIncluido(n, modo) ? s + 1 + contar(n.hijos) : s, 0);
  return contar(PLANTILLA_PESQUERA);
}

export function contarRepuestosPlantilla(modo = "completo") {
  const contar = (nodos) => (nodos || []).reduce(
    (s, n) => nodoIncluido(n, modo) ? s + (n.rep ? n.rep.length : 0) + contar(n.hijos) : s, 0);
  return contar(PLANTILLA_PESQUERA);
}

export function contarPlanesPMPlantilla(modo = "completo") {
  const contar = (nodos) => (nodos || []).reduce(
    (s, n) => nodoIncluido(n, modo) ? s + (n.pm ? n.pm.length : 0) + contar(n.hijos) : s, 0);
  return contar(PLANTILLA_PESQUERA);
}

export const TIPO_NODO_META = {
  sistema:      { label: "Sistema",       color: "#2563EB" },
  subsistema:   { label: "Subsistema",    color: "#0891B2" },
  componente:   { label: "Componente",    color: "#059669" },
  instrumento:  { label: "Instrumento",   color: "#7C3AED" },
  equipo:       { label: "Equipo",        color: "#64748B" },
};

export const CRITICIDAD_TONE = { A: "red", B: "yellow", C: "green" };

export const TIPO_REPUESTO_META = {
  oem:         { label: "OEM",       tone: "green",  desc: "Original del fabricante" },
  alternativo: { label: "Alt.",      tone: "yellow", desc: "Equivalente alternativo" },
  generico:    { label: "Genérico",  tone: "slate",  desc: "Genérico certificado" },
};
