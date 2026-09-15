# Remnant-Safe Directed Generation — gate closed (2026-09-15)

## Decision

**REJECTED for promotion.**

The previous Directed Generation V2 research remains valid for board-count generation efficiency, but a Fast-first production return must respect the full objective tuple:

1. minimum board count;
2. at equal board count, better commercial-remnant quality;
3. never add a board only to improve remnant.

This bounded experiment tested whether the 20k corpus can identify a conservative early-return region where a cheap remnant polish is empirically equivalent to or better than V10 balanced. The acceptance gate was zero board regressions and zero equal-board remnant regressions on a fresh untouched audit holdout. No post-audit threshold changes were allowed.

## Corpus and candidate universe

Canonical corpus: 20,844 cases. The early-return research universe was restricted to geometries that could plausibly run synchronously: <=50 physical pieces and <=20 logical types.

Prepared with corrected Order rotation semantics:

- 15,758 eligible cases
- 13,168 Project
- 2,590 Order
- split by geometry signature: train 9,511 / validation 3,154 / test 3,093

A cheap deterministic candidate (`passes=2`, `restartsPerBoard=4`, `rescue=false`, `beam=false`) reached the area lower bound in 13,957 / 15,758 cases = 88.57%.

Candidate CPU over all 15,758:

- median 9.59 ms
- p95 52.37 ms
- max 326.11 ms

This established that a remnant-safe early-return rule could matter if it existed.

## Labeled V10 dataset

1,500 unique geometries were sampled stratified by format, LB band and candidate-remnant shape:

- train 800
- validation 300
- development test 400

Every row executed both the cheap candidate and V10 balanced and compared `calidadPlanPlacas` lexicographically: largest commercial remnant, second largest, fewer commercial fragments, then total commercial-remnant area.

The cheap 2x4 candidate was remnant-safe in only ~2/3 of cases, proving that lower-bound board certification alone is not enough.

## Single allowed refinement

The only refinement allowed was monotonic search expansion within the same legacy constructor:

`passes=4, restartsPerBoard=14, rescue=false, beam=false`

No new generator, mask portfolio or XML-specific rule was introduced.

Refined-candidate quality versus V10:

- train: 642/800 safe = 80.25%
- validation: 238/300 safe = 79.33%
- development test: 313/400 safe = 78.25%
- candidate CPU median: 70.31 ms
- candidate CPU p95: 486.72 ms

## Frozen conservative policy

A shallow decision tree was fitted only on train. Model selection used validation only. The frozen model was depth 5, min leaf 15, unsafe class weight 4. Only two leaves with zero validation regressions and conservative train support were eligible for early return.

Validation result after freezing:

- promoted: 52/300 = 17.33%
- board regressions: 0
- remnant regressions: 0
- safe closures captured: 52/238 = 21.85%

No thresholds or leaves were changed after this point.

## Fresh audit holdout

Because aggregate statistics from the original test split had already been inspected during research, the final gate used a new audit set of 500 previously unused unique test geometries selected from the remaining certified population.

Audit composition:

- 500 cases
- 416 Project
- 84 Order
- 0 execution errors

Frozen-policy result:

- promoted: 63/500 = 12.60%
- Project promoted: 58
- Order promoted: 5
- board regressions: 0
- **equal-board remnant regressions: 1**

Therefore the zero-regression gate fails.

### Counterexample

`4006562__rafael_ibanez4006562` (Order), LB=1, 10 pieces, 4 types.

Refined candidate, 1 board:

- largest commercial remnant: 249,412.5 mm²
- second: 235,029 mm²
- fragments: 3
- total commercial area: 700,104 mm²

V10 balanced, 1 board:

- largest commercial remnant: 280,188.5 mm²
- second: 0
- fragments: 1
- total commercial area: 280,188.5 mm²

The regression is real under the frozen objective because the largest commercial block has priority over total commercial-remnant area. The Order XML has no rotation-semantic anomaly that explains the difference.

## Latency value on the promoted audit subset

The policy also failed to show enough material latency value on the cases it promoted:

- promoted polish median: 17.87 ms
- promoted V10 median: 17.13 ms
- polish p95: 56.35 ms
- V10 p95: 74.37 ms
- net saved CPU across all 63 promoted audit cases: ~298 ms total

Thus even if the single remnant regression were ignored, this specific predictive early-return policy would not justify production complexity.

## Closure

**Remnant-Safe Directed Generation via predictive early return is CLOSED / REJECTED for V1.**

No threshold retuning, Order exception or case-specific branch is permitted from this result. Production source remains unchanged.

The next valid research direction, if reopened, must change the problem formulation rather than tighten this classifier: either derive a true remnant-quality certificate/upper bound or make generation itself remnant-aware while preserving the frozen V10 objective tuple. Another classifier refinement is explicitly out of scope.
