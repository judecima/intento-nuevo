# V14 Strong Lower Bound — reassessment (2026-09-05)

## Status

This note corrects a causal interpretation that emerged while reviewing the recovered `strong-lower-bound.cjs` and the new lower-bound bundle.

## Confirmed implementation issues in recovered V14

The recovered `src/lib/optimizer/experimental/strong-lower-bound.cjs` uses the full stock rectangle in three places instead of the usable trimmed rectangle:

- `feasibleOrientations`
- `greedyIncompatibilityClique`
- `computeStrongLowerBound`

The runtime optimizer uses usable dimensions after trim. Therefore this is a real semantic inconsistency and makes V14 bounds weaker than necessary whenever trim is non-zero.

The recovered V14 clique also expands quantities to physical instances and returns zero when total instances exceed `maxCliqueInstances` (default 140). This is a real scalability limitation.

## Important correction: these do NOT explain the recorded 4/156 F1-heavy result

The historical V15 harness that produced the 156-case F1-heavy cohort explicitly constructs its bound options with:

```js
refiladoX: 0,
refiladoY: 0,
```

Therefore the trim bug was not active in that benchmark at all.

The same cohort contains only 22 cases with more than 140 pieces. Consequently the V14 instance-count clique cutoff can affect at most 22/156 = 14.1% of that cohort. In those 22 cases:

- V14 certified: 0
- cheap hybrid certified: 3
- full hybrid certified: 3

For the remaining 134 cases with <=140 pieces:

- V14 certified: 4
- cheap hybrid certified: 28
- full hybrid certified: 29

So the clique cutoff is a real issue, but it cannot be the primary explanation for the overall V14 4/156 result.

## Exact V14 certifications in the 156-case heavy cohort

Historical records show only four V14 certifications:

| order | pieces | types | areaLB | boards40 | V14 reason |
|---:|---:|---:|---:|---:|---|
| 4058279 | 52 | 9 | 2 | 3 | `wide>1/2` |
| 4056355 | 112 | 8 | 3 | 4 | `incompatibility-clique` |
| 4059884 | 24 | 9 | 4 | 5 | `tall>1/3` |
| 4059655 | 30 | 18 | 5 | 6 | `wide>1/2` |

This confirms that V14 projection/clique logic can certify some hard cases, but its poor heavy-cohort coverage is not attributable solely to trim or the 140-instance guard.

## New lower-bound bundle

The supplied lower-bound branch is architecturally different rather than a direct V14 fix:

- computes against usable stock (`placaBase - refiladoX`, `placaAltura - refiladoY`)
- has kerf-inflated area
- DFF
- representability/raster
- projection
- weighted incompatibility clique at TYPE level
- k-ary scanline projection (k=2..9) in kerf-inflated space

The type-level clique avoids expanding all physical instances. If a type is incompatible with itself, its multiplicity becomes the vertex weight; otherwise it contributes weight 1.

## Consequence for future ablation

Do not attribute the historical V14-vs-new-LB gap to the trim bug without rebuilding the exact cohort with real trim semantics. The next rigorous ablation should be:

1. V14 historical behavior
2. V14 with usable stock dimensions corrected everywhere
3. V14 + type-level weighted clique
4. V14 + k-ary projection in usable/kerf-inflated space
5. full new lower-bound module

All variants must run against the same frozen canonical cohort and the same recorded target board counts. No runtime rescue timing should be used to decide bound correctness because wall-clock Beam/Master budgets alter explored search space.

## V19

Cross-round memoization remains rejected. Its quality-equivalence gate passed on the gold case but runtime worsened. Do not revisit memoization at `empacarPlaca` granularity unless the cached operation becomes materially more expensive or the surrounding cost model changes.
