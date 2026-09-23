import { afterEach, describe, expect, it } from "vitest";

import {
  optimizeProject,
  optimizeProjectIsolated,
  type OptimizationInput,
} from "@/lib/optimizer";

function input(projectId: string): OptimizationInput {
  return {
    projectId,
    board: { width: 1200, height: 800, thickness: 18 },
    material: { description: "ISOLATION TEST", hasGrain: false, thickness: 18 },
    kerf: 4.5,
    trim: { x: 0, y: 0 },
    strategy: "v10",
    constraints: {
      profile: "fast",
      minRemnant: 100,
      minCommercialRemnantLongSide: 250,
      allowOneBoard: true,
      allowPatternMaster: false,
      allowMultiSlice: false,
      allowDeadStripCompaction: true,
    },
    pieces: [
      { reference: "A", quantity: 2, width: 500, height: 300, canRotate: true },
      { reference: "B", quantity: 2, width: 350, height: 250, canRotate: true },
    ],
  };
}

afterEach(() => {
  delete process.env.OPTIMIZER_KERNEL_CHILD_DELAY_MS;
  delete process.env.OPTIMIZER_KERNEL_CHILD_FORCE_CRASH;
});

describe("optimizer isolated kernel execution", () => {
  it("keeps the isolated result physically equivalent to the synchronous path", async () => {
    const isolated = await optimizeProjectIsolated(input("isolation-child"), {
      motorVersion: "v1",
      patternGenerator: "js",
    });
    const synchronous = optimizeProject(input("isolation-sync"), {
      motorVersion: "v1",
      patternGenerator: "js",
    });

    expect(isolated.validation.ok).toBe(true);
    expect(synchronous.validation.ok).toBe(true);
    expect(isolated.algorithmVersion).toBe(synchronous.algorithmVersion);
    expect(isolated.metrics.boardCount).toBe(synchronous.metrics.boardCount);
    expect(physicalDigest(isolated)).toEqual(physicalDigest(synchronous));
  });

  it("kills a child that exceeds the kernel timeout", async () => {
    process.env.OPTIMIZER_KERNEL_CHILD_DELAY_MS = "250";

    await expect(
      optimizeProjectIsolated(
        input("isolation-timeout"),
        { motorVersion: "v1", patternGenerator: "js" },
        { timeoutMs: 20 },
      ),
    ).rejects.toThrow("OPTIMIZER_KERNEL_TIMEOUT:20");
  });

  it("aborts the child when a cancellation signal is raised", async () => {
    process.env.OPTIMIZER_KERNEL_CHILD_DELAY_MS = "250";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20);

    try {
      await expect(
        optimizeProjectIsolated(
          input("isolation-abort"),
          { motorVersion: "v1", patternGenerator: "js" },
          { timeoutMs: 5_000, signal: controller.signal },
        ),
      ).rejects.toThrow("OPTIMIZER_KERNEL_ABORTED");
    } finally {
      clearTimeout(timer);
    }
  });

  it("contains a child crash and keeps the parent able to optimize", async () => {
    process.env.OPTIMIZER_KERNEL_CHILD_FORCE_CRASH = "1";

    await expect(
      optimizeProjectIsolated(
        input("isolation-crash"),
        { motorVersion: "v1", patternGenerator: "js" },
        { timeoutMs: 5_000 },
      ),
    ).rejects.toThrow(/OPTIMIZER_KERNEL_CHILD_EXIT/);

    delete process.env.OPTIMIZER_KERNEL_CHILD_FORCE_CRASH;

    const recovered = await optimizeProjectIsolated(
      input("isolation-after-crash"),
      { motorVersion: "v1", patternGenerator: "js" },
      { timeoutMs: 5_000 },
    );

    expect(recovered.validation.ok).toBe(true);
    expect(recovered.metrics.pieceCount).toBe(4);
  });
});

function physicalDigest(result: Awaited<ReturnType<typeof optimizeProjectIsolated>>) {
  return {
    boards: result.metrics.boardCount,
    pieces: result.placements
      .map((piece) => ({
        reference: piece.reference,
        boardIndex: piece.boardIndex,
        x: piece.x,
        y: piece.y,
        width: piece.width,
        height: piece.height,
        rotated: piece.rotated,
      }))
      .sort((a, b) =>
        a.reference.localeCompare(b.reference) ||
        a.boardIndex - b.boardIndex ||
        a.x - b.x ||
        a.y - b.y
      ),
    remnants: result.remnants
      .map((remnant) => ({
        boardIndex: remnant.boardIndex,
        x: remnant.x,
        y: remnant.y,
        width: remnant.width,
        height: remnant.height,
        commercial: remnant.commercial,
      }))
      .sort((a, b) =>
        a.boardIndex - b.boardIndex ||
        a.x - b.x ||
        a.y - b.y ||
        a.width - b.width ||
        a.height - b.height
      ),
  };
}
