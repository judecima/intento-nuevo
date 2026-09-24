# Exact LP + 2-Stage Pricing Milestone — 2026-09-24

Status: **RESEARCH MILESTONE CLOSED — MATCHED-REFILADO SERIAL GATE PASSED; COMPONENTS RETAINED FOR FURNITURE**

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

The restricted-master LP is converged **with respect to the exact 2-stage pricing oracle** for the initial demand in these three cases. The RMP itself is not a pure 2-stage model: it starts from the existing physical pool, which contains higher-stage patterns, and is then augmented with exact 2-stage columns.

Because the initial-demand oracle is exact for the modeled 2-stage family and terminates with no negative-reduced-cost 2-stage column, the final LP is the optimum over the union **existing admitted pool ∪ all modeled 2-stage columns**. Therefore any integer solution composed only from that union needs at least:
- 5445701: `ceil(587.757045) = 588` boards;
- 5445716: `ceil(615.042270) = 616` boards;
- 5447573: `ceil(577.359733) = 578` boards.

To beat those numbers, a solution must use at least one useful 3/4-stage pattern that is not already represented in the admitted starting pool (or otherwise fall outside the modeled constraints). This is still not a global <=4-stage certificate.

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

| Case | RMP LP after converged 2-stage pricing | First floor boards | Residual pieces | Residual LP | Second floor progress | Residual pricing status |
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

The serial architecture has passed the internal gate. Independent Runs A and B both pass completely and are physically reproducible at the canonical-layout level. The only remaining closure control is fairness against Lepton's own exported layout: refilado and rotation. Do not continue tuning counted DFS while that fairness audit is pending.

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


## Independent closure controls

Before treating the Lepton wins as product evidence, export the complete combined plans and verify them with `verify-combined-plan-independent.mjs`, which does not import the optimizer or `validador_industrial_v3`.

Required checks:
- exact demand count by type and exact total physical pieces;
- unique piece identities, no duplication across fixed and finalizer boards;
- board bounds and overlap;
- source dimensions and rotation/grain semantics as declared by the canonical case;
- kerf through independent cut-sequence simulation;
- usable board dimensions / refilado;
- raw XML physical Lepton board count, panel dimensions and kerf;
- maximum cut level and number of boards above 2 stages;
- canonical physical-plan digest.

Run the four cases twice in separate export directories. Final closure requires:
1. independent verification valid in both runs;
2. 591 / 621 / 588 confirmed as physical XML panel quantities;
3. identical board counts in both runs;
4. record whether the canonical plan digests are identical or only quality-equivalent.

### Independent Run A result

Independent verification passed 4/4 cases with zero errors:
- exact type counts and total physical pieces;
- unique piece IDs;
- panel bounds and no overlaps;
- independent kerf-aware guillotine cut simulation;
- source panel dimensions and kerf;
- physical Lepton panel counts read directly from XML.

| Case | Boards | Pieces exact | Lepton physical from XML | Max cut level | Boards >2 stages | Digest |
|---|---:|---:|---:|---:|---:|---|
| 5445701 | 588 | 13600 | 591 | 3 | 107 | `63038f420a9c7c68df4b480f352c089d498be05137483bf503fea99ab05546ff` |
| 5445716 | 616 | 13600 | 621 | 3 | 135 | `037889f7a4f056e613c0417115ba8a1965437bbddd786916b49095f4dad00476` |
| 5447573 | 578 | 13600 | 588 | 3 | 108 | `09db7772340e829c8f44a227ebd741bd6825505997e437a960e63e57fbebb2fd` |
| 5456195 | 7680 | 10240 | 7680 | 3 | 960 | `9b5fb0463824b3bc477b9092ac29b6743a03bac927ed643bf078f2d983549698` |

The XMLs do not explicitly declare a `Grain` attribute, so the independent verifier correctly reports that no additional source-level grain restriction can be inferred beyond the canonical case semantics.

Run A also corrects a previous interpretation: the integer plans are **not** pure 2-stage plans. The three Ignacio plans contain 107 / 135 / 108 boards above 2 stages. Since the finalizer contributes only 8 / 7 / 8 boards, at least 99 / 128 / 100 higher-stage boards come from the LP-fixed portion itself. This proves the starting RMP pool is mixed-stage.

Therefore do **not** claim "integer optimum proven within the 2-stage family". The precise statement is:

> An exact restricted master over the existing mixed-stage pool, augmented until no negative-reduced-cost 2-stage column remains, yields LP values 587.757 / 615.042 / 577.360. A fully materialized mixed-stage integer pipeline independently validates plans of 588 / 616 / 578 boards, beating the physical Lepton outputs by 3 / 5 / 10 boards.

These LP values are valid lower bounds for the integer problem over the **current restricted mixed pool**, not for the unrestricted <=4-stage problem. The finalizer may introduce physical patterns that were not columns of that RMP, so the numerical equality `combinedBoards = ceil(RMP LP)` is not by itself an optimality proof for the combined plan. Missing 3/4-stage columns could still lower the unrestricted LP/integer optimum.

### Independent Run B result

Run B independently validates the same four board counts and reproduces the exact same canonical plan digests as Run A:

| Case | Run A boards | Run B boards | Digest A = B |
|---|---:|---:|---|
| 5445701 | 588 | 588 | yes |
| 5445716 | 616 | 616 | yes |
| 5447573 | 578 | 578 | yes |
| 5456195 | 7680 | 7680 | yes |

Therefore this sample is reproducible not only in board count and validity but in the canonical physical layout itself.

### Fairness closure against Lepton

The fairness audit resolved both comparison conditions:

- **Rotation fairness passes strongly.** Lepton rotates pieces in all three Ignacio jobs and places the same piece codes in both orientations. Observed portrait rates are about 50.0%, 42.4%, and 52.9%, with 14 / 13 / 13 codes used in both orientations.
- **Refilado is unambiguous and non-zero.** The extended auditor infers `refiladoX=10` and `refiladoY=10` for all three Ignacio XMLs from level-1/2 node trim values. This explains why the earlier zero-trim run was not a fair like-for-like comparison.

A research-only rerun was then executed with:
- `SERIAL_FORCE_TRIM_X=10`;
- `SERIAL_FORCE_TRIM_Y=10`;
- the same 4.4 mm kerf;
- the same rotation freedom evidenced in Lepton;
- the same exact LP + 2-stage pricing + floor + normal-engine finalizer pipeline.

### Matched-refilado result

| Case | Lepton | Matched RMP LP | ceil(LP) | Final combined | Delta vs Lepton | Residual pieces | Finalizer |
|---|---:|---:|---:|---:|---:|---:|---:|
| 5445701 | 591 | 591.557356 | 592 | **592** | **+1** | 178 | 0.548 s |
| 5445716 | 621 | 617.414331 | 618 | **618** | **-3** | 178 | 3.073 s |
| 5447573 | 588 | 586.467029 | 587 | **587** | **-1** | 190 | 0.502 s |

Aggregate across the three matched jobs:
- Lepton: **1800 boards**;
- pipeline: **1797 boards**;
- net: **3 boards fewer**.

The original Lepton+2 serial gate still passes in all three cases under matched trim:
- 5445701: 592 <= 593;
- 5445716: 618 <= 623;
- 5447573: 587 <= 590.

The matched plans were independently rechecked from the exported combined-plan bundles:
- 13,600 / 13,600 pieces in every case;
- exact demand count by type;
- unique piece IDs;
- no overlaps;
- no out-of-bounds placements;
- correct piece dimensions/orientations;
- full kerf-aware guillotine cut sequence;
- max cut level 3;
- no validation errors.

This changes the product claim from the earlier zero-trim result. Do **not** claim a uniform -3 / -5 / -10 advantage. The fair conclusion is:

> Under the same 10 x 10 mm refilado, 4.4 mm kerf, and rotation freedom evidenced in Lepton, the serial pipeline produces valid plans of 592 / 618 / 587 boards versus Lepton 591 / 621 / 588. It is +1 / -3 / -1 by case, for a net 3-board aggregate improvement, while passing the predefined Lepton+2 gate in all three cases.

As before, numerical equality `combinedBoards = ceil(RMP LP)` is **not** a global <=4-stage optimality proof. The RMP is mixed-stage and only the added 2-stage pricing family is exhausted exactly; missing useful 3/4-stage columns could still improve the unrestricted problem.

## Serial closure

Serial research closes here.

Retain for transfer to furniture:
1. exact restricted-master LP;
2. exact physically validated 2-stage pricing oracle;
3. exact-LP dual lower bound;
4. LP-floor + normal-engine residual finalization architecture;
5. independent combined-plan verifier;
6. global deadline as a production requirement.

Do not continue:
- counted-DFS tuning for Ignacio;
- extra pricing rounds after `no-negative-reduced-cost`;
- serial-specific heuristics unless a future product requirement reopens this path.

Next product milestone remains furniture / Lepton <=75 boards:
- start from frozen full-runtime baseline `d72d6f5729c4a65b15c168553b5815a760185f72`;
- port only the demonstrated LP/pricing components;
- first audit real Lepton quality gaps;
- then advanced-exhausted LB+1/root-certification opportunities;
- measure quality vs Lepton, p50/p95/p99 CPU, and percent of AE cases avoided before Master separately.
