# OneBoard baseline reuse — performance/correctness gate

Date: 2026-09-18  
Frozen source: `425ebba5de48eb0105d5cb46b08594b3dc50ff49`  
Experiment branch: `experiment/optimizer-oneboard-baseline-reuse`

## Decision

**PASS: reuse the already-computed V10 baseline inside OneBoard.**

**REJECTED: reuse a pre-expanded/prepared piece array across OneBoard attempts.**
That second change did not improve aggregate runtime over baseline reuse alone, so it is not part of the promoted experiment.

No heuristic, search order, attempt budget, acceptance rule, board scoring, Pattern Master behavior, or production worker routing is changed.

## Physical corpus

The gate used the physical `resto.zip` archive:

- SHA-256: `15ff286970883ef0799621f102a8ae15956c291fe3a32f3572d8c86ce4adefa1`
- XML files: 8,669
- canonical-parseable in this scan: 8,663
- static area lower bound = 1: 3,483
- baseline physically uses >1 board: **189**

Those 189 orders are the real OneBoard-active cohort for this experiment.

The historical 213-hotspot marker was not used for the percentile gate because it contains zero OneBoard activations.

## Change under test

Before:

```text
V10
  baseline = optimizar(...)

  OneBoard
    base = optimizar(...)   # duplicate full baseline solve
    rescue search
```

Candidate:

```text
V10
  baseline = optimizar(...)

  OneBoard
    base = supplied baseline
    rescue search
```

Direct callers that do not supply a baseline still execute the historical internal `optimizar()`.
V10 also preserves the historical recomputation for the unusual `config.multiVariantes === true` case because the V10 baseline is explicitly generated with `multiVariantes:false`.

## Benchmark protocol

- exact frozen `motor.cjs` and OneBoard semantics from the worker candidate;
- same 189 real orders for both variants;
- OneBoard deterministic search budget: 384 attempts;
- 384 is the complete finite OneBoard search space:
  `6 seeds × 4 c1 × 4 c2 × 2 directions × 2 multi modes`;
- warm-up before measurement;
- sequential execution to remove cross-process CPU contention;
- alternating original/candidate execution order by case;
- baseline generation occurs outside the timed candidate OneBoard stage, matching V10 where that baseline already exists;
- exact normalized physical plan comparison;
- Industrial V3 validation on both outputs.

## Correctness

| Gate | Result |
|---|---:|
| Real OneBoard-active orders | 189 |
| Exact physical output parity | **189/189** |
| Industrial validation | **189/189 both variants** |
| Board-count regressions | **0** |
| OneBoard successes | 8 |
| Search exhaustions at 384 attempts | 181 |

Attempt-count distribution was identical:

- 1 attempt: 1 case
- 2: 1
- 10: 1
- 51: 2
- 57: 1
- 70: 1
- 188: 1
- 384: 181

## Wall-time result — OneBoard stage

| Metric | Frozen original | Baseline reuse | Reduction |
|---|---:|---:|---:|
| Total | 46,568.491 ms | 3,811.935 ms | **91.81%** |
| Mean | 246.394 ms | 20.169 ms | **91.81%** |
| p50 | 187.001 ms | 12.745 ms | **93.18%** |
| p95 | **743.340 ms** | **80.151 ms** | **89.22%** |
| p99 | **837.754 ms** | **110.671 ms** | **86.79%** |
| Max | 929.488 ms | 111.638 ms | **87.99%** |

Aggregate OneBoard wall-time speedup: **12.216×**.

Absolute time saved across the 189 activated orders: **42,756.556 ms**.

Per-order absolute saving distribution:

- p50: 175.051 ms
- p95: 660.498 ms
- p99: 759.274 ms
- max: 824.518 ms

## Process CPU result — OneBoard stage

| Metric | Frozen original | Baseline reuse |
|---|---:|---:|
| Total | 76,046.448 ms | 5,274.046 ms |
| Mean | 402.362 ms | 27.905 ms |
| p50 | 229.545 ms | 16.522 ms |
| p95 | **1,442.477 ms** | **93.402 ms** |
| p99 | **1,669.061 ms** | **164.306 ms** |
| Max | 1,792.030 ms | 217.191 ms |

Aggregate CPU speedup: **14.419×**.  
Aggregate CPU reduction: **93.06%**.

## Attribution check

During cohort discovery, the duplicated internal baseline solve itself measured approximately:

- total: 40,005.269 ms
- mean: 211.668 ms
- p50: 163.829 ms
- p95: 668.996 ms
- p99: 764.177 ms
- max: 771.661 ms

That envelope closely matches the measured candidate savings, confirming that the improvement comes from removing the duplicated `optimizar()` work rather than from changing rescue behavior.

## Rejected prepared-piece reuse

A second prototype also reused the expanded pieces / cut dimensions / orientations / signatures between OneBoard attempts.

It preserved correctness, but versus baseline reuse alone its aggregate timing was slightly worse in the A/B run. It was faster on 112 cases and slower on 77, but lost overall. Therefore it is **not promoted**.

## Scope

These p95/p99 figures are for the **OneBoard stage on real orders where OneBoard activates**, not for the complete V10 request.

For an activated request, the complete optimizer saves the same absolute duplicated-baseline work, but the percentage improvement of the full request is smaller because compactation, MultiSlice, Pattern Master, validation, etc. may still run.

Orders that do not activate OneBoard are intentionally unaffected.

## Promotion caveat

`src/lib/optimizer/legacy/*.cjs` is mechanically generated legacy code. This experiment edits the generated files to prove the optimization. Before any production merge, the corresponding extractor/source-of-truth path must be updated so regeneration cannot erase the change.
