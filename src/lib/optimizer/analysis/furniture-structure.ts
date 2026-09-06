import type { OptimizationInput, OptimizationPieceInput } from "../types";

export interface FurnitureStructureMetrics {
  pieceCount: number;
  pieceTypes: number;
  repeatFactor: number;
  maxMultiplicity: number;
  repeatedPieceRatio: number;
  distinctPairs: number;
  distinctWidths: number;
  distinctHeights: number;
  dominantWidthRatio: number;
  dominantHeightRatio: number;
  sharedDimensionCoverageRatio: number;
  familyCoverageRatio: number;
  familyCount: number;
  largestFamilyTypes: number;
  largestFamilyPieces: number;
  rotationConstrainedPieceRatio: number;
}

/**
 * Métricas pasivas de estructura productiva del pedido.
 *
 * No clasifican semánticamente piezas como laterales/estantes/puertas y no
 * modifican ninguna decisión del optimizador. La intención es medir cuánto del
 * pedido puede agruparse por repetición y dimensiones compartidas antes de
 * diseñar generación de patrones dirigida por dominio.
 */
export function analyzeFurnitureStructure(input: OptimizationInput): FurnitureStructureMetrics {
  const pieces = input.pieces;
  const pieceCount = pieces.reduce((sum, piece) => sum + piece.quantity, 0);
  const pieceTypes = pieces.length;

  if (pieceCount <= 0 || pieceTypes === 0) {
    return {
      pieceCount: 0,
      pieceTypes: 0,
      repeatFactor: 0,
      maxMultiplicity: 0,
      repeatedPieceRatio: 0,
      distinctPairs: 0,
      distinctWidths: 0,
      distinctHeights: 0,
      dominantWidthRatio: 0,
      dominantHeightRatio: 0,
      sharedDimensionCoverageRatio: 0,
      familyCoverageRatio: 0,
      familyCount: 0,
      largestFamilyTypes: 0,
      largestFamilyPieces: 0,
      rotationConstrainedPieceRatio: 0
    };
  }

  const widthCounts = weightedDimensionCounts(pieces, "width");
  const heightCounts = weightedDimensionCounts(pieces, "height");
  const repeatedPieces = pieces.reduce(
    (sum, piece) => sum + (piece.quantity > 1 ? piece.quantity : 0),
    0,
  );
  const constrainedPieces = pieces.reduce(
    (sum, piece) => sum + (isRotationConstrained(input, piece) ? piece.quantity : 0),
    0,
  );

  const adjacency = buildSharedDimensionGraph(pieces);
  const components = connectedComponents(adjacency);
  const families = components.filter((component) => component.length >= 2);
  const familyPieces = families.reduce(
    (sum, family) => sum + family.reduce((acc, index) => acc + pieces[index].quantity, 0),
    0,
  );
  const largestFamilyTypes = families.reduce((max, family) => Math.max(max, family.length), 0);
  const largestFamilyPieces = families.reduce(
    (max, family) => Math.max(max, family.reduce((sum, index) => sum + pieces[index].quantity, 0)),
    0,
  );

  const sharedDimensionPieces = pieces.reduce((sum, piece, index) => {
    return sum + (adjacency[index].size > 0 ? piece.quantity : 0);
  }, 0);

  return {
    pieceCount,
    pieceTypes,
    repeatFactor: pieceCount / pieceTypes,
    maxMultiplicity: Math.max(...pieces.map((piece) => piece.quantity)),
    repeatedPieceRatio: repeatedPieces / pieceCount,
    distinctPairs: new Set(pieces.map((piece) => pairKey(piece.width, piece.height))).size,
    distinctWidths: widthCounts.size,
    distinctHeights: heightCounts.size,
    dominantWidthRatio: maxMapValue(widthCounts) / pieceCount,
    dominantHeightRatio: maxMapValue(heightCounts) / pieceCount,
    sharedDimensionCoverageRatio: sharedDimensionPieces / pieceCount,
    familyCoverageRatio: familyPieces / pieceCount,
    familyCount: families.length,
    largestFamilyTypes,
    largestFamilyPieces,
    rotationConstrainedPieceRatio: constrainedPieces / pieceCount
  };
}

function weightedDimensionCounts(
  pieces: OptimizationPieceInput[],
  axis: "width" | "height",
): Map<number, number> {
  const counts = new Map<number, number>();
  for (const piece of pieces) {
    const value = normalizeDimension(piece[axis]);
    counts.set(value, (counts.get(value) ?? 0) + piece.quantity);
  }
  return counts;
}

function buildSharedDimensionGraph(pieces: OptimizationPieceInput[]): Array<Set<number>> {
  const graph = Array.from({ length: pieces.length }, () => new Set<number>());
  const byDimension = new Map<number, number[]>();

  pieces.forEach((piece, index) => {
    const dimensions = new Set([
      normalizeDimension(piece.width),
      normalizeDimension(piece.height)
    ]);
    for (const dimension of dimensions) {
      const indexes = byDimension.get(dimension) ?? [];
      indexes.push(index);
      byDimension.set(dimension, indexes);
    }
  });

  for (const indexes of byDimension.values()) {
    for (let left = 0; left < indexes.length; left++) {
      for (let right = left + 1; right < indexes.length; right++) {
        const a = indexes[left];
        const b = indexes[right];
        graph[a].add(b);
        graph[b].add(a);
      }
    }
  }

  return graph;
}

function connectedComponents(graph: Array<Set<number>>): number[][] {
  const seen = new Set<number>();
  const components: number[][] = [];

  for (let start = 0; start < graph.length; start++) {
    if (seen.has(start)) continue;
    const component: number[] = [];
    const pending = [start];
    seen.add(start);

    while (pending.length > 0) {
      const current = pending.pop();
      if (current === undefined) break;
      component.push(current);
      for (const next of graph[current]) {
        if (seen.has(next)) continue;
        seen.add(next);
        pending.push(next);
      }
    }

    components.push(component);
  }

  return components;
}

function isRotationConstrained(input: OptimizationInput, piece: OptimizationPieceInput): boolean {
  return input.material.hasGrain || piece.grain === true || piece.canRotate === false;
}

function normalizeDimension(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function pairKey(width: number, height: number): string {
  return `${normalizeDimension(width)}x${normalizeDimension(height)}`;
}

function maxMapValue(map: Map<number, number>): number {
  let max = 0;
  for (const value of map.values()) max = Math.max(max, value);
  return max;
}
