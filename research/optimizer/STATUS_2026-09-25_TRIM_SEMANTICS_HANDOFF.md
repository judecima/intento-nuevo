# STATUS — MDF Optimizer / Trim Semantics Handoff — 2026-09-25

## 0. Canonical entry point

Repository:
`judecima/intento-nuevo`

ACTIVE BRANCH FOR CONTINUATION:
`research/holdout-trim-baseline-20260924`

HEAD before this handoff file:
`582264d625868791171a1ed463729fae623b5e7a`

This document is the canonical continuation state for a new ChatGPT conversation.
Do not reconstruct state from older chat summaries before reading this file.

The next chat must:
1. read this file completely;
2. read `research/optimizer/TRIM_SEMANTICS_GATE_2026-09-25.md`;
3. trust the latest commit on this same branch if HEAD has advanced;
4. do not restart old experiments unless this file explicitly says they remain open.

---

## 1. Product objective and optimization semantics

Target product: industrial guillotine-cut optimizer for MDF/furniture, with a secondary serial-production path.

Lexicographic objective:
1. minimize physical board count;
2. maximize commercial remnant quality;
3. never spend an extra board to improve remnant;
4. only after quality, minimize latency.

Typical boards:
- 2600 × 1830
- 2750 × 1830
- 2440 × 1220

Typical kerf:
- XML mostly 4.4 mm
- product commonly 4.5 mm

Typical minimum usable cut/remnant:
- ~60 mm cut minimum historically
- product remnant rules are separate and must not change the board-count objective.

Grain/rotation:
- material grain defines the default;
- per-piece explicit rotation override must be respected;
- if a piece has `canRotate=true`, it may rotate even on a grained board.

Guillotine stages:
- physical product target remains <=4 cut levels/stages as currently enforced by validator/materializer.
- Use one consistent physical-stage definition in research:
  `physicalCutLevels = max(cut.nivel)`.
- For Lepton XML:
  `physicalCutLevels = max(terminal XML layer) - 1`.

Product segmentation:
- furniture target: <=75 Lepton boards;
- >75 boards is treated separately as large/serial production.
- Serial cases are valuable as structural laboratories, but must not dominate furniture p50/p95/p99.

Important modeling rule:
- kit/GCD is demand compression only, never a board restriction.
- never optimize one kit independently and multiply.
- master demand is global.

---

## 2. Frozen / relevant branches and commits

### Main continuation branch
`research/holdout-trim-baseline-20260924`
Pre-handoff HEAD:
`582264d625868791171a1ed463729fae623b5e7a`

Purpose:
- corrected Lepton trim semantics audit;
- furniture holdout;
- research-only Master pool capture;
- trim-rule geometry gate.

### Frozen production/full-runtime source
`feature/optimizer-saas-hardening-20260923`
`d72d6f5729c4a65b15c168553b5815a760185f72`

Do not reinterpret later research branches as production without certification.

### Runtime attribution
`research/runtime-attribution-20260924`
`ab410a07e55080d7a0b2c1a53ec9e2e1da875214`

### Serial counted freeze
`research/serial-demand-counted-20260924`
`164cb2256b352bead452f8cf7698836e298c9bf7`

### Exact LP + 2-stage pricing serial line
`research/exact-lp-2stage-pricing-20260924`
`0741012c175ed7214268aab18377561b10af59f0`

### Lepton column injection audit branch
`research/serial-lepton-column-audit-20260924`
`6f6310f7ce9d83d62ead1d4be41fc80ae127d814`

This branch is parallel research. Do not merge into the holdout branch merely to continue the current trim task.

---

## 3. Current blocker: Lepton trim semantics

### Historical mistake

Earlier Lepton comparisons implicitly used optimizer trim = 0 for most cases.
Audit of 15,787 project XMLs showed approximately:
- 14,648 with non-zero Lepton trim;
- 1,139 with zero trim;
- most common trim values: 5×5, 10×10, 15×15, 3×3.

A first corrected runner modeled trim as:
`usableWidth = boardWidth - trimX`
`usableHeight = boardHeight - trimY`

That model is now known to be too strict relative to Lepton.

### Full furniture run under the too-strict global-trim model

The completed run processed:
- XML discovered/processed: 15,443
- canonical valid: 15,441
- parse skipped: 2
- runtime FAIL: 937

Among 14,504 valid candidate comparisons:
- better vs Lepton: 1,078
- equal: 13,192
- worse: 234
- net board advantage: +687 boards
- apparent net advantage ~+1.47%

Latency:
- wall p50 ~468 ms
- wall p95 ~12.9 s
- wall p99 ~39.8 s

These are NOT the official quality baseline because trim semantics are still being corrected.

### Why the global reduced-rectangle model is wrong

Of the 234 worse cases:
- 123 have our lower bound > Lepton boards.
- 122/123 have candidate plan board count == our lower bound.
- these 123 were equal before global trim and became worse only after global trim.
- ratios new/Lepton are frequently simple jumps (×2, ×3, ×1.5), consistent with losing one exact-fit piece per row, not with gradual search degradation.

Example:
- case 5504203
- board 2440 × 1220
- 2 piece types
- 225 pieces
- Lepton 75 boards (3 pieces/board)
- global trim 5 model => 113 boards (2 pieces/board)

Therefore:
- the mathematical lower bounds are coherent with our modeled geometry;
- the modeled geometry is not Lepton's geometry.

The 937 runtime failures show the extreme version of the same issue:
- all are non-zero-trim cases;
- under old trim=0 run almost all were valid/equal-or-better;
- pieces dimensioned to the full board can become infeasible when trim is globally subtracted.

---

## 4. Trim rule gate — strongest current result

Read:
`research/optimizer/TRIM_SEMANTICS_GATE_2026-09-25.md`

A deterministic 1,660-case gate was built:
- 1,060 problem cases:
  - 937 runtime failures
  - 123 cases with lower bound > Lepton
- 600 controls:
  - 400 equal vs Lepton
  - 200 better vs Lepton
  - stratified by trim and Lepton board-count band.

All 1,660:
- are project XML;
- have non-zero, unambiguous trim;
- parsed with zero audit errors.

Geometry signal:
- problem cohort touching physical far edge: 1,060 / 1,060 = 100%
- control cohort touching physical far edge: 6 / 600 = 1%

Two candidate rules were audited per physical board and per far axis.

### Rule A — rejected
`globalFarInset`

For each axis:
`margin >= trim`

Result:
- 594 / 1,660 pass
- 1,066 / 1,660 fail
- pass rate 35.783%
- 2,248 physical boards violate it

### Rule B — current candidate
`factoryEdgeOrReserve`

For each axis:
- if margin == 0: allowed, interpreted as using factory edge;
- else margin must be >= declared trim;
- any 0 < margin < trim is rejected.

Result:
- 1,660 / 1,660 pass
- 0 fail
- 0 violating physical boards

By trim:
- 5×5: 1,273 / 1,273 pass
- 10×10: 356 / 356 pass
- 15×15: 27 / 27 pass
- 3×3: 4 / 4 pass

This is a very strong geometry result, but NOT YET the final product policy.

---

## 5. Immediate next action — do this before changing the optimizer

Run the same read-only rule audit on the full project corpus, with no `--ids-file`.

Expected command from repo root:

```powershell
node scripts/audit-holdout-lepton-semantics.mjs `
  --input "validation-full/serial-production-audit/_extracted" `
  --runtime-rows "validation-full/trim-corrected-furniture/FULL_RUNTIME_VALIDATION_ROWS.jsonl" `
  --output "validation-full/trim-rule-gate-full" `
  --progress-every 500
```

Primary gate:

`trimRuleCandidates.factoryEdgeOrReserve.failingCases == 0`

If the full-corpus gate is not zero:
- inspect every failing geometry;
- do not modify schema/generator yet;
- determine the stricter rule that covers all observed Lepton layouts.

If the full-corpus gate is zero:
- close Lepton trim semantics as geometrically observed;
- then implement a coherent trim policy.

---

## 6. Product decision after full-corpus gate

Lepton behavior and product policy are related but not identical.

Expected policy abstraction:

`trimPolicy = mandatory | factoryEdgeAllowed`

Meaning:

### mandatory
The client requires every relevant board edge to be rectified/reserved.
A full-size piece that uses the factory edge is not acceptable.

### factoryEdgeAllowed
A piece may use the physical factory edge when it reaches it exactly.
If it does not use the factory edge, the remaining margin must be >= declared trim.

For Lepton benchmark comparisons, use the policy matching observed Lepton behavior.

Before making this the production default, confirm with a real operator/client:
- if a piece reaches the original board edge, is the factory edge accepted?
- or must that edge always be trimmed/rectified?

Do not infer plant policy solely from Lepton.

---

## 7. Implementation constraint if factory-edge policy is accepted

Do NOT patch only `schema.ts`.

The same trim semantics must be used consistently by:
- input feasibility / schema;
- JS baseline generator;
- compactation / multislice if they reason about usable dimensions;
- Rust pattern generator;
- Master pattern generation;
- materializer;
- industrial validator;
- area lower bound;
- kerf lower bound;
- DFF / DFF-FS0;
- projection / clique/raster bounds where applicable;
- exact LP/pricing geometry;
- future 3-level pricing.

Avoid scattered special-case conditionals.

Preferred architecture:
- one explicit trim-policy abstraction;
- shared geometry primitives such as:
  - `pieceFits(...)`
  - `axisUsableSpan(...)`
  - `remainingSpan(...)`
  - edge-reservation / factory-edge decision.

After implementation, rerun the 15,443 furniture holdout.

Required gates before freezing official baseline:
1. runtime geometry exceptions == 0 (except genuinely invalid input);
2. candidate invalid == 0;
3. `count(lowerBound > LeptonBoards) == 0` for like-for-like benchmark cases;
4. only then report official better/equal/worse, net board advantage and certification rate.

---

## 8. Do NOT start A–F gap mining yet

The global-trim run contains false losses created by mismatched geometry.

Do not yet classify the current 234 worse cases as:
- A exact pattern in pool
- A2 dominated pattern
- B missing 2-level pattern
- C missing 3-level pattern
- D missing 4-level pattern
- E unusual manufacturing structure
- F restriction mismatch

First rerun under correct trim semantics.

Only the new worse cohort after the corrected rerun is the real optimizer-gap cohort.

---

## 9. Research instrumentation already added on this branch

### Original exception preservation

The full runtime runner now checks `timed().ok` before reading `result.metrics`.
This prevents the secondary:
`Cannot read properties of null (reading 'metrics')`
from hiding the real runtime exception.

### Opt-in P16/P40 Master pool capture

Research-only flag:
`--capture-master-pool`

It exports vector snapshots of the Master pool for small gap cohorts:
- usage vector
- area
- max physical cut level
- checkpoint
- pool size

Do not enable it on the full holdout; it inflates output considerably.

Purpose after corrected baseline:
- distinguish exact-in-pool;
- dominated-by-pool;
- truly missing pattern.

### Reproducible trim semantic cohort

Script:
`scripts/build-trim-semantic-audit-cohort.mjs`

It reconstructs:
- 1,060 problem cases from the runtime JSONL;
- 600 deterministic controls;
- combined 1,660 IDs.

Do not rely on chat-local files for reproducibility.

---

## 10. Serial / exact LP line — keep in parallel, not the current blocker

The serial work remains valid and useful.

Exact restricted master interpretation:
> exact RMP over the existing mixed-stage pool, augmented until no negative-reduced-cost modeled 2-stage column remains.

Do NOT call it a global <=4-stage optimum.

Matched-trim serial results previously observed:
- 5445701: Lepton 591, ours 592
- 5445716: Lepton 621, ours 618
- 5447573: Lepton 588, ours 587
- aggregate Lepton 1800 vs ours 1797

All three matched plans were physically validated:
- exact piece counts;
- unique IDs;
- bounds/overlap OK;
- kerf-aware guillotine sequence;
- max physical cut level 3;
- zero validator errors.

Important 5445701 inference:
- after exact 2-stage pricing, RMP LP ~591.557;
- Lepton integer = 591;
- therefore the current union of mixed pool + modeled 2-stage columns cannot express the Lepton 591 solution;
- likely missing a useful higher-stage structure.

Before building a 3-level pricing oracle, the parallel branch added:
`research/optimizer/motor-v2/lepton-column-injection-audit.mjs`

Purpose:
- extract Lepton boards as demand vectors;
- compare exact/dominated/missing vs current pool;
- inject Lepton columns into RMP;
- inspect physical cut levels and reduced costs;
- use this to define the exact scope of a future 3-level oracle.

Do not make this serial line block the trim semantics/furniture baseline.

---

## 11. Mathematical formulation issue to investigate only after corrected baseline

Current productive coverage/master logic uses exact residual equality semantics and rejects patterns that over-cover a residual component.

This creates a distinct category:
- Lepton vector absent exactly;
- but a pool vector dominates it componentwise.

Under a covering formulation `A x >= q`, such a vector may be useful.
Under current equality/materialization semantics it may be unusable.

Do not switch production to overproduction.
Safe future options:
- derive a downward-closed exact subpattern by removing surplus leaves while preserving guillotine validity; or
- covering master + exact final materialization that removes unused slots safely.

Measure this category first with captured P16/P40 pools on the corrected worse cohort.

---

## 12. Furniture vs serial research roles

Furniture <=75 boards:
- optimize first for product quality and latency;
- 1→2, 3→4, LB+1 gaps are commercially important;
- a single extra board can be a very large relative error;
- p50/p95/p99 matter.

Serial >75 boards:
- use as structural laboratory;
- repetition makes dominant pattern density visible;
- LP/pricing/column generation is appropriate;
- longer compute budgets are acceptable.

Do not assume a serial density rule automatically fixes furniture 1→2 feasibility.

---

## 13. Historical performance context — useful but not official current quality

Prior V7 <=30 pieces:
- 1,201 / 1,247 exact = 96.3%
- 39 better
- 7 at +1 board

V10 8,009 cases:
- improved 51
- regressed 0
- 52 boards rescued

Historical generation bottleneck:
- avg generation ~1,241 ms
- avg solve ~10.3 ms

Rust certified line:
- p50 CPU/wall ~6.729 / 8.548 s
- p95 ~35.434 / 42.448 s
- p99 ~48.731 / 61.031 s
on the 323 Master-active cohort.

PoolState 220 cases:
- 219 valid
- 0 board regressions
- aggregate ~2.65% time saving
- p99 ~11% better
- slight p50 regression

Master generation has historically dominated runtime (~71% on hotspot cohort).

Progressive Master direction:
- initial 16 rounds;
- then +4 increments;
- stop early when expected quality/certificate reached;
- avoid unconditional 40 rounds.

These are performance references, not substitutes for the new corrected quality baseline.

---

## 14. Rules / cautions for the next chat

- Do not deploy anything to Vercel.
- Do not modify `.gitignore` or `.vercelignore`; the user has local changes there.
- Do not reset/clean user research artifacts.
- User has local generated serial artifacts that must not be overwritten casually.
- Prefer GitHub connector for repo inspection/modification.
- Keep research isolated until certified.
- Do not claim old zero-trim quality figures as official.
- Do not claim the global-trim run's 234 worse as real optimizer losses.
- Do not start heuristic "manufacturing knowledge" layers before exact structural evidence.
- Heuristics may add/prioritize columns, not prune valid search, until proven.
- Lepton is a competitor/reference optimizer, not an authority on plant practice.
- Real operator feedback should eventually be recorded:
  - generated plan hash
  - sent-to-cut plan hash
  - whether manual edits occurred
  - edited boards
  - rejection reason.

---

## 15. Exact next milestone

MILESTONE:
**Close trim semantics across the complete corpus.**

Success condition:
`factoryEdgeOrReserve.failingCases == 0` across all project XMLs.

Then:
1. define explicit product trim policy;
2. implement it consistently across all geometry consumers;
3. rerun furniture holdout;
4. require zero `LB > Lepton` contradictions;
5. freeze official corrected baseline;
6. only then mine true losses A/A2/B/C/D/E/F;
7. resume exact pricing / 3-level work according to the measured structure of those true losses.

Do not branch into unrelated optimizer experiments before this milestone is closed.
