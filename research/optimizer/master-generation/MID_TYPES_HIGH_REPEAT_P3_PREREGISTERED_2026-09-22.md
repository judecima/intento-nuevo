# Mid-Type High-Repeat P3 Rule — Pre-registered Candidate

Date: 2026-09-22

## Fixed rule

Apply P3 instead of Full40 when all conditions hold:

- Master is active
- typeCount >= 20
- typeCount <= 40
- pieces / typeCount >= 4

This threshold is now frozen for future out-of-sample validation.

## Current-corpus result

Cohort:
- cases: 124
- historical Full40 wins: 0
- non-wins: 124

P3 vs Full40:
- equal board count: 124 / 124
- P3 worse: 0
- P3 better: 0
- parity failures: 0

CPU inside this cohort:
- P3 total: 235,172.064 ms
- Full40 total: 1,538,772.748 ms
- saving: 84.7169%

Latency distribution:
- p50: 788.862 ms vs 14,312.527 ms
- p95: 8,166.793 ms vs 21,212.597 ms
- p99: 12,558.173 ms vs 23,028.010 ms

## Interpretation

This is strong technical evidence that P3 reproduces Full40 on the observed no-win cohort and saves substantial CPU.

It is NOT evidence that a future Full40 win in this region would also be found by P3, because this cohort contains zero historical Full40 wins.

Status:
- technically validated on current corpus
- pre-registered for future holdout
- not promoted as a generalized production rule yet
