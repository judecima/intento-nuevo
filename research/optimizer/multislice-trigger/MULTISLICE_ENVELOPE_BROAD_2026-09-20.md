# MultiSlice Support Envelope — Broad Hotspot Gate

Date: 2026-09-20

## Candidate

Run MultiSlice only when:

```text
200 <= pieceCount <= 500
```

The threshold is intentionally frozen for this gate. No further threshold tuning is implied.

## Baseline

Performance V1 checkpoint:

```text
checkpoint/optimizer-performance-v1-20260919
0a21b7ce52610492e1fd3d397f77649cfa012bf5
```

Candidate branch:

```text
research/multislice-envelope-broad-20260920
```

Workflow run:

```text
35537817033
```

## Historical rationale

In `experiencia/v6/hotspot-all.jsonl`:

- MultiSlice active: 130 cases
- MultiSlice wins: 4
- win piece counts: 238, 293, 448, 241
- cases outside 200–500: 110/130 = 84.62%
- historical MultiSlice CPU outside 200–500: 1,815,612 ms
- total historical MultiSlice CPU: 2,050,290 ms
- outside-envelope share of MultiSlice CPU: 88.55%
- wins outside envelope: 0

Known wins:

- 4055118 — 238 pieces
- 4052458 — 293 pieces
- 4057583 — 448 pieces
- 4060345 — 241 pieces

## Broad exact-matching gate

The broad gate starts from all 130 historical MultiSlice-active hotspots.

Exact canonical matching rule:

```text
order/file + exact historical piece count
```

Ambiguous or non-matching entries fail closed and are not guessed.

Coverage:

- historical active: 130
- exact matched: 92
- unmatched: 38
- exact coverage: 70.77%
- candidate skips MultiSlice: 80/92
- candidate keeps MultiSlice: 12/92

Two historical wins are exactly re-runnable in the canonical corpus and both remain physically identical under the envelope:

- 4055118
- 4052458

The other two known wins are not exact-mappable from file-level historical counts to the per-material canonical corpus:

- 4057583: historical 448 pieces vs canonical 418
- 4060345: historical 241 pieces vs canonical 225

They remain protected by the frozen historical evidence because both counts remain inside 200–500.

## Quality

Across all 92 exact-matched cases:

- invalid plans: 0
- board regressions: 0
- remnant regressions: 0
- physical digest differences: 0

## Performance

| Metric | Control | Candidate | Improvement |
|---|---:|---:|---:|
| total | 1,901,645.84 ms | 1,389,849.16 ms | **26.91%** |
| average | 20,670.06 ms | 15,107.06 ms | **26.91%** |
| p50 | 18,002.11 ms | 12,961.74 ms | **28.00%** |
| p90 | 33,016.72 ms | 26,727.12 ms | **19.05%** |
| p95 | 38,663.03 ms | 31,006.35 ms | **19.80%** |
| p99 | 84,283.63 ms | 47,664.26 ms | **43.45%** |
| max | 248,043.07 ms | 107,448.25 ms | **56.68%** |

MultiSlice itself:

- control: 568,809 ms
- candidate: 56,172 ms
- active calls: 70 → 10
- observed wins: 2 → 2

## Decision

The 200–500 support envelope is **PROMOTED TO PERFORMANCE-V1 CANDIDATE**, not yet to stable/production.

Reason:

1. it preserves all four known historical wins by construction;
2. both exact-rerunnable wins preserve boards and physical digest;
3. broad exact-matched hotspots show zero quality regressions;
4. the effect is material at p95/p99 rather than only at average CPU.

## Remaining promotion gate

Run the same frozen candidate on a future/holdout cohort containing normal and tail cases, not only historical MultiSlice-active hotspots.

Acceptance:

- invalid = 0
- board regressions = 0
- remnant regressions = 0
- no unexpected physical digest changes caused by the routing rule
- material p95/p99 improvement on the full current cohort

If that passes, close MultiSlice performance research and include the envelope in the Performance V1 candidate.
