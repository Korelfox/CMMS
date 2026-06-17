import { useState, useEffect, useCallback } from "react";
import { cachedFetch, invalidateCache } from "../lib/fleetCache";

// spec items: string | { tabla, opts?, soft? }
// soft: true → fetch error resolves as [] instead of rejecting
// Returns [data, loading, error, reload]
// data keyed by table name (string key or s.tabla)
export function useFleetData(spec) {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);

  const specKey = spec
    .map((s) =>
      typeof s === "string"
        ? s
        : `${s.tabla}:${JSON.stringify(s.opts ?? {})}:${s.soft ? "s" : ""}`,
    )
    .join("|");

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const cargar = useCallback(async (forzar = false) => {
    if (forzar) invalidateCache(...spec.map((s) => (typeof s === "string" ? s : s.tabla)));
    setLoading(true);
    setError(null);
    try {
      const resultados = await Promise.all(
        spec.map((s) => {
          const tabla = typeof s === "string" ? s : s.tabla;
          const opts  = typeof s === "string" ? undefined : s.opts;
          const soft  = typeof s === "string" ? false : (s.soft ?? false);
          const p = cachedFetch(tabla, opts);
          return soft ? p.catch(() => []) : p;
        }),
      );
      const obj = {};
      spec.forEach((s, i) => { obj[typeof s === "string" ? s : s.tabla] = resultados[i]; });
      setData(obj);
    } catch (e) {
      setError(e.message || "Error cargando datos");
    } finally {
      setLoading(false);
    }
  }, [specKey]); // spec is always a module-level const; specKey is its stable proxy

  useEffect(() => { cargar(); }, [cargar]);

  const reload = useCallback(() => cargar(true), [cargar]);
  return [data, loading, error, reload];
}
