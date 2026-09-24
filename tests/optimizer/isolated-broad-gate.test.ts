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
  leptonBoards: number;
  types: Array<{ w: number; h: number; q: number }>;
};

const ROOT = process.cwd();
const SHARD_INDEX = Number(process.env.SHARD_INDEX ?? 0);
const SHARD_TOTAL = Number(process.env.SHARD_TOTAL ?? 8);
const SAMPLE_MOD = Number(process.env.SAMPLE_MOD ?? 8);

describe("isolated broad production parity", () => {
  it("keeps sync and child-process Auto physically identical on the sampled furniture cohort", async () => {
    const cohort = decodeFixture()
      .filter((c) => c.leptonBoards > 0 && c.leptonBoards <= 75)
      .sort((a, b) => a.id - b.id)
      .filter((_, index) => index % SAMPLE_MOD === 0);

    const cases = cohort.filter((_, index) => index % SHARD_TOTAL === SHARD_INDEX);
    const rows = [];
    const failures = [];

    for (const c of cases) {
      const syncInput = fixtureInput(c, `iso-broad-${c.id}-sync`);
      const isolatedInput = fixtureInput(c, `iso-broad-${c.id}-child`);

      const t0 = performance.now();
      const sync = optimizeProject(syncInput, {
        motorVersion: "v2",
        effortMode: "auto",
        patternGenerator: "rust",
      });
      const syncMs = performance.now() - t0;

      const t1 = performance.now();
      const isolated = await optimizeProjectIsolated(
        isolatedInput,
        {
          motorVersion: "v2",
          effortMode: "auto",
          patternGenerator: "rust",
        },
        { timeoutMs: 120_000 },
      );
      const isolatedMs = performance.now() - t1;

      const syncDigest = physicalDigest(sync);
      const isolatedDigest = physicalDigest(isolated);
      const ok =
        sync.validation.ok === true &&
        isolated.validation.ok === true &&
        sync.metrics.boardCount === isolated.metrics.boardCount &&
        syncDigest === isolatedDigest;

      const row = {
        id: c.id,
        leptonBoards: c.leptonBoards,
        pieces: c.types.reduce((sum, type) => sum + type.q, 0),
        types: c.types.length,
        syncBoards: sync.metrics.boardCount,
        isolatedBoards: isolated.metrics.boardCount,
        syncDigest,
        isolatedDigest,
        syncMs,
        isolatedMs,
        ok,
      };
      rows.push(row);
      if (!ok) failures.push(row);
    }

    const output = {
      schema: "optimizer-isolation-broad-v1",
      shard: SHARD_INDEX,
      shardTotal: SHARD_TOTAL,
      sampleMod: SAMPLE_MOD,
      furnitureTotal: decodeFixture().filter((c) => c.leptonBoards > 0 && c.leptonBoards <= 75).length,
      sampledTotal: cohort.length,
      cases: rows.length,
      failures: failures.length,
      rows,
    };

    const outDir = path.join(ROOT, "research", "optimizer", "saas-hardening");
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(
      path.join(outDir, `isolation-broad-shard-${SHARD_INDEX}.json`),
      JSON.stringify(output) + "\n",
    );

    console.log("ISOLATION_BROAD_SHARD " + JSON.stringify({
      shard: SHARD_INDEX,
      cases: rows.length,
      failures: failures.length,
    }));

    expect(failures).toEqual([]);
  }, 600_000);
});

function fixtureInput(c: FixtureCase, projectId: string): OptimizationInput {
  return {
    projectId,
    board: { width: c.width, height: c.height, thickness: 18 },
    material: { description: `ISOLATION BROAD ${c.id}`, hasGrain: false, thickness: 18 },
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

function decodeFixture(): FixtureCase[] {
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
  const out: FixtureCase[] = [];
  let lastId = 0;

  for (let index = 0; index < total; index++) {
    const id = lastId + readVarint();
    lastId = id;
    const width = readVarint() / 10;
    const height = readVarint() / 10;
    const saw = readVarint() / 10;
    const leptonBoards = readVarint();
    const typeCount = readVarint();
    const types = [];
    for (let type = 0; type < typeCount; type++) {
      types.push({ w: readVarint() / 10, h: readVarint() / 10, q: readVarint() });
    }
    out.push({ id, width, height, saw, leptonBoards, types });
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
