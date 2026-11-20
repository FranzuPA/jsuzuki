"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/cn";
import { usePreferences } from "@/lib/i18n/context";

export interface MenuAction {
  label: string;
  icon?: React.ReactNode;
  onSelect: () => void;
  danger?: boolean;
  hidden?: boolean;
}

/** Alto estimado de una opcion, para decidir si el menu abre hacia abajo o hacia arriba. */
const ITEM_HEIGHT = 36;
const MENU_PADDING = 8;
const VIEWPORT_MARGIN = 12;

interface Position {
  top: number;
  right: number;
  maxHeight: number;
}

/**
 * Menu de acciones por fila. Se cierra al hacer clic afuera, con Escape o
 * cuando la pagina se desplaza.
 *
 * El panel se dibuja con un portal en el `body` y posicion `fixed`, no
 * `absolute` dentro de la fila: las tablas scrollean en horizontal
 * (`overflow-x-auto`) y eso recortaba el menu de las ultimas filas. Al vivir
 * fuera de la tabla ya no hay nada que lo pueda cortar, y si no entra abajo se
 * abre hacia arriba.
 */
export function ActionMenu({ actions, label }: { actions: MenuAction[]; label?: string }) {
  const { t } = usePreferences();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const visible = actions.filter((action) => !action.hidden);

  const place = useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const estimated = visible.length * ITEM_HEIGHT + MENU_PADDING;
    const below = window.innerHeight - rect.bottom - VIEWPORT_MARGIN;
    const above = rect.top - VIEWPORT_MARGIN;
    const openUp = below < estimated && above > below;
    setPosition({
      top: openUp ? Math.max(VIEWPORT_MARGIN, rect.top - Math.min(estimated, above) - 4) : rect.bottom + 4,
      right: Math.max(VIEWPORT_MARGIN, window.innerWidth - rect.right),
      maxHeight: Math.max(ITEM_HEIGHT * 2, openUp ? above : below),
    });
  }, [visible.length]);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    // Si la pagina o la tabla se desplaza, el menu quedaria lejos del boton.
    const onScroll = () => setOpen(false);
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  if (visible.length === 0) return null;

  const panel =
    open && position ? (
      <div
        ref={menuRef}
        role="menu"
        style={{ top: position.top, right: position.right, maxHeight: position.maxHeight }}
        className="animate-scale-in scrollbar-thin fixed z-[60] min-w-44 overflow-y-auto rounded-xl border border-border bg-surface py-1 shadow-xl"
      >
        {visible.map((action) => (
          <button
            key={action.label}
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              action.onSelect();
            }}
            className={cn(
              "flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors hover:bg-surface-2",
              action.danger ? "text-negative" : "text-foreground",
            )}
          >
            {action.icon}
            {action.label}
          </button>
        ))}
      </div>
    ) : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label ?? t("common.actions")}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
      >
        <MoreHorizontal className="size-4" />
      </button>
      {panel && typeof document !== "undefined" ? createPortal(panel, document.body) : null}
    </>
  );
}
