"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MaterialImage } from "@/components/materials/material-image";
import { MtCard, MtCardBody, MtChip, MtIconButton, MtTypography } from "@/components/ui/material";

export type BoardMaterialOption = {
  id: string;
  code: string | null;
  description: string;
  width: number;
  height: number;
  thickness: number;
  hasGrain: boolean;
  dimensionsLabel: string;
  imageUrl: string | null;
};

type BoardPickerProps = {
  materials: BoardMaterialOption[];
  selectedId: string;
  disabled?: boolean;
  onSelect: (materialId: string) => void;
};

const VISIBLE_LIMIT = 60;

export function BoardPicker({ materials, selectedId, disabled = false, onSelect }: BoardPickerProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selected = materials.find((material) => material.id === selectedId) ?? null;

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="focus-ring flex w-full items-center gap-3 rounded-lg border border-[var(--line)] bg-[var(--md-surface-container-lowest)] p-2 text-left shadow-sm transition hover:border-[var(--teal-claro)] hover:shadow-md disabled:cursor-not-allowed disabled:bg-[var(--md-surface-container)]"
      >
        <span className="relative h-[54px] w-[66px] flex-none overflow-hidden rounded-md border border-[var(--line)] bg-[var(--md-surface-container)]">
          <MaterialImage src={selected?.imageUrl ?? null} alt={selected?.description ?? "Tablero"} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-semibold leading-tight">
            {selected?.description ?? "Elegir tablero"}
          </span>
          <span className="mt-1 block font-mono text-[10.5px] text-[var(--muted)]">
            {selected
              ? `${selected.dimensionsLabel} - ${selected.thickness} mm - ${selected.hasGrain ? "con veta" : "sin veta"}`
              : `${materials.length} tableros del catalogo`}
          </span>
        </span>
        {!disabled ? <span className="px-1 text-[18px] text-[var(--muted)]">&gt;</span> : null}
      </button>

      {open ? (
        <BoardDialog
          materials={materials}
          selectedId={selectedId}
          onClose={close}
          onSelect={(id) => {
            onSelect(id);
            close();
          }}
        />
      ) : null}
    </>
  );
}

function BoardDialog({
  materials,
  selectedId,
  onClose,
  onSelect
}: {
  materials: BoardMaterialOption[];
  selectedId: string;
  onClose: () => void;
  onSelect: (materialId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [thickness, setThickness] = useState("");
  const [size, setSize] = useState("");
  const [grain, setGrain] = useState("all");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const thicknesses = useMemo(
    () => [...new Set(materials.map((material) => material.thickness))].sort((a, b) => a - b),
    [materials]
  );

  const sizes = useMemo(
    () => [...new Set(materials.map((material) => `${material.width}x${material.height}`))].sort(),
    [materials]
  );

  const filtered = useMemo(() => {
    const needle = normalize(query);

    return materials.filter((material) => {
      if (needle && !normalize(`${material.code ?? ""} ${material.description}`).includes(needle)) return false;
      if (thickness && material.thickness !== Number(thickness)) return false;
      if (size && `${material.width}x${material.height}` !== size) return false;
      if (grain === "yes" && !material.hasGrain) return false;
      if (grain === "no" && material.hasGrain) return false;
      return true;
    });
  }, [materials, query, thickness, size, grain]);

  const visible = filtered.slice(0, VISIBLE_LIMIT);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(9,18,28,.68)] p-4 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <MtCard
        role="dialog"
        aria-modal="true"
        aria-label="Elegir tablero"
        className="flex h-[min(820px,92vh)] w-[min(1120px,96vw)] flex-col overflow-hidden rounded-lg border border-[var(--rail-outline)] bg-[var(--paper)] text-[var(--ink)] shadow-2xl"
      >
        <header className="flex items-center gap-3 bg-[var(--brand-primary)] px-4 py-3 text-[var(--md-on-primary)]">
          <MtTypography as="h2" variant="h6" className="flex-1 font-medium text-[var(--md-on-primary)]">
            Elegir tablero
          </MtTypography>
          <span className="hidden font-mono text-[11px] text-[var(--md-primary-container)] sm:block">
            {materials.length} en el catalogo
          </span>
          <MtIconButton
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            variant="outlined"
            color="white"
            size="sm"
            className="rounded-md"
          >
            x
          </MtIconButton>
        </header>

        <div className="grid gap-2 border-b border-[var(--line)] bg-[var(--md-surface-container-lowest)] p-3 md:grid-cols-[minmax(220px,1fr)_repeat(3,minmax(120px,180px))]">
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por codigo o descripcion"
            className="input h-[38px]"
          />
          <select value={thickness} onChange={(event) => setThickness(event.target.value)} className="select h-[38px]">
            <option value="">Todos los espesores</option>
            {thicknesses.map((value) => (
              <option key={value} value={value}>
                {value} mm
              </option>
            ))}
          </select>
          <select value={size} onChange={(event) => setSize(event.target.value)} className="select h-[38px]">
            <option value="">Todas las medidas</option>
            {sizes.map((value) => (
              <option key={value} value={value}>
                {value.replace("x", " x ")} mm
              </option>
            ))}
          </select>
          <select value={grain} onChange={(event) => setGrain(event.target.value)} className="select h-[38px]">
            <option value="all">Con y sin veta</option>
            <option value="yes">Solo con veta</option>
            <option value="no">Solo sin veta</option>
          </select>
        </div>

        <div className="border-b border-[var(--line)] bg-[var(--md-surface-container)] px-4 py-2 font-mono text-[10px] text-[var(--muted)]">
          {filtered.length === 0
            ? "Sin resultados"
            : `${visible.length} de ${filtered.length} tableros${filtered.length > VISIBLE_LIMIT ? " - afina la busqueda para ver el resto" : ""}`}
        </div>

        <MtCardBody className="grid flex-1 content-start gap-2.5 overflow-auto p-3.5 [grid-template-columns:repeat(auto-fill,minmax(235px,1fr))]">
          {visible.map((material) => {
            const isSelected = material.id === selectedId;

            return (
              <button
                key={material.id}
                type="button"
                onClick={() => onSelect(material.id)}
                aria-pressed={isSelected}
                className={`focus-ring grid grid-cols-[92px_1fr] gap-2.5 rounded-lg border bg-[var(--md-surface-container-lowest)] p-2 text-left transition hover:border-[var(--teal-claro)] hover:shadow-md ${
                  isSelected ? "border-2 border-[var(--teal)] bg-[var(--brand-primary-hover-surface)] p-[7px]" : "border-[var(--line)]"
                }`}
              >
                <span className="relative block h-[96px] w-[92px] overflow-hidden rounded-md border border-[var(--line)] bg-[var(--md-surface-container)]">
                  <MaterialImage src={material.imageUrl} alt={material.description} />
                </span>
                <span className="min-w-0">
                  <span className="block font-mono text-[9px] text-[var(--muted)]">{material.code ?? "Sin codigo"}</span>
                  <span className="mt-1 block text-[11px] font-bold leading-[1.25]">{material.description}</span>
                  <span className="mt-2 flex flex-wrap gap-1">
                    <MtChip value={material.dimensionsLabel} size="sm" variant="ghost" color="blue-gray" className="rounded-md font-mono text-[9px]" />
                    <MtChip value={`${material.thickness} mm`} size="sm" variant="ghost" color="blue-gray" className="rounded-md font-mono text-[9px]" />
                    {material.hasGrain ? (
                      <MtChip value="con veta" size="sm" variant="ghost" color="amber" className="rounded-md font-mono text-[9px]" />
                    ) : null}
                  </span>
                </span>
              </button>
            );
          })}

          {filtered.length === 0 ? (
            <p className="col-span-full p-9 text-center font-mono text-[12px] text-[var(--muted)]">
              Ningun tablero coincide con la busqueda.
            </p>
          ) : null}
        </MtCardBody>
      </MtCard>
    </div>
  );
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
