import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const basis = require("../../src/lib/optimizer/experimental/repetitive-family-basis.cjs") as {
  buildRepetitiveFamilyBasis(
    lines: Array<Record<string, unknown>>,
    config: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Array<{
    origin: string;
    dominantTypeIndex: number;
    usage: Record<string, number>;
    strips: unknown[];
  }>;
  materializeStripRecipe(
    recipe: Record<string, unknown>,
    lines: Array<Record<string, unknown>>,
    config: Record<string, unknown>,
  ): Record<string, unknown>;
};
const validator = require("../../src/lib/optimizer/legacy/validador_industrial_v3.cjs") as {
  validarPlacaIndustrial(
    board: Record<string, unknown>,
    config: Record<string, unknown>,
  ): {
    geometriaValida: boolean;
    secuenciaValida: boolean;
    secuenciaCompleta: boolean;
    liberadas: number;
    piezas: number;
    errores: string[];
  };
};

// Caso oro histórico 4058501. No se usa el ID del pedido ni un vector ganador
// como entrada: sólo la demanda y la geometría del tablero.
const lines = [
  { ref: "1", base: 699.2, altura: 749.2, cant: 4, veta: false },
  { ref: "2", base: 699.6, altura: 740, cant: 10, veta: false },
  { ref: "3", base: 799.2, altura: 449.2, cant: 6, veta: false },
  { ref: "4", base: 849.2, altura: 199.2, cant: 2, veta: false },
  { ref: "5", base: 999.2, altura: 449.2, cant: 3, veta: false },
  { ref: "6", base: 999.2, altura: 499.2, cant: 4, veta: false },
  { ref: "7", base: 999.2, altura: 799.2, cant: 6, veta: false },
  { ref: "8", base: 1399.2, altura: 869.2, cant: 1, veta: false },
  { ref: "9", base: 1475.6, altura: 500, cant: 6, veta: false },
  { ref: "10", base: 1479.2, altura: 499.2, cant: 4, veta: false },
  { ref: "11", base: 1999.2, altura: 699.2, cant: 4, veta: false },
];

const config = {
  placaBase: 2600,
  placaAltura: 1830,
  refiladoX: 0,
  refiladoY: 0,
  sierra: 4.5,
  materialConVeta: false,
};

describe("V21 direct RepetitiveFamilyBasis", () => {
  it("derives the late 4058501 family+filler vector without random search", () => {
    const recipes = basis.buildRepetitiveFamilyBasis(lines, config);

    const target = recipes.find((recipe) =>
      recipe.usage["1"] === 6 &&
      recipe.usage["2"] === 1 &&
      recipe.usage["4"] === 1
    );

    expect(target).toBeDefined();
    expect(target?.origin).toBe("repetitive-family+filler");
    expect(target?.dominantTypeIndex).toBe(1);
  });

  it("keeps a complementary residual-demand column for the dominant family", () => {
    const recipes = basis.buildRepetitiveFamilyBasis(lines, config);

    expect(recipes.some((recipe) =>
      Object.keys(recipe.usage).length === 1 && recipe.usage["1"] === 4
    )).toBe(true);
  });

  it("materializes the derived strip recipe as an industrially valid guillotine board", () => {
    const recipes = basis.buildRepetitiveFamilyBasis(lines, config);
    const target = recipes.find((recipe) =>
      recipe.usage["1"] === 6 &&
      recipe.usage["2"] === 1 &&
      recipe.usage["4"] === 1
    );
    expect(target).toBeDefined();

    const board = basis.materializeStripRecipe(target!, lines, config);
    const validation = validator.validarPlacaIndustrial(board, config);

    expect(validation.errores).toEqual([]);
    expect(validation.geometriaValida).toBe(true);
    expect(validation.secuenciaValida).toBe(true);
    expect(validation.secuenciaCompleta).toBe(true);
    expect(validation.liberadas).toBe(8);
    expect(validation.piezas).toBe(8);
  });

  it("keeps the directed pool bounded", () => {
    const recipes = basis.buildRepetitiveFamilyBasis(lines, config);
    expect(recipes.length).toBeLessThanOrEqual(24);
  });
});
