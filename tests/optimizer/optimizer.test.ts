import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

import {
  generateMachineXml,
  optimizeProject,
  validateIndependentSlices,
  type LegacyPlan,
  type OptimizationInput,
  type OptimizationPlacement
} from "@/lib/optimizer";

const require = createRequire(import.meta.url);

const legacyMotor = require("../../src/lib/optimizer/legacy/motor.cjs") as {
  DIR_X: "x";
  medidaCorte(piece: Record<string, unknown>, opts: LegacyPlan["opts"]): { base: number; altura: number };
  orientaciones(piece: Record<string, unknown>, conVeta: boolean): Array<{ base: number; altura: number; rotada: boolean }>;
  empacarPlaca(
    pool: Array<Record<string, unknown>>,
    opts: LegacyPlan["opts"],
    rnd: null,
  ): Pick<LegacyPlan["placas"][number], "colocadas" | "cortes" | "restos" | "arbol">;
};

const baseInput: OptimizationInput = {
  board: {
    width: 1200,
    height: 800,
    thickness: 18
  },
  material: {
    description: "MDF TEST 18MM",
    hasGrain: false,
    thickness: 18
  },
  kerf: 5,
  trim: {
    x: 0,
    y: 0
  },
  constraints: {
    minRemnant: 100,
    minCommercialRemnantLongSide: 250,
    allowOneBoard: false,
    allowPatternMaster: false,
    allowMultiSlice: false,
    allowDeadStripCompaction: false
  },
  pieces: [
    {
      reference: "A",
      description: "Anchor candidate",
      quantity: 1,
      width: 622,
      height: 120
    },
    {
      reference: "B",
      description: "Real slice content",
      quantity: 2,
      width: 578,
      height: 300
    },
    {
      reference: "C",
      description: "Fillers",
      quantity: 2,
      width: 280,
      height: 250
    }
  ]
};

describe("optimizer facade", () => {
  it("packs all requested pieces with valid guillotine geometry", () => {
    const result = optimizeProject(baseInput);

    expect(result.strategy).toBe("baseline");
    expect(result.metrics.expectedPieceCount).toBe(5);
    expect(result.metrics.pieceCount).toBe(5);
    expect(result.validation.ok).toBe(true);
    expect(result.validation.industrial.coberturaCompleta).toBe(true);
    expect(result.validation.independentSlices.ok).toBe(true);
    expect(result.boards.length).toBeGreaterThanOrEqual(1);

    for (const board of result.boards) {
      for (const placement of board.placements) {
        expect(placement.x).toBeGreaterThanOrEqual(0);
        expect(placement.y).toBeGreaterThanOrEqual(0);
        expect(placement.x + placement.width).toBeLessThanOrEqual(board.width);
        expect(placement.y + placement.height).toBeLessThanOrEqual(board.height);
      }

      assertNoOverlap(board.placements);
    }
  });

  it("preserves real slice contraction instead of using ghost anchor width", () => {
    const plan = forcedContractionPlan();
    const placements = plan.placas[0].colocadas ?? [];
    const realContent = placements.find((placement) => placement.pieza?.ref === "B");
    const anchor = placements.find((placement) => placement.pieza?.ref === "A");

    expect(realContent?.base).toBe(578);
    expect(anchor?.x).toBe(583);
    expect(hasContractionDiagnostic(plan)).toBe(true);
    expect(validateIndependentSlices(plan)).toEqual({ ok: true, errores: [] });
  });

  it("runs the extracted V10 layer when explicitly requested", () => {
    const result = optimizeProject({
      ...baseInput,
      strategy: "v10",
      constraints: { ...baseInput.constraints, profile: "deep" }
    });

    expect(result.strategy).toBe("v10");
    expect(result.profile).toBe("deep");
    expect(result.metrics.pieceCount).toBe(5);
    expect(result.validation.ok).toBe(true);
  });

  it("reuses identical optimizer inputs from the in-memory cache", () => {
    const input: OptimizationInput = {
      ...baseInput,
      projectId: "cache-contract",
      constraints: { ...baseInput.constraints, profile: "fast" }
    };

    const first = optimizeProject(input);
    const second = optimizeProject(input);

    expect(first.inputHash).toBe(second.inputHash);
    expect(first.metrics.cacheHit).toBe(false);
    expect(second.metrics.cacheHit).toBe(true);
    expect(second.validation.ok).toBe(true);
  });

  it("exports machine XML from the exact approved optimization result", () => {
    const result = optimizeProject(baseInput);
    const xml = generateMachineXml(result, {
      material: "MDF TEST 18MM",
      thickness: 18
    });

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8" ?>');
    expect(xml).toContain("<project>");
    expect(xml).toContain('<panel1 l="1200" w="800" material="MDF TEST 18MM" thickness="18" saw="5" num="1">');
    expect(xml).toContain('code="A"');
    expect(xml).toContain('code="B"');
    expect(xml).toContain("</project>");
  });
});

function assertNoOverlap(placements: OptimizationPlacement[]) {
  const eps = 1e-6;

  for (let i = 0; i < placements.length; i++) {
    for (let j = i + 1; j < placements.length; j++) {
      const a = placements[i];
      const b = placements[j];
      const overlaps =
        a.x < b.x + b.width - eps &&
        a.x + a.width > b.x + eps &&
        a.y < b.y + b.height - eps &&
        a.y + a.height > b.y + eps;

      expect(overlaps, `${a.reference} overlaps ${b.reference}`).toBe(false);
    }
  }
}

function hasContractionDiagnostic(plan: LegacyPlan): boolean {
  const scan = (value: unknown): boolean => {
    if (!value || typeof value !== "object") return false;
    if ("contraida" in value) return true;
    if (Array.isArray(value)) return value.some(scan);
    return Object.values(value).some(scan);
  };

  return scan(plan);
}

function forcedContractionPlan(): LegacyPlan {
  const opts: LegacyPlan["opts"] = {
    placaBase: 1300,
    placaAltura: 300,
    refiladoX: 0,
    refiladoY: 0,
    sierra: 5,
    etapas: 4,
    materialConVeta: false,
    descontarCanto: false,
    cantoEspesor: 0,
    ruido: 0,
    restoMin: 50,
    restoMax: 100,
    dirInicial: legacyMotor.DIR_X,
    criterio: "largo",
    criterios: ["largo", "largo"],
    multiRebanada: false,
    anchoUtil: 1300,
    altoUtil: 300,
    _cuenta: new Map(),
    _reps: [],
    _medidas: [],
    _cache: null,
    _stats: { hits: 0, fallos: 0 }
  };
  const pieces: Array<Record<string, unknown>> = [
    { id: 0, ref: "A", detalle: "Anchor", base: 622, altura: 120, veta: false, cantos: null },
    { id: 1, ref: "B", detalle: "Real", base: 578, altura: 300, veta: false, cantos: null }
  ];
  const signatures = new Map<string, number>();

  for (const piece of pieces) {
    const cut = legacyMotor.medidaCorte(piece, opts);
    piece._corte = cut;
    piece._ors = legacyMotor.orientaciones(piece, opts.materialConVeta);
    const key = `${cut.base}|${cut.altura}|0`;
    if (!signatures.has(key)) signatures.set(key, signatures.size);
    piece._sig = signatures.get(key);
  }

  opts._nSigs = signatures.size;

  const board = legacyMotor.empacarPlaca(pieces, opts, null);

  return {
    opts,
    placas: [
      {
        ancho: 1300,
        alto: 300,
        colocadas: board.colocadas,
        cortes: board.cortes,
        restos: board.restos,
        arbol: board.arbol
      }
    ]
  };
}
