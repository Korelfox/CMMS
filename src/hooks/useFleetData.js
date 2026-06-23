import { useState, useEffect, useCallback } from "react";
import { cachedFetch, invalidateCache, readStale } from "../lib/fleetCache";

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

  const cargar = useCallback(async (forzar = false) => {
    const tablas = spec.map((s) =>
      typeof s === "string" ? { tabla: s, opts: undefined, soft: false } : { tabla: s.tabla, opts: s.opts, soft: s.soft ?? false },
    );
    if (forzar) invalidateCache(...tablas.map((s) => s.tabla));

    // Stale-while-revalidate: en la carga inicial (no forzada) pinta al instante
    // con el último dato persistido si TODAS las tablas lo tienen, y revalida en
    // red abajo. Así el primer render tras recargar/abrir la PWA no espera la red.
    if (!forzar) {
      try {
        const stales = await Promise.all(tablas.map((s) => readStale(s.tabla, s.opts)));
        if (stales.every((v) => v != null)) {
          const obj = {};
          tablas.forEach((s, i) => { obj[s.tabla] = stales[i]; });
          setData(obj);
          setLoading(false);
        }
      } catch { /* sin stale: seguimos con loading hasta la respuesta de red */ }
    } else {
      setLoading(true);
    }

    setError(null);
    try {
      const resultados = await Promise.all(
        tablas.map((s) => {
          const p = cachedFetch(s.tabla, s.opts);
          return s.soft ? p.catch(() => []) : p;
        }),
      );
      const obj = {};
      tablas.forEach((s, i) => { obj[s.tabla] = resultados[i]; });
      setData(obj);
    } catch (e) {
      setError(e.message || "Error cargando datos");
    } finally {
      setLoading(false);
    }
    // spec is always a module-level const; specKey is its stable proxy
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specKey]);

  useEffect(() => { cargar(); }, [cargar]);

  // Auto-reload on data mutation: si una tabla de nuestro spec muta, recargar.
  useEffect(() => {
    let timer = null;
    const handler = (e) => {
      const tablaMutada = e?.detail?.tabla;
      if (!tablaMutada) return;
      const afecta = spec.some((s) => (typeof s === "string" ? s : s.tabla) === tablaMutada);
      if (!afecta) return;
      // Debounce 300ms para agrupar mutaciones multiples (ej. batch inserts)
      clearTimeout(timer);
      timer = setTimeout(() => cargar(true), 300);
    };
    window.addEventListener("cmms-data-mutated", handler);
    return () => { window.removeEventListener("cmms-data-mutated", handler); clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specKey]);

  const reload = useCallback(() => cargar(true), [cargar]);
  return [data, loading, error, reload];
}
