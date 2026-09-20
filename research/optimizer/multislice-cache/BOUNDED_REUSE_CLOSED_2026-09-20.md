# Baseline → MultiSlice bounded reuse — CLOSED / REJECTED

Date: 2026-09-20
Branch: research/multislice-cache-reuse-20260920
Run: 35527092193

## Candidate

Request-local exact packing memo shared from baseline to MultiSlice.

- cache key V2 mandatory
- only deterministic packings
- minimum remaining pool: 40 pieces
- maximum retained entries: 512
- no sharing with compactation or Master
- AB/BA order alternated by case
- 4 CI shards
- 20 exact p99 cases + 2 exact historical MultiSlice wins

## Result

Quality:

- invalid: 0
- digest differences: 0
- board regressions: 0
- remnant regressions: 0

Latency:

| metric | control | reuse | improvement |
| --- | ---: | ---: | ---: |
| total | 688,768 ms | 687,967 ms | 0.12% |
| p50 | 30,388 ms | 29,845 ms | 1.79% |
| p90 | 46,039 ms | 49,612 ms | -7.76% |
| p95 | 52,654 ms | 52,051 ms | 1.15% |
| p99 | 69,068 ms | 69,043 ms | 0.04% |
| max | 73,343 ms | 73,533 ms | -0.26% |

Reuse telemetry:

- exact shared hits: 9,914
- retained entries total across cases: 9,772
- MultiSlice control: 208,203 ms
- MultiSlice reuse: 209,189 ms

## Decision

REJECT for promotion.

The reuse is semantically safe in this cohort, but it does not materially reduce the tail. Bounding the memo removes the large regression of the unlimited version, but the remaining benefit is effectively noise and p90 worsens.

Do not spend another iteration tuning memo capacity/minPool unless new profiling evidence shows a materially cheaper representation.

## Next priority

Promote the packing cache-key audit to a larger cohort:

legacy key vs V2 key vs no-cache.

V2 currently matched no-cache 16/16 on cache-active tails while legacy differed physically in 2 cases and V2 improved p95/p99. That is a correctness candidate with performance upside and deserves the next gate.
