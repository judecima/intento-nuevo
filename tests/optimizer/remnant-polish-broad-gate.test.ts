import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

import { describe, expect, it } from "vitest";
import { optimizeProject, type OptimizationInput, type OptimizationResult } from "@/lib/optimizer";

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
const SAMPLE_MOD = Number(process.env.SAMPLE_MOD ?? 2);

describe("V2 per-board remnant polish broad A/B", () => {
  it("never regresses boards, validity, or equal-board commercial remnant quality", () => {
    const eligible = decodeFixture()
      .filter((c) => c.leptonBoards > 0 && c.leptonBoards <= 75)
      .filter((c) => c.types.length > 40 || pieceCount(c) > 120)
      .sort((a, b) => a.id - b.id);
    const sampled = eligible.filter((_, index) => index % SAMPLE_MOD === 0);
    const cases = sampled.filter((_, index) => index % SHARD_TOTAL === SHARD_INDEX);

    const rows: any[] = [];
    const failures: any[] = [];

    for (const c of cases) {
      const input = fixtureInput(c);

      process.env.OPTIMIZER_V2_REMNANT_POLISH = "0";
      const t0 = performance.now();
      const baseline = optimizeProject(input, {
        motorVersion: "v2",
        effortMode: "auto",
        patternGenerator: "rust",
      });
      const baselineMs = performance.now() - t0;

      process.env.OPTIMIZER_V2_REMNANT_POLISH = "1";
      const t1 = performance.now();
      const candidate = optimizeProject(input, {
        motorVersion: "v2",
        effortMode: "auto",
        patternGenerator: "rust",
      });
      const candidateMs = performance.now() - t1;

      const remnantCmp = compareRemnant(candidate, baseline);
      const boardDelta = candidate.metrics.boardCount - baseline.metrics.boardCount;
      const valid = baseline.validation.ok === true && candidate.validation.ok === true;
      const ok = valid && boardDelta <= 0 && (boardDelta < 0 || remnantCmp >= 0);
      const improved =
        boardDelta < 0 ||
        (boardDelta === 0 && remnantCmp > 0);

      const row = {
        id: c.id,
        leptonBoards: c.leptonBoards,
        pieces: pieceCount(c),
        types: c.types.length,
        baselineBoards: baseline.metrics.boardCount,
        candidateBoards: candidate.metrics.boardCount,
        boardDelta,
        baselineRemnant: remnantQuality(baseline),
        candidateRemnant: remnantQuality(candidate),
        remnantCmp,
        baselineMs,
        candidateMs,
        baselineVersion: baseline.algorithmVersion,
        candidateVersion: candidate.algorithmVersion,
        baselineValid: baseline.validation.ok,
        candidateValid: candidate.validation.ok,
        improved,
        ok,
      };

      rows.push(row);
      if (!ok) failures.push(row);
    }

    delete process.env.OPTIMIZER_V2_REMNANT_POLISH;

    const output = {
      schema: "optimizer-remnant-polish-broad-v1",
      shard: SHARD_INDEX,
      shardTotal: SHARD_TOTAL,
      sampleMod: SAMPLE_MOD,
      eligibleTotal: eligible.length,
      sampledTotal: sampled.length,
      cases: rows.length,
      failures: failures.length,
      improvements: rows.filter((row) => row.improved).length,
      rows,
    };

    const outDir = path.join(ROOT, "research", "optimizer", "saas-hardening");
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(
      path.join(outDir, `remnant-polish-broad-shard-${SHARD_INDEX}.json`),
      JSON.stringify(output) + "\n",
    );

    console.log("REMNANT_POLISH_BROAD_SHARD " + JSON.stringify({
      shard: SHARD_INDEX,
      eligibleTotal: eligible.length,
      sampledTotal: sampled.length,
      cases: rows.length,
      failures: failures.length,
      improvements: rows.filter((row) => row.improved).length,
    }));

    expect(failures).toEqual([]);
  }, 900_000);
});

function fixtureInput(c: FixtureCase): OptimizationInput {
  return {
    projectId: `remnant-polish-${c.id}`,
    board: { width: c.width, height: c.height, thickness: 18 },
    material: { description: `REMNANT POLISH ${c.id}`, hasGrain: false, thickness: 18 },
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

function remnantQuality(result: OptimizationResult) {
  return {
    largest: result.metrics.largestCommercialRemnantM2,
    second: result.metrics.secondLargestCommercialRemnantM2,
    fragments: result.metrics.commercialRemnantCount,
    total: result.metrics.commercialRemnantAreaM2,
  };
}

function compareRemnant(a: OptimizationResult, b: OptimizationResult): number {
  const A = remnantQuality(a);
  const B = remnantQuality(b);
  const eps = 1e-9;
  if (A.largest > B.largest + eps) return 1;
  if (B.largest > A.largest + eps) return -1;
  if (A.second > B.second + eps) return 1;
  if (B.second > A.second + eps) return -1;
  if (A.fragments !== B.fragments) return A.fragments < B.fragments ? 1 : -1;
  if (A.total > B.total + eps) return 1;
  if (B.total > A.total + eps) return -1;
  return 0;
}

function pieceCount(c: FixtureCase): number {
  return c.types.reduce((sum, type) => sum + type.q, 0);
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
