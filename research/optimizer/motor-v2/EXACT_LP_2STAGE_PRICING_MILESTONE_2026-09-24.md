# Exact LP + 2-Stage Pricing Milestone — 2026-09-24

Status: **RESEARCH MILESTONE — SERIAL TUNING CLOSED, COMPONENTS RETAINED FOR FURNITURE**

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

This strongly confirms that the old pool was missing dense 2-stage mixed patterns.

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

The dual bound is therefore a real reusable pruning improvement, but the current counted DFS branching order/multiplicity strategy is still unsuitable for the Ignacio-scale integer masters.

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
- increase 2-stage rounds beyond the current research gate;
- promote the serial route directly to production.

Next product milestone:
- return to furniture / Lepton <= 75 boards;
- test exact LP + 2-stage pricing on real furniture quality gaps;
- test the dual bound on Master-active furniture cases;
- measure p95/p99 and board-count regressions independently.
