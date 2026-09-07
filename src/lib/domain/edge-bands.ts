export const edgeBandTypes = ["none", "thin", "thick", "both"] as const;

export type EdgeBandType = (typeof edgeBandTypes)[number];

export type EdgeSideSelection = {
  edgeType: EdgeBandType;
  edgeTop: boolean;
  edgeBottom: boolean;
  edgeLeft: boolean;
  edgeRight: boolean;
};

const edgeKeys = ["edgeTop", "edgeBottom", "edgeLeft", "edgeRight"] as const;
type EdgeKey = (typeof edgeKeys)[number];

export function countSelectedEdges(item: Pick<EdgeSideSelection, EdgeKey>): number {
  return edgeKeys.reduce((count, key) => count + (item[key] ? 1 : 0), 0);
}

/** Cycles the selected sides through one, two and zero. */
export function cycleEdgeCount<T extends EdgeSideSelection>(item: T): T {
  const currentCount = countSelectedEdges(item);
  const nextCount = currentCount === 0 ? 1 : currentCount === 1 ? 2 : 0;
  const selected = edgeKeys.filter((key) => item[key]);
  const ordered = [...selected, ...edgeKeys.filter((key) => !item[key])];
  const active = new Set(ordered.slice(0, nextCount));

  return {
    ...item,
    edgeType: nextCount === 0 ? "none" : item.edgeType === "none" ? "thin" : item.edgeType,
    ...Object.fromEntries(edgeKeys.map((key) => [key, active.has(key)]))
  } as T;
}

export function setEdgeBandType<T extends EdgeSideSelection>(item: T, type: EdgeBandType): T {
  if (type === "none") {
    return {
      ...item,
      edgeType: type,
      edgeTop: false,
      edgeBottom: false,
      edgeLeft: false,
      edgeRight: false
    } as T;
  }

  return { ...item, edgeType: type } as T;
}
