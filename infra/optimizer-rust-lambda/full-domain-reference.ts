import { readFile } from "node:fs/promises";

import { optimizeProject } from "../../src/lib/optimizer/engine/legacy-engine";
import type { OptimizationInput } from "../../src/lib/optimizer/types";
import {
  createRustCertificationDiagnostics,
  fullOptimizeContractSummary,
} from "./full-optimize-contract";

const fixturePaths = process.argv.slice(2);
if (fixturePaths.length === 0) throw new Error("Pass at least one canonical fixture path");

const requireRust = process.env.FULL_OPTIMIZE_REQUIRE_RUST !== "0";
const results = [];
const failures = [];

function orderFromFixture(fixturePath: string, input: OptimizationInput): string {
  if (input.projectId) return String(input.projectId);
  const match = /(?:^|[/\\])(\d{7})(?:\.json)?$/.exec(fixturePath);
  if (!match) throw new Error(`CANNOT_RESOLVE_ORDER:${fixturePath}`);
  return match[1];
}

for (const fixturePath of fixturePaths) {
  const input = JSON.parse(await readFile(fixturePath, "utf8")) as OptimizationInput;
  const diagnostics = createRustCertificationDiagnostics();

  try {
    const result = optimizeProject(input, {
      patternGenerator: "rust",
      bypassCache: true,
      rustCertification: requireRust,
      diagnostics,
    });

    if (result.metrics.cacheHit === true) throw new Error(`CACHE_HIT:${fixturePath}`);
    if (!result.validation.ok) throw new Error(`INVALID_RESULT:${fixturePath}`);

    const { result: _normalizedResult, ...summary } = fullOptimizeContractSummary(result, diagnostics);
    results.push({
      fixturePath,
      order: orderFromFixture(fixturePath, input),
      certificationRequired: requireRust,
      ...summary,
    });
  } catch (error) {
    failures.push({
      fixturePath,
      order: orderFromFixture(fixturePath, input),
      certificationRequired: requireRust,
      diagnostics,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

const output = { ok: failures.length === 0, requireRust, results, failures };
process.stdout.write(JSON.stringify(output, null, 2) + "\n");
if (failures.length > 0) {
  console.error(JSON.stringify({ fullOptimizeDomainFailures: failures }, null, 2));
  process.exit(1);
}
