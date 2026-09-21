# Master 40-round Lean Beam — CLOSED candidate

Date: 2026-09-21

## Decision

**ACCEPT as a Performance V1 candidate.**

The 40 Master rounds remain unchanged.

Lean Beam changes representation only:
- native Beam candidates return used IDs + ranking/remnant metrics + winning request index;
- JS Beam carries lightweight state/recipes;
- cuts/tree/full board geometry are materialized only for the winning Beam path;
- materialization reruns the exact request/seed and asserts identical used IDs.

It is layered on top of the accepted native rank-metric cache.

## Small gate

Workflow: 35547795135

40 rounds in both arms, rank cache in both arms.

- 4050594: -30.76%
- 4059776: -26.58%
- 4060603: -22.98%
- aggregate: **-25.85%**
- pool parity: **3/3**

## Broad generation gate

Workflow: 35547963810

Cohort:
- historical Master-active: 129
- exact canonical matched: 91
- selected top tails + sentinels: 26
- rounds: 40

Correctness:
- pool parity failures: **0/26**
- same pool size/digest: **26/26**

Generation latency:
- total: 320,269.15 -> 254,955.29 ms = **-20.39%**
- p50: 11,437.52 -> 8,929.57 ms = **-21.93%**
- p95: 17,763.80 -> 13,268.30 ms = **-25.31%**
- p99: 32,075.01 -> 30,837.15 ms = **-3.86%**

Large orders remain essentially unchanged:
- 4048571 (2439 pieces): -0.01%
- 4059795 (950 pieces): +1.78% noise/slower

## End-to-end V10 gate

Workflow: 35548203980

Configuration:
- full V10;
- 40 Master rounds;
- packing cache disabled;
- MultiSlice fixed envelope 200-500;
- native rank cache enabled in both arms;
- Lean Beam only in candidate.

Correctness:
- invalid: 0
- digest differences: 0
- board regressions: 0
- remnant regressions: 0

Latency:
- total: 571,953.74 -> 507,756.96 ms = **-11.22%**
- p50: 19,047.58 -> 15,548.23 ms = **-18.37%**
- p95: 41,301.55 -> 41,075.40 ms = **-0.55%**
- p99: 77,988.15 -> 77,804.42 ms = **-0.24%**

Master stage:
- 384,619 -> 321,942 ms = **-16.30%**
- activations: 23 -> 23

Representative full-V10 wins:
- 4052498: -27.08%
- 4050742: -25.44%
- 4056565: -24.91%
- 4055211: -24.34%
- 4051095: -22.20%
- 4050892: -20.71%
- 4059776: -18.09%
- 4050594: -14.90%

## Interpretation

Lean Beam is a safe, material performance improvement for medium Master tails.

It does not solve the global p95/p99 because the largest orders are dominated by the non-Beam greedy path. That is now the next and only Master performance target.

## Next target

**Large-order Greedy (> maxPiezasBeam), still with all 40 rounds.**

Do not reopen:
- round reduction;
- Beam-width reduction;
- MultiSlice thresholds;
- Beam micro-tuning.

The next experiment should defer full greedy board serialization/materialization across the multiple pass/stage trials, preserving the exact greedy request selection and materializing only the final chosen plan.
