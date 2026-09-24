import { describe, expect, it } from "vitest";
import {
  countSelectedEdges,
  cycleEdgeSide,
  edgeBandLabels,
  edgeFlags,
  edgeTypeCounts,
  edgeTypesBySide,
  emptyEdgeSelection,
  readSideEdgeType,
  summaryEdgeType
} from "@/lib/domain/edge-bands";

describe("cycleEdgeSide", () => {
  it("recorre 0,45, 2 mm, los dos espesores y vuelve a sin canto", () => {
    let item = emptyEdgeSelection();

    item = cycleEdgeSide(item, "edgeTopType");
    expect(item.edgeTopType).toBe("thin");

    item = cycleEdgeSide(item, "edgeTopType");
    expect(item.edgeTopType).toBe("thick");

    item = cycleEdgeSide(item, "edgeTopType");
    expect(item.edgeTopType).toBe("both");

    item = cycleEdgeSide(item, "edgeTopType");
    expect(item.edgeTopType).toBe("none");
  });

  it("no toca los otros lados", () => {
    const item = cycleEdgeSide({ ...emptyEdgeSelection(), edgeLeftType: "thick" }, "edgeTopType");

    expect(item.edgeTopType).toBe("thin");
    expect(item.edgeLeftType).toBe("thick");
    expect(item.edgeBottomType).toBe("none");
    expect(item.edgeRightType).toBe("none");
  });
});

describe("resumen de la seleccion", () => {
  const mixed = {
    edgeTopType: "thick",
    edgeBottomType: "thin",
    edgeLeftType: "thin",
    edgeRightType: "none"
  } as const;

  it("cuenta solo los lados con canto", () => {
    expect(countSelectedEdges(mixed)).toBe(3);
    expect(countSelectedEdges(emptyEdgeSelection())).toBe(0);
  });

  it("agrupa los lados por tipo y omite los que no se usan", () => {
    expect(edgeTypeCounts(mixed)).toEqual([
      { type: "thin", sides: 2 },
      { type: "thick", sides: 1 }
    ]);
    expect(edgeTypeCounts(emptyEdgeSelection())).toEqual([]);
  });

  it("deriva los booleanos que siguen guardandose en la base", () => {
    expect(edgeFlags(mixed)).toEqual({
      edgeTop: true,
      edgeBottom: true,
      edgeLeft: true,
      edgeRight: false
    });
  });

  it("indexa los tipos por lado para el optimizador", () => {
    expect(edgeTypesBySide(mixed)).toEqual({ top: "thick", bottom: "thin", left: "thin", right: "none" });
  });
});

describe("summaryEdgeType", () => {
  it("devuelve el tipo comun cuando todos los lados coinciden", () => {
    expect(summaryEdgeType({ ...emptyEdgeSelection(), edgeTopType: "thick", edgeLeftType: "thick" })).toBe("thick");
  });

  it("devuelve none cuando la pieza no lleva canto", () => {
    expect(summaryEdgeType(emptyEdgeSelection())).toBe("none");
  });

  it("marca la mezcla como both, que es lo que entendian los lectores viejos", () => {
    expect(summaryEdgeType({ ...emptyEdgeSelection(), edgeTopType: "thin", edgeLeftType: "thick" })).toBe("both");
  });
});

describe("readSideEdgeType", () => {
  it("acepta el formato nuevo tal cual", () => {
    expect(readSideEdgeType("thick", "thin")).toBe("thick");
    expect(readSideEdgeType("none", "thin")).toBe("none");
  });

  it("traduce el booleano viejo usando el tipo de la pieza", () => {
    expect(readSideEdgeType(true, "thick")).toBe("thick");
    expect(readSideEdgeType(false, "thick")).toBe("none");
  });

  it("asume 0,45 cuando el lado estaba marcado sin tipo", () => {
    expect(readSideEdgeType(true, "none")).toBe("thin");
  });

  it("trata lo desconocido como sin canto", () => {
    expect(readSideEdgeType(undefined, "thin")).toBe("none");
    expect(readSideEdgeType(null, "thin")).toBe("none");
  });
});

describe("edgeBandLabels", () => {
  it("nombra el espesor en lugar de decir ambos", () => {
    expect(edgeBandLabels.thin).toBe("0,45 mm");
    expect(edgeBandLabels.thick).toBe("2 mm");
    expect(edgeBandLabels.both).toBe("0,45 + 2 mm");
  });
});
