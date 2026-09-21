# Native large-round orchestration — CLOSED / NOT PROMOTED

Date: 2026-09-21

## Decision

**DO NOT PROMOTE as an independent Performance V1 layer.**

The experiment is semantically correct and supports the Rust-resident architecture, but its incremental E2E benefit on top of Rank Cache + Lean Beam + Native Whole Greedy is too small to justify another production layer.

## What changed

For large orders only (`pieces > maxPiezasBeam`), one Rust call evaluates:

- all passes;
- all stage-depth trials;
- the same whole-greedy plan per trial;
- the same plan-depth tie break;
- the same remnant-quality tie break;
- the final winning plan.

JS supplies the exact piece-ID order for every pass, so no JS sorting semantics are reimplemented in Rust.

All 40 Master rounds remain.

## Directed generation gate

Workflow: 35551564167

Control already includes:
- native rank cache;
- Lean Beam;
- native whole-greedy plan.

Candidate adds native pass × stage round orchestration.

Results:
- 4048571: 20,582.67 -> 17,833.71 ms = **-13.36%**
- 4059795: 7,679.04 -> 6,758.73 ms = **-11.98%**
- 4059352: 6,041.79 -> 5,641.02 ms = **-6.63%**
- aggregate: **-11.86%**
- pool parity: **3/3**

## Broad generation gate

Workflow: 35551733933

Cohort:
- selected large Master tails: 30
- exact matched historical Master-active: 91 / 129
- rounds: 40

Correctness:
- pool parity failures: **0/30**

Latency:
- total: 227,854.54 -> 221,374.68 ms = **-2.84%**
- p50: 6,763.12 -> 6,753.10 ms = **-0.15%**
- p95: 12,852.18 -> 12,889.66 ms = **+0.29%**
- p99: 21,810.31 -> 19,421.57 ms = **-10.95%**

Strongest large cases:
- 4048571: **-13.34%**
- 4059795: **-12.14%**
- 4053522: **-15.83%**
- 4059352: **-6.54%**

Near the Beam threshold the effect is mostly noise.

## End-to-end V10 gate

Workflow: 35551930063

Correctness:
- invalid: 0
- digest differences: 0
- board regressions: 0
- remnant regressions: 0

Latency:
- total: 480,238.40 -> 473,890.28 ms = **-1.32%**
- p50: 13,715.53 -> 13,431.27 ms = **-2.07%**
- p95: 34,423.44 -> 33,479.19 ms = **-2.74%**
- p99: 82,702.36 -> 81,163.50 ms = **-1.86%**

Master stage:
- 321,003 -> 314,712 ms = **-1.96%**

Extreme cases:
- 4048571 E2E: 99,624.06 -> 97,712.21 ms = **-1.92%**
- 4059795 E2E: 26,051.32 -> 24,717.68 ms = **-5.12%**

## Interpretation

Removing one JS/Rust boundary level at a time has diminishing returns.

The next experiment must not add another boundary micro-layer.

The remaining architectural target is the outer Master loop itself:

JS today:
- build 40-round schedule;
- per round choose subset;
- invoke hybrid optimizer;
- receive boards;
- reconstruct candidate payloads;
- repeat 40 times;
- serialize candidates back to Rust for final dedup.

Next experiment:
- one Rust-resident Master40 batch/context;
- preserve exact 40-round schedule;
- preserve all per-round semantics;
- collect/dedup patterns before returning;
- JS receives only the final pool + metrics.

This experiment is retained as evidence/prototype but is not a production candidate.
