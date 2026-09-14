import { createRequire } from "node:module";
import { join } from "node:path";
import { digest } from "../canonical.mjs";
import { ROOT } from "./identity.mjs";
const require = createRequire(import.meta.url);
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
export function pilotReport(manifest, results) {
  const { compararCalidad } = require(join(ROOT, "src/lib/optimizer/legacy/motor.cjs"));
  const measured = results.filter((_, i) => !manifest.jobs[i].control);
  const signature = (r) => digest({ plan: r.final?.fullPlanHash, pool: r.generatedPool?.patternPoolHash,
    order: r.generatedPool?.orderedPoolHash, search: r.probe?.generatorResults });
  const completed = results.every((r) => r.executionStatus === "COMPLETE" && r.final && r.generatedPool);
  const a = measured.filter((r) => r.arm === "A-adapter"), b = measured.filter((r) => r.arm === "B");
  const repeatability = a.length === 3 && b.length === 3 && [a, b].every((rows) => rows.every((r) => signature(r) === signature(rows[0])));
  const parity = completed && signature(results[0]) === signature(a[0]) && signature(results[1]) === signature(b[0]);
  const isolation = b.every((r) => r.probe?.generatorCalls === 1 && r.probe.legacyGeneratorCalls === 0 &&
    r.probe.legacyMonotypeCalls === 0 && r.probe.legacyPackingDuringB === 0);
  const rounds40 = a.every((r) => r.probe?.rounds?.length === 1 && r.probe.rounds[0] === 40 && r.probe.legacyMonotypeCalls === 1);
  const phaseAccounting = measured.every((r) => {
    const m = r.measurement;
    return m && [m.patternGenCPU, m.materializationCPU, m.masterCPU, m.totalCPU, m.otherCPU].every((v) => Number.isFinite(v) && v >= 0) &&
      m.totalCPU === m.patternGenCPU + m.materializationCPU + m.masterCPU + m.otherCPU;
  });
  const comparable = completed && repeatability && parity && isolation && rounds40 && phaseAccounting;
  const pairs = [1, 2, 3].map((repeat) => {
    const A = measured.find((r) => r.jobId === `a-${repeat}`), B = measured.find((r) => r.jobId === `b-${repeat}`);
    const q1 = A?.q1 === "PASS" && B?.q1 === "PASS";
    const qualityKnown = A?.final && B?.final;
    const regression = qualityKnown && (B.final.boardCount > A.final.boardCount ||
      (B.final.boardCount === A.final.boardCount && compararCalidad(B.final.remnant, A.final.remnant) < 0));
    // A Q1 failure cannot hide an observed board/remnant regression. Conversely,
    // a quality PASS needs valid output; the independent Q1 failure is retained.
    const q2 = regression ? "FAIL" : !q1 || !qualityKnown ? "INCONCLUSIVE" : "PASS";
    return { repeat, order: manifest.policy.orderByRepetition[repeat - 1], q1: q1 ? "PASS" : "FAIL", q2,
      observedQualityRegression: Boolean(regression),
      A: { boards: A?.final?.boardCount, remnant: A?.final?.remnant, measurement: A?.measurement },
      B: { boards: B?.final?.boardCount, remnant: B?.final?.remnant, measurement: B?.measurement,
        generator: B?.probe?.generatorResults } };
  });
  const cpu = {};
  if (comparable) for (const field of ["patternGenCPU", "materializationCPU", "masterCPU", "totalCPU", "poolProductionCPU", "otherCPU"]) {
    const av = a.map((r) => r.measurement[field]), bv = b.map((r) => r.measurement[field]);
    const A = av.reduce((s, v) => s + v, 0), B = bv.reduce((s, v) => s + v, 0);
    cpu[field] = { unit: "CPU us", totalA: A, totalB: B, medianA: median(av), medianB: median(bv),
      savingPct: A > 0 ? 100 * (A - B) / A : null, deltaBminusA: B - A,
      pairedSavingPct: av.map((v, i) => v > 0 ? 100 * (v - bv[i]) / v : null) };
  }
  return { schemaVersion: 1, scope: "4057401 bounded cost pilot only", comparisonValid: comparable,
    completed, parity, repeatability, isolation, rounds40, phaseAccounting,
    q1: results.every((r) => r.q1 === "PASS") ? "PASS" : "FAIL",
    q2: pairs.some((p) => p.q2 === "FAIL") ? "FAIL" : pairs.every((p) => p.q2 === "PASS") ? "PASS" : "INCONCLUSIVE",
    q3: { status: comparable ? "MEASURED" : "INCONCLUSIVE", cpu,
      note: "Positive savingPct means less CPU. PoolProductionCPU includes B materialization and A fused physical construction; no performance promotion threshold." },
    policy: manifest.policy, inputBinding: manifest.source, pairs,
    statuses: results.map((r) => ({ jobId: r.jobId, executionStatus: r.executionStatus, q1: r.q1,
      generator: r.probe?.generatorResults?.map((g) => ({ status: g.status, restrictions: g.restrictionReasons, telemetry: g.telemetry })), failures: r.failures })),
    peakMemory: measured.map((r) => ({ jobId: r.jobId, ...r.measurement?.peakMemory })),
    stop: "No further order or budget configuration authorized in this pilot." };
}
