import { describe, it, expect } from "vitest";
import { construirResumenFlota } from "../src/lib/copiloto.js";
import { riesgoFlota } from "../src/lib/riesgo.js";

const HOY  = "2026-06-13";
const EMB1 = "emb-1";
const EMB2 = "emb-2";
const EQ1  = "eq-1";
const EQ2  = "eq-2";

const empresa      = { id: "emp-1", nombre: "Pesquera Ejemplo" };
const embarcaciones = [
  { id: EMB1, nombre: "Don Pedro",   tipo: "arrastrero", matricula: "DP-01" },
  { id: EMB2, nombre: "María Sofía", tipo: "cerquero",   matricula: "MS-02" },
];
const equipos = [
  { id: EQ1, embarcacion_id: EMB1, id_visible: "DP-MOTOR", sistema: "Motor principal", criticidad: "A" },
  { id: EQ2, embarcacion_id: EMB2, id_visible: "MS-MOTOR", sistema: "Motor principal", criticidad: "B" },
];

// planesEval simula la salida de evaluarPlanes()
const planesEval = [
  { equipo: equipos[0], plan: { descripcion: "Cambio aceite" }, tone: "red",    label: "Vencido"  },
  { equipo: equipos[1], plan: { descripcion: "Filtros"       }, tone: "yellow", label: "Próximo"  },
  { equipo: equipos[0], plan: { descripcion: "Inyectores"    }, tone: "green",  label: "OK"       },
];

const ots = [
  // correctiva cerrada dentro de 30d
  { id: "o1", equipo_id: EQ1, embarcacion_id: EMB1, tipo: "correctivo", estado: "cerrada", fecha: "2026-06-01" },
  // correctiva abierta
  { id: "o2", equipo_id: EQ1, embarcacion_id: EMB1, tipo: "correctivo", estado: "abierta", fecha: "2026-06-05" },
  // preventiva abierta
  { id: "o3", equipo_id: EQ2, embarcacion_id: EMB2, tipo: "preventivo", estado: "abierta", fecha: "2026-06-08" },
  // correctiva cerrada fuera de 30d
  { id: "o4", equipo_id: EQ1, embarcacion_id: EMB1, tipo: "correctivo", estado: "cerrada", fecha: "2026-01-01" },
];

const items    = [{ id: "i1", codigo: "FIL-01", descripcion: "Filtro aceite Motor" }];
const destinos = [{ item_id: "i1", equipo_id: EQ1 }]; // vinculado a EQ1 (crit A)
const stock    = [];                                    // sin stock → sin cobertura

// ── construirResumenFlota ──────────────────────────────────────────────────────
describe("construirResumenFlota", () => {
  it("retorna nombre empresa y lista de naves", () => {
    const r = construirResumenFlota({ empresa, embarcaciones, equipos, planesEval, ots, items, stock, destinos, hoy: HOY });
    expect(r.empresa).toBe("Pesquera Ejemplo");
    expect(r.flota).toHaveLength(2);
    expect(r.flota.map((n) => n.nombre)).toContain("Don Pedro");
  });

  it("cuenta equipos por criticidad", () => {
    const r = construirResumenFlota({ empresa, embarcaciones, equipos, planesEval, ots, items, stock, destinos, hoy: HOY });
    expect(r.equipos.total).toBe(2);
    expect(r.equipos.criticidadA).toBe(1);
    expect(r.equipos.criticidadB).toBe(1);
  });

  it("cuenta PMs vencidos y próximos por tono", () => {
    const r = construirResumenFlota({ empresa, embarcaciones, equipos, planesEval, ots, items, stock, destinos, hoy: HOY });
    expect(r.mantenimiento.pmVencidos).toBe(1);
    expect(r.mantenimiento.pmProximos30d).toBe(1);
  });

  it("asigna PMs vencidos a la nave correcta", () => {
    const r = construirResumenFlota({ empresa, embarcaciones, equipos, planesEval, ots, items, stock, destinos, hoy: HOY });
    expect(r.mantenimiento.pmVencidosPorNave["Don Pedro"]).toBe(1);
    expect(r.mantenimiento.pmVencidosPorNave["María Sofía"]).toBeUndefined();
  });

  it("cuenta OTs abiertas y distingue correctivas", () => {
    const r = construirResumenFlota({ empresa, embarcaciones, equipos, planesEval, ots, items, stock, destinos, hoy: HOY });
    expect(r.mantenimiento.otsAbiertas).toBe(2);   // o2 + o3
    expect(r.mantenimiento.otsCorrectivas).toBe(1); // solo o2
  });

  it("cuenta solo correctivas cerradas dentro de 30d", () => {
    const r = construirResumenFlota({ empresa, embarcaciones, equipos, planesEval, ots, items, stock, destinos, hoy: HOY });
    // o1: 2026-06-01 dentro de 30d ✓  |  o4: 2026-01-01 fuera de 30d ✗
    expect(r.mantenimiento.correctivasUltimos30d).toBe(1);
  });

  it("identifica repuestos críticos sin stock", () => {
    const r = construirResumenFlota({ empresa, embarcaciones, equipos, planesEval, ots, items, stock, destinos, hoy: HOY });
    expect(r.inventario.repuestosCriticosSinStock).toHaveLength(1);
    expect(r.inventario.repuestosCriticosSinStock[0].codigo).toBe("FIL-01");
    expect(r.inventario.repuestosCriticosSinStock[0].equiposCriticos).toContain("DP-MOTOR");
  });

  it("ranking de riesgo incluye score y zona", () => {
    const riesgoRanking = riesgoFlota({ planesEval, ots, equipos, hoy: HOY });
    const r = construirResumenFlota({ empresa, embarcaciones, equipos, planesEval, riesgoRanking, ots, items, stock, destinos, hoy: HOY });
    expect(r.riesgo.topEquiposRiesgo.length).toBeGreaterThan(0);
    const top = r.riesgo.topEquiposRiesgo[0];
    expect(top).toHaveProperty("score");
    expect(top).toHaveProperty("zona");
    expect(top).toHaveProperty("nave");
    // EQ1 (crit A, PM rojo) debe encabezar el ranking
    expect(top.equipo).toBe("DP-MOTOR");
  });

  it("datos vacíos no rompen y retornan ceros", () => {
    const r = construirResumenFlota({ hoy: HOY });
    expect(r.empresa).toBe("Desconocida");
    expect(r.flota).toHaveLength(0);
    expect(r.mantenimiento.pmVencidos).toBe(0);
    expect(r.riesgo.enZonaRoja).toBe(0);
    expect(r.inventario.repuestosCriticosSinStock).toHaveLength(0);
  });

  it("repuesto con stock no aparece como sin cobertura", () => {
    const conStock = [{ item_id: "i1", cantidad: 5 }];
    const r = construirResumenFlota({ empresa, embarcaciones, equipos, planesEval, ots, items, stock: conStock, destinos, hoy: HOY });
    expect(r.inventario.repuestosCriticosSinStock).toHaveLength(0);
  });
});
