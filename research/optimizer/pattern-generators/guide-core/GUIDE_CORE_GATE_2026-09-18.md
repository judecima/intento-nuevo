# Guide-Core Pattern Master Gate — 2026-09-18

## Decision

**PASS as research / not yet production-promoted.**

Baseline worker: `425ebba5de48eb0105d5cb46b08594b3dc50ff49`.

Guide-Core is a bounded pre-Master probe for the dominant `gap=1` regime. It
runs only three already-existing industrial pattern families:

- `COMMON_BAND`
- `GUIDE_HUB`
- `REPEATED_STRIPS`

All other Guide portfolio modes bypass directly to the frozen Pattern Master.

A result is accepted only if it physically materializes exactly the lower-bound
number of boards and passes Industrial V3. Any miss falls through unchanged.

## Why this formulation

A literal "guide piece must be first" prune was previously rejected because it
removed useful diversity. The productive interpretation of the guide idea is
instead:

> use a guide/family relation to generate a very small physically meaningful
> pattern pool before the generic subset generator.

The current legacy packer already deduplicates equal families by `_sig` inside
one position. The high-value reduction is therefore at the Pattern-Master
generation level, not another scan-level prune inside `elegir()`.

## Current Master-active corpus

Physical current cohort: 323 real XML orders.

- gap=1: 293
- gap=1 and <=160 pieces: 271
- historical Master wins in this regime: exactly 3
  - 4050594: 8 -> 7
  - 4056900: 7 -> 6
  - 4057401: 5 -> 4

The fourth historical Master winner, 4059200, is gap=5 and is intentionally
outside Guide-Core.

## Mode distribution on gap=1 / <=160

| mode | cases |
|---|---:|
| REPEATED_STRIPS | 73 |
| GUIDE_HUB | 25 |
| COMMON_BAND | 7 |
| NOT_APPLICABLE | 70 |
| WEAK_REPEATED_STRIPS | 48 |
| LARGE_REPEATED_STRIPS | 34 |
| PARTIAL_COMMON_BAND | 8 |
| WEAK_PARTIAL_BAND | 6 |

Guide-Core therefore runs on **105/271** cases and routes 166 directly to the
frozen Master.

## Full Guide-Core population replay

All 105 Guide-Core-eligible cases were executed.

Correctness:
- executed: **105/105**
- errors: **0**
- certified: **3**
- certified cases: exactly **4050594, 4056900, 4057401**
- historical winners retained: **3/3**
- new/unexpected certifications: **0**
- industrial invalids: **0**
- remnant regressions among certified historical outputs: **0**

Certified remnant comparison versus the historical final result:
- 4050594: equal
- 4056900: Guide-Core better
- 4057401: Guide-Core better

## Probe cost on 105 eligible cases

Total Guide-Core CPU: 18,145.394 ms.

| metric | Guide-Core CPU | historical full generation |
|---|---:|---:|
| p50 | **97.36 ms** | 6,382 ms |
| p95 | **523.54 ms** | 26,581 ms |
| p99 | **948.68 ms** | 54,587 ms |
| max | 1,036.54 ms | 56,998 ms |

Aggregate Guide-Core CPU is **1.78%** of the historical full-generation time of
the same 105 cases.

Per mode:

| mode | n | certifications | p95 CPU |
|---|---:|---:|---:|
| COMMON_BAND | 7 | 1 | 243.72 ms |
| GUIDE_HUB | 25 | 1 | 137.50 ms |
| REPEATED_STRIPS | 73 | 1 | 675.59 ms |

## Historical winner latency evidence

| order | mode | historical generation | Guide-Core probe |
|---|---|---:|---:|
| 4050594 | REPEATED_STRIPS | 26,091 ms | ~324 ms CPU |
| 4056900 | COMMON_BAND | 21,568 ms | ~244 ms CPU |
| 4057401 | GUIDE_HUB | 5,775 ms | ~25 ms CPU |

## Why weak/large modes are excluded

A targeted slow-tail replay showed that `LARGE_REPEATED_STRIPS` can cost
~1.7-11.9 s CPU before fallback without closing any tested negative case.
The three current gap=1 winners do not use that mode.

Therefore Guide-Core deliberately does not run:
- LARGE_REPEATED_STRIPS
- WEAK_REPEATED_STRIPS
- PARTIAL_COMMON_BAND
- WEAK_PARTIAL_BAND

This is a CPU-routing decision only. Those cases retain the frozen Master.

## Safety boundary

This gate is not yet a universal early-return proof for remnant objective #2.
The 105-case current replay shows no remnant regression, but a future unseen LB
solution from Guide-Core could in principle differ from the full Master's LB
solution.

Therefore production promotion still requires either:
1. a broader remnant-safe replay/certificate; or
2. using Guide-Core as a pattern seed/orderer while retaining a remnant-safe
   finishing stage.

The exact pre-Master cheap-LB gate is separately safer because it keeps the
existing incumbent unchanged when it certifies optimal board count.

## Current recommendation

Pipeline research order:

1. pre-Master cheap LB — exact certificate, skip Master where possible;
2. Guide-Core — fast physical attempt for unresolved gap=1 cases;
3. frozen Master fallback for every miss;
4. separately investigate a remnant-safe finishing certificate before enabling
   Guide-Core as a production early return.
