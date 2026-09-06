import { describe, expect, it } from "vitest";

import { analyzeFurnitureStructure } from "../../src/lib/optimizer/analysis/furniture-structure";
import type { OptimizationInput } from "../../src/lib/optimizer/types";

const base: Omit<OptimizationInput, "pieces"> = {
  board: { width: 2750, height: 1830 },
  material: { description: "MDF TEST", hasGrain: false },
  kerf: 4.5,
  trim: { x: 10, y: 10 },
  constraints: { minRemnant: 60 }
};

describe("furniture structure metrics", () => {
  it("detects repetition and connected families by shared dimensions", () => {
    const metrics = analyzeFurnitureStructure({
      ...base,
      pieces: [
        { reference: "L", quantity: 2, width: 720, height: 560 },
        { reference: "E", quantity: 6, width: 680, height: 560 },
        { reference: "B", quantity: 2, width: 680, height: 400 },
        { reference: "X", quantity: 1, width: 333, height: 211 }
      ]
    });

    expect(metrics.pieceCount).toBe(11);
    expect(metrics.pieceTypes).toBe(4);
    expect(metrics.repeatFactor).toBeCloseTo(2.75, 6);
    expect(metrics.maxMultiplicity).toBe(6);
    expect(metrics.repeatedPieceRatio).toBeCloseTo(10 / 11, 6);
    expect(metrics.familyCount).toBe(1);
    expect(metrics.largestFamilyTypes).toBe(3);
    expect(metrics.largestFamilyPieces).toBe(10);
    expect(metrics.familyCoverageRatio).toBeCloseTo(10 / 11, 6);
    expect(metrics.sharedDimensionCoverageRatio).toBeCloseTo(10 / 11, 6);
  });

  it("does not invent a family from multiplicity alone", () => {
    const metrics = analyzeFurnitureStructure({
      ...base,
      pieces: [
        { reference: "A", quantity: 20, width: 700, height: 500 },
        { reference: "B", quantity: 1, width: 333, height: 211 }
      ]
    });

    expect(metrics.repeatedPieceRatio).toBeCloseTo(20 / 21, 6);
    expect(metrics.familyCount).toBe(0);
    expect(metrics.familyCoverageRatio).toBe(0);
    expect(metrics.sharedDimensionCoverageRatio).toBe(0);
  });

  it("tracks rotation constraints independently of geometric families", () => {
    const metrics = analyzeFurnitureStructure({
      ...base,
      pieces: [
        { reference: "A", quantity: 2, width: 700, height: 500, canRotate: false },
        { reference: "B", quantity: 3, width: 500, height: 300 },
        { reference: "C", quantity: 5, width: 300, height: 200, grain: true }
      ]
    });

    expect(metrics.rotationConstrainedPieceRatio).toBeCloseTo(7 / 10, 6);
  });

  it("treats a grained material as rotation constrained for every piece", () => {
    const metrics = analyzeFurnitureStructure({
      ...base,
      material: { description: "MELAMINA ROBLE", hasGrain: true },
      pieces: [
        { reference: "A", quantity: 2, width: 700, height: 500 },
        { reference: "B", quantity: 3, width: 500, height: 300 }
      ]
    });

    expect(metrics.rotationConstrainedPieceRatio).toBe(1);
  });
});
