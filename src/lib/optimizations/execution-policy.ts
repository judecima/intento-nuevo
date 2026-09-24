export const INLINE_MAX_PHYSICAL_PIECES = 50;
export const INLINE_MAX_LOGICAL_TYPES = 20;

export type OptimizationExecutionMode = "inline" | "queued-worker";

export type OptimizationExecutionPolicy = {
  mode: OptimizationExecutionMode;
  physicalPieces: number;
  logicalTypes: number;
  reason: "sync-cohort" | "large-order";
};

type RoutablePiece = {
  quantity: number;
  width: number;
  height: number;
  grain?: boolean | null;
  can_rotate?: boolean | null;
  canRotate?: boolean | null;
  edge_top?: boolean | null;
  edge_bottom?: boolean | null;
  edge_left?: boolean | null;
  edge_right?: boolean | null;
  edgeTop?: boolean | null;
  edgeBottom?: boolean | null;
  edgeLeft?: boolean | null;
  edgeRight?: boolean | null;
  edge_type?: string | null;
  edgeType?: string | null;
  edge_top_type?: string | null;
  edge_bottom_type?: string | null;
  edge_left_type?: string | null;
  edge_right_type?: string | null;
  edgeTopType?: string | null;
  edgeBottomType?: string | null;
  edgeLeftType?: string | null;
  edgeRightType?: string | null;
};

/**
 * Decide unicamente DONDE ejecutar. Nunca selecciona calidad ni algoritmo.
 * Ambos caminos ejecutan el mismo kernel congelado y la misma estrategia.
 */
export function optimizationExecutionPolicy(items: RoutablePiece[]): OptimizationExecutionPolicy {
  const physicalPieces = items.reduce((sum, item) => sum + Math.max(0, Math.trunc(Number(item.quantity) || 0)), 0);
  const logicalTypes = new Set(items.filter((item) => Number(item.quantity) > 0).map(logicalTypeKey)).size;
  const inline = physicalPieces <= INLINE_MAX_PHYSICAL_PIECES && logicalTypes <= INLINE_MAX_LOGICAL_TYPES;

  return {
    mode: inline ? "inline" : "queued-worker",
    physicalPieces,
    logicalTypes,
    reason: inline ? "sync-cohort" : "large-order"
  };
}

function logicalTypeKey(item: RoutablePiece): string {
  const canRotate = Boolean(item.can_rotate ?? item.canRotate);
  const grain = Boolean(item.grain);
  const width = Number(item.width);
  const height = Number(item.height);

  // Para routing preferimos sobreestimar tipos antes que mandar un caso pesado
  // por el camino inline. Solo normalizamos dimensiones cuando la rotacion es
  // realmente libre y no hay veta.
  const dimensions = canRotate && !grain
    ? [Math.min(width, height), Math.max(width, height)]
    : [width, height];

  return [
    dimensions[0],
    dimensions[1],
    grain ? 1 : 0,
    canRotate ? 1 : 0,
    Boolean(item.edge_top ?? item.edgeTop) ? 1 : 0,
    Boolean(item.edge_bottom ?? item.edgeBottom) ? 1 : 0,
    Boolean(item.edge_left ?? item.edgeLeft) ? 1 : 0,
    Boolean(item.edge_right ?? item.edgeRight) ? 1 : 0,
    item.edge_type ?? item.edgeType ?? "none",
    item.edge_top_type ?? item.edgeTopType ?? "",
    item.edge_bottom_type ?? item.edgeBottomType ?? "",
    item.edge_left_type ?? item.edgeLeftType ?? "",
    item.edge_right_type ?? item.edgeRightType ?? ""
  ].join("|");
}
