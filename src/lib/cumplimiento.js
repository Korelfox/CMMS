// Lógica pura de Cumplimiento normativo (estado de documentos por vencimiento).
export const DIAS_HABILES_AVISO = 15;

// Días hábiles (lun-vie) entre dos fechas (no cuenta feriados).
export function diasHabilesEntre(desde, hasta) {
  let n = 0;
  const d = new Date(desde); d.setHours(0, 0, 0, 0);
  const fin = new Date(hasta); fin.setHours(0, 0, 0, 0);
  while (d < fin) { d.setDate(d.getDate() + 1); const w = d.getDay(); if (w !== 0 && w !== 6) n++; }
  return n;
}

// Estado de un documento según su vencimiento. `hoy` inyectable para pruebas.
export function estadoDoc(doc, hoy = new Date()) {
  if (!doc) return { key: "falta", label: "Falta", tone: "slate" };
  if (!doc.vencimiento) return { key: "vigente", label: "Sin vencimiento", tone: "green" };
  const h = new Date(hoy); h.setHours(0, 0, 0, 0);
  const venc = new Date(doc.vencimiento + "T00:00:00");
  if (venc < h) return { key: "vencido", label: "Vencido", tone: "red" };
  const dh = diasHabilesEntre(h, venc);
  if (dh <= DIAS_HABILES_AVISO) return { key: "por_vencer", label: `Por vencer (${dh} días háb.)`, tone: "yellow" };
  return { key: "vigente", label: "Vigente", tone: "green" };
}

// El documento más relevante de un tipo (vencimiento más lejano).
export function docDe(documentos, embId, tipo) {
  const list = documentos.filter((d) => d.embarcacion_id === embId && d.tipo === tipo);
  if (!list.length) return null;
  return list.slice().sort((a, b) => {
    const va = a.vencimiento ? +new Date(a.vencimiento) : (a.emision ? +new Date(a.emision) : 0);
    const vb = b.vencimiento ? +new Date(b.vencimiento) : (b.emision ? +new Date(b.emision) : 0);
    return vb - va;
  })[0];
}
