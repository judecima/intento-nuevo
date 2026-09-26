import { describe, expect, it } from 'vitest';

import {
  optimizationInputSchema,
  optimizeProject,
  type OptimizeProjectRuntimeOptions,
} from '@/lib/optimizer';
import {
  cutList,
  DEFAULT_CONFIG,
  generateFurniture,
  hardwareList,
  TEMPLATE_TYPES,
  TEMPLATES,
  toOptimizationInputs,
  type FurnitureParams,
} from '@/lib/furniture';

const midpoint = (min: number, max: number) => (min === max ? min : Math.round((min + max) / 2));

function nominalParams(type: string): FurnitureParams {
  const spec = TEMPLATES[type];
  return {
    width: midpoint(spec.ranges.width.min, spec.ranges.width.max),
    height: midpoint(spec.ranges.height.min, spec.ranges.height.max),
    depth: midpoint(spec.ranges.depth.min, spec.ranges.depth.max),
    thickness: 18,
    hasBack: true,
    hasShelf: true,
    hasShelf2: true,
    hinges: { mounting: 'overlay', openingAngle: 110, softClose: true },
  };
}

function milestoneModel() {
  return generateFurniture('cabinet_base_120_2p3c', {
    width: 1200,
    height: 870,
    depth: 600,
    thickness: 18,
    hasBack: true,
    hasShelf: true,
    hinges: { mounting: 'overlay', openingAngle: 110, softClose: true },
  });
}

function milestoneInputs() {
  return toOptimizationInputs([milestoneModel()], {
    materials: {
      body: {
        id: 'mel-18-blanco',
        description: 'Melamina blanca 18 mm',
        hasGrain: false,
        thickness: 18,
        board: { width: 2750, height: 1830 },
      },
      back: {
        id: 'mdf-5',
        description: 'MDF 5 mm',
        hasGrain: false,
        thickness: 5,
        board: { width: 2600, height: 1830 },
      },
    },
    kerf: 4.5,
    trim: { x: 10, y: 10 },
    minRemnant: 60,
  });
}

describe('furniture parametric engine', () => {
  it('keeps the complete 21-template catalog generatable at nominal dimensions', () => {
    expect(TEMPLATE_TYPES).toHaveLength(21);
    for (const type of TEMPLATE_TYPES) {
      const model = generateFurniture(type, nominalParams(type));
      expect(model.parts.length, type).toBeGreaterThan(0);
    }
  });

  it('uses 5 mm as the configurable default for backs and drawer bottoms', () => {
    expect(DEFAULT_CONFIG.backThickness).toBe(5);
    expect(DEFAULT_CONFIG.drawerBottomThickness).toBe(5);

    const lines = cutList([milestoneModel()]);
    const back = lines.filter((line) => line.material === 'back');
    const drawerBottom = lines.filter((line) => line.material === 'drawerBottom');

    expect(back.length).toBeGreaterThan(0);
    expect(drawerBottom .length).toBeGreaterThan(0);
    expect(back.every((line) => line.cutEspesor === 5)).toBe(true);
    expect(drawerBottom.every((line) => line.cutEspesor === 5)).toBe(true);
  });

  it('derives cut list and hardware from the same FurnitureModel', () => {
    const model = milestoneModel();
    const cuts = cutList([model]);
    const hardware = hardwareList([model]);

    expect(cuts.length).toBeGreaterThan(0);
    expect(hardware.length).toBeGreaterThan(0);
    expect(model.parts.some((part) => part.material === 'drawerBottom')).toBe(true);
    expect(model.parts.some((part) => part.material === 'back')).toBe(true);
  });

  it('groups 18 mm melamine separately from shared 5 mm MDF Pand passes the canonical optimizer schema', () => {
    const inputs = milestoneInputs();
    expect(inputs).toHaveLength(2);

    for (const input of inputs) expect(() => optimizationInputSchema.parse(input)).not.toThrow();

    const body = inputs.find((input) => input.material.id === 'mel-18-blanco');
    const mdf = inputs.find((input) => input.material.id === 'mdf-5');

    expect(body?.board.thickness).toBe(18);
    expect(mdf?.board.thickness).toBe(5);
    expect(mdf?.pieces.length).toBeGreaterThan(0);

    const roles = new Set(mdf?.pieces.map((piece) => piece.metadata?.materialRole));
    expect(roles.has('back')).toBe(true);
    expect(roles.has('drawerBottom')).toBe(true);
  });

  it('produces valid optimizer plans for both physical materials', () => {
    const requireRust = process.env.REQUIRE_RUST_PATTERN_GENERATOR === '1';
    const runtime: OptimizeProjectRuntimeOptions = requireRust
      ? { motorVersion: 'v2', effortMode: 'auto', patternGenerator: 'rust' }
      : { motorVersion: 'v1', effortMode: 'fixed', patternGenerator: 'js' };

    for (const input of milestoneInputs()) {
      const result = optimizeProject(input, runtime);
      expect(result.validation.ok, input.material.description).toBe(true);
      expect(result.metrics.boardCount, input.material.description).toBeGreaterThan(0);
      expect(result.metrics.pieceCount, input.material.description).toBe(
        input.pieces.reduce((sum, piece) => sum + piece.quantity, 0),
      );
      if (requireRust) expect(result.metrics.patternGenerator).toBe('rust');
    }
  });
});
