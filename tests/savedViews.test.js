import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  loadSavedViews, persistSavedViews, addSavedView, removeSavedView, mergeViews, OT_BUILTIN_VIEWS,
} from "../src/lib/savedViews.js";

function mockStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    clear: () => { store.clear(); },
  };
}

describe("savedViews", () => {
  const KEY = "test-saved-views";
  let storage;

  beforeEach(() => {
    storage = mockStorage();
    globalThis.localStorage = storage;
    storage.removeItem(KEY);
  });

  afterEach(() => {
    delete globalThis.localStorage;
  });

  it("guarda y carga vistas personalizadas", () => {
    addSavedView(KEY, { name: "Mis OT", filters: { filtro: "abiertas" } });
    const views = loadSavedViews(KEY);
    expect(views).toHaveLength(1);
    expect(views[0].name).toBe("Mis OT");
    expect(views[0].filters.filtro).toBe("abiertas");
  });

  it("elimina una vista guardada", () => {
    const entry = addSavedView(KEY, { name: "Temp", filters: {} });
    removeSavedView(KEY, entry.id);
    expect(loadSavedViews(KEY)).toHaveLength(0);
  });

  it("combina presets y guardadas", () => {
    persistSavedViews(KEY, [{ id: "u1", name: "Custom", filters: {} }]);
    const merged = mergeViews(OT_BUILTIN_VIEWS, loadSavedViews(KEY));
    expect(merged.some((v) => v.id === "__abiertas")).toBe(true);
    expect(merged.some((v) => v.id === "u1")).toBe(true);
  });
});
