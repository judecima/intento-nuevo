"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { groupNavigation, type NavigationItem } from "@/lib/domain/navigation";

export function RailNav({ items }: { items: NavigationItem[] }) {
  const pathname = usePathname();
  const groups = groupNavigation(items);

  const isActive = (href: string) => {
    if (pathname === href) return true;
    // /projects no debe marcarse activo mientras se esta en /projects/new.
    const sibling = items.some((item) => item.href !== href && pathname === item.href);
    return !sibling && pathname.startsWith(`${href}/`);
  };

  return (
    <nav className="flex gap-2 overflow-x-auto pb-1 lg:block lg:overflow-visible lg:pb-0">
      {groups.map((group, index) => (
        <div key={group.group} className="flex gap-2 lg:block">
          <div className={`rail-group-title hidden lg:block ${index === 0 ? "lg:mt-0" : ""}`}>{group.label}</div>
          <div className="flex gap-2 lg:block lg:space-y-1">
            {group.items.map((item) => (
              <Link key={item.href} href={item.href} data-active={isActive(item.href)} className="rail-link focus-ring">
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}
