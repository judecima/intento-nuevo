import { describe, expect, it } from "vitest";
import { familyVisual, inferPieceFamily, pieceFamilyKey } from "@/components/optimizer/visual-families";

describe("optimizer visual helpers", () => {
  it("infers stable furniture families from piece descriptions", () => {
    expect(inferPieceFamily("Estante superior")).toBe("Estantes");
    expect(inferPieceFamily("Lateral izquierdo")).toBe("Laterales");
    expect(inferPieceFamily("Pieza especial grande")).toBe("Pieza especial");
    expect(inferPieceFamily("")).toBe("Sin familia");
  });

  it("keeps family colors and group keys deterministic", () => {
    expect(familyVisual("Estantes")).toEqual(familyVisual("Estantes"));
    expect(
      pieceFamilyKey({
        description: "Estante",
        sourceWidth: 600,
        sourceHeight: 400,
        edges: { top: true, bottom: false, left: true, right: false }
      })
    ).toBe("Estante|600|400|A-I-");
  });
});
