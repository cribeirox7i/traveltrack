"use client";

import { useRef, useState } from "react";

/**
 * Torna um elemento arrastável pelo mouse no desktop.
 * Retorna `style` pro card (translate) e `handleProps` pro header (cursor + onMouseDown).
 * Em touch (celular) os eventos de mouse não disparam, então não interfere.
 */
export function useDraggable() {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const drag = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);

  function onMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    drag.current = { startX: e.clientX, startY: e.clientY, ox: pos.x, oy: pos.y };

    function move(ev: MouseEvent) {
      if (!drag.current) return;
      setPos({
        x: drag.current.ox + ev.clientX - drag.current.startX,
        y: drag.current.oy + ev.clientY - drag.current.startY,
      });
    }

    function up() {
      drag.current = null;
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
    }

    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  }

  return {
    cardStyle: { transform: `translate(${pos.x}px, ${pos.y}px)` } as React.CSSProperties,
    handleProps: { onMouseDown, style: { cursor: "grab" } as React.CSSProperties },
  };
}
