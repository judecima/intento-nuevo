import Link from "next/link";
import { MaterialCard } from "@/components/materials/material-card";
import { formatMillimeters, materialKindLabels, materialKinds, type MaterialFilters } from "@/lib/domain/materials";
import type { MaterialFacetOptions, MaterialListItem } from "@/lib/materials/queries";

type MaterialGalleryProps = {
  basePath: string;
  filters: MaterialFilters;
  facets: MaterialFacetOptions;
  materials: MaterialListItem[];
  matchingCount: number;
  sourceCount: number;
  selectedMaterialId?: string;
};

export function MaterialGallery({
  basePath,
  filters,
  facets,
  materials,
  matchingCount,
  sourceCount,
  selectedMaterialId
}: MaterialGalleryProps) {
  return (
    <section className="space-y-4">
      <form action={basePath} className="rounded-[var(--r)] border border-[var(--line)] bg-[var(--md-surface-container-lowest)]">
        {selectedMaterialId ? <input type="hidden" name="material" value={selectedMaterialId} /> : null}
        <div className="grid gap-3 border-b border-[var(--line)] p-4 lg:grid-cols-[minmax(180px,1fr)_170px_170px_140px_130px]">
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">Buscar</span>
            <input
              name="q"
              defaultValue={filters.q}
              placeholder="Codigo, nombre o textura"
              className="mt-2 h-[38px] w-full rounded-[7px] border border-[var(--line)] bg-[var(--md-surface-container-lowest)] px-3 text-[12px] focus-ring"
            />
          </label>

          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">Tipo</span>
            <select
              name="kind"
              defaultValue={filters.kind}
              className="mt-2 h-[38px] w-full rounded-[7px] border border-[var(--line)] bg-[var(--md-surface-container-lowest)] px-3 text-[12px] focus-ring"
            >
              {materialKinds.map((kind) => (
                <option key={kind} value={kind}>
                  {materialKindLabels[kind]}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">Espesor</span>
            <select
              name="thickness"
              defaultValue={filters.thickness?.toString() ?? ""}
              className="mt-2 h-[38px] w-full rounded-[7px] border border-[var(--line)] bg-[var(--md-surface-container-lowest)] px-3 text-[12px] focus-ring"
            >
              <option value="">Todos</option>
              {facets.thicknesses.map((thickness) => (
                <option key={thickness} value={thickness}>
                  {formatMillimeters(thickness)} mm
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">Medida</span>
            <select
              name="size"
              defaultValue={filters.size}
              className="mt-2 h-[38px] w-full rounded-[7px] border border-[var(--line)] bg-[var(--md-surface-container-lowest)] px-3 text-[12px] focus-ring"
            >
              <option value="">Todas</option>
              {facets.sizes.map((size) => (
                <option key={size.value} value={size.value}>
                  {size.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">Veta</span>
            <select
              name="grain"
              defaultValue={filters.grain}
              className="mt-2 h-[38px] w-full rounded-[7px] border border-[var(--line)] bg-[var(--md-surface-container-lowest)] px-3 text-[12px] focus-ring"
            >
              <option value="all">Todas</option>
              <option value="yes">Con veta</option>
              <option value="no">Sin veta</option>
            </select>
          </label>
        </div>

        <div className="flex flex-col gap-3 bg-[var(--md-surface-container)] px-4 py-3 text-sm md:flex-row md:items-center md:justify-between">
          <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">
            {matchingCount} resultados sobre {sourceCount} materiales habilitados
          </div>
          <div className="flex gap-2">
            <Link href={basePath} className="focus-ring rounded-[var(--r)] border border-[var(--line)] bg-[var(--md-surface-container-lowest)] px-3 py-2 text-[13px] hover:border-[var(--linea-fuerte)]">
              Limpiar
            </Link>
            <button className="focus-ring rounded-[var(--r)] border border-[var(--teal)] bg-[var(--teal)] px-3 py-2 text-[13px] font-semibold text-white hover:bg-[var(--teal-claro)]" type="submit">
              Filtrar
            </button>
          </div>
        </div>
      </form>

      {materials.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
          {materials.map((material) => (
            <MaterialCard
              key={material.id}
              material={material}
              selected={material.id === selectedMaterialId}
              href={selectionHref(basePath, filters, material.id)}
            />
          ))}
        </div>
      ) : (
        <div className="border border-[var(--line)] bg-[var(--md-surface-container-lowest)] p-6 text-sm text-[var(--muted)]">
          No hay materiales para los filtros seleccionados.
        </div>
      )}
    </section>
  );
}

function selectionHref(basePath: string, filters: MaterialFilters, materialId: string): string {
  const params = new URLSearchParams();

  if (filters.q) params.set("q", filters.q);
  if (filters.kind) params.set("kind", filters.kind);
  if (filters.thickness) params.set("thickness", String(filters.thickness));
  if (filters.size) params.set("size", filters.size);
  if (filters.grain && filters.grain !== "all") params.set("grain", filters.grain);
  params.set("material", materialId);

  return `${basePath}?${params.toString()}`;
}
