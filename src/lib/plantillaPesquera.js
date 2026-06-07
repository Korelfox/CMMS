// ============================================================
//  Plantilla de jerarquía estándar para nave pesquera
//  Basada en ISO 14224 + best practices CMMS mundiales
//  (SAP EAM, IBM Maximo, SERTICA marino) y especificaciones
//  Caterpillar / Marine Engines.
//
//  Profundidad variable (hasta 6 niveles funcionales):
//    Sistema → Subsistema → Sub-subsistema → Componente
//  Los REPUESTOS (nivel 6 / SKU) NO son nodos de equipos: se
//  crean como inventario_items ligados al componente, con
//  intercambiabilidad OEM / Alternativo / Genérico.
//
//  Estructura de cada nodo:
//    cod    → código estructurado, ruta completa (id_visible sin el prefijo de nave)
//    nom    → nombre legible (sistema)
//    crit   → criticidad A | B | C
//    tipo   → tipo_nodo: sistema | subsistema | componente | instrumento
//    mtbf   → MTBF objetivo en horas (opcional)
//    rep    → repuestos del componente: [ [sku, descripcion, tipo], ... ]
//             tipo de repuesto: oem | alternativo | generico
//    hijos  → array de subnodos (opcional)
// ============================================================

// ── Helpers de construcción (reducen verbosidad de los componentes) ──
// Componente con repuestos. `rep` = array de tuplas [sku, desc, tipo].
const comp = (cod, nom, rep = [], tipo = "componente", crit = "A") => ({ cod, nom, crit, tipo, rep });
const inst = (cod, nom, rep = []) => comp(cod, nom, rep, "instrumento");

// ============================================================
//  MOTOR PRINCIPAL — 7 subsistemas · 58 componentes
//  (subárbol de PROP → PROP-MTR)
// ============================================================
const MOTOR_PRINCIPAL = {
  cod: "PROP-MTR", nom: "Motor Principal", crit: "A", tipo: "subsistema", mtbf: 12000,
  hijos: [
    // ── 1. Cilindros y Pistones (8) ──
    {
      cod: "PROP-MTR-CIL", nom: "Sistema de Cilindros y Pistones", crit: "A", tipo: "subsistema",
      hijos: [
        comp("PROP-MTR-CIL-CYL", "Cilindro Principal", [
          ["JD-CYL-001", "Junta Cilindro (OEM)", "oem"],
          ["JD-CYL-002", "Junta Cilindro (Alternativo)", "alternativo"],
          ["OIL-001", "Arandela O-Ring (kit)", "generico"],
        ]),
        comp("PROP-MTR-CIL-PIS", "Pistón Principal", [
          ["PIS-3406-CAT", "Pistón CAT 3406 (OEM)", "oem"],
          ["PIS-3406-ALT", "Pistón Alternativo (MarinePower)", "alternativo"],
          ["SEG-001", "Segmentos (kit 4 piezas)", "generico"],
        ]),
        comp("PROP-MTR-CIL-SEG", "Segmentos (Piston Rings)", [
          ["SEG-3406-CAT", "Segmentos CAT 3406 (kit)", "oem"],
          ["SEG-3406-NSK", "Segmentos NSK (alternativo)", "alternativo"],
        ]),
        comp("PROP-MTR-CIL-VIN", "Válvula de Entrada", [
          ["VIN-3406-CAT", "Válvula Entrada CAT (OEM)", "oem"],
          ["VIN-3406-ALT", "Válvula Entrada Alternativa", "alternativo"],
        ]),
        comp("PROP-MTR-CIL-VES", "Válvula de Escape", [
          ["VES-3406-CAT", "Válvula Escape CAT (OEM)", "oem"],
          ["VES-3406-ALT", "Válvula Escape Alternativa", "alternativo"],
        ]),
        comp("PROP-MTR-CIL-GUI", "Guía de Válvula", [
          ["GUI-3406-CAT", "Guía Válvula CAT (OEM)", "oem"],
        ]),
        comp("PROP-MTR-CIL-MUE", "Muelle de Válvula", [
          ["MUE-3406-CAT", "Muelle Válvula CAT (OEM)", "oem"],
        ]),
        comp("PROP-MTR-CIL-LEV", "Leva de Válvula", [
          ["LEV-3406-CAT", "Leva Válvula CAT (OEM)", "oem"],
        ]),
      ],
    },
    // ── 2. Lubricación (10) ──
    {
      cod: "PROP-MTR-LUB", nom: "Sistema de Lubricación", crit: "A", tipo: "subsistema",
      hijos: [
        comp("PROP-MTR-LUB-BMP", "Bomba de Aceite Principal", [
          ["BMP-3406-CAT", "Bomba Aceite CAT (OEM)", "oem"],
          ["BMP-3406-SKF", "Bomba Aceite SKF (alternativo)", "alternativo"],
          ["BRG-6312-ZZ", "Rodamiento 6312-ZZ (2x)", "generico"],
        ]),
        comp("PROP-MTR-LUB-BMA", "Bomba de Aceite Auxiliar", [
          ["BMA-3406-CAT", "Bomba Aceite Auxiliar CAT (OEM)", "oem"],
          ["BMA-3406-ALT", "Bomba Aceite Auxiliar Alternativa", "alternativo"],
        ]),
        comp("PROP-MTR-LUB-FLT", "Filtro de Aceite Principal", [
          ["FLT-250-CAT3406", "Filtro 250mm CAT (OEM)", "oem"],
          ["FLT-250-DON", "Filtro 250mm Donaldson", "alternativo"],
          ["FLT-250-GEN", "Filtro 250mm Genérico Certificado", "generico"],
        ]),
        comp("PROP-MTR-LUB-FTA", "Filtro de Aceite Auxiliar", [
          ["FTA-200-CAT3406", "Filtro 200mm CAT (OEM)", "oem"],
        ]),
        comp("PROP-MTR-LUB-TNK", "Tanque de Aceite", [
          ["TNK-200L-INOX", "Tanque 200L Inox (OEM)", "oem"],
          ["JD-TNK-001", "Junta Tanque (kit)", "generico"],
        ]),
        comp("PROP-MTR-LUB-RAD", "Radiador de Aceite", [
          ["RAD-ACE-3406", "Radiador Aceite CAT (OEM)", "oem"],
          ["RAD-ACE-ALT", "Radiador Aceite Alternativo", "alternativo"],
        ]),
        comp("PROP-MTR-LUB-VLP", "Válvula de Aceite Principal", [
          ["VLP-3406-CAT", "Válvula Aceite CAT (OEM)", "oem"],
          ["VLP-3406-ALT", "Válvula Aceite Alternativa", "alternativo"],
        ]),
        comp("PROP-MTR-LUB-VLS", "Válvula de Seguridad", [
          ["VLS-3406-CAT", "Válvula Seguridad CAT (OEM)", "oem"],
        ]),
        inst("PROP-MTR-LUB-SEN", "Sensor de Presión de Aceite", [
          ["SEN-PRE-CAT", "Sensor Presión CAT (OEM)", "oem"],
          ["SEN-PRE-ALT", "Sensor Presión Alternativo", "alternativo"],
        ]),
        inst("PROP-MTR-LUB-TEM", "Sensor de Temperatura de Aceite", [
          ["SEN-TEM-CAT", "Sensor Temperatura CAT (OEM)", "oem"],
        ]),
      ],
    },
    // ── 3. Enfriamiento (10) ──
    {
      cod: "PROP-MTR-COOL", nom: "Sistema de Enfriamiento", crit: "A", tipo: "subsistema",
      hijos: [
        comp("PROP-MTR-COOL-RAD", "Radiador Principal", [
          ["RAD-150L-CAT", "Radiador 150L CAT (OEM)", "oem"],
          ["RAD-150L-INOX", "Radiador 150L Inox (alternativo)", "alternativo"],
          ["RAD-150L-GEN", "Radiador 150L Genérico Certificado", "generico"],
        ]),
        comp("PROP-MTR-COOL-FAN", "Fan (Aireador) Principal", [
          ["FAN-3406-CAT", "Fan CAT (OEM)", "oem"],
          ["FAN-3406-ALT", "Fan Alternativo", "alternativo"],
        ]),
        comp("PROP-MTR-COOL-BMP", "Bomba de Agua Principal", [
          ["BMP-250-CAT", "Bomba Agua 25mm CAT (OEM)", "oem"],
          ["BMP-250-SKF", "Bomba Agua 25mm SKF (alternativo)", "alternativo"],
          ["BRG-6312-ZZ", "Rodamiento 6312-ZZ (2x)", "generico"],
        ]),
        comp("PROP-MTR-COOL-BMA", "Bomba de Agua Auxiliar", [
          ["BMA-250-CAT", "Bomba Agua Auxiliar CAT (OEM)", "oem"],
          ["BMA-250-ALT", "Bomba Agua Auxiliar Alternativa", "alternativo"],
        ]),
        comp("PROP-MTR-COOL-TNK", "Tanque de Agua", [
          ["TNK-200L-INOX", "Tanque 200L Inox (OEM)", "oem"],
          ["JD-TNK-001", "Junta Tanque (kit)", "generico"],
        ]),
        comp("PROP-MTR-COOL-VLP", "Válvula de Agua Principal", [
          ["VLP-3406-CAT", "Válvula Agua CAT (OEM)", "oem"],
          ["VLP-3406-ALT", "Válvula Agua Alternativa", "alternativo"],
        ]),
        comp("PROP-MTR-COOL-VLT", "Válvula de Three-Way", [
          ["VLT-3406-CAT", "Válvula 3-way CAT (OEM)", "oem"],
        ]),
        inst("PROP-MTR-COOL-TEM", "Sensor de Temperatura Agua", [
          ["SEN-TEM-CAT", "Sensor Temperatura CAT (OEM)", "oem"],
          ["SEN-TEM-ALT", "Sensor Temperatura Alternativo", "alternativo"],
        ]),
        inst("PROP-MTR-COOL-PRE", "Sensor de Presión Agua", [
          ["SEN-PRE-CAT", "Sensor Presión CAT (OEM)", "oem"],
          ["SEN-PRE-ALT", "Sensor Presión Alternativo", "alternativo"],
        ]),
        comp("PROP-MTR-COOL-MNG", "Mangueras de Agua", [
          ["MNG-25-CAT", "Manguera 25mm CAT (OEM)", "oem"],
          ["MNG-25-ALT", "Manguera 25mm Alternativa", "alternativo"],
          ["MNG-25-GEN", "Manguera 25mm Genérica", "generico"],
        ]),
      ],
    },
    // ── 4. Combustible (10) ──
    {
      cod: "PROP-MTR-FUEL", nom: "Sistema de Combustible", crit: "A", tipo: "subsistema",
      hijos: [
        comp("PROP-MTR-FUEL-BMP", "Bomba de Combustible Principal", [
          ["BMP-500-CAT", "Bomba Combustible 50mm CAT (OEM)", "oem"],
          ["BMP-500-SKF", "Bomba Combustible 50mm SKF (alternativo)", "alternativo"],
          ["BRG-6315-ZZ", "Rodamiento 6315-ZZ (2x)", "generico"],
        ]),
        comp("PROP-MTR-FUEL-BMA", "Bomba de Combustible Auxiliar", [
          ["BMA-500-CAT", "Bomba Combustible Auxiliar CAT (OEM)", "oem"],
          ["BMA-500-ALT", "Bomba Combustible Auxiliar Alternativa", "alternativo"],
        ]),
        comp("PROP-MTR-FUEL-FT1", "Filtro de Combustible 10µm", [
          ["FT1-10-CAT", "Filtro 10µm CAT (OEM)", "oem"],
          ["FT1-10-DON", "Filtro 10µm Donaldson", "alternativo"],
          ["FT1-10-GEN", "Filtro 10µm Genérico", "generico"],
        ]),
        comp("PROP-MTR-FUEL-FT2", "Filtro de Combustible 40µm", [
          ["FT2-40-CAT", "Filtro 40µm CAT (OEM)", "oem"],
          ["FT2-40-DON", "Filtro 40µm Donaldson", "alternativo"],
          ["FT2-40-GEN", "Filtro 40µm Genérico", "generico"],
        ]),
        comp("PROP-MTR-FUEL-INY", "Inyectores (6 unidades)", [
          ["INY-3406-CAT", "Inyectores CAT 3406 (kit 6)", "oem"],
          ["INY-3406-ALT", "Inyectores Alternativos (kit 6)", "alternativo"],
        ]),
        comp("PROP-MTR-FUEL-TNK", "Tanque de Combustible", [
          ["TNK-5000L-INOX", "Tanque 5000L Inox (OEM)", "oem"],
          ["JD-TNK-001", "Junta Tanque (kit)", "generico"],
        ]),
        comp("PROP-MTR-FUEL-VLP", "Válvula de Combustible Principal", [
          ["VLP-3406-CAT", "Válvula Combustible CAT (OEM)", "oem"],
          ["VLP-3406-ALT", "Válvula Combustible Alternativa", "alternativo"],
        ]),
        comp("PROP-MTR-FUEL-VLS", "Válvula de Seguridad Combustible", [
          ["VLS-3406-CAT", "Válvula Seguridad CAT (OEM)", "oem"],
        ]),
        inst("PROP-MTR-FUEL-PRE", "Sensor de Presión Combustible", [
          ["SEN-PRE-CAT", "Sensor Presión CAT (OEM)", "oem"],
          ["SEN-PRE-ALT", "Sensor Presión Alternativo", "alternativo"],
        ]),
        comp("PROP-MTR-FUEL-MNG", "Mangueras de Combustible", [
          ["MNG-50-CAT", "Manguera 50mm CAT (OEM)", "oem"],
          ["MNG-50-ALT", "Manguera 50mm Alternativa", "alternativo"],
          ["MNG-50-GEN", "Manguera 50mm Genérica", "generico"],
        ]),
      ],
    },
    // ── 5. Turbina / Compresor (6) ──
    {
      cod: "PROP-MTR-TUR", nom: "Sistema de Turbina/Compresor", crit: "A", tipo: "subsistema",
      hijos: [
        comp("PROP-MTR-TUR-TUR", "Turbina Principal", [
          ["TUR-3406-CAT", "Turbina CAT 3406 (OEM)", "oem"],
          ["TUR-3406-ALT", "Turbina Alternativa", "alternativo"],
        ]),
        comp("PROP-MTR-TUR-CMP", "Compresor de Aire", [
          ["CMP-3406-CAT", "Compresor CAT (OEM)", "oem"],
          ["CMP-3406-ALT", "Compresor Alternativo", "alternativo"],
        ]),
        comp("PROP-MTR-TUR-BRG", "Rodamiento Turbina", [
          ["BRG-6315-ZZ-FAG", "Rodamiento 6315-ZZ FAG (OEM)", "oem"],
          ["BRG-6315-ZZ-SKF", "Rodamiento 6315-ZZ SKF (alternativo)", "alternativo"],
          ["BRG-6315-C3-SKF", "Rodamiento 6315 C3 SKF (premium)", "generico"],
        ]),
        comp("PROP-MTR-TUR-SEL", "Sello Mecánico Turbina", [
          ["SEL-3406-CAT", "Sello CAT (OEM)", "oem"],
          ["SEL-3406-ALT", "Sello Alternativo", "alternativo"],
          ["KIT-SEL-001", "Kit Sellado (3 piezas)", "generico"],
        ]),
        inst("PROP-MTR-TUR-VIB", "Sensor de Vibración Turbina", [
          ["VIB-CAT", "Sensor Vibración CAT (OEM)", "oem"],
          ["VIB-ALT", "Sensor Vibración Alternativo", "alternativo"],
        ]),
        inst("PROP-MTR-TUR-TEM", "Sensor de Temperatura Turbina", [
          ["SEN-TEM-CAT", "Sensor Temperatura CAT (OEM)", "oem"],
          ["SEN-TEM-ALT", "Sensor Temperatura Alternativo", "alternativo"],
        ]),
      ],
    },
    // ── 6. Arranque (6) ──
    {
      cod: "PROP-MTR-START", nom: "Sistema de Arranque", crit: "A", tipo: "subsistema",
      hijos: [
        comp("PROP-MTR-START-MTR", "Motor de Arranque Principal", [
          ["MTR-START-CAT", "Motor Arranque CAT (OEM)", "oem"],
          ["MTR-START-ALT", "Motor Arranque Alternativo", "alternativo"],
        ]),
        comp("PROP-MTR-START-AMA", "Motor de Arranque Auxiliar", [
          ["AMA-START-CAT", "Motor Arranque Auxiliar CAT (OEM)", "oem"],
          ["AMA-START-ALT", "Motor Arranque Auxiliar Alternativo", "alternativo"],
        ]),
        comp("PROP-MTR-START-BAT", "Baterías (4 unidades)", [
          ["BAT-12V-100AH-CAT", "Batería 12V 100Ah CAT (OEM)", "oem"],
          ["BAT-12V-100AH-MAT", "Batería 12V 100Ah Matin", "alternativo"],
          ["BAT-12V-100AH-GEN", "Batería 12V 100Ah Genérica", "generico"],
        ]),
        comp("PROP-MTR-START-CHR", "Cargador de Baterías", [
          ["CHR-CAT", "Cargador CAT (OEM)", "oem"],
          ["CHR-ALT", "Cargador Alternativo", "alternativo"],
        ]),
        comp("PROP-MTR-START-INT", "Interruptor de Arranque", [
          ["INT-START-CAT", "Interruptor CAT (OEM)", "oem"],
          ["INT-START-ALT", "Interruptor Alternativo", "alternativo"],
        ]),
        comp("PROP-MTR-START-CAB", "Cable de Arranque", [
          ["CAB-50-CAT", "Cable 50mm CAT (OEM)", "oem"],
          ["CAB-50-ALT", "Cable 50mm Alternativo", "alternativo"],
          ["CAB-50-GEN", "Cable 50mm Genérico", "generico"],
        ]),
      ],
    },
    // ── 7. Control / Electrónica (8) ──
    {
      cod: "PROP-MTR-CTRL", nom: "Sistema de Control/Electrónica", crit: "A", tipo: "subsistema",
      hijos: [
        comp("PROP-MTR-CTRL-ECU", "Controlador Principal (ECU)", [
          ["ECU-3406-CAT", "ECU CAT 3406 (OEM)", "oem"],
          ["ECU-3406-ALT", "ECU Alternativa", "alternativo"],
        ]),
        comp("PROP-MTR-CTRL-PNL", "Panel de Control", [
          ["PNL-CAT", "Panel CAT (OEM)", "oem"],
          ["PNL-ALT", "Panel Alternativo", "alternativo"],
        ]),
        inst("PROP-MTR-CTRL-RPM", "Sensor de RPM", [
          ["RPM-CAT", "Sensor RPM CAT (OEM)", "oem"],
          ["RPM-ALT", "Sensor RPM Alternativo", "alternativo"],
        ]),
        inst("PROP-MTR-CTRL-TOA", "Sensor de Temperatura Aceite", [
          ["TOA-CAT", "Sensor Temp. Aceite CAT (OEM)", "oem"],
          ["TOA-ALT", "Sensor Temp. Aceite Alternativo", "alternativo"],
        ]),
        inst("PROP-MTR-CTRL-TWA", "Sensor de Temperatura Agua", [
          ["TWA-CAT", "Sensor Temp. Agua CAT (OEM)", "oem"],
          ["TWA-ALT", "Sensor Temp. Agua Alternativo", "alternativo"],
        ]),
        inst("PROP-MTR-CTRL-POA", "Sensor de Presión Aceite", [
          ["POA-CAT", "Sensor Presión Aceite CAT (OEM)", "oem"],
          ["POA-ALT", "Sensor Presión Aceite Alternativo", "alternativo"],
        ]),
        inst("PROP-MTR-CTRL-PFU", "Sensor de Presión Combustible", [
          ["PFU-CAT", "Sensor Presión Comb. CAT (OEM)", "oem"],
          ["PFU-ALT", "Sensor Presión Comb. Alternativo", "alternativo"],
        ]),
        comp("PROP-MTR-CTRL-CAB", "Cableado Electrónico", [
          ["CAB-ELEC-CAT", "Cableado CAT (OEM)", "oem"],
          ["CAB-ELEC-ALT", "Cableado Alternativo", "alternativo"],
          ["CAB-ELEC-GEN", "Cableado Genérico", "generico"],
        ]),
      ],
    },
  ],
};

// ============================================================
//  MOTOR GENERADOR — 7 subsistemas · 30 componentes
//  (subárbol de GEN → GEN-MTR)
// ============================================================
const MOTOR_GENERADOR = {
  cod: "GEN-MTR", nom: "Motor Generador", crit: "A", tipo: "subsistema", mtbf: 18000,
  hijos: [
    // ── 1. Motor Principal del generador (6, versión simplificada) ──
    {
      cod: "GEN-MTR-MTR", nom: "Motor Principal (Generador)", crit: "A", tipo: "subsistema",
      hijos: [
        comp("GEN-MTR-MTR-CYL", "Cilindro Principal"),
        comp("GEN-MTR-MTR-PIS", "Pistón Principal"),
        comp("GEN-MTR-MTR-SEG", "Segmentos (Piston Rings)"),
        comp("GEN-MTR-MTR-VIN", "Válvula de Entrada"),
        comp("GEN-MTR-MTR-VES", "Válvula de Escape"),
        comp("GEN-MTR-MTR-BRG", "Rodamiento Motor", [
          ["BRG-6312-ZZ", "Rodamiento 6312-ZZ", "generico"],
        ]),
      ],
    },
    // ── 2. Alternador (6) ──
    {
      cod: "GEN-MTR-ALT", nom: "Alternador", crit: "A", tipo: "subsistema",
      hijos: [
        comp("GEN-MTR-ALT-ALT", "Alternador Principal", [
          ["ALT-220V-CAT", "Alternador 220V CAT (OEM)", "oem"],
          ["ALT-220V-SKF", "Alternador 220V SKF (alternativo)", "alternativo"],
          ["ALT-220V-GEN", "Alternador 220V Genérico", "generico"],
        ]),
        comp("GEN-MTR-ALT-BRG", "Rodamiento Alternador", [
          ["BRG-6312-ZZ-FAG", "Rodamiento 6312-ZZ FAG (OEM)", "oem"],
          ["BRG-6312-ZZ-SKF", "Rodamiento 6312-ZZ SKF (alternativo)", "alternativo"],
          ["BRG-6312-C3-SKF", "Rodamiento 6312 C3 SKF (premium)", "generico"],
        ]),
        comp("GEN-MTR-ALT-REG", "Regulador de Voltaje", [
          ["REG-220V-CAT", "Regulador 220V CAT (OEM)", "oem"],
          ["REG-220V-ALT", "Regulador 220V Alternativo", "alternativo"],
        ]),
        inst("GEN-MTR-ALT-VOL", "Sensor de Voltaje", [
          ["VOL-CAT", "Sensor Voltaje CAT (OEM)", "oem"],
          ["VOL-ALT", "Sensor Voltaje Alternativo", "alternativo"],
        ]),
        inst("GEN-MTR-ALT-FRE", "Sensor de Frecuencia", [
          ["FRE-CAT", "Sensor Frecuencia CAT (OEM)", "oem"],
          ["FRE-ALT", "Sensor Frecuencia Alternativo", "alternativo"],
        ]),
        comp("GEN-MTR-ALT-CAS", "Carcasa Alternador", [
          ["CAS-ALT-CAT", "Carcasa CAT (OEM)", "oem"],
          ["CAS-ALT-ALT", "Carcasa Alternativa", "alternativo"],
        ]),
      ],
    },
    // ── 3. Lubricación (4) ──
    {
      cod: "GEN-MTR-LUB", nom: "Sistema de Lubricación", crit: "A", tipo: "subsistema",
      hijos: [
        comp("GEN-MTR-LUB-BMP", "Bomba de Aceite", [
          ["BMP-GEN-CAT", "Bomba Aceite Generador CAT (OEM)", "oem"],
          ["BMP-GEN-ALT", "Bomba Aceite Generador Alternativa", "alternativo"],
        ]),
        comp("GEN-MTR-LUB-FLT", "Filtro de Aceite", [
          ["FLT-200-CAT", "Filtro 200mm CAT (OEM)", "oem"],
          ["FLT-200-DON", "Filtro 200mm Donaldson", "alternativo"],
          ["FLT-200-GEN", "Filtro 200mm Genérico", "generico"],
        ]),
        comp("GEN-MTR-LUB-TNK", "Tanque de Aceite", [
          ["TNK-200L-INOX", "Tanque 200L Inox (OEM)", "oem"],
          ["JD-TNK-001", "Junta Tanque (kit)", "generico"],
        ]),
        inst("GEN-MTR-LUB-PRE", "Sensor de Presión Aceite", [
          ["SEN-PRE-CAT", "Sensor Presión CAT (OEM)", "oem"],
          ["SEN-PRE-ALT", "Sensor Presión Alternativo", "alternativo"],
        ]),
      ],
    },
    // ── 4. Enfriamiento (4) ──
    {
      cod: "GEN-MTR-COOL", nom: "Sistema de Enfriamiento", crit: "A", tipo: "subsistema",
      hijos: [
        comp("GEN-MTR-COOL-RAD", "Radiador", [
          ["RAD-GEN-CAT", "Radiador Generador CAT (OEM)", "oem"],
          ["RAD-GEN-ALT", "Radiador Generador Alternativo", "alternativo"],
        ]),
        comp("GEN-MTR-COOL-BMP", "Bomba de Agua", [
          ["BMP-GEN-AGUA-CAT", "Bomba Agua Generador CAT (OEM)", "oem"],
          ["BMP-GEN-AGUA-ALT", "Bomba Agua Generador Alternativa", "alternativo"],
        ]),
        inst("GEN-MTR-COOL-TEM", "Sensor de Temperatura", [
          ["SEN-TEM-CAT", "Sensor Temperatura CAT (OEM)", "oem"],
          ["SEN-TEM-ALT", "Sensor Temperatura Alternativo", "alternativo"],
        ]),
        comp("GEN-MTR-COOL-MNG", "Mangueras", [
          ["MNG-GEN-CAT", "Manguera Generador CAT (OEM)", "oem"],
          ["MNG-GEN-ALT", "Manguera Generador Alternativa", "alternativo"],
        ]),
      ],
    },
    // ── 5. Combustible (3) ──
    {
      cod: "GEN-MTR-FUEL", nom: "Sistema de Combustible", crit: "A", tipo: "subsistema",
      hijos: [
        comp("GEN-MTR-FUEL-BMP", "Bomba de Combustible", [
          ["BMP-GEN-COMB-CAT", "Bomba Combustible Generador CAT (OEM)", "oem"],
          ["BMP-GEN-COMB-ALT", "Bomba Combustible Generador Alternativa", "alternativo"],
        ]),
        comp("GEN-MTR-FUEL-FLT", "Filtro de Combustible", [
          ["FLT-GEN-CAT", "Filtro Combustible Generador CAT (OEM)", "oem"],
          ["FLT-GEN-DON", "Filtro Combustible Generador Donaldson", "alternativo"],
          ["FLT-GEN-GEN", "Filtro Combustible Generador Genérico", "generico"],
        ]),
        comp("GEN-MTR-FUEL-INY", "Inyectores", [
          ["INY-GEN-CAT", "Inyectores Generador CAT (OEM)", "oem"],
          ["INY-GEN-ALT", "Inyectores Generador Alternativos", "alternativo"],
        ]),
      ],
    },
    // ── 6. Control / Electrónica (4) ──
    {
      cod: "GEN-MTR-CTRL", nom: "Sistema de Control/Electrónica", crit: "A", tipo: "subsistema",
      hijos: [
        comp("GEN-MTR-CTRL-ECU", "Controlador Principal", [
          ["ECU-GEN-CAT", "ECU Generador CAT (OEM)", "oem"],
          ["ECU-GEN-ALT", "ECU Generador Alternativa", "alternativo"],
        ]),
        comp("GEN-MTR-CTRL-PNL", "Panel de Control", [
          ["PNL-GEN-CAT", "Panel Generador CAT (OEM)", "oem"],
          ["PNL-GEN-ALT", "Panel Generador Alternativo", "alternativo"],
        ]),
        inst("GEN-MTR-CTRL-VOL", "Sensor de Voltaje", [
          ["VOL-CAT", "Sensor Voltaje CAT (OEM)", "oem"],
          ["VOL-ALT", "Sensor Voltaje Alternativo", "alternativo"],
        ]),
        comp("GEN-MTR-CTRL-CAB", "Cableado Electrónico", [
          ["CAB-GEN-CAT", "Cableado Generador CAT (OEM)", "oem"],
          ["CAB-GEN-ALT", "Cableado Generador Alternativo", "alternativo"],
        ]),
      ],
    },
    // ── 7. Arranque (3) ──
    {
      cod: "GEN-MTR-START", nom: "Sistema de Arranque", crit: "A", tipo: "subsistema",
      hijos: [
        comp("GEN-MTR-START-MTR", "Motor de Arranque", [
          ["MTR-START-CAT", "Motor Arranque CAT (OEM)", "oem"],
          ["MTR-START-ALT", "Motor Arranque Alternativo", "alternativo"],
        ]),
        comp("GEN-MTR-START-BAT", "Baterías (2 unidades)", [
          ["BAT-12V-100AH-CAT", "Batería 12V 100Ah CAT (OEM)", "oem"],
          ["BAT-12V-100AH-MAT", "Batería 12V 100Ah Matin", "alternativo"],
          ["BAT-12V-100AH-GEN", "Batería 12V 100Ah Genérica", "generico"],
        ]),
        comp("GEN-MTR-START-CHR", "Cargador de Baterías", [
          ["CHR-CAT", "Cargador CAT (OEM)", "oem"],
          ["CHR-ALT", "Cargador Alternativo", "alternativo"],
        ]),
      ],
    },
  ],
};

export const PLANTILLA_PESQUERA = [
  {
    cod: "PROP", nom: "Propulsión Principal", crit: "A", tipo: "sistema",
    hijos: [
      MOTOR_PRINCIPAL,
      { cod: "PROP-RED", nom: "Reductora",        crit: "A", tipo: "subsistema" },
      { cod: "PROP-EJE", nom: "Eje y Bocina",     crit: "A", tipo: "subsistema" },
      { cod: "PROP-HEL", nom: "Hélice",           crit: "A", tipo: "subsistema" },
      { cod: "PROP-TIM", nom: "Timón y Gobierno", crit: "A", tipo: "subsistema" },
    ],
  },
  {
    cod: "GEN", nom: "Generadores Electricidad", crit: "A", tipo: "sistema",
    hijos: [
      MOTOR_GENERADOR,
      { cod: "GEN-EMG", nom: "Generador de Emergencia", crit: "A", tipo: "subsistema" },
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

// Cuenta total de NODOS DE EQUIPOS de la plantilla (recursivo).
export function contarNodosPlantilla() {
  const contar = (nodos) => (nodos || []).reduce((s, n) => s + 1 + contar(n.hijos), 0);
  return contar(PLANTILLA_PESQUERA);
}

// Cuenta total de REPUESTOS (SKU) declarados en la plantilla (recursivo).
// Nota: el mismo SKU puede repetirse en varios componentes; en la base se
// crea una sola vez (find-or-create por código) y se enlaza a cada componente.
export function contarRepuestosPlantilla() {
  const contar = (nodos) => (nodos || []).reduce(
    (s, n) => s + (n.rep ? n.rep.length : 0) + contar(n.hijos), 0);
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

// Metadatos de tipo de repuesto (intercambiabilidad)
export const TIPO_REPUESTO_META = {
  oem:         { label: "OEM",       tone: "green",  desc: "Original del fabricante" },
  alternativo: { label: "Alt.",      tone: "yellow", desc: "Equivalente alternativo" },
  generico:    { label: "Genérico",  tone: "slate",  desc: "Genérico certificado" },
};
