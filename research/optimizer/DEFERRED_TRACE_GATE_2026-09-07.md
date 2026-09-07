# Deferred trace: gate failed before integration

Date: 2026-09-07. Candidate: `e133e7e8ec9ddb69701e74e8ddf4456dc80cad69`
from `experiencia/traza-diferida.bundle`. Reference Next runtime:
`1ea747b4674be7bbd0a6a374e1c0b0762903a972`.

## Decision

Do not merge this candidate. The known Master winner `4050594` has identical
board count and geometry, but all 103 final pieces lose their diagnostic traces.
The gate fails on this case; this is not a completed 213-case benchmark.
V20 and V22 were not advanced and production runtime was not changed.

## Reproduction

The bundle was verified with `git bundle verify` and cloned under
`test-results/traza-review`. No remote fetch or unsafe memoization was used.
After validation, that temporary clone was moved to
`node_modules/.cache/deferred-trace-review` so the application's broad TypeScript
include does not compile a second source tree. Reports retain the original run
paths. The bundle and full report remain intact.

```powershell
node scripts/deferred-trace-gate.mjs --candidate test-results/traza-review --case 4050594 --out test-results/deferred-trace-master-sentinel-r1
```

For a new run, use `--candidate node_modules/.cache/deferred-trace-review` and a
new output directory. The runner refuses to overwrite previous evidence.

Each variant runs through optimizeProject in its own fresh process. Staged and
post-baseline cheap-LB flags are OFF, other OPTIMIZER_* environment overrides are
removed, input and runtime file hashes are recorded. No cache hit occurred.
Host: Intel Core i5-1135G7, Node v22.21.1, Windows.

Local report: `test-results/deferred-trace-master-sentinel-r1/report.json`.
The same directory contains both full semantic plans and the shared input.
The full-plan hash includes geometry, physical cut trees, normalized traces and
quality metrics; it excludes runtime timing and internal trace representation.
It is this runner's version of the contract, not an assertion of compatibility
with unavailable prior 61-case artifacts.

| Metric | Reference | Candidate |
| --- | ---: | ---: |
| Boards | 7 | 7 |
| Placed / required pieces | 103 / 103 | 103 / 103 |
| Industrial + independent-slice validation | PASS | PASS |
| Pieces without traces | 0 | 103 |
| Diagnostic steps | 247 | 0 |
| Master gains / boards saved | 1 / 1 | 1 / 1 |
| Wall ms | 56,542.68 | 52,188.01 |
| CPU ms (user + system) | 78,578 | 75,391 |

Single-run timings are descriptive only. CPU may exceed wall time because the
runtime can use background threads. No general speedup claim follows from this
failed quality gate.

Identical geometry hash:
`2d6b453f68957d32b196c11871c633aab5a781c28f1e50a3b133c73050485050`.

Reference fullPlanHash:
`e858a3bfd89f69b7165954039f3f809752250712736316239f349d8fafbdcd42`.

Candidate fullPlanHash:
`31000c8485be53cd3ad5dce18da72b4eca4d812051d88d201a68d5e6bd5cabc5`.

## Cause

In the candidate, generarPatrones and patronesMonotipo explicitly pass
`trazaDiag: false` to optimizar. The resulting physical boards have no traces.
materializar copies placements from those boards into the selected solution and
does not regenerate the missing traces. legacy-engine resolves the absent links
to empty arrays. Therefore geometry/industrial validation can pass while the
trace contract fails. This is independent of how the time budget changes search.

The original five-case measurement observed no missing traces; it did not cover
this successful Master materialization. The later 61/61 results reported by the
user still need their exact source/input/configuration artifacts linked before
they can be reconciled with this reproduction.

Regression contract: `tests/optimizer/pattern-trace.test.ts`, covering mixed and
monotype generation followed by materialization. TRACE_CANDIDATE_ROOT selects an
isolated source tree for review; it is test-only and does not affect production.

Verification:

```powershell
npm test -- tests/optimizer/pattern-trace.test.ts
# Current runtime: 2/2 PASS.
$env:TRACE_CANDIDATE_ROOT='test-results/traza-review'
npm test -- tests/optimizer/pattern-trace.test.ts
# Isolated candidate: 2/2 FAIL, empty final traces in both generation paths.
```

For a new candidate test, use the relocated root
`node_modules/.cache/deferred-trace-review`.

Each command was run in a separate shell process; the candidate override is not
set in the application environment. `node --check scripts/deferred-trace-gate.mjs`
and `git diff --check` also passed. No full optimizer suite or 213-case performance
run was executed after this reproducible gate failure.

## Next candidate

Keep trace optimization first in the roadmap. Repair trace preservation before
spending the remaining full-cohort budget. A narrowly scoped option is linked
traces with trace generation retained for Master patterns; this does not carry
the original measured saving automatically. True deferred reconstruction must
preserve anchor/provisional/contraction information and references exactly;
repacking from geometry alone is not sufficient evidence of trace equivalence.

Any repaired candidate must pass this sentinel, the other required sentinels and
the complete 213-case gate before integration. Clock-sensitive differences remain
explicit failures to investigate, not automatically accepted exceptions.
