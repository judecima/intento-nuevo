"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MaterialImage } from "@/components/materials/material-image";

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

/** Cantidad de tarjetas que se dibujan por vez: el catalogo tiene cientos. */
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
        className="focus-ring flex w-full items-center gap-3 rounded-[var(--r-md)] border border-[var(--line)] bg-white p-2 text-left shadow-panel hover:border-[var(--teal-claro)] disabled:cursor-not-allowed disabled:bg-[#f1f3f0]"
      >
        <span className="relative h-[54px] w-[66px] flex-none overflow-hidden rounded-[6px] border border-[var(--line)] bg-[#edf1ef]">
          <MaterialImage src={selected?.imageUrl ?? null} alt={selected?.description ?? "Tablero"} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-semibold leading-tight">
            {selected?.description ?? "Elegir tablero"}
          </span>
          <span className="mt-1 block font-mono text-[10.5px] text-[var(--muted)]">
            {selected
              ? `${selected.dimensionsLabel} · ${selected.thickness} mm · ${selected.hasGrain ? "con veta" : "sin veta"}`
              : `${materials.length} tableros del catalogo`}
          </span>
        </span>
        {!disabled ? <span className="px-1 text-[18px] text-[var(--muted)]">›</span> : null}
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
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Elegir tablero"
        className="flex h-[min(820px,92vh)] w-[min(1120px,96vw)] flex-col overflow-hidden rounded-[var(--r-lg)] border border-[#9fb1ac] bg-[#f7f9f8] shadow-float"
      >
        <header className="flex items-center gap-3 bg-[var(--grafito)] px-4 py-3 text-white">
          <h2 className="flex-1 text-[17px] font-bold">Elegir tablero</h2>
          <span className="hidden font-mono text-[11px] text-[#a8c0c5] sm:block">
            {materials.length} en el catalogo
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="focus-ring grid h-[34px] w-[34px] place-items-center rounded-[7px] border border-[#3e5967] bg-[#172b3b] text-[19px] text-white hover:bg-[#22384a]"
          >
            ×
          </button>
        </header>

        <div className="grid gap-2 border-b border-[var(--line)] bg-white p-3 md:grid-cols-[minmax(220px,1fr)_repeat(3,minmax(120px,180px))]">
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
                {value.replace("x", " × ")} mm
              </option>
            ))}
          </select>
          <select value={grain} onChange={(event) => setGrain(event.target.value)} className="select h-[38px]">
            <option value="all">Con y sin veta</option>
            <option value="yes">Solo con veta</option>
            <option value="no">Solo sin veta</option>
          </select>
        </div>

        <div className="border-b border-[var(--line)] bg-[#f5f7f6] px-4 py-2 font-mono text-[10px] text-[#596c67]">
          {filtered.length === 0
            ? "Sin resultados"
            : `${visible.length} de ${filtered.length} tableros${filtered.length > VISIBLE_LIMIT ? " · afina la busqueda para ver el resto" : ""}`}
        </div>

        <div className="grid flex-1 content-start gap-2.5 overflow-auto p-3.5 [grid-template-columns:repeat(auto-fill,minmax(235px,1fr))]">
          {visible.map((material) => {
            const isSelected = material.id === selectedId;

            return (
              <button
                key={material.id}
                type="button"
                onClick={() => onSelect(material.id)}
                aria-pressed={isSelected}
                className={`focus-ring grid grid-cols-[92px_1fr] gap-2.5 rounded-[9px] border bg-white p-2 text-left hover:border-[var(--teal-claro)] hover:shadow-panel ${
                  isSelected ? "border-2 border-[var(--teal)] bg-[#f1fbf8] p-[7px]" : "border-[#ccd7d4]"
                }`}
              >
                <span className="relative block h-[96px] w-[92px] overflow-hidden rounded-[6px] border border-[#d7dfdc] bg-[#edf1ef]">
                  <MaterialImage src={material.imageUrl} alt={material.description} />
                </span>
                <span className="min-w-0">
                  <span className="block font-mono text-[9px] text-[#70827d]">{material.code ?? "Sin codigo"}</span>
                  <span className="mt-1 block text-[11px] font-bold leading-[1.25]">{material.description}</span>
                  <span className="mt-2 flex flex-wrap gap-1">
                    <span className="rounded-[4px] border border-[#d8e2df] bg-[#edf3f1] px-1.5 py-0.5 font-mono text-[9px] text-[#405751]">
                      {material.dimensionsLabel}
                    </span>
                    <span className="rounded-[4px] border border-[#d8e2df] bg-[#edf3f1] px-1.5 py-0.5 font-mono text-[9px] text-[#405751]">
                      {material.thickness} mm
                    </span>
                    {material.hasGrain ? (
                      <span className="rounded-[4px] border border-[#ead7a7] bg-[#fff3d7] px-1.5 py-0.5 font-mono text-[9px] text-[#775d1d]">
                        con veta
                      </span>
                    ) : null}
                  </span>
                </span>
              </button>
            );
          })}

          {filtered.length === 0 ? (
            <p className="col-span-full p-9 text-center font-mono text-[12px] text-[#687a75]">
              Ningun tablero coincide con la busqueda.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}
