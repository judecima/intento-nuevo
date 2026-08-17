import type { CutPlanBoard, CutPlanCut, CutPlanPiece, CutPlanRemnant } from "@/lib/optimizations/plan-view";

export type PieceNeighbor = {
  gap: number;
  description: string;
  width: number;
  height: number;
};

export type PieceNeighbors = {
  right: PieceNeighbor | null;
  left: PieceNeighbor | null;
  below: PieceNeighbor | null;
  above: PieceNeighbor | null;
};

export type DiagnosticTarget =
  | { kind: "piece"; boardNumber: number; piece: CutPlanPiece; neighbors: PieceNeighbors }
  | { kind: "cut"; boardNumber: number; cut: CutPlanCut }
  | { kind: "remnant"; boardNumber: number; remnant: CutPlanRemnant };

const EPS = 1e-9;

/**
 * Vecinos geometricos de una pieza: los que se proyectan sobre el eje
 * perpendicular y estan del lado indicado. `gap` es la separacion real, que
 * comparada contra el kerf revela si el hueco es sierra o material perdido.
 */
export function findNeighbors(board: CutPlanBoard, piece: CutPlanPiece): PieceNeighbors {
  const x0 = piece.x;
  const x1 = piece.x + piece.width;
  const y0 = piece.y;
  const y1 = piece.y + piece.height;

  const overlapsY = (other: CutPlanPiece) => Math.min(y1, other.y + other.height) - Math.max(y0, other.y) > EPS;
  const overlapsX = (other: CutPlanPiece) => Math.min(x1, other.x + other.width) - Math.max(x0, other.x) > EPS;

  const others = board.pieces.filter((other) => other.id !== piece.id);

  const nearest = (candidates: Array<{ piece: CutPlanPiece; gap: number }>): PieceNeighbor | null => {
    const sorted = candidates.sort((a, b) => a.gap - b.gap);
    const first = sorted[0];
    if (!first) return null;
    return {
      gap: first.gap,
      description: first.piece.description || first.piece.reference || "pieza",
      width: first.piece.width,
      height: first.piece.height
    };
  };

  return {
    right: nearest(
      others
        .filter((other) => overlapsY(other) && other.x >= x1 - EPS)
        .map((other) => ({ piece: other, gap: other.x - x1 }))
    ),
    left: nearest(
      others
        .filter((other) => overlapsY(other) && other.x + other.width <= x0 + EPS)
        .map((other) => ({ piece: other, gap: x0 - (other.x + other.width) }))
    ),
    below: nearest(
      others
        .filter((other) => overlapsX(other) && other.y >= y1 - EPS)
        .map((other) => ({ piece: other, gap: other.y - y1 }))
    ),
    above: nearest(
      others
        .filter((other) => overlapsX(other) && other.y + other.height <= y0 + EPS)
        .map((other) => ({ piece: other, gap: y0 - (other.y + other.height) }))
    )
  };
}

/**
 * Nivel de corte alcanzado tras `step` cortes. Las piezas cuyo nivel es menor o
 * igual ya quedaron liberadas del tablero.
 */
export function releasedLevel(cuts: CutPlanCut[], step: number): number {
  if (step >= cuts.length) return Number.POSITIVE_INFINITY;
  if (step <= 0) return -1;
  return cuts[step - 1]?.level ?? 0;
}

export function isPieceReleased(piece: CutPlanPiece, cuts: CutPlanCut[], step: number): boolean {
  return piece.level <= releasedLevel(cuts, step);
}

export function formatMm(value: number | null | undefined, decimals = 1): string {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(decimals) : "—";
}

export function formatNeighbor(neighbor: PieceNeighbor | null, kerf: number): string {
  if (!neighbor) return "—";
  const extra = Math.max(0, neighbor.gap - kerf);
  const suffix = neighbor.gap >= 0 ? ` · material sobre kerf ${formatMm(extra)} mm` : "";
  return `${neighbor.description} · gap ${formatMm(neighbor.gap)} mm${suffix}`;
}
