# Sealed Holdout Validation 4xZIP — 2026-09-22

Status: HOLDOUT CONSUMED / MONOTYPE PASS / R3-M FAILS REMNANT GATE / R3-M-v4 DISCOVERY CANDIDATE

Input supplied by user:
- validacion_1.zip
- validacion_2.zip
- validacion_3.zip
- validacion_4.zip

The frozen rules were evaluated before any retuning.

## Corpus

- XML received: 13,842
- canonical valid: 13,839
- excluded: 3
- all 3 exclusions: mixed-board-formats
- order-id range: approximately 5,336,679 .. 5,431,046
- this block is later than the previous 16,986-case mining corpus

Important XML limitation:
- project XML does not carry authoritative current per-piece canRotate overrides
- no material-name grain inference was used
- the blind validation below is therefore the non-directional / geometry envelope only
- the later Monotype-v3 grain/trim stress extension is NOT externally validated by this holdout

## Frozen Monotype Remnant-First v2

Holdout monotype pre-gate:
- 1,507 one-type cases
- 1,483 inside frozen <=300-piece envelope

Compared integrated frozen monotype path vs current V3:
- rows: 1,483
- valid integrated plans: 1,483
- valid V3 references: 1,483
- certified: 1,479
- fallback: 4
- accepted board losses vs V3: 0
- board wins vs V3: 0
- equal-board remnant regressions: 0
- remnant equal: 1,456
- remnant better: 27

Lepton board count on the same 1,483:
- frozen monotype path better than Lepton: 27
- equal to Lepton: 1,456
- worse than Lepton: 0
- current V3 has the same board-count distribution vs Lepton on this monotype cohort

Latency:
- frozen integrated monotype total: 78,135.980 ms
- current V3 total: 174,175.445 ms
- saving: 55.14%
- aggregate speedup: 2.23x
- integrated p50: 11.623 ms
- V3 p50: 32.403 ms
- integrated p95: 230.295 ms
- V3 p95: 486.760 ms
- integrated p99: 703.144 ms
- V3 p99: 1,449.963 ms

Four safe fallbacks:
- 5373903
- 5399912
- 5375309
- 5346438

All four preserve the V3/Lepton board count after fallback.

Decision:
- Monotype Remnant-First v2 PASSES this sealed external geometry holdout
- 0 accepted board regressions
- 0 accepted remnant regressions
- 0 invalid plans
- substantial latency reduction
- this is the first external validation of the frozen monotype rule

Do not interpret this as external validation of the later grain/trim v3 envelope.

## Frozen Guide-Row R3-M

New pre-candidates:
- 2,112 cases with 2..3 types and <=160 pieces

Frozen R3-M screening:
- certified: 354
- not certified: 1,758
- NATURAL_STATES_GT_3: 1,444
- SECOND_REMNANT_NONZERO: 312
- LB_NOT_REACHED: 2

Screening candidate cost across all 2,112:
- 84,304.014 ms
- mean ~39.917 ms/case

Blind reference comparison on the 354 certifications:
- board losses: 0
- board wins vs V3: 0
- remnant equal: 350
- remnant better: 0
- remnant worse: 4
- invalid references: 0

Board count vs Lepton on the 354:
- candidate better than Lepton: 6
- equal to Lepton: 348
- worse than Lepton: 0
- V3 has the same board-count distribution vs Lepton

Latency on the 354:
- R3-M candidate total: 13,305.496 ms
- V3 total: 60,790.648 ms
- saving: 78.11%
- speedup: 4.57x
- candidate p50: 19.587 ms
- V3 p50: 78.477 ms
- candidate p95: 147.296 ms
- V3 p95: 548.604 ms
- candidate p99: 255.968 ms
- V3 p99: 1,648.501 ms

But R3-M FAILS the frozen promotion criterion because remnant regressions must be zero.

### Four blind remnant regressions

5344286:
- boards 1 = V3 1 = Lepton 1
- candidate quality: mayor 2,177,760; segundo 0
- V3 quality: mayor 2,177,760; segundo 189,000

5344296:
- same remnant pattern as 5344286

5362238:
- boards 1 = V3 1 = Lepton 1
- candidate has no commercial remnant
- V3 has two commercial remnants of 155,088 mm2

5407018:
- boards 1 = V3 1 = Lepton 1
- candidate quality: mayor 745,139.2; segundo 0
- V3 quality: mayor 745,139.2; segundo 197,680

Decision:
- frozen R3-M v1 is NOT promotable
- board-count safety held
- remnant safety did not

## Post-holdout R3-M-v4 discovery

Only AFTER recording the frozen R3-M failure, the four remnant counterexamples were investigated.

A simple remnant-first polish arm was tested across all 354 frozen R3-M certifications:
- preferirMenorProfundidad = false
- ruido = 0.4
- pases = 4
- restartsPorPlaca = 4
- Rescue OFF
- Beam OFF
- MultiVariants OFF

The polish competes lexicographically against the original R3-M candidate.

Result on this already-consumed holdout:
- remnant regressions: 0
- remnant equal: 348
- remnant better: 6
- board losses: 0
- polish selected in 10/354 cases
- original candidate retained in 344/354

Combined candidate + polish cost:
- 22,815.650 ms
- V3: 60,790.648 ms
- saving: 62.47%
- speedup: 2.66x
- combined p50: 38.731 ms vs V3 78.477 ms
- combined p95: 223.863 ms vs V3 548.604 ms
- combined p99: 477.984 ms vs V3 1,648.501 ms

Six better-than-V3 remnant cases after the polish:
- 5412222
- 5412225
- 5412236
- 5352071
- 5337979
- 5403827

Interpretation:
- R3-M-v4 is a strong candidate
- it fixes all four observed external remnant failures while preserving a material latency advantage
- BUT it was derived after seeing this holdout
- therefore these 13,839 valid cases can no longer certify R3-M-v4 externally
- R3-M-v4 must be frozen now and tested unchanged on a future sealed corpus

## Overall decision after this holdout

Monotype:
- external geometry holdout PASS
- strong evidence for promotion of the frozen v2 geometry envelope, subject to normal production integration review
- grain/trim v3 stress extensions remain research-only until independently validated

R3-M:
- frozen v1 external holdout FAIL due to 4/354 remnant regressions
- do not promote v1
- freeze the post-holdout remnant-first-polish candidate as R3-M-v4
- validate v4 blindly on the next fresh corpus

No thresholds from the original frozen R3-M rule should be changed based on this holdout beyond creating the explicitly versioned v4 candidate.
