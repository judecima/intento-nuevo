# Safe Performance Stack — 2026-09-18

## Status

**PASS / experimental integration candidate.**

Base worker:
`425ebba5de48eb0105d5cb46b08594b3dc50ff49`

This branch combines only two independently defended optimizations:

1. OneBoard reuses the V10 baseline instead of recomputing `optimizar()`.
2. A safe cheap lower bound runs immediately before Pattern Master and skips it
   only when the current physical incumbent is mathematically certified optimal
   in board count.

Guide-Core, Progressive Master, family-fit pruning and unique-mask research are
not part of this stack.

## OneBoard reuse evidence

Real OneBoard-active cohort: 189 orders.

- physical parity: 189/189
- Industrial V3: 189/189
- board regressions: 0
- wall p50: 187.0 -> 12.7 ms
- wall p95: 743.3 -> 80.2 ms
- wall p99: 837.8 -> 110.7 ms
- aggregate OneBoard wall reduction: 91.8%

## Pre-Master cheap-LB evidence

Current physical Master-active cohort: 323 real XML orders.

- parser piece-count parity: 323/323
- area-LB parity: 323/323
- certified before Master: 97/323
- historical Master winners skipped: 0/4
- lower-bound CPU p50: 0.399 ms
- p95: 5.891 ms
- p99: 12.763 ms

Projected historical Pattern-Master generation:

- p50: 9.433 s -> 5.113 s
- p90: 49.173 s -> 39.862 s
- p95: 64.351 s -> 59.535 s
- p99: unchanged at about 120.513 s
- aggregate generation reduction: 17.27%

The p99 remains a separate pattern-generation problem.

## Safety argument

### OneBoard

The supplied V10 baseline is the same baseline OneBoard previously recomputed.
Direct callers retain the old fallback recomputation.

### Pre-Master LB

The certificate runs only after baseline, compactation, MultiSlice and OneBoard.
At this point the remaining Pattern Master path only replaces the incumbent
when it uses fewer boards. If a valid lower bound equals the incumbent, fewer
boards are impossible, so returning the existing physical plan cannot lose a
same-board remnant improvement that the current Master would have accepted.

## CI

Safe-stack workflow:
`35395242330`

Passed:
- Rust cargo tests
- native addon build
- OneBoard reuse contract
- pre-Master LB contract
- TypeScript typecheck
- full npm test suite

## Promotion boundary

This branch is an integration candidate, not a production merge.

Before promotion:
1. replay the full worker/sentinel gate from this exact branch;
2. preserve 4050594=7, 4056900=6, 4057401=4, 4059200=17;
3. zero industrial invalids;
4. zero board/remnant regressions;
5. keep pre-Master LB opt-in until the full replay is closed.
