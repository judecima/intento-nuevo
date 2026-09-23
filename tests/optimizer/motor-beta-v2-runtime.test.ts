import { describe, expect, it } from "vitest";

import {
  LEGACY_OPTIMIZER_VERSION,
  MOTOR_BETA_V2_VERSION,
  optimizeProject,
  type OptimizationInput,
} from "@/lib/optimizer";

function input5504203(projectId: string): OptimizationInput {
  return {
    projectId,
    board: { width: 2440, height: 1220, thickness: 18 },
    material: { description: "MDF TEST", hasGrain: false, thickness: 18 },
    kerf: 4.5,
    trim: { x: 0, y: 0 },
    strategy: "v10",
    constraints: {
      profile: "balanced",
      minRemnant: 250,
      minCommercialRemnantLongSide: 400,
      allowOneBoard: true,
      allowPatternMaster: true,
      allowMultiSlice: true,
      allowDeadStripCompaction: true,
    },
    pieces: [
      {
        reference: "A",
        quantity: 75,
        width: 1220,
        height: 455,
        canRotate: true,
      },
      {
        reference: "B",
        quantity: 150,
        width: 1828,
        height: 605,
        canRotate: true,
      },
    ],
  };
}

describe("motor beta v2 runtime", () => {
  it("exposes an isolated V2 algorithm version and reaches the certified 75-board sentinel", () => {
    const result = optimizeProject(input5504203("motor-v2-runtime-5504203"), {
      motorVersion: "v2",
    });

    expect(result.algorithmVersion).toContain(MOTOR_BETA_V2_VERSION);
    expect(result.algorithmVersion).not.toBe(LEGACY_OPTIMIZER_VERSION);
    expect(result.validation.ok).toBe(true);
    expect(result.metrics.expectedPieceCount).toBe(225);
    expect(result.metrics.pieceCount).toBe(225);
    expect(result.metrics.boardCount).toBe(75);
    expect(result.raw.opts?.masterStructuralV2).toBe(true);
    expect(result.raw.opts?.masterIndustrialRulesV3Experimental).toBe(true);
  });

  it("keeps V1 and V2 cache entries isolated for the same optimization input", () => {
    const input: OptimizationInput = {
      board: { width: 1200, height: 800, thickness: 18 },
      material: { description: "CACHE MOTOR VERSION", hasGrain: false, thickness: 18 },
      kerf: 4.5,
      trim: { x: 0, y: 0 },
      strategy: "v10",
      constraints: {
        profile: "fast",
        minRemnant: 100,
        minCommercialRemnantLongSide: 250,
        allowOneBoard: false,
        allowPatternMaster: false,
        allowMultiSlice: false,
        allowDeadStripCompaction: false,
      },
      pieces: [{ reference: "P", quantity: 1, width: 300, height: 200 }],
    };

    const v1 = optimizeProject(input, { motorVersion: "v1" });
    const v2 = optimizeProject(input, { motorVersion: "v2" });
    const v2Again = optimizeProject(input, { motorVersion: "v2" });

    expect(v1.metrics.cacheHit).toBe(false);
    expect(v2.metrics.cacheHit).toBe(false);
    expect(v2Again.metrics.cacheHit).toBe(true);
    expect(v1.algorithmVersion).toBe(LEGACY_OPTIMIZER_VERSION);
    expect(v2.algorithmVersion).toContain(MOTOR_BETA_V2_VERSION);
    expect(v1.validation.ok).toBe(true);
    expect(v2.validation.ok).toBe(true);
    expect(v1.metrics.boardCount).toBe(v2.metrics.boardCount);
  });
});
