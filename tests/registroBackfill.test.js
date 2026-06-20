import { describe, it, expect } from "vitest";
import { registroDesdeIdVisible } from "../src/lib/plantillaPesquera.js";

/** Espejo de regexp_replace(id_visible, '^[^-]+-', '') en la migración SQL. */
const codPlantilla = (idVisible) => idVisible.replace(/^[^-]+-/, "");

/** Espejo de las reglas de backfill horometro = propio (solo si hereda). */
const backfillPropio = (cod) => /^(MTR|GEN-MTR|GEN-EMG|HPU-MTR|AIR-ARR-CMP|AIR-SRV-CMP|RSW-CMP-CMP)$/.test(cod);

/** Espejo de backfill horometro = no (solo si hereda). */
const backfillNo = (cod) => /^(STR-|NAV-|COMM-|SAF-|FISH-TRA|FISH-LIN|ANCH-ANC|ANCH-BIT|FUEL-TNK|WAT-LST|WAT-TND|ELEC-ALU-NAV|FIRE-EXT)/.test(cod);

const backfillRegistroFicha = (cod) => {
  if (/^(STEER-|FISH-VIR|FISH-GRU)/.test(cod)) return "mixto";
  if (/^(STR-|NAV-|COMM-|SAF-|FISH-TRA|FISH-LIN|ANCH-ANC|ANCH-BIT|FUEL-TNK|WAT-LST|WAT-TND|ELEC-ALU-NAV|FIRE-EXT)/.test(cod)) return "fecha";
  return null;
};

describe("Backfill registro vida — coherencia SQL vs plantilla JS", () => {
  const casos = [
    ["BC01-MTR", "horas", "propio"],
    ["BC01-NAV-GPS", "fecha", "no"],
    ["BC01-STEER-PWR", "mixto", "hereda"],
    ["BC01-FISH-VIR", "mixto", "hereda"],
    ["BC01-STR-CAS", "fecha", "no"],
    ["BC01-AIR-ARR-CMP", "horas", "propio"],
    ["BC01-MTR-LUB-FLT", "hereda_horas", "hereda"],
    ["BC01-PROP-RED", "hereda_horas", "hereda"],
  ];

  it.each(casos)("id_visible %s → registro JS alineado con SQL", (idVis, registro, horometroObjetivo) => {
    const cod = codPlantilla(idVis);
    const reg = registroDesdeIdVisible(idVis);
    expect(reg.registro).toBe(registro);
    expect(reg.horometro).toBe(horometroObjetivo);

    if (horometroObjetivo === "propio") expect(backfillPropio(cod)).toBe(true);
    if (horometroObjetivo === "no") expect(backfillNo(cod)).toBe(true);
    if (registro === "fecha" || registro === "mixto") {
      expect(backfillRegistroFicha(cod)).toBe(registro);
    }
  });

  it("transmisión y gobierno reciben fuente en precarga (collectFuentes)", async () => {
    const { collectFuentesPlantilla } = await import("../src/lib/plantillaPesquera.js");
    const fuentes = collectFuentesPlantilla();
    expect(fuentes).toContainEqual({ cod: "PROP-RED", fuente: "MTR" });
    expect(fuentes).toContainEqual({ cod: "STEER-PWR", fuente: "HPU-MTR" });
  });
});
