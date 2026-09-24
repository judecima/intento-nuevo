"use client";

import {
  cycleEdgeSide,
  edgeBandLabels,
  edgeSideFields,
  edgeTypeCounts,
  type EdgeSideSelection
} from "@/lib/domain/edge-bands";

/**
 * Tapacanto de una pieza, un tipo por lado.
 *
 * El lado se elige sobre un dibujo de la pieza, que es como lo piensa quien
 * carga el corte, y cada click avanza el espesor: 0,45, despues 2 mm, despues
 * los dos sobre el mismo canto, y el cuarto lo saca. El color dice cual es
 * cual sin tener que leer nada.
 *
 * El tipo viaja en `data-type` y no en el nombre de la clase porque Tailwind
 * purga la capa `components` segun los literales que encuentra en el codigo.
 */
export function EdgeBandPicker({
  value,
  disabled = false,
  onChange
}: {
  value: EdgeSideSelection;
  disabled?: boolean;
  onChange: (next: EdgeSideSelection) => void;
}) {
  const counts = edgeTypeCounts(value);

  return (
    <div className="edge-picker">
      <div className="edge-piece" role="group" aria-label="Tapacanto de cada lado de la pieza">
        {edgeSideFields.map((entry) => {
          const type = value[entry.field];

          return (
            <button
              key={entry.field}
              type="button"
              disabled={disabled}
              aria-label={`Tapacanto ${entry.label}: ${edgeBandLabels[type]}`}
              title={`${entry.label}: ${edgeBandLabels[type]} (click para cambiar)`}
              onClick={() => onChange(cycleEdgeSide(value, entry.field))}
              className={EDGE_SIDE_CLASSES[entry.side]}
              data-type={type}
            />
          );
        })}
      </div>

      {/* Donde antes estaba el desplegable: que se eligio, con su color. */}
      <div className="edge-summary">
        {counts.length === 0 ? (
          <span className="edge-summary-empty">Sin canto</span>
        ) : (
          counts.map(({ type, sides }) => (
            <span key={type} className="edge-summary-item">
              <span className="edge-swatch" data-type={type} aria-hidden="true" />
              {edgeBandLabels[type]}
              <span className="edge-summary-count">
                {sides} {sides === 1 ? "lado" : "lados"}
              </span>
            </span>
          ))
        )}
      </div>
    </div>
  );
}

const EDGE_SIDE_CLASSES = {
  top: "edge-side edge-side-top",
  bottom: "edge-side edge-side-bottom",
  left: "edge-side edge-side-left",
  right: "edge-side edge-side-right"
} as const;
