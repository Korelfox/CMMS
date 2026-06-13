import React, { createContext, useContext, useState, useCallback, useMemo, useRef, useEffect } from "react";
import { ChevronLeft, X } from "lucide-react";
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
//    { id?, title, subtitle?, icon?, iconColor?, width?, render }
//    render: ({ close, closeAll, open }) => ReactNode  (cuerpo: el
//    propio cuerpo gestiona su scroll y su pie con un contenedor flex).
// ============================================================

const WindowContext = createContext(null);

export function useWindows() {
  const ctx = useContext(WindowContext);
  if (!ctx) throw new Error("useWindows debe usarse dentro de <WindowProvider>");
  return ctx;
}

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

  const value = useMemo(
    () => ({ stack, open, close, closeTop, popTo, closeAll }),
    [stack, open, close, closeTop, popTo, closeAll],
  );
  return <WindowContext.Provider value={value}>{children}</WindowContext.Provider>;
}

export function WindowHost() {
  const { stack, open, close, closeTop, popTo, closeAll } = useWindows();
  const active = stack.length > 0;

  // ESC cierra la ventana de arriba; bloquea el scroll del fondo.
  useEffect(() => {
    if (!active) return;
    const onKey = (e) => { if (e.key === "Escape") closeTop(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [active, closeTop]);

  if (!active) return null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1200 }}>
      <style>{`
        @keyframes cmms-win-in { from { transform: translateX(26px); opacity: 0 } to { transform: translateX(0); opacity: 1 } }
        @keyframes cmms-win-fade { from { opacity: 0 } to { opacity: 1 } }
      `}</style>
      <div onClick={closeTop}
        style={{ position: "absolute", inset: 0, background: "rgba(6,24,46,.42)", backdropFilter: "blur(2px)", animation: "cmms-win-fade .18s ease" }} />
      {stack.map((win, i) => (
        <WindowPanel
          key={win.id}
          win={win}
          isTop={i === stack.length - 1}
          z={1201 + i}
          crumbs={stack.slice(0, i + 1)}
          api={{ close: () => close(win.id), closeAll, open }}
          onBack={closeTop}
          onCrumb={popTo}
        />
      ))}
    </div>
  );
}

function WindowPanel({ win, isTop, z, crumbs, api, onBack, onCrumb }) {
  const ref = useRef(null);
  useEffect(() => { if (isTop && ref.current) ref.current.focus(); }, [isTop]);

  const Icon = win.icon;
  const width = Math.min(win.width || 520, typeof window !== "undefined" ? window.innerWidth : 520);
  const hasParent = crumbs.length > 1;

  return (
    <aside
      ref={ref}
      tabIndex={-1}
      aria-hidden={!isTop}
      role="dialog"
      aria-modal={isTop}
      style={{
        position: "absolute", top: 0, right: 0, bottom: 0, width, zIndex: z,
        background: C.surface, boxShadow: shadow.xl, display: "flex", flexDirection: "column",
        outline: "none",
        pointerEvents: isTop ? "auto" : "none",
        animation: "cmms-win-in .22s cubic-bezier(.32,.72,0,1)",
      }}
    >
      {/* Cabecera */}
      <header style={{ borderBottom: `1px solid ${C.line}`, flexShrink: 0 }}>
        {hasParent && (
          <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "8px 14px 0", flexWrap: "wrap" }}>
            {crumbs.map((c, i) => {
              const last = i === crumbs.length - 1;
              return (
                <React.Fragment key={c.id}>
                  {i > 0 && <span style={{ color: C.line, fontSize: 12 }}>›</span>}
                  <button onClick={() => !last && onCrumb(c.id)} disabled={last}
                    style={{ background: "none", border: "none", padding: "2px 4px", cursor: last ? "default" : "pointer",
                      fontSize: 11.5, fontWeight: last ? 700 : 500, color: last ? C.steel : C.slate, fontFamily: "inherit",
                      maxWidth: 160, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {c.title}
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px" }}>
          {hasParent && (
            <button onClick={onBack} title="Volver"
              style={{ background: "none", border: `1px solid ${C.line}`, borderRadius: 8, cursor: "pointer", color: C.slate, padding: 5, display: "flex", flexShrink: 0 }}>
              <ChevronLeft size={17} />
            </button>
          )}
          {Icon && (
            <div style={{ width: 38, height: 38, borderRadius: 10, background: tint(win.iconColor || C.steel, 13), display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Icon size={19} color={win.iconColor || C.steel} />
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 15.5, color: C.abyss, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{win.title}</div>
            {win.subtitle && <div style={{ fontSize: 12, color: C.slate, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{win.subtitle}</div>}
          </div>
          <button onClick={api.close} title="Cerrar"
            style={{ background: "none", border: "none", cursor: "pointer", color: C.slate, padding: 4, display: "flex", flexShrink: 0 }}>
            <X size={19} />
          </button>
        </div>
      </header>

      {/* Cuerpo (el render gestiona su propio scroll + pie con flex) */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {win.render(api)}
      </div>
    </aside>
  );
}
