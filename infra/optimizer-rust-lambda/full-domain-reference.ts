import { readFile } from "node:fs/promises";

import { optimizeProject } from "../../src/lib/optimizer/engine/legacy-engine";
import type { OptimizationInput } from "../../src/lib/optimizer/types";
import {
  createRustCertificationDiagnostics,
  fullOptimizeContractSummary,
} from "./full-optimize-contract";

const fixturePaths = process.argv.slice(2);
if (fixturePaths.length === 0) throw new Error("Pass at least one canonical fixture path");

const results = [];
for (const fixturePath of fixturePaths) {
  const input = JSON.parse(await readFile(fixturePath, "utf8")) as OptimizationInput;
  const diagnostics = createRustCertificationDiagnostics();
  const result = optimizeProject(input, {
    patternGenerator: "rust",
    bypassCache: true,
    rustCertification: true,
    diagnostics,
  });

  if (result.metrics.cacheHit === true) throw new Error(`CACHE_HIT:${fixturePath}`);
  if (!result.validation.ok) throw new Error(`INVALID_RESULT:${fixturePath}`);

  results.push({
    fixturePath,
    order: input.projectId ?? fixturePath,
    ...fullOptimizeContractSummary(result, diagnostics),
  });
}

process.stdout.write(JSON.stringify({ ok: true, results }, null, 2) + "\n");
