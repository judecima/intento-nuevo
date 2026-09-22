# SEALED HOLDOUT V2 — MANIFEST BLIND — 2026-09-22

Status: SEALED / MANIFEST RECORDED / NO TUNING PERFORMED

Branch:
`research/perfv3-industrial-incremental-20260922`

Frozen base commit before opening holdout:
`deeb9c1ba0e9c9154874d559a66901d6854790f2`

## Input

User supplied four fresh ZIPs:
- validacion_v2_1.zip: 3,947 XML
- validacion_v2_2.zip: 3,947 XML
- validacion_v2_3.zip: 3,947 XML
- validacion_v2_4.zip: 3,946 XML

Raw XML total: **15,787**

All 15,787 roots are `<project>`.
There are no `<Order>` inputs in this holdout.

Observed ID range:
- min: 5,431,049
- max: 5,532,678

Prior consumed corpus maximum ID from authoritative handoff:
- 5,431,046

Therefore:
- duplicate IDs inside this holdout: **0**
- numeric ID overlap with the prior ~51,667 valid cases: **0**

## Canonical-compatible validation

Valid: **15,784**
Excluded: **3**

By ZIP:
- v2_1: 3,947 valid / 0 excluded
- v2_2: 3,945 valid / 2 excluded
- v2_3: 3,946 valid / 1 excluded
- v2_4: 3,946 valid / 0 excluded

Excluded:
1. 5456884 — mixed-board-formats
   - 1850x715
   - 1610x770
   - 1735x695
2. 5462022 — project terminal references child nodes that are not present in the XML
3. 5483435 — mixed-board-formats
   - main panels 2750x1850
   - additional panel 864x580

No material-name grain inference was used.

Because every usable case is PROJECT XML, the physical Lepton panel count is directly represented and is authoritative for board-count comparison. PROJECT XML still does not externally validate current application-level per-piece canRotate semantics.

## Duplicate structure inside the new holdout

Among the 15,784 valid cases:
- exact XML-content unique: 14,223
- exact duplicate instances beyond first: 1,561
- exact duplicate groups: 1,260
- files belonging to an exact-duplicate group: 2,821

Geometry-level structural fingerprints:
- unique structural geometries: 13,610
- repeated structural instances beyond first: 2,174
- repeated structural groups: 1,579

These are retained as real workload observations; they are not duplicate IDs.

## Board formats

Distinct board dimensions: **45**
Distinct dimension+thickness combinations: **128**

Most common dimensions:
- 2440x1220: 6,015 = 38.11%
- 2750x1830: 3,364 = 21.31%
- 2600x1830: 2,989 = 18.94%
- 2740x1820: 953 = 6.04%
- 2800x2070: 442 = 2.80%
- 2500x1830: 430 = 2.72%
- 2840x1220: 282 = 1.79%
- 2750x1850: 254 = 1.61%
- 2750x910: 254 = 1.61%
- 2590x1820: 184 = 1.17%
- 2820x1830: 163 = 1.03%
- 2800x1220: 157 = 0.99%

Kerf:
- 4.5 mm: 7,207
- 4.4 mm: 6,162
- 5.0 mm: 2,414
- 3.0 mm: 1

## Piece-count distribution

Quantiles:
- p10: 4
- p25: 8
- p50: 18
- p75: 41
- p90: 83
- p95: 123
- p99: ~257
- max: 17,280

Buckets:
- 1-10: 5,028
- 11-20: 3,457
- 21-30: 1,972
- 31-50: 2,201
- 51-80: 1,487
- 81-100: 490
- 101-160: 709
- 161-300: 318
- 301-500: 71
- 501-1000: 28
- >1000: 23

## Type-count distribution

Quantiles:
- p10: 2
- p25: 3
- p50: 7
- p75: 14
- p90: 27
- p95: 40
- p99: 80
- max: 443

Buckets:
- 1 type: 1,568
- 2-3: 2,524
- 4-5: 2,305
- 6-10: 3,767
- 11-20: 3,164
- 21-40: 1,671
- 41-80: 628
- 81-160: 134
- >160: 23

## Physical Lepton boards represented in PROJECT XML

Quantiles:
- p25: 1
- p50: 2
- p75: 4
- p90: 7
- p95: 10
- p99: 23
- max: 7,680

The extreme cases are retained; the blind benchmark must not trim them.

## Frozen fast-path pre-gate populations

Without executing or changing any frozen optimizer rule:

Monotype route:
- exactly 1 type: 1,568
- inside frozen 1..300 piece envelope: **1,547**

R3-M route:
- exactly 2..3 types: 2,524
- inside frozen <=160-piece pre-gate: **2,498**

Direct V3 by route (>3 types):
- **11,692**

Theoretical pre-gate population for the two fast-path families:
- 4,045 / 15,784 = **25.63%**

This is only pre-gate coverage. It is NOT a certification result; R3-M-v4 still has naturalStates / second-remnant / lower-bound certification gates.

## Holdout discipline

No thresholds, rounds, gates, polish settings, H2 rules, early-LB rules, Monotype-v2 parameters, R3-M-v4 parameters, or Safe Cascade v1 parameters were changed before or during this manifest.

The next step is the frozen blind execution:
1. current V3
2. frozen Monotype-v2
3. frozen R3-M-v4
4. frozen Safe Fast-Path Cascade v1
5. exact Lepton board comparison on all canonical-valid PROJECT cases
6. record invalids, board wins/losses, remnant wins/regressions, fallback parity, p50/p95/p99, screening cost and net route economics before any tuning.
