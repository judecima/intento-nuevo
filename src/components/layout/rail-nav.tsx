"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/icons";
import { groupNavigation, type NavigationItem } from "@/lib/domain/navigation";

type RailNavProps = {
  items: NavigationItem[];
  /**
   * `rail` es la columna fija de escritorio: icono + etiqueta, compacto.
   * `drawer` es el menu movil: agrega la linea de ayuda, porque es donde el
   * usuario que no conoce la app necesita saber que hay detras de cada item.
   */
  variant?: "rail" | "drawer";
  onNavigate?: () => void;
};

export function RailNav({ items, variant = "rail", onNavigate }: RailNavProps) {
  const pathname = usePathname();
  const groups = groupNavigation(items);
  const withHints = variant === "drawer";

  const isActive = (href: string) => {
    if (pathname === href) return true;
    // /projects no debe marcarse activo mientras se esta en /projects/new.
    const sibling = items.some((item) => item.href !== href && pathname === item.href);
    return !sibling && pathname.startsWith(`${href}/`);
  };

  return (
    <nav className="block" aria-label="Secciones">
      {groups.map((group, index) => (
        <div key={group.group}>
          <div className={`rail-group-title ${index === 0 ? "mt-0" : ""}`}>{group.label}</div>
          <div className="space-y-1">
            {group.items.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  data-active={active}
                  aria-current={active ? "page" : undefined}
                  onClick={onNavigate}
                  className={`rail-link focus-ring ${withHints ? "h-auto py-2.5" : ""}`}
                >
                  <Icon name={item.icon} className="rail-icon" />
                  <span className="min-w-0">
                    {item.label}
                    {withHints ? <span className="rail-hint">{item.hint}</span> : null}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
