# Post-Compact Cheap Lower Bound — Master-active gate

Date: 2026-09-18  
Base: `experiment/optimizer-oneboard-baseline-reuse` at `5ecd298069241acd824033ca966aff968ab8d8dd`  
Research branch: `experiment/optimizer-post-compact-cheap-lb`

## Decision

**PASS as a research optimization. Production default remains OFF.**

The safe pruning point is:

```text
Baseline
  -> Dead-strip compactation / equal-board remnant improvement
  -> Hybrid Cheap Lower Bound
       if LB == physical incumbent: return
  -> MultiSlice
  -> OneBoard
  -> Pattern Master
```

This deliberately does **not** revive the rejected V20 post-baseline early return.
Compactation runs first, so objective #2 (equal-board commercial-remnant quality)
is preserved before any later board-rescue work is skipped.

Feature flag:

`OPTIMIZER_POST_COMPACT_CHEAP_LB_EXPERIMENTAL=1`

Default remains OFF.

## Why the cut is safe

After compactation, the current V10 pipeline has already executed the only stage
that is allowed to replace an incumbent with the same board count solely for
better remnant quality.

The later V10 calls use `aceptar()`, whose contract is strictly fewer boards:
an equal-board MultiSlice / OneBoard / Pattern Master candidate is rejected.

Therefore, if a mathematically valid lower bound equals the physical incumbent
after compactation, no later stage can improve the primary objective and no
equal-board remnant improvement is being skipped.

The implementation also refuses any lower bound that exceeds the physical
incumbent and records that as a violation.

## Master-active physical cohort

Historical Master-active cohort: **323 unique real orders**.

Running the exact Hybrid Cheap LB (Raster OFF), 97/323 cases were candidates for
certification against the historical pre-Master incumbent.

Those 97 were then replayed through the **current V10 baseline + compactation**
with MultiSlice, OneBoard and Master disabled only to observe the exact safe
cut point.

Results:

- post-compact cases replayed: **97**
- certified after compactation: **97/97**
- lower-bound violations: **0**
- execution errors: **0**
- compactation activations: **52**
- accepted compactation improvements: **12**
- cases whose board count changed from historical pre-Master incumbent: **0**

Thus every prefiltered certificate remained valid after objective-#2 compactation.

Certificate composition:

- gap +1: 95
- gap +2: 1
- gap +43: 1

Binding source:

- Claude DFF: 57
- Claude kerf: 38
- V14 tall>1/3: 2

## Lower-bound cost

On the 97 safe post-compact candidates in this replay:

| metric | LB wall |
| --- | ---: |
| total | 387.36 ms |
| mean | 3.99 ms |
| p50 | 0.63 ms |
| p95 | 13.98 ms |
| p99 | 115.45 ms |
| max | 115.45 ms |

The large max is dominated by the known large-instance strong-bound path; it is
still tiny relative to the avoided Pattern Master generation.

## Historical Master generation avoided

The same 97 orders historically spent:

- **1,074,579 ms = 1,074.6 s** in Pattern Master generation + monotypes.

Across all 323 Master-active orders:

| metric | frozen generation | projected post-compact LB |
| --- | ---: | ---: |
| total | 6,218.362 s | 5,143.783 s |
| p50 | 9.433 s | 5.113 s |
| p90 | 49.173 s | 39.857 s |
| p95 | **64.351 s** | **59.532 s** |
| p99 | **120.513 s** | **120.513 s** |
| max | 462.825 s | 462.825 s |

Minimum projected generation reduction: **17.28%**.

This is a conservative projection because it counts only Pattern Master
generation. A certified post-compact return also avoids any later MultiSlice,
OneBoard and Master solver/materialization cost.

## Remnant regression sentinel

Real order `4050544__CAOBA_CAOBA4050544.xml` is frozen into the contract test.

Baseline:

- boards: 3
- largest commercial remnant: 2,222,000 mm²
- second: 727,050 mm²
- fragments: 5
- total commercial area: 4,284,942 mm²

After compactation:

- boards: 3
- largest: 2,222,000 mm²
- second: **1,045,254 mm²**
- fragments: **4**
- total: **4,451,621 mm²**

The new lower-bound gate certifies only **after** that improvement has been
accepted. The test requires the returned plan to retain exactly those values and
requires MultiSlice, OneBoard and Pattern Master not to execute afterward.

This directly covers the quality failure mode that blocked the earlier V20
post-baseline canary.

## CI

Workflow: `Optimizer Post-Compact Cheap LB`

The gate compiles the native Rust addon and runs:

- Rust unit tests;
- post-compact lower-bound contract;
- OneBoard baseline-reuse regression;
- TypeScript typecheck;
- complete Vitest suite.

Current gate: **PASS**.

## Remaining tail

This optimization improves aggregate time and p95, but does not move p99.

The four historical p99 generation cases remain unresolved:

- 4048571: 2,439 pieces / 72 types / 462.825 s generation
- 4059795: 950 pieces / 66 types / 134.731 s
- 4056720: 1,428 pieces / 4 types / 120.548 s
- 4056676: 1,417 pieces / 4 types / 120.513 s

The last two are especially interesting: the legacy 40-round subset generator
has only 15 possible non-empty masks for four logical types, so repeated subset
families are unavoidable. That is the next bounded research target.
