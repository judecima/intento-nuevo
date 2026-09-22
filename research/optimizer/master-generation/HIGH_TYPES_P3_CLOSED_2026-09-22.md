# High-Types P3 Industrial Rule — Closed Candidate

Date: 2026-09-22

## Rule

When Master is active and `typeCount > 40`, use only the first 3 production rounds instead of Full40.

The rule is guarded by the experimental flag:

`OPTIMIZER_MASTER_HIGH_TYPES_P3_EXPERIMENTAL=1`

Default behavior remains unchanged when the flag is off.

## Discovery cohort

Master-active cases with `typeCount > 40`:

- cases: 405
- historical Master wins: 4
- P3 worse than Full40: 0
- P3 equal to Full40: 404
- P3 better than Full40: 1 (`4039132`, 16 -> 15)
- Master CPU saving inside this cohort: 85.91%

`4039132` was repeated 5 times:

- P3: 15 boards, 26 solver nodes
- Full40: 16 boards, 1,600,000 solver nodes
- reproduced: 5/5

## Blind validation

Previously excluded cases with more than 500 pieces:

- over500: 49
- over500 and typeCount > 40: 33
- Master-active: 28
- P3 worse than Full40: 0
- P3 equal to Full40: 28
- P3 better than Full40: 0
- CPU saving: 45.84%

## Full-corpus E2E benchmark

Valid cases: 20,841

Affected by the rule: 1,118

Primary objective:
- losses: 0
- equal boards: 1,117
- gains: 1 (`4039132`, 16 -> 15)

Equal-board quality:
- differences: 0

CPU:
- baseline total: 43,296,265 ms
- candidate total: 38,489,765 ms
- saving: 11.10%
- p50: 447.5 -> 447.5 ms
- p95: 10,678.1 -> 8,479.6 ms
- p99: 24,939.1 -> 20,867.4 ms

Wall time:
- baseline total: 33,480,379 ms
- candidate total: 28,736,941 ms
- saving: 14.17%

Master:
- baseline: 11,196,101 ms
- candidate: 6,440,251 ms
- saving: 42.48%

## Status

Accepted as a performance candidate.

No production deployment was performed.
