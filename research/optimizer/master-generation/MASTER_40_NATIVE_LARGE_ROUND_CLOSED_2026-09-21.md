# Master 40 native large-round orchestration — CLOSED candidate

Date: 2026-09-21

## Decision

ACCEPT as a safe incremental Performance V1 candidate, but STOP micro-optimizing this layer.

All 40 Master rounds remain intact.

This change moves the large-order pass × stage-depth orchestration and final plan selection into one Rust call, on top of:
- native rank cache;
- Lean Beam;
- native whole-greedy plan.

It is enabled only on the large greedy path (pieces > maxPiezasBeam).

## Directed gate

Workflow: 35551564167

40 rounds in both arms.

- 4048571: 20,582.67 -> 17,833.71 ms = -13.36%
- 4059795: 7,679.04 -> 6,758.73 ms = -11.98%
- 4059352: 6,041.79 -> 5,641.02 ms = -6.63%
- aggregate: -11.86%
- pool parity: 3/3

## Broad generation gate

Workflow: 35551733933

Cohort:
- historical Master-active: 129
- exact canonical matched: 91
- selected large tails: 30
- rounds: 40

Correctness:
- pool parity failures: 0/30

Generation latency:
- total: 227,854.54 -> 221,374.68 ms = -2.84%
- p50: 6,763.12 -> 6,753.10 ms = -0.15%
- p95: 12,852.18 -> 12,889.66 ms = +0.29% (noise/slower)
- p99: 21,810.31 -> 19,421.57 ms = -10.95%

Representative large cases:
- 4048571: -13.34%
- 4059795: -12.14%
- 4059352: -6.54%
- 4053522: -15.83%

Near the Beam threshold, effect is neutral/noise.

## End-to-end V10 gate

Workflow: 35551930063

Configuration:
- full V10;
- 40 Master rounds;
- packing cache disabled;
- MultiSlice envelope 200-500;
- native rank cache enabled in both arms;
- Lean Beam enabled in both arms;
- native whole-greedy enabled in both arms;
- native large-round orchestration only in candidate.

Correctness:
- invalid: 0
- digest differences: 0
- board regressions: 0
- remnant regressions: 0

Latency:
- total: 480,238.40 -> 473,890.28 ms = -1.32%
- p50: 13,715.53 -> 13,431.27 ms = -2.07%
- p95: 34,423.44 -> 33,479.19 ms = -2.74%
- p99: 82,702.36 -> 81,163.50 ms = -1.86%

Master:
- 321,003 -> 314,712 ms = -1.96%
- activations: 24 -> 24

Extreme cases:
- 4048571: 99,624.06 -> 97,712.21 ms = -1.92%, 112 -> 112 boards, same digest
- 4059795: 26,051.32 -> 24,717.68 ms = -5.12%, 63 -> 63 boards, same digest

## Interpretation

This step is safe and useful, but diminishing returns are now obvious.

The architecture work has progressively reduced JS↔Rust crossings:
1. native rank cache;
2. Lean Beam;
3. native whole-greedy;
4. native large-round orchestration.

The remaining major boundary is no longer inside one plan trial. It is the 40-round Master scheduler itself.

## Next milestone

Do NOT continue moving individual calls.

Move Master40 orchestration into a Rust-resident context:
- round subset schedule;
- per-round hybrid execution;
- per-round pattern collection;
- pattern dedup/update;
- metrics;
- return final pool once.

JS should call Master40 once and receive the final pattern pool/metrics.

Keep the existing JS implementation as oracle until broad pool/digest parity is demonstrated.
