# MultiSlice support envelope 200–500 — CLOSED

Date: 2026-09-20

## Decision

**ACCEPT as Performance V1 candidate.**

Run MultiSlice only when the expected piece count is between **200 and 500 inclusive**.

No more threshold tuning is authorized for this line.

## Reference

Baseline checkpoint:

`checkpoint/optimizer-performance-v1-20260919`

`0a21b7ce52610492e1fd3d397f77649cfa012bf5`

Candidate branch:

`research/multislice-envelope-broad-20260920`

Broad validation workflow:

`Optimizer MultiSlice Envelope Broad Hotspots`

Run:

`35537817033`

## Historical rationale

Historical hotspot corpus:

- MultiSlice activations: 130
- activations inside 200–500: 20
- activations outside 200–500: 110 (84.62%)
- historical MultiSlice CPU: 2,050,290 ms
- CPU outside 200–500: 1,815,612 ms (88.55%)
- known MultiSlice wins: 4
- wins inside 200–500: 4/4
- wins outside 200–500: 0

Known wins:

- 4055118 — 238 pieces
- 4052458 — 293 pieces
- 4057583 — 448 pieces
- 4060345 — 241 pieces

## Directed 22-case gate

The final fixed envelope was first validated on the exact p99/sentinel cohort.

Result:

- total CPU: -23.5%
- p50: -23.6%
- p90: -21.3%
- p95: -16.8%
- p99: -40.4%
- max: -44.5%
- invalid: 0
- board regressions: 0
- remnant regressions: 0
- physical digest differences: 0
- known historical wins preserved by the envelope: 4/4

## Broad hotspot gate

Historical MultiSlice-active cases: 130.

Exact canonical mapping using order/file + exact piece count:

- exact matched: 92
- unmatched/fail-closed: 38
- coverage: 70.77%
- candidate skips MultiSlice on 80/92 mapped cases
- candidate keeps MultiSlice on 12/92 mapped cases

### Latency

| Metric | Control | Candidate | Improvement |
|---|---:|---:|---:|
| total | 1,901,645.84 ms | 1,389,849.16 ms | **26.91%** |
| avg | 20,670.06 ms | 15,107.06 ms | **26.91%** |
| p50 | 18,002.11 ms | 12,961.74 ms | **28.00%** |
| p90 | 33,016.72 ms | 26,727.12 ms | **19.05%** |
| p95 | 38,663.03 ms | 31,006.35 ms | **19.80%** |
| p99 | 84,283.63 ms | 47,664.26 ms | **43.45%** |
| max | 248,043.07 ms | 107,448.25 ms | **56.68%** |

### Quality

- invalid: 0
- physical digest differences: 0
- board regressions: 0
- remnant regressions: 0

### MultiSlice work

- control MultiSlice CPU: 568,809 ms
- candidate MultiSlice CPU: 56,172 ms
- control activations: 70
- candidate activations: 10
- control wins observed in the exact-matched rerun: 2
- candidate wins observed: 2

The other two known historical wins are among the 38 cases that cannot be exactly reconstructed from the current canonical corpus because the historical XML-level piece count differs from the available canonical material entry. They remain protected by the fixed 200–500 envelope and by the frozen historical evidence; they were not silently remapped.

## Important extreme

4048571 — 2,439 pieces:

- control: 248,043 ms
- candidate: 107,448 ms
- speedup: 56.68%
- boards: 112 -> 112
- physical result unchanged
- MultiSlice: 137,297 ms -> 0

## Closed alternatives

Do not reopen without new evidence:

- MultiSlice OFF globally — rejected: historical wins exist.
- minimum-only threshold — safe but insufficient p95/p99 effect.
- Baseline -> MultiSlice full memo reuse — quality-safe but performance-negative.
- bounded memo reuse — negligible performance benefit.
- further tuning of 180/220/250/etc. — explicitly out of scope.

## Next milestone

**Pattern Master / generarPatrones tail reduction.**

Constraints remain:

- never lose a board;
- preserve remnant quality;
- physical validation required;
- do not globally reduce Master from 40 to 20 rounds;
- do not disable Master;
- 4058501 and 4059776 remain anti-regression sentinels.

The next experiment must target Master pattern generation cost directly and must not reopen MultiSlice routing.
