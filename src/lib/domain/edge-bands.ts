export const edgeBandTypes = ["none", "thin", "thick", "both"] as const;

export type EdgeBandType = (typeof edgeBandTypes)[number];

/**
 * Etiquetas de cada tipo de tapacanto.
 *
 * "both" no es "ambos lados": es el mismo canto llevando los dos espesores, y
 * asi lo cobra el calculo de metros lineales. El texto lo dice explicito
 * porque "ambos" hacia pensar en dos lados de la pieza.
 */
export const edgeBandLabels: Record<EdgeBandType, string> = {
  none: "Sin canto",
  thin: "0,45 mm",
  thick: "2 mm",
  both: "0,45 + 2 mm"
};

/** Orden del ciclo al clickear un lado: uno, el otro, los dos, ninguno. */
export const edgeBandCycle: readonly EdgeBandType[] = ["none", "thin", "thick", "both"];

export const edgeSides = ["top", "bottom", "left", "right"] as const;

export type EdgeSide = (typeof edgeSides)[number];

/** Campo que guarda el tipo de cada lado, y como se llama ese lado en pantalla. */
export const edgeSideFields = [
  { side: "top", field: "edgeTopType", flag: "edgeTop", label: "arriba" },
  { side: "bottom", field: "edgeBottomType", flag: "edgeBottom", label: "abajo" },
  { side: "left", field: "edgeLeftType", flag: "edgeLeft", label: "izquierda" },
  { side: "right", field: "edgeRightType", flag: "edgeRight", label: "derecha" }
] as const;

export type EdgeSideField = (typeof edgeSideFields)[number]["field"];

export type EdgeSideSelection = {
  edgeTopType: EdgeBandType;
  edgeBottomType: EdgeBandType;
  edgeLeftType: EdgeBandType;
  edgeRightType: EdgeBandType;
};

export type EdgeSideFlags = {
  edgeTop: boolean;
  edgeBottom: boolean;
  edgeLeft: boolean;
  edgeRight: boolean;
};

export function emptyEdgeSelection(): EdgeSideSelection {
  return { edgeTopType: "none", edgeBottomType: "none", edgeLeftType: "none", edgeRightType: "none" };
}

/** Avanza un lado al siguiente tipo: none, 0,45, 2 mm, los dos, y vuelve. */
export function cycleEdgeSide<T extends EdgeSideSelection>(item: T, field: EdgeSideField): T {
  const current = item[field];
  const next = edgeBandCycle[(edgeBandCycle.indexOf(current) + 1) % edgeBandCycle.length];
  return { ...item, [field]: next } as T;
}

export function countSelectedEdges(item: EdgeSideSelection): number {
  return edgeSideFields.reduce((count, entry) => count + (item[entry.field] === "none" ? 0 : 1), 0);
}

/** Cuantos lados lleva cada tipo, para el resumen que acompana al dibujo. */
export function edgeTypeCounts(item: EdgeSideSelection): Array<{ type: EdgeBandType; sides: number }> {
  return edgeBandTypes
    .filter((type) => type !== "none")
    .map((type) => ({ type, sides: edgeSideFields.filter((entry) => item[entry.field] === type).length }))
    .filter((entry) => entry.sides > 0);
}

/**
 * Valor derivado que se sigue guardando en `project_items.edge_type`.
 *
 * La fuente de verdad son los cuatro lados; esto existe para los lectores que
 * todavia esperan un unico tipo por pieza.
 */
export function summaryEdgeType(item: EdgeSideSelection): EdgeBandType {
  const used = edgeSideFields.map((entry) => item[entry.field]).filter((type) => type !== "none");
  if (used.length === 0) return "none";
  return used.every((type) => type === used[0]) ? used[0] : "both";
}

/** Los booleanos derivados que acompanan a los tipos en la base. */
export function edgeFlags(item: EdgeSideSelection): EdgeSideFlags {
  return {
    edgeTop: item.edgeTopType !== "none",
    edgeBottom: item.edgeBottomType !== "none",
    edgeLeft: item.edgeLeftType !== "none",
    edgeRight: item.edgeRightType !== "none"
  };
}

/** Los cuatro tipos indexados por lado, como los consume el optimizador. */
export function edgeTypesBySide(item: EdgeSideSelection): Record<EdgeSide, EdgeBandType> {
  return {
    top: item.edgeTopType,
    bottom: item.edgeBottomType,
    left: item.edgeLeftType,
    right: item.edgeRightType
  };
}

export function isEdgeBandType(value: unknown): value is EdgeBandType {
  return typeof value === "string" && (edgeBandTypes as readonly string[]).includes(value);
}

/**
 * Lee el tipo de un lado tolerando el formato viejo.
 *
 * Los resultados de optimizacion guardados antes de esta version traen un
 * booleano por lado y un unico tipo de pieza; se interpretan como ese tipo.
 */
export function readSideEdgeType(value: unknown, fallback: EdgeBandType): EdgeBandType {
  if (isEdgeBandType(value)) return value;
  if (value === true) return fallback === "none" ? "thin" : fallback;
  return "none";
}
