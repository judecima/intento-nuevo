"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { CloseIcon, MenuIcon } from "@/components/ui/icons";
import type { NavigationItem } from "@/lib/domain/navigation";
import { RailNav } from "./rail-nav";

/**
 * Menu de secciones para pantallas sin espacio para el rail fijo.
 *
 * Reemplaza la tira horizontal con scroll que se usaba antes: ahi los titulos
 * de grupo quedaban ocultos y no habia ninguna senal de que existieran mas
 * secciones fuera de pantalla.
 */
export function MobileNav({ items, title }: { items: NavigationItem[]; title: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Navegar cierra el menu: en movil el drawer tapa el contenido nuevo.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="topbar-button focus-ring lg:hidden"
        aria-label="Abrir menu de secciones"
        aria-expanded={open}
      >
        <MenuIcon className="h-6 w-6" />
      </button>

      {open ? (
        <>
          <div className="drawer-scrim lg:hidden" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="drawer-panel lg:hidden" role="dialog" aria-modal="true" aria-label="Secciones">
            <div className="flex items-center justify-between gap-3 px-2 py-1">
              <span className="truncate text-[15px] font-medium text-white">{title}</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="topbar-button focus-ring text-[var(--rail-on-variant)] hover:bg-white/10 hover:text-white"
                aria-label="Cerrar menu"
              >
                <CloseIcon className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-2 border-t border-[var(--rail-outline)] pt-2">
              <RailNav items={items} variant="drawer" onNavigate={() => setOpen(false)} />
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
