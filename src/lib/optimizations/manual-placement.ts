import type { CutPlanBoard, CutPlanPiece } from "./plan-view";

export type ManualPiecePosition = {
  x: number;
  y: number;
};

export type ManualPiecePositionMap = Readonly<Record<string, ManualPiecePosition>>;

export type ManualPlacementReason = "outside-board" | "overlap";

export type ManualPlacementValidation =
  | { valid: true }
  | { valid: false; reason: ManualPlacementReason };

const EPSILON = 0.01;

/**
 * Valida un movimiento visual sin alterar el resultado del optimizador.
 * Las coordenadas de una pieza son locales al area util despues del refilado.
 */
export function validateManualPiecePlacement({
  board,
  pieceId,
  position,
  trimX = 0,
  trimY = 0,
  positions = {}
}: {
  board: CutPlanBoard;
  pieceId: string;
  position: ManualPiecePosition;
  trimX?: number;
  trimY?: number;
  positions?: ManualPiecePositionMap;
}): ManualPlacementValidation {
  const piece = board.pieces.find((item) => item.id === pieceId);
  if (!piece) return { valid: false, reason: "outside-board" };

  const rightLimit = Math.max(0, board.width - trimX);
  const bottomLimit = Math.max(0, board.height - trimY);

  if (
    position.x < -EPSILON ||
    position.y < -EPSILON ||
    position.x + piece.width > rightLimit + EPSILON ||
    position.y + piece.height > bottomLimit + EPSILON
  ) {
    return { valid: false, reason: "outside-board" };
  }

  const candidate = { ...piece, x: position.x, y: position.y };
  const overlapsAnotherPiece = board.pieces.some((other) => {
    if (other.id === pieceId) return false;
    const otherPosition = positions[other.id] ?? { x: other.x, y: other.y };
    return rectanglesOverlap(candidate, {
      ...other,
      x: otherPosition.x,
      y: otherPosition.y
    });
  });

  return overlapsAnotherPiece ? { valid: false, reason: "overlap" } : { valid: true };
}

function rectanglesOverlap(first: CutPlanPiece, second: CutPlanPiece) {
  return (
    first.x < second.x + second.width - EPSILON &&
    first.x + first.width > second.x + EPSILON &&
    first.y < second.y + second.height - EPSILON &&
    first.y + first.height > second.y + EPSILON
  );
}
