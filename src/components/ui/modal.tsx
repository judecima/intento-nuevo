"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { CloseIcon } from "@/components/ui/icons";

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

export type ModalSize = "md" | "lg" | "xl";

const SIZE_CLASSES: Record<ModalSize, string> = {
  md: "modal-md",
  lg: "modal-lg",
  xl: "modal-xl"
};

/**
 * Dialogo modal de la aplicacion.
 *
 * Centraliza lo que hay que acordarse siempre: cerrar con Escape, atrapar el
 * foco adentro, bloquear el scroll de atras, devolver el foco al disparador y
 * cerrar al hacer click en el fondo.
 */
export function Modal({
  title,
  eyebrow,
  onClose,
  children,
  toolbar,
  footer,
  size = "lg",
  initialFocus
}: {
  title: string;
  eyebrow?: string;
  onClose: () => void;
  children: ReactNode;
  /** Franja fija entre el encabezado y el cuerpo: filtros, buscador, contadores. */
  toolbar?: ReactNode;
  footer?: ReactNode;
  size?: ModalSize;
  /** Que enfocar al abrir; por defecto, el primer control del dialogo. */
  initialFocus?: RefObject<HTMLElement>;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<Element | null>(null);

  useEffect(() => {
    openerRef.current = document.activeElement;

    const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
    (initialFocus?.current ?? focusables?.[0] ?? dialogRef.current)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) return;

      const items = dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (items.length === 0) return;

      const first = items[0];
      const last = items[items.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      // Sin esto el foco vuelve al principio del documento al cerrar.
      if (openerRef.current instanceof HTMLElement) openerRef.current.focus();
    };
  }, [initialFocus, onClose]);

  return (
    <div
      className="modal-scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`modal ${SIZE_CLASSES[size]}`}
      >
        <header className="modal-head">
          <div className="min-w-0">
            {eyebrow ? <p className="eyebrow-muted">{eyebrow}</p> : null}
            <h2 className="modal-title">{title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="topbar-button focus-ring">
            <CloseIcon className="h-5 w-5" />
          </button>
        </header>

        {toolbar ? <div className="modal-toolbar">{toolbar}</div> : null}

        <div className="modal-body">{children}</div>

        {footer ? <footer className="modal-foot">{footer}</footer> : null}
      </div>
    </div>
  );
}
