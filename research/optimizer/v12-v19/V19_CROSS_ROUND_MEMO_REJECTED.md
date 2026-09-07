# V19 — Cross-Round Memoization

## Decision

**REJECTED. Do not integrate into the active staged path.**

The hypothesis was to share the deterministic `empacarPlaca` cache across the 40 Pattern Master rounds while preserving exactly the same subsets, RNG sequence and number of rounds.

## Experimental implementation

The experiment used an opt-in hook and `cross-round-memoization.cjs`.

The stable key uses the original type `ref` assigned by `generarPatrones`, which remains stable between rounds within the same order. This prevents exchanging distinct types with identical geometry and preserves the Master coverage vector.

Only deterministic packings (`rnd == null`) are cached. `sharedPackingMinPool` was also tested to avoid caching small states where reconstruction is more expensive than recomputation.

## Finding 1 — caching everything is counterproductive

`4058501`, 20 rounds, full cache:

- hit rate: ~44.6%
- legacy: ~8.28 s
- cross-round: ~12.01 s
- the physical pool also changed because Beam Search is sensitive to wall-clock budgets

Changing the cost of `empacarPlaca` changes how much work fits inside `presupuestoBeamMs`; therefore even an exact local optimization can alter the explored search space.

## Finding 2 — large-pool threshold restores equivalence but not speed

With `sharedPackingMinPool = 35`, `4058501`, 40 rounds:

- Legacy: **130 patterns**
- V19: **130 patterns**
- usage vectors: **identical**
- physical digests: **identical**
- hits: **528**
- misses: **1078**
- hit rate: **32.9%**
- cache entries: **1078**

Separate-process timing:

- Legacy: **19.22 s**
- V19: **20.17 s**
- delta: **-4.94%**

The quality gate passes, but V19 is slower. Because the 40-round physical pool is identical, it also preserves the pattern set that enables the `4058501` rescue from 9 to 8 boards.

## Additional 20-round sample

| Case | Exact pool | Legacy | V19 | Delta | Hits |
|---|---:|---:|---:|---:|---:|
| 4056775 | yes | 4.74s | 4.90s | -3.29% | 33 |
| 4054508 | yes | 5.10s | 4.83s | +5.32% | 0 |
| 4061148 | yes | 4.01s | 4.52s | -12.62% | 0 |
| 4054400 | yes | 3.76s | 3.50s | +6.75% | 0 |

Aggregate:

- Legacy: **17.61 s**
- V19: **17.75 s**
- delta: **-0.78%**
- exact pools: **4/4**

Positive deltas in cases with zero hits are noise/JIT/load and cannot be attributed to memoization. The sample case with actual hits (`4056775`) was slower under V19.

## Flag-off gate

V18 snapshot vs V19 engine with the feature disabled, `4058501`, 20 rounds:

- V18: 69 patterns
- V19 flag OFF: 69 patterns
- usage vectors + physical digests: **identical**

The hook does not alter legacy behavior when disabled.

## Why rejected

The runtime cost includes:

1. state-key construction;
2. `Map` lookup;
3. remapping cached output to the concrete pieces in the current pool.

For many deterministic states, `empacarPlaca` is cheap enough that these costs cancel the benefit. Wall-clock search budgets additionally make broad memoization harder to compare bit-for-bit.

## What remains true

- 40 fallback rounds remain necessary.
- `4058501` remains the counterexample against globally reducing to 20 rounds.
- V16/V17 Hybrid LB + adaptive Raster + incremental Master remain valid.
- V18 is a perceived-latency architecture, not a throughput optimization.

## Recommended next work

1. Add an experimental deterministic search-budget mode based on nodes/expansions instead of wall clock, without changing the production default.
2. Profile and reduce the cost of generating each pattern (`llenar`, slice selection, configurations) in heavy F1 cases rather than caching the result afterward.
