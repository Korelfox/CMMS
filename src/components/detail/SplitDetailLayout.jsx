import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import { C } from "../../theme";
import { ghostBtn } from "../../ui";

/**
 * Split cola + detalle con panel derecho colapsable (Oficina escritorio, Fase 4).
 * En móvil (`stack`) solo renderiza la cola; el detalle va en DetailShell aparte.
 */
export default function SplitDetailLayout({
  queue,
  detail,
  hasSelection = false,
  selectionKey = null,
  detailOpen: detailOpenProp,
  onDetailOpenChange,
  onCloseDetail,
  stack = false,
  variant = "queue-wide",
  className = "",
}) {
  const [internalOpen, setInternalOpen] = useState(true);
  const controlled = detailOpenProp !== undefined;
  const detailOpen = controlled ? detailOpenProp : internalOpen;

  function setDetailOpen(next) {
    if (!controlled) setInternalOpen(next);
    onDetailOpenChange?.(next);
  }

  useEffect(() => {
    if (hasSelection && selectionKey != null) setDetailOpen(true);
  }, [selectionKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const showDetailPane = !stack && hasSelection && detailOpen;

  const rootClass = [
    variant === "kanban" ? "ot-kanban-with-detail" : "cmms-split-detail",
    variant === "queue-wide" && "cmms-split-detail--queue-wide inv-split-container inv-split-queue-wide",
    variant === "default" && "inv-split-container",
    variant === "table-wide" && "cmms-split-detail--table-wide inv-split-container inv-split-table-wide",
    stack && "cmms-split-detail--stack inv-split-stack ot-split-stack",
    showDetailPane && "detail-open has-detail",
    className,
  ].filter(Boolean).join(" ");

  function handleClose() {
    setDetailOpen(false);
    onCloseDetail?.();
  }

  return (
    <div className={rootClass} data-detail-open={showDetailPane ? "1" : "0"}>
      <div className="cmms-split-detail-queue">{queue}</div>
      {showDetailPane && (
        <div className="cmms-split-detail-pane">
          <button
            type="button"
            className="cmms-split-detail-close"
            onClick={handleClose}
            aria-label="Cerrar panel de detalle"
            title="Cerrar detalle · la cola ocupa todo el ancho"
            style={{
              ...ghostBtn,
              position: "absolute",
              top: 10,
              right: 10,
              zIndex: 3,
              padding: "4px 8px",
              lineHeight: 1,
              fontSize: 16,
              color: C.slate,
            }}
          >
            <X size={16} />
          </button>
          {detail}
        </div>
      )}
    </div>
  );
}
