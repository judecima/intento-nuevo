# Safe Fast-Path Cascade v1 — 2026-09-22

Status: RESEARCH CASCADE PASS / DEFAULT OFF / R3-M-v4 STILL NEEDS FRESH EXTERNAL HOLDOUT

Branch:
- research/perfv3-industrial-incremental-20260922

## Composition

The cascade intentionally combines only the strongest frozen envelopes:

1. exactly one logical type:
   - route to Monotype Remnant-First v2 frozen envelope
   - this geometry envelope already passed the 13,839-case sealed external holdout

2. two or three logical types:
   - route to R3-M-v4
   - v4 preserves the exact R3-M-v1 certification region
   - v4 adds a remnant polish only inside the observed risk region
   - v4 is holdout-informed and still requires a fresh external holdout

3. everything else:
   - current V3

Every child owns its certification and fallback. A child miss always delegates to current V3.

Production default remains unchanged.

## R3-M-v4 risk-polish freeze

Frozen v4 implementation:
- research/optimizer/pattern-generators/guide-row/integrated-v10-r3m-v4.mjs
- initial commit: 3c04d017edf9323de2713a69de517b60eb14a1e1

v4 does NOT broaden v1 certification coverage.

Risk polish is attempted only when:
- frozen R3-M-v1 gate already certifies
- candidate boards = 1
- naturalStates = 3

Polish:
- preferirMenorProfundidad=false
- ruido=0.4
- pases=4
- restartsPorPlaca=4
- Rescue OFF
- Beam OFF
- MultiVariants OFF

The polish can replace the base candidate only through the official lexicographic plan objective.

On the consumed 354-case external R3-M certification set:
- risk region: 165 / 354
- polish actually selected: 10 / 354
- base retained: 344 / 354
- board losses: 0
- remnant regressions: 0
- remnant equal: 348
- remnant better: 6

Reconstructed narrow-v4 timing on that consumed set:
- total ~16,782.904 ms
- V3 ~60,790.648 ms
- saving ~72.39%
- speedup ~3.62x
- p50 ~28.71 ms
- p95 ~165.79 ms
- p99 ~288.48 ms

This is stronger than applying the polish to all 354 certifications.

## R3-M-v4 regression CI

First focused current-source regression run:
- GitHub Actions run 35767929546: SUCCESS
- 10 holdout-informed sentinels
- 4 previous remnant regressions become exact V3 remnant parity
- 6 cases become better than V3 in official remnant
- board losses: 0
- remnant regressions: 0

Broad regression gate:
- original frozen R3-M cohort: 438
- external remnant regressions: 4
- total: 442

GitHub Actions run 35772145591: SUCCESS

Result:
- certified: 442 / 442
- invalid: 0
- reference errors: 0
- board losses: 0
- board wins vs V3: 0
- remnant worse: 0
- remnant equal: 432
- remnant better: 10
- risk polish attempted: 201
- risk polish selected: 11

Timing:
- v4 total: 5,362.829 ms
- V3 total: 15,424.350 ms
- saving: 65.23%
- speedup: 2.88x
- p50: 7.067 vs 14.163 ms
- p95: 37.023 vs 135.139 ms
- p99: 76.481 vs 569.100 ms

The four external regressions are all repaired to exact official remnant parity.

## R3-M residual precheck + reuse

Observation from the sealed holdout:
- R3-M pre-candidates: 2,112
- NATURAL_STATES_GT_3: 1,444 = 68.37%
- these cases can NEVER pass the frozen R3-M-v1 gate

Previous implementation:
- built the complete H2 candidate
- then discovered naturalStates > 3

New implementation:
1. enumerate residual states first
2. if naturalStates > 3, skip complete H2 candidate and fall back to V3
3. if naturalStates <= 3, pass the same residual object into buildGuideRowCandidate
4. do not recompute residual states

Code:
- complete-candidate residual reuse commit:
  75bf57851fa8d260a8709c200e3dd01b441c3ace
- v4 pre-gate/reuse commit:
  a84280a542aa75c7792198026483f99dfb35b61d

Full 2,112-case serial A/B, same process:
- old complete-candidate screening: 20,895.859 ms
- precheck + reuse: 7,309.676 ms
- saving: 65.02%
- speedup: 2.86x
- precheck cost across all 2,112: 63.751 ms
- complete H2 candidates skipped: 1,444
- complete H2 candidates still built: 668
- plan mismatches among built cases: 0
- certification classification remains exactly:
  - 1,444 NATURAL_STATES_GT_3
  - 312 SECOND_REMNANT_NONZERO
  - 354 certified
  - 2 LB_NOT_REACHED

This is a pure computation reduction. It does not alter thresholds, geometry, certification coverage or plan objective.

## Net routing economics on external 2,112-case R3 region

A fast path is useful only if savings on certifications exceed screening cost on fallbacks.

Serial route A/B with v4 precheck/reuse:
- total pre-candidates: 2,112
- certified: 354
- fallback: 1,758
- risk polish attempted: 165
- polish selected: 10
- invalid/regression cases: 0
- remnant better vs V3: 6
- remnant equal: 348

Cost paid by the R3 route across ALL 2,112:
- screening: 8,102.471 ms
- risk polish: 269.397 ms
- total fast-path cost: 8,371.869 ms

V3 work avoided by the 354 certifications:
- 10,898.989 ms

Net:
- saving after paying for all 1,758 fallback screenings: 2,527.120 ms
- net positive: YES

Therefore the R3-M-v4 route remains beneficial even when fallback overhead is counted.

## Frozen Monotype-v2 wrapper

File:
- research/optimizer/pattern-generators/monotype/integrated-v10-monotype-v2-frozen.mjs
- commit: 14ef8a4e9bef5ce2ca2c208b45c8ce3e0f98a03b

It deliberately restricts the broader research v3 implementation to the externally validated v2 geometry envelope:
- exactly one type
- 1..300 pieces
- non-directional
- explicit rotation not locked
- trim 0/0

Outside this envelope -> exact current V3 fallback.

External 13,839-case holdout result already recorded:
- routed monotype cases: 1,483
- certified: 1,479
- fallback: 4
- board losses: 0
- remnant regressions: 0
- remnant better: 27
- integrated total 78,135.980 ms vs V3 174,175.445 ms
- saving 55.14%
- speedup 2.23x

## Safe cascade integration

File:
- research/optimizer/pattern-generators/cascade/integrated-v10-safe-cascade.mjs
- commit: 7cfd6757a3c211b5520d4bffb9706c79f4c7df82

Gate:
- research/optimizer/pattern-generators/cascade/safe-cascade-ab.mjs
- workflow: .github/workflows/optimizer-safe-fast-path-cascade.yml
- GitHub Actions run 35772452520: SUCCESS

Critical route cases:
- monotype certified parity
- monotype remnant improvement
- monotype LB fallback
- three external R3 remnant failures repaired
- directional monotype fallback
- outside-fast-path V3 route

Result:
- cases: 8
- bad: 0
- all plans physically valid
- no board loss
- no remnant regression
- every expected fallback has exact board/remnant/placement digest parity with V3

## Coverage stability

On the previous 16,986-case mining corpus:
- Monotype certified: 1,723
- R3-M certified: 438
- combined fast returns: 2,161
- coverage: 12.72%

On the sealed 13,839-case external corpus:
- Monotype-v2 certified: 1,479
- R3-M frozen certification region: 354
- combined fast returns: 1,833
- coverage: 13.25%

Across both disjoint newer corpora:
- total cases: 30,825
- fast returns: 3,994
- coverage: 12.96%

This stability is useful evidence that the cascade is not relying on a rare one-off geometry distribution.

## Decision

Safe Fast-Path Cascade v1 is now a coherent research architecture:
- Monotype-v2 has external geometry validation
- R3-M-v4 has strong current + consumed-holdout regression evidence
- R3-M precheck/reuse removes 65% of candidate-screening cost without changing plans
- cascade routing is net positive after fallback overhead
- default remains OFF

Do NOT production-promote the whole cascade yet.

Reason:
- R3-M-v4 was derived after the 4-ZIP holdout exposed v1 remnant failures
- v4 requires one fresh sealed validation corpus with no retuning

Next external acceptance for the whole cascade:
- 0 invalid plans
- 0 board losses vs V3
- 0 equal-board remnant regressions
- exact fallback parity
- record end-to-end latency including fallback screening
- do not change v4 risk region or polish before that validation
