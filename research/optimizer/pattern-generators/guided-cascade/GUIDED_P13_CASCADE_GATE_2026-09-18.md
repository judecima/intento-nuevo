# Guided Pattern Cascade — checkpoint 2026-09-18

Status: **RESEARCH-ONLY / NOT PRODUCTION-PROMOTED**

Base: `experiment/optimizer-oneboard-baseline-reuse` at
`5ecd298069241acd824033ca966aff968ab8d8dd`.

## 1. Safe reuse between baseline / compactation / MultiSlice

The repeated immutable preparation in `motor.cjs::optimizar()` was measured before introducing a shared `PreparedOrder` abstraction.

Measured block:

- quantity expansion to physical pieces;
- `medidaCorte`;
- orientations;
- equivalence signature `_sig`;
- initial board-fit validation;
- deterministic search-config construction.

Historical hotspot cohort: 213 cases.

Wall time per preparation:

| metric | time |
|---|---:|
| mean | 0.03681 ms |
| p50 | 0.02696 ms |
| p95 | **0.08090 ms** |
| p99 | **0.37507 ms** |
| max | 0.41754 ms |

CPU:

| metric | time |
|---|---:|
| mean | 0.03813 ms |
| p50 | 0.02707 ms |
| p95 | **0.08521 ms** |
| p99 | **0.41050 ms** |
| max | 0.47245 ms |

Even the largest measured order (2,439 physical pieces) spent only about 0.42 ms in this preparation.

**Decision: REJECT shared PreparedOrder as a performance optimization.**
The repeated immutable preparation is not a meaningful contributor to p95/p99.
Baseline, compactation and MultiSlice must continue to have independent mutable
search state; sharing that state would add semantic risk for negligible latency value.

## 2. Local family-fit pruning inside `elegir()`

The current kernel already:

- groups equal geometry/grain pieces by `_sig`;
- examines one representative per signature;
- rejects orientations that do not fit the current remaining/perpendicular dimensions;
- only tries 2–3 identical-piece grouping when it opens an otherwise unavailable span.

A research-only exact prune cached signatures that can no longer fit a shrinking
region. An optimized implementation used `Uint8Array` indexed by `_sig`.

Real OneBoard-active cohort: 189 cases.

Correctness:

- exact output parity: **189/189**;
- zero board-count regressions.

Performance candidate vs control:

- aggregate wall: **1.89% slower**;
- aggregate CPU: **3.37% slower**;
- wall p95: ~2.46% better;
- wall p99: **~4.39% worse**;
- wall wins/losses: 81 / 108;
- CPU wins/losses: 77 / 112.

**Decision: REJECT.**
Skipping later scans is exact, but the scan itself is not the dominant cost and
the bookkeeping overhead loses overall.

## 3. Where the real cost is

Historical V10 evidence contains **323 unique real orders where Pattern Master ran**.

Pre-Master board gap to the lower bound:

| gap | cases |
|---:|---:|
| +1 | **293** |
| +2 | 19 |
| +3 | 4 |
| +4 | 2 |
| +5 | 3 |
| +6 | 1 |
| +43 | 1 |

Therefore **293/323 = 90.7%** of Master-active orders reach Master exactly one
board above the lower bound.

Of those +1 cases, 271 have <=160 physical pieces.

Historical Pattern Master generation + monotype latency for the +1 cohort:

- p50: **8,399 ms**
- p95: **56,452 ms**
- p99: **85,047 ms**
- max: **88,148 ms**

This is the high-value target.

## 4. Guided-cascade interpretation

A literal rule that forces the guide piece to be the first physical placement was
tested and rejected: it removed useful diversity and regressed known sentinels.

The useful interpretation is:

> Use a guide/family signal to choose a very small physical pattern portfolio.
> Only expand to broader generation if that portfolio cannot certify the board
> lower bound.

The cascade is:

```text
pre-Master incumbent
        |
        +-- gap != 1 ------------------------------> existing generator fallback
        |
        +-- gap == 1
              |
              +-- industrial guide/family portfolio
              |       |
              |       +-- valid physical plan == LB --> CERTIFIED / stop
              |
              +-- frozen P13 portfolio (13 contexts)
                      |
                      +-- valid physical plan == LB --> CERTIFIED / stop
                      |
                      +-------------------------------> existing generator fallback
```

Monotype patterns are invariant between the guide and P13 stages and are
generated once, then reused by both solves.

## 5. Why the early return is safe

The cascade may return only when all of the following are true:

1. the coverage result uses exactly the valid lower-bound number of boards;
2. the selected patterns are materialized into physical boards;
3. the complete plan passes the existing industrial validator.

At that point the primary objective (minimum number of boards) is certified.
The optimizer objective explicitly does not permit retaining an additional board
to obtain a better remnant, so an incumbent with LB+1 boards cannot beat a
validated LB-board plan.

Any non-certified candidate is ignored and the exact existing generator remains
the fallback.

No heuristic result from Guide/P13 is accepted merely because it is faster or
looks promising.

## 6. Sentinel evidence

Local JS generation-stage measurements from the frozen current constructor:

| order | pre-Master | LB | guided result | generation evidence |
|---|---:|---:|---|---:|
| 4056900 | 7 | 6 | Guide -> 6 | ~88 ms guide vs ~9,310 ms legacy |
| 4057401 | 5 | 4 | Guide -> 4 | ~11 ms guide vs ~2,638 ms legacy |
| 4050594 | 8 | 7 | Guide miss -> P13 -> 7 | ~2,253 ms cascade vs ~10,682 ms legacy |
| 4059200 | 18 | 13 | gap>1 -> fallback | zero cascade generation work |

For 4050594 the estimate above is ~142 ms guide probe + ~2,111 ms P13 generation.

P13 alone is intentionally not universal: it does not recover 4057401, which is
why Guide precedes P13 rather than replacing it.

The fifth historical Master winner, 4058501, remains a mandatory fallback/real
corpus sentinel. It is not used here as proof of Order-family generalization.

## 7. Previously published supporting evidence

The frozen P13 portfolio is exactly:

`0, 7, 11, 12, 14, 15, 16, 17, 18, 19, 21, 26, 35`

Prior direct HIGH_DENSITY research compared it with Rescue28 over 332 unique
inputs:

- 332/332 equal board count;
- 0 P13 regressions;
- generation CPU p50: 696 ms vs 1,448 ms;
- p95: 5,179 ms vs 10,242 ms;
- p99: 23,828 ms vs 24,811 ms;
- aggregate Master node volume ~22.8% lower.

That evidence is supporting research, not a substitute for the new end-to-end
fallback-safe gate.

## 8. Promotion boundary

This checkpoint does **not** connect the cascade to `src/lib/optimizer/**`.

Required before production integration:

1. current-source tests on the three +1 Master winners;
2. zero-work routing test for gap>1;
3. full 323 Master-active paired replay against the frozen current generator;
4. zero invalid plans and zero board-count regressions;
5. equal-or-better final remnant whenever final board count is equal;
6. p50/p95/p99 generation and Full Optimize latency;
7. explicit fallback-rate measurement;
8. repeat with the current Rust-worker candidate before changing production routing.

Only after those gates should the cascade be considered for worker integration.
