import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

type LegacyRemnant = { w: number; h: number };
type LegacyOptions = { restoMin: number; restoMax: number };
type LegacyRemnantQuality = {
  mayor: number;
  segundo: number;
  fragmentos: number;
  total: number;
  areas: number[];
};

const motor = require("../../src/lib/optimizer/legacy/motor.cjs") as {
  calidadRestos(restos: LegacyRemnant[], opts: LegacyOptions): LegacyRemnantQuality;
  compararCalidad(a: LegacyRemnantQuality, b: LegacyRemnantQuality): number;
};

const opts = { restoMin: 250, restoMax: 400 };

function quality(restos: LegacyRemnant[]) {
  return motor.calidadRestos(restos, opts);
}

describe("legacy Lepton remnant quality", () => {
  it("prioritizes the largest continuous remnant before total area", () => {
    const continuous = quality([{ w: 1000, h: 500 }]);
    const fragmented = quality([
      { w: 500, h: 500 },
      { w: 500, h: 500 },
      { w: 500, h: 500 }
    ]);

    expect(continuous.total).toBeLessThan(fragmented.total);
    expect(motor.compararCalidad(continuous, fragmented)).toBeGreaterThan(0);
  });

  it("then prioritizes the second largest remnant", () => {
    const betterSecond = quality([
      { w: 900, h: 500 },
      { w: 700, h: 500 }
    ]);
    const worseSecond = quality([
      { w: 900, h: 500 },
      { w: 500, h: 500 }
    ]);

    expect(motor.compararCalidad(betterSecond, worseSecond)).toBeGreaterThan(0);
  });

  it("then prefers fewer commercial fragments", () => {
    const fewerFragments = quality([
      { w: 900, h: 500 },
      { w: 700, h: 500 }
    ]);
    const moreFragments = quality([
      { w: 900, h: 500 },
      { w: 700, h: 500 },
      { w: 400, h: 250 }
    ]);

    expect(motor.compararCalidad(fewerFragments, moreFragments)).toBeGreaterThan(0);
  });

  it("uses total commercial area only after continuity and fragmentation tie", () => {
    const moreArea = quality([
      { w: 900, h: 500 },
      { w: 700, h: 500 },
      { w: 500, h: 500 }
    ]);
    const lessArea = quality([
      { w: 900, h: 500 },
      { w: 700, h: 500 },
      { w: 400, h: 300 }
    ]);

    expect(motor.compararCalidad(moreArea, lessArea)).toBeGreaterThan(0);
  });
});
