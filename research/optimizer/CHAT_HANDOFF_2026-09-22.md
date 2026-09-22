# CHAT HANDOFF — Optimizer MDF — 2026-09-22

Branch:
`research/perfv3-industrial-incremental-20260922`

Purpose:
This is the authoritative handoff for starting a NEW ChatGPT conversation.
Read this file before doing any optimizer work.

## Governing objective
1. Minimize board count.
2. With the same board count, maximize industrial/commercial remnant quality.
3. Never add a board to improve remnant.
4. Preserve physical validity and exact demand.
5. Optimize latency only after #1-#4.
6. Zero correctness regressions.

## Available real corpus
Valid cases already consumed for discovery/validation:
- historical canonical: 20,842 valid
- second corpus: 16,986 valid
- sealed 4-ZIP holdout: 13,839 valid
- total already available: 51,667 valid

User now has ~15,000 MORE fresh cases.

CRITICAL:
Treat those ~15k as a NEW SEALED HOLDOUT.
Do not retune R3-M-v4, Monotype-v2, Safe Cascade v1, H2 thresholds, polish parameters, or early-LB rules before the FIRST frozen pass is recorded.

## Current baseline / accepted infrastructure
Current baseline: V3/V10 industrial incremental.

Historical V3 closure:
- 20,841 paired, 1 invalid
- 0 board losses vs prior accepted V2
- 0 equal-board quality regressions
- CPU -3.40098%
- wall -4.19966%
- p95 9343.18 -> 8784.849 ms
- p99 22322.787 -> 20949.182 ms

Master industrial rules A/B and incremental round reuse are accepted infrastructure.
Do not repeat arbitrary fixed round-cutoff research.
No universal cutoff below P40 is safe.

## Exact historical V3 vs Lepton global snapshot
Report:
`research/optimizer/GLOBAL_SNAPSHOT_2026-09-22.md`

Exact comparable historical PROJECT cases:
- 17,317

Current V3 vs Lepton:
- better: 1,266 = 7.3107%
- equal: 16,008 = 92.4410%
- worse: 43 = 0.2483%
- equal-or-better: 99.7517%
- gross boards saved: 1,293
- gross boards lost: 45
- net boards saved: 1,248

Gap localization:
- no-master: 15,885 cases, 0 worse than Lepton
- C-full40-incremental: 35 gaps
- A-high-types: 4 gaps
- B-mid-repeat: 4 gaps

Critical diagnosis:
- 41/43 historical Lepton gaps already have safe LB == Lepton board count
- remaining board-count issue is primarily candidate/pattern generation/materialization in Master routes, NOT lower-bound weakness
- 43 gap instances collapse to 37 unique structural geometries

Known repeated gap families include:
- 4035484 / 4034825 / 4034830
- 4060744 / 4040363
- 4055177 / 4055174
- 4087476 / 4087489
- 4129718 / 4129782

Known closed family example:
- 4055174: V3 7, Lepton 6, H2 6, LB 6
- 4055177 shares the same structural fingerprint and H2 also reaches 6

## Safe Fast-Path Cascade v1 — FROZEN RESEARCH ARCHITECTURE
Report:
`research/optimizer/SAFE_FAST_PATH_CASCADE_V1_2026-09-22.md`

Routing:
1. one type -> frozen Monotype-v2 envelope
2. two/three types -> R3-M-v4
3. everything else -> current V3
4. every miss falls back to V3

Default remains OFF.

### Monotype-v2 frozen
Externally validated geometry envelope:
- exactly 1 type
- 1..300 pieces
- non-directional
- rotation not explicitly locked
- trim 0/0

External 13,839-case holdout:
- eligible: 1,483
- certified: 1,479
- fallback: 4
- invalid: 0
- board losses: 0
- equal-board remnant regressions: 0
- remnant better: 27
- vs Lepton boards: 27 better, 1,456 equal, 0 worse
- total time 78,135.980 ms vs V3 174,175.445 ms
- saving 55.14%
- speedup 2.23x

Status:
EXTERNAL GEOMETRY PASS.
Do not claim directional/grain/trim-v3 external validation from PROJECT XML.

### R3-M-v4 frozen
v1 failed the prior sealed holdout only on remnant:
- 354 certifications
- 0 board losses
- 4 equal-board remnant regressions

v4 was designed AFTER seeing those 4 failures.
Therefore prior holdout is consumed and cannot externally validate v4.

v4 safety design:
- does NOT expand frozen v1 certification coverage
- extra risk polish only after v1 already certifies and:
  - boards = 1
  - naturalStates = 3
- polish:
  - preferirMenorProfundidad=false
  - ruido=.4
  - pases=4
  - restartsPorPlaca=4
  - Rescue/Beam/MultiVariants OFF

Broad current-source regression gate:
- 438 original frozen cases + 4 external failures = 442
- 442/442 certified
- invalid 0
- board losses 0
- remnant regressions 0
- equal 432
- better 10
- risk polish attempted 201
- selected 11
- ~64.8% lower time than V3
- ~2.84x speedup
- p95 ~38.2 vs 134.2 ms
- p99 ~94.8 vs 597.8 ms

Status:
STRONG FROZEN CANDIDATE, but NEEDS NEW SEALED EXTERNAL VALIDATION.

The user's new ~15k corpus is the correct holdout for this.

## R3-M residual precheck/reuse — ACCEPTED RESEARCH PERFORMANCE IMPROVEMENT
Observation on 2,112 external R3 pre-candidates:
- NATURAL_STATES_GT_3: 1,444 = 68.37%
- such cases can never pass frozen v1/v4 certification

New implementation:
- precompute residual states
- if naturalStates > 3 -> skip complete H2 candidate and fall back
- otherwise reuse exact same residual in candidate builder

Measured:
- old screening 20,895.859 ms
- new precheck+reuse 7,309.676 ms
- saving 65.02%
- speedup 2.86x
- complete H2 builds skipped: 1,444
- plan mismatches among built cases: 0
- certification classification unchanged

Full route economics on 2,112:
- certified 354
- fallback 1,758
- screening + polish cost 8,371.869 ms
- V3 work avoided 10,898.989 ms
- net saving 2,527.120 ms
- route is net positive even including fallback overhead

## Safe Cascade coverage
Second corpus 16,986:
- Monotype 1,723
- R3-M 438
- combined 2,161 = 12.72%

Prior sealed holdout 13,839:
- Monotype 1,479
- R3-M certification region 354
- combined 1,833 = 13.25%

Combined recent corpora:
- 30,825 cases
- 3,994 fast returns
- 12.96% coverage

## H2 / Guide-Row broader opportunity — NEW MEASURED RESULT
Workflow:
`Optimizer H2 Opportunity 1399`
run: 35782766966
SUCCESS.

Universe:
- 1,399 historical cases where V3 board count > current LB

Result:
- errors 0
- invalid 0
- H2 board wins vs V3: 16
- boards saved: 16
- reaches LB: 13
- reaches Lepton: 15
- beats Lepton: 3
- unique winning structural geometries: 14
- equal to V3: 1,333
- worse candidates ignored by safe selection: 50

By category:
- A-high-types: 354 cases, 5 wins
- B-mid-repeat: 93 cases, 2 wins
- C-full40-incremental: 952 cases, 9 wins

H2 candidate cost over all 1,399:
- total 477,353 ms
- p50 105.4 ms
- p95 1,228.2 ms
- p99 3,802.7 ms

Important wins include:
- 4111589: 15 -> 14, Lepton 14, LB 14
- 4077336: 12 -> 11, Lepton 12, LB 11 (beats Lepton)
- 4113928: 23 -> 22, Lepton/LB 22
- 4020886: 19 -> 18, Lepton 18, LB 17
- 4018424: 17 -> 16, Lepton 17, LB 16 (beats Lepton)
- 4122824: 18 -> 17, Lepton 17, LB 15
- 4066786: 15 -> 14, Lepton/LB 14
- 4055177: 7 -> 6, Lepton/LB 6
- 4055174: 7 -> 6, Lepton/LB 6
- 4115010: 5 -> 4, Lepton/LB 4
- 4087489: 2 -> 1, Lepton/LB 1
- 4087476: 2 -> 1, Lepton/LB 1
- 4130451: 2 -> 1, Lepton/LB 1
- 4068427: 2 -> 1, Lepton/LB 1
- 4034321: 3 -> 2, Lepton 3, LB 2 (beats Lepton)

Interpretation:
- H2 already closes multiple real Master pattern-generation gaps
- but broad H2 over all 1,399 is too expensive to wire blindly
- next work should mine a cheap applicability/certification rule for the 14 winning structures/families, not run H2 universally

Do NOT tune that rule using the new ~15k before the first sealed validation of already-frozen components is recorded.

## Early cheap-LB before compactation — NEW FAMILY RESULT
Workflow:
`Optimizer Early Cheap LB Slow Family 11`
run: 35783074230
SUCCESS.

Specific repeated slow family:
- 11 cases
- exact board parity: 11/11
- exact quality parity: 11/11
- cheap LB ran: 11
- cheap LB certified: 11
- early compactation activations: 0
- remnant polish valid: 11/11
- polish changed result: 0

Timing:
- baseline wall: 124,280.731 ms
- early-LB wall: 40,015.226 ms
- wall saving: 67.80%
- speedup: 3.11x
- CPU saving: 63.32%
- p50 wall: 11,349 -> 3,626 ms
- p95 wall: 11,405 -> 3,695 ms

Status:
PROMISING FAMILY-LEVEL RESULT ONLY.
Do not broad-promote from 11 repeated cases.
Use as evidence for mining a safe early-certification rule after the frozen holdout pass.

## FAPLAC Blend Scotch sentinel
Report:
`research/optimizer/sentinels/FAPLAC_BLEND_SCOTCH_125_2026-09-22.md`

Demand:
- 125 pieces
- 22 types
- stock 2750x1830
- kerf 4.5
- piece area 39,797,840 mm2

Result:
- raw area LB 8
- safe Hybrid LB 9 due kerf/DFF
- V3 finds 9
- minimum certified at 9
- true both with orientation locked and rotation allowed
- locked trim0 wall ~389 ms
- no Master/OneBoard/MultiSlice/Compactation activation

This is a lower-bound/certification sentinel, not a deep-search gap.

## Grain / rotation semantics — DO NOT REGRESS
Authoritative rule:
- board grain defines DEFAULT rotation policy
- grained board -> new/imported pieces default canRotate=false
- user may explicitly set canRotate=true per piece
- explicit piece override wins

Legacy boundary:
- effective locked orientation is represented by line.veta=true
- explicit canRotate=true maps to veta=false even on a grained material

Do NOT infer grain from material names for certification.
Material catalog/business rule is authoritative.

PROJECT historical XML generally cannot externally validate the application-level canRotate override.
If new ~15k are PROJECT XML, treat grain/directional claims separately.

## Rejected / do not repeat
- Remnant-Safe Directed Generation
- broad PoolState default
- static guided round order
- Prepared Pool
- Ordered Reps
- scheduler-only latency
- arbitrary fixed-round reduction
- redundant Certified P3 solve
- universal P39 stop
- old H2c R1/R2/R2-M
- broad frozen R3-M v1 promotion (failed remnant external holdout)
- broad universal H2 over all cases without a gate

## NEW ~15k SEALED HOLDOUT PROTOCOL
When user uploads the ~15k cases:

FIRST PASS — NO TUNING:
1. manifest:
   - raw XML count
   - canonical valid/excluded
   - duplicate/overlap check against prior IDs
   - project/order format counts
   - board formats / piece-count distribution
2. run frozen current V3 reference
3. run frozen Monotype-v2 envelope
4. run frozen R3-M-v4
5. run Safe Cascade v1 exactly as frozen
6. compare against Lepton board count only where XML representation gives an authoritative physical panel reference
7. record:
   - invalids
   - board losses/wins
   - equal-board remnant regressions/improvements
   - exact fallback parity
   - certified/fallback counts
   - p50/p95/p99
   - total route economics including fallback screening
8. preserve the FIRST blind result in a report + commit BEFORE changing any thresholds or polish

Acceptance for R3-M-v4 / whole cascade:
- invalid plans = 0
- board losses vs V3 = 0
- equal-board remnant regressions = 0
- fallback parity exact
- meaningful positive end-to-end latency including screening overhead

Only AFTER this frozen result is committed may the new corpus be used for further H2/early-LB discovery.

## Immediate post-holdout research priority
If frozen cascade passes:
1. evaluate H2 on remaining V3>LB / V3>Lepton structures in the new corpus
2. classify structural families, not individual IDs
3. learn a cheap H2 applicability gate from OLD consumed data first where possible
4. audit early cheap-LB before compactation on broad, diverse families
5. target Master pattern generation because historical no-master region has 0 Lepton board gaps

## Working discipline
- Always return concrete measured results; do not respond with progress-only messages.
- Commit meaningful research/checkpoints to this branch.
- Never deploy Vercel.
- Do not silently retune frozen rules on a holdout.
- Prefer family-level explanations and safe fallback architecture.
