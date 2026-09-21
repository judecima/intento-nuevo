# Master 40 native whole-greedy plan — CLOSED candidate

Date: 2026-09-21

## Decision

**ACCEPT as a Performance V1 candidate.**

Keep all 40 Master rounds.

For large orders (`pieces > maxPiezasBeam`), execute the complete greedy plan for each pass × stage trial inside one Rust call instead of crossing JS <-> Rust once per board.

The selector semantics are preserved:
- same configs;
- same config IDs;
- same restart count;
- same seed function;
- same tolerance;
- same per-board greedy selection;
- same pass and stage schedule.

## Architecture change

Before:

JS -> Rust board 1 -> JS -> Rust board 2 -> JS -> ... for every greedy plan trial.

Candidate:

JS -> Rust complete greedy plan -> JS.

## Directed gate

Workflow: 35549832621

40 rounds in both arms. Rank Cache + Lean Beam enabled in both arms.

- 4048571: 29,917.36 -> 21,346.90 ms = **-28.65%**
- 4059795: 10,373.98 -> 8,100.34 ms = **-21.92%**
- 4059352: 7,331.70 -> 6,570.14 ms = **-10.39%**
- aggregate: **-24.37%**
- pool parity: **3/3**

## Broad generation gate

Workflow: 35550011925

Cohort:
- historical Master-active: 129
- exact canonical matched: 91
- selected large Master tails: 30
- rounds: 40

Correctness:
- pool parity failures: **0/30**

Generation latency:
- total: 250,930.89 -> 231,278.10 ms = **-7.83%**
- p50: 7,157.44 -> 7,134.28 ms = **-0.32%**
- p95: 13,160.23 -> 12,547.34 ms = **-4.66%**
- p99: 29,871.50 -> 21,863.10 ms = **-26.81%**

The benefit is concentrated in genuinely large greedy orders:
- 4048571: **-30.65%**
- 4059795: **-22.89%**
- 4053522 (518 pieces): **-27.83%**
- 4059352 (430 pieces): **-10.29%**

Near the Beam threshold, the effect is neutral/noise. The implementation is therefore intentionally gated to `pieces > maxPiezasBeam`.

## End-to-end V10 gate

Workflow: 35550218501

Configuration:
- full V10;
- 40 Master rounds;
- packing cache disabled;
- MultiSlice envelope 200-500;
- Rank Cache enabled in both arms;
- Lean Beam enabled in both arms;
- native whole-greedy plan only in candidate.

Correctness:
- invalid: **0**
- digest differences: **0**
- board regressions: **0**
- remnant regressions: **0**

Latency:
- total: 517,099.31 -> 498,262.56 ms = **-3.64%**
- p50: 14,263.47 -> 13,794.77 ms = **-3.29%**
- p95: 39,114.04 -> 37,505.07 ms = **-4.11%**
- p99: 93,043.42 -> 85,254.56 ms = **-8.37%**

Master stage:
- 344,683 -> 326,823 ms = **-5.18%**
- activations: 24 -> 24

Extreme full-V10 cases:
- 4048571: 113,621.18 -> 102,774.92 ms = **-9.55%**, 112 -> 112 boards, same digest.
- 4059795: 34,775.93 -> 31,571.43 ms = **-9.21%**, 63 -> 63 boards, same digest.

## Closed precursor

Lean Greedy deferred materialization was safe but too small:
- directed aggregate: **-3.76%**.

Do not reopen it.

## Conclusion

The evidence now supports the architectural direction:

**Keep the 40 rounds, but keep hot optimizer state resident in Rust.**

Rank Cache, Lean Beam, and native whole-greedy all improve performance without reducing the search space.

The next major target should be the 40-round Master orchestration itself: move round scheduling + per-round pattern generation + pool dedup/update into one Rust-resident execution context, with JS receiving only the final pattern pool/metrics.

Do not spend another cycle micro-tuning JS/Rust boundary calls individually before attempting that consolidation.
