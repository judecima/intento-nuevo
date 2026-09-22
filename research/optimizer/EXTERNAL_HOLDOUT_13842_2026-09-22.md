# Sealed External Holdout — Monotype PASS / Frozen R3-M FAIL — 2026-09-22

Status: FIRST EXTERNAL VALIDATION CLOSED

Branch: `research/perfv3-industrial-incremental-20260922`

## Input

Four user-supplied ZIP archives were treated as a sealed holdout before any threshold/polish retuning.

SHA256:
- validacion_1(1).zip: `1d71e9b73aee1ff67da9a889290edb0cfa163b5afe9dfc9ecdb29af426eabb0d`
- validacion_2(1).zip: `f7a6271fe27721d574153174e44872949a34a5685f0916defd228e4579718096`
- validacion_3(1).zip: `c21a03fc10cfa4f1d1b42b489072e4a0555d219d3731c4692c03d3372477f3ae`
- validacion_4(1).zip: `e220f84c74ed36c45d947b8e7958ff50ef1f4473de16f1303175d4f445e6c6b8`

Raw XML:
- 13,842

Canonical project-parser result:
- valid: 13,839
- excluded mixed-board-formats: 3
- excluded order IDs: 5348821, 5353096, 5404583
- order range: 5,336,679 .. 5,431,046
- no overlap with the previous corpus boundary

The normalized dataset SHA256 was:
- `3bd8871633d45ff6552e3fb0159c7c7c93baaa6b0884041ce9f16f58a44fb684`

Privacy:
- validation was performed on normalized geometry/order IDs;
- customer names from filenames are not retained in repo artifacts.

## Runtime identity check

The locally materialized optimizer runtime was not accepted by date alone.
Git blob hashes were compared against the active research branch and matched exactly for:

- `src/lib/optimizer/legacy/v10.cjs`
  - `0e7c2af1935427a513545135241c35f5e3e3e525`
- `src/lib/optimizer/legacy/motor.cjs`
  - `f49acb98e142272e946aba9fe85589da278c4771`
- `src/lib/optimizer/experimental/hybrid-lower-bound.cjs`
  - `3d99ac871a3c51f65bb04b5b11232e14dc084e63`
- `src/lib/optimizer/legacy/validador_industrial_v3.cjs`
  - `cba59dfff4fb7c19ca30e58100bef7e4718a7f7c`

Therefore the reference V3 core used in this holdout matches the current branch.

## Orientation limitation of Project XML

These XMLs are `<project>` files.
The canonical parser can reconstruct geometry and Lepton placements, but project XML does not contain authoritative current application-level per-piece `canRotate` overrides.

Therefore:
- this external holdout certifies the geometry/non-directional envelope;
- it does NOT certify the new directional/grained Monotype-v3 extension;
- no material-name grain inference was used.

---

# Monotype Remnant-First v3 — EXTERNAL PASS

Eligible external cases:
- exactly 1 logical type
- <=300 pieces
- project XML normalized to the non-directional geometry envelope
- count: 1,483

Result:
- completed: 1,483 / 1,483
- certified early: 1,479
- fallback to V3: 4
- certification coverage: 99.7303%
- invalid integrated plans: 0
- invalid V3 reference plans: 0
- board losses vs V3: 0
- board wins vs V3: 0
- equal-board remnant regressions: 0
- equal-board remnant equal: 1,456
- equal-board remnant better: 27

Fallback cases:
- 5373903
- 5399912
- 5375309
- 5346438

All four used exact V3 fallback and matched the V3 board count.

## Monotype vs Lepton — board count

Across the 1,483 external monotype cases:

Monotype fast path final result:
- better than Lepton: 27
- equal to Lepton: 1,456
- worse than Lepton: 0
- aggregate boards saved vs Lepton: 33
- maximum saving in one case: 6 boards

Current V3 has the same board-count distribution on this cohort.
The Monotype fast path's additional value on this holdout is therefore:
- latency reduction;
- 27 equal-board remnant improvements vs V3;
- no board-count sacrifice.

## Monotype timing

Across all 1,483 eligible external cases, including fallback overhead:

- Monotype integrated total: 78,135.980 ms
- V3 reference total: 174,175.445 ms
- total saving: 55.14%
- aggregate speedup: 2.23x

Latency:
- p50: 11.62 ms vs V3 32.40 ms
- p95: 230.30 ms vs V3 486.76 ms
- p99: 703.14 ms vs V3 1,449.96 ms

Decision:
- Monotype Remnant-First passes its first sealed external geometry validation.
- The non-directional/trim=0 portion has now moved from discovery-only evidence to external evidence.
- Directional/grained and trim-extension claims remain separately unvalidated by this project-XML holdout.

---

# Frozen R3-M — EXTERNAL FAIL

External pre-candidates under the frozen R3-M pre-gate:
- 2..3 logical types
- <=160 pieces
- non-directional geometry envelope
- count: 2,112

Frozen R3-M screening:
- successful candidates: 2,112 / 2,112
- frozen R3-M certifications: 354
- certification rate over pre-candidates: 16.7614%
- LB violations: 0
- candidate errors: 0

Fallback reasons:
- NATURAL_STATES_GT_3: 1,444
- SECOND_REMNANT_NONZERO: 312
- LB_NOT_REACHED: 2

## Frozen R3-M certified cases vs Lepton

Among the 354 frozen certifications:
- better than Lepton in boards: 6
- equal to Lepton in boards: 348
- worse than Lepton in boards: 0
- boards saved vs Lepton: 6

Current V3 has the same board-count distribution on these 354 cases.

## Frozen R3-M vs V3

Full V3 was run only on the 354 certified cases.

Board objective:
- board losses: 0
- board wins: 0
- exact board parity: 354 / 354
- reference invalids: 0

Equal-board remnant:
- equal: 350
- better: 0
- worse: 4

Frozen R3-M therefore FAILS the required zero-remnant-regression external gate.

Regression order IDs:
- 5344286
- 5362238
- 5407018
- 5344296

### 5344286 / 5344296
Geometry:
- board 2750x1830
- kerf 5.0
- 3 x 600x500
- 1 x 2080x778
- 1 board

Frozen R3-M:
- largest remnant: 2,177,760 mm2
- second: 0

V3:
- largest remnant: 2,177,760 mm2
- second: 189,000 mm2

### 5362238
Geometry:
- board 2750x1850
- kerf 5.0
- 10 x 492x432
- 2 x 1862x572
- 1 board

Frozen R3-M:
- commercial remnant: 0

V3:
- largest: 155,088 mm2
- second: 155,088 mm2

### 5407018
Geometry:
- board 3000x1200
- kerf 4.4
- 8 x 350x300
- 1 x 2100x832
- 1 board

Frozen R3-M:
- largest: 745,139.2 mm2
- second: 0

V3:
- largest: 745,139.2 mm2
- second: 197,680 mm2

## Frozen R3-M timing on certified cases

Before considering the remnant failure:
- candidate total: 13,305.496 ms
- V3 total: 60,790.648 ms
- potential saving: 78.11%
- speedup: 4.57x

p50:
- 19.59 ms vs 78.48 ms

p95:
- 147.30 ms vs 548.60 ms

p99:
- 255.97 ms vs 1,648.50 ms

This speed is NOT promotable because the remnant acceptance criterion failed.

Decision:
- frozen R3-M stays research-only;
- do not production-promote the frozen R3-M rule;
- the first sealed external test is recorded as FAIL.

---

# R3-M v4 — HOLDOUT-INFORMED RESEARCH

After freezing the FAIL above, the four regressions were analyzed.

All four are inside:
- candidate boards = 1
- naturalStates = 3

A new remnant-first polish was tested:
- `preferirMenorProfundidad=false`
- noise 0.4
- 4 passes
- 4 restarts per board
- Beam OFF
- Rescue OFF
- MultiVariants OFF

The polish recovered exact V3 remnant quality in all four original regressions.

Applied as a lexicographic polish over all 354 frozen hits:
- board losses: 0
- remnant regressions: 0
- remnant equal: 348
- remnant better than V3: 6
- polish selected over the base candidate in 10 cases

A targeted risk policy running that polish only when:
- candidate boards = 1
- naturalStates = 3

would run on:
- 165 / 354 frozen hits

Measured same-holdout timing:
- base candidate total: 13,305.496 ms
- targeted risk polish added: 3,477.408 ms
- candidate + targeted polish: 16,782.904 ms
- V3 reference: 60,790.648 ms
- saving vs V3: 72.39%
- speedup: 3.62x

Implementation:
- `research/optimizer/pattern-generators/guide-row/integrated-v10-r3m-v4.mjs`

Important:
- R3-M v4 is informed by this holdout.
- This 13,842-XML dataset can no longer be used as external validation for v4.
- v4 requires a later sealed corpus before any promotion claim.

---

# Overall decision

1. Monotype Remnant-First:
   - external geometry PASS;
   - 0 board regressions;
   - 0 remnant regressions;
   - material latency improvement.

2. Frozen R3-M:
   - external FAIL;
   - board objective safe;
   - 4 equal-board remnant regressions;
   - remains disabled.

3. R3-M v4:
   - fixes all known external failures on the now-consumed holdout;
   - preserves same frozen hit set;
   - does not expand the certification region;
   - is a new research candidate, not externally validated.

4. Directional/grained validation:
   - still requires authoritative per-piece `canRotate` inputs;
   - project XML alone cannot certify that envelope.
