# MOTOR BETA V1 — FREEZE

Date: 2026-09-22

Branch:
`motor-beta-v1`

Frozen runtime source:
`2dc90a1d156b3c96b93218d05f4c833c2e4c6f69`

Authoritative pre-holdout optimizer base:
`deeb9c1ba0e9c9154874d559a66901d6854790f2`

## Runtime identity

Comparison `deeb9c1b... -> 2dc90a1d...` contains research reports, fixtures, harnesses and workflows only.

There are **no changes under `src/lib/optimizer/**`** in that interval.

Therefore this branch freezes the same validated optimizer runtime used for the latest sealed holdout, while retaining the validation artifacts that document its behavior.

## Governing objective

1. minimum boards
2. at equal boards, best official commercial remnant quality
3. never add boards for remnant
4. exact demand and industrial physical validity
5. latency only after quality
6. zero correctness regressions

## Product-scale external evidence

Latest sealed holdout furniture cohort:
- physical Lepton boards 1..10
- 15,024 cases
- V3 not worse than Lepton: 14,968 / 15,024 = 99.6273%
- V3 worse: 56 / 15,024 = 0.3727%
- every one of the 56 misses is exactly +1 board
- safe LB == Lepton on 56 / 56 misses
- no large +2/+3/etc furniture miss observed

Frozen fast paths:
- Monotype-v2: external geometry PASS
- Safe Cascade: zero board losses / zero equal-board remnant regressions on blind fast-route population
- R3-M-v4: external correctness/remnant PASS; standalone route economics slightly negative (~0.24%), therefore not independently promoted on performance grounds

## Known scope boundaries

This beta is intentionally not declared perfect.

Known remaining quality opportunities:
- OneBoard construction: safe LB frequently knows one board is feasible while legacy OneBoard fails to construct it
- Master / pattern generation: remaining historical Lepton gaps are concentrated in Master routes
- repeated-production / periodic tiling: case 5504203 is a required sentinel

Known industrial-batch sentinel:
- case 5504203
- stock 2440x1220, kerf 4.5
- 225 pieces
- 2 logical types
- Lepton = 75 boards
- frozen V3 = 90 boards
- physical repeating unit visible in Lepton: 2 x 1828x605 + 1 x 1220x455 per board, repeated 75 times

This case must NOT be dismissed as irrelevant merely because it exceeds furniture-scale board counts. The product must support customers batching requirements for 10–20+ furniture units in one optimization request.

## Freeze policy

Do not develop new optimizer behavior directly on `motor-beta-v1`.

All new Generator V2 / OneBoard V2 / periodic-pattern / Master replacement research must branch from this freeze.

Any future promotion back into beta requires:
- 0 invalid plans
- 0 board regressions on the protected regression corpus
- 0 equal-board remnant regressions
- explicit comparison against this frozen branch
- independent validation for any newly learned gate or threshold
