# Global optimizer snapshot — 2026-09-22

Status: PARTIAL GLOBAL CLOSED / HISTORICAL FULL PROJECT COMPARISON EXACT / RECENT CASCADE COVERAGE EXACT

## Scope

Total valid corpus currently available:
- historical canonical: 20,842
- recent mining corpus: 16,986
- sealed external holdout: 13,839
- total valid: 51,667

Important reference rule:
- historical <Order> XML does not expose a reliable physical Lepton panel count through reference_panels
  because Board/Job multiplicity can be encoded separately.
- therefore the exact full historical Lepton board comparison below uses only <project> XML,
  where the physical panel solution is directly represented.
- this avoids false regressions.

## Exact historical V3 vs Lepton — PROJECT XML only

Comparable project cases:
- 17,317

Current V3 board count vs Lepton:
- better: 1,266 = 7.3107%
- equal: 16,008 = 92.4410%
- worse: 43 = 0.2483%
- equal or better: 17,274 / 17,317 = 99.7517%

Board deltas:
- gross boards saved on better cases: 1,293
- gross boards lost on worse cases: 45
- net boards saved vs Lepton: 1,248

Loss magnitude:
- 42 / 43 gaps are +1 board
- 1 / 43 gap is +3 boards

Win magnitude:
- 1,240 wins are -1 board
- 25 wins are -2 boards
- 1 win is -3 boards

## Where the 43 historical Lepton gaps live

By current Master category:
- no-master: 15,885 cases, 0 worse than Lepton
- C-full40-incremental: 35 gaps
- A-high-types: 4 gaps
- B-mid-repeat: 4 gaps

This is a critical structural result:
- every historical Lepton board-count gap is in a Master-search route
- no-master region has 0/15,885 board-count gaps

Lower-bound diagnosis:
- in 41 / 43 gaps, current safe LB already equals the Lepton board count

Interpretation:
- in almost every remaining historical gap, the optimizer already knows the target board count
- the failure is candidate/pattern generation/materialization, not lower-bound weakness

## Gap-family compression

The 43 gap instances collapse to:
- 37 unique structural geometries

Repeated structural families include:
- 4035484 / 4034825 / 4034830: one geometry, 3 instances
- 4060744 / 4040363: one geometry, 2 instances
- 4055177 / 4055174: one geometry, 2 instances
- 4087476 / 4087489: one geometry, 2 instances
- 4129718 / 4129782: one geometry, 2 instances

Guide-Row already closed sentinel 4055174 from:
- V3 7 boards
- Lepton 6
- H2 6
- safe LB 6

Because 4055177 shares the same structural geometry, this family-level view is the correct next search direction.

## Historical latency snapshot

20,841 paired historical V3 rows:
- p50 wall: 317.54 ms
- p95 wall: 6,602.97 ms
- p99 wall: 17,780.30 ms
- total measured wall sum: 30,037.1 s

PROJECT-only comparable subset:
- p50: 307.21 ms
- p95: 6,556.72 ms
- p99: 17,332.25 ms

LB equals current V3 final board count:
- all paired historical rows: 19,149 / 20,841
- PROJECT comparable rows: 15,918 / 17,317

## Safe Fast-Path Cascade — exact recent-corpus evidence

Previous mining corpus 16,986:
- Monotype fast returns: 1,723
- R3-M frozen certification region: 438
- combined: 2,161 = 12.72%

Sealed external corpus 13,839:
- Monotype-v2 fast returns: 1,479
- R3-M certification region: 354
- combined: 1,833 = 13.25%

Across both recent disjoint corpora:
- 30,825 cases
- 3,994 fast returns
- coverage: 12.96%

Monotype-v2 external holdout:
- 1,483 eligible
- 1,479 certified
- 4 exact V3 fallbacks
- 0 board losses
- 0 remnant regressions
- 27 remnant improvements
- 55.14% lower total time than V3 on the eligible set
- 2.23x speedup

R3-M-v4 broad regression gate:
- 438 original + 4 external remnant failures = 442
- 442/442 certified
- 0 invalid
- 0 board losses
- 0 remnant regressions
- 432 equal remnant
- 10 better remnant
- 64.78% lower time than V3
- 2.84x speedup
- p95 38.24 vs 134.21 ms
- p99 94.82 vs 597.79 ms

R3 route economics on full 2,112 external pre-candidates:
- certified: 354
- fallback: 1,758
- fast-path screening + risk polish: 8,371.869 ms
- V3 work avoided by certifications: 10,898.989 ms
- net saving after paying every fallback screen: 2,527.120 ms
- route remains net positive

## Current engineering conclusion

The main unresolved board-count problem is now sharply localized:
- not lower bounds
- not no-master cases
- not monotype
- predominantly Master candidate generation on a small set of structural families

Next optimization target:
1. rank the 37 unique historical Lepton-gap geometries by frequency + CPU
2. run the existing H2/Guide-Row generator against all 37 families
3. identify how many current gaps it already closes without new tuning
4. only then design a new family rule for the remaining uncovered structures

Do not spend the next iteration inventing another global lower bound or broad scheduler rule.
