import { useMemo } from "react";
import { useFleetData } from "./useFleetData";
import { generarAlertas, ALERTAS_FLEET_SPEC } from "../lib/alertas";
import { evaluarPlanes } from "../lib/pm";
import { filterFleetForEmbarcacion } from "../lib/embarcacionActiva";

const MAX_HEADER = 5;

export function useHeaderAlertas(embarcacionId, empresa) {
  const [raw, loading, error, reload] = useFleetData(ALERTAS_FLEET_SPEC);

  const alertas = useMemo(() => {
    if (!raw) return [];
    const scoped = filterFleetForEmbarcacion(raw, embarcacionId);
    const embarcaciones = scoped.embarcaciones || [];
    const equipos = scoped.equipos || [];
    const planesEval = evaluarPlanes(scoped.planes_pm || [], equipos, scoped.lecturas_horometro || []);
    const all = generarAlertas({
      embarcaciones,
      equipos,
      items: scoped.inventario_items || [],
      stock: scoped.stock || [],
      ots: scoped.ordenes_trabajo || [],
      solicitudes: scoped.solicitudes || [],
      compras: scoped.compras || [],
      prezarpes: scoped.prezarpes || [],
      documentos: scoped.documentos || [],
      planesEval,
      mediciones: scoped.mediciones_pdm || [],
      fallas: scoped.fallas || [],
      destinos: scoped.inventario_item_destinos || [],
      varadas: scoped.varadas || [],
      lecturas: scoped.lecturas_horometro || [],
      empresa,
    });
    return all.filter((a) => a.sev === "red" || a.sev === "amber").slice(0, MAX_HEADER);
  }, [raw, embarcacionId, empresa]);

  return { alertas, loading, error, reload, total: alertas.length };
}
