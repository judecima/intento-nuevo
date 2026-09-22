# OneBoard Reserved Root Band — Cost Reduction Checkpoint — 2026-09-22

Status: RESEARCH CANDIDATE / QUALITY SIGNAL GENERALIZES / COST REDUCED / NOT EXTERNALLY VALIDATED FOR PROMOTION

Branch:
`research/perfv3-industrial-incremental-20260922`

Quality cross-check commit:
`6ac8b5996d27c152f6ca382142953ee3a4a09483`

## Frozen quality signal

Discovery holdout, furniture `1 -> 2` failures:
- cases: 36
- valid one-board repairs: **10 / 36 = 27.78%**
- accepted invalids: 0

Historical cross-check opportunity:
- official V3 rows: 20,842
- `cota == 1 && V3 > 1`: **190**
- valid one-board repairs: **17 / 190 = 8.95%**
- accepted invalids: 0
- strict board wins vs V3: 17

Historical reference distribution of the 17 wins:
- Lepton 1 / V3 2 / repair 1: **3**
- Lepton 2 / V3 2 / repair 1: **14**
- unique structural fingerprints: **13**

Non-directional strict geometry subset:
- triggers: 111
- valid repairs: 4
- one closes a Lepton=1 / V3=2 gap
- three produce 1 board where Lepton and V3 both used 2

Directional PROJECT observations remain engineering evidence only; they are not external validation of present application-level canRotate semantics.

## Cost evolution

All variants below keep the same root-band idea and accept only exact-demand, physically valid one-board plans. Misses fall back to V3 unchanged.

### V0 — brute frozen repair

Historical 190:
- wins: 17
- total repair cost: **137,115 ms**
- p50: 185.5 ms
- p95: 3,955.8 ms
- p99: 5,805.1 ms
- max: 9,881 ms

New 36:
- wins: 10
- total: 10,362 ms

### V1 — safe prechecks + candidate ordering

Changes:
- candidate root thicknesses belonging to the missing family are tried first;
- before packing the sibling, reject it when:
  - remaining raw piece area exceeds sibling area, or
  - at least one remaining piece has no legal orientation fitting the sibling.

These checks do not remove any physically feasible candidate.

Historical 190:
- wins: **17 / 17 preserved**
- total: **103,242 ms**
- p50: 135.5 ms
- p95: 2,761.15 ms
- p99: 5,270.66 ms
- max: 6,192 ms
- cheap sibling rejects: 4,412

New 36:
- wins: **10 / 10 preserved**
- total in isolated run: about 7,981 ms before the later deterministic budget

### V2 — deterministic 30 root-band attempts

Observed fact across the consumed discovery + historical evidence:
- all 27 known wins are found within the first 30 root-band attempts.

Research budget:
- maximum root-band candidates: **30**

Historical:
- wins: **17 / 17 preserved**
- total: 89,194 ms
- p50: 134.5 ms
- p95: 2,382.9 ms
- p99: 4,709.0 ms

New:
- wins: **10 / 10 preserved**

This budget is evidence-tuned and therefore requires a future fresh holdout before promotion.

### V3 — 30 bands + maximum 64 sibling checks

Observed fact:
- all 27 known wins occur by sibling check 64;
- only one historical win needs to reach that boundary.

Research budget:
- max root-band candidates: 30
- max sibling pack checks: **64**

Historical 190:
- wins: **17 / 17 preserved**
- total: **71,664 ms**
- p50: **127.5 ms**
- p95: **1,976.45 ms**
- p99: **3,206.82 ms**
- max: **3,770 ms**

New 36, isolated:
- wins: **10 / 10 preserved**
- total: **6,201 ms**

Reduction vs frozen brute version:
- historical total: **-47.74%**
- historical p95: about **-50.0%**
- historical p99: about **-44.8%**
- historical max: about **-61.8%**
- new discovery cohort total: about **-40.2%**

No known quality win was lost.

## Aggregate economics

The repair gate exists only when:
`safe cota == 1 && current V3 > 1`

Historical frequency:
- 190 / 20,842 = **0.912%**

Historical V3 aggregate wall:
- about 30,037,071 ms

V3 research repair cost:
- 71,664 ms

Equivalent aggregate overhead if appended after V3:
- about **0.24%** of historical V3 wall

This does not include the diagnostic rerun used by the research harness to recover the missing family. The existing OneBoard pass already computes the relevant near-complete state; a production-quality integration should expose/reuse that state instead of rerunning OneBoard.

Measured duplicate sibling memoization produced essentially no useful cache hits and is not considered a material optimization.

## Decision

The root-band direction now satisfies the quality side strongly enough to keep:
- independent historical generalization exists;
- strict board wins exist;
- no accepted invalid plan;
- fallback cannot worsen V3;
- search cost has been cut roughly in half without losing known wins.

It is still **research-only** because:
1. the 30/64 deterministic budgets were chosen after observing consumed data;
2. p95 per triggered case is still about 2 seconds;
3. current application-level directional/canRotate semantics need an external authoritative corpus.

Next engineering step:
- expose the best failed OneBoard placement / missing-family state from the existing OneBoard execution;
- call the reserved-band rescue only from that already-computed state;
- do not expand the search space;
- validate the resulting integrated candidate on the next fresh holdout before promotion.
