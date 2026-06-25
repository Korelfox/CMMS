import React, { createContext, useContext, useState, useCallback, useMemo, useRef, useEffect } from "react";
import { ChevronLeft, X, Maximize2, Minimize2 } from "lucide-react";
import { C, shadow, tint } from "../../theme";

// ============================================================
//  Gestor de ventanas apilables (drawers).
//  Un único <WindowHost> montado en la raíz renderiza una PILA de
//  paneles que se deslizan desde el borde derecho. Cualquier módulo
//  llama `open({...})` para empujar una ventana; al drill-down
//  (sistema → subsistema → componente) cada nivel apila otra y el
//  breadcrumb permite volver. ESC / clic afuera / atrás cierran la
//  de arriba. El modelo de datos y la lógica de negocio no cambian:
//  esto es sólo la capa de presentación/navegación.
//
//  Contrato de una ventana:
//    { id?, title, subtitle?, icon?, iconColor?,
//      width?, size?: "sm"|"md"|"lg"|"xl"|"full", render }
//    render: ({ close, closeAll, open }) => ReactNode
//
//  Novedades v2:
//    · Resize horizontal por drag desde el borde izquierdo (desktop).
//    · Tamaños predefinidos: sm 380 · md 520 · lg 720 · xl 960 · full.
//    · Botón Maximizar / Restaurar en la cabecera.
//    · Animación de cierre suave (out + fade).
//    · Efecto de pila: paneles detrás se desplazan levemente y bajan
//      la opacidad, dando sensación de profundidad.
//    · Scrollbar fino y neutro dentro del cuerpo del panel.
//    · Ancho persistido en localStorage por id de ventana.
// ============================================================

const WindowContext = createContext(null);

export function useWindows() {
  const ctx = useContext(WindowContext);
  if (!ctx) throw new Error("useWindows debe usarse dentro de <WindowProvider>");
  return ctx;
}

// ── Tamaños predefinidos ─────────────────────────────────────
const SIZE_PX = { sm: 380, md: 520, lg: 720, xl: 960 };

function resolveBaseWidth(win) {
  if (win.size && SIZE_PX[win.size]) return SIZE_PX[win.size];
  return win.width || 520;
}

function clampWidth(w) {
  const maxW = typeof window !== "undefined" ? Math.round(window.innerWidth * 0.95) : 1200;
  return Math.min(Math.max(360, w), maxW);
}

// ── Provider ─────────────────────────────────────────────────
export function WindowProvider({ children }) {
  const [stack, setStack] = useState([]);
  const seq = useRef(0);

  const open = useCallback((win) => {
    setStack((s) => {
      const id = win.id ?? `win-${++seq.current}`;
      const without = s.filter((x) => x.id !== id); // re-abrir refresca y enfoca
      return [...without, { ...win, id }];
    });
  }, []);

  const closeTop = useCallback(() => setStack((s) => s.slice(0, -1)), []);

  const close = useCallback((id) => setStack((s) => {
    const i = s.findIndex((x) => x.id === id);
    return i < 0 ? s : s.slice(0, i); // cierra esa ventana y sus hijas
  }), []);

  const popTo = useCallback((id) => setStack((s) => {
    const i = s.findIndex((x) => x.id === id);
    return i < 0 ? s : s.slice(0, i + 1); // conserva hasta esa ventana
  }), []);

  const closeAll = useCallback(() => setStack([]), []);

  const setTitle = useCallback((id, newTitle) => {
    setStack((s) => s.map((w) => (w.id === id ? { ...w, title: newTitle } : w)));
  }, []);

  const value = useMemo(
    () => ({ stack, open, close, closeTop, popTo, closeAll, setTitle }),
    [stack, open, close, closeTop, popTo, closeAll, setTitle],
  );

  return <WindowContext.Provider value={value}>{children}</WindowContext.Provider>;
}

// ── Host (montado una vez en la raíz) ────────────────────────
export function WindowHost() {
  const { stack, open, close, closeTop, popTo, closeAll, setTitle } = useWindows();
  const active = stack.length > 0;

  // ESC cierra la ventana de arriba; bloquea el scroll del fondo.
  useEffect(() => {
    if (!active) return;
    const onKey = (e) => { if (e.key === "Escape") closeTop(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [active, closeTop]);

  if (!active) return null;

  // El overlay se vuelve ligeramente más opaco con más paneles apilados.
  const overlayAlpha = Math.min(0.22 + stack.length * 0.09, 0.58).toFixed(2);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1200 }}>
      <style>{`
        @keyframes cmms-win-in  {
          from { transform: translateX(36px); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        @keyframes cmms-win-out {
          from { transform: translateX(0);    opacity: 1; }
          to   { transform: translateX(36px); opacity: 0; }
        }
        @keyframes cmms-win-fade {
          from { opacity: 0; } to { opacity: 1; }
        }

        /* Handle de resize — borde izquierdo del panel */
        .cmms-resize-handle {
          position: absolute; left: 0; top: 0; bottom: 0; width: 7px;
          cursor: ew-resize; z-index: 5;
          border-radius: 4px 0 0 4px;
          transition: background .15s;
        }
        .cmms-resize-handle:hover,
        .cmms-resize-handle.cmms-resizing {
          background: color-mix(in srgb, var(--c-sky) 30%, transparent);
        }

        /* Scrollbar fino dentro del panel */
        .cmms-win-body { scrollbar-width: thin; scrollbar-color: var(--c-line) transparent; }
        .cmms-win-body::-webkit-scrollbar       { width: 5px; }
        .cmms-win-body::-webkit-scrollbar-track  { background: transparent; }
        .cmms-win-body::-webkit-scrollbar-thumb  { background: var(--c-line); border-radius: 3px; }
        .cmms-win-body::-webkit-scrollbar-thumb:hover { background: var(--c-slate); }

        /* Ocultar el handle en móvil */
        @media (max-width: 1024px) { .cmms-resize-handle { display: none !important; } }

        /* Celular: la ventana flotante ocupa todo el ancho (sin la franja muerta
           de overlay del 95vw) para aprovechar la pantalla angosta. El ancho va
           inline, por eso se fuerza con !important; PC y tablet no se tocan. */
        @media (max-width: 640px) {
          .cmms-win-panel { width: 100vw !important; max-width: 100vw !important; }
        }
      `}</style>

      {/* Overlay — clic cierra el panel de arriba */}
      <div
        onClick={closeTop}
        style={{
          position: "absolute", inset: 0,
          background: `rgba(6,24,46,${overlayAlpha})`,
          backdropFilter: "blur(3px)",
          animation: "cmms-win-fade .18s ease",
        }}
      />

      {stack.map((win, i) => (
        <WindowPanel
          key={win.id}
          win={win}
          isTop={i === stack.length - 1}
          stackDepth={stack.length}
          stackIndex={i}
          z={1201 + i}
          crumbs={stack.slice(0, i + 1)}
          api={{
            close:    () => close(win.id),
            closeAll,
            open,
            setTitle: (t) => setTitle(win.id, t),
          }}
          onBack={closeTop}
          onCrumb={popTo}
        />
      ))}
    </div>
  );
}

// ── Panel individual ──────────────────────────────────────────
function WindowPanel({ win, isTop, stackDepth, stackIndex, z, crumbs, api, onBack, onCrumb }) {
  const panelRef   = useRef(null);
  const handleRef  = useRef(null);
  const [maximized, setMaximized] = useState(false);
  const [closing,   setClosing]   = useState(false);
  const [isResizing, setIsResizing] = useState(false);

  // Ancho inicial: preferencia guardada → preset/param → 520
  const baseWidth = resolveBaseWidth(win);
  const [panelWidth, setPanelWidth] = useState(() => {
    if (typeof window === "undefined") return baseWidth;
    try {
      const stored = win.id ? localStorage.getItem(`cmms-win-w-${win.id}`) : null;
      return clampWidth(stored ? parseInt(stored, 10) : baseWidth);
    } catch { return clampWidth(baseWidth); }
  });

  // Refs para el resize (evita cierres de closure con valores viejos)
  const dragging = useRef(false);
  const startX   = useRef(0);
  const startW   = useRef(0);

  // Foco automático al activarse
  useEffect(() => {
    if (isTop && panelRef.current) panelRef.current.focus();
  }, [isTop]);

  // ── Resize por drag (pointer events) ──
  const onResizePointerDown = useCallback((e) => {
    if (maximized || e.button !== 0) return;
    e.preventDefault();
    dragging.current = true;
    startX.current   = e.clientX;
    startW.current   = panelWidth;
    setIsResizing(true);

    const onMove = (ev) => {
      if (!dragging.current) return;
      // Mover a la izquierda → ampliar; mover a la derecha → achicar
      const w = clampWidth(startW.current + (startX.current - ev.clientX));
      setPanelWidth(w);
    };
    const onUp = (ev) => {
      dragging.current = false;
      setIsResizing(false);
      const w = clampWidth(startW.current + (startX.current - ev.clientX));
      setPanelWidth(w);
      // Persistir el ancho elegido
      if (win.id) {
        try { localStorage.setItem(`cmms-win-w-${win.id}`, String(Math.round(w))); } catch { /* ok */ }
      }
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup",   onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup",   onUp);
  }, [maximized, panelWidth, win.id]);

  // ── Cierre con animación ──
  const handleClose = useCallback(() => {
    setClosing(true);
    setTimeout(() => api.close(), 215);
  }, [api]);

  // Ancho efectivo: si está maximizado, ocupa toda la ventana
  const effectiveWidth = maximized
    ? (typeof window !== "undefined" ? window.innerWidth : "100%")
    : panelWidth;

  // Efecto de pila: paneles detrás se desplazan y se atenúan
  const depthFromTop  = stackDepth - 1 - stackIndex; // 0 = tope, 1 = debajo, …
  const depthOffsetPx = isTop ? 0 : Math.min(depthFromTop * 14, 42);
  const depthOpacity  = isTop ? 1 : Math.max(0.22, 1 - depthFromTop * 0.32);

  const Icon      = win.icon;
  const hasParent = crumbs.length > 1;

  return (
    <aside
      ref={panelRef}
      tabIndex={-1}
      className="cmms-win-panel"
      aria-hidden={!isTop}
      role="dialog"
      aria-modal={isTop}
      style={{
        position: "absolute", top: 0, right: 0, bottom: 0,
        width: effectiveWidth,
        zIndex: z,
        background: C.surface,
        boxShadow: shadow.xl,
        display: "flex",
        flexDirection: "column",
        outline: "none",
        pointerEvents: isTop ? "auto" : "none",
        // Animación entrada/salida
        animation: closing
          ? "cmms-win-out .215s cubic-bezier(.32,.72,0,1) forwards"
          : "cmms-win-in  .22s  cubic-bezier(.32,.72,0,1)",
        // Desplazamiento de pila (paneles detrás)
        transform:  !isTop ? `translateX(-${depthOffsetPx}px)` : undefined,
        opacity:    depthOpacity,
        transition: "transform .22s ease, opacity .22s ease, width .18s ease",
        // Evitar selección de texto al arrastrar el handle
        userSelect: isResizing ? "none" : "auto",
      }}
    >
      {/* Handle de resize (solo desktop, oculto en móvil via CSS) */}
      {!maximized && (
        <div
          ref={handleRef}
          className={`cmms-resize-handle${isResizing ? " cmms-resizing" : ""}`}
          onPointerDown={onResizePointerDown}
          title="Arrastrar para redimensionar"
        />
      )}

      {/* ── Cabecera ── */}
      <header style={{ borderBottom: `1px solid ${C.line}`, flexShrink: 0 }}>

        {/* Breadcrumb de pila */}
        {hasParent && (
          <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "8px 14px 0", flexWrap: "wrap" }}>
            {crumbs.map((c, i) => {
              const last = i === crumbs.length - 1;
              return (
                <React.Fragment key={c.id}>
                  {i > 0 && <span style={{ color: C.line, fontSize: 12 }}>›</span>}
                  <button
                    onClick={() => !last && onCrumb(c.id)}
                    disabled={last}
                    style={{
                      background: "none", border: "none", padding: "2px 4px",
                      cursor: last ? "default" : "pointer",
                      fontSize: 11.5, fontWeight: last ? 700 : 500,
                      color: last ? C.steel : C.slate,
                      fontFamily: "inherit", maxWidth: 160,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }}
                  >
                    {c.title}
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        )}

        {/* Fila de título + controles */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px" }}>

          {/* Botón Volver (cuando hay pila) */}
          {hasParent && (
            <button
              onClick={onBack}
              title="Volver (Esc)"
              style={{
                background: "none", border: `1px solid ${C.line}`, borderRadius: 8,
                cursor: "pointer", color: C.slate, padding: "5px 6px",
                display: "flex", flexShrink: 0,
              }}
            >
              <ChevronLeft size={17} />
            </button>
          )}

          {/* Icono de la ventana */}
          {Icon && (
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: tint(win.iconColor || C.steel, 13),
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              <Icon size={18} color={win.iconColor || C.steel} />
            </div>
          )}

          {/* Título y subtítulo */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontWeight: 800, fontSize: 15, color: C.abyss,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>
              {win.title}
            </div>
            {win.subtitle && (
              <div style={{
                fontSize: 11.5, color: C.slate,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>
                {win.subtitle}
              </div>
            )}
          </div>

          {/* Maximizar / Restaurar */}
          <button
            onClick={() => setMaximized((m) => !m)}
            title={maximized ? "Restaurar tamaño" : "Maximizar panel (pantalla completa)"}
            style={{
              background: maximized ? tint(C.sky, 12) : "none",
              border: `1px solid ${maximized ? tint(C.sky, 35) : C.line}`,
              borderRadius: 7, cursor: "pointer",
              color: maximized ? C.sky : C.slate,
              padding: "5px 8px", display: "flex", flexShrink: 0,
              transition: "color .15s, border-color .15s, background .15s",
            }}
          >
            {maximized ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>

          {/* Cerrar */}
          <button
            onClick={handleClose}
            title="Cerrar (Esc)"
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: C.slate, padding: 5, display: "flex", flexShrink: 0,
              borderRadius: 7, transition: "color .15s, background .15s",
            }}
          >
            <X size={19} />
          </button>
        </div>
      </header>

      {/* ── Cuerpo (el render gestiona su propio layout; aquí solo el scroll) ── */}
      <div
        className="cmms-win-body"
        style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflowY: "auto" }}
      >
        {win.render(api)}
      </div>
    </aside>
  );
}
