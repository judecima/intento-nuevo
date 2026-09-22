# OneBoard Reserved Root Band — Historical Cross-Validation — 2026-09-22

Status: FROZEN REPAIR CROSS-CHECKED / GENERALIZES, BUT TOO EXPENSIVE FOR PROMOTION

Branch:
`research/perfv3-industrial-incremental-20260922`

Frozen furniture holdout result:
`657fd5ad1656bba3b8690986ef76fa884078dc6b`

Historical V3 source:
- workflow: Optimizer Industrial V3 Incremental E2E
- run: 35689229312
- artifact: industrial-v3-e2e-results
- V3 paired valid cases: 20,841

Historical canonical corpus source:
- workflow: Optimizer Historical Corpus Bundle
- refresh run: 35796196148
- raw canonical records: 20,844

## Repair frozen before this cross-check

The candidate was designed only after the new sealed holdout had been consumed.

It targets the narrow OneBoard failure mode:
- current safe lower bound = 1
- current V3 uses >1 board
- current OneBoard best attempt leaves one or more pieces out

The repair:
1. identifies the family left out by the existing OneBoard search;
2. enumerates one explicit root band whose thickness is a dimension already present in the demand;
3. packs that reserved band with the missing family prioritized;
4. packs the sibling rectangle with the same legacy guillotine primitives;
5. accepts only an exact-demand, physically valid one-board plan;
6. otherwise returns the original V3 plan unchanged.

No historical threshold or case was used to design this frozen version before the cross-check below.

## Historical opportunity set

From the official V3 result:

- historical V3 rows: 20,842
- `cota == 1 && V3 boards > 1`: **190**
- share of historical rows: **0.9116%**

Reference physical panel counts inside those 190:
- Lepton = 1: **21**
- Lepton = 2: **169**

Current OneBoard best-attempt residual:
- leaves 1 piece: 160
- leaves 2 pieces: 23
- leaves 3 pieces: 5
- leaves 5 pieces: 2

## Frozen repair cross-check

Across all 190 triggers:

- accepted valid one-board repairs: **17 / 190 = 8.947%**
- accepted invalid plans: **0**
- fallback on misses: original V3 unchanged
- every accepted repair is a strict board-count improvement: 2 -> 1

Reference comparison:
- closes a Lepton=1 / V3=2 gap: **3**
- finds 1 board where Lepton=2 and V3=2: **14**

Structural diversity:
- accepted instances: 17
- unique structural fingerprints: **13**

Therefore the signal is not one duplicated family.

### Non-directional subset

Because legacy PROJECT directional/grain semantics are not authoritative for current application-level canRotate validation, the strict geometry reading should separate non-directional cases.

- non-directional triggers: **111**
- valid repairs: **4 / 111 = 3.60%**
- Lepton=1 / V3=2 closures: **1**
- Lepton=2 / V3=2 -> repair=1: **3**

Those four accepted cases:
- 4092271 — PROJECT — Lepton 1, V3 2, repair 1
- 4025663 — PROJECT — Lepton 2, V3 2, repair 1
- 4067715 — ORDER — Lepton 2, V3 2, repair 1
- 4124872 — ORDER — Lepton 2, V3 2, repair 1

The remaining 13 accepted repairs are legacy-directional PROJECT observations and are useful for engineering discovery, but must not be claimed as external validation of present per-piece rotation semantics.

## Cost

Raw repair cost across 190 triggers:
- total: **137,115 ms**
- mean: **721.7 ms / trigger**
- p50: **185.5 ms**
- p95: **3,955.8 ms**
- p99: **5,805.1 ms**
- max: **9,881 ms**

Existing OneBoard diagnostic/search work on the same 190:
- total: **8,643 ms**

Historical V3 aggregate wall was about 30,037,071 ms, so blindly appending this frozen repair to every `LB=1 && V3>1` trigger would add about **0.46%** to historical aggregate wall before accounting for any opportunity to reuse OneBoard state.

This aggregate cost is small because the gate is rare, but the per-trigger p95 is too high for a low-latency SaaS path.

Non-directional subset repair cost:
- total: 73,935 ms
- p50: 194 ms
- p95: 3,037 ms
- p99: 5,537 ms

## Decision

The frozen root-band hypothesis **generalizes outside the discovery holdout**:
- it closes previously unseen historical structures;
- it produces strict board wins;
- it produces no accepted invalid plan;
- fallback safety is architectural because misses preserve V3 unchanged.

But the implementation is **NOT promotable yet** because the brute-force reserved-band search is too expensive in the tail.

The next task is therefore not to expand the search space. It is to preserve this exact candidate set while reducing evaluation cost through:
- state reuse from the existing OneBoard attempt;
- candidate-band ordering;
- duplicate outcome elimination;
- early impossibility checks for the sibling rectangle.

Any cost optimization after this report uses consumed historical evidence and must be externally revalidated on a future fresh corpus before production promotion.
