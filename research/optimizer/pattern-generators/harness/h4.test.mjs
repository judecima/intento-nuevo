import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createCpuMeter } from "./cpu-meter.mjs";
import { buildObservedB0 } from "./b0-observer.mjs";
import { ROOT } from "./identity.mjs";
import { generatePatterns } from "../and-or.mjs";
import { H2_FIXTURES, H2_LIMITS } from "../h2-fixtures.mjs";
import { digest } from "../canonical.mjs";
import { serialize } from "./evidence.mjs";
import { pilotReport } from "./pilot-report.mjs";

test("exclusive CPU reconciles nested materialization and exceptional exits", () => {
  let cpu = 0;
  const meter = createCpuMeter(() => cpu);
  meter.measure("pipeline", () => {
    cpu += 3;
    meter.measure("generation", () => { cpu += 5; meter.measure("materialization", () => { cpu += 7; }); cpu += 2; });
    assert.throws(() => meter.measure("master", () => { cpu += 11; throw new Error("failure"); }));
    cpu += 13;
  });
  assert.deepEqual(meter.snapshot().exclusive, { materialization: 7, generation: 7, master: 11, pipeline: 16 });
  assert.equal(meter.snapshot().inclusive.pipeline, 41);
});

test("pilot keeps a board regression separate from measured CPU savings and rejects drift", () => {
  const arms = ["A-direct", "B", "A-adapter", "B", "B", "A-adapter", "A-adapter", "B"];
  const ids = ["control-a-direct", "control-b-native", "a-1", "b-1", "b-2", "a-2", "a-3", "b-3"];
  const manifest = { policy: { orderByRepetition: ["AB", "BA", "AB"] }, jobs: arms.map((arm, i) => ({ arm, control: i < 2 })) };
  const rows = arms.map((arm, i) => ({ jobId: ids[i], arm, executionStatus: "COMPLETE", q1: "PASS", failures: [],
    generatedPool: { patternPoolHash: "pool", orderedPoolHash: "order" },
    final: { fullPlanHash: arm === "B" ? "b" : "a", boardCount: arm === "B" ? 5 : 4,
      remnant: { mayor: 100, segundo: 50, fragmentos: 2, total: 150 } },
    probe: { generatorCalls: 1, rounds: [40], legacyGeneratorCalls: arm === "B" ? 0 : 1,
      legacyMonotypeCalls: arm === "B" ? 0 : 1, legacyPackingDuringB: 0, generatorResults: [] },
    measurement: { patternGenCPU: arm === "B" ? 50 : 100, materializationCPU: 10,
      masterCPU: 20, otherCPU: 30, totalCPU: arm === "B" ? 110 : 160, poolProductionCPU: arm === "B" ? 60 : 100 } }));
  const report = pilotReport(manifest, rows);
  assert.equal(report.comparisonValid, true); assert.equal(report.q1, "PASS"); assert.equal(report.q2, "FAIL");
  assert.equal(report.q3.cpu.patternGenCPU.savingPct, 50);
  rows[2].q1 = "FAIL";
  assert.equal(pilotReport(manifest, rows).q2, "FAIL", "Q1 failure must not conceal an observed extra board");
  rows[3].final.fullPlanHash = "drift";
  assert.equal(pilotReport(manifest, rows).q3.status, "INCONCLUSIVE");
});

test("materializer observer preserves frozen B0 trees, pools and complete/restricted/limited telemetry", async () => {
  const dir = join(ROOT, "test-results", `h4-observer-${Date.now()}`); mkdirSync(dir);
  const bundle = join(dir, "b0.mjs");
  const build = await buildObservedB0(bundle);
  assert.equal(Object.keys(build.metafile.inputs).filter((path) => path.endsWith("and-or.mjs")).length, 1);
  const observed = await import(pathToFileURL(bundle).href);
  for (const fixture of H2_FIXTURES) for (const restricted of [false, true]) {
    const limits = restricted ? { ...H2_LIMITS, maxExpansions: 12 } : H2_LIMITS;
    const options = { maxVariantsPerUsageVector: restricted ? 1 : 100000 };
    const native = generatePatterns(fixture.context, limits, options);
    const meter = createCpuMeter(); observed.setObserver(meter.measure);
    const result = meter.measure("generation", () => observed.generatePatterns(fixture.context, limits, options));
    assert.equal(digest(serialize(result)), digest(serialize(native)), fixture.name);
    assert.equal(meter.snapshot().inclusive.generation,
      meter.snapshot().exclusive.generation + (meter.snapshot().exclusive.materialization ?? 0));
    if (result.patterns.length) assert.ok(meter.snapshot().calls.materialization > 0);
  }
});
