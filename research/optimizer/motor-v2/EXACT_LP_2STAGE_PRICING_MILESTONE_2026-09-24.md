# Exact LP + 2-Stage Pricing Milestone — 2026-09-24

Status: **RESEARCH MILESTONE CLOSED — FINAL SERIAL GATE PASSED; COMPONENTS RETAINED FOR FURNITURE**

Branch: `research/exact-lp-2stage-pricing-20260924`

## What is now demonstrated

The previous serial pool limitation was not structural. The restricted master LP was solved exactly and an exact 2-stage guillotine pricing oracle was added.

All pricing columns are reconstructed physically and pass `validador_industrial_v3` before entering the pool.

### Restricted-master LP

| Case | Original exact LP | 2-stage LP | Improvement | Lepton |
|---|---:|---:|---:|---:|
| 5445701 | 612.7221 | 587.7570 | 24.9651 | 591 |
| 5445716 | 642.1849 | 615.0423 | 27.1426 | 621 |
| 5447573 | 609.8712 | 577.3597 | 32.5114 | 588 |
| 5456195 | 7680.0000 | 7680.0000 | 0.0000 | 7680 |

This confirms that the old pool was missing dense 2-stage mixed patterns. More importantly, after pricing the restricted-master LP is already below Lepton in all three Ignacio cases. The remaining observed quality loss is therefore an integer-rounding / residual-completion problem, not a demonstrated pattern-pool gap.

The earlier 20-round audit did **not** converge, but the final bounded rerun did. Initial 2-stage pricing stopped by `no-negative-reduced-cost` with an exact oracle in all three Ignacio cases:
- 5445701: 26 added columns, LP 587.757045;
- 5445716: 22 added columns, LP 615.042270;
- 5447573: 25 added columns, LP 577.359733.

The restricted 2-stage LP is therefore converged for the initial demand in these three cases. This still is not a global <=4-stage certificate.

## Physical validity

Every 2-stage column admitted to the pool is physically materialized and checked with the industrial validator.

Observed:
- `allAddedPatternsValid=true` in all four audit cases;
- geometry valid;
- complete guillotine cut sequence;
- complete coverage;
- no validation errors.

## LP-floor residual experiment

The LP-floor strategy produces valid plans quickly, but fixing every LP variable at floor loses quality:

| Case | LP floor boards | Residual pieces | Residual boards | Combined valid boards | Lepton |
|---|---:|---:|---:|---:|---:|
| 5445701 | 581 | 231 | 25 | 606 | 591 |
| 5445716 | 609 | 170 | 29 | 638 | 621 |
| 5447573 | 571 | 196 | 21 | 592 | 588 |
| 5456195 | 7680 | 0 | 0 | 7680 | 7680 |

Therefore LP floor is useful as a safe best-effort fallback seed, but not as the final integer strategy.

The key interpretation is: **the serial gap is now a rounding / residual problem, not a pool-density problem**. The floor leaves only 170-231 physical pieces, but the counted residual DFS packs them very poorly relative to the density of the original jobs. Repricing for the residual demand is the technically relevant next serial experiment, not more global DFS tuning.

## Exact LP dual bound inside counted coverage

The exact restricted-master dual was added as a valid lower bound for every residual state:

`LB = max(area LB, per-type coverage LB, ceil(dual · residual))`

Compared with the immediately previous run at the same 3 s master watchdog:

| Case | Branches before | Branches with dual LB | Change | Boards before | Boards after |
|---|---:|---:|---:|---:|---:|
| 5445701 | 12,639,085 | 567,411 | -95.5% | 796 | 796 |
| 5445716 | 18,478,712 | 6,026,119 | -67.4% | 798 | 652 |
| 5447573 | 17,224,330 | 606,292 | -96.5% | 775 | 775 |
| 5456195 | 921,647 | 0 | -100% | 8095 | 7680 |

Case 5456195 now reaches the exact 7680 solution in ~1.2 ms with zero search nodes.

The dual bound is a real reusable pruning improvement, but it should not be described as a throughput win by itself when wall time and incumbent quality are unchanged. The useful metrics are quality at equal time, time-to-target, or time-to-proof. The current counted DFS branching order/multiplicity strategy remains unsuitable for the Ignacio-scale integer masters.

## Decision

Stop tuning the serial counted DFS here.

Retain these components:
1. exact restricted-master LP;
2. exact physically validated 2-stage pricing oracle;
3. exact-LP dual lower bound for counted search;
4. LP-floor + residual as a bounded valid fallback, not as a quality-optimal solver.

Do not:
- increase serial watchdogs;
- keep tuning counted DFS specifically for Ignacio;
- treat the 20-round pricing result as converged;
- promote the serial route directly to production.

## Final iterative residual-repricing audit

The iterative residual-repricing experiment ran, but **the Lepton+2 gate was not evaluated** because the normal-engine finalizer was gated by an arbitrary <=100-piece threshold. The three Ignacio residuals stopped at 148-230 pieces with `finalizerMs=0` and no combined plan, so the prior "failed gate" wording was incorrect. Residual repricing still did not reveal another pool-density gap.

| Case | Converged global 2-stage LP | First floor boards | Residual pieces | Residual LP | Second floor progress | Residual pricing status |
|---|---:|---:|---:|---:|---|---|
| 5445701 | 587.7570 | 580 | 198 | 7.7570 | none | exact, no negative reduced cost |
| 5445716 | 615.0423 | 609 | 148 | 6.0423 | none | demand caps bind; not certified |
| 5447573 | 577.3597 | 570 | 230 | 7.3597 | none | demand caps bind; not certified |
| 5456195 | 7680.0000 | 7680 | 0 | 0 | complete | exact |

For 5445701 the residual pricing problem is exact for the modeled 2-stage family and converges with no negative reduced-cost column, yet every residual LP variable remains below 1 so a second floor fixes zero boards. That is direct evidence that the remaining gap is an **integer rounding / completion** problem, not a missing-column problem in the 2-stage pool.

For 5445716 and 5447573, small per-type residual demands make demand caps bind. The current oracle correctly reports residual pricing as non-certified rather than claiming convergence. Even there, no additional admissible column was added and floor made no progress.

The residuals remained above the <=100-piece loop threshold, so the finalizer never ran even though 148-230 pieces is within the normal furniture-size regime already handled elsewhere by the engine. One final minimal audit is therefore justified: if floor makes no progress, run the normal engine anyway for residuals up to 300 pieces, materialize the combined plan, validate it industrially, and evaluate the original Lepton+2 gate.

Gate:
- 5445701 <= 593 boards;
- 5445716 <= 623 boards;
- 5447573 <= 590 boards;
- all three combined plans industrial-valid.

## Final serial gate result

The finalizer was allowed to run for stalled residuals up to 300 pieces. The original Lepton+2 gate passed in all three Ignacio cases, and every combined plan passed industrial validation.

| Case | Lepton | Fixed boards | Residual pieces | Finalizer boards | Final combined | Delta vs Lepton | Finalizer time |
|---|---:|---:|---:|---:|---:|---:|---:|
| 5445701 | 591 | 580 | 198 | 8 | **588** | **-3** | 0.784 s |
| 5445716 | 621 | 609 | 148 | 7 | **616** | **-5** | 2.756 s |
| 5447573 | 588 | 570 | 230 | 8 | **578** | **-10** | 7.587 s |
| 5456195 | 7680 | 7680 | 0 | 0 | **7680** | 0 | 0 s |

All four combined plans are industrial-valid and all four report `gateLeptonPlus2=true`.

This demonstrates a complete serial pipeline:
1. exact restricted-master LP;
2. converged exact 2-stage pricing on the initial demand;
3. floor the LP solution;
4. optionally inspect/reprice the residual;
5. finish the stalled furniture-sized residual with the normal engine;
6. materialize the mixed plan and validate it industrially.

For the three Ignacio cases, the pipeline does not merely reach Lepton+2: it beats Lepton by 3, 5 and 10 boards respectively.

Important caveat: residual pricing is exact for 5445701 but demand caps bind in the residual pricing audit for 5445716 and 5447573. The **final plans are still valid**; this only limits what can be claimed about residual-pricing optimality.

The remaining concern is latency of the normal-engine residual finalizer. The 230-piece residual took ~7.6 s despite a nominal 3 s finalizer budget, so timeout/budget enforcement must be audited before this route is considered production-ready.

Serial research closes here as a successful architectural proof. Do not continue tuning counted DFS.

Next product milestone:
- return to furniture / Lepton <= 75 boards;
- first test exact LP + additive 2-stage pricing on the real Lepton gap cohort;
- then test root LP / dual-bound effects on advanced-exhausted LB+1 cases;
- measure quality vs Lepton, p95/p99 CPU, and the share of AE cases certified before expensive Master generation independently.


## Important limits when transferring to furniture

- The 2-stage pricing oracle is exact only for the 2-stage guillotine family it models. It does not certify the full <=4-stage optimizer.
- Dual prices from the restricted master are valid for pruning inside the current pool, but they are not a global optimality certificate for 3/4-stage layouts.
- In furniture, 2-stage pricing should be additive to P16/P40 pattern generation, not a replacement.
- A future global certificate needs an upper bound on pricing value for the full allowed family (for example a Farley-style bound using a valid upper bound on per-board dual value).
- Measure three axes separately: quality vs Lepton, p95/p99 CPU, and percentage of advanced-exhausted cases certified before entering expensive Master generation.
