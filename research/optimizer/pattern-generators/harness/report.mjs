import { digest } from "../canonical.mjs";

// H3 is an integration gate. It deliberately makes no quality or speedup claim.
export function integrationReport(manifest, results) {
  const normal = results.filter((r, i) => !manifest.jobs[i].control);
  const jobsById = new Map(manifest.jobs.map((job) => [job.id, job]));
  const groups = new Map();
  for (const r of normal) {
    const key = `${r.inputHash}/${r.mode}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const parity = [], repeatability = [];
  for (const [key, group] of groups) {
    const signature = (r) => digest({ pool: r.generatedPool?.patternPoolHash ?? null,
      order: r.generatedPool?.orderedPoolHash ?? null, plan: r.final?.fullPlanHash ?? null });
    const direct = group.filter((r) => r.arm === "A-direct"), adapted = group.filter((r) => r.arm === "A-adapter");
    if (direct.length && adapted.length) parity.push({ key, exercised: direct.some((r) => r.generatorExercised),
      ok: [...direct, ...adapted].every((r) => r.q1 === "PASS" && signature(r) === signature(direct[0])) });
    for (const arm of ["A-direct", "A-adapter", "B"]) {
      const configurations = new Map();
      for (const r of group.filter((r) => r.arm === arm)) {
        const job = jobsById.get(r.jobId);
        const policy = digest({ budget: job.generatorBudget, diversity: job.maxVariantsPerUsageVector });
        if (!configurations.has(policy)) configurations.set(policy, []);
        configurations.get(policy).push(r);
      }
      for (const [policy, runs] of configurations) {
        if (runs.length >= 3) {
          const deterministic = (r) => digest({ signature: signature(r), search: r.probe?.generatorResults });
          repeatability.push({ key, arm, policy, runs: runs.length, ok: runs.every((r) => r.q1 === "PASS" && deterministic(r) === deterministic(runs[0])) });
        }
      }
    }
  }
  const isolated = normal.filter((r) => r.arm === "B" && r.generatorExercised);
  const bIsolation = isolated.length > 0 && isolated.every((r) => r.probe?.generatorCalls > 0 &&
    r.probe.legacyGeneratorCalls === 0 && r.probe.legacyMonotypeCalls === 0 && r.probe.legacyPackingDuringB === 0);
  const inactive = normal.filter((r) => r.mode === "end-to-end" && !r.masterActivated);
  const inactiveReported = inactive.length > 0 && inactive.every((r) => r.q1 === "PASS" &&
    !r.generatorExercised && r.probe.generatorCalls === 0 && r.final?.ok);
  const controls = manifest.jobs.flatMap((job, i) => job.control ? [{ fault: job.fault, jobId: job.id,
    status: results[i].executionStatus, q1: results[i].q1, codes: results[i].failures.map((f) => f.code),
    finalValid: results[i].final?.ok ?? null }] : []);
  const expected = { "throw-generator": "GENERATOR_EXCEPTION", "invalid-pattern": "INVALID_POOL",
    "late-load": "OPERATIONAL_ABORT", crash: "CHILD_ABORT", hang: "CHILD_ABORT" };
  const controlsDetected = Object.entries(expected).every(([fault, code]) => controls.some((c) =>
    c.fault === fault && c.q1 === "FAIL" && c.codes.includes(code) &&
    (!["throw-generator", "invalid-pattern"].includes(fault) || c.finalValid)));
  const parityComplete = ["generation-only", "end-to-end"].every((mode) => parity.some((p) => p.key.endsWith(mode) && p.exercised));
  const repeatsComplete = ["A-direct", "A-adapter", "B"].every((arm) => ["generation-only", "end-to-end"].every((mode) =>
    repeatability.some((r) => r.arm === arm && r.key.endsWith(mode))));
  const passed = normal.every((r) => r.executionStatus === "COMPLETE" && r.q1 === "PASS") && parityComplete &&
    parity.every((p) => p.ok) && repeatsComplete && repeatability.every((r) => r.ok) && bIsolation && inactiveReported && controlsDetected;
  return { status: passed ? "PASS" : "FAIL", scope: "H3_SYNTHETIC_INTEGRATION", jobs: results.length,
    nonControlJobs: normal.length, parity, repeatability, bIsolation, inactiveReported, controlsDetected, controls,
    q1: normal.every((r) => r.q1 === "PASS") ? "PASS" : "FAIL", q2: "NOT_EVALUATED", q3: "DIAGNOSTIC_ONLY" };
}
