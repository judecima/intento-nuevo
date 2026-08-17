import Link from "next/link";
import { MaterialImage } from "@/components/materials/material-image";
import { materialKindLabels } from "@/lib/domain/materials";
import type { MaterialListItem } from "@/lib/materials/queries";

type MaterialCardProps = {
  material: MaterialListItem;
  href?: string;
  selected?: boolean;
};

export function MaterialCard({ material, href, selected = false }: MaterialCardProps) {
  const content = (
    <>
      <div className="relative aspect-[4/3] overflow-hidden border border-[#d7dfdc] bg-[#edf1ef]">
        <MaterialImage src={material.displayImageUrl} alt={material.description} />
      </div>
      <div className="min-w-0 space-y-2 pt-3">
        <div>
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[9.5px] text-[#70827d]">{material.code}</span>
            <span className="rounded-[4px] border border-[#d8e2df] bg-[#edf3f1] px-1.5 py-0.5 font-mono text-[9px] text-[#405751]">
              {materialKindLabels[material.type]}
            </span>
          </div>
          <h3 className="mt-1.5 min-h-10 text-[12px] font-bold leading-[1.25] text-[#1a2623]">
            {material.description}
          </h3>
        </div>

        <div className="flex flex-wrap gap-1 text-[9px]">
          <span className="rounded-[4px] border border-[#d8e2df] bg-[#edf3f1] px-1.5 py-1 font-mono text-[#405751]">
            {material.dimensionsLabel}
          </span>
          <span className={`rounded-[4px] border px-1.5 py-1 font-mono ${material.has_grain ? "border-[#ead7a7] bg-[#fff3d7] text-[#775d1d]" : "border-[#d8e2df] bg-[#edf3f1] text-[#405751]"}`}>
            {material.has_grain ? "Con veta" : "Sin veta"}
          </span>
          {material.texture_id ? (
            <span className="rounded-[4px] border border-[#d8e2df] bg-[#edf3f1] px-1.5 py-1 font-mono text-[#405751]">
              Textura {material.texture_id}
            </span>
          ) : null}
        </div>
      </div>
    </>
  );

  const className = [
    "block rounded-[7px] border bg-white p-2 text-left text-[#1a2623] transition",
    selected
      ? "border-2 border-[#159787] bg-[#f1fbf8] p-[7px]"
      : "border-[#ccd7d4] hover:border-[#159787] hover:shadow-[0_3px_15px_rgba(0,0,0,.08)]"
  ].join(" ");

  if (!href) return <article className={className}>{content}</article>;

  return (
    <Link href={href} className={`${className} focus-ring`}>
      {content}
    </Link>
  );
}
