# Exact LP + 2-Stage Pricing Milestone — 2026-09-24

Status: **RESEARCH MILESTONE — ONE FINAL ROUNDING AUDIT ACTIVE; COUNTED-DFS TUNING CLOSED**

Branch: `research/exact-lp-2stage-pricing-20260924`

## What is now demonstrated

The previous serial pool limitation was not structural. The restricted master LP was solved exactly and an exact 2-stage guillotine pricing oracle was added.

All pricing columns are reconstructed physically and pass `validador_industrial_v3` before entering the pool.

### Restricted-master LP

| Case | Original exact LP | 2-stage LP | Improvement | Lepton |
|---|---:|---:|---:|---:|
| 5445701 | 612.7221 | 587.8407 | 24.8814 | 591 |
| 5445716 | 642.1849 | 615.1651 | 27.0198 | 621 |
| 5447573 | 609.8712 | 577.7330 | 32.1382 | 588 |
| 5456195 | 7680.0000 | 7680.0000 | 0.0000 | 7680 |

This confirms that the old pool was missing dense 2-stage mixed patterns. More importantly, after pricing the restricted-master LP is already below Lepton in all three Ignacio cases. The remaining observed quality loss is therefore an integer-rounding / residual-completion problem, not a demonstrated pattern-pool gap.

The 20-round audit did **not** converge by reduced cost. Round 19 still had negative reduced cost in all three Ignacio cases:
- 5445701: about -0.00408;
- 5445716: about -0.00948;
- 5447573: about -0.00645.

Therefore the true optimum of the current 2-stage restricted family is at least slightly below the reported LP values. A round cap is a safety budget, not a convergence certificate.

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

One final bounded serial experiment is still justified because it reuses the already-built components and attacks the actual remaining gap. Important caveat: once residual quantities become small, per-type demand caps can bind the 2-stage pricing problem. The current oracle is exact only when its unconstrained optimum respects those caps; any cap-binding residual is reported as non-certified pricing rather than falsely declared converged.

Experiment:
1. floor the current LP;
2. re-solve/re-price on the residual demand;
3. repeat until the residual is furniture-sized (roughly <=100 pieces) or a hard research budget is reached;
4. finish that small residual with the normal engine;
5. require a fully materialized industrial-valid result.

Gate: all three Ignacio cases must finish at Lepton+2 boards or better. Otherwise close the serial line.

Next product milestone:
- return to furniture / Lepton <= 75 boards;
- test exact LP + 2-stage pricing on real furniture quality gaps;
- test the dual bound on Master-active furniture cases;
- measure p95/p99 and board-count regressions independently.


## Important limits when transferring to furniture

- The 2-stage pricing oracle is exact only for the 2-stage guillotine family it models. It does not certify the full <=4-stage optimizer.
- Dual prices from the restricted master are valid for pruning inside the current pool, but they are not a global optimality certificate for 3/4-stage layouts.
- In furniture, 2-stage pricing should be additive to P16/P40 pattern generation, not a replacement.
- A future global certificate needs an upper bound on pricing value for the full allowed family (for example a Farley-style bound using a valid upper bound on per-board dual value).
- Measure three axes separately: quality vs Lepton, p95/p99 CPU, and percentage of advanced-exhausted cases certified before entering expensive Master generation.
