# PERIODIC DEMAND FACTORIZATION V0 — DISCOVERY CHECKPOINT

Date: 2026-09-22

Research branch:
`research/motor-v2-structural-20260922`

Frozen production-reference branch:
`motor-beta-v1`

Frozen beta commit:
`07428bad8b1a4670c92ca0919fad32d3f487d63f`

Status:
RESEARCH-ONLY / REAL QUALITY SIGNAL / NOT PROMOTED

## Motivation

The large miss `5504203` is not a generic large-order failure. It is an exact repeated-production order.

Demand:
- stock 2440x1220
- kerf 4.5
- 75 x 1220x455
- 150 x 1828x605
- total pieces: 225

All logical quantities share:

`gcd(75,150) = 75`

Therefore the full demand is exactly 75 repetitions of the normalized unit:

- 1 x 1220x455
- 2 x 1828x605

The frozen V3 optimizes the expanded 225-piece demand and returns 90 boards.
It does not first factor the demand into a repeated production unit.

## Sentinel 5504203

Normalized unit:
- 3 pieces
- existing frozen V3 on the normalized unit: 1 valid board
- direct research construction is sub-millisecond to low-millisecond on the current host

Replicating that one physical board 75 times gives:
- boards: **75**
- pieces: **225**
- exact logical demand: PASS
- unique physical IDs: 225
- industrial geometry: PASS
- cut sequence: PASS

Frozen full-order V3:
- **90 boards**

Lepton:
- **75 boards**

Existing Hybrid LB on the full original demand:
- lower bound: **75**
- binding: DFF / V14 wide>1/2
- candidate 75 reaches the safe LB

Decision for this sentinel:
- periodic candidate: **75**
- frozen V3: **90**
- boards saved: **15**
- optimum is **certified at 75**

This is a representation/generation failure, not a physical-packing-capability failure.

## Second real win — 5446079

Demand:
- stock 2440x1220
- kerf 4.5
- 7 logical types
- every quantity = 11
- total pieces = 77
- gcd = 11
- normalized unit = 7 pieces

Periodic unit:
- 1 valid board

Replicated candidate:
- **11 boards**
- 77/77 exact pieces
- industrial validation PASS

Frozen current V3:
- **12 boards**

Lepton:
- **12 boards**

Existing Hybrid LB:
- **11**
- binding: area

Decision:
- periodic candidate reaches the safe LB
- **12 -> 11** vs frozen V3
- **12 -> 11** vs Lepton
- optimum is certified at 11

This is independent evidence that periodic factorization can improve both the current motor and Lepton on repeated production orders.

## Negative control — 5525837

- gcd = 24
- normalized unit = 15 pieces
- periodic candidate = 48 boards
- Lepton = 49
- frozen current V3 = **47**

Therefore periodic factorization is NOT a universal replacement.

A safe integration must compare/certify and retain V3 when the periodic candidate is worse.

## New sealed-holdout periodic population

Among 15,784 canonical-valid holdout cases:

- gcd >= 2: **2,810**
- periodic cases with physical Lepton >10 boards: **117**
- of those, normalized unit <=20 pieces: **69**
- normalized unit <=3 pieces: **43**

The 69 small-unit industrial cases were evaluated with the existing physical motor on the normalized unit:

- valid unit candidates: **69 / 69**
- candidate equal to Lepton: **17**
- candidate better than Lepton: **2**
- candidate worse than Lepton: **50**

The two apparent Lepton improvements were checked against full frozen V3:
- 5446079: periodic 11 / Lepton 12 / V3 12 -> REAL WIN
- 5525837: periodic 48 / Lepton 49 / V3 47 -> correctly REJECTED against V3

5504203 is also a confirmed real V3 win:
- periodic 75 / Lepton 75 / V3 90

Thus the current measured strict V3 wins in this focused cohort include:
- 5504203: **-15 boards**
- 5446079: **-1 board**

## Historical cross-check

Historical comparable PROJECT cases with gcd >=2:
- 2,478 total
- 1,510 non-directional cases in the cheap normalized-unit scan

A cheap normalized-unit constructor produced:
- strict wins vs frozen historical V3: **0 / 1,510**

Interpretation:
- gcd >1 alone is NOT a rule
- periodic factorization should be a selective candidate/rescue, not a replacement
- the strong opportunity appears especially relevant to repeated batch-production orders in the newer corpus

## Safe research architecture

Candidate algorithm:

1. compute `g = gcd(quantity_i)`
2. if `g <= 1`: NOT_APPLICABLE
3. build normalized demand `quantity_i / g`
4. optimize the normalized unit with an existing physically validated constructor
5. replicate every resulting board template `g` times
6. assign unique physical piece IDs and preserve logical references
7. validate the complete replicated plan against the ORIGINAL demand
8. compute the existing safe lower bound on the ORIGINAL demand
9. acceptance:
   - if candidate uses fewer boards than frozen V3 and is valid: candidate may win
   - if candidate reaches the safe LB: board optimum is certified
   - if candidate is equal/worse in boards: preserve V3 unless official remnant quality is strictly better under an explicitly validated equal-board gate
10. any error/miss -> exact frozen V3 fallback

No learned threshold is promoted by this checkpoint.

## Commercial interpretation

Large repeated requests must not be discarded as irrelevant outliers.

A customer can legitimately submit the requirements for 10, 20, 75 or more identical furniture units in a single production order. Expanding every physical piece before discovering repeated demand can hide extremely simple recurring board templates.

Periodic demand factorization therefore belongs in Motor V2 research as a first-class structural generator.

## Next research extension

After validating exact-GCD factorization broadly, investigate:

`demand = g * repeated_core + residual`

This would cover batch orders containing many repeated furniture units plus a small number of extra/replacement pieces.

Do not implement residual decomposition before exact-GCD behavior is fully measured and protected.
