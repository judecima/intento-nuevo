# Portfolio13 cross-family checkpoint — 2026-09-15

Research-only checkpoint. This does **not** modify `src/lib/optimizer/**` and is not a production promotion.

## Why Portfolio13 exists

Portfolio10 passed the current-parser MID_DENSITY gate, but broader HIGH_DENSITY validation exposed complementary failures. Several Portfolio10 variants could repair one family while regressing another. Causal ablation showed that the useful Rescue contexts are not compressible into one universal ten-round set without losing known wins.

The smallest robust portfolio found in this investigation is:

```text
0, 7, 11, 12, 14, 15, 16, 17, 18, 19, 21, 26, 35
```

Policy remains the existing Rescue14 configuration: 2 passes, 14 restarts per board, Rescue ON, Beam OFF.

## Current-canonical control

On current-canonical `4006648`:

```text
area LB      9
Fast        12
Rescue28    10
Portfolio13 10
```

`p13-check.mjs` is the executable local control for this invariant.

## MID_DENSITY gate

The previously published current-parser MID gate contains 90 open `project` cases (67 unique geometry/config inputs). Portfolio13 was compared case-for-case against the published Portfolio10 baseline on all 67 unique inputs:

- 67/67 equal in board count;
- 0 Portfolio13 regressions;
- same 12 unique improvements vs Fast;
- same 7 unique cases reaching the area lower bound.

Because the published Portfolio10 checkpoint already established 0 regressions against Rescue28 on the full 90-case MID gate, equality to Portfolio10 on every unique input preserves that no-regression gate.

## HIGH_DENSITY direct gate

For current-parser HIGH_DENSITY, the direct controlled gate used 332 unique `project` geometries/configurations with at most 160 physical pieces. Portfolio13 and Rescue28 were executed with the same harness and compared directly on every input.

| Metric | Portfolio13 | Rescue28 |
| --- | ---: | ---: |
| Inputs compared | 332 | 332 |
| Worse than the other | **0** | **0** |
| Equal board count | **332** | **332** |
| Improvements vs Fast | **63** | **63** |
| Reaches area LB | **58** | **58** |
| Total Master nodes | 17,570,385 | 22,746,774 |

Portfolio13 therefore matched Rescue28 board-for-board on the complete HIGH gate while using 13 Rescue contexts instead of 28.

## CPU telemetry

Process CPU telemetry from the full HIGH direct gate (not a production wall-clock benchmark):

| Metric | Portfolio13 | Rescue28 |
| --- | ---: | ---: |
| median CPU | 696 ms | 1,448 ms |
| p90 CPU | 4,026 ms | 7,157 ms |
| p95 CPU | 5,179 ms | 10,242 ms |
| p99 CPU | 23,828 ms | 24,811 ms |
| max CPU | 25,394 ms | 34,049 ms |

Median Rescue28/Portfolio13 CPU ratio across the 332 direct comparisons is **1.77x**. Master node volume is ~22.8% lower in aggregate.

These numbers are telemetry only. They do not replace a clean serial production benchmark or end-to-end SaaS wall-clock p50/p95.

## Regression smoke

Existing optimizer smoke suite remained green after the P13 gate:

- frontier: 9/9
- tiny oracle: 2/2
- cut policy: 2/2
- and-or: 18/18
- H2 repeat: 1/1

Total: **32/32 PASS**.

## Decision

Portfolio13 is the first fixed Rescue portfolio in this line of experiments to preserve the published MID gate and match Rescue28 directly over the full 332-input HIGH gate with zero board-count regressions.

It is a valid research candidate for the next stage, but it is **not yet a production promotion**. The next required gate is the remaining heterogeneous families (30–50% strip density, weak-partial-band, and no-signal residual) plus clean serial end-to-end latency measurements before integration into `src/lib/optimizer/**`.
