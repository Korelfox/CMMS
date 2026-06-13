// ============================================================
//  Lógica pura: Lucro Cesante (costo de indisponibilidad).
//  Cuantifica en $ el margen del armador que no se capturó
//  por días de paralización: fallas correctivas + varadas.
//  Todas las funciones son deterministas e inyectables para tests.
// ============================================================

const DIA_MS = 86_400_000;

// Margen promedio por día de mar del armador.
// plList: [{ dias, margen, tieneCaptura }] ya filtrados por nave y período
// (resultado de calcPL por marea). → $/día o null si no hay datos.
export function margenDiarioNave(plList = []) {
  const validas = (plList || []).filter((p) => p && p.dias > 0 && p.tieneCaptura);
  if (!validas.length) return null;
  const totalDias   = validas.reduce((s, p) => s + p.dias, 0);
  const totalMargen = validas.reduce((s, p) => s + p.margen, 0);
  return totalDias > 0 ? totalMargen / totalDias : null;
}

// OTs correctivas cerradas con MTTR registrado dentro del período.
// → [{ tipo, id, folio, descripcion, sistema, fecha, dias, costoOT }]
export function eventosCorrectivos(ots = [], embId, corteISO = "") {
  return (ots || [])
    .filter(
      (o) =>
        o.embarcacion_id === embId &&
        o.tipo === "correctivo" &&
        o.estado === "cerrada" &&
        Number(o.mttr_horas) > 0 &&
        (!corteISO || !o.fecha || o.fecha >= corteISO)
    )
    .map((o) => ({
      tipo:        "correctiva",
      id:          o.id,
      folio:       o.folio || "—",
      descripcion: (o.descripcion || o.sistema || "Sin descripción").slice(0, 80),
      sistema:     o.sistema || null,
      fecha:       o.fecha || null,
      dias:        Number(o.mttr_horas) / 24,
      costoOT:     (Number(o.costo_mo) || 0) + (Number(o.costo_mat) || 0),
    }));
}

// Varadas cerradas con duración real dentro del período.
// → [{ tipo, id, descripcion, sistema, fecha, fechaFin, dias, costoOT }]
export function eventosVaradas(varadas = [], embId, corteISO = "") {
  return (varadas || [])
    .filter(
      (v) =>
        v.embarcacion_id === embId &&
        v.estado === "cerrada" &&
        v.fecha_inicio &&
        v.fecha_fin_real &&
        (!corteISO || v.fecha_inicio >= corteISO)
    )
    .map((v) => {
      const dias = Math.max(
        0,
        (new Date(v.fecha_fin_real + "T00:00:00") - new Date(v.fecha_inicio + "T00:00:00")) / DIA_MS
      );
      return {
        tipo:        "varada",
        id:          v.id,
        descripcion: v.nombre || "Varada",
        sistema:     v.tipo || null,
        fecha:       v.fecha_inicio,
        fechaFin:    v.fecha_fin_real,
        dias,
        costoOT:     0,
      };
    });
}

// Lucro cesante completo de una nave: paralización × margen/día.
// Incluye costo preventivo para calcular el ratio de exposición.
export function lucroCesanteNave({ plList = [], ots = [], varadas = [], embId, corteISO = "" }) {
  const margenDia = margenDiarioNave(plList);

  const evCorr    = eventosCorrectivos(ots, embId, corteISO);
  const evVar     = eventosVaradas(varadas, embId, corteISO);

  const diasCorr   = evCorr.reduce((s, e) => s + e.dias, 0);
  const diasVarada = evVar.reduce((s, e) => s + e.dias, 0);
  const totalDias  = diasCorr + diasVarada;

  const lucroCorr   = margenDia != null ? diasCorr   * margenDia : null;
  const lucroVarada = margenDia != null ? diasVarada * margenDia : null;
  const lucroTotal  = margenDia != null ? totalDias  * margenDia : null;

  const otsPrev = (ots || []).filter(
    (o) =>
      o.embarcacion_id === embId &&
      o.tipo === "preventivo" &&
      (!corteISO || !o.fecha || o.fecha >= corteISO)
  );
  const costoPrev = otsPrev.reduce(
    (s, o) => s + (Number(o.costo_mo) || 0) + (Number(o.costo_mat) || 0),
    0
  );
  const costoCorr = evCorr.reduce((s, e) => s + e.costoOT, 0);

  return {
    margenDia,
    diasCorr,
    diasVarada,
    totalDias,
    lucroCorr,
    lucroVarada,
    lucroTotal,
    costoPrev,
    costoCorr,
    eventos: [...evCorr, ...evVar].sort(
      (a, b) => (b.fecha || "").localeCompare(a.fecha || "")
    ),
  };
}
