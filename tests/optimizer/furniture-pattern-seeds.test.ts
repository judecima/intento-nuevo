import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  buildExactDimensionFamilies,
  buildFurniturePatternSeeds,
} = require("../../src/lib/optimizer/experimental/furniture-pattern-seeds.cjs") as {
  buildExactDimensionFamilies(lines: Array<Record<string, unknown>>, options?: Record<string, unknown>): Array<{
    origin: string;
    axis: "base" | "altura";
    dimension: number;
    typeIndexes: number[];
    pieces: number;
  }>;
  buildFurniturePatternSeeds(lines: Array<Record<string, unknown>>, options?: Record<string, unknown>): Array<{
    typeIndexes: number[];
    subset: Array<Record<string, unknown>>;
  }>;
};

describe("furniture pattern seeds", () => {
  it("finds deterministic same-axis families and keeps complete quantities", () => {
    const lines = [
      { ref: "L", cant: 2, base: 720, altura: 560 },
      { ref: "E", cant: 6, base: 680, altura: 560 },
      { ref: "B", cant: 2, base: 680, altura: 400 },
      { ref: "X", cant: 1, base: 333, altura: 211 },
    ];

    const families = buildExactDimensionFamilies(lines);

    expect(families).toEqual(expect.arrayContaining([
      expect.objectContaining({
        origin: "family-altura",
        axis: "altura",
        dimension: 560,
        typeIndexes: [0, 1],
        pieces: 8,
      }),
      expect.objectContaining({
        origin: "family-base",
        axis: "base",
        dimension: 680,
        typeIndexes: [1, 2],
        pieces: 8,
      }),
    ]));

    const seeds = buildFurniturePatternSeeds(lines);
    const family560 = seeds.find((seed) => seed.typeIndexes.join(",") === "0,1");
    expect(family560?.subset).toEqual([lines[0], lines[1]]);
    expect(family560?.subset).not.toBe(lines);
  });

  it("does not treat multiplicity alone as a geometric family", () => {
    const families = buildExactDimensionFamilies([
      { ref: "A", cant: 30, base: 700, altura: 500 },
      { ref: "B", cant: 1, base: 333, altura: 211 },
    ]);

    expect(families).toEqual([]);
  });

  it("does not infer cross-axis rotation before the rotation policy is explicit", () => {
    const families = buildExactDimensionFamilies([
      { ref: "A", cant: 4, base: 700, altura: 500 },
      { ref: "B", cant: 4, base: 500, altura: 300 },
    ]);

    // A.altura == B.base, pero eso exige rotar uno de los tipos. Esta primera
    // versión deliberadamente no lo convierte en una familia de producción.
    expect(families).toEqual([]);
  });

  it("orders high-coverage families first and respects maxFamilies", () => {
    const lines = [
      { cant: 10, base: 600, altura: 500 },
      { cant: 8, base: 600, altura: 400 },
      { cant: 2, base: 300, altura: 250 },
      { cant: 2, base: 300, altura: 200 },
    ];

    const families = buildExactDimensionFamilies(lines, { maxFamilies: 1 });
    expect(families).toHaveLength(1);
    expect(families[0]).toMatchObject({ axis: "base", dimension: 600, pieces: 18 });
  });
});
