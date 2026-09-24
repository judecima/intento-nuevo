import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

import { describe, expect, it } from "vitest";
import {
  optimizeProject,
  optimizeProjectIsolated,
  type OptimizationInput,
} from "@/lib/optimizer";

type FixtureCase = {
  id: number;
  width: number;
  height: number;
  saw: number;
  types: Array<{ w: number; h: number; q: number }>;
};

const ROOT = process.cwd();

describe("isolated kernel overhead", () => {
  it("measures process isolation on a threshold, Master-active and structural case", async () => {
    const fixture = decodeFixture(new Set([5440200]));
    const masterCase = fixture.get(5440200);
    expect(masterCase).toBeTruthy();

    const cases: Array<{ name: string; input: OptimizationInput }> = [
      { name: "threshold-60", input: thresholdInput("bench-threshold") },
      { name: "master-5440200", input: fixtureInput(masterCase!, "bench-master") },
      { name: "structural-5504203", input: structuralInput("bench-structural") },
    ];

    const rows = [];
    for (const entry of cases) {
      const syncSamples: number[] = [];
      const isolatedSamples: number[] = [];

      for (let rep = 0; rep < 3; rep++) {
        const syncInput = { ...entry.input, projectId: `${entry.name}-sync-${rep}` };
        const isolatedInput = { ...entry.input, projectId: `${entry.name}-isolated-${rep}` };

        const syncStart = performance.now();
        const sync = optimizeProject(syncInput, {
          motorVersion: "v2",
          effortMode: "auto",
          patternGenerator: "rust",
        });
        syncSamples.push(performance.now() - syncStart);

        const isolatedStart = performance.now();
        const isolated = await optimizeProjectIsolated(
          isolatedInput,
          {
            motorVersion: "v2",
            effortMode: "auto",
            patternGenerator: "rust",
          },
          { timeoutMs: 120_000 },
        );
        isolatedSamples.push(performance.now() - isolatedStart);

        expect(sync.validation.ok).toBe(true);
        expect(isolated.validation.ok).toBe(true);
        expect(isolated.metrics.boardCount).toBe(sync.metrics.boardCount);
        expect(physicalDigest(isolated)).toBe(physicalDigest(sync));
      }

      const syncMedianMs = median(syncSamples);
      const isolatedMedianMs = median(isolatedSamples);
      rows.push({
        name: entry.name,
        syncSamplesMs: syncSamples,
        isolatedSamplesMs: isolatedSamples,
        syncMedianMs,
        isolatedMedianMs,
        overheadMs: isolatedMedianMs - syncMedianMs,
        ratio: syncMedianMs > 0 ? isolatedMedianMs / syncMedianMs : null,
      });
    }

    const result = {
      schema: "optimizer-isolation-overhead-v1",
      rows,
    };

    const outDir = path.join(ROOT, "research", "optimizer", "saas-hardening");
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(
      path.join(outDir, "ISOLATION_OVERHEAD_RESULT.json"),
      JSON.stringify(result, null, 2) + "\n",
    );

    console.log("ISOLATION_OVERHEAD_RESULT " + JSON.stringify(result));
  }, 180_000);
});

function thresholdInput(projectId: string): OptimizationInput {
  return {
    projectId,
    board: { width: 2600, height: 1830, thickness: 18 },
    material: { description: "THRESHOLD 60", hasGrain: false, thickness: 18 },
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
      { reference: "A", quantity: 20, width: 600, height: 400, canRotate: true },
      { reference: "B", quantity: 20, width: 500, height: 300, canRotate: true },
      { reference: "C", quantity: 20, width: 450, height: 250, canRotate: true },
    ],
  };
}

function structuralInput(projectId: string): OptimizationInput {
  return {
    projectId,
    board: { width: 2440, height: 1220, thickness: 18 },
    material: { description: "STRUCTURAL 5504203", hasGrain: false, thickness: 18 },
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

function fixtureInput(c: FixtureCase, projectId: string): OptimizationInput {
  return {
    projectId,
    board: { width: c.width, height: c.height, thickness: 18 },
    material: { description: `FIXTURE ${c.id}`, hasGrain: false, thickness: 18 },
    kerf: c.saw,
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
    pieces: c.types.map((type, index) => ({
      reference: String(index),
      quantity: type.q,
      width: type.w,
      height: type.h,
      canRotate: true,
    })),
  };
}

function decodeFixture(wanted: Set<number>): Map<number, FixtureCase> {
  const dir = path.join(ROOT, "research", "optimizer", "holdout-v2-fixture");
  const b64 = [0, 1, 2, 3]
    .map((index) => fs.readFileSync(path.join(dir, `part-0${index}.b64`), "utf8").trim())
    .join("");
  const buffer = zlib.brotliDecompressSync(Buffer.from(b64, "base64"));
  let offset = 5;

  if (buffer.subarray(0, 5).toString() !== "MDFV1") throw new Error("bad fixture");

  const readVarint = () => {
    let value = 0;
    let shift = 0;
    for (;;) {
      const byte = buffer[offset++];
      value += (byte & 127) * 2 ** shift;
      if (!(byte & 128)) return value;
      shift += 7;
    }
  };

  const total = readVarint();
  const out = new Map<number, FixtureCase>();
  let lastId = 0;

  for (let index = 0; index < total; index++) {
    const id = lastId + readVarint();
    lastId = id;
    const width = readVarint() / 10;
    const height = readVarint() / 10;
    const saw = readVarint() / 10;
    readVarint(); // lepton boards
    const typeCount = readVarint();
    const types = [];
    for (let type = 0; type < typeCount; type++) {
      types.push({ w: readVarint() / 10, h: readVarint() / 10, q: readVarint() });
    }
    if (wanted.has(id)) out.set(id, { id, width, height, saw, types });
  }

  return out;
}

function physicalDigest(result: Awaited<ReturnType<typeof optimizeProjectIsolated>>): string {
  return createHash("sha256")
    .update(JSON.stringify({
      boards: result.metrics.boardCount,
      placements: result.placements
        .map((piece) => [
          piece.reference,
          piece.boardIndex,
          piece.x,
          piece.y,
          piece.width,
          piece.height,
          piece.rotated,
        ])
        .sort(),
      remnants: result.remnants
        .map((remnant) => [
          remnant.boardIndex,
          remnant.x,
          remnant.y,
          remnant.width,
          remnant.height,
          remnant.commercial,
        ])
        .sort(),
    }))
    .digest("hex");
}

function median(values: number[]): number {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}
