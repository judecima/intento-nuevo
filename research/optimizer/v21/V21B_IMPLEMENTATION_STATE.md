# V21b implementation state

## Current candidate

The previous `family-base/family-height -> optimizar(subset)` approach is **rejected** as the V21b candidate.
Historical evidence on 4058501 already showed that directed subset re-optimization can add many patterns without recovering the 8-board solution.

The active candidate on `optimizer-v21b-candidate` is now:

1. detect repeated geometric families from demand;
2. build a small **direct** `RepetitiveFamilyBasis`;
3. materialize each recipe as a physical two-stage guillotine board without calling `optimizar()`;
4. add those physical columns to Pattern Master;
5. reduce random rounds 40 -> 20 only when at least one direct column was produced;
6. otherwise retain the full legacy random-round count.

Runtime files:
- `src/lib/optimizer/experimental/repetitive-family-basis.cjs`;
- `src/lib/optimizer/legacy/patrones.cjs` behind `OPTIMIZER_V21_FAMILY_MASTER_EXPERIMENTAL=1`.

Unchanged:
- `src/lib/optimizer/legacy/v10.cjs`;
- coverage B&B;
- generic materialization;
- industrial validator;
- solver objective.

## Gold-case gate: 4058501

Historical fact:
- 40 random rounds -> 8 boards;
- 20 random rounds -> 9 boards;
- late winning basis includes `~700x740 x6 + ~999x449 x1 + ~799x449 x1`.

Direct generator result from geometry only:
- derives that exact consumption vector;
- also retains the complementary homogeneous `~700x740 x4` residual-demand column;
- gold recipe is four guillotine strips and 8 pieces;
- physical-board validation: geometry valid, cut sequence valid and complete, 8/8 pieces liberated.

This proves the missing late geometry can now be generated without random search. It does **not yet prove** that the full 20+direct Master pool closes the complete order in 8 boards; that remains the next runtime gate.

## Offline structural scan

On the 20,844 canonical cases, with family quota and global cap 24:
- generation errors: 0;
- total direct-basis generation time in the current analysis environment: ~9.9 s;
- average: ~0.47 ms/case;
- active cases: 13,580 / 20,844 = 65.15%;
- selected patterns average: 5.88/case;
- selected p95: 22;
- selected max: 24.

All five control cases produce a non-empty directed basis:
- 4058501;
- 4050594;
- 4056900;
- 4057401;
- 4059200.

These measurements are offline generation measurements, not the final board-count/performance benchmark.

## Gates before acceptance

1. executable smoke: direct 4058501 vector + residual column + industrial physical validation;
2. full runtime 4058501: `20 random + direct` must recover 8 boards;
3. retain Master wins on 4050594, 4056900, 4057401 and 4059200;
4. frozen 213-case same-machine A/B: zero board regressions and V21 performance target;
5. 8,669-case zero-board-regression validation before production activation.

The separate old V21 certified prepass remains OFF during these measurements.
