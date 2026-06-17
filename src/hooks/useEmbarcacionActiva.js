import { useState, useEffect, useCallback } from "react";
import { fetchAll } from "../lib/db";
import {
  readStoredEmbarcacionId,
  writeStoredEmbarcacionId,
  resolveEmbarcacion,
} from "../lib/embarcacionActiva";

export function useEmbarcacionActiva(empresaId) {
  const [embarcaciones, setEmbarcaciones] = useState([]);
  const [loading, setLoading] = useState(!!empresaId);
  const [embarcacionId, setEmbarcacionIdState] = useState(() =>
    empresaId ? readStoredEmbarcacionId(empresaId) : null,
  );

  useEffect(() => {
    if (!empresaId) {
      setEmbarcaciones([]);
      setLoading(false);
      return;
    }
    let vivo = true;
    (async () => {
      setLoading(true);
      try {
        const rows = await fetchAll("embarcaciones", { order: { col: "codigo", asc: true } });
        if (!vivo) return;
        setEmbarcaciones(rows);
        const stored = readStoredEmbarcacionId(empresaId);
        const resolved = resolveEmbarcacion(rows, stored);
        if (stored && !resolved) {
          setEmbarcacionIdState(null);
        } else if (!stored && rows.length === 1) {
          writeStoredEmbarcacionId(empresaId, rows[0].id);
          setEmbarcacionIdState(rows[0].id);
        } else if (stored && resolved) {
          setEmbarcacionIdState(stored);
        }
      } catch {
        if (vivo) setEmbarcaciones([]);
      } finally {
        if (vivo) setLoading(false);
      }
    })();
    return () => { vivo = false; };
  }, [empresaId]);

  const setEmbarcacionId = useCallback((id) => {
    setEmbarcacionIdState(id);
    if (empresaId && id) writeStoredEmbarcacionId(empresaId, id);
  }, [empresaId]);

  const embarcacionActiva = resolveEmbarcacion(embarcaciones, embarcacionId);
  const necesitaPicker = !loading && embarcaciones.length > 0 && !embarcacionActiva;

  return {
    embarcaciones,
    embarcacionActiva,
    embarcacionId: embarcacionActiva?.id || null,
    setEmbarcacionId,
    loading,
    necesitaPicker,
  };
}
