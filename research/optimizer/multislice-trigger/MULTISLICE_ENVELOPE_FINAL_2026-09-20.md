# MultiSlice Envelope — Final Holdout Gate

Date: 2026-09-20

## Decision

**PROMOTE to Performance V1 candidate.**

The MultiSlice support envelope is frozen as:

```text
200 <= total pieces <= 500
```

No additional threshold tuning is authorized by this result.

## Baseline

Performance V1 checkpoint:

```text
checkpoint/optimizer-performance-v1-20260919
0a21b7ce52610492e1fd3d397f77649cfa012bf5
```

Final candidate gate branch:

```text
candidate/multislice-envelope-final-gate-20260920
```

Workflow:

```text
Optimizer MultiSlice Envelope Final Holdout
run 35538530714
```

## Final holdout cohort

Historical future window:

```text
indices 1600..1999
400 cases
```

Canonical matching is fail-closed:

```text
order/file + exact historical piece count
```

Results:

- historical holdout: 400
- exact matched: 357
- unmatched: 43
- exact coverage: 89.25%
- candidate skips MultiSlice: 353
- candidate keeps MultiSlice: 4

The 43 unmatched cases are excluded rather than guessed.

## Quality gate

Across all 357 exact-matched cases:

- invalid plans: **0**
- board regressions: **0**
- remnant regressions: **0**
- physical digest differences: **0**

Therefore the candidate produced exactly the same physical plans on the entire executable holdout.

## End-to-end performance

| Metric | Control | Envelope 200–500 | Improvement |
|---|---:|---:|---:|
| total CPU | 853,752.62 ms | 690,081.41 ms | **19.17%** |
| average | 2,391.46 ms | 1,933.00 ms | **19.17%** |
| p50 | 281.50 ms | 276.30 ms | **1.85%** |
| p90 | 4,094.68 ms | 3,287.52 ms | **19.71%** |
| p95 | 15,199.33 ms | 10,719.99 ms | **29.47%** |
| p99 | 38,000.92 ms | 27,741.26 ms | **27.00%** |
| max | 58,114.36 ms | 44,700.96 ms | **23.08%** |

MultiSlice stage:

- control CPU: 188,701 ms
- candidate CPU: 24,957 ms
- activations: 36 → 3
- observed wins in this holdout: 0 → 0

## Tail examples

- 4059795 / 950 pieces: 58.11 s → 27.57 s (**-52.56%**), 63 boards unchanged
- 4061546 / 109 pieces: 44.03 s → 30.87 s (**-29.90%**)
- 4061468 / 98 pieces: 38.08 s → 25.83 s (**-32.17%**)
- 4061518 / 105 pieces: 37.94 s → 26.49 s (**-30.19%**)
- 4060810 / 96 pieces: 31.95 s → 21.32 s (**-33.26%**)
- 4059306 / 56 pieces: 15.29 s → 8.80 s (**-42.44%**)

## Historical MultiSlice win protection

Frozen hotspot evidence contains four MultiSlice wins:

- 4055118 — 238 pieces
- 4052458 — 293 pieces
- 4057583 — 448 pieces
- 4060345 — 241 pieces

All four lie inside the 200–500 envelope.

The broad hotspot rerun covered 92/130 historical MultiSlice-active cases exactly and showed:

- invalid: 0
- board regressions: 0
- remnant regressions: 0
- digest differences: 0
- total CPU: -26.91%
- p95: -19.80%
- p99: -43.45%
- max: -56.68%

Two of the four historical wins are exact-rerunnable in the current canonical corpus and remained physically identical. The other two cannot be mapped exactly from historical file-level piece counts to the current per-material canonical case representation, and are therefore protected by frozen historical evidence rather than guessed mappings.

## Closed alternatives

The following MultiSlice performance lines are closed:

- MultiSlice OFF globally — rejected because historical wins exist
- baseline → MultiSlice unbounded packing reuse — safe but no performance gain
- bounded packing reuse — safe but no material p95/p99 gain
- min-only threshold >=200 — safe but insufficient p95/p99 improvement

The support envelope 200–500 is the promoted candidate.

## Next milestone

Integrate the frozen envelope behind an explicit Performance V1 feature flag, then combine it with the already validated Performance V1 components.

Do not reopen MultiSlice threshold research unless new correctness evidence invalidates this gate.
