import { describe, expect, it } from "vitest";

import {
  OPTIMIZER_ADVANCED_REFERENCE_VERSION,
  OPTIMIZER_AUTO_EFFORT_VERSION,
  optimizeProject,
  type OptimizationInput,
} from "@/lib/optimizer";

function structuralSentinel(projectId: string): OptimizationInput {
  return {
    projectId,
    board: { width: 2440, height: 1220, thickness: 18 },
    material: { description: "MDF AUTO EFFORT", hasGrain: false, thickness: 18 },
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
      { reference: "A", quantity: 75, width: 1220, height: 455, canRotate: true },
      { reference: "B", quantity: 150, width: 1828, height: 605, canRotate: true },
    ],
  };
}

describe("optimizer auto effort controller", () => {
  it("keeps Auto and Advanced physically valid and board-equivalent on the certified structural sentinel", () => {
    const auto = optimizeProject(structuralSentinel("auto-effort-sentinel-auto"), {
      motorVersion: "v2",
      effortMode: "auto",
    });
    const advanced = optimizeProject(structuralSentinel("auto-effort-sentinel-advanced"), {
      motorVersion: "v2",
      effortMode: "advanced",
    });

    expect(auto.algorithmVersion).toContain(OPTIMIZER_AUTO_EFFORT_VERSION);
    expect(advanced.algorithmVersion).toContain(OPTIMIZER_ADVANCED_REFERENCE_VERSION);
    expect(auto.metrics.effortMode).toBe("auto");
    expect(advanced.metrics.effortMode).toBe("advanced");
    expect(auto.validation.ok).toBe(true);
    expect(advanced.validation.ok).toBe(true);
    expect(auto.metrics.boardCount).toBe(75);
    expect(advanced.metrics.boardCount).toBe(75);

    const telemetry = auto.raw.metricasV10 as {
      effortController?: {
        mode?: string;
        stopReason?: string | null;
        safeLowerBound?: number | null;
        finalBoards?: number | null;
      };
    };
    expect(telemetry.effortController?.mode).toBe("auto");
    expect(telemetry.effortController?.stopReason).toBe("structural-safe-lb");
    expect(telemetry.effortController?.finalBoards).toBe(75);
  });

  it("isolates fixed, Auto and Advanced cache entries", () => {
    const input = structuralSentinel("auto-effort-cache-isolation");
    const fixed = optimizeProject(input, { motorVersion: "v2", effortMode: "fixed" });
    const auto = optimizeProject(input, { motorVersion: "v2", effortMode: "auto" });
    const advanced = optimizeProject(input, { motorVersion: "v2", effortMode: "advanced" });
    const autoAgain = optimizeProject(input, { motorVersion: "v2", effortMode: "auto" });

    expect(fixed.metrics.cacheHit).toBe(false);
    expect(auto.metrics.cacheHit).toBe(false);
    expect(advanced.metrics.cacheHit).toBe(false);
    expect(autoAgain.metrics.cacheHit).toBe(true);
    expect(fixed.metrics.boardCount).toBe(75);
    expect(auto.metrics.boardCount).toBe(75);
    expect(advanced.metrics.boardCount).toBe(75);
  });
});
