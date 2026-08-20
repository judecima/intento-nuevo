"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { CutPlanBoard, CutPlanMeta, CutPlanPiece } from "@/lib/optimizations/plan-view";
import {
  validateManualPiecePlacement,
  type ManualPiecePosition,
  type ManualPlacementReason
} from "@/lib/optimizations/manual-placement";
import { findNeighbors, isPieceReleased, type DiagnosticTarget } from "./diagnostics";
import { familyVisual, inferPieceFamily, type ManualRemnantClass } from "./visual-families";

type BoardPlanProps = {
  board: CutPlanBoard;
  meta: CutPlanMeta;
  /** Cortes visibles. `null` muestra el plano terminado. */
  step: number | null;
  diagMode?: boolean;
  manualMode?: boolean;
  highlightedPieceIds?: readonly string[];
  familyByPieceId?: ReadonlyMap<string, string>;
  remnantClassById?: ReadonlyMap<string, ManualRemnantClass>;
  selectedId?: string | null;
  onSelect?: (target: DiagnosticTarget) => void;
  onPieceMove?: (pieceId: string, position: ManualPiecePosition) => void;
  onPieceMoveRejected?: (reason: ManualPlacementReason) => void;
  interactive?: boolean;
};

export function BoardPlan({
  board,
  meta,
  step,
  diagMode = false,
  manualMode = false,
  highlightedPieceIds,
  familyByPieceId,
  remnantClassById,
  selectedId = null,
  onSelect,
  onPieceMove,
  onPieceMoveRejected,
  interactive = true
}: BoardPlanProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [draggedPieceId, setDraggedPieceId] = useState<string | null>(null);
  const [draggedPosition, setDraggedPosition] = useState<ManualPiecePosition | null>(null);
  const dragRef = useRef<{
    pieceId: string;
    pointerId: number;
    offsetX: number;
    offsetY: number;
    position: ManualPiecePosition;
  } | null>(null);

  const width = board.width;
  const height = board.height;
  const trimX = meta.trimX;
  const trimY = meta.trimY;
  const fontSize = Math.max(9, (11 * width) / 1400);
  const visibleCuts = step === null ? board.cuts.length : step;
  const simulating = step !== null && step < board.cuts.length;
  const highlighted = new Set(highlightedPieceIds ?? []);
  const patternId = `rayado-${board.index}`;
  const wastePatternId = `punteado-${board.index}`;
  const boardNumber = board.index + 1;

  const select = (target: DiagnosticTarget) => {
    if ((!diagMode && !manualMode) || !onSelect) return;
    onSelect(target);
  };

  const getPiecePosition = (piece: CutPlanPiece): ManualPiecePosition => {
    if (draggedPieceId === piece.id && draggedPosition) return draggedPosition;
    return { x: piece.x, y: piece.y };
  };

  const positionedPieces = board.pieces.map((piece) => ({
    ...piece,
    ...getPiecePosition(piece)
  }));
  const positionedBoard = { ...board, pieces: positionedPieces };

  const toBoardPoint = (event: ReactPointerEvent<SVGRectElement>) => {
    const svg = event.currentTarget.ownerSVGElement;
    const transform = svg?.getScreenCTM();
    if (!svg || !transform) return null;

    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    return point.matrixTransform(transform.inverse());
  };

  const snapPosition = (value: number) => Math.round(value * 2) / 2;

  const beginDrag = (event: ReactPointerEvent<SVGRectElement>, piece: CutPlanPiece) => {
    if (!interactive || !manualMode || step !== null || !onPieceMove) return;
    const point = toBoardPoint(event);
    if (!point) return;

    const position = { x: piece.x, y: piece.y };
    dragRef.current = {
      pieceId: piece.id,
      pointerId: event.pointerId,
      offsetX: point.x - (piece.x + trimX),
      offsetY: point.y - (piece.y + trimY),
      position
    };
    setDraggedPieceId(piece.id);
    setDraggedPosition(position);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveDrag = (event: ReactPointerEvent<SVGRectElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const point = toBoardPoint(event);
    if (!point) return;

    const position = {
      x: snapPosition(point.x - trimX - drag.offsetX),
      y: snapPosition(point.y - trimY - drag.offsetY)
    };
    dragRef.current = { ...drag, position };
    setDraggedPosition(position);
  };

  const finishDrag = (event: ReactPointerEvent<SVGRectElement>, cancelled = false) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (cancelled) {
      onPieceMoveRejected?.("outside-board");
    } else {
      const validation = validateManualPiecePlacement({
        board,
        pieceId: drag.pieceId,
        position: drag.position,
        trimX,
        trimY
      });
      if (validation.valid) onPieceMove?.(drag.pieceId, drag.position);
      else onPieceMoveRejected?.(validation.reason);
    }

    dragRef.current = null;
    setDraggedPieceId(null);
    setDraggedPosition(null);
  };

  return (
    <svg
      viewBox={`-20 -20 ${width + 40} ${height + 40}`}
      role="img"
      aria-label={`Plano de corte de la placa ${boardNumber}`}
      className={`plano${diagMode ? " modo-diag" : ""}${manualMode ? " modo-manual" : ""}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <pattern id={patternId} width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="14" height="14" fill="#c9d6d2" opacity="0.55" />
          <line x1="0" y1="0" x2="0" y2="14" stroke="#12666b" strokeWidth="2.5" opacity="0.35" />
        </pattern>
        <pattern id={wastePatternId} width="10" height="10" patternUnits="userSpaceOnUse">
          <rect width="10" height="10" fill="#f8faf8" />
          <circle cx="2" cy="2" r="1.1" fill="#68736f" opacity="0.7" />
          <circle cx="7" cy="7" r="1.1" fill="#68736f" opacity="0.7" />
        </pattern>
      </defs>

      <rect
        x="0"
        y="0"
        width={width}
        height={height}
        fill="var(--placa)"
        stroke="#7c766b"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
      {trimX > 0 || trimY > 0 ? (
        <rect
          x={trimX}
          y={trimY}
          width={Math.max(0, width - trimX)}
          height={Math.max(0, height - trimY)}
          fill="none"
          stroke="#7c766b"
          strokeWidth="1"
          strokeDasharray="12 8"
          vectorEffect="non-scaling-stroke"
          opacity="0.7"
        />
      ) : null}

      {board.remnants.map((remnant) => {
        const x = remnant.x + trimX;
        const y = remnant.y + trimY;
        const manualClass = remnantClassById?.get(remnant.id) ?? "auto";
        const commercial = manualClass === "usable" || (manualClass === "auto" && remnant.commercial);
        const showLabel = Math.min(remnant.width, remnant.height) > 85 && Math.max(remnant.width, remnant.height) > 170;
        const vertical = remnant.height > remnant.width * 1.6;
        const cx = x + remnant.width / 2;
        const cy = y + remnant.height / 2;

        return (
          <g key={remnant.id}>
            {!simulating ? (
              <rect
                className={commercial ? "resto" : "desperdicio"}
                x={x}
                y={y}
                width={remnant.width}
                height={remnant.height}
                rx={1}
                style={{ fill: `url(#${commercial ? patternId : wastePatternId})` }}
              >
                <title>{`${commercial ? "Sobrante util" : "Desperdicio"} ${Math.round(remnant.width)}×${Math.round(
                  remnant.height
                )} mm`}</title>
              </rect>
            ) : null}
            {showLabel && !simulating ? (
              <text
                className={commercial ? "resto-txt" : "desperdicio-txt"}
                x={cx}
                y={cy}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={fontSize}
                transform={vertical ? `rotate(-90 ${cx} ${cy})` : undefined}
              >
                {`${commercial ? "SOBRANTE UTIL" : "DESPERDICIO"} ${Math.round(remnant.width)}×${Math.round(remnant.height)}`}
              </text>
            ) : null}
            <rect
              className="resto-diag"
              x={x}
              y={y}
              width={remnant.width}
              height={remnant.height}
              rx={1}
              onClick={interactive && (diagMode || manualMode) ? () => select({ kind: "remnant", boardNumber, remnant }) : undefined}
            />
          </g>
        );
      })}

      {positionedPieces.map((piece) => {
        const x = piece.x + trimX;
        const y = piece.y + trimY;
        const released = step === null || isPieceReleased(piece, board.cuts, step);
        const isHighlighted = highlighted.has(piece.id) || hovered === piece.id;
        const family = familyByPieceId?.get(piece.id) ?? inferPieceFamily(piece.description);
        const familyStyle = familyVisual(family);
        const classes = ["pz"];
        if (isHighlighted) classes.push("on");
        if (!released) classes.push("off");
        if (selectedId === piece.id) classes.push("sel");

        return (
          <g key={piece.id}>
            <rect
              className={classes.join(" ")}
              x={x}
              y={y}
              width={piece.width}
              height={piece.height}
              rx={1}
              onMouseEnter={interactive ? () => setHovered(piece.id) : undefined}
              onMouseLeave={interactive ? () => setHovered(null) : undefined}
              onPointerDown={interactive && manualMode ? (event) => beginDrag(event, piece) : undefined}
              onPointerMove={interactive && manualMode ? moveDrag : undefined}
              onPointerUp={interactive && manualMode ? (event) => finishDrag(event) : undefined}
              onPointerCancel={interactive && manualMode ? (event) => finishDrag(event, true) : undefined}
              onClick={
                interactive && (diagMode || manualMode)
                  ? () =>
                      select({
                        kind: "piece",
                        boardNumber,
                        piece,
                        neighbors: findNeighbors(positionedBoard, piece)
                      })
                  : undefined
              }
              style={isHighlighted || selectedId === piece.id ? undefined : { fill: familyStyle.color, strokeDasharray: familyStyle.dash || undefined }}
            >
              <title>
                {`${piece.description || piece.reference} · ${Math.round(piece.width)}×${Math.round(piece.height)} mm${
                  piece.rotated ? " (rotada)" : ""
                } · Familia: ${familyStyle.name}`}
              </title>
            </rect>
            {released ? <EdgeBands piece={piece} x={x} y={y} /> : null}
            {released ? <PieceLabel piece={piece} family={familyStyle.name} x={x} y={y} fontSize={fontSize} /> : null}
          </g>
        );
      })}

      {board.cuts.map((cut, index) => {
        const hidden = index >= visibleCuts;
        const current = simulating && index === visibleCuts - 1;
        const classes = ["corte"];
        if (hidden) classes.push("oculto");
        if (current) classes.push("actual");

        return (
          <g key={cut.id}>
            <line
              className={classes.join(" ")}
              x1={cut.x1 + trimX}
              y1={cut.y1 + trimY}
              x2={cut.x2 + trimX}
              y2={cut.y2 + trimY}
            />
            <line
              className="corte-hit"
              x1={cut.x1 + trimX}
              y1={cut.y1 + trimY}
              x2={cut.x2 + trimX}
              y2={cut.y2 + trimY}
              onClick={interactive ? () => select({ kind: "cut", boardNumber, cut }) : undefined}
            />
          </g>
        );
      })}

      <text x={width / 2} y={-6} textAnchor="middle" fontSize={fontSize} opacity="0.65">
        {`${Math.round(width)} × ${Math.round(height)} mm`}
      </text>
    </svg>
  );
}

function EdgeBands({ piece, x, y }: { piece: CutPlanPiece; x: number; y: number }) {
  const { edges } = piece;
  if (!edges.top && !edges.bottom && !edges.left && !edges.right) return null;

  const w = piece.width;
  const h = piece.height;
  // Si la pieza rota, sus lados rotan con ella: el canto sigue al lado fisico.
  const sides = piece.rotated
    ? {
        top: [x, y, x, y + h],
        bottom: [x + w, y, x + w, y + h],
        left: [x, y, x + w, y],
        right: [x, y + h, x + w, y + h]
      }
    : {
        top: [x, y, x + w, y],
        bottom: [x, y + h, x + w, y + h],
        left: [x, y, x, y + h],
        right: [x + w, y, x + w, y + h]
      };

  return (
    <>
      {(["top", "bottom", "left", "right"] as const)
        .filter((side) => edges[side])
        .map((side) => {
          const [x1, y1, x2, y2] = sides[side];
          return <line key={side} className="canto" x1={x1} y1={y1} x2={x2} y2={y2} />;
        })}
    </>
  );
}

function PieceLabel({
  piece,
  family,
  x,
  y,
  fontSize
}: {
  piece: CutPlanPiece;
  family: string;
  x: number;
  y: number;
  fontSize: number;
}) {
  const cx = x + piece.width / 2;
  const cy = y + piece.height / 2;
  const dimensions = `${Math.round(piece.width)}×${Math.round(piece.height)}`;
  const tight = Math.min(piece.width, piece.height) < 130 || piece.width < 180;

  if (!tight) {
    const label =
      piece.description.length > 22 ? `${piece.description.slice(0, 21)}…` : piece.description;

    return (
      <>
        <text x={cx} y={cy - 2} textAnchor="middle" fontSize={fontSize * 1.05} fontWeight={600}>
          {dimensions}
        </text>
        {label ? (
          <text x={cx} y={cy + fontSize * 1.3} textAnchor="middle" fontSize={fontSize * 0.88} opacity="0.72">
            {label}
          </text>
        ) : null}
        <text x={cx} y={cy + fontSize * 2.35} textAnchor="middle" fontSize={fontSize * 0.72} opacity="0.64">
          {family}
        </text>
      </>
    );
  }

  if (Math.max(piece.width, piece.height) > 150) {
    const vertical = piece.height > piece.width;
    return (
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={fontSize * 0.9}
        transform={vertical ? `rotate(-90 ${cx} ${cy})` : undefined}
      >
        {dimensions}
      </text>
    );
  }

  return null;
}
