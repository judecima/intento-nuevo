// A repeatability fixture process, not an A/B harness or corpus runner.
import { generatePatterns } from "./and-or.mjs";
import { H2_FIXTURES, H2_LIMITS } from "./h2-fixtures.mjs";
const results = [[4, 2, H2_LIMITS], [3, 1, H2_LIMITS], [3, 2, { ...H2_LIMITS, maxExpansions: 5 }]].map(([index, k, budget]) => {
  const result = generatePatterns(H2_FIXTURES[index].context, budget, { maxVariantsPerUsageVector: k });
  return { fixture: H2_FIXTURES[index].name, status: result.status, rootHash: result.rootHash,
    patternPoolHash: result.patternPoolHash, orderedPoolHash: result.orderedPoolHash,
    provenance: result.provenance, telemetry: result.telemetry };
});
process.stdout.write(JSON.stringify(results));
