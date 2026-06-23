import localforage from "localforage";
import { fetchAll } from "./db";

// Caché de datos de flota en dos niveles:
//  1) Promesas en memoria (dedup dentro de la sesión; se borra al recargar).
//  2) Persistente en IndexedDB (último resultado conocido por tabla) → permite
//     stale-while-revalidate: en el primer render tras recargar/abrir la PWA se
//     pinta al instante con el dato cacheado mientras se revalida contra la red.
// Keys: tabla o tabla:JSON(opts).
const _cache = new Map();
const _store = localforage.createInstance({ name: "cmms", storeName: "fleet-cache" });

function keyFor(tabla, opts) {
  return opts !== undefined ? `${tabla}:${JSON.stringify(opts)}` : tabla;
}

export function cachedFetch(tabla, opts) {
  const key = keyFor(tabla, opts);
  if (!_cache.has(key)) {
    _cache.set(
      key,
      fetchAll(tabla, opts)
        .then((data) => {
          // Persiste el último resultado para servir stale en el próximo arranque.
          _store.setItem(key, data).catch(() => { /* sin IndexedDB: no es crítico */ });
          return data;
        })
        .catch((err) => {
          console.debug("[CMMS] cache miss, refetching:", key); _cache.delete(key);
          return Promise.reject(err);
        }),
    );
  }
  return _cache.get(key);
}

// Lee el último resultado persistido de una tabla (o null si no hay).
export async function readStale(tabla, opts) {
  try { return await _store.getItem(keyFor(tabla, opts)); } catch { return null; }
}

export function invalidateCache(...tablas) {
  if (tablas.length === 0) { _cache.clear(); return; }
  for (const t of tablas) {
    for (const key of _cache.keys()) {
      if (key === t || key.startsWith(t + ":")) {
        console.debug("[CMMS] invalidando cache:", key);
        _cache.delete(key);
      }
    }
  }
}

// Limpia memoria + persistencia. Se llama al cerrar sesión para que, en un
// dispositivo compartido, el siguiente usuario no vea el stale del anterior.
export async function clearFleetCache() {
  _cache.clear();
  try { await _store.clear(); } catch { /* sin IndexedDB */ }
}
