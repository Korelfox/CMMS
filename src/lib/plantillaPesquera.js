// ============================================================
//  Plantilla de jerarquÃ­a estÃ¡ndar para nave pesquera
//  Basada en ISO 14224 + SFI (grupos 61-67) + prÃ¡ctica de sala de
//  mÃ¡quinas marina (CAT / Cummins / MAN / SERTICA) y CMMS marino.
//
//  Formato del campo pm (planes preventivos precargados):
//    [descripcion, intervalo_horas]           â†’ disparador por horas
//    [descripcion, null, unidad_calendario]   â†’ disparador calendario
//      unidad_calendario: "diario"|"semanal"|"mensual"|"trimestral"|"semestral"|"anual"
//
//  Profundidad variable (hasta 6 niveles funcionales):
//    Sistema â†’ Subsistema â†’ Sub-subsistema â†’ Componente
//  Los REPUESTOS (nivel 6 / SKU) NO son nodos de equipos: se
//  crean como inventario_items ligados al componente.
//
//  Estructura de cada nodo:
//    cod    â†’ cÃ³digo estructurado, ruta completa
//    nom    â†’ nombre legible
//    crit   â†’ criticidad A | B | C
//    tipo   â†’ tipo_nodo: sistema | subsistema | componente | instrumento
//    mtbf   â†’ MTBF objetivo en horas (opcional)
//    rep    â†’ repuestos: [ [sku, descripcion, tipo], ... ]
//    pm     â†’ planes PM: [ [desc, horas] | [desc, null, unidad_cal] ]
//    basico â†’ true = esencial (modo BÃ¡sico); false = solo modo Completo
//    hijos  â†’ array de subnodos (opcional)
//    fuente â†’ cÃ³digo de otro nodo cuyas horas hereda (hermano, ej. PROP-MTR)
//    registro â†’ override explÃ­cito: horas | hereda_horas | fecha | mixto
//
//  Registro de vida (ver REGISTRO_VIDA / registroDesdeNodo):
//    horas        â†’ horÃ³metro propio (motores, compresores)
//    hereda_horas â†’ componentes acoplados a un punto de horas
//    fecha        â†’ instalaciÃ³n / certificaciÃ³n (casco, navegaciÃ³n)
//    mixto        â†’ horas + fecha de instalaciÃ³n (gobierno, virador)
// ============================================================

const comp = (cod, nom, { rep = [], pm = [], basico = true, crit = "A", param = null } = {}) =>
  ({ cod, nom, crit, tipo: "componente", rep, pm, basico, ...(param ? { param } : {}) });
const inst = (cod, nom, opts = {}) => ({ ...comp(cod, nom, opts), tipo: "instrumento" });

// â”€â”€ Umbrales de condiciÃ³n ISO 13374 / ISO 10816 / ISO 4413 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Cada constante es el valor de equipos.parametros_criticos (JSONB).
// Estructura: { tipo, parametro, unidad, min_alerta?, min_critico?, max_alerta?, max_critico?, norma }
// Valores de referencia para diesel marino; ajustar segÃºn motor especÃ­fico en Ficha tÃ©cnica.
const PM_ACEITE = [
  { tipo: "presion",     parametro: "PresiÃ³n de Aceite",     unidad: "bar", min_alerta: 2.0, min_critico: 1.5, norma: "ISO 13374" },
  { tipo: "temperatura", parametro: "Temperatura de Aceite", unidad: "Â°C",  max_alerta: 105, max_critico: 110, norma: "ISO 13374" },
];
const PM_ACE_SIMPLE = [
  { tipo: "presion", parametro: "PresiÃ³n de Aceite", unidad: "bar", min_alerta: 2.0, min_critico: 1.5, norma: "ISO 13374" },
];
const PM_REFRIG = [
  { tipo: "temperatura", parametro: "Temperatura Refrigerante", unidad: "Â°C", max_alerta: 90, max_critico: 95, norma: "ISO 13374" },
];
const PM_EGT = [
  { tipo: "temperatura", parametro: "Temperatura Escape (EGT)", unidad: "Â°C", max_alerta: 520, max_critico: 550, norma: "ISO 13374" },
];
const PM_BOOST = [
  { tipo: "presion", parametro: "PresiÃ³n SobrealimentaciÃ³n", unidad: "bar", min_alerta: 1.2, min_critico: 1.0, max_alerta: 2.2, max_critico: 2.5, norma: "ISO 13374" },
];
const PM_RPM_VIB = [
  { tipo: "velocidad",  parametro: "RPM Motor",             unidad: "rpm",  max_alerta: 2000, max_critico: 2200, norma: "ISO 3046"  },
  { tipo: "vibracion",  parametro: "VibraciÃ³n Carcasa RMS", unidad: "mm/s", max_alerta: 4.5,  max_critico: 7.1,  norma: "ISO 10816" },
];
const PM_FUEL_P = [
  { tipo: "presion", parametro: "PresiÃ³n Suministro Combustible", unidad: "bar", min_alerta: 2.0, min_critico: 1.5, norma: "ISO 13374" },
];
const PM_ACE_RED = [
  { tipo: "presion",     parametro: "PresiÃ³n Aceite Reductora",     unidad: "bar", min_alerta: 4.0, min_critico: 3.0, norma: "ISO 13374" },
  { tipo: "temperatura", parametro: "Temperatura Aceite Reductora", unidad: "Â°C",  max_alerta: 85,  max_critico: 95,  norma: "ISO 13374" },
];
const PM_VOLTAJE = [
  { tipo: "voltaje",    parametro: "Voltaje Alternador", unidad: "V",  min_alerta: 210, min_critico: 200, max_alerta: 235, max_critico: 245, norma: "IEC 60092" },
  { tipo: "frecuencia", parametro: "Frecuencia",         unidad: "Hz", min_alerta: 49,  min_critico: 48,  max_alerta: 51,  max_critico: 52,  norma: "IEC 60092" },
];
const PM_HID_P = [
  { tipo: "presion", parametro: "PresiÃ³n Sistema HidrÃ¡ulico", unidad: "bar", min_alerta: 160, min_critico: 140, max_alerta: 210, max_critico: 230, norma: "ISO 4413" },
];
const PM_HPU_MTR = [
  { tipo: "presion",     parametro: "PresiÃ³n Aceite Motor HPU", unidad: "bar", min_alerta: 2.0, min_critico: 1.5, norma: "ISO 13374" },
  { tipo: "temperatura", parametro: "Temperatura Motor HPU",    unidad: "Â°C",  max_alerta: 105, max_critico: 110, norma: "ISO 13374" },
];
const PM_RSW_T = [
  { tipo: "temperatura", parametro: "Temperatura Bodega RSW", unidad: "Â°C", max_alerta: 2, max_critico: 4, norma: "ISO 5552" },
];
const PM_VIVERO = [
  { tipo: "oxigeno",     parametro: "OxÃ­geno Disuelto",        unidad: "mg/L", min_alerta: 5.0, min_critico: 3.0, norma: "FAO" },
  { tipo: "temperatura", parametro: "Temperatura Agua Vivero", unidad: "Â°C",   max_alerta: 12,  max_critico: 15,  norma: "FAO" },
];
const PM_VIB = [
  { tipo: "vibracion", parametro: "VibraciÃ³n Carcasa RMS", unidad: "mm/s", max_alerta: 4.5, max_critico: 7.1, norma: "ISO 10816" },
];

// ============================================================
//  SFI 611 â€” MOTOR PRINCIPAL
// ============================================================
const MOTOR_PRINCIPAL = {
  cod: "PROP-MTR", nom: "Motor Principal", crit: "A", tipo: "subsistema", mtbf: 12000,
  hijos: [
    // â”€â”€ 1. Bloque y Tren Alternativo â”€â”€
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
          ["PIS-3406-CAT", "PistÃ³n CAT 3406 (OEM)", "oem"],
          ["PIS-3406-ALT", "PistÃ³n Alternativo (MarinePower)", "alternativo"],
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
        comp("PROP-MTR-BLK-CIG", "CigÃ¼eÃ±al", { basico: false, rep: [
          ["CIG-3406-CAT", "CigÃ¼eÃ±al CAT 3406 (OEM)", "oem"],
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
          pm: [["InspecciÃ³n visual / por condiciÃ³n", 6000]] }),
      ],
    },
    // â”€â”€ 2. Culata y DistribuciÃ³n â”€â”€
    {
      cod: "PROP-MTR-CUL", nom: "Culata y DistribuciÃ³n", crit: "A", tipo: "subsistema",
      hijos: [
        comp("PROP-MTR-CUL-CUL", "Culata (conjunto)", { basico: false, rep: [
          ["CUL-3406-CAT", "Culata CAT 3406 (OEM)", "oem"],
          ["JD-CUL-3406", "Junta de Culata (OEM)", "oem"],
          ["JD-CUL-ALT", "Junta de Culata (alternativo)", "alternativo"],
        ] }),
        comp("PROP-MTR-CUL-VLV", "Tren de VÃ¡lvulas (adm./escape, guÃ­as, muelles)", {
          rep: [
            ["VIN-3406-CAT", "VÃ¡lvula AdmisiÃ³n CAT (OEM)", "oem"],
            ["VES-3406-CAT", "VÃ¡lvula Escape CAT (OEM)", "oem"],
            ["KIT-VLV-3406", "Kit GuÃ­as y Muelles", "generico"],
          ],
          // SFI 611 PM-1000H + PM-2000H
          pm: [
            ["RevisiÃ³n y calce de vÃ¡lvulas", 1000],
            ["MediciÃ³n de compresiÃ³n de cilindros", 2000],
            ["BoroscopÃ­a de cilindros", 2000],
          ] }),
        comp("PROP-MTR-CUL-BAL", "Balancines y Empujadores", { basico: false, rep: [
          ["BAL-3406-CAT", "Balancines CAT (kit OEM)", "oem"],
        ] }),
        comp("PROP-MTR-CUL-LEV", "Ãrbol de Levas", { basico: false, rep: [
          ["LEV-3406-CAT", "Ãrbol de Levas CAT (OEM)", "oem"],
        ],
        // SFI 611 PM-2000H
        pm: [["InspecciÃ³n de Ã¡rbol de levas", 2000]] }),
        comp("PROP-MTR-CUL-DIS", "DistribuciÃ³n (engranajes / correa, tensor)", {
          rep: [
            ["COR-DIST-CAT", "Correa/Engranaje DistribuciÃ³n (OEM)", "oem"],
            ["TEN-DIST-CAT", "Tensor de DistribuciÃ³n", "alternativo"],
          ],
          pm: [["RevisiÃ³n de correas y tensores", 1000]] }),
      ],
    },
    // â”€â”€ 3. LubricaciÃ³n â”€â”€
    {
      cod: "PROP-MTR-LUB", nom: "Sistema de LubricaciÃ³n", crit: "A", tipo: "subsistema",
      hijos: [
        comp("PROP-MTR-LUB-BMP", "Bomba de Aceite", { basico: false, rep: [
          ["BMP-ACE-CAT", "Bomba Aceite CAT (OEM)", "oem"],
          ["BMP-ACE-SKF", "Bomba Aceite SKF (alternativo)", "alternativo"],
        ] }),
        comp("PROP-MTR-LUB-CAR", "CÃ¡rter (Sump)", { basico: false, rep: [
          ["CAR-3406-CAT", "CÃ¡rter CAT (OEM)", "oem"],
          ["JD-CAR-001", "Junta de CÃ¡rter (kit)", "generico"],
        ] }),
        comp("PROP-MTR-LUB-FLT", "Filtro de Aceite", {
          rep: [
            ["FLT-ACE-CAT", "Filtro Aceite CAT (OEM)", "oem"],
            ["FLT-ACE-DON", "Filtro Aceite Donaldson", "alternativo"],
            ["FLT-ACE-GEN", "Filtro Aceite GenÃ©rico Certificado", "generico"],
          ],
          // SFI 611 PM-250H
          pm: [
            ["Cambio de aceite de motor", 250],
            ["Cambio de filtro de aceite", 250],
            ["AnÃ¡lisis de aceite (muestra a laboratorio)", 1000],
          ] }),
        comp("PROP-MTR-LUB-ENF", "Enfriador de Aceite", { basico: false,
          rep: [
            ["ENF-ACE-CAT", "Enfriador Aceite CAT (OEM)", "oem"],
            ["ENF-ACE-ALT", "Enfriador Aceite Alternativo", "alternativo"],
          ],
          pm: [["Limpieza de radiador / intercambiador de calor", 4000]] }),
        comp("PROP-MTR-LUB-VAL", "VÃ¡lvula Reguladora / Seguridad", { basico: false, rep: [
          ["VAL-ACE-CAT", "VÃ¡lvula Aceite CAT (OEM)", "oem"],
        ] }),
        comp("PROP-MTR-LUB-BRE", "Respiradero del CÃ¡rter (Breather)", {
          rep: [
            ["BRE-CAT", "Respiradero CAT (OEM)", "oem"],
            ["BRE-GEN", "Respiradero GenÃ©rico", "generico"],
          ],
          // SFI 611 PM-250H limpieza respiradero
          pm: [
            ["Limpieza de compresor del turboalimentador", 250],
            ["InspecciÃ³n visual / por condiciÃ³n", 1000],
          ] }),
        inst("PROP-MTR-LUB-SEN", "Sensor de PresiÃ³n / Temperatura Aceite", {
          param: PM_ACEITE,
          rep: [
            ["SEN-PRE-CAT", "Sensor PresiÃ³n Aceite CAT (OEM)", "oem"],
            ["SEN-TEM-CAT", "Sensor Temperatura Aceite CAT (OEM)", "oem"],
          ],
          pm: [["CalibraciÃ³n de sensores / instrumentos", 4000]] }),
      ],
    },
    // â”€â”€ 4. RefrigeraciÃ³n â€“ Agua Dulce (SFI 632) â”€â”€
    {
      cod: "PROP-MTR-FW", nom: "RefrigeraciÃ³n â€“ Agua Dulce", crit: "A", tipo: "subsistema",
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
            ["Engrase / lubricaciÃ³n general", 2000],
          ] }),
        comp("PROP-MTR-FW-TER", "Termostato", {
          rep: [
            ["TER-CAT", "Termostato CAT (OEM)", "oem"],
            ["TER-GEN", "Termostato GenÃ©rico", "generico"],
          ],
          pm: [["InspecciÃ³n visual / por condiciÃ³n", 2000]] }),
        comp("PROP-MTR-FW-INT", "Intercambiador de Calor A.D.", { basico: false,
          rep: [
            ["INT-CAL-CAT", "Intercambiador CAT (OEM)", "oem"],
            ["INT-CAL-ALT", "Intercambiador Alternativo", "alternativo"],
            ["KIT-JD-INT", "Kit Juntas Intercambiador", "generico"],
          ],
          // SFI 632: Semanal glicol + mensual muestreo + 4000H cambio
          pm: [
            ["Verificar concentraciÃ³n de refrigerante (glicol)", null, "semanal"],
            ["Muestreo de refrigerante / anÃ¡lisis de laboratorio", null, "mensual"],
            ["Limpieza de radiador / intercambiador de calor", 1000],
            ["Cambio de refrigerante de agua dulce", 4000],
          ] }),
        comp("PROP-MTR-FW-EXP", "Tanque de ExpansiÃ³n", { basico: false, rep: [
          ["TAP-EXP-CAT", "Tapa Tanque ExpansiÃ³n (OEM)", "oem"],
          ["JD-EXP-001", "Junta Tanque ExpansiÃ³n", "generico"],
        ] }),
        comp("PROP-MTR-FW-MNG", "Mangueras y Abrazaderas A.D.", {
          rep: [
            ["MNG-AD-CAT", "Manguera Agua Dulce CAT (OEM)", "oem"],
            ["MNG-AD-GEN", "Manguera Agua Dulce GenÃ©rica", "generico"],
          ],
          pm: [["InspecciÃ³n visual / por condiciÃ³n", 2000]] }),
        inst("PROP-MTR-FW-SEN", "Sensor de Temperatura A.D.", { param: PM_REFRIG, rep: [
          ["SEN-TEM-CAT", "Sensor Temperatura CAT (OEM)", "oem"],
          ["SEN-TEM-ALT", "Sensor Temperatura Alternativo", "alternativo"],
        ] }),
      ],
    },
    // â”€â”€ 5. RefrigeraciÃ³n â€“ Agua de Mar (SFI 631) â”€â”€
    {
      cod: "PROP-MTR-SW", nom: "RefrigeraciÃ³n â€“ Agua de Mar", crit: "A", tipo: "subsistema",
      hijos: [
        comp("PROP-MTR-SW-TOM", "Toma de Mar (Sea Chest) y VÃ¡lvula", { basico: false, rep: [
          ["VAL-TOM-OEM", "VÃ¡lvula Toma de Mar (OEM)", "oem"],
          ["JD-TOM-001", "Junta Toma de Mar (kit)", "generico"],
        ] }),
        comp("PROP-MTR-SW-FIL", "Filtro / Strainer de Agua de Mar", {
          rep: [
            ["STR-AM-OEM", "Canasto Filtro Agua Mar (OEM)", "oem"],
            ["JD-STR-001", "Junta Filtro Agua Mar", "generico"],
          ],
          // SFI 631 Semanal limpieza strainer
          pm: [
            ["InspecciÃ³n visual / por condiciÃ³n", null, "semanal"],
            ["InspecciÃ³n visual / por condiciÃ³n", 250],
          ] }),
        comp("PROP-MTR-SW-BMP", "Bomba de Agua de Mar (Impeller)", {
          rep: [
            ["IMP-AM-OEM", "Impeller Bomba Agua Mar (OEM)", "oem"],
            ["IMP-AM-ALT", "Impeller Alternativo", "alternativo"],
            ["KIT-SEL-AM", "Kit Sellos/Junta Bomba Agua Mar", "generico"],
          ],
          // SFI 631: PM-500H cambio impulsor (Korelfox 500H vs anterior 1000H)
          pm: [
            ["RevisiÃ³n de bomba de agua de mar (impeller)", 500],
            ["Limpieza de radiador / intercambiador de calor", 1000],
            ["DesincrustaciÃ³n quÃ­mica de intercambiadores", 2000],
            ["Overhaul de bomba de agua de mar", 4000],
          ] }),
        comp("PROP-MTR-SW-ANO", "Ãnodos de Zinc del Motor", {
          rep: [
            ["ANO-ZN-OEM", "Ãnodo de Zinc Motor (OEM)", "oem"],
            ["ANO-ZN-GEN", "Ãnodo de Zinc GenÃ©rico", "generico"],
          ],
          pm: [["InspecciÃ³n de Ã¡nodos de sacrificio", 1000]] }),
        comp("PROP-MTR-SW-MNG", "Mangueras y LÃ­neas de Agua de Mar", {
          rep: [
            ["MNG-AM-OEM", "Manguera Agua Mar (OEM)", "oem"],
            ["MNG-AM-GEN", "Manguera Agua Mar GenÃ©rica", "generico"],
          ],
          pm: [["InspecciÃ³n visual / por condiciÃ³n", 2000]] }),
      ],
    },
    // â”€â”€ 6. Combustible (SFI 613) â”€â”€
    {
      cod: "PROP-MTR-FUEL", nom: "Sistema de Combustible", crit: "A", tipo: "subsistema",
      hijos: [
        comp("PROP-MTR-FUEL-BMP", "Bomba de AlimentaciÃ³n", { basico: false, rep: [
          ["BMP-COMB-CAT", "Bomba AlimentaciÃ³n CAT (OEM)", "oem"],
          ["BMP-COMB-ALT", "Bomba AlimentaciÃ³n Alternativa", "alternativo"],
        ] }),
        comp("PROP-MTR-FUEL-INJ", "Bomba de InyecciÃ³n / Common Rail", { basico: false,
          rep: [["BINJ-3406-CAT", "Bomba InyecciÃ³n CAT (OEM)", "oem"]],
          pm: [["RevisiÃ³n de bomba de inyecciÃ³n", 4000]] }),
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
            ["FT1-RAC-GEN", "Elemento Racor GenÃ©rico", "generico"],
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
            ["FT2-GEN", "Filtro Fino GenÃ©rico", "generico"],
          ],
          pm: [
            ["Cambio de filtros de combustible", 500],
            ["Limpieza de tanque diario de combustible", 2000],
          ] }),
        comp("PROP-MTR-FUEL-MNG", "CaÃ±erÃ­as y Mangueras de Combustible", { basico: false, rep: [
          ["MNG-COMB-CAT", "Manguera Combustible CAT (OEM)", "oem"],
          ["MNG-COMB-ALT", "Manguera Combustible Alternativa", "alternativo"],
        ],
        pm: [["InspecciÃ³n de lÃ­neas y mangueras de combustible", null, "semanal"]] }),
        inst("PROP-MTR-FUEL-SEN", "Sensor de PresiÃ³n de Combustible", { param: PM_FUEL_P, rep: [
          ["SEN-PRE-COMB-CAT", "Sensor PresiÃ³n Combustible CAT (OEM)", "oem"],
          ["SEN-PRE-COMB-ALT", "Sensor PresiÃ³n Combustible Alternativo", "alternativo"],
        ] }),
      ],
    },
    // â”€â”€ 7. AdmisiÃ³n y SobrealimentaciÃ³n (SFI 612 Turbo) â”€â”€
    {
      cod: "PROP-MTR-AIR", nom: "AdmisiÃ³n y SobrealimentaciÃ³n", crit: "A", tipo: "subsistema",
      hijos: [
        comp("PROP-MTR-AIR-FIL", "Filtro de Aire", {
          rep: [
            ["FIL-AIRE-CAT", "Filtro Aire CAT (OEM)", "oem"],
            ["FIL-AIRE-GEN", "Filtro Aire GenÃ©rico", "generico"],
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
            ["MediciÃ³n de holguras axiales del turbo", 1000],
            ["InspecciÃ³n de cojinetes del turboalimentador", 2000],
            ["Balanceo dinÃ¡mico del turboalimentador", 4000],
            ["Overhaul completo de turboalimentador", 8000],
          ] }),
        comp("PROP-MTR-AIR-ACC", "Enfriador de Aire de Carga (Aftercooler)", { basico: false,
          rep: [
            ["ACC-3406-CAT", "Aftercooler CAT (OEM)", "oem"],
            ["KIT-ORI-ACC", "Kit O-Rings Aftercooler", "generico"],
          ],
          // SFI 611 PM-500H limpieza intercooler (Korelfox: 500H vs anterior 3000H)
          pm: [["Limpieza de radiador / intercambiador de calor", 500]] }),
        comp("PROP-MTR-AIR-MAN", "MÃºltiple de AdmisiÃ³n", { basico: false, rep: [
          ["JD-MAN-ADM", "Junta MÃºltiple AdmisiÃ³n (kit)", "generico"],
        ] }),
        inst("PROP-MTR-AIR-SEN", "Sensor de PresiÃ³n de SobrealimentaciÃ³n (Boost)", { param: PM_BOOST, rep: [
          ["SEN-BOOST-CAT", "Sensor Boost CAT (OEM)", "oem"],
          ["SEN-BOOST-ALT", "Sensor Boost Alternativo", "alternativo"],
        ] }),
      ],
    },
    // â”€â”€ 8. Escape â”€â”€
    {
      cod: "PROP-MTR-EXH", nom: "Sistema de Escape", crit: "A", tipo: "subsistema",
      hijos: [
        comp("PROP-MTR-EXH-MAN", "MÃºltiple de Escape", { basico: false, rep: [
          ["MAN-ESC-CAT", "MÃºltiple Escape CAT (OEM)", "oem"],
          ["JD-MAN-ESC", "Junta MÃºltiple Escape (kit)", "generico"],
        ] }),
        comp("PROP-MTR-EXH-COD", "Codo de Escape HÃºmedo (Wet Elbow)", {
          rep: [
            ["COD-ESC-OEM", "Codo Escape HÃºmedo (OEM)", "oem"],
            ["COD-ESC-ALT", "Codo Escape HÃºmedo Alternativo", "alternativo"],
            ["JD-COD-001", "Junta Codo de Escape", "generico"],
          ],
          // SFI 611 semanal inspecciÃ³n escape
          pm: [
            ["InspecciÃ³n de sistema de escape", null, "semanal"],
            ["InspecciÃ³n visual / por condiciÃ³n", 1000],
          ] }),
        comp("PROP-MTR-EXH-FUE", "Fuelle / Junta de ExpansiÃ³n", { basico: false, rep: [
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
          pm: [["CalibraciÃ³n de sensores / instrumentos", 4000]] }),
      ],
    },
    // â”€â”€ 9. Arranque â”€â”€
    {
      cod: "PROP-MTR-START", nom: "Sistema de Arranque", crit: "A", tipo: "subsistema",
      hijos: [
        comp("PROP-MTR-START-MTR", "Motor de Arranque", { basico: false, rep: [
          ["MTR-START-CAT", "Motor Arranque CAT (OEM)", "oem"],
          ["MTR-START-ALT", "Motor Arranque Alternativo", "alternativo"],
          ["ESC-START-GEN", "Escobillas/Carbones (kit)", "generico"],
        ] }),
        comp("PROP-MTR-START-SOL", "Solenoide / RelÃ© de Arranque", {
          rep: [
            ["SOL-START-CAT", "Solenoide CAT (OEM)", "oem"],
            ["SOL-START-ALT", "Solenoide Alternativo", "alternativo"],
          ] }),
        comp("PROP-MTR-START-BAT", "BaterÃ­as de Arranque", {
          rep: [
            ["BAT-12V-100AH-CAT", "BaterÃ­a 12V 100Ah (OEM)", "oem"],
            ["BAT-12V-100AH-MAT", "BaterÃ­a 12V 100Ah Matin", "alternativo"],
            ["BAT-12V-100AH-GEN", "BaterÃ­a 12V 100Ah GenÃ©rica", "generico"],
          ],
          pm: [["RevisiÃ³n de banco de baterÃ­as", 500]] }),
        comp("PROP-MTR-START-CHR", "Cargador / Alternador de Carga", { basico: false, rep: [
          ["CHR-CAT", "Cargador/Alternador CAT (OEM)", "oem"],
          ["CHR-ALT", "Cargador/Alternador Alternativo", "alternativo"],
        ] }),
        comp("PROP-MTR-START-CAB", "Cables y Bornes de Arranque", {
          rep: [
            ["CAB-50-CAT", "Cable 50mm CAT (OEM)", "oem"],
            ["CAB-50-GEN", "Cable 50mm GenÃ©rico", "generico"],
          ],
          pm: [["InspecciÃ³n visual / por condiciÃ³n", 1000]] }),
      ],
    },
    // â”€â”€ 10. Control, Monitoreo y Seguridad (ronda diaria/semanal) â”€â”€
    {
      cod: "PROP-MTR-CTRL", nom: "Control, Monitoreo y Seguridad", crit: "A", tipo: "subsistema",
      hijos: [
        comp("PROP-MTR-CTRL-ECU", "Controlador (ECU / Governor)", { basico: false, rep: [
          ["ECU-3406-CAT", "ECU CAT 3406 (OEM)", "oem"],
          ["ECU-3406-ALT", "ECU Alternativa", "alternativo"],
        ] }),
        comp("PROP-MTR-CTRL-PNL", "Panel / TacÃ³metro", { basico: false, rep: [
          ["PNL-CAT", "Panel CAT (OEM)", "oem"],
          ["PNL-ALT", "Panel Alternativo", "alternativo"],
        ] }),
        inst("PROP-MTR-CTRL-RPM", "Sensor de RPM", { param: PM_RPM_VIB, rep: [
          ["RPM-CAT", "Sensor RPM CAT (OEM)", "oem"],
          ["RPM-ALT", "Sensor RPM Alternativo", "alternativo"],
        ] }),
        comp("PROP-MTR-CTRL-SAF", "Paradas de Seguridad (sobrevel. / baja presiÃ³n)", {
          rep: [["KIT-SAF-CAT", "Kit Paradas de Seguridad (OEM)", "oem"]],
          // SFI 611 PM-D-001 (diario) + PM-S-001 (semanal) + PM-1000H
          pm: [
            ["Verificar presiÃ³n y temperatura de operaciÃ³n (ronda)", null, "diario"],
            ["Verificar nivel de aceite en cÃ¡rter", null, "diario"],
            ["Verificar fugas (combustible, aceite, refrigerante)", null, "diario"],
            ["InspecciÃ³n visual de soportes y montajes", null, "semanal"],
            ["InspecciÃ³n de aislaciÃ³n tÃ©rmica", null, "semanal"],
            ["Prueba de alarmas y paradas de seguridad", 1000],
          ] }),
        comp("PROP-MTR-CTRL-CAB", "Cableado / ArnÃ©s ElectrÃ³nico", { basico: false, rep: [
          ["CAB-ELEC-CAT", "ArnÃ©s CAT (OEM)", "oem"],
          ["CAB-ELEC-ALT", "ArnÃ©s Alternativo", "alternativo"],
          ["CAB-ELEC-GEN", "Cableado GenÃ©rico", "generico"],
        ] }),
      ],
    },
  ],
};

// ============================================================
//  SFI 621 â€” MOTOR GENERADOR
// ============================================================
const MOTOR_GENERADOR = {
  cod: "GEN-MTR", nom: "Motor Generador", crit: "A", tipo: "subsistema", mtbf: 18000,
  hijos: [
    {
      cod: "GEN-MTR-BLK", nom: "Bloque y Tren Alternativo", crit: "A", tipo: "subsistema",
      hijos: [
        comp("GEN-MTR-BLK-PIS", "Pistones y Segmentos", { basico: false, rep: [
          ["PIS-GEN-OEM", "PistÃ³n Generador (OEM)", "oem"],
          ["SEG-GEN-OEM", "Segmentos Generador (kit)", "oem"],
        ] }),
        comp("GEN-MTR-BLK-CAM", "Camisas de Cilindro", { basico: false, rep: [
          ["CAM-GEN-OEM", "Camisa Generador (OEM)", "oem"],
          ["ORI-CAM-001", "O-Rings de Camisa (kit)", "generico"],
        ] }),
        comp("GEN-MTR-BLK-BIE", "Bielas y Cojinetes", { basico: false, rep: [
          ["COJ-BIE-GEN", "Cojinetes de Biela Generador (kit)", "oem"],
        ] }),
        comp("GEN-MTR-BLK-CIG", "CigÃ¼eÃ±al y Cojinetes de Bancada", { basico: false, rep: [
          ["CIG-GEN-OEM", "CigÃ¼eÃ±al Generador (OEM)", "oem"],
          ["COJ-BAN-GEN", "Cojinetes de Bancada (kit)", "oem"],
        ] }),
      ],
    },
    {
      cod: "GEN-MTR-CUL", nom: "Culata y VÃ¡lvulas", crit: "A", tipo: "subsistema",
      hijos: [
        comp("GEN-MTR-CUL-CUL", "Culata (conjunto)", { basico: false, rep: [
          ["CUL-GEN-OEM", "Culata Generador (OEM)", "oem"],
          ["JD-CUL-GEN", "Junta de Culata Generador", "oem"],
        ] }),
        comp("GEN-MTR-CUL-VLV", "Tren de VÃ¡lvulas", {
          rep: [["KIT-VLV-GEN", "Kit VÃ¡lvulas/GuÃ­as/Muelles", "generico"]],
          // SFI 621 PM-1000H (Korelfox: 1000H vs anterior 3000H)
          pm: [["RevisiÃ³n y calce de vÃ¡lvulas", 1000]] }),
      ],
    },
    {
      cod: "GEN-MTR-LUB", nom: "Sistema de LubricaciÃ³n", crit: "A", tipo: "subsistema",
      hijos: [
        comp("GEN-MTR-LUB-BMP", "Bomba de Aceite", { basico: false, rep: [
          ["BMP-GEN-CAT", "Bomba Aceite Generador (OEM)", "oem"],
        ] }),
        comp("GEN-MTR-LUB-FLT", "Filtro de Aceite", {
          rep: [
            ["FLT-GEN-CAT", "Filtro Aceite Generador (OEM)", "oem"],
            ["FLT-GEN-DON", "Filtro Aceite Donaldson", "alternativo"],
            ["FLT-GEN-GEN", "Filtro Aceite GenÃ©rico", "generico"],
          ],
          // SFI 621 PM-250H
          pm: [
            ["Cambio de aceite de motor", 250],
            ["Cambio de filtro de aceite", 250],
          ] }),
        comp("GEN-MTR-LUB-ENF", "Enfriador de Aceite", { basico: false,
          rep: [["ENF-GEN-OEM", "Enfriador Aceite Generador (OEM)", "oem"]],
          pm: [["Limpieza de radiador / intercambiador de calor", 4000]] }),
        inst("GEN-MTR-LUB-SEN", "Sensor de PresiÃ³n de Aceite", { param: PM_ACE_SIMPLE, rep: [
          ["SEN-PRE-CAT", "Sensor PresiÃ³n CAT (OEM)", "oem"],
          ["SEN-PRE-ALT", "Sensor PresiÃ³n Alternativo", "alternativo"],
        ] }),
      ],
    },
    {
      cod: "GEN-MTR-FW", nom: "RefrigeraciÃ³n â€“ Agua Dulce", crit: "A", tipo: "subsistema",
      hijos: [
        comp("GEN-MTR-FW-BMP", "Bomba de Agua Dulce", {
          rep: [["BMP-AD-GEN", "Bomba Agua Dulce Generador (OEM)", "oem"]],
          pm: [["Engrase / lubricaciÃ³n general", 2000]] }),
        comp("GEN-MTR-FW-TER", "Termostato", {
          rep: [["TER-GEN-OEM", "Termostato Generador (OEM)", "oem"]],
          pm: [["InspecciÃ³n visual / por condiciÃ³n", 2000]] }),
        comp("GEN-MTR-FW-INT", "Intercambiador de Calor", { basico: false,
          rep: [["INT-GEN-OEM", "Intercambiador Generador (OEM)", "oem"], ["KIT-JD-INT", "Kit Juntas Intercambiador", "generico"]],
          pm: [["Limpieza de radiador / intercambiador de calor", 4000]] }),
        inst("GEN-MTR-FW-SEN", "Sensor de Temperatura A.D.", { param: PM_REFRIG, rep: [
          ["SEN-TEM-CAT", "Sensor Temperatura CAT (OEM)", "oem"],
        ] }),
      ],
    },
    {
      cod: "GEN-MTR-SW", nom: "RefrigeraciÃ³n â€“ Agua de Mar", crit: "A", tipo: "subsistema",
      hijos: [
        comp("GEN-MTR-SW-FIL", "Filtro / Strainer de Agua de Mar", {
          rep: [["STR-AM-GEN", "Canasto Filtro Agua Mar Generador", "generico"]],
          pm: [["InspecciÃ³n visual / por condiciÃ³n", 250]] }),
        comp("GEN-MTR-SW-BMP", "Bomba de Agua de Mar (Impeller)", {
          rep: [
            ["IMP-AM-GEN-OEM", "Impeller Bomba Agua Mar Generador (OEM)", "oem"],
            ["IMP-AM-GEN-ALT", "Impeller Alternativo", "alternativo"],
          ],
          pm: [["RevisiÃ³n de bomba de agua de mar (impeller)", 500]] }),
        comp("GEN-MTR-SW-ANO", "Ãnodos de Zinc", {
          rep: [["ANO-ZN-GEN", "Ãnodo de Zinc GenÃ©rico", "generico"]],
          pm: [["InspecciÃ³n de Ã¡nodos de sacrificio", 1000]] }),
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
          pm: [["RevisiÃ³n / calibraciÃ³n de inyectores", 4000]] }),
        comp("GEN-MTR-FUEL-FLT", "Filtro de Combustible (separador Racor)", {
          rep: [
            ["FLT-COMB-GEN-CAT", "Filtro Combustible Generador (OEM)", "oem"],
            ["FLT-COMB-GEN-DON", "Filtro Combustible Donaldson", "alternativo"],
            ["FLT-COMB-GEN-GEN", "Filtro Combustible GenÃ©rico", "generico"],
          ],
          pm: [["Cambio de filtros de combustible", 500]] }),
        comp("GEN-MTR-FUEL-BMP", "Bomba de Combustible", { basico: false, rep: [
          ["BMP-COMB-GEN-OEM", "Bomba Combustible Generador (OEM)", "oem"],
        ] }),
      ],
    },
    {
      cod: "GEN-MTR-AEX", nom: "AdmisiÃ³n y Escape", crit: "A", tipo: "subsistema",
      hijos: [
        comp("GEN-MTR-AEX-FIL", "Filtro de Aire", {
          rep: [["FIL-AIRE-GEN-OEM", "Filtro Aire Generador (OEM)", "oem"], ["FIL-AIRE-GEN", "Filtro Aire GenÃ©rico", "generico"]],
          pm: [["Cambio de filtro de aire", 500]] }),
        comp("GEN-MTR-AEX-TUR", "Turbocompresor", { basico: false,
          rep: [["TUR-GEN-OEM", "Turbo Generador (OEM)", "oem"], ["KIT-SEL-TUR", "Kit Sellos Turbo", "generico"]],
          pm: [["InspecciÃ³n de turbocompresor", 4000]] }),
        comp("GEN-MTR-AEX-COD", "Codo de Escape HÃºmedo (Wet Elbow)", {
          rep: [["COD-ESC-GEN-OEM", "Codo Escape HÃºmedo Generador (OEM)", "oem"]],
          pm: [["InspecciÃ³n visual / por condiciÃ³n", 1000]] }),
      ],
    },
    // â”€â”€ SFI 621: Alternador con termografÃ­a / overhaul â”€â”€
    {
      cod: "GEN-MTR-ALT", nom: "Alternador", crit: "A", tipo: "subsistema",
      hijos: [
        comp("GEN-MTR-ALT-ALT", "Alternador Principal", { basico: false, rep: [
          ["ALT-220V-CAT", "Alternador 220V (OEM)", "oem"],
          ["ALT-220V-SKF", "Alternador 220V SKF (alternativo)", "alternativo"],
        ],
        // SFI 621 PM-2000H termografÃ­a + PM-4000H devanados + PM-8000H overhaul
        pm: [
          ["TermografÃ­a de alternador / generador", 2000],
          ["InspecciÃ³n de aislamiento de devanados", 4000],
          ["Overhaul completo de generador", 8000],
        ] }),
        comp("GEN-MTR-ALT-BRG", "Rodamiento Alternador", {
          rep: [
            ["BRG-6312-ZZ-FAG", "Rodamiento 6312-ZZ FAG (OEM)", "oem"],
            ["BRG-6312-ZZ-SKF", "Rodamiento 6312-ZZ SKF (alternativo)", "alternativo"],
          ],
          pm: [["Engrase / lubricaciÃ³n general", 2000]] }),
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
          pm: [["CalibraciÃ³n de sensores / instrumentos", 4000]] }),
      ],
    },
    {
      cod: "GEN-MTR-START", nom: "Sistema de Arranque", crit: "A", tipo: "subsistema",
      hijos: [
        comp("GEN-MTR-START-MTR", "Motor de Arranque", { basico: false, rep: [
          ["MTR-START-CAT", "Motor Arranque (OEM)", "oem"],
          ["MTR-START-ALT", "Motor Arranque Alternativo", "alternativo"],
        ] }),
        comp("GEN-MTR-START-BAT", "BaterÃ­as", {
          rep: [
            ["BAT-12V-100AH-CAT", "BaterÃ­a 12V 100Ah (OEM)", "oem"],
            ["BAT-12V-100AH-GEN", "BaterÃ­a 12V 100Ah GenÃ©rica", "generico"],
          ],
          pm: [["RevisiÃ³n de banco de baterÃ­as", 500]] }),
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
            ["Verificar presiÃ³n y temperatura de operaciÃ³n (ronda)", null, "diario"],
            ["Prueba de alarmas y paradas de seguridad", 1000],
          ] }),
        comp("GEN-MTR-CTRL-CAB", "Cableado ElectrÃ³nico", { basico: false, rep: [
          ["CAB-GEN-CAT", "Cableado Generador (OEM)", "oem"],
          ["CAB-GEN-ALT", "Cableado Generador Alternativo", "alternativo"],
        ] }),
      ],
    },
  ],
};

// ============================================================
//  SFI 652 â€” CENTRAL / GRUPO HIDRÃULICO (HPU / Power Pack)
// ============================================================
const CENTRAL_HIDRAULICA = {
  cod: "HPU", nom: "Grupo HidrÃ¡ulico", crit: "A", tipo: "sistema",
  hijos: [
    {
      cod: "HPU-MTR", nom: "Motor DiÃ©sel (accionador)", crit: "A", tipo: "subsistema", mtbf: 15000,
      hijos: [
        comp("HPU-MTR-ACE", "Aceite y Filtro de Motor", {
          rep: [
            ["FLT-ACE-HPU-OEM", "Filtro de Aceite Motor HPU (OEM)", "oem"],
            ["FLT-ACE-HPU-DON", "Filtro de Aceite Donaldson", "alternativo"],
            ["ACE-15W40-CK4", "Aceite Motor 15W-40 CK-4 (balde)", "generico"],
          ],
          pm: [["Cambio de aceite de motor", 250], ["AnÃ¡lisis de aceite (muestra a laboratorio)", 1000]] }),
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
          pm: [["RevisiÃ³n / calibraciÃ³n de inyectores", 4000]] }),
        comp("HPU-MTR-COR", "Correas y Tensores", {
          rep: [
            ["COR-HPU-OEM", "Correa HPU (OEM)", "oem"],
            ["COR-HPU-GEN", "Correa GenÃ©rica Equivalente", "generico"],
          ],
          pm: [["RevisiÃ³n de correas y tensores", 1000]] }),
        comp("HPU-MTR-REF", "RefrigeraciÃ³n (impeller / agua)", {
          rep: [
            ["IMP-HPU-OEM", "Impeller Bomba Agua Mar HPU (OEM)", "oem"],
            ["IMP-HPU-ALT", "Impeller Alternativo", "alternativo"],
            ["ANT-COOL-GEN", "Refrigerante / Anticorrosivo (galÃ³n)", "generico"],
          ],
          pm: [["RevisiÃ³n de bomba de agua de mar (impeller)", 500], ["Limpieza de radiador / intercambiador de calor", 2000]] }),
        inst("HPU-MTR-SEN", "Sensores (presiÃ³n / temperatura)", {
          param: PM_HPU_MTR,
          rep: [
            ["SEN-PRE-HPU-OEM", "Sensor PresiÃ³n Aceite HPU (OEM)", "oem"],
            ["SEN-TEM-HPU-OEM", "Sensor Temperatura HPU (OEM)", "oem"],
          ],
          pm: [["Prueba de alarmas y paradas de seguridad", 1000]] }),
      ],
    },
    {
      cod: "HPU-BMB", nom: "Bomba HidrÃ¡ulica (accionada)", crit: "A", tipo: "subsistema", mtbf: 12000,
      hijos: [
        comp("HPU-BMB-BMB", "Bomba HidrÃ¡ulica Principal", { basico: false,
          rep: [
            ["BMB-HID-OEM", "Bomba HidrÃ¡ulica (OEM)", "oem"],
            ["BMB-HID-ALT", "Bomba HidrÃ¡ulica Alternativa", "alternativo"],
            ["KIT-REP-BMB-HID", "Kit de ReparaciÃ³n de Bomba", "generico"],
          ],
          // SFI 652 PM-2000H muestreo + PM-8000H overhaul
          pm: [
            ["AnÃ¡lisis de aceite (muestra a laboratorio)", 500],
            ["RevisiÃ³n de mangueras y presiÃ³n hidrÃ¡ulica", 1000],
            ["Muestreo de aceite hidrÃ¡ulico", 2000],
            ["Overhaul de bombas hidrÃ¡ulicas", 8000],
          ] }),
        comp("HPU-BMB-ACO", "Acoplamiento / CardÃ¡n", {
          rep: [
            ["ACO-HPU-OEM", "Acoplamiento ElÃ¡stico (OEM)", "oem"],
            ["ACO-HPU-GEN", "Inserto/Taco de Acoplamiento", "generico"],
          ],
          pm: [["Engrase / lubricaciÃ³n general", 500]] }),
        comp("HPU-BMB-SEL", "Sello MecÃ¡nico", { basico: false,
          rep: [
            ["SEL-BMB-HID-OEM", "Sello MecÃ¡nico Bomba (OEM)", "oem"],
            ["SEL-BMB-HID-GEN", "Kit de Sellos (genÃ©rico)", "generico"],
          ],
          pm: [["InspecciÃ³n visual / por condiciÃ³n", 4000]] }),
      ],
    },
    {
      cod: "HPU-TNK", nom: "Estanque / DepÃ³sito de Aceite", crit: "B", tipo: "subsistema",
      hijos: [
        comp("HPU-TNK-TNK", "Estanque HidrÃ¡ulico", {
          rep: [
            ["ACE-HID-ISO46", "Aceite HidrÃ¡ulico ISO VG 46 (tambor)", "generico"],
            ["JD-TNK-001", "Junta Tapa de Estanque (kit)", "generico"],
          ],
          // SFI 652: diario nivel + 4000H cambio aceite (Korelfox 4000H vs anterior 2000H)
          pm: [
            ["Verificar fugas (combustible, aceite, refrigerante)", null, "diario"],
            ["Cambio de aceite hidrÃ¡ulico", 4000],
          ] }),
        comp("HPU-TNK-RES", "Respiradero / Breather", {
          rep: [
            ["BRE-HPU-OEM", "Respiradero con Filtro (OEM)", "oem"],
            ["BRE-HPU-GEN", "Respiradero GenÃ©rico", "generico"],
          ],
          pm: [["InspecciÃ³n visual / por condiciÃ³n", 1000]] }),
        inst("HPU-TNK-NVL", "Indicador de Nivel / Temperatura", {
          rep: [["NVL-HPU-OEM", "Visor Nivel-Temperatura (OEM)", "oem"]],
          // SFI 652 semanal fugas + mensual filtros
          pm: [
            ["InspecciÃ³n visual / por condiciÃ³n", null, "semanal"],
            ["RevisiÃ³n de estado de filtros del compresor RSW", null, "mensual"],
            ["InspecciÃ³n visual / por condiciÃ³n", 2000],
          ] }),
      ],
    },
    {
      cod: "HPU-VLV", nom: "VÃ¡lvulas y Manifold", crit: "A", tipo: "subsistema",
      hijos: [
        comp("HPU-VLV-DIR", "VÃ¡lvula Direccional", {
          rep: [
            ["VLV-DIR-OEM", "VÃ¡lvula Direccional (OEM)", "oem"],
            ["VLV-DIR-ALT", "VÃ¡lvula Direccional Alternativa", "alternativo"],
            ["KIT-SEL-VLV", "Kit de Sellos de VÃ¡lvula", "generico"],
          ],
          pm: [["InspecciÃ³n visual / por condiciÃ³n", 2000]] }),
        comp("HPU-VLV-ALI", "VÃ¡lvula de Alivio (presiÃ³n)", {
          rep: [
            ["VLV-ALI-OEM", "VÃ¡lvula de Alivio (OEM)", "oem"],
            ["VLV-ALI-ALT", "VÃ¡lvula de Alivio Alternativa", "alternativo"],
          ],
          pm: [["RevisiÃ³n de mangueras y presiÃ³n hidrÃ¡ulica", 1000]] }),
        comp("HPU-VLV-MAN", "Manifold / Bloque de VÃ¡lvulas", { basico: false,
          rep: [
            ["MAN-HPU-OEM", "Manifold HidrÃ¡ulico (OEM)", "oem"],
            ["KIT-SEL-MAN", "Kit de Sellos de Manifold", "generico"],
          ],
          pm: [["InspecciÃ³n visual / por condiciÃ³n", 4000]] }),
      ],
    },
    {
      cod: "HPU-FLT", nom: "Filtros HidrÃ¡ulicos", crit: "A", tipo: "subsistema",
      hijos: [
        comp("HPU-FLT-PRE", "Filtro de PresiÃ³n", {
          rep: [
            ["FLT-PRE-HPU-OEM", "Filtro de PresiÃ³n (OEM)", "oem"],
            ["FLT-PRE-HPU-PAR", "Filtro de PresiÃ³n Parker", "alternativo"],
            ["FLT-PRE-HPU-GEN", "Filtro de PresiÃ³n GenÃ©rico", "generico"],
          ],
          pm: [["Cambio de filtro hidrÃ¡ulico", 1000]] }),
        comp("HPU-FLT-RET", "Filtro de Retorno", {
          rep: [
            ["FLT-RET-HPU-OEM", "Filtro de Retorno (OEM)", "oem"],
            ["FLT-RET-HPU-PAR", "Filtro de Retorno Parker", "alternativo"],
            ["FLT-RET-HPU-GEN", "Filtro de Retorno GenÃ©rico", "generico"],
          ],
          pm: [["Cambio de filtro hidrÃ¡ulico", 1000]] }),
        comp("HPU-FLT-SUC", "Filtro de SucciÃ³n (strainer)", {
          rep: [
            ["FLT-SUC-HPU-OEM", "Strainer de SucciÃ³n (OEM)", "oem"],
            ["FLT-SUC-HPU-GEN", "Strainer GenÃ©rico", "generico"],
          ],
          pm: [["Limpieza de radiador / intercambiador de calor", 1000]] }),
      ],
    },
    comp("HPU-ENF", "Enfriador de Aceite HidrÃ¡ulico", { crit: "B", basico: false,
      rep: [
        ["ENF-HPU-OEM", "Enfriador HidrÃ¡ulico (OEM)", "oem"],
        ["ENF-HPU-ALT", "Enfriador HidrÃ¡ulico Alternativo", "alternativo"],
      ],
      pm: [["Limpieza de radiador / intercambiador de calor", 1000]] }),
    inst("HPU-SEN-P", "Sensor de PresiÃ³n HidrÃ¡ulica", {
      param: PM_HID_P,
      rep: [
        ["SEN-PRE-HID-OEM", "Sensor PresiÃ³n HidrÃ¡ulica (OEM)", "oem"],
        ["SEN-PRE-HID-ALT", "Sensor PresiÃ³n HidrÃ¡ulica Alternativo", "alternativo"],
      ],
      pm: [["CalibraciÃ³n de sensores / instrumentos", 2000]] }),
  ],
};

// ============================================================
//  PLANTILLA_PESQUERA â€” Ã¡rbol completo de la nave
// ============================================================
export const PLANTILLA_PESQUERA = [
  // â”€â”€ PropulsiÃ³n Principal (SFI 611-613) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  {
    cod: "PROP", nom: "PropulsiÃ³n Principal", crit: "A", tipo: "sistema",
    hijos: [
      MOTOR_PRINCIPAL,
      {
        cod: "PROP-RED", nom: "Reductora", crit: "A", tipo: "subsistema", fuente: "PROP-MTR",
        hijos: [
          comp("PROP-RED-ACE", "Aceite y Filtro de Reductora", {
            rep: [["FLT-RED-OEM", "Filtro Reductora (OEM)", "oem"], ["ACE-RED-GEN", "Aceite Reductora (balde)", "generico"]],
            pm: [["Cambio de aceite de reductora", 1000]] }),
          comp("PROP-RED-CAJ", "Caja Reductora (engranajes)", { basico: false,
            rep: [["RED-OEM", "Reductora completa (OEM)", "oem"], ["KIT-JD-RED", "Kit Juntas Reductora", "generico"]] }),
          comp("PROP-RED-EMB", "Embrague (Clutch)", { basico: false,
            rep: [["KIT-EMB-OEM", "Kit de Embrague (OEM)", "oem"]],
            pm: [["InspecciÃ³n visual / por condiciÃ³n", 4000]] }),
          comp("PROP-RED-ENF", "Enfriador de Aceite de Reductora", { basico: false,
            rep: [["ENF-RED-OEM", "Enfriador Reductora (OEM)", "oem"]],
            pm: [["Limpieza de radiador / intercambiador de calor", 4000]] }),
          inst("PROP-RED-SEN", "Sensor PresiÃ³n/Temp Reductora", {
            param: PM_ACE_RED,
            rep: [["SEN-PRE-RED", "Sensor PresiÃ³n Reductora", "oem"]] }),
        ],
      },
      {
        cod: "PROP-EJE", nom: "Eje y Bocina", crit: "A", tipo: "subsistema", fuente: "PROP-MTR",
        hijos: [
          comp("PROP-EJE-EJE", "Eje de Cola", { basico: false, rep: [["EJE-OEM", "Eje de Cola (OEM)", "oem"]] }),
          comp("PROP-EJE-BOC", "Bocina (Stern Tube)", { basico: false, rep: [["BOC-OEM", "Bocina (OEM)", "oem"]] }),
          comp("PROP-EJE-SEL", "Sello de Bocina", {
            rep: [["SEL-BOC-OEM", "Sello de Bocina (OEM)", "oem"], ["KIT-SEL-BOC", "Kit Sellos Bocina", "generico"]],
            pm: [["InspecciÃ³n visual / por condiciÃ³n", 2000]] }),
          comp("PROP-EJE-CHU", "Chumaceras de Apoyo", {
            rep: [["CHU-OEM", "Chumacera de Apoyo (OEM)", "oem"]],
            pm: [["Engrase / lubricaciÃ³n general", 1000]] }),
          comp("PROP-EJE-ACO", "Acoplamiento / Brida", { basico: false,
            rep: [["ACO-EJE-OEM", "Acoplamiento de Eje (OEM)", "oem"]] }),
        ],
      },
      {
        cod: "PROP-HEL", nom: "HÃ©lice", crit: "A", tipo: "subsistema", fuente: "PROP-MTR",
        hijos: [
          comp("PROP-HEL-HEL", "HÃ©lice", { basico: false, rep: [["HEL-OEM", "HÃ©lice (OEM)", "oem"]] }),
          comp("PROP-HEL-ANO", "Ãnodos de Eje / HÃ©lice", {
            rep: [["ANO-EJE-GEN", "Ãnodo de Eje (genÃ©rico)", "generico"]],
            pm: [["InspecciÃ³n de Ã¡nodos de sacrificio", 1000]] }),
        ],
      },
    ],
  },

  // â”€â”€ Generadores Electricidad (SFI 621-622) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  {
    cod: "GEN", nom: "Generadores Electricidad", crit: "A", tipo: "sistema",
    hijos: [
      MOTOR_GENERADOR,
      { cod: "GEN-EMG", nom: "Generador de Emergencia", crit: "A", tipo: "subsistema" },
    ],
  },

  // â”€â”€ Grupo HidrÃ¡ulico / Power Pack (SFI 652) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  CENTRAL_HIDRAULICA,

  // â”€â”€ Gobierno / ServotimÃ³n (SFI 642) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  {
    cod: "STEER", nom: "Gobierno / ServotimÃ³n", crit: "A", tipo: "sistema",
    hijos: [
      comp("STEER-PWR", "Servomotor / Power Pack del TimÃ³n", { basico: false,
        rep: [["BMP-TIM-OEM", "Bomba HidrÃ¡ulica del TimÃ³n (OEM)", "oem"], ["MOT-TIM-OEM", "Motor ElÃ©ctrico ServotimÃ³n", "oem"]],
        // SFI 642: semanal prueba + mensual cambio bomba activa + 2000H engrase
        pm: [
          ["Prueba operacional del sistema de gobierno", null, "semanal"],
          ["Cambio de bomba activa del timÃ³n", null, "mensual"],
          ["Engrase / lubricaciÃ³n general", 2000],
          ["Prueba de emergencia del gobierno", null, "semestral"],
        ] }),
      comp("STEER-CIL", "Cilindros / Actuador del TimÃ³n", {
        rep: [["KIT-SEL-TIM", "Kit Sellos Cilindro TimÃ³n", "generico"]],
        pm: [["InspecciÃ³n visual / por condiciÃ³n", 2000]] }),
      comp("STEER-TIM", "Mecha y Pala del TimÃ³n", { basico: false,
        rep: [["CASQ-TIM-OEM", "Casquillo/Bocina de Mecha (OEM)", "oem"]] }),
      comp("STEER-EMG", "Gobierno de Emergencia", {
        rep: [["BMB-MAN-TIM", "Bomba Manual de Emergencia", "oem"]],
        pm: [["Prueba de emergencia del gobierno", null, "semestral"]] }),
      inst("STEER-FBK", "Telemotor / RetroalimentaciÃ³n", {
        rep: [["FBK-TIM-OEM", "Transmisor de PosiciÃ³n (feedback)", "oem"]],
        // SFI 642 anual calibraciÃ³n
        pm: [["CalibraciÃ³n de sensores / instrumentos", null, "anual"]] }),
    ],
  },

  // â”€â”€ Combustible de Nave â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  {
    cod: "FUEL", nom: "Combustible de Nave", crit: "A", tipo: "sistema",
    hijos: [
      { cod: "FUEL-TNK", nom: "Tanques de Combustible",     crit: "A", tipo: "subsistema" },
      { cod: "FUEL-BMP", nom: "Bomba de Trasiego",          crit: "A", tipo: "subsistema" },
      { cod: "FUEL-SEP", nom: "Separador Agua-Combustible", crit: "A", tipo: "subsistema" },
    ],
  },

  // â”€â”€ Contraincendios â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  {
    cod: "FIRE", nom: "Contraincendios", crit: "A", tipo: "sistema",
    hijos: [
      comp("FIRE-BMP", "Bomba Contraincendios Principal", { basico: false,
        rep: [["BMP-CI-OEM", "Bomba CI (OEM)", "oem"], ["KIT-SEL-CI", "Kit Sellos Bomba CI", "generico"]],
        pm: [["Prueba de alarmas y paradas de seguridad", 1000], ["Engrase / lubricaciÃ³n general", 2000]] }),
      comp("FIRE-EMG", "Bomba CI de Emergencia", { basico: false,
        rep: [["BMP-CI-EMG-OEM", "Bomba CI Emergencia (OEM)", "oem"]],
        pm: [["Prueba de alarmas y paradas de seguridad", 1000]] }),
      comp("FIRE-RED", "Colector, Hidrantes y Mangueras", {
        rep: [["MNG-CI-GEN", "Manguera CI 1Â½\" (rollo)", "generico"], ["BOQ-CI-GEN", "Boquilla/Lanza CI", "generico"]],
        pm: [["InspecciÃ³n visual / por condiciÃ³n", 500]] }),
      comp("FIRE-FIJ", "Sistema Fijo Sala de MÃ¡quinas (COâ‚‚ / espuma)", { basico: false,
        rep: [["KIT-CO2-OEM", "BotellÃ³n COâ‚‚ / carga", "oem"]],
        pm: [["InspecciÃ³n visual / por condiciÃ³n", 2000]] }),
      comp("FIRE-DET", "DetecciÃ³n (humo / calor) y Paro Remoto", {
        rep: [["DET-HUM-OEM", "Detector de Humo", "oem"], ["DET-CAL-OEM", "Detector de Calor", "oem"]],
        pm: [["Prueba de alarmas y paradas de seguridad", 1000]] }),
      comp("FIRE-EXT", "Extintores PortÃ¡tiles", {
        rep: [["EXT-PQS-6", "Extintor PQS 6kg", "generico"], ["EXT-CO2-5", "Extintor COâ‚‚ 5kg", "generico"]],
        pm: [
          ["Control visual de extintores (ubicaciÃ³n, precinto, presiÃ³n)", null, "mensual"],
          ["Control reglamentario de extintores portÃ¡tiles", null, "anual"],
        ] }),
    ],
  },

  // â”€â”€ Achique y Sentinas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  {
    cod: "BILGE", nom: "Achique y Sentinas", crit: "A", tipo: "sistema",
    hijos: [
      comp("BILGE-BMP", "Bombas de Achique", {
        rep: [["BMP-ACH-OEM", "Bomba de Achique (OEM)", "oem"], ["BMP-ACH-ALT", "Bomba de Achique Alternativa", "alternativo"], ["KIT-SEL-ACH", "Kit Sellos Bomba Achique", "generico"]],
        pm: [["Prueba de alarmas y paradas de seguridad", 1000], ["Engrase / lubricaciÃ³n general", 1000]] }),
      comp("BILGE-COL", "Colector y VÃ¡lvulas de Sentina", {
        rep: [["VLV-SEN-OEM", "VÃ¡lvula de Sentina (OEM)", "oem"]],
        pm: [["InspecciÃ³n visual / por condiciÃ³n", 1000]] }),
      comp("BILGE-ALM", "Alarmas de Nivel de Sentina", {
        rep: [["SEN-NIV-OEM", "Sensor de Nivel de Sentina", "oem"]],
        pm: [["Prueba de alarmas y paradas de seguridad", 500]] }),
      comp("BILGE-EDU", "Eductor / Achique de Emergencia", { basico: false,
        rep: [["EDU-OEM", "Eductor (OEM)", "oem"]],
        pm: [["InspecciÃ³n visual / por condiciÃ³n", 2000]] }),
    ],
  },

  // â”€â”€ Comunicaciones (GMDSS) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  {
    cod: "COMM", nom: "Comunicaciones (GMDSS)", crit: "A", tipo: "sistema",
    hijos: [
      { cod: "COMM-VHF", nom: "VHF / DSC", crit: "A", tipo: "subsistema",
        pm: [
          ["Prueba de transmisiÃ³n/recepciÃ³n VHF/DSC", null, "semanal"],
          ["CertificaciÃ³n GMDSS del equipo VHF", null, "anual"],
        ] },
      { cod: "COMM-MFHF", nom: "MF / HF", crit: "A", tipo: "subsistema",
        pm: [
          ["Prueba de transmisiÃ³n/recepciÃ³n MF/HF", null, "semanal"],
          ["CertificaciÃ³n GMDSS del equipo MF/HF", null, "anual"],
        ] },
      { cod: "COMM-SAT", nom: "Inmarsat-C / Satelital", crit: "A", tipo: "subsistema",
        pm: [
          ["Prueba de enlace satelital (Inmarsat-C)", null, "mensual"],
          ["VerificaciÃ³n de registro y certificaciÃ³n satelital", null, "anual"],
        ] },
      { cod: "COMM-VMS", nom: "VMS Satelital", crit: "A", tipo: "subsistema",
        pm: [
          ["Prueba de posiciÃ³n y reporte VMS", null, "mensual"],
          ["VerificaciÃ³n de contrato/certificaciÃ³n VMS", null, "anual"],
        ] },
      comp("COMM-EPI", "EPIRB / Baliza de Emergencia", {
        rep: [["BAT-EPIRB-OEM", "BaterÃ­a EPIRB (OEM)", "oem"]],
        pm: [
          ["Autotest de EPIRB", null, "mensual"],
          ["VerificaciÃ³n de caducidad de baterÃ­a EPIRB", null, "semestral"],
          ["Servicio y registro EPIRB (certificaciÃ³n)", null, "anual"],
        ] }),
      comp("COMM-SART", "SART / Radar Transponder", {
        rep: [["BAT-SART-OEM", "BaterÃ­a SART (OEM)", "oem"]],
        pm: [
          ["Autotest de SART", null, "mensual"],
          ["VerificaciÃ³n de caducidad de baterÃ­a SART", null, "semestral"],
          ["Servicio y registro SART", null, "anual"],
        ] }),
      { cod: "COMM-NTX", nom: "NAVTEX", crit: "B", tipo: "subsistema",
        pm: [
          ["Verificar recepciÃ³n de mensajes NAVTEX", null, "semanal"],
          ["InspecciÃ³n de antena y receptor NAVTEX", null, "anual"],
        ] },
    ],
  },

  // â”€â”€ NavegaciÃ³n â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  {
    cod: "NAV", nom: "NavegaciÃ³n", crit: "A", tipo: "sistema",
    hijos: [
      { cod: "NAV-GPS", nom: "GPS / Plotter", crit: "A", tipo: "subsistema",
        pm: [
          ["Verificar posiciÃ³n y alarmas del GPS/plotter", null, "semanal"],
          ["VerificaciÃ³n de precisiÃ³n del GPS", null, "anual"],
        ] },
      { cod: "NAV-RAD", nom: "Radar", crit: "A", tipo: "subsistema",
        pm: [
          ["InspecciÃ³n visual del radar (antena y display)", null, "mensual"],
          ["Prueba de alcance y claridad del radar", null, "semestral"],
        ] },
      { cod: "NAV-SON", nom: "Sonda / Ecosonda", crit: "A", tipo: "subsistema",
        pm: [
          ["Verificar lectura de profundidad y fondo", null, "semanal"],
          ["CalibraciÃ³n / limpieza del transductor", null, "semestral"],
        ] },
      { cod: "NAV-GIR", nom: "GirocompÃ¡s / CompÃ¡s", crit: "A", tipo: "subsistema",
        pm: [
          ["Verificar rumbo magnÃ©tico vs girocompÃ¡s", null, "mensual"],
          ["CalibraciÃ³n de girocompÃ¡s / compÃ¡s", null, "anual"],
        ] },
      { cod: "NAV-AIS", nom: "AIS", crit: "A", tipo: "subsistema",
        pm: [
          ["Prueba de transmisiÃ³n AIS (Class A/B)", null, "semanal"],
          ["VerificaciÃ³n de datos AIS (MMSI, posiciÃ³n)", null, "semestral"],
        ] },
      { cod: "NAV-PIL", nom: "Piloto AutomÃ¡tico", crit: "B", tipo: "subsistema",
        pm: [
          ["Prueba operacional del piloto automÃ¡tico", null, "mensual"],
          ["CalibraciÃ³n del piloto automÃ¡tico", null, "anual"],
        ] },
    ],
  },

  // â”€â”€ Seguridad (Salvamento) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  {
    cod: "SAF", nom: "Seguridad (Salvamento)", crit: "A", tipo: "sistema",
    hijos: [
      comp("SAF-BAL", "Balsa Salvavidas", {
        rep: [["KIT-BAL-SRV", "Servicio Anual Balsa (kit)", "oem"]],
        pm: [["RevisiÃ³n de balsa salvavidas", null, "anual"]] }),
      comp("SAF-CHA", "Chalecos y Trajes de InmersiÃ³n", {
        rep: [["CHA-SV-GEN", "Chaleco Salvavidas", "generico"], ["TRA-INM-GEN", "Traje de InmersiÃ³n", "generico"]],
        pm: [["InspecciÃ³n visual / por condiciÃ³n", null, "semestral"]] }),
      comp("SAF-ARO", "Aros Salvavidas y SeÃ±ales", {
        rep: [["ARO-SV-GEN", "Aro Salvavidas", "generico"], ["LUZ-ARO-GEN", "Luz/Rabiza de Aro", "generico"]],
        pm: [["InspecciÃ³n visual / por condiciÃ³n", null, "semestral"]] }),
      comp("SAF-PIR", "SeÃ±ales PirotÃ©cnicas", { basico: false,
        rep: [["PIR-KIT", "Set PirotÃ©cnico (bengalas/cohetes)", "generico"]],
        pm: [["InspecciÃ³n visual / por condiciÃ³n", null, "anual"]] }),
      comp("SAF-BOT", "BotiquÃ­n / Primeros Auxilios", {
        rep: [["BOT-1AUX", "BotiquÃ­n NÃ¡utico (recarga)", "generico"]],
        pm: [["InspecciÃ³n visual / por condiciÃ³n", null, "anual"]] }),
    ],
  },

  // â”€â”€ Manejo de Captura â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  {
    cod: "CATCH", nom: "Manejo de Captura", crit: "A", tipo: "sistema",
    hijos: [
      comp("CATCH-VIV", "Estanques / Viveros (centolla viva)", { basico: false,
        rep: [["JD-VIV-GEN", "Juntas/Sellos de Estanque", "generico"]],
        pm: [["InspecciÃ³n visual / por condiciÃ³n", 1000]] }),
      comp("CATCH-BMP", "Bombas de CirculaciÃ³n de Agua de Mar", {
        rep: [["BMP-CIR-OEM", "Bomba de CirculaciÃ³n (OEM)", "oem"], ["BMP-CIR-ALT", "Bomba de CirculaciÃ³n Alternativa", "alternativo"], ["KIT-SEL-CIR", "Kit Sellos Bomba", "generico"]],
        pm: [["RevisiÃ³n de bomba de agua de mar (impeller)", 1000], ["Engrase / lubricaciÃ³n general", 500]] }),
      comp("CATCH-OXI", "Sistema de OxigenaciÃ³n / AireaciÃ³n", {
        rep: [["DIF-OXI-GEN", "Difusores de OxÃ­geno", "generico"], ["REG-OXI-OEM", "Regulador de OxÃ­geno", "oem"]],
        pm: [["InspecciÃ³n visual / por condiciÃ³n", 500]] }),
      comp("CATCH-FIL", "FiltraciÃ³n / Recambio de Agua", {
        rep: [["FLT-VIV-GEN", "Filtro de Vivero", "generico"]],
        pm: [["InspecciÃ³n visual / por condiciÃ³n", 250]] }),
      comp("CATCH-CLA", "Mesa de ClasificaciÃ³n / Picking", { basico: false }),
      inst("CATCH-SEN", "Sensores de Calidad de Agua (Oâ‚‚, temp)", {
        param: PM_VIVERO,
        rep: [["SEN-OXI-OEM", "Sensor de OxÃ­geno Disuelto", "oem"], ["SEN-TEM-VIV", "Sensor de Temperatura Vivero", "oem"]],
        pm: [["CalibraciÃ³n de sensores / instrumentos", 2000]] }),
    ],
  },

  // â”€â”€ RefrigeraciÃ³n RSW / Planta FrigorÃ­fica (SFI 661-663) â”€â”€â”€â”€â”€â”€â”€â”€
  {
    cod: "RSW", nom: "RefrigeraciÃ³n RSW / Carnada", crit: "A", tipo: "sistema",
    hijos: [
      // SFI 661 â€” Compresor FrigorÃ­fico (expandido desde stub vacÃ­o)
      {
        cod: "RSW-CMP", nom: "Compresor FrigorÃ­fico", crit: "A", tipo: "subsistema",
        hijos: [
          comp("RSW-CMP-CMP", "Compresor FrigorÃ­fico (conjunto)", {
            rep: [
              ["FLT-CMP-RSW-GEN", "Filtro de Aceite Compresor RSW", "generico"],
              ["VAL-CMP-RSW-OEM", "VÃ¡lvulas de Compresor RSW (kit)", "oem"],
              ["ACE-CMP-RSW-GEN", "Aceite de Compresor FrigorÃ­fico", "generico"],
            ],
            // SFI 661: diario parÃ¡metros + semanal nivel + mensual filtros + 1000H + 2000H + 4000H + 8000H
            pm: [
              ["Verificar presiÃ³n alta, baja y temperaturas frigorÃ­ficas", null, "diario"],
              ["Verificar nivel de aceite del compresor frigorÃ­fico", null, "semanal"],
              ["Verificar estado de filtros del compresor RSW", null, "mensual"],
              ["Cambio de filtros de aceite de compresor RSW", 1000],
              ["AnÃ¡lisis de aceite de compresor frigorÃ­fico", 2000],
              ["Cambio de vÃ¡lvulas del compresor frigorÃ­fico", 4000],
              ["Overhaul completo de compresor frigorÃ­fico", 8000],
            ] }),
        ],
      },
      // SFI 662 â€” Condensador
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
      // SFI 663 â€” Evaporador / Chiller
      {
        cod: "RSW-EVA", nom: "Evaporador / Chiller RSW", crit: "A", tipo: "subsistema",
        hijos: [
          comp("RSW-EVA-EVA", "Evaporador RSW (conjunto)", {
            // SFI 663: semanal + mensual + semestral + anual
            pm: [
              ["Limpieza de evaporador RSW", null, "semanal"],
              ["VerificaciÃ³n de ventiladores de evaporador", null, "mensual"],
              ["Deshielo completo de evaporador RSW", null, "semestral"],
              ["Prueba de eficiencia frigorÃ­fica", null, "anual"],
            ] }),
        ],
      },
      { cod: "RSW-BAM", nom: "Bomba Agua de Mar RSW",   crit: "A", tipo: "subsistema" },
      { cod: "RSW-BOD", nom: "Bodegas de Pesca",        crit: "A", tipo: "subsistema" },
      inst("RSW-SEN-T", "Sensor Temperatura RSW", { crit: "A",
        param: PM_RSW_T,
        pm: [["CalibraciÃ³n de sensores / instrumentos", null, "semestral"]] }),
    ],
  },

  // â”€â”€ Equipos de Pesca (SFI 651-653) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  {
    cod: "FISH", nom: "Equipo de Pesca (Trampas / Centolla)", crit: "A", tipo: "sistema",
    hijos: [
      // SFI 651 â€” Winches de Pesca
      comp("FISH-VIR", "Virador de Trampas (Pot Hauler)", {
        rep: [["VIR-OEM", "Virador HidrÃ¡ulico (OEM)", "oem"], ["MOT-VIR-OEM", "Motor HidrÃ¡ulico Virador", "oem"], ["KIT-SEL-VIR", "Kit Sellos Virador", "generico"]],
        // SFI 651: diario nivel + semanal lubricaciÃ³n + mensual frenos + 1000H aceite + 2000H engranajes + 4000H overhaul frenos
        pm: [
          ["Verificar nivel de aceite en cÃ¡rter", null, "diario"],
          ["LubricaciÃ³n de cables de pesca", null, "semanal"],
          ["InspecciÃ³n de frenos de winches", null, "mensual"],
          ["Cambio de aceite en reductores de winche", 1000],
          ["RevisiÃ³n de winche / power block", 1000],
          ["InspecciÃ³n de engranajes del winche", 2000],
          ["Overhaul de frenos hidrÃ¡ulicos del winche", 4000],
          ["Engrase / lubricaciÃ³n general", 500],
        ] }),
      comp("FISH-LAN", "Lanzador / Rampa de Lanzamiento", {
        rep: [["ROD-LAN-GEN", "Rodillos de Lanzamiento", "generico"]],
        pm: [["InspecciÃ³n visual / por condiciÃ³n", 1000]] }),
      comp("FISH-PAS", "Pasacabos / Enrollador de LÃ­nea", {
        rep: [["PAS-OEM", "Pasacabos (OEM)", "oem"]],
        pm: [["Engrase / lubricaciÃ³n general", 1000]] }),
      comp("FISH-TRA", "Trampas / Nasas", { basico: false,
        rep: [["TRA-CENT", "Trampa de Centolla (estÃ¡ndar)", "generico"], ["RED-TRA", "PaÃ±o/Red de Trampa (repuesto)", "generico"]] }),
      comp("FISH-LIN", "Boyas, LÃ­neas y Orinques", {
        rep: [["BOYA-GEN", "Boya de SeÃ±alizaciÃ³n", "generico"], ["LIN-GROUND", "LÃ­nea madre / orinque (rollo)", "generico"]],
        pm: [["InspecciÃ³n visual / por condiciÃ³n", 500]] }),
      comp("FISH-CAR", "PaÃ±ol / CÃ¡mara de Carnada", { basico: false,
        pm: [["InspecciÃ³n visual / por condiciÃ³n", 2000]] }),
      // SFI 653 â€” GrÃºas y Plumas
      comp("FISH-GRU", "Pluma / Davit de Izado", { basico: false,
        rep: [["KIT-SEL-GRU", "Kit Sellos Cilindro Pluma", "generico"]],
        // SFI 653: semanal estructural + mensual cables + semestral END + anual certificaciÃ³n
        pm: [
          ["InspecciÃ³n estructural de grÃºas y plumas", null, "semanal"],
          ["InspecciÃ³n de cables y eslingas de grÃºas", null, "mensual"],
          ["Ensayo de discontinuidades (END) en soldaduras", null, "semestral"],
          ["CertificaciÃ³n de carga de grÃºas", null, "anual"],
        ] }),
    ],
  },

  // â”€â”€ Medio Ambiente (MARPOL) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  {
    cod: "ENV", nom: "Medio Ambiente (MARPOL)", crit: "A", tipo: "sistema",
    hijos: [
      comp("ENV-OWS", "Separador de Aguas Oleosas (OWS)", { basico: false,
        rep: [["FLT-OWS-OEM", "Elemento Filtrante OWS (OEM)", "oem"], ["KIT-SEL-OWS", "Kit Sellos OWS", "generico"]],
        pm: [["InspecciÃ³n visual / por condiciÃ³n", 1000]] }),
      comp("ENV-OCM", "Monitor de Contenido de Aceite (15 ppm)", {
        rep: [["CEL-OCM-OEM", "Celda/Sensor OCM (OEM)", "oem"]],
        pm: [["CalibraciÃ³n de sensores / instrumentos", 2000]] }),
      comp("ENV-LOD", "Tanque de Lodos (Sludge)", { basico: false,
        pm: [["InspecciÃ³n visual / por condiciÃ³n", 4000]] }),
      comp("ENV-AGS", "Tratamiento / Tanque de Aguas Servidas", { basico: false,
        rep: [["KIT-AGS-OEM", "Kit MantenciÃ³n Planta Aguas Servidas", "oem"]],
        pm: [["InspecciÃ³n visual / por condiciÃ³n", 2000]] }),
    ],
  },

  // â”€â”€ Sistema ElÃ©ctrico (SFI 622 Tablero) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  {
    cod: "ELEC", nom: "Sistema ElÃ©ctrico", crit: "B", tipo: "sistema",
    hijos: [
      // SFI 622 â€” Tablero Principal expandido con PM calendario
      {
        cod: "ELEC-TAB", nom: "Tablero Principal", crit: "B", tipo: "subsistema",
        hijos: [
          comp("ELEC-TAB-PNL", "Tablero e Interruptores Principales", { crit: "B",
            rep: [["KIT-FUS-GEN", "Kit de Fusibles/RelÃ©s (repuesto)", "generico"]],
            // SFI 622: mensual, trimestral, semestral, anual
            pm: [
              ["Limpieza interior de tablero elÃ©ctrico", null, "mensual"],
              ["Torque de conexiones del tablero", null, "trimestral"],
              ["TermografÃ­a del tablero principal", null, "semestral"],
              ["Prueba de disparo de protecciones", null, "anual"],
            ] }),
        ],
      },
      { cod: "ELEC-INT", nom: "Interruptores",        crit: "B", tipo: "subsistema" },
      { cod: "ELEC-BAT", nom: "Banco de BaterÃ­as",    crit: "B", tipo: "subsistema" },
      { cod: "ELEC-CAB", nom: "Cables y Conductores", crit: "B", tipo: "subsistema" },
      {
        cod: "ELEC-ALU", nom: "Alumbrado y Luces de NavegaciÃ³n", crit: "A", tipo: "subsistema",
        hijos: [
          comp("ELEC-ALU-NAV", "Luces de NavegaciÃ³n (reglamentarias)", {
            rep: [["LUZ-NAV-OEM", "Set Luces de NavegaciÃ³n (OEM)", "oem"], ["AMP-NAV-GEN", "Ampolletas/LED NÃ¡uticos", "generico"]],
            pm: [
              ["Prueba de luces reglamentarias de navegaciÃ³n", null, "semanal"],
              ["InspecciÃ³n de estanqueidad y cableado de luces", null, "semestral"],
            ] }),
          comp("ELEC-ALU-CUB", "Proyectores de Cubierta", {
            rep: [["PROY-CUB-OEM", "Proyector de Cubierta (OEM)", "oem"]],
            pm: [["InspecciÃ³n visual / por condiciÃ³n", 2000]] }),
          comp("ELEC-ALU-EMG", "Alumbrado de Emergencia", {
            rep: [["LUZ-EMG-OEM", "Luminaria de Emergencia (OEM)", "oem"]],
            pm: [["Prueba de alarmas y paradas de seguridad", 1000]] }),
        ],
      },
      {
        cod: "ELEC-MON", nom: "Monitoreo y Alarmas de MÃ¡quinas", crit: "A", tipo: "subsistema",
        hijos: [
          comp("ELEC-MON-PNL", "Panel de Alarmas y Monitoreo", { basico: false,
            rep: [["PNL-ALM-OEM", "Panel de Alarmas (OEM)", "oem"]],
            pm: [["Prueba de alarmas y paradas de seguridad", 1000]] }),
          inst("ELEC-MON-SEN", "Sensores de Alarma (nivel, temp, presiÃ³n)", {
            param: PM_VIB,
            rep: [["SEN-ALM-GEN", "Sensores de Alarma (kit)", "generico"]],
            pm: [["CalibraciÃ³n de sensores / instrumentos", 4000]] }),
        ],
      },
    ],
  },

  // â”€â”€ Agua, Lastre y Potable â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  {
    cod: "WAT", nom: "Agua, Lastre y Potable", crit: "B", tipo: "sistema",
    hijos: [
      { cod: "WAT-LST", nom: "Tanques y Bombas de Lastre", crit: "B", tipo: "subsistema" },
      { cod: "WAT-TND", nom: "Tanques de Agua Dulce",      crit: "B", tipo: "subsistema" },
      {
        cod: "WAT-POT", nom: "Planta de Agua Potable", crit: "B", tipo: "subsistema",
        hijos: [
          comp("WAT-POT-GEN", "Generador de Agua Dulce (Ã³smosis/evaporador)", { basico: false,
            rep: [["MEM-RO-OEM", "Membrana de Ã“smosis (OEM)", "oem"], ["FLT-RO-GEN", "Prefiltros RO", "generico"]],
            pm: [["InspecciÃ³n visual / por condiciÃ³n", 2000]] }),
          comp("WAT-POT-HID", "Grupo HidrÃ³foro", {
            rep: [["BMP-HID-OEM", "Bomba HidrÃ³foro (OEM)", "oem"], ["MEM-HID-GEN", "Membrana/Diafragma Estanque", "generico"]],
            pm: [["Engrase / lubricaciÃ³n general", 2000]] }),
          comp("WAT-POT-CAL", "Calentador de Agua", { basico: false,
            rep: [["RES-CAL-GEN", "Resistencia/Ãnodo Calentador", "generico"]],
            pm: [["InspecciÃ³n visual / por condiciÃ³n", 2000]] }),
          comp("WAT-POT-UV", "Esterilizador UV / PotabilizaciÃ³n", {
            rep: [["LAM-UV-GEN", "LÃ¡mpara UV", "generico"]],
            pm: [["InspecciÃ³n visual / por condiciÃ³n", 1000]] }),
        ],
      },
    ],
  },

  // â”€â”€ Casco y Estructura â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  {
    cod: "STR", nom: "Casco y Estructura", crit: "B", tipo: "sistema",
    hijos: [
      { cod: "STR-CAS", nom: "Casco", crit: "B", tipo: "subsistema",
        pm: [
          ["InspecciÃ³n general de casco (obrero/cubierta)", null, "semestral"],
          ["InspecciÃ³n de casco en varada / dry-dock", null, "anual"],
        ] },
      { cod: "STR-CUB", nom: "Cubierta", crit: "B", tipo: "subsistema",
        pm: [
          ["InspecciÃ³n de cubierta (corrosiÃ³n, cubiertas, barandillas)", null, "semestral"],
          ["InspecciÃ³n estructural de cubierta en varada", null, "anual"],
        ] },
      { cod: "STR-MAM", nom: "Mamparos", crit: "B", tipo: "subsistema",
        pm: [
          ["InspecciÃ³n visual de mamparos estancos", null, "semestral"],
          ["Prueba de estanqueidad de puertas de mamparo", null, "anual"],
        ] },
      { cod: "STR-ANO", nom: "Ãnodos de Sacrificio", crit: "B", tipo: "subsistema",
        pm: [
          ["InspecciÃ³n visual de Ã¡nodos de sacrificio", null, "semestral"],
          ["Reemplazo de Ã¡nodos de sacrificio", null, "anual"],
        ] },
    ],
  },

  // â”€â”€ VentilaciÃ³n y ClimatizaciÃ³n â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  {
    cod: "HVAC", nom: "VentilaciÃ³n y ClimatizaciÃ³n", crit: "B", tipo: "sistema",
    hijos: [
      comp("HVAC-SM", "VentilaciÃ³n Sala de MÃ¡quinas", {
        rep: [["VEN-SM-OEM", "Ventilador/Extractor Sala MÃ¡quinas", "oem"], ["COR-VEN-GEN", "Correa de Ventilador", "generico"]],
        pm: [["InspecciÃ³n visual / por condiciÃ³n", 1000]] }),
      comp("HVAC-AC", "Aire Acondicionado de AcomodaciÃ³n", { basico: false,
        rep: [["FLT-AC-GEN", "Filtros de A/C", "generico"], ["GAS-AC-GEN", "Carga de Refrigerante", "generico"]],
        pm: [["InspecciÃ³n visual / por condiciÃ³n", 2000]] }),
      comp("HVAC-BOD", "VentilaciÃ³n de Bodegas / PaÃ±oles", {
        rep: [["VEN-BOD-OEM", "Ventilador de Bodega", "oem"]],
        pm: [["InspecciÃ³n visual / por condiciÃ³n", 2000]] }),
    ],
  },

  // â”€â”€ Habitabilidad â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  {
    cod: "HOTEL", nom: "Habitabilidad", crit: "C", tipo: "sistema",
    hijos: [
      comp("HOTEL-COC", "Cocina / Equipos de Fonda", {
        rep: [["RES-COC-GEN", "Resistencias/Quemadores Cocina", "generico"]],
        pm: [["InspecciÃ³n visual / por condiciÃ³n", 2000]] }),
      comp("HOTEL-REF", "RefrigeraciÃ³n de VÃ­veres (ProvisiÃ³n)", { basico: false,
        rep: [["GAS-REF-GEN", "Carga Refrigerante CÃ¡mara VÃ­veres", "generico"], ["FLT-REF-GEN", "Filtro Deshidratador", "generico"]],
        pm: [["InspecciÃ³n visual / por condiciÃ³n", 2000]] }),
      comp("HOTEL-ACS", "Agua Caliente Sanitaria", { basico: false,
        pm: [["InspecciÃ³n visual / por condiciÃ³n", 4000]] }),
    ],
  },

  // â”€â”€ Fondeo y Amarre â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  {
    cod: "ANCH", nom: "Fondeo y Amarre", crit: "B", tipo: "sistema",
    hijos: [
      comp("ANCH-MOL", "Molinete (Windlass)", { basico: false,
        rep: [["MOT-MOL-OEM", "Motor Molinete (OEM)", "oem"], ["KIT-FRE-MOL", "Kit de Freno/Embrague", "generico"]],
        pm: [["Engrase / lubricaciÃ³n general", 1000], ["InspecciÃ³n visual / por condiciÃ³n", 2000]] }),
      comp("ANCH-CAB", "Cabrestantes de Amarre", {
        rep: [["KIT-SEL-CAB", "Kit Sellos Cabrestante", "generico"]],
        pm: [["Engrase / lubricaciÃ³n general", 1000]] }),
      comp("ANCH-ANC", "Ancla y Cadena", { basico: false,
        rep: [["GRIL-ANC-GEN", "Grilletes/EslabÃ³n de Cadena", "generico"]],
        pm: [["InspecciÃ³n visual / por condiciÃ³n", 4000]] }),
      comp("ANCH-BIT", "Bitas, GuÃ­as y Cabos", {
        rep: [["CABO-AMA-GEN", "Cabo de Amarre", "generico"]],
        pm: [["InspecciÃ³n visual / por condiciÃ³n", 2000]] }),
    ],
  },

  // â”€â”€ Aire Comprimido (SFI 641) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  {
    cod: "AIR", nom: "Aire Comprimido", crit: "B", tipo: "sistema",
    hijos: [
      {
        cod: "AIR-ARR", nom: "Aire de Arranque", crit: "B", tipo: "subsistema",
        hijos: [
          comp("AIR-ARR-CMP", "Compresor de Aire de Arranque", { basico: false,
            rep: [["CMP-ARR-OEM", "Compresor Arranque (OEM)", "oem"], ["KIT-VLV-CMP", "Kit VÃ¡lvulas Compresor", "generico"]],
            // SFI 641: diario drenar + semanal vÃ¡lv seg + 500H aceite + 1000H vÃ¡lvulas + 4000H segmentos + 8000H overhaul
            pm: [
              ["Drenar condensados del compresor de arranque", null, "diario"],
              ["Prueba de alarmas y paradas de seguridad", null, "semanal"],
              ["Cambio de aceite de compresor de arranque", 500],
              ["InspecciÃ³n de vÃ¡lvulas de descarga del compresor", 1000],
              ["Cambio de segmentos del compresor de arranque", 4000],
              ["Overhaul completo de compresor de arranque", 8000],
            ] }),
          comp("AIR-ARR-BOT", "Botellas de Aire de Arranque", {
            rep: [["VLV-BOT-OEM", "VÃ¡lvula Botella de Aire", "oem"]],
            pm: [["InspecciÃ³n visual / por condiciÃ³n", 2000]] }),
        ],
      },
      {
        cod: "AIR-SRV", nom: "Aire de Servicio / Control", crit: "B", tipo: "subsistema",
        hijos: [
          comp("AIR-SRV-CMP", "Compresor de Servicio", { basico: false,
            rep: [["CMP-SRV-OEM", "Compresor de Servicio (OEM)", "oem"]],
            pm: [["InspecciÃ³n visual / por condiciÃ³n", 2000]] }),
          comp("AIR-SRV-SEC", "Secador / Filtro de Aire", {
            rep: [["FLT-AIRE-SRV", "Filtro/Secador de Aire", "generico"]],
            pm: [["InspecciÃ³n visual / por condiciÃ³n", 1000]] }),
        ],
      },
    ],
  },
];

// â”€â”€ Predicado de inclusiÃ³n por modo de precarga â”€â”€
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

// â”€â”€ Registro de vida: horas vs fecha de instalaciÃ³n â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/** Metadatos por modo de registro (aplicados en precarga de plantilla). */
export const REGISTRO_VIDA = {
  horas:        { horometro: "propio",  requiere_instalacion: false, consume_aceite: false },
  hereda_horas: { horometro: "hereda",  requiere_instalacion: false, consume_aceite: false },
  fecha:        { horometro: "no",      requiere_instalacion: true,  consume_aceite: false },
  mixto:        { horometro: "hereda",  requiere_instalacion: true,  consume_aceite: false },
};

/**
 * Reglas por prefijo de cÃ³digo (mÃ¡s especÃ­fico gana).
 * exacto: true â†’ solo coincide el cÃ³digo exacto, no descendientes.
 */
export const REGISTRO_POR_PREFIJO = [
  { prefijo: "PROP-MTR",    registro: "horas", consume_aceite: true, exacto: true },
  { prefijo: "GEN-MTR",     registro: "horas", consume_aceite: true, exacto: true },
  { prefijo: "GEN-EMG",     registro: "horas", consume_aceite: true, exacto: true },
  { prefijo: "HPU-MTR",     registro: "horas", consume_aceite: true, exacto: true },
  { prefijo: "AIR-ARR-CMP", registro: "horas", exacto: true },
  { prefijo: "AIR-SRV-CMP", registro: "horas", exacto: true },
  { prefijo: "RSW-CMP-CMP", registro: "horas", exacto: true },

  { prefijo: "PROP-MTR-", registro: "hereda_horas" },
  { prefijo: "GEN-MTR-",  registro: "hereda_horas" },
  { prefijo: "HPU-MTR-",  registro: "hereda_horas" },
  { prefijo: "HPU-",      registro: "hereda_horas" },
  { prefijo: "PROP-RED",  registro: "hereda_horas" },
  { prefijo: "PROP-EJE",  registro: "hereda_horas" },
  { prefijo: "PROP-HEL",  registro: "hereda_horas" },
  { prefijo: "RSW-CMP-",  registro: "hereda_horas" },

  { prefijo: "STEER-", registro: "mixto", fuente: "HPU-MTR" },
  { prefijo: "FISH-VIR", registro: "mixto", fuente: "HPU-MTR" },
  { prefijo: "FISH-GRU", registro: "mixto" },

  { prefijo: "STR-",     registro: "fecha" },
  { prefijo: "NAV-",     registro: "fecha" },
  { prefijo: "COMM-",    registro: "fecha" },
  { prefijo: "SAF-",     registro: "fecha" },
  { prefijo: "FISH-TRA", registro: "fecha" },
  { prefijo: "FISH-LIN", registro: "fecha" },
  { prefijo: "ANCH-ANC", registro: "fecha" },
  { prefijo: "ANCH-BIT", registro: "fecha" },
  { prefijo: "FUEL-TNK", registro: "fecha" },
  { prefijo: "WAT-LST",  registro: "fecha" },
  { prefijo: "WAT-TND",  registro: "fecha" },
  { prefijo: "ELEC-ALU-NAV", registro: "fecha" },
  { prefijo: "FIRE-EXT",     registro: "fecha" },
];

const REGLAS_REGISTRO = [...REGISTRO_POR_PREFIJO].sort((a, b) => {
  const peso = (r) => (r.exacto ? 10000 : 0) + r.prefijo.length;
  return peso(b) - peso(a);
});

function matchReglaRegistro(cod) {
  for (const r of REGLAS_REGISTRO) {
    if (r.exacto) {
      if (cod === r.prefijo) return r;
    } else if (cod === r.prefijo || cod.startsWith(r.prefijo)) {
      return r;
    }
  }
  return null;
}

function resolverRegistro(registro, nodo, regla = {}) {
  const meta = REGISTRO_VIDA[registro] ?? REGISTRO_VIDA.hereda_horas;
  const consumeAceite = regla.consume_aceite ?? meta.consume_aceite ?? false;
  return {
    registro,
    horometro: meta.horometro,
    requiere_instalacion: meta.requiere_instalacion,
    consume_aceite: consumeAceite,
    fuente: nodo?.fuente ?? regla.fuente ?? null,
  };
}

/** Resuelve modo de registro y campos operacionales para un nodo de plantilla. */
export function registroDesdeNodo(nodo) {
  const cod = nodo?.cod ?? "";
  if (nodo?.registro && REGISTRO_VIDA[nodo.registro]) {
    return resolverRegistro(nodo.registro, nodo);
  }
  const regla = matchReglaRegistro(cod);
  if (regla) return resolverRegistro(regla.registro, nodo, regla);
  if (nodo?.tipo === "componente" || nodo?.tipo === "instrumento") {
    return resolverRegistro("hereda_horas", nodo);
  }
  return resolverRegistro("hereda_horas", nodo);
}

/** Ficha JSONB inicial cuando el equipo se rastrea por fecha de instalaciÃ³n. */
export function fichaInicialDesdeRegistro(reg) {
  if (!reg?.requiere_instalacion) return null;
  return { _registro: reg.registro };
}

/** Campos de equipos a persistir al insertar desde plantilla. */
export function datosOperacionalesDesdeNodo(nodo) {
  const reg = registroDesdeNodo(nodo);
  const ficha = fichaInicialDesdeRegistro(reg);
  return {
    horometro: reg.horometro,
    consume_aceite: reg.consume_aceite,
    ...(ficha ? { ficha } : {}),
  };
}

/** Extrae el cÃ³digo de plantilla desde id_visible (EMB-COD â†’ COD). */
export function codPlantillaDesdeIdVisible(idVisible) {
  const i = String(idVisible || "").indexOf("-");
  if (i < 0) return "";
  return String(idVisible).slice(i + 1);
}

/** Registro de vida inferido desde id_visible de un equipo en BD. */
export function registroDesdeIdVisible(idVisible) {
  return registroDesdeNodo({ cod: codPlantillaDesdeIdVisible(idVisible), tipo: "subsistema" });
}

/** Equipo que debe tener fecha_instalacion en ficha. */
export function requiereFechaInstalacionEquipo(eq) {
  const tag = eq?.ficha?._registro;
  if (tag === "fecha" || tag === "mixto") return true;
  if (tag === "horas" || tag === "hereda_horas") return false;
  return registroDesdeIdVisible(eq?.id_visible).requiere_instalacion;
}

export function tieneFechaInstalacion(eq) {
  const v = eq?.ficha?.fecha_instalacion;
  return v != null && String(v).trim() !== "";
}

/** Modo de registro resuelto para un equipo en BD (ficha._registro o plantilla). */
export function registroVidaEquipo(eq) {
  const tag = eq?.ficha?._registro;
  if (tag === "fecha" || tag === "mixto" || tag === "horas" || tag === "hereda_horas") return tag;
  if (eq?.horometro === "propio") return "horas";
  if (eq?.horometro === "no" && eq?.id_visible) {
    const reg = registroDesdeIdVisible(eq.id_visible);
    if (reg.registro === "fecha" || reg.registro === "mixto") return reg.registro;
    return "fecha";
  }
  if (eq?.id_visible) return registroDesdeIdVisible(eq.id_visible).registro;
  return "hereda_horas";
}

/** Metadatos de badge en listados (Ã¡rbol, kanban, cola). */
export const REGISTRO_VIDA_UI = {
  horas:        { label: "Horas",       color: "#0891B2" },
  hereda_horas: { label: "Horas",       color: "#0891B2" },
  fecha:        { label: "InstalaciÃ³n", color: "#6C4FA3" },
  mixto:        { label: "Mixto",       color: "#127C8A" },
};

/** Badge de registro de vida; null en sistemas contenedores. */
export function registroVidaUi(eq) {
  if (!eq || eq.tipo_nodo === "sistema") return null;
  const reg = registroVidaEquipo(eq);
  return REGISTRO_VIDA_UI[reg] ?? null;
}

/** Opciones del selector de registro (ajuste manual del cliente). */
export const REGISTRO_VIDA_CLIENTE = [
  { value: "horas", label: "Horas", desc: "Seguimiento por horÃ³metro propio o heredado." },
  { value: "fecha", label: "InstalaciÃ³n", desc: "Sin horÃ³metro; vida Ãºtil por fecha de instalaciÃ³n en la ficha." },
  { value: "mixto", label: "Mixto", desc: "HorÃ³metro y fecha de instalaciÃ³n (gobierno, viradores, etc.)." },
];

/** Modo de registro para UI de ediciÃ³n (agrupa horas + hereda_horas). */
export function registroVidaCliente(eq) {
  const r = registroVidaEquipo(eq);
  if (r === "hereda_horas" || r === "horas") return "horas";
  if (r === "fecha" || r === "mixto") return r;
  return "horas";
}

/** Tag _registro a persistir segÃºn modo cliente y horÃ³metro elegido. */
export function tagRegistroVidaCliente(clienteModo, horometro) {
  if (clienteModo === "fecha") return "fecha";
  if (clienteModo === "mixto") return "mixto";
  return horometro === "propio" ? "horas" : "hereda_horas";
}

/** Registro sugerido por plantilla (sin override en ficha). */
export function registroVidaPlantilla(eq) {
  if (!eq?.id_visible) return "hereda_horas";
  return registroDesdeIdVisible(eq.id_visible).registro;
}

/** Ficha y horÃ³metro al guardar un cambio de registro de vida. */
export function datosRegistroVidaCliente(clienteModo, horometro, eq = {}) {
  const tag = tagRegistroVidaCliente(clienteModo, horometro);
  const ficha = { ...(eq.ficha || {}), _registro: tag };
  if (clienteModo === "fecha") {
    return { horometro: "no", consume_aceite: false, ficha };
  }
  const hor = horometro === "propio" ? "propio" : "hereda";
  return {
    horometro: hor,
    consume_aceite: hor === "propio" ? !!eq.consume_aceite : false,
    ficha,
  };
}

/** Todas las asignaciones horas_fuente_id (explÃ­citas en Ã¡rbol + reglas de prefijo). */
export function collectFuentesPlantilla(nodos = PLANTILLA_PESQUERA) {
  const out = [];
  const seen = new Set();
  const add = (cod, fuente) => {
    if (!cod || !fuente) return;
    const key = `${cod}\0${fuente}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ cod, fuente });
  };
  const walk = (nodo) => {
    if (nodo.fuente) add(nodo.cod, nodo.fuente);
    const reg = registroDesdeNodo(nodo);
    if (reg.fuente && reg.registro !== "horas") add(nodo.cod, reg.fuente);
    for (const h of nodo.hijos || []) walk(h);
  };
  for (const s of nodos) walk(s);
  return out;
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
  generico:    { label: "GenÃ©rico",  tone: "slate",  desc: "GenÃ©rico certificado" },
};

// ============================================================
//  PLANTILLA PESQUERA INICIAL — derivada de PLANTILLA_PESQUERA
//  Filtra nodos con basico !== false. Siempre en sync con la
//  plantilla principal; no requiere mantenimiento separado.
// ============================================================
function _filtrarBasico(nodo) {
  if (nodo.basico === false) return null;
  const hijos = (nodo.hijos || []).map(_filtrarBasico).filter(Boolean);
  return { ...nodo, hijos };
}
export const PLANTILLA_PESQUERA_INICIAL = PLANTILLA_PESQUERA.map(_filtrarBasico).filter(Boolean);
export const contarNodosInicial     = () => contarNodosPlantilla("basico");
export const contarRepuestosInicial = () => contarRepuestosPlantilla("basico");
export const contarPlanesPMInicial  = () => contarPlanesPMPlantilla("basico");
