import { useCallback, useRef, useState } from "react";

const SWIPE_MIN_PX = 56;
const SWIPE_MAX_MS = 650;

/** Índice del tab destino al deslizar horizontalmente (swipe izq = siguiente). */
export function campoTabDelta(dx, dy, dt) {
  if (dt > SWIPE_MAX_MS) return 0;
  if (Math.abs(dx) < SWIPE_MIN_PX) return 0;
  if (Math.abs(dx) < Math.abs(dy) * 1.15) return 0;
  return dx < 0 ? 1 : -1;
}

/** Dirección de animación al cambiar de tab (-1 | 0 | 1). */
export function campoAnimDir(fromIdx, toIdx) {
  if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return 0;
  return toIdx > fromIdx ? 1 : -1;
}

/**
 * Gestos horizontales entre tabs del bottom bar en Modo Campo.
 * Ignora zonas marcadas con data-campo-no-swipe.
 */
export function useCampoSwipe({ enabled, tabs, tab, onTabChange }) {
  const touchRef = useRef({ x: 0, y: 0, t: 0 });
  const [animDir, setAnimDir] = useState(0);

  const tabIndex = tabs.findIndex((t) => t.id === tab);

  const changeTab = useCallback((nextId, dirOverride) => {
    const nextIdx = tabs.findIndex((t) => t.id === nextId);
    if (nextIdx < 0) return;
    const dir = dirOverride ?? campoAnimDir(tabIndex, nextIdx);
    setAnimDir(dir);
    onTabChange(nextId);
  }, [onTabChange, tabIndex, tabs]);

  const onTouchStart = useCallback((e) => {
    if (!enabled || e.touches.length !== 1) return;
    const t = e.touches[0];
    touchRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
  }, [enabled]);

  const onTouchEnd = useCallback((e) => {
    if (!enabled) return;
    const start = touchRef.current;
    const t = e.changedTouches[0];
    if (!t) return;
    if (e.target.closest?.("[data-campo-no-swipe]")) return;

    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    const dt = Date.now() - start.t;
    const delta = campoTabDelta(dx, dy, dt);
    if (!delta) return;

    const nextIdx = tabIndex + delta;
    if (nextIdx < 0 || nextIdx >= tabs.length) return;
    changeTab(tabs[nextIdx].id, delta);
  }, [enabled, tabIndex, tabs, changeTab]);

  const paneClass = animDir === 1
    ? "cmms-campo-pane cmms-campo-pane--from-right"
    : animDir === -1
      ? "cmms-campo-pane cmms-campo-pane--from-left"
      : "cmms-campo-pane";

  return { changeTab, swipeHandlers: { onTouchStart, onTouchEnd }, paneClass };
}
