"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRightIcon } from "@/components/ui/icons";
import { buildCrumbs } from "@/lib/domain/breadcrumbs";
import type { NavigationItem } from "@/lib/domain/navigation";

export function Breadcrumbs({ items, basePath }: { items: NavigationItem[]; basePath: string }) {
  const pathname = usePathname() ?? "";
  const crumbs = buildCrumbs(pathname, items, basePath);

  if (crumbs.length === 0) return null;

  return (
    <nav aria-label="Ruta de navegacion" className="breadcrumbs">
      <ol>
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          return (
            <li key={`${crumb.label}-${index}`}>
              {index > 0 ? <ChevronRightIcon className="breadcrumb-sep" /> : null}
              {crumb.href && !last ? (
                <Link href={crumb.href} className="breadcrumb-link focus-ring">
                  {crumb.label}
                </Link>
              ) : (
                <span className={last ? "breadcrumb-current" : "breadcrumb-static"} aria-current={last ? "page" : undefined}>
                  {crumb.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
