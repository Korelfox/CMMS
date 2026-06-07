export function calcPL(marea, capturas = [], eco, otsNave = []) {
  if (!marea) return null;
  const lineas = capturas.filter((c) => c.marea_id === marea.id);
  const valorBruto = lineas.reduce((s, c) => s + (c.kg || 0) * (c.precio_kg || 0), 0);
  const kgTotal    = lineas.reduce((s, c) => s + (c.kg || 0), 0);

  const combCons  = Math.max(0, (marea.comb_ini  || 0) - (marea.comb_fin  || 0));
  const aceiteCons= Math.max(0, (marea.aceite_ini|| 0) - (marea.aceite_fin|| 0));

  const pComb    = eco?.precio_combustible_l || 0;
  const pAceite  = eco?.precio_aceite_l      || 0;

  // ── Gastos del pozo ──
  const costoComb    = combCons * pComb;
  const costoViveres = eco?.costo_viveres || 0;
  const costoHielo   = eco?.costo_hielo   || 0;
  const costoCarnada = eco?.costo_carnada || 0;
  const gastosPozo   = costoComb + costoViveres + costoHielo + costoCarnada;

  // ── Reparto ──
  const liquido        = Math.max(0, valorBruto - gastosPozo);
  const pct            = eco?.parte_tripulacion_pct ?? 50;
  const parteTrip      = liquido * (pct / 100);
  const ingresoArmador = liquido - parteTrip;
  const numTrip        = eco?.num_tripulantes || 0;
  const porTripulante  = numTrip > 0 ? parteTrip / numTrip : null;

  // ── Costos del armador ──
  const costoAceite  = aceiteCons * pAceite;
  const otsEnMarea   = otsNave.filter((o) =>
    o.embarcacion_id === marea.embarcacion_id
    && o.fecha && marea.zarpe_at && marea.recalada_at
    && new Date(o.fecha) >= new Date(marea.zarpe_at)
    && new Date(o.fecha) <= new Date(marea.recalada_at));
  const costoOTs = otsEnMarea.reduce((s, o) => s + (Number(o.costo_mo) || 0) + (Number(o.costo_mat) || 0), 0);
  const costoOtros    = eco?.costo_otros || 0;
  const costosArmador = costoAceite + costoOTs + costoOtros;
  const margen        = ingresoArmador - costosArmador;

  const dias = marea.zarpe_at && marea.recalada_at
    ? Math.max(0.01, (new Date(marea.recalada_at) - new Date(marea.zarpe_at)) / 86400000) : null;

  return {
    valorBruto, kgTotal, combCons, aceiteCons,
    costoComb, costoViveres, costoHielo, costoCarnada, gastosPozo,
    liquido, pct, parteTrip, numTrip, porTripulante, ingresoArmador,
    costoAceite, costoOTs, costoOtros, costosArmador, margen,
    margenPct:          valorBruto > 0    ? (margen / valorBruto) * 100    : null,
    margenSobreIngreso: ingresoArmador > 0? (margen / ingresoArmador) * 100: null,
    armadorPorKg:       kgTotal > 0       ? ingresoArmador / kgTotal       : null,
    margenPorDia:       dias              ? margen / dias                  : null,
    precioProm:         kgTotal > 0       ? valorBruto / kgTotal           : null,
    dias, tieneCaptura: lineas.length > 0, tieneEco: !!eco, lineas, otsEnMarea,
  };
}
