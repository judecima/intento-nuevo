"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { MaterialImage } from "@/components/materials/material-image";
import { EmptyState } from "@/components/ui/empty-state";
import { ChevronRightIcon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";

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

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="board-trigger focus-ring"
      >
        <span className="board-trigger-thumb">
          <MaterialImage src={selected?.imageUrl ?? null} alt={selected?.description ?? "Tablero"} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="board-trigger-name">{selected?.description ?? "Elegir tablero"}</span>
          <span className="board-trigger-meta">
            {selected
              ? `${selected.dimensionsLabel} · ${selected.thickness} mm · ${selected.hasGrain ? "con veta" : "sin veta"}`
              : `${materials.length} tableros del catalogo`}
          </span>
        </span>
        {!disabled ? <ChevronRightIcon className="h-5 w-5 flex-none text-[var(--muted)]" /> : null}
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
  const hasFilters = Boolean(query || thickness || size || grain !== "all");

  const clearFilters = () => {
    setQuery("");
    setThickness("");
    setSize("");
    setGrain("all");
    searchRef.current?.focus();
  };

  return (
    <Modal
      eyebrow="Catalogo"
      title="Elegir tablero"
      size="xl"
      onClose={onClose}
      initialFocus={searchRef}
      toolbar={
        <>
          <div className="board-filters">
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por codigo o descripcion"
              aria-label="Buscar tablero"
              className="input"
            />
            <select
              value={thickness}
              onChange={(event) => setThickness(event.target.value)}
              aria-label="Filtrar por espesor"
              className="select"
            >
              <option value="">Todos los espesores</option>
              {thicknesses.map((value) => (
                <option key={value} value={value}>
                  {value} mm
                </option>
              ))}
            </select>
            <select
              value={size}
              onChange={(event) => setSize(event.target.value)}
              aria-label="Filtrar por medida"
              className="select"
            >
              <option value="">Todas las medidas</option>
              {sizes.map((value) => (
                <option key={value} value={value}>
                  {value.replace("x", " x ")} mm
                </option>
              ))}
            </select>
            <select
              value={grain}
              onChange={(event) => setGrain(event.target.value)}
              aria-label="Filtrar por veta"
              className="select"
            >
              <option value="all">Con y sin veta</option>
              <option value="yes">Solo con veta</option>
              <option value="no">Solo sin veta</option>
            </select>
          </div>

          <div className="board-resultbar">
            <span aria-live="polite">
              {filtered.length === 0
                ? "Ningun tablero coincide"
                : filtered.length > VISIBLE_LIMIT
                  ? `Mostrando ${visible.length} de ${filtered.length} tableros`
                  : `${filtered.length} tablero${filtered.length === 1 ? "" : "s"}`}
            </span>
            {hasFilters ? (
              <button type="button" onClick={clearFilters} className="board-clear focus-ring">
                Limpiar filtros
              </button>
            ) : null}
          </div>
        </>
      }
    >
      {filtered.length === 0 ? (
        <EmptyState title="Ningun tablero coincide con la busqueda">
          Proba con otro codigo o quita alguno de los filtros.
        </EmptyState>
      ) : (
        <>
          <ul className="board-grid">
            {visible.map((material) => {
              const isSelected = material.id === selectedId;

              return (
                <li key={material.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(material.id)}
                    aria-pressed={isSelected}
                    // El seleccionado se marca con outline y no con un borde mas
                    // grueso: cambiar el ancho del borde movia la tarjeta.
                    className="board-card focus-ring"
                    data-selected={isSelected}
                  >
                    <span className="board-card-thumb">
                      <MaterialImage src={material.imageUrl} alt={material.description} />
                    </span>
                    <span className="min-w-0">
                      <span className="board-card-code">{material.code ?? "Sin codigo"}</span>
                      <span className="board-card-name">{material.description}</span>
                      <span className="board-card-tags">
                        <span className="board-tag">{material.dimensionsLabel}</span>
                        <span className="board-tag">{material.thickness} mm</span>
                        {material.hasGrain ? <span className="board-tag board-tag-grain">con veta</span> : null}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {filtered.length > VISIBLE_LIMIT ? (
            <p className="board-more">
              Hay {filtered.length - visible.length} tableros mas. Afina la busqueda para verlos.
            </p>
          ) : null}
        </>
      )}
    </Modal>
  );
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}
