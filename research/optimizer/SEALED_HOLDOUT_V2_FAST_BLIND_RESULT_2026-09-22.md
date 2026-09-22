# SEALED HOLDOUT V2 — FROZEN FAST-PATH BLIND RESULT — 2026-09-22

Status: FIRST BLIND RESULT RECORDED / NO TUNING BEFORE RESULT

Repository:
`judecima/intento-nuevo`

Branch:
`research/perfv3-industrial-incremental-20260922`

Authoritative pre-holdout base:
`deeb9c1ba0e9c9154874d559a66901d6854790f2`

Manifest commit:
`9a26388bb57381f2b963337e8bf98cffecd86718`

Frozen blind workflow:
- `Optimizer Sealed Holdout V2 Fast Blind`
- successful run: **35789213413**
- 16 shards
- exact fixture checksum verified chunk-by-chunk before successful run

An earlier run 35788937676 failed during Brotli decompression before executing any optimizer case. It contains no optimizer observations and does not consume/tune the holdout.

## Holdout scope used in this run

Full canonical-valid holdout:
- 15,784 PROJECT cases

Frozen fast-route population:
- exactly 1 type: 1,568
- exactly 2..3 types: 2,524
- total evaluated here: **4,092**

This run intentionally includes out-of-envelope cases so frozen route fallbacks are measured, not filtered away.

No threshold, gate, round count, risk region, polish parameter, H2 rule, early-LB rule, or fallback behavior was modified before this result.

PROJECT XML is used as geometry/non-directional validation only. No material-name grain inference is used and this does not claim application-level per-piece canRotate external validation.

## Combined frozen Safe Cascade on the 4,092 fast-route population

- cases: **4,092**
- certified: **2,018**
- fallback: **2,074**
- invalid integrated plans: **0**
- invalid V3 references: **0**
- board losses vs V3: **0**
- board wins vs V3: **0**
- equal-board remnant regressions: **0**
- remnant equal: **4,060**
- remnant better: **32**
- fallback exact parity: **2,074 / 2,074**
- fallback parity mismatches: **0**

Lepton board count:
- integrated better: 83
- equal: 3,998
- worse: 11
- V3 better: 83
- equal: 3,998
- worse: 11

Therefore the frozen cascade introduces **zero board-count changes vs V3** in this external population; all Lepton differences are inherited from V3.

Timing, including every fallback screen:
- integrated total: **379,252.633 ms**
- V3 total: **409,652.199 ms**
- net saving: **7.4208%**
- aggregate speedup: **1.0802x**
- p50: 18.861 vs 22.659 ms
- p95: 360.594 vs 385.890 ms
- p99: 1,312.794 vs 1,339.588 ms

Fallback economics:
- integrated fallback total: 352,097.473 ms
- standalone V3 on same fallback cases: 343,195.775 ms
- practical fallback screening overhead: **8,901.698 ms**

Certified economics:
- integrated certified total: 27,155.160 ms
- standalone V3 on same certified cases: 66,456.424 ms
- work saved on certifications: **39,301.264 ms**

Net:
- 39,301.264 ms saved on certifications
- minus 8,901.698 ms fallback overhead
- = **30,399.566 ms net saved**

## Frozen Monotype-v2 — new external result

Population:
- exactly one type: **1,568**

Result:
- certified: **1,545**
- fallback: **23**
- invalids: **0**
- board losses vs V3: **0**
- board wins vs V3: **0**
- remnant regressions: **0**
- remnant equal: **1,543**
- remnant better: **25**
- fallback exact parity: **23 / 23**
- fallback mismatches: **0**

Timing:
- integrated total: **67,742.086 ms**
- V3 total: **98,887.427 ms**
- saving: **31.4958%**
- speedup: **1.4598x**
- p50: 4.190 vs 10.769 ms
- p95: 77.267 vs 202.161 ms
- p99: 1,184.505 vs 1,233.175 ms

Lepton:
- better: 17
- equal: 1,550
- worse: 1

V3 has the exact same Lepton board classification, so Monotype-v2 preserves V3 board count exactly.

Decision:
**EXTERNAL PASS AGAIN** for the frozen geometry envelope and exact fallback behavior.

Reasons:
- MONOTYPE_SAFE_LB_CERTIFIED: 1,545
- PIECES_OUTSIDE_1_300: 21
- SAFE_LB_NOT_REACHED: 2

## R3-M-v4 — FIRST REAL EXTERNAL VALIDATION

Population:
- exactly 2..3 types: **2,524**

This is the first independent holdout after v4 was designed from the four remnant failures of the previous holdout.

Result:
- certified: **473**
- fallback: **2,051**
- invalid integrated plans: **0**
- invalid V3 references: **0**
- board losses vs V3: **0**
- board wins vs V3: **0**
- equal-board remnant regressions: **0**
- remnant equal: **2,517**
- remnant better: **7**
- fallback exact parity: **2,051 / 2,051**
- fallback mismatches: **0**
- risk polish attempted: **218**

Lepton:
- integrated better: 66
- equal: 2,448
- worse: 10
- standalone V3: exact same 66 / 2,448 / 10

Frozen certification/fallback reasons:
- R3M_V4_CERTIFIED: **473**
- NATURAL_STATES_GT_3: **1,662**
- SECOND_REMNANT_NONZERO: **362**
- PIECES_GT_160: **26**
- LB_NOT_REACHED: **1**

### R3-M-v4 safety gate

PASS:
- invalid plans = 0
- board losses vs V3 = 0
- equal-board remnant regressions = 0
- fallback parity exact = 2,051 / 2,051
- 7 equal-board remnant improvements

This is strong independent evidence that the v4 remnant fix generalizes beyond the consumed holdout that produced it.

### R3-M-v4 economics gate

Timing:
- integrated total: **311,510.547 ms**
- standalone V3: **310,764.772 ms**
- net saving: **-0.23998%**
- speedup: **0.99761x**
- p50: 35.053 vs 34.920 ms
- p95: 452.302 vs 452.983 ms
- p99: 1,361.025 vs 1,363.732 ms

Fallback:
- integrated fallback total: 304,586.461 ms
- V3 fallback reference total: 296,048.105 ms
- fallback overhead: **8,538.355 ms**

Certified:
- integrated certified total: 6,924.086 ms
- V3 certified reference total: 14,716.667 ms
- saving on certifications: **7,792.581 ms**

Net:
- 7,792.581 ms saved on certifications
- minus 8,538.355 ms fallback overhead
- = **-745.774 ms**

Decision:
**R3-M-v4 PASSES external correctness/remnant validation but FAILS the frozen route-level positive-net-latency acceptance criterion by 0.24%.**

Do not retune from this holdout until this first blind result is committed. After this commit, the corpus is consumed for future performance research.

## Whole fast-route cascade decision

On the complete 1..3-type population the combination is already net positive because Monotype savings more than pay the R3 fallback screening cost:
- net saving: **30.400 s**
- total saving: **7.42%**
- 0 invalids
- 0 board losses
- 0 remnant regressions
- exact fallback parity

However, the original acceptance protocol also required R3-M-v4 itself to have positive route economics. Therefore do not label R3-M-v4 a complete PASS yet.

## Next frozen work before any tuning

Still required for the complete holdout report:
1. current V3 on all 15,784 canonical-valid PROJECT cases
2. exact V3 vs physical Lepton board count
3. whole-corpus Safe Cascade route accounting, including the >3-type direct-V3 population
4. preserve all extreme piece-count cases; no sample trimming

Only after this report commit may the new holdout be used to investigate why R3 screening overhead grew enough to erase its certified-case savings.
