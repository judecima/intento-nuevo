import { describe, expect, it } from "vitest";

import {
  canonicalizeOptimizationInput,
  serializeCanonicalOptimizationCase,
  type OptimizationInput
} from "@/lib/optimizer";

const baseInput: OptimizationInput = {
  board: {
    width: 2750,
    height: 1830,
    thickness: 18
  },
  material: {
    id: "mat-1",
    code: "MDF18",
    description: "MDF Blanco 18mm",
    hasGrain: false,
    thickness: 18
  },
  kerf: 4.5,
  trim: {
    x: 0,
    y: 0
  },
  constraints: {
    stages: 4,
    minRemnant: 250,
    minCommercialRemnantLongSide: 400
  },
  pieces: [
    {
      reference: "B",
      description: "Lateral",
      quantity: 2,
      width: 700,
      height: 450,
      grain: false,
      canRotate: true,
      edges: { top: true },
      edgeType: "thin",
      metadata: { family: "module-a", sortOrder: 20 }
    },
    {
      reference: "A",
      description: "Tapa",
      quantity: 1,
      width: 900,
      height: 500,
      grain: false,
      canRotate: true,
      edges: { left: true, right: true },
      edgeType: "both",
      metadata: { family: "module-a", sortOrder: 10 }
    },
    {
      reference: "C",
      description: "Estante",
      quantity: 3,
      width: 600,
      height: 320,
      grain: false,
      canRotate: true,
      metadata: { sortOrder: 30 }
    }
  ]
};

describe("canonicalizeOptimizationInput", () => {
  it("is deterministic for the same input", () => {
    expect(canonicalString(baseInput)).toBe(canonicalString(baseInput));
  });

  it("is independent from piece input order", () => {
    const reordered: OptimizationInput = {
      ...baseInput,
      pieces: [...baseInput.pieces].reverse()
    };

    expect(canonicalString(reordered)).toBe(canonicalString(baseInput));
  });

  it("keeps grain differences", () => {
    const changed = withPiece(0, { grain: true });

    expect(canonicalString(changed)).not.toBe(canonicalString(baseInput));
  });

  it("keeps rotation differences", () => {
    const changed = withPiece(1, { canRotate: false });

    expect(canonicalString(changed)).not.toBe(canonicalString(baseInput));
  });

  it("keeps quantity differences", () => {
    const changed = withPiece(2, { quantity: 4 });

    expect(canonicalString(changed)).not.toBe(canonicalString(baseInput));
  });

  it("keeps panel differences", () => {
    const changed: OptimizationInput = {
      ...baseInput,
      board: { ...baseInput.board, width: 2440 }
    };

    expect(canonicalString(changed)).not.toBe(canonicalString(baseInput));
  });

  it("keeps kerf differences", () => {
    const changed: OptimizationInput = {
      ...baseInput,
      kerf: 3.2
    };

    expect(canonicalString(changed)).not.toBe(canonicalString(baseInput));
  });

  it("keeps material differences", () => {
    const changed: OptimizationInput = {
      ...baseInput,
      material: { ...baseInput.material, hasGrain: true }
    };

    expect(canonicalString(changed)).not.toBe(canonicalString(baseInput));
  });

  it("preserves family and edge metadata without preserving unrelated metadata", () => {
    const canonical = canonicalizeOptimizationInput(baseInput);

    expect(canonical.pieces.find((piece) => piece.reference === "A")).toMatchObject({
      family: "module-a",
      edges: { left: true, right: true, top: false, bottom: false },
      edgeType: "both"
    });
    expect(JSON.stringify(canonical)).not.toContain("sortOrder");
  });
});

function canonicalString(input: OptimizationInput): string {
  return serializeCanonicalOptimizationCase(canonicalizeOptimizationInput(input));
}

function withPiece(index: number, patch: Partial<OptimizationInput["pieces"][number]>): OptimizationInput {
  return {
    ...baseInput,
    pieces: baseInput.pieces.map((piece, currentIndex) => (currentIndex === index ? { ...piece, ...patch } : piece))
  };
}
