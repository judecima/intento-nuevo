# Global historical gap map — 2026-09-22

Status: EXACT HISTORICAL PROJECT COMPARISON / GAP SOURCE IDENTIFIED / H2 RESCUE IN VALIDATION

Branch:
- research/perfv3-industrial-incremental-20260922

## Data correction: Lepton reference

The historical canonical corpus contains both `project` and `order` XML.

Important correction:
- for `project`, panel count is the physical Lepton solution and is directly comparable
- for `order`, the stored board quantity is stock declaration, not necessarily Lepton solution board count

Therefore this report uses only historical `project` cases for exact optimizer-vs-Lepton board comparison.

Historical canonical:
- total valid canonical: 20,842
- exact Lepton-comparable project cases: 17,317
- order cases excluded from this exact board comparison: 3,525

V3 source:
- GitHub Actions run 35689229312
- artifact industrial-v3-e2e-results
- 20,842 rows, one execution-invalid in the original V3 closure
- joined to canonical by canonicalIndex

## Current V3 vs Lepton — exact historical project comparison

Cases: 17,317

Board count:
- V3 better: 1,266 = 7.3107%
- V3 equal: 16,008 = 92.4410%
- V3 worse: 43 = 0.2483%

Aggregate boards:
- V3: 51,450
- Lepton: 52,698
- net boards saved by V3: 1,248

Gap magnitude:
- 42 / 43 worse cases are +1 board
- 1 case is +3 boards:
  - 4098135: Lepton 57, V3 60, safe LB 57

Lower-bound relation:
- V3 equals its reported safe lower bound on 15,918 / 17,317 cases
- 41 / 43 Lepton-gap cases already have safe LB exactly equal to Lepton board count
- only 2 / 43 have an LB below Lepton

Conclusion:
- the dominant remaining board-count problem is NOT lower-bound weakness
- in almost every Lepton gap, the optimizer already knows the target board count
- the missing capability is constructing/materializing the required pattern

## Where the 43 board gaps live

Master categories:
- C-full40-incremental: 35
- A-high-types: 4
- B-mid-repeat: 4
- no-master: 0

This is a strong separation:
- every historical Lepton board gap is in a Master-search route
- no-master paths have zero board gaps in this exact historical comparison

## No-master population

Historical comparable no-master:
- cases: 15,885
- worse than Lepton: 0
- reaches reported safe LB: 15,885 / 15,885 = 100%

Timing:
- no-master wall: ~13,631.39 s
- share of historical project wall: 55.65%
- p50: ~237.16 ms
- p95: ~3,683.98 ms
- p99: ~8,613.04 ms

Interpretation:
- no-master is not a board-search problem
- more than half of historical wall is spent in cases where board optimality is already reached
- the primary opportunity there is fast construction/certification and avoiding equal-board work that cannot improve official remnant

This is consistent with the Blend Scotch and 4961912 sentinels.

## Structural compression of the 43 gaps

43 board-gap orders collapse to only 37 structural geometry fingerprints.

Repeated families include:
- c6951a8d664cb8e8ad87:
  - 4055174
  - 4055177
- 4527f0ec468379596ad6:
  - 4035484
  - 4034825
  - 4034830
- 107f957e13e60e6bde16:
  - 4087476
  - 4087489
- b74f015e9fb28a41514e:
  - 4129718
  - 4129782
- de9cfda23e7b007df905:
  - 4060744
  - 4040363

Therefore the remaining gaps are better treated as structural families than as isolated order IDs.

Frozen sanitized fixture:
- research/optimizer/pattern-generators/guide-row/fixtures/HISTORICAL_43_LEPTON_GAPS.json.gz.b64

No client/user names are stored in the fixture.

## Guide-Row H2 diagnostic across all 43 historical gaps

Workflow:
- Optimizer Historical 43 Gap H2
- run 35780938666

Candidate validity:
- cases: 43
- structural families: 37
- candidate errors: 0
- invalid candidates: 0
- reference errors: 0

Raw H2 diagnostic:
- solutions at/better than Lepton board count among stored-gap fixture: 12
- strict fresh-current-V3 board improvements observed: at least 6
- improves but still above Lepton: 1
- same boards as fresh V3: 28
- H2 board regressions vs current V3: 2
- equal-board remnant regressions: 11
- equal-board remnant equal: 11
- equal-board remnant better: 6

Timing on all 43:
- H2 candidate total: 5,460.974 ms
- fresh current V3 references: 198,937.997 ms
- H2 candidate generation is ~36.4x lower aggregate wall on this diagnostic cohort

Confirmed strict current-V3 board wins include:
- 4055174: 7 -> 6 = Lepton 6
- 4055177: 7 -> 6 = Lepton 6
- 4113928: 23 -> 22 = Lepton 22
- 4066786: 15 -> 14 = Lepton 14
- 4111589: 15 -> 14 = Lepton 14
- 4122824: 18 -> 17 = Lepton 17

The two 405517x wins are one structural family.

### H2 decision

Raw H2 MUST NOT replace V3 globally:
- 2 candidates use more boards than V3
- 11 equal-board candidates have worse official remnant quality

But H2 is valuable as a strict board rescue.

Safe architecture now under CI:
1. run current V3 unchanged
2. if V3 already reaches safe LB, do not run H2
3. only when V3 boards > safe LB, build H2 alternative
4. accept H2 only when:
   - physically valid
   - exact demand valid
   - strictly fewer boards than final V3
5. equal-board H2 candidates are never accepted
6. any failure/miss returns exact V3

This architecture cannot introduce an equal-board remnant regression because H2 never replaces V3 at equal board count.

Implementation:
- research/optimizer/pattern-generators/guide-row/integrated-v10-h2-board-rescue.mjs
- initial commit: e4d074fae4ddf2e18a6e36e96aca8b72b92430df

Gate:
- research/optimizer/pattern-generators/guide-row/h2-board-rescue-43-ab.mjs
- workflow: .github/workflows/optimizer-h2-board-rescue-43.yml

## Old V10 benchmark improvement

The old 2,000-row benchmark contains 1,457 directly comparable OK project cases.

Old V10:
- better than Lepton: 61
- equal: 1,386
- worse: 10

Current V3 on the same 1,457:
- better: 77
- equal: 1,378
- worse: 2

Remaining two in that old benchmark slice:
- 4002432: Lepton 5, current V3 6
- 4008070: Lepton 3, current V3 4

This is direct evidence that the accepted V3 stack improved board quality as well as latency relative to the older V10 benchmark.

## No-master compactation latency lead

Repeated slow no-master structural family:
- structural fingerprint: 64b5d904205e92215cf9
- 11 historical project orders
- each: 66 pieces / 39 types
- Lepton = current V3 = safe LB = 5 boards
- historical accumulated wall ~180.85 s

First sentinel 4039892:
- compactation ON:
  - 5 boards
  - exact official quality: largest remnant 3,489,750 mm2
  - wall ~12,428 ms
  - compactation ~8,527 ms
  - compactation board gains: 0
- compactation OFF:
  - 5 boards
  - exact same official remnant quality
  - wall ~3,686 ms

Sentinel saving:
- ~70.3% wall

This is NOT yet a general compactation-skip rule.
The full 11-family A/B is being validated separately before any promotion.

## Current direction

Board quality:
- focus on strict H2 rescue for V3 > safe-LB cases
- lower-bound research is no longer the first priority for known historical gaps

Latency:
- focus no-master equal-board stages, especially compactation
- cases already at safe LB should not pay expensive work unless that work has a demonstrated chance to improve official remnant

Do not promote either H2 rescue or compactation skipping until their dedicated gates pass.
