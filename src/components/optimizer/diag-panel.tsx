"use client";

import type { CutPlanMeta } from "@/lib/optimizations/plan-view";
import { formatMm, formatNeighbor, type DiagnosticTarget } from "./diagnostics";

type DiagPanelProps = {
  target: DiagnosticTarget | null;
  meta: CutPlanMeta;
  onClose: () => void;
};

export function DiagPanel({ target, meta, onClose }: DiagPanelProps) {
  return (
    <aside className="diag-panel flex max-h-[520px] flex-col overflow-hidden">
      <header className="flex items-center gap-2 border-b border-[#284050] px-3 py-2">
        <span className="diag-title flex-1">
          {target ? titleFor(target) : "Diagnóstico de huecos"}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="focus-ring rounded border border-[#2f5262] px-2 py-1 text-[11px] text-[#9fb9bd] hover:text-white"
        >
          Cerrar
        </button>
      </header>

      <div className="overflow-auto px-3 py-3">
        {!target ? (
          <p className="text-[#9fb9bd]">
            Hacé clic sobre una pieza, un corte o un sobrante del plano para ver por qué quedó ese espacio: separación
            real contra kerf, nivel de corte y la cadena de rebanadas que condicionó el bloque.
          </p>
        ) : target.kind === "piece" ? (
          <PieceDetail target={target} meta={meta} />
        ) : target.kind === "cut" ? (
          <CutDetail target={target} meta={meta} />
        ) : (
          <RemnantDetail target={target} meta={meta} />
        )}
      </div>
    </aside>
  );
}

function titleFor(target: DiagnosticTarget): string {
  if (target.kind === "piece") {
    return `PIEZA · ${target.piece.description || target.piece.reference} · placa ${target.boardNumber}`;
  }
  if (target.kind === "cut") {
    return `CORTE / KERF · placa ${target.boardNumber}`;
  }
  return `${target.remnant.commercial ? "RETAZO ÚTIL" : "RESTO / DESCARTE"} · placa ${target.boardNumber}`;
}

function PieceDetail({
  target,
  meta
}: {
  target: Extract<DiagnosticTarget, { kind: "piece" }>;
  meta: CutPlanMeta;
}) {
  const { piece, neighbors } = target;

  return (
    <>
      <div className="diag-grid">
        <Row label="Referencia" value={piece.reference || "—"} />
        <Row label="Posición inicial" value={`x=${formatMm(piece.x)} · y=${formatMm(piece.y)} mm`} />
        <Row
          label="Posición final"
          value={`x=${formatMm(piece.x + piece.width)} · y=${formatMm(piece.y + piece.height)} mm`}
        />
        <Row label="Dimensión real" value={`${formatMm(piece.width)} × ${formatMm(piece.height)} mm`} />
        <Row label="Original" value={`${formatMm(piece.sourceWidth)} × ${formatMm(piece.sourceHeight)} mm`} />
        <Row label="Rotada" value={piece.rotated ? "sí" : "no"} />
        <Row label="Nivel" value={String(piece.level)} />
        <Row label="Kerf esperado" value={`${formatMm(meta.kerf)} mm`} />
        <Row label="Vecino derecha" value={formatNeighbor(neighbors.right, meta.kerf)} />
        <Row label="Vecino izquierda" value={formatNeighbor(neighbors.left, meta.kerf)} />
        <Row label="Vecino abajo" value={formatNeighbor(neighbors.below, meta.kerf)} />
        <Row label="Vecino arriba" value={formatNeighbor(neighbors.above, meta.kerf)} />
      </div>

      <div className="mt-3 border-t border-[#284050] pt-3">
        <div className="diag-title mb-2">CADENA DE REGIONES / REBANADAS</div>
        {piece.trace.length === 0 ? (
          <p className="diag-v opacity-70">
            Esta optimización no guardó la trazabilidad de rebanadas. Volvé a optimizar el proyecto para verla.
          </p>
        ) : (
          piece.trace.map((step, index) => (
            <div key={`${step.type}-${index}`} className="border-b border-dashed border-[#263d49] py-2">
              <b>{`#${index + 1} · Nivel ${step.level ?? "—"} · ${step.type}`}</b>
              <br />
              {`Región: ${formatMm(step.region?.width)}×${formatMm(step.region?.height)} @ (${formatMm(
                step.region?.x
              )}, ${formatMm(step.region?.y)})`}
              <br />
              {`Bloque: ${formatMm(step.block?.width)}×${formatMm(step.block?.height)} @ (${formatMm(
                step.block?.x
              )}, ${formatMm(step.block?.y)})`}
              <br />
              <b>{`t = ${formatMm(step.slice)} mm`}</b>
              {step.provisionalSlice != null &&
              step.slice != null &&
              Math.abs(step.provisionalSlice - step.slice) > 1e-9
                ? ` · provisional ${formatMm(step.provisionalSlice)} · liberado ${formatMm(
                    step.provisionalSlice - step.slice
                  )} mm`
                : ""}
              {` · dir ${step.direction ?? "—"} · mult ${step.multiplier ?? 1}`}
              <br />
              {`Pieza ancla: `}
              <b>{step.anchorPiece || "—"}</b>
              {step.anchorWidth != null
                ? ` · ${formatMm(step.anchorWidth)}×${formatMm(step.anchorHeight)}${
                    step.anchorRotated ? " rotada" : ""
                  }`
                : ""}
            </div>
          ))
        )}
      </div>

      <div className="diag-note">
        Si una rebanada ancha aparece anclada a una pieza chica, esa pieza está condicionando el bloque padre. El hueco
        contra el vecino se lee aparte: kerf esperado {formatMm(meta.kerf)} mm.
      </div>
    </>
  );
}

function CutDetail({
  target,
  meta
}: {
  target: Extract<DiagnosticTarget, { kind: "cut" }>;
  meta: CutPlanMeta;
}) {
  const { cut } = target;

  return (
    <>
      <div className="diag-grid">
        <Row label="Corte" value={`#${cut.index + 1}`} />
        <Row label="Nivel" value={String(cut.level)} />
        <Row label="Largo" value={`${formatMm(cut.length)} mm`} />
        <Row label="Dirección" value={cut.direction === "x" ? "horizontal" : "vertical"} />
        <Row label="Sierra / kerf" value={`${formatMm(meta.kerf)} mm`} />
        <Row label="Terminal" value={cut.terminal ? "sí" : "no"} />
        <Row label="Desde" value={`${formatMm(cut.x1)}, ${formatMm(cut.y1)}`} />
        <Row label="Hasta" value={`${formatMm(cut.x2)}, ${formatMm(cut.y2)}`} />
      </div>
      <div className="diag-note">
        Si la franja visible coincide con este corte, el espacio corresponde al kerf físico de la hoja y no a material
        recuperable.
      </div>
    </>
  );
}

function RemnantDetail({
  target,
  meta
}: {
  target: Extract<DiagnosticTarget, { kind: "remnant" }>;
  meta: CutPlanMeta;
}) {
  const { remnant } = target;
  const shortSide = Math.min(remnant.width, remnant.height);
  const longSide = Math.max(remnant.width, remnant.height);

  return (
    <>
      <div className="diag-grid">
        <Row label="Posición" value={`x=${formatMm(remnant.x)} · y=${formatMm(remnant.y)} mm`} />
        <Row label="Dimensiones" value={`${formatMm(remnant.width)} × ${formatMm(remnant.height)} mm`} />
        <Row label="Área" value={`${formatMm(remnant.area / 1e6, 4)} m²`} />
        <Row label="Lado menor" value={`${formatMm(shortSide)} mm`} />
        <Row label="Lado mayor" value={`${formatMm(longSide)} mm`} />
        <Row label="Umbrales" value={`${formatMm(meta.remnantMinShortSide, 0)} / ${formatMm(meta.remnantMinLongSide, 0)} mm`} />
        <Row
          label="Clasificación"
          value={remnant.commercial ? "recuperable para stock" : "descarte según umbrales actuales"}
        />
      </div>
      <div className="diag-note">
        {remnant.commercial
          ? "Sale de un solo corte y supera la medida mínima: se puede guardar como material del próximo pedido."
          : "Queda por debajo del mínimo configurado. Bajá los umbrales de sobrante si querés recuperarlo."}
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <div className="diag-k">{label}</div>
      <div className="diag-v">{value}</div>
    </>
  );
}
