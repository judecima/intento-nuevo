import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { runH3, validateManifest } from "./run.mjs";
import { ROOT } from "./identity.mjs";
import { h3Manifest } from "./h3-fixtures.mjs";
import { integrationReport } from "./report.mjs";

test("H3 rejects scored execution and unlabelled fault controls", () => {
  assert.throws(() => validateManifest({ ...h3Manifest(), mode: "scored" }), /H3 manifest/);
  const manifest = h3Manifest();
  manifest.jobs[0].fault = "crash";
  assert.throws(() => validateManifest(manifest), /control label/);
});

test("H3 fresh-process parity, B isolation, inactive Master and persisted fault controls", async () => {
  const out = join(ROOT, "test-results", `pattern-h3-${Date.now()}`);
  const { results, report } = await runH3(h3Manifest(), out);
  console.log(`H3 artifacts: ${out}`);
  const byId = Object.fromEntries(results.map((r) => [r.jobId, r]));
  assert.equal(report.status, "PASS", JSON.stringify(report));
  const drift = results.map((r) => r.jobId === "a-adapter-1" ? { ...r,
    generatedPool: { ...r.generatedPool, orderedPoolHash: "injected-drift" } } : r);
  assert.equal(integrationReport(h3Manifest(), drift).status, "FAIL", "pool drift must reject H3");
  const hidden = results.map((r) => r.jobId === "control-throw-generator" ? { ...r, failures: [], q1: "PASS" } : r);
  assert.equal(integrationReport(h3Manifest(), hidden).status, "FAIL", "hidden exceptions must reject H3");
  for (const line of readFileSync(join(out, "cases.jsonl"), "utf8").trim().split("\n")) {
    assert.ok(existsSync(join(out, JSON.parse(line).artifact)), "every completion links to a persisted artifact");
  }
  const limited = byId["b-work-limit"];
  assert.equal(limited.probe.generatorResults[0].status, "WORK_LIMIT");
  assert.equal(limited.generatedPool.patterns.length, 0);
  for (const record of results.filter((r) => !r.jobId.startsWith("control-"))) {
    assert.equal(record.executionStatus, "COMPLETE", JSON.stringify(record.failures));
    assert.equal(record.q1, "PASS", `${record.jobId}: ${JSON.stringify(record.failures)}`);
  }
  for (const arm of ["a-direct", "a-adapter", "b"]) {
    for (const mode of ["", "-gen"]) {
      const runs = [1, 2, 3].map((i) => byId[`${arm}${mode}-${i}`]);
      for (const r of runs) assert.equal(r.generatorExercised, true);
      for (const field of ["patternPoolHash", "orderedPoolHash"]) {
        assert.equal(runs[1].generatedPool[field], runs[0].generatedPool[field]);
        assert.equal(runs[2].generatedPool[field], runs[0].generatedPool[field]);
        if (arm === "a-adapter") assert.equal(runs[0].generatedPool[field], byId[`a-direct${mode}-1`].generatedPool[field]);
      }
      if (!mode) {
        for (const r of runs) assert.equal(r.masterActivated, true);
        assert.equal(runs[1].final.fullPlanHash, runs[0].final.fullPlanHash);
        assert.equal(runs[2].final.fullPlanHash, runs[0].final.fullPlanHash);
        if (arm === "a-adapter") assert.equal(runs[0].final.fullPlanHash, byId["a-direct-1"].final.fullPlanHash);
      }
    }
    const inactive = byId[`${arm}-inactive`];
    assert.equal(inactive.masterActivated, false);
    assert.equal(inactive.generatorExercised, false);
    assert.equal(inactive.probe.generatorCalls, 0);
  }
  for (const r of results.filter((r) => r.arm === "B" && !r.jobId.startsWith("control-"))) {
    assert.equal(r.probe.legacyGeneratorCalls, 0);
    assert.equal(r.probe.legacyMonotypeCalls, 0);
    assert.equal(r.probe.legacyPackingDuringB, 0);
  }
  for (const fault of ["throw-generator", "invalid-pattern", "late-load", "crash", "hang"]) {
    const r = byId[`control-${fault}`];
    assert.equal(r.q1, "FAIL", fault);
    assert.ok(r.failures.length > 0, fault);
    if (["throw-generator", "invalid-pattern"].includes(fault)) {
      assert.equal(r.executionStatus, "COMPLETE");
      assert.equal(r.final.ok, true, "valid fallback must not hide a bad candidate");
    } else assert.equal(r.executionStatus, "OPERATIONAL_ABORT");
  }
});
