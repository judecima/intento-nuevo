# CURRENT PROGRESS — Optimizer MDF — 2026-09-22

This file is the canonical recovery checkpoint for continuing the optimizer work across chats.
Branch: `research/perfv3-industrial-incremental-20260922`

## Governing objective
1. Minimize board count.
2. With the same board count, maximize industrial/commercial remnant quality.
3. Never add a board merely to improve remnant.
4. Only after #1 and #2 are preserved, reduce computation time.
5. Zero correctness regressions.

## Corpus available
Historical canonical corpus:
- 20,844 entries
- 20,842 valid for current mining after excluding 2 invalid inputs

New external corpus uploaded 2026-09-22:
- 16,992 XML
- 16,986 canonical-parseable
- 6 excluded as mixed-board-formats
- IDs 5,221,643 .. 5,336,643
- no numeric overlap with historical corpus (historical max 5,221,642)

Combined mining base:
- 37,828 valid cases

The next ~20k cases the user provides should be treated as a sealed external validation set before any thresholds are retuned on them.

## Accepted performance stack before V3
1. Native Rank Cache
2. Lean Beam
3. Native Whole Greedy Plan
4. Native Large-Round orchestration
5. Simple Choose

Previously accepted measurements include:
- V2 high-type P3 E2E vs prior accepted base:
  - CPU -11.10%
  - p95 -20.59%
  - p99 -16.33%
  - 0 board losses
  - 0 equal-board quality regressions

## Industrial Master rules

### Rule A — high diversity
If Master is active and `typeCount > 40`:
- run P3
- stop instead of Full40

Historical evidence:
- 405 Master-active >40 cases
- P3 losses vs Full40: 0
- Full40 wins in relevant historical cohort: 4
- P3 captured 4/4
- Master CPU reduction in direct P3-vs-Full40 comparison: ~85.9%

New sealed holdout evidence:
- 379 Master-active cases
- P3 losses: 0
- Full40 wins: 3
- P3 captured 3/3
- P3 better than Full40 in one solver-budget pathology case
- CPU reduction: ~81.92%

Status: ACCEPTED / externally validated on current new holdout.

### Rule B — mid diversity + high repetition
If Master is active and:
- 20 <= typeCount <= 40
- pieces / typeCount >= 4

then:
- run P3
- stop instead of Full40

Historical discovery cohort:
- 124 cases
- 0 Full40 wins
- P3 losses: 0
- CPU reduction: ~84.7%

Blind >500-pieces cohort excluded from discovery:
- 7 Master-active
- 7/7 P3 = Full40
- CPU reduction: 55.89%

New sealed holdout:
- 101 Master-active
- 101/101 P3 = Full40
- 0 quality regressions
- 0 Full40 wins in this holdout
- CPU reduction: ~82.09%

Status: ACCEPTED as current industrial rule for CPU reduction with 0 known losses; novel-win capture remains untested because no new B Full40 win has appeared yet.

## V3 incremental infrastructure
Principle:
- production round order remains 0..39
- no guided/static reordering
- a generated round is never regenerated within the same Master execution
- pools are cumulative
- incremental Full40 must equal direct Full40

Contract tests:
- P3 direct = first 3 rounds of 40-round incremental schedule
- Full40 direct = incremental Full40 assembled in blocks
- CI contract passed

Frozen win curve with real production order:
- P3: 29/46 historical wins already at final Full40 board count
- P7: 33/46
- P11: 34/46
- P15: 36/46
- P19: 38/46
- P23: 40/46
- P27: 42/46
- P31: 43/46
- P35: 44/46
- P39: 45/46
- P40: 46/46

Conclusion:
- incremental generation is valid infrastructure
- no universal fixed cutoff below P40 is safe
- adaptive continuation must preserve the late P40 win

## V3 E2E closure on historical corpus
Cases: 20,841 paired, 1 invalid

Global V3 vs V2:
- board losses: 0
- equal-board quality regressions: 0
- CPU: -3.40098%
- wall: -4.19966%
- p95: 9343.18 -> 8784.849 ms
- p99: 22322.787 -> 20949.182 ms
- Master time: 6,556,460 -> 5,216,800 ms

By category:
A-high-types:
- 433 cases
- 0 board losses
- already present in V2, so V3 adds ~0 CPU benefit there

B-mid-repeat:
- 131 cases
- 0 board losses
- 0 quality regressions
- CPU -55.85%
- wall -60.64%

C-full40-incremental:
- 1,172 cases
- 0 board losses
- 0 quality regressions
- CPU -0.37%
- infrastructure parity confirmed

## New holdout A/B gate — closed
A/B candidates:
- 1,162
- screen completed 1,162/1,162
- errors 0

Master-active:
- 480 total
- A: 379
- B: 101

P3 vs Full40:
- losses: 0
- equal boards: 479
- P3 better than Full40: 1 (5264906)
- equal-board quality regressions: 0

Full40 wins vs pre-Master:
- 5226838: 11 -> 10
- 5231953: 7 -> 6
- 5271166: 9 -> 8
- P3 captured 3/3
- P3 additionally won 5264906 while Full40 did not

CPU:
- P3 total: 1,163,878.507 ms
- Full40 total: 6,451,050.577 ms
- saving: 81.9583%
- p50: 804.939 vs 14,743.430 ms
- p95: 12,955.830 vs 24,443.868 ms
- p99: 14,737.538 vs 28,289.994 ms

Against Lepton within those 480:
P3:
- better 114
- equal 359
- worse 7

Full40:
- better 113
- equal 360
- worse 7

The seven worse-than-Lepton cases are optimizer gaps, not P3-rule regressions:
- 5223192
- 5227131
- 5294528
- 5295864
- 5301282
- 5324826
- 5329409

Do not use these seven as the primary research direction; preserve them as gap/sentinel cases while mining industrial rules across the full corpus.

## Current mining direction — 37,828 cases
Goal:
Find interpretable industrial rules that remove large blocks of CPU while preserving:
- board count
- remnant quality
- known wins

Do NOT focus only on raw piece count. Complexity should be modeled by effective branching:
- type count
- repetition structure
- relative piece dimensions
- number of plausible successors for a guide piece
- row/band residual width/height
- number of non-dominated continuation families
- closeness to lower bound
- stage activation / stage cost

Early discovery candidates in historical remaining Master-C population:
- top-3 quantity share <= 22%:
  - 83 historical cases
  - 0 known Full40 wins
  - ~476.2 s CPU
  - ~12.1% of remaining Master-C CPU
- qty_max <= 3:
  - 173 historical cases
  - 0 known wins
- pieces <= 12:
  - 109 historical cases
  - 0 known wins
- union of current zero-win candidates:
  - ~266 cases
  - 0 known wins
  - ~591.3 s CPU
  - ~15% of remaining Master-C CPU

These are DISCOVERY ONLY. Do not promote until validated against the new corpus and checked for remnant parity.

## Structural improvement now favored: Guide-Row / Residual Builder
Motivation:
Raw piece count overstates complexity. Repetitive families and large pieces should collapse branching. The difficult cases are many small heterogeneous families with many compatible continuations.

Proposed search unit:
1. choose a guide family
2. try useful repetition counts, prioritizing the maximal natural repetition but not forcing it
3. compute exact residual row/band space
4. discard families that cannot physically fit residual width/height/orientation
5. group geometrically equivalent continuations by their effect on residual state
6. keep only non-dominated representatives
7. move to the next residual position
8. preserve a small Pareto frontier when a locally worse fill can produce better global commercial remnant

Critical safety rule:
Do NOT optimize local fill alone.
The builder must preserve the global lexicographic objective:
1. board count
2. commercial remnant quality
3. fragmentation
4. local fill/latency

A candidate that fills the current row better may still be worse if it destroys a large reusable remnant on the final board.

### Example case 4961912
Uploaded XML:
- board 2750x1830
- kerf 4.5
- 61 pieces
- 31 types
- Lepton uses 2 boards
- current optimizer also reaches lower bound 2 boards
- Master does not execute
- runtime is still about 3 s wall in the observed run
- compactation was a major component (~2.1 s in the observed run)

Interpretation:
This is not a board-count search problem. It is a fast-construction/certification problem.
Rows/bands are strongly structured by repeated families (e.g. repeated 629x570 and 610x570 families), and the optimizer should build a 2-board candidate quickly, certify LB=2, and avoid expensive later stages that cannot improve boards.

However, Lepton deliberately concentrates waste/remnant:
- first board is more densely packed
- second board retains a larger commercially useful empty rectangle

Therefore any Guide-Row builder must be remnant-aware and cannot simply maximize row occupancy.

Required sentinel for this structural experiment:
- still use 2 boards
- no worse equal-board remnant quality than accepted reference
- materially lower latency than current path

## Next prioritized experiments

### H1 — complexity metric / branching audit
On all 37,828 cases compute:
- guide-family successor count
- median/max feasible continuation families per residual
- residual closure rate
- number of equivalence classes after residual-effect grouping
- repetition compression ratio
- relation to CPU and Full40 wins

Goal:
replace crude `pieceCount` heuristics with effective branching.

### H2 — Guide-Row / Residual Builder prototype
Prototype only, behind disabled experimental flag.
First sentinels:
- 4961912 for fast LB=2 + remnant preservation
- existing Master wins to ensure no board-count loss
- seven new Lepton-gap cases as non-regression diagnostics, not optimization targets

Acceptance:
- 0 board regressions
- 0 accepted remnant regressions
- plan validates physically
- lower generation/early-stage CPU
- no promotion based on one case

### H3 — mining Rule C
Validate zero-win historical candidate regions against the new corpus.
Promote only if:
- no board loss vs Full40 in all tested active cases
- no equal-board remnant regression
- meaningful CPU coverage
- thresholds frozen before the next external ~20k holdout

### H4 — future external validation
The next ~20k cases from the user are a sealed holdout for any Rule C/D or Guide-Row thresholds learned from the current 37,828.

## Rejected / do not repeat
- Remnant-Safe Directed Generation
- PoolState as broad default
- static guided round order such as [9,23,32,1]
- Prepared Pool
- Ordered Reps
- scheduler-only latency
- arbitrary fixed round reduction
- Certified P3 with redundant extra solve (made CPU ~5% worse)
- universal P39 stop (one historical win still needs round 40)

## Current branches / key commits
V2 frozen:
- branch: `candidate/performance-v2-high-types-p3-20260922`
- commit: `d85b9e05d989f5d3f126fe1c412506c29cee1648`

V3 research:
- branch: `research/perfv3-industrial-incremental-20260922`

Important V3 commits:
- incremental generator: `14f3c9773a26b557eda29fa9f3ba89611f42a647`
- V10 integration: `ed9b055c75742374636b943b27f9d984266d2dc3`
- V3 E2E benchmark: `373fc8e50549a1d9273fdee18d2fd58f2c6dab59`
- V3 workflow: `321f2ddc44667b4aaf8a1f3fa4e443e9acf0a75d`
- incremental contract: `ec5e2ede19f17d32b1f61158ea2463ba62436da5`
- new holdout A/B closure: `72d78488b3333484009ee515ca32a97d09550cab`

## Resume instruction for future chats
Read this file first.
Then:
1. do not re-run rejected experiments
2. treat A/B/incremental as current accepted baseline
3. continue H1 complexity/branching audit and H2 Guide-Row prototype
4. preserve lexicographic remnant objective
5. keep the next ~20k user cases sealed until the current mining thresholds are frozen

## Additional structural sentinel — FAPLAC Blanco Nature one-board case
User-provided demand, material `MDF FAPLAC BLANCO 18MM. NATURE`.
Use stock 2750x1830 and kerf 4.5 for this material. CORRECTION: Nature is treated as wood-like/grained for this investigation. New/imported pieces default to rotation disabled, but the user may explicitly enable rotation per piece; that override must be preserved end-to-end.
Demand:
- 30 pieces
- 12 types
- dominant repeated family: 12 x 290x200
- includes large anchors such as 300x1800, 1400x500, 1100x250, 2 x 717x700, 2 x 717x464

Area:
- piece area: 4,554,372 mm2
- board area: 5,032,500 mm2
- raw utilization: 90.4992%
- area lower bound: 1 board

Measured current V3 runtime:
- corrected rerun with materialConVeta=true and every piece orientation locked: final boards 1
- area/strong/cascade lower bound: 1
- valid plan: yes
- rotated placements: 0
- Master: inactive
- OneBoard: inactive
- MultiSlice: inactive
- compactation: active, no board gain
- wall with compactation: ~1.15 s in measured run
- compactation time: ~0.63 s
- wall with compactation disabled: ~0.35 s
- same final physical placement digest with and without compactation
- same remnant quality: no commercial remnant detected in either arm

Interpretation:
- this is a fast-construction/certification case, not a deep-search case
- large anchor pieces naturally define vertical strips/bands
- repeated 290x200 pieces act as fillers and should be handled as a quantity family, not expanded as 12 independent branches
- a one-board candidate already matches LB=1; expensive later work is only justified if it can improve equal-board remnant quality
- in this measured case compactation consumed most of the avoidable latency while producing identical geometry and quality

Do NOT promote a global compactation skip from this single case. Mine a safe rule over the 37,828-case corpus using:
- LB reached after baseline
- remnant quality before/after compactation
- effective branching / strip structure
- dominant-family compression
- commercial-remnant improvement frequency

This case is now a required sentinel for the Guide-Row / early-certification experiment:
- remain at 1 board
- preserve or improve remnant quality
- preserve physical validity
- target materially below current ~1 s path; measured no-compact path was ~0.35 s

## Grain/orientation correctness correction — 2026-09-22
The Nature example exposed a correctness risk in the project input flow.
Domain rule: board grain governs the DEFAULT orientation policy. On a grained board, newly loaded/imported pieces default to `grain=true` and `canRotate=false`, but an explicit user choice `canRotate=true` overrides that default for that piece.

Relevant runtime semantics:
- legacy motor only rotates a piece when it is not locked by grain/no-rotate
- strong lower bounds use the same feasible-orientation restriction
- area LB remains safe but can be weak; exact optimality is certified only when a valid incumbent board count equals the orientation-aware LB

Corrected Nature rerun:
- board 2750x1830, kerf 4.5
- all pieces locked to loaded orientation
- area LB = 1
- strong LB = 1 (area binding)
- cascade LB = 1
- valid incumbent = 1 board
- rotated placements = 0
- therefore minimum is certified at 1 board despite grain

Correctness fixes committed on V3 research branch:
- superseded: `d7edaa7...` / `70723b4...` were too strict because they made grain an absolute lock
- `2d9a7ac060a91084b34bc5351785930ea1c1592e` — optimization input preserves explicit per-piece override
- `1e0497d8701d972b59993bafd4da0d234e0097b7` — server persists explicit rotation choice
- `94f40294a1fb6388b222c4a7d7a0e367f83b2301` — UI add/import inherits board default
- `e2798c8afb5ddd9021080642c099b55ca6af75bf` — editor load no longer wipes saved overrides
- `485029c816cd2190c21ed74a8dd92a0db603ac27` — schema lets explicit `canRotate=true` override grain default
- `4b31e200ff8df41866bf234dcda13aea6cf29dd8` — legacy mapper gives explicit canRotate precedence
- `136fbdbacf2e1932b8bef5b44d049f1f0b870e3e` — end-to-end optimizer test for grain override
- CI workflow `35743091130`: Vitest + TypeScript PASS

Do not use inferred material-name grain classifications to certify optimization results. The material catalog/business rule is authoritative.
