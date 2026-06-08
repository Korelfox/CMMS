// ============================================================
//  Plantilla de jerarquía estándar para nave pesquera
//  Basada en ISO 14224 (taxonomía de combustion engines) +
//  práctica de sala de máquinas marina (CAT / Cummins / MAN /
//  SERTICA) y best practices CMMS (SAP EAM, IBM Maximo).
//
//  Profundidad variable (hasta 6 niveles funcionales):
//    Sistema → Subsistema → Sub-subsistema → Componente
//  Los REPUESTOS (nivel 6 / SKU) NO son nodos de equipos: se
//  crean como inventario_items ligados al componente, con
//  intercambiabilidad OEM / Alternativo / Genérico.
//
//  Estructura de cada nodo:
//    cod    → código estructurado, ruta completa (id_visible sin el prefijo de nave)
//    nom    → nombre legible
//    crit   → criticidad A | B | C
//    tipo   → tipo_nodo: sistema | subsistema | componente | instrumento
//    mtbf   → MTBF objetivo en horas (opcional)
//    rep    → repuestos del componente: [ [sku, descripcion, tipo], ... ]
//             tipo de repuesto: oem | alternativo | generico
//    pm     → planes preventivos precargados: [ [descripcion, intervalo_horas], ... ]
//    basico → true = componente esencial (se carga en modo Básico);
//             false = componente avanzado / de overhaul (solo modo Completo)
//    hijos  → array de subnodos (opcional)
// ============================================================

// ── Helpers de construcción ──
// Componente: opts = { rep, pm, basico, crit }. `basico` por defecto true
// (esencial); marca `basico:false` los ítems de overhaul / mecánica profunda.
const comp = (cod, nom, { rep = [], pm = [], basico = true, crit = "A" } = {}) =>
  ({ cod, nom, crit, tipo: "componente", rep, pm, basico });
// Instrumento (sensor / medidor): mismo contrato que comp.
const inst = (cod, nom, opts = {}) => ({ ...comp(cod, nom, opts), tipo: "instrumento" });

// ============================================================
//  MOTOR DIÉSEL MARINO — taxonomía de 10 subsistemas (ISO 14224)
//  Refrigeración en DOS circuitos (agua dulce + agua de mar),
//  admisión con aftercooler y escape húmedo, propios del marino.
//  Usado por Motor Principal (PROP-MTR) y, en versión liviana,
//  por el Motor del Generador (GEN-MTR).
// ============================================================
const MOTOR_PRINCIPAL = {
  cod: "PROP-MTR", nom: "Motor Principal", crit: "A", tipo: "subsistema", mtbf: 12000,
  hijos: [
    // ── 1. Bloque y Tren Alternativo (mecánica base · overhaul) ──
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
        ] }),
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
          pm: [["Revisión y calce de válvulas", 2000]] }),
        comp("PROP-MTR-CUL-BAL", "Balancines y Empujadores", { basico: false, rep: [
          ["BAL-3406-CAT", "Balancines CAT (kit OEM)", "oem"],
        ] }),
        comp("PROP-MTR-CUL-LEV", "Árbol de Levas", { basico: false, rep: [
          ["LEV-3406-CAT", "Árbol de Levas CAT (OEM)", "oem"],
        ] }),
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
          pm: [["Cambio de aceite de motor", 250], ["Cambio de filtro de aceite", 250], ["Análisis de aceite (muestra a laboratorio)", 1000]] }),
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
          pm: [["Inspección visual / por condición", 1000]] }),
        inst("PROP-MTR-LUB-SEN", "Sensor de Presión / Temperatura Aceite", {
          rep: [
            ["SEN-PRE-CAT", "Sensor Presión Aceite CAT (OEM)", "oem"],
            ["SEN-TEM-CAT", "Sensor Temperatura Aceite CAT (OEM)", "oem"],
          ],
          pm: [["Calibración de sensores / instrumentos", 4000]] }),
      ],
    },
    // ── 4. Refrigeración – Agua Dulce (circuito cerrado / jacket water) ──
    {
      cod: "PROP-MTR-FW", nom: "Refrigeración – Agua Dulce", crit: "A", tipo: "subsistema",
      hijos: [
        comp("PROP-MTR-FW-BMP", "Bomba de Agua Dulce", {
          rep: [
            ["BMP-AD-CAT", "Bomba Agua Dulce CAT (OEM)", "oem"],
            ["BMP-AD-SKF", "Bomba Agua Dulce SKF (alternativo)", "alternativo"],
            ["BRG-6312-ZZ", "Rodamiento 6312-ZZ", "generico"],
          ],
          pm: [["Engrase / lubricación general", 2000]] }),
        comp("PROP-MTR-FW-TER", "Termostato", {
          rep: [
            ["TER-CAT", "Termostato CAT (OEM)", "oem"],
            ["TER-GEN", "Termostato Genérico", "generico"],
          ],
          pm: [["Inspección visual / por condición", 2000]] }),
        comp("PROP-MTR-FW-INT", "Intercambiador de Calor", { basico: false,
          rep: [
            ["INT-CAL-CAT", "Intercambiador CAT (OEM)", "oem"],
            ["INT-CAL-ALT", "Intercambiador Alternativo", "alternativo"],
            ["KIT-JD-INT", "Kit Juntas Intercambiador", "generico"],
          ],
          pm: [["Limpieza de radiador / intercambiador de calor", 4000]] }),
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
        inst("PROP-MTR-FW-SEN", "Sensor de Temperatura A.D.", { rep: [
          ["SEN-TEM-CAT", "Sensor Temperatura CAT (OEM)", "oem"],
          ["SEN-TEM-ALT", "Sensor Temperatura Alternativo", "alternativo"],
        ] }),
      ],
    },
    // ── 5. Refrigeración – Agua de Mar (circuito abierto / raw water) ──
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
          pm: [["Inspección visual / por condición", 250]] }),
        comp("PROP-MTR-SW-BMP", "Bomba de Agua de Mar (Impeller)", {
          rep: [
            ["IMP-AM-OEM", "Impeller Bomba Agua Mar (OEM)", "oem"],
            ["IMP-AM-ALT", "Impeller Alternativo", "alternativo"],
            ["KIT-SEL-AM", "Kit Sellos/Junta Bomba Agua Mar", "generico"],
          ],
          pm: [["Revisión de bomba de agua de mar (impeller)", 1000]] }),
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
    // ── 6. Combustible ──
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
          pm: [["Revisión / calibración de inyectores", 4000]] }),
        comp("PROP-MTR-FUEL-FT1", "Filtro Primario (separador Racor)", {
          rep: [
            ["FT1-RAC-OEM", "Elemento Racor Primario (OEM)", "oem"],
            ["FT1-RAC-DON", "Elemento Racor Donaldson", "alternativo"],
            ["FT1-RAC-GEN", "Elemento Racor Genérico", "generico"],
          ],
          pm: [["Cambio de filtros de combustible", 500]] }),
        comp("PROP-MTR-FUEL-FT2", "Filtro Secundario (fino)", {
          rep: [
            ["FT2-CAT", "Filtro Fino CAT (OEM)", "oem"],
            ["FT2-DON", "Filtro Fino Donaldson", "alternativo"],
            ["FT2-GEN", "Filtro Fino Genérico", "generico"],
          ],
          pm: [["Cambio de filtros de combustible", 500]] }),
        comp("PROP-MTR-FUEL-MNG", "Cañerías y Mangueras de Combustible", { basico: false, rep: [
          ["MNG-COMB-CAT", "Manguera Combustible CAT (OEM)", "oem"],
          ["MNG-COMB-ALT", "Manguera Combustible Alternativa", "alternativo"],
        ] }),
        inst("PROP-MTR-FUEL-SEN", "Sensor de Presión de Combustible", { rep: [
          ["SEN-PRE-COMB-CAT", "Sensor Presión Combustible CAT (OEM)", "oem"],
          ["SEN-PRE-COMB-ALT", "Sensor Presión Combustible Alternativo", "alternativo"],
        ] }),
      ],
    },
    // ── 7. Admisión y Sobrealimentación ──
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
          pm: [["Inspección de turbocompresor", 4000]] }),
        comp("PROP-MTR-AIR-ACC", "Enfriador de Aire de Carga (Aftercooler)", { basico: false,
          rep: [
            ["ACC-3406-CAT", "Aftercooler CAT (OEM)", "oem"],
            ["KIT-ORI-ACC", "Kit O-Rings Aftercooler", "generico"],
          ],
          pm: [["Limpieza de radiador / intercambiador de calor", 3000]] }),
        comp("PROP-MTR-AIR-MAN", "Múltiple de Admisión", { basico: false, rep: [
          ["JD-MAN-ADM", "Junta Múltiple Admisión (kit)", "generico"],
        ] }),
        inst("PROP-MTR-AIR-SEN", "Sensor de Presión de Sobrealimentación (Boost)", { rep: [
          ["SEN-BOOST-CAT", "Sensor Boost CAT (OEM)", "oem"],
          ["SEN-BOOST-ALT", "Sensor Boost Alternativo", "alternativo"],
        ] }),
      ],
    },
    // ── 8. Escape (húmedo / marino) ──
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
          pm: [["Inspección visual / por condición", 1000]] }),
        comp("PROP-MTR-EXH-FUE", "Fuelle / Junta de Expansión", { basico: false, rep: [
          ["FUE-ESC-OEM", "Fuelle de Escape (OEM)", "oem"],
        ] }),
        comp("PROP-MTR-EXH-SIL", "Silenciador", { basico: false, rep: [
          ["SIL-ESC-OEM", "Silenciador (OEM)", "oem"],
        ] }),
        inst("PROP-MTR-EXH-EGT", "Sensor de Temperatura de Gases (EGT)", {
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
    // ── 10. Control, Monitoreo y Seguridad ──
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
        inst("PROP-MTR-CTRL-RPM", "Sensor de RPM", { rep: [
          ["RPM-CAT", "Sensor RPM CAT (OEM)", "oem"],
          ["RPM-ALT", "Sensor RPM Alternativo", "alternativo"],
        ] }),
        comp("PROP-MTR-CTRL-SAF", "Paradas de Seguridad (sobrevel. / baja presión)", {
          rep: [["KIT-SAF-CAT", "Kit Paradas de Seguridad (OEM)", "oem"]],
          pm: [["Prueba de alarmas y paradas de seguridad", 1000]] }),
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
//  MOTOR GENERADOR — motor diésel marino (versión liviana) +
//  el alternador eléctrico. Mismos subsistemas marinos que el
//  principal pero con menos componentes (motor auxiliar).
// ============================================================
const MOTOR_GENERADOR = {
  cod: "GEN-MTR", nom: "Motor Generador", crit: "A", tipo: "subsistema", mtbf: 18000,
  hijos: [
    // ── 1. Bloque y Tren Alternativo ──
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
    // ── 2. Culata y Válvulas ──
    {
      cod: "GEN-MTR-CUL", nom: "Culata y Válvulas", crit: "A", tipo: "subsistema",
      hijos: [
        comp("GEN-MTR-CUL-CUL", "Culata (conjunto)", { basico: false, rep: [
          ["CUL-GEN-OEM", "Culata Generador (OEM)", "oem"],
          ["JD-CUL-GEN", "Junta de Culata Generador", "oem"],
        ] }),
        comp("GEN-MTR-CUL-VLV", "Tren de Válvulas", {
          rep: [["KIT-VLV-GEN", "Kit Válvulas/Guías/Muelles", "generico"]],
          pm: [["Revisión y calce de válvulas", 3000]] }),
      ],
    },
    // ── 3. Lubricación ──
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
          pm: [["Cambio de aceite de motor", 250], ["Cambio de filtro de aceite", 250]] }),
        comp("GEN-MTR-LUB-ENF", "Enfriador de Aceite", { basico: false,
          rep: [["ENF-GEN-OEM", "Enfriador Aceite Generador (OEM)", "oem"]],
          pm: [["Limpieza de radiador / intercambiador de calor", 4000]] }),
        inst("GEN-MTR-LUB-SEN", "Sensor de Presión de Aceite", { rep: [
          ["SEN-PRE-CAT", "Sensor Presión CAT (OEM)", "oem"],
          ["SEN-PRE-ALT", "Sensor Presión Alternativo", "alternativo"],
        ] }),
      ],
    },
    // ── 4. Refrigeración – Agua Dulce ──
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
        inst("GEN-MTR-FW-SEN", "Sensor de Temperatura A.D.", { rep: [
          ["SEN-TEM-CAT", "Sensor Temperatura CAT (OEM)", "oem"],
        ] }),
      ],
    },
    // ── 5. Refrigeración – Agua de Mar ──
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
          pm: [["Revisión de bomba de agua de mar (impeller)", 1000]] }),
        comp("GEN-MTR-SW-ANO", "Ánodos de Zinc", {
          rep: [["ANO-ZN-GEN", "Ánodo de Zinc Genérico", "generico"]],
          pm: [["Inspección de ánodos de sacrificio", 1000]] }),
      ],
    },
    // ── 6. Combustible ──
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
    // ── 7. Admisión y Escape ──
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
    // ── 8. Alternador (generador eléctrico) ──
    {
      cod: "GEN-MTR-ALT", nom: "Alternador", crit: "A", tipo: "subsistema",
      hijos: [
        comp("GEN-MTR-ALT-ALT", "Alternador Principal", { basico: false, rep: [
          ["ALT-220V-CAT", "Alternador 220V (OEM)", "oem"],
          ["ALT-220V-SKF", "Alternador 220V SKF (alternativo)", "alternativo"],
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
          ] }),
        inst("GEN-MTR-ALT-VOL", "Sensor de Voltaje / Frecuencia", {
          rep: [
            ["VOL-CAT", "Sensor Voltaje (OEM)", "oem"],
            ["FRE-CAT", "Sensor Frecuencia (OEM)", "oem"],
          ],
          pm: [["Calibración de sensores / instrumentos", 4000]] }),
      ],
    },
    // ── 9. Arranque ──
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
    // ── 10. Control y Seguridad ──
    {
      cod: "GEN-MTR-CTRL", nom: "Control y Seguridad", crit: "A", tipo: "subsistema",
      hijos: [
        comp("GEN-MTR-CTRL-ECU", "Controlador / Panel", { basico: false, rep: [
          ["ECU-GEN-CAT", "ECU/Panel Generador (OEM)", "oem"],
          ["ECU-GEN-ALT", "ECU/Panel Alternativo", "alternativo"],
        ] }),
        comp("GEN-MTR-CTRL-SAF", "Paradas de Seguridad", {
          rep: [["KIT-SAF-GEN", "Kit Paradas de Seguridad Generador (OEM)", "oem"]],
          pm: [["Prueba de alarmas y paradas de seguridad", 1000]] }),
        comp("GEN-MTR-CTRL-CAB", "Cableado Electrónico", { basico: false, rep: [
          ["CAB-GEN-CAT", "Cableado Generador (OEM)", "oem"],
          ["CAB-GEN-ALT", "Cableado Generador Alternativo", "alternativo"],
        ] }),
      ],
    },
  ],
};

// ============================================================
//  CENTRAL / GRUPO HIDRÁULICO (Hydraulic Power Unit · HPU)
//  Caso A: motor diésel DEDICADO que acciona la bomba hidráulica
//  (power pack). Unidad funcional propia — NO se cuelga del Sistema
//  Hidráulico — porque el motor es un accionador (prime mover) con
//  plan PM y modos de falla distintos a la bomba accionada.
// ============================================================
const CENTRAL_HIDRAULICA = {
  cod: "HPU", nom: "Central/Grupo Hidráulico", crit: "A", tipo: "sistema",
  hijos: [
    // ── 1. Motor Diésel (accionador / prime mover) ──
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
          pm: [["Revisión de bomba de agua de mar (impeller)", 1000], ["Limpieza de radiador / intercambiador de calor", 2000]] }),
        inst("HPU-MTR-SEN", "Sensores (presión / temperatura)", {
          rep: [
            ["SEN-PRE-HPU-OEM", "Sensor Presión Aceite HPU (OEM)", "oem"],
            ["SEN-TEM-HPU-OEM", "Sensor Temperatura HPU (OEM)", "oem"],
          ],
          pm: [["Prueba de alarmas y paradas de seguridad", 1000]] }),
      ],
    },
    // ── 2. Bomba Hidráulica (accionada) ──
    {
      cod: "HPU-BMB", nom: "Bomba Hidráulica (accionada)", crit: "A", tipo: "subsistema", mtbf: 12000,
      hijos: [
        comp("HPU-BMB-BMB", "Bomba Hidráulica Principal", { basico: false,
          rep: [
            ["BMB-HID-OEM", "Bomba Hidráulica (OEM)", "oem"],
            ["BMB-HID-ALT", "Bomba Hidráulica Alternativa", "alternativo"],
            ["KIT-REP-BMB-HID", "Kit de Reparación de Bomba", "generico"],
          ],
          pm: [["Análisis de aceite (muestra a laboratorio)", 500], ["Revisión de mangueras y presión hidráulica", 1000]] }),
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
    // ── 3. Estanque / Depósito de Aceite Hidráulico ──
    {
      cod: "HPU-TNK", nom: "Estanque / Depósito de Aceite", crit: "B", tipo: "subsistema",
      hijos: [
        comp("HPU-TNK-TNK", "Estanque Hidráulico", {
          rep: [
            ["ACE-HID-ISO46", "Aceite Hidráulico ISO VG 46 (tambor)", "generico"],
            ["JD-TNK-001", "Junta Tapa de Estanque (kit)", "generico"],
          ],
          pm: [["Cambio de aceite hidráulico", 2000]] }),
        comp("HPU-TNK-RES", "Respiradero / Breather", {
          rep: [
            ["BRE-HPU-OEM", "Respiradero con Filtro (OEM)", "oem"],
            ["BRE-HPU-GEN", "Respiradero Genérico", "generico"],
          ],
          pm: [["Inspección visual / por condición", 1000]] }),
        inst("HPU-TNK-NVL", "Indicador de Nivel / Temperatura", {
          rep: [["NVL-HPU-OEM", "Visor Nivel-Temperatura (OEM)", "oem"]],
          pm: [["Inspección visual / por condición", 2000]] }),
      ],
    },
    // ── 4. Válvulas y Manifold ──
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
    // ── 5. Filtros Hidráulicos ──
    {
      cod: "HPU-FLT", nom: "Filtros Hidráulicos", crit: "A", tipo: "subsistema",
      hijos: [
        comp("HPU-FLT-PRE", "Filtro de Presión", {
          rep: [
            ["FLT-PRE-HPU-OEM", "Filtro de Presión (OEM)", "oem"],
            ["FLT-PRE-HPU-PAR", "Filtro de Presión Parker", "alternativo"],
            ["FLT-PRE-HPU-GEN", "Filtro de Presión Genérico", "generico"],
          ],
          pm: [["Cambio de filtro hidráulico", 500]] }),
        comp("HPU-FLT-RET", "Filtro de Retorno", {
          rep: [
            ["FLT-RET-HPU-OEM", "Filtro de Retorno (OEM)", "oem"],
            ["FLT-RET-HPU-PAR", "Filtro de Retorno Parker", "alternativo"],
            ["FLT-RET-HPU-GEN", "Filtro de Retorno Genérico", "generico"],
          ],
          pm: [["Cambio de filtro hidráulico", 500]] }),
        comp("HPU-FLT-SUC", "Filtro de Succión (strainer)", {
          rep: [
            ["FLT-SUC-HPU-OEM", "Strainer de Succión (OEM)", "oem"],
            ["FLT-SUC-HPU-GEN", "Strainer Genérico", "generico"],
          ],
          pm: [["Limpieza de radiador / intercambiador de calor", 1000]] }),
      ],
    },
    // ── 6. Enfriador de Aceite Hidráulico ──
    comp("HPU-ENF", "Enfriador de Aceite Hidráulico", { crit: "B", basico: false,
      rep: [
        ["ENF-HPU-OEM", "Enfriador Hidráulico (OEM)", "oem"],
        ["ENF-HPU-ALT", "Enfriador Hidráulico Alternativo", "alternativo"],
      ],
      pm: [["Limpieza de radiador / intercambiador de calor", 1000]] }),
    // ── 7. Instrumentación ──
    inst("HPU-SEN-P", "Sensor de Presión Hidráulica", {
      rep: [
        ["SEN-PRE-HID-OEM", "Sensor Presión Hidráulica (OEM)", "oem"],
        ["SEN-PRE-HID-ALT", "Sensor Presión Hidráulica Alternativo", "alternativo"],
      ],
      pm: [["Calibración de sensores / instrumentos", 2000]] }),
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
  CENTRAL_HIDRAULICA,
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

// ── Predicado de inclusión por modo de precarga ──
// modo "completo" carga todo; modo "basico" omite los componentes hoja
// marcados basico:false (overhaul / mecánica profunda) y poda los
// subsistemas que queden sin descendientes incluidos.
export function nodoIncluido(nodo, modo = "completo") {
  if (modo === "completo") return true;
  const hijos = nodo.hijos || [];
  if (hijos.length === 0) return nodo.basico !== false; // hoja
  return hijos.some((h) => nodoIncluido(h, modo));      // estructural
}

// Cuenta total de NODOS DE EQUIPOS de la plantilla (recursivo), filtrable por modo.
export function contarNodosPlantilla(modo = "completo") {
  const contar = (nodos) => (nodos || []).reduce(
    (s, n) => nodoIncluido(n, modo) ? s + 1 + contar(n.hijos) : s, 0);
  return contar(PLANTILLA_PESQUERA);
}

// Cuenta total de REPUESTOS (SKU) declarados en la plantilla (recursivo), filtrable por modo.
// Nota: el mismo SKU puede repetirse en varios componentes; en la base se
// crea una sola vez (find-or-create por código) y se enlaza a cada componente.
export function contarRepuestosPlantilla(modo = "completo") {
  const contar = (nodos) => (nodos || []).reduce(
    (s, n) => nodoIncluido(n, modo) ? s + (n.rep ? n.rep.length : 0) + contar(n.hijos) : s, 0);
  return contar(PLANTILLA_PESQUERA);
}

// Cuenta total de PLANES PM precargados en la plantilla (recursivo), filtrable por modo.
export function contarPlanesPMPlantilla(modo = "completo") {
  const contar = (nodos) => (nodos || []).reduce(
    (s, n) => nodoIncluido(n, modo) ? s + (n.pm ? n.pm.length : 0) + contar(n.hijos) : s, 0);
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
