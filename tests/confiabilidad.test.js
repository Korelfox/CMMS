import { describe, it, expect } from "vitest";
import {
  ttfsDiasCalendario,
  horasEnFecha,
  ttfsHorasOper,
  confiabilidad,
  probFalla,
  tasaFalla,
  mtbfDias,
  cuantilWeibull,
  vidaUtilResidual,
  puntosCurva,
  interpretarBeta,
  analizarEquipo,
  rankearFlota,
} from "../src/lib/confiabilidad.js";

const HOY  = "2026-06-13";
const EQ1  = "eq-1";
const EQ2  = "eq-2";

const equipos = [
  { id: EQ1, embarcacion_id: "emb-1", id_visible: "DP-MOTOR",   sistema: "Motor principal", criticidad: "A" },
  { id: EQ2, embarcacion_id: "emb-2", id_visible: "MS-HIDRAUL", sistema: "Hidráulica",       criticidad: "B" },
];

// EQ1: 5 OTs correctivas → 4 TTFs ≈ [40, 43, 46, 52] días
// Última falla: 2025-07-01 → diasUltFalla ≈ 347 días a HOY
const otsEq1 = [
  { id: "o1", equipo_id: EQ1, tipo: "correctivo", estado: "cerrada", fecha: "2025-01-01" },
  { id: "o2", equipo_id: EQ1, tipo: "correctivo", estado: "cerrada", fecha: "2025-02-10" }, // +40d
  { id: "o3", equipo_id: EQ1, tipo: "correctivo", estado: "cerrada", fecha: "2025-03-25" }, // +43d
  { id: "o4", equipo_id: EQ1, tipo: "correctivo", estado: "cerrada", fecha: "2025-05-10" }, // +46d
  { id: "o5", equipo_id: EQ1, tipo: "correctivo", estado: "cerrada", fecha: "2025-07-01" }, // +52d
];
// OT preventiva no debe contar como falla
const otPreventiva = { id: "p1", equipo_id: EQ1, tipo: "preventivo", estado: "cerrada", fecha: "2025-03-01" };

// ── ttfsDiasCalendario ────────────────────────────────────────────────────────
describe("ttfsDiasCalendario", () => {
  it("retorna [] con 0 OTs", () => {
    expect(ttfsDiasCalendario(EQ1, [])).toHaveLength(0);
  });

  it("retorna [] con solo 1 OT correctiva", () => {
    expect(ttfsDiasCalendario(EQ1, [otsEq1[0]])).toHaveLength(0);
  });

  it("calcula 4 intervalos para 5 OTs", () => {
    const ttfs = ttfsDiasCalendario(EQ1, otsEq1);
    expect(ttfs).toHaveLength(4);
  });

  it("primer intervalo ≈ 40 días (1 ene → 10 feb)", () => {
    const ttfs = ttfsDiasCalendario(EQ1, otsEq1);
    expect(ttfs[0]).toBeCloseTo(40, 0);
  });

  it("ignora OTs preventivas", () => {
    const ots = [...otsEq1, otPreventiva];
    expect(ttfsDiasCalendario(EQ1, ots)).toHaveLength(4); // igual que sin la preventiva
  });

  it("ignora OTs de otro equipo", () => {
    const otsOtro = otsEq1.map((o) => ({ ...o, equipo_id: EQ2 }));
    expect(ttfsDiasCalendario(EQ1, otsOtro)).toHaveLength(0);
  });
});

// ── confiabilidad y probFalla ─────────────────────────────────────────────────
describe("confiabilidad / probFalla", () => {
  it("R(0) = 1 para cualquier β/η", () => {
    expect(confiabilidad(0, 2, 100)).toBe(1);
    expect(confiabilidad(0, 1, 500)).toBe(1);
  });

  it("R(η) = e⁻¹ ≈ 0.368 para cualquier β (propiedad de η)", () => {
    const eInv = Math.exp(-1);
    expect(confiabilidad(100, 1, 100)).toBeCloseTo(eInv, 4);
    expect(confiabilidad(100, 2, 100)).toBeCloseTo(eInv, 4);
    expect(confiabilidad(100, 3, 100)).toBeCloseTo(eInv, 4);
  });

  it("R(t→∞) → 0", () => {
    expect(confiabilidad(99999, 2, 100)).toBeCloseTo(0, 6);
  });

  it("F(t) + R(t) = 1", () => {
    expect(probFalla(60, 2, 100) + confiabilidad(60, 2, 100)).toBeCloseTo(1, 10);
  });

  it("F(t) es monótonamente no decreciente", () => {
    const ts = [0, 20, 40, 60, 80, 100, 150, 200];
    const fs = ts.map((t) => probFalla(t, 2, 100));
    for (let i = 1; i < fs.length; i++) expect(fs[i]).toBeGreaterThanOrEqual(fs[i - 1]);
  });
});

// ── tasaFalla ─────────────────────────────────────────────────────────────────
describe("tasaFalla", () => {
  it("β<1 → tasa decreciente (mortalidad infantil)", () => {
    const h1 = tasaFalla(10, 0.5, 100);
    const h2 = tasaFalla(50, 0.5, 100);
    expect(h1).toBeGreaterThan(h2);
  });

  it("β>1 → tasa creciente (desgaste)", () => {
    const h1 = tasaFalla(30, 2, 100);
    const h2 = tasaFalla(80, 2, 100);
    expect(h2).toBeGreaterThan(h1);
  });

  it("t=0 retorna 0", () => {
    expect(tasaFalla(0, 2, 100)).toBe(0);
  });
});

// ── mtbfDias ──────────────────────────────────────────────────────────────────
describe("mtbfDias", () => {
  it("MTBF = η cuando β=1 (Γ(2) = 1)", () => {
    expect(mtbfDias(1, 100)).toBeCloseTo(100, 1);
  });

  it("retorna null con parámetros inválidos", () => {
    expect(mtbfDias(0, 100)).toBeNull();
    expect(mtbfDias(2, 0)).toBeNull();
    expect(mtbfDias(null, 100)).toBeNull();
  });
});

// ── cuantilWeibull ────────────────────────────────────────────────────────────
describe("cuantilWeibull", () => {
  it("B(1−e⁻¹) = η para cualquier β (propiedad de η como vida característica)", () => {
    const p = 1 - Math.exp(-1); // ≈ 0.6321
    expect(cuantilWeibull(p, 2, 100)).toBeCloseTo(100, 1);
    expect(cuantilWeibull(p, 1.5, 200)).toBeCloseTo(200, 1);
  });

  it("probFalla(B50, β, η) ≈ 0.5", () => {
    const B50 = cuantilWeibull(0.5, 2, 100);
    expect(probFalla(B50, 2, 100)).toBeCloseTo(0.5, 4);
  });

  it("B10 < B50 < B90 (cuantiles crecientes)", () => {
    const B10 = cuantilWeibull(0.1, 2, 100);
    const B50 = cuantilWeibull(0.5, 2, 100);
    const B90 = cuantilWeibull(0.9, 2, 100);
    expect(B10).toBeLessThan(B50);
    expect(B50).toBeLessThan(B90);
  });

  it("retorna null para p fuera de (0,1)", () => {
    expect(cuantilWeibull(0, 2, 100)).toBeNull();
    expect(cuantilWeibull(1, 2, 100)).toBeNull();
    expect(cuantilWeibull(-0.1, 2, 100)).toBeNull();
  });
});

// ── vidaUtilResidual ──────────────────────────────────────────────────────────
describe("vidaUtilResidual", () => {
  it("VUR50 es positiva cuando el equipo opera antes del MTBF", () => {
    const rul = vidaUtilResidual(30, 2, 100);
    expect(rul).toBeGreaterThan(0);
  });

  it("VUR decrece conforme aumenta tActual (el equipo envejece)", () => {
    const r1 = vidaUtilResidual(20, 2, 100, 0.5);
    const r2 = vidaUtilResidual(60, 2, 100, 0.5);
    expect(r1).toBeGreaterThan(r2);
  });

  it("VUR85 > VUR50 (mayor confianza = más tiempo de margen)", () => {
    const r50 = vidaUtilResidual(40, 2, 100, 0.50);
    const r85 = vidaUtilResidual(40, 2, 100, 0.85);
    expect(r85).toBeGreaterThan(r50);
  });

  it("retorna null con parámetros inválidos", () => {
    expect(vidaUtilResidual(null, 2, 100)).toBeNull();
    expect(vidaUtilResidual(30, 0, 100)).toBeNull();
    expect(vidaUtilResidual(30, 2, null)).toBeNull();
  });
});

// ── puntosCurva ───────────────────────────────────────────────────────────────
describe("puntosCurva", () => {
  it("retorna nPuntos+1 entradas", () => {
    expect(puntosCurva(2, 100, 60)).toHaveLength(61);
  });

  it("primer punto tiene prob=0", () => {
    expect(puntosCurva(2, 100)[0].prob).toBe(0);
  });

  it("último punto tiene prob≥0.99 (cubre B99.9)", () => {
    const pts = puntosCurva(2, 100, 100);
    expect(pts[pts.length - 1].prob).toBeGreaterThan(0.99);
  });

  it("curva es monótonamente no decreciente", () => {
    const pts = puntosCurva(2, 100, 50);
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i].prob).toBeGreaterThanOrEqual(pts[i - 1].prob);
    }
  });

  it("retorna [] con parámetros inválidos", () => {
    expect(puntosCurva(0, 100)).toHaveLength(0);
    expect(puntosCurva(2, null)).toHaveLength(0);
  });
});

// ── interpretarBeta ───────────────────────────────────────────────────────────
describe("interpretarBeta", () => {
  it("β=0.5 → mortalidad infantil", () => {
    expect(interpretarBeta(0.5).texto).toMatch(/infantil/i);
  });
  it("β=1.0 → fallas aleatorias", () => {
    expect(interpretarBeta(1.0).texto).toMatch(/aleatoria/i);
  });
  it("β=3.0 → desgaste progresivo", () => {
    expect(interpretarBeta(3.0).texto).toMatch(/progresivo/i);
  });
  it("β=null → null", () => {
    expect(interpretarBeta(null)).toBeNull();
  });
});

// ── analizarEquipo ────────────────────────────────────────────────────────────
describe("analizarEquipo", () => {
  it("zona=sin_datos cuando no hay OTs correctivas", () => {
    const r = analizarEquipo({ equipo: equipos[0], ots: [], hoy: HOY });
    expect(r.zona).toBe("sin_datos");
    expect(r.pF).toBeNull();
    expect(r.ajuste).toBeNull();
  });

  it("zona=sin_datos con solo 2 OTs (TTFs < 3, ajustarWeibull retorna null)", () => {
    const r = analizarEquipo({ equipo: equipos[0], ots: otsEq1.slice(0, 2), hoy: HOY });
    expect(r.ajuste).toBeNull();
    expect(r.zona).toBe("sin_datos");
  });

  it("ajusta Weibull y calcula pF con ≥4 OTs (≥3 TTFs)", () => {
    const r = analizarEquipo({ equipo: equipos[0], ots: otsEq1, hoy: HOY });
    expect(r.ajuste).not.toBeNull();
    expect(r.beta).toBeGreaterThan(0);
    expect(r.eta).toBeGreaterThan(0);
    expect(r.pF).not.toBeNull();
    expect(r.pF).toBeGreaterThanOrEqual(0);
    expect(r.pF).toBeLessThanOrEqual(1);
  });

  it("diasUltFalla ≈ 347 días (2025-07-01 → 2026-06-13)", () => {
    const r = analizarEquipo({ equipo: equipos[0], ots: otsEq1, hoy: HOY });
    expect(r.diasUltFalla).toBeCloseTo(347, 0);
  });

  it("nFallas = 5 con 5 OTs correctivas", () => {
    const r = analizarEquipo({ equipo: equipos[0], ots: otsEq1, hoy: HOY });
    expect(r.nFallas).toBe(5);
  });

  it("rul50 < rul85 (mayor confianza requiere más tiempo)", () => {
    const r = analizarEquipo({ equipo: equipos[0], ots: otsEq1, hoy: HOY });
    if (r.rul50 != null && r.rul85 != null) {
      expect(r.rul85).toBeGreaterThan(r.rul50);
    }
  });
});

// ── rankearFlota ──────────────────────────────────────────────────────────────
describe("rankearFlota", () => {
  it("retorna un resultado por equipo", () => {
    const r = rankearFlota({ equipos, ots: otsEq1, hoy: HOY });
    expect(r).toHaveLength(2);
  });

  it("EQ2 (sin datos) queda después de EQ1 (con datos)", () => {
    const r = rankearFlota({ equipos, ots: otsEq1, hoy: HOY });
    const i1 = r.findIndex((x) => x.equipo.id === EQ1);
    const i2 = r.findIndex((x) => x.equipo.id === EQ2);
    expect(i1).toBeLessThan(i2);
  });

  it("flota vacía → []", () => {
    expect(rankearFlota({ hoy: HOY })).toHaveLength(0);
  });

  it("equipos con mayor pF aparecen primero dentro de la misma zona", () => {
    const eqA = { id: "a", embarcacion_id: "e1", id_visible: "A", criticidad: "A" };
    const eqB = { id: "b", embarcacion_id: "e1", id_visible: "B", criticidad: "A" };
    // 5 fallas para eqA con intervalos cortos (~10d → pF alta dado t largo)
    const otsA = Array.from({ length: 5 }, (_, i) => ({
      id: `a${i}`, equipo_id: "a", tipo: "correctivo",
      fecha: new Date(new Date("2025-01-01").getTime() + i * 10 * DIA_MS).toISOString().slice(0, 10),
    }));
    // 5 fallas para eqB con intervalos largos (~150d → pF baja dado t corto)
    const otsB = Array.from({ length: 5 }, (_, i) => ({
      id: `b${i}`, equipo_id: "b", tipo: "correctivo",
      fecha: new Date(new Date("2023-01-01").getTime() + i * 150 * DIA_MS).toISOString().slice(0, 10),
    }));
    const r = rankearFlota({ equipos: [eqA, eqB], ots: [...otsA, ...otsB], hoy: HOY });
    expect(r[0].equipo.id).toBe("a"); // intervalos cortos → mayor pF → primero
  });
});

// ── horasEnFecha ──────────────────────────────────────────────────────────────
describe("horasEnFecha", () => {
  // 3 lecturas para EQ1: 800h el 15-dic-2024, 3500h el 1-jul-2025, 5200h el 31-dic-2025
  const LECT = [
    { equipo_id: EQ1, fecha: "2024-12-15T00:00:00", horas: 800 },
    { equipo_id: EQ1, fecha: "2025-07-01T00:00:00", horas: 3500 },
    { equipo_id: EQ1, fecha: "2025-12-31T00:00:00", horas: 5200 },
  ];

  it("retorna null si no hay lecturas", () => {
    expect(horasEnFecha(EQ1, Date.now(), [])).toBeNull();
  });

  it("retorna null para fecha anterior a la primera lectura", () => {
    const antes = new Date("2024-11-01T00:00:00").getTime();
    expect(horasEnFecha(EQ1, antes, LECT)).toBeNull();
  });

  it("retorna el valor exacto en el timestamp de la primera lectura", () => {
    const t = new Date("2024-12-15T00:00:00").getTime();
    expect(horasEnFecha(EQ1, t, LECT)).toBeCloseTo(800, 0);
  });

  it("interpola linealmente entre dos lecturas adyacentes", () => {
    // 2025-01-01 está a 17d del 15-dic dentro de un tramo de 198d (→ frac≈0.086)
    const t = new Date("2025-01-01T00:00:00").getTime();
    const v = horasEnFecha(EQ1, t, LECT);
    expect(v).toBeGreaterThan(800);
    expect(v).toBeLessThan(3500);
    // Verificación: 800 + (17/198)*(3500-800) ≈ 800 + 231.8 ≈ 1031.8
    expect(v).toBeCloseTo(1031.8, 0);
  });

  it("retorna el último valor conocido para fecha posterior a la última lectura", () => {
    const futuro = new Date("2027-01-01T00:00:00").getTime();
    expect(horasEnFecha(EQ1, futuro, LECT)).toBeCloseTo(5200, 0);
  });

  it("retorna null para equipo sin lecturas (otro equipo)", () => {
    const t = new Date("2025-07-01T00:00:00").getTime();
    expect(horasEnFecha(EQ2, t, LECT)).toBeNull();
  });
});

// ── ttfsHorasOper ─────────────────────────────────────────────────────────────
describe("ttfsHorasOper", () => {
  // Lecturas cubre todo el rango de otsEq1 (2025-01-01 a 2025-07-01)
  const LECT = [
    { equipo_id: EQ1, fecha: "2024-12-15T00:00:00", horas: 800  },
    { equipo_id: EQ1, fecha: "2025-07-10T00:00:00", horas: 3700 },  // +2900h en 207d ≈ 14 h/d
    { equipo_id: EQ1, fecha: "2025-12-31T00:00:00", horas: 5200 },
  ];

  it("retorna [] si no hay lecturas", () => {
    expect(ttfsHorasOper(EQ1, otsEq1, [])).toHaveLength(0);
  });

  it("retorna [] con solo 1 OT correctiva", () => {
    expect(ttfsHorasOper(EQ1, [otsEq1[0]], LECT)).toHaveLength(0);
  });

  it("calcula TTFs en horas para pares dentro del rango de lecturas", () => {
    const ttfs = ttfsHorasOper(EQ1, otsEq1, LECT);
    // Los 5 OTs de otsEq1 están todos en 2025-01-01 a 2025-07-01, dentro de lecturas
    expect(ttfs.length).toBe(4);
    ttfs.forEach((t) => expect(t).toBeGreaterThan(0));
  });

  it("TTF en horas es proporcional a uso real (≈ días × h/día)", () => {
    const ttfs = ttfsHorasOper(EQ1, otsEq1, LECT);
    // Primer intervalo: ≈40 días × ~14 h/d ≈ 560h
    expect(ttfs[0]).toBeGreaterThan(100);   // mínimo razonable
    expect(ttfs[0]).toBeLessThan(2000);     // máximo físico (83d × 24h)
  });

  it("omite intervalos cuyo extremo inferior es anterior a la primera lectura", () => {
    const otsConAntes = [
      { id: "pre", equipo_id: EQ1, tipo: "correctivo", fecha: "2024-10-01" },
      ...otsEq1,
    ];
    const ttfs = ttfsHorasOper(EQ1, otsConAntes, LECT);
    // par (2024-10-01, 2025-01-01): h0 = null → omitido
    // pares dentro de otsEq1: 4 válidos
    expect(ttfs).toHaveLength(4);
  });

  it("retorna [] si el equipo no tiene lecturas", () => {
    expect(ttfsHorasOper(EQ2, otsEq1.map((o) => ({ ...o, equipo_id: EQ2 })), LECT)).toHaveLength(0);
  });
});

// ── analizarEquipo modo horas ─────────────────────────────────────────────────
describe("analizarEquipo con lecturas (modo horas ISO 14224)", () => {
  const LECT_H = [
    { equipo_id: EQ1, fecha: "2024-12-15T00:00:00", horas: 800  },
    { equipo_id: EQ1, fecha: "2025-07-10T00:00:00", horas: 3700 },
    { equipo_id: EQ1, fecha: "2026-01-15T00:00:00", horas: 6000 },
  ];

  it("usa horas cuando hay ≥3 TTFs con cobertura → unidad='h'", () => {
    const r = analizarEquipo({ equipo: equipos[0], ots: otsEq1, lecturas: LECT_H, hoy: HOY });
    expect(r.unidad).toBe("h");
  });

  it("β y η positivos en modo horas; η en horas (>> 1)", () => {
    const r = analizarEquipo({ equipo: equipos[0], ots: otsEq1, lecturas: LECT_H, hoy: HOY });
    if (r.ajuste) {
      expect(r.beta).toBeGreaterThan(0);
      expect(r.eta).toBeGreaterThan(24);   // vida característica > 1 día en horas
    }
  });

  it("tActual en horas es > 0 (hay lecturas posteriores a la última falla)", () => {
    const r = analizarEquipo({ equipo: equipos[0], ots: otsEq1, lecturas: LECT_H, hoy: HOY });
    if (r.unidad === "h" && r.tActual != null) {
      expect(r.tActual).toBeGreaterThan(0);
    }
  });

  it("sin lecturas → unidad='d' (fallback a días calendario)", () => {
    const r = analizarEquipo({ equipo: equipos[0], ots: otsEq1, lecturas: [], hoy: HOY });
    expect(r.unidad).toBe("d");
  });

  it("β en horas ≠ β en días (el parámetro de forma cambia con la unidad correcta)", () => {
    const rH = analizarEquipo({ equipo: equipos[0], ots: otsEq1, lecturas: LECT_H, hoy: HOY });
    const rD = analizarEquipo({ equipo: equipos[0], ots: otsEq1, lecturas: [],     hoy: HOY });
    if (rH.ajuste && rD.ajuste) {
      // β podría coincidir por casualidad en datos sintéticos, pero los TTFs son distintos
      expect(rH.eta).not.toBeCloseTo(rD.eta, 0);
    }
  });
});

// Helper para test de ranking (DIA_MS necesario en tests del módulo)
const DIA_MS = 86_400_000;
