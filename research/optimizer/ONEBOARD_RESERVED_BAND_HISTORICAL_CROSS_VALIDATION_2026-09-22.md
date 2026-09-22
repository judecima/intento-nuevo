# ONEBOARD RESERVED ROOT BAND — HISTORICAL CROSS-VALIDATION — 2026-09-22

Status: QUALITY GENERALIZATION CONFIRMED / NOT YET PROMOTED

Branch:
`research/perfv3-industrial-incremental-20260922`

Discovery source:
- sealed holdout v2 furniture tail
- 36 observed `1 -> 2` furniture cases
- frozen reserved-root-band prototype closed 10/36 on the discovery set

This report records the first cross-validation against historical cases that did not create the repair.

## Historical trigger population

Historical trigger definition:
- safe lower bound = 1
- frozen V3 result > 1

Cases: **190**

Reference/Lepton board count:
- reference = 1: 21
- reference = 2: 169

Directionality as represented by the historical canonical corpus:
- non-directional: 111
- directional: 79

## Frozen repair result

Without changing the repair after the sealed-holdout discovery:

- cases: **190**
- valid one-board rescues: **17**
- rescue rate: **8.9474%**
- invalid accepted plans: **0**
- all 17 rescued cases had the existing OneBoard search miss by exactly one piece

Reference split:
- reference = 1: **3 / 21 rescued**
- reference = 2: **14 / 169 rescued**

Therefore:
- 3 cases close an existing `V3 2 -> reference 1` gap
- 14 cases produce a valid **1-board** plan where both stored V3 and the reference/Lepton result use **2 boards**

## Current-V3 verification

The 17 successful historical rescues were rerun against the current frozen V3 runtime.

Result:
- current V3 = 2 on **17 / 17**
- current V3 plans valid on **17 / 17**
- reserved-band candidate = 1 board on **17 / 17**

So the 17 improvements are real relative to the current V3 runtime, not artifacts of stale stored V3 results.

## Cost of the frozen discovery implementation

The first frozen cross-validation implementation is intentionally broad and expensive:

- repair total: **137,115 ms** over 190 cases
- p50 repair: **185.5 ms**
- p95 repair: **3,955.8 ms**
- p99 repair: **5,805.05 ms**

This is too expensive to promote as a broad synchronous production stage.

## Performance research after quality validation

Several implementation-only cost experiments were run after the quality cross-validation.

Best variant preserving all 17 rescues on the same consumed historical population:
- total repair time: **64,379 ms**
- p50: **114.0 ms**
- p95: **1,855.2 ms**
- p99: **2,838.98 ms**

A more aggressive variant reduced total time to **42,837 ms** but rescued only 16/17 and is rejected for now.

These cost experiments are NOT external validation because they were tuned on the same historical 190 cases. They may only be treated as implementation research until validated elsewhere.

## Decision

The geometric hypothesis **generalizes**:
- discovery set: 10/36 one-board furniture gaps rescued
- independent historical trigger set: 17/190 rescued
- current V3 verification: 17/17 remain genuine improvements
- invalid accepted plans: 0

The repair is therefore not noise, but it is not production-ready because the broad screening cost is still too high.

Next work should focus on a cheap, observable gate that preserves the 17 historical rescues and the 10 sealed-holdout discoveries without expanding the search space or changing the repair geometry.

No production optimizer code is promoted by this report.
