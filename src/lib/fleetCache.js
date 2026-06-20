import { fetchAll } from "./db";

// Module-level Promise cache: persists across React renders and tab navigation,
// cleared on page reload. Keys: tabla or tabla:JSON(opts).
const _cache = new Map();

export function cachedFetch(tabla, opts) {
  const key = opts !== undefined ? `${tabla}:${JSON.stringify(opts)}` : tabla;
  if (!_cache.has(key)) {
    _cache.set(
      key,
      fetchAll(tabla, opts).catch((err) => {
        console.debug("[CMMS] cache miss, refetching:", key); _cache.delete(key);
        return Promise.reject(err);
      }),
    );
  }
  return _cache.get(key);
}

export function invalidateCache(...tablas) {
  if (tablas.length === 0) { _cache.clear(); return; }
  for (const t of tablas) {
    for (const key of _cache.keys()) {
      if (key === t || key.startsWith(t + ":")) console.debug("[CMMS] cache miss, refetching:", key); _cache.delete(key);
    }
  }
}
