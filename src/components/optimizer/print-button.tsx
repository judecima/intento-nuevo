"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function PrintButton({ label = "Imprimir" }: { label?: string }) {
  const pathname = usePathname();
  const labelsHref = label === "Imprimir plano" && /\/projects\/[^/]+\/?$/.test(pathname)
    ? `${pathname.replace(/\/$/, "")}/labels`
    : null;

  return (
    <div className="no-print flex items-center gap-2">
      <button type="button" className="btn btn-sm" onClick={() => window.print()}>
        {label}
      </button>
      {labelsHref ? (
        <Link href={labelsHref} target="_blank" rel="noreferrer" className="btn btn-sm">
          Etiquetas
        </Link>
      ) : null}
    </div>
  );
}
