// Synthetic integration fixtures; these budgets are not a scored corpus policy.
export const input = (active = true) => ({
  board: { width: 10, height: 10 }, material: { description: "H3", hasGrain: false },
  kerf: 0, trim: { x: 0, y: 0 }, strategy: "v10",
  constraints: { profile: "balanced", stages: 2, minRemnant: 0.1,
    allowOneBoard: false, allowMultiSlice: false, allowDeadStripCompaction: false },
  pieces: [{ reference: "A", width: active ? 6 : 5, height: active ? 6 : 5, quantity: active ? 3 : 4 }],
});
export function job(id, arm, mode = "end-to-end", extra = {}) {
  return { id, arm, mode, input: input(), watchdogMs: 30000,
    ...(arm === "B" ? { generatorBudget: { maxExpansions: 200000, maxAndCombinations: 500000,
      maxFrontierEntries: 100000, maxMaterializations: 10000 }, maxVariantsPerUsageVector: 32 } : {}), ...extra };
}
export function h3Manifest() {
  const jobs = [];
  for (let repeat = 1; repeat <= 3; repeat++) {
    for (const arm of repeat === 2 ? ["B", "A-adapter", "A-direct"] : ["A-direct", "A-adapter", "B"]) {
      jobs.push(job(`${arm.toLowerCase()}-${repeat}`, arm));
      jobs.push(job(`${arm.toLowerCase()}-gen-${repeat}`, arm, "generation-only"));
    }
  }
  for (const arm of ["A-direct", "A-adapter", "B"]) jobs.push(job(`${arm.toLowerCase()}-inactive`, arm, "end-to-end", { input: input(false) }));
  const limited = job("b-work-limit", "B", "generation-only");
  limited.generatorBudget.maxExpansions = 1;
  jobs.push(limited);
  for (const fault of ["throw-generator", "invalid-pattern", "late-load", "crash", "hang"]) {
    jobs.push(job(`control-${fault}`, "B", "end-to-end", { fault, control: fault, watchdogMs: fault === "hang" ? 1500 : 30000 }));
  }
  return { schemaVersion: 1, mode: "h3", experimentVersion: "h3-integration-v1", jobs };
}
