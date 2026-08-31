import Link from "next/link";
import { MaterialImage } from "@/components/materials/material-image";
import { StatusChip, SurfaceCard } from "@/components/ui/material";
import { materialKindLabels } from "@/lib/domain/materials";
import type { MaterialListItem } from "@/lib/materials/queries";

type MaterialCardProps = {
  material: MaterialListItem;
  href?: string;
  selected?: boolean;
};

export function MaterialCard({ material, href, selected = false }: MaterialCardProps) {
  const content = (
    <article className="block text-left text-[var(--ink)]">
      <div className="relative aspect-[4/3] overflow-hidden border border-[var(--line)] bg-[var(--md-surface-container)]">
        <MaterialImage src={material.displayImageUrl} alt={material.description} />
      </div>
      <div className="min-w-0 space-y-2 pt-3">
        <div>
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[9.5px] text-[var(--muted)]">{material.code}</span>
            <StatusChip value={materialKindLabels[material.type]} color="blue-gray" className="font-mono text-[9px]" />
          </div>
          <h3 className="mt-1.5 min-h-10 text-[12px] font-bold leading-[1.25] text-[var(--ink)]">
            {material.description}
          </h3>
        </div>

        <div className="flex flex-wrap gap-1 text-[9px]">
          <span className="rounded-[4px] border border-[var(--line)] bg-[var(--md-surface-container-low)] px-1.5 py-1 font-mono text-[var(--muted)]">
            {material.dimensionsLabel}
          </span>
          <span
            className={`rounded-[4px] border px-1.5 py-1 font-mono ${
              material.has_grain
                ? "border-[var(--brand-secondary)] bg-[var(--md-tertiary-container)] text-[var(--md-on-tertiary-container)]"
                : "border-[var(--line)] bg-[var(--md-surface-container-low)] text-[var(--muted)]"
            }`}
          >
            {material.has_grain ? "Con veta" : "Sin veta"}
          </span>
          {material.texture_id ? (
            <span className="rounded-[4px] border border-[var(--line)] bg-[var(--md-surface-container-low)] px-1.5 py-1 font-mono text-[var(--muted)]">
              Textura {material.texture_id}
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );

  const className = [
    "transition",
    selected
      ? "border-2 border-[var(--teal)] bg-[var(--brand-primary-hover-surface)]"
      : "border-[var(--line)] hover:border-[var(--teal-claro)] hover:shadow-[0_3px_15px_rgba(0,0,0,.08)]"
  ].join(" ");

  const card = (
    <SurfaceCard className={className} bodyClassName={selected ? "p-[7px]" : "p-2"}>
      {content}
    </SurfaceCard>
  );

  if (!href) return card;

  return (
    <Link href={href} className="focus-ring block rounded-lg">
      {card}
    </Link>
  );
}
