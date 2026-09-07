# V15 F1 heavy attribution reanalysis — 2026-09-05

## Scope

This note reanalyzes the recovered V15 heavy-F1 benchmark before making any production/runtime change.

Historical cohort definition in the recovered artifact:

- `boards40 == areaLB + 1`
- `pieces >= 20`
- `types >= 8`
- 156 eligible cases
- harness forced `refiladoX=0` and `refiladoY=0`

Therefore the historical 156-case membership is not guaranteed to match production geometry when the real usable board is smaller due to trim. The recovered JSON contains `areaLB`, `boards20`, `boards40`, piece/type counts and bound results, but not the raw piece dimensions/total area needed to recompute exact membership under real trim. That recomputation must be done against the canonical/raw problem records before publishing production percentages.

## Causal corrections

Two earlier hypotheses are real defects/limitations, but neither explains the 4/156 V14 result in this cohort:

1. `strong-lower-bound.cjs` uses the full stock dimensions instead of trimmed usable dimensions. The heavy-F1 harness neutralized this by setting trim to zero.
2. V14's incompatibility clique gives up above 140 expanded instances. Only 22 of the 156 heavy-F1 cases exceed 140 pieces, so this cannot explain the full gap.

## Historical attribution already recoverable

Recovered artifact: `v15_f1_heavy_hybrid_lb_all.json`.

Counts:

- V14 certified: 4 / 156
- cheap Hybrid certified: 31 / 156
- full Hybrid certified: 32 / 156
- Raster added exactly one additional certification

Binding term among the 31 cheap-Hybrid certifications:

| term | certified cases |
| --- | ---: |
| kerf | 22 |
| DFF | 8 |
| area | 1 |

This is the strongest causal result so far: the historical V14 -> cheap-Hybrid gain is dominated by kerf and DFF, not by the clique-instance cutoff or by the trim bug.

The four V14 certifications were historically bound by:

- `wide>1/2`: 2 cases
- `incompatibility-clique`: 1 case
- `tall>1/3`: 1 case

The full Hybrid added one Raster-only case: order `4051062`.

## New lower-bounds bundle validation

The uploaded thin bundle points to:

- `380c5a8` — isolated strong lower bounds
- `1640a0a` — k-ary scanline projection
- `2d46b82` — split `proyeccion` and `proyeccionK` attribution

The bundle requires base `3eb1c9756fca43bcdc8a61500b62e45477068fb7`. Even without materializing that prerequisite locally, the new commit objects and several full blobs were recoverable directly from the pack.

Verified in the recovered blobs:

- `LowerBoundResult` contains a separate `proyeccionK` term.
- `maxKProyeccion` is present, default 9.
- the ablation script records `proyeccionK` separately.
- the report includes the six terms: `kerf`, `raster`, `dff`, `proyeccion`, `proyeccionK`, `clique`.

This separation is methodologically correct because the k=2 middle-line projection and the k-ary integrated scanline bound are different arguments and can be independently binding.

## Next benchmark order

Do not quote the 156-case percentages as production percentages yet.

Required order:

1. Reconstruct each historical case with its real production trim and recompute `areaLB`.
2. Rebuild F1 membership from `boards40 == realAreaLB + 1`.
3. Run bounds-only attribution on that corrected cohort.
4. Report both `alcanza` and `unico` for: kerf, raster, DFF, projection, k-ary projection and clique.
5. Only then decide which terms stay in the synchronous V17 certification cascade.

## Current conclusion

The evidence already falsifies the idea that the heavy-F1 gap was mainly a V14 geometry bug. The strongest existing signal is instead:

`kerf (22 cases) >> DFF (8 cases) >> Raster incremental (1 case)`

Projection and clique remain useful/safe families, but the next corrected-cohort ablation must quantify their marginal value before runtime simplification.
