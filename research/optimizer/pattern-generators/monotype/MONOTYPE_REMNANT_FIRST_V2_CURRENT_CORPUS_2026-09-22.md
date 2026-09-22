# Monotype Remnant-First v2 — Current-Corpus Closure — 2026-09-22

Status: CURRENT-CORPUS PASS / DISABLED RESEARCH INTEGRATION / NOT PRODUCTION-PROMOTED

Branch: `research/perfv3-industrial-incremental-20260922`

## Objective

Close the monotype gap left intentionally outside Guide-Row R3-M.

The problem is not primarily board count. For repeated identical pieces the general motor can reach the same number of boards while selecting a shallower machine tree before the official commercial-remnant objective. For monotype this can leave a worse reusable remainder or spend unnecessary V10 outer-stage CPU.

The research path therefore tests:

1. one logical piece type only;
2. build a complete candidate directly with the legacy motor;
3. at equal board count, make the motor remnant-first by setting `preferirMenorProfundidad=false`;
4. validate the complete physical plan;
5. certify board optimality with the existing safe lower-bound stack;
6. early return only when candidate boards == safe LB;
7. otherwise fall back to full current V3.

Production remains unchanged. The feature flag is OFF by default.

## Validated research envelope

Current validation intentionally excludes:
- directional/grained requests;
- explicit `canRotate=false`;
- nonzero trim in this harness;
- more than 300 pieces.

These exclusions are validation-envelope restrictions, not claims that the method cannot work there.

No material-name grain inference is used.

## Current-corpus mining cohort

The current 16,986-case mining corpus contains:

- 1,724 geometry-only monotype requests
- 1,620 with Lepton using 1 board
- 104 with Lepton using 2 boards
- quantity range up to 300 pieces

Two known monotype counterexamples that previously forced monotype out of R3-M are included:
- 5273448: 68 x 300x200 on 2600x1830
- 5326719: 12 x 644x560 on 2750x1830

## Raw remnant-first candidate result

Across all 1,724 current-corpus monotype geometries:

- invalid plans: 0
- raw board wins vs V3: 0
- raw board losses vs V3: 1
- equal-board remnant regressions: 0
- equal-board remnant equal: 1,701
- equal-board remnant better: 22

The single raw board loss is:
- case 5245005
- 97 x 145x380 on 2400x1220
- candidate: 3 boards
- current V3 / Lepton: 2 boards

This proves the direct candidate cannot be accepted unconditionally.

## Safe certification

### Area lower bound only

The direct candidate reaches area LB in:
- 1,699 / 1,724
- 98.55%

The board-loss case 5245005 is rejected:
- candidate = 3
- area LB = 2

### Existing Hybrid LB

The existing validated Hybrid LB is then evaluated with:
- Raster OFF
- DFF FS0 ON
- contradiction guard: a lower bound above a valid incumbent is never used

It certifies 24 of the 25 area-LB misses.

Final current-corpus coverage:
- certified: 1,723 / 1,724
- coverage: 99.942%
- fallback: 1 / 1,724
- LB violations: 0
- invalids: 0

The sole fallback remains 5245005:
- candidate = 3
- safe LB = 2
- full V3 = 2

Therefore the only observed raw board regression is rejected before acceptance.

The Hybrid LB itself is cheap:
- cumulative Hybrid-LB cost across all 1,724 cases: ~244.9 ms

## Broad timing measurement

Using the available Linux runtime bundle on the same 1,724 current-corpus geometries:

Full V3:
- total: ~31.665 s

Safe monotype path:
- direct candidate total: ~10.811 s
- Hybrid LB total: ~0.245 s
- one V3 fallback: ~1.145 s
- total: ~12.201 s

Derived:
- total saving: 61.47%
- aggregate speedup: 2.60x
- average: 7.08 ms / case
- p50: 2.51 ms
- p95: 21.78 ms
- p99: 88.76 ms

This broad timing is discovery/mining evidence from the downloadable runtime bundle. The current-source integration is separately validated below in GitHub Actions.

## Current-source Rust integration gate

Research integration:
- `research/optimizer/pattern-generators/monotype/integrated-v10-monotype-remnant-first.mjs`

Focused A/B:
- `research/optimizer/pattern-generators/monotype/monotype-remnant-first-ab.mjs`

Workflow:
- `.github/workflows/optimizer-monotype-remnant-first.yml`

Important commits:
- first integration: `e6f58300893330357436d89d1778a40fb633cd38`
- Rust-aware CI: `b938b424efe8d57d4aeba9119baad12d86402576`
- Hybrid-LB certification: `75e3200359b72a05a196ea0a040c1c592488c875`
- corrected Hybrid-LB A/B expectation: `2a108fe883e15d5ccd4e4fb57fa176779a37daec`

GitHub Actions:
- run `35761546152`
- conclusion: SUCCESS
- native Rust generator rebuilt in the workflow

Focused adversarial cohort:
- 25 real monotype geometries
- includes both original R3-M monotype failures
- includes the sole raw board-loss case
- includes all 22 discovered equal-board remnant improvements

Result:
- certified: 24
- fallback: 1
- invalid: 0
- board losses: 0
- remnant regressions: 0
- remnant equal: 3
- remnant better: 22

Focused timing:
- integrated: 2,375.325 ms
- current V3 reference: 3,532.431 ms
- saving: 32.76%
- speedup: 1.49x

This focused set deliberately contains the expensive fallback 5245005, so its timing is not representative of the full 1,724-case distribution.

## Known counterexamples now handled correctly

### 5273448
Current V3:
- 1 board
- largest remnant: 458,415 mm2

Monotype remnant-first:
- 1 board
- exact official remnant parity

### 5326719
Current V3:
- 1 board
- largest remnant: 317,105.6 mm2

Monotype remnant-first:
- 1 board
- exact official remnant parity

### 5245005
Raw candidate:
- 3 boards

Safe LB:
- 2 boards

Current V3:
- 2 boards

Decision:
- NOT certified
- mandatory V3 fallback
- final integrated result exactly preserves V3 board count and official remnant

## Remnant improvements

22 current-corpus monotype cases produced better official equal-board remnant than V3 during mining.

The focused current-source Rust CI reproduces all 22 as improvements, including 5329174, which was initially outside the area-LB gate but becomes safely certifiable through the existing Hybrid LB.

## Frozen research rule

Monotype Remnant-First v2 may early-return only when all are true:

1. experimental flag explicitly enabled;
2. exactly one logical type;
3. non-directional request;
4. rotation is not explicitly locked;
5. trim is 0/0 in the currently validated envelope;
6. 1..300 pieces;
7. direct remnant-first candidate is physically valid;
8. exact demand is preserved;
9. safe LB has no incumbent contradiction;
10. candidate board count equals safe LB.

Safe LB:
- max(area LB, existing Hybrid LB)
- Hybrid uses Raster OFF + DFF FS0 ON.

Every miss falls back to current V3.

## Decision

Monotype Remnant-First v2 is a real current-corpus improvement:
- very high certification coverage: 99.94%
- no accepted board regressions observed
- no accepted equal-board remnant regressions observed
- 22 equal-board remnant improvements
- broad measured latency reduction ~61%
- exact V3 fallback for the single raw board-count counterexample

It remains:
- research-only
- disabled by default
- not production-promoted

Reason:
the same current 16,986 corpus was used for discovery/mining. A future sealed external corpus must validate the frozen rule without retuning before production promotion.

## Next research tracks without consuming the sealed future holdout

1. directional/grained validation using authoritative per-piece `canRotate` semantics;
2. nonzero-trim monotype validation as a separate envelope extension;
3. continue R3-M only through external validation, not retuning;
4. do not expand the monotype rule based on the future sealed corpus before its first frozen validation.
