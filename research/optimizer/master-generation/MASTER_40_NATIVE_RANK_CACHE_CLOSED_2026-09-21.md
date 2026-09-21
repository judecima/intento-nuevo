# Master 40-round native rank cache — candidate closed

Date: 2026-09-21

## Decision

**ACCEPT as a Performance V1 candidate.**

Keep all **40 Master rounds**. Do not change the round schedule, candidate set, Beam width, pattern harvesting, or solver.

The accepted change only caches immutable ranking metrics inside the native Beam-candidate sorter:

- pending-area lower bound;
- remnant quality.

The legacy comparator recomputed those values on every sort comparison. The candidate computes them once per candidate and uses the exact same total ordering, including the canonical usage-signature tie-break.

## Rejected precursor

A first JS-only optimization reused already-derived lower bounds / plan quality inside `armBeam`.

3-case gate:

- pool parity: 3/3;
- aggregate generation improvement: **3.2%**.

Decision: **rejected as too small to scale**.

## Accepted native optimization

Files:

- `native/optimizer-pattern-generator/src/legacy_packer.rs`
- experimental flag: `OPTIMIZER_RUST_BEAM_RANK_CACHE_EXPERIMENTAL=1`

### Directed 3-case gate

40 rounds vs the same 40 rounds:

- 4050594: **-15.88%**
- 4059776: **-10.56%**
- 4060603: **-11.10%**
- aggregate: **-11.62%**
- pool digest parity: **3/3**

Workflow:

`35546273436`

## Broad Master-tail gate

Workflow:

`35546433288`

Cohort:

- historical Master-active: 129
- exact canonical matched: 91
- selected top Master-generation tails + sentinels: 26
- unmatched historical cases: 38
- rounds: **40 in both arms**

### Correctness

- pool parity failures: **0/26**
- same pool size: **26/26**
- same physical pool digest: **26/26**
- Rust fallback: none

Because the complete pattern pool is identical, downstream coverage receives the same pattern set. This experiment does not change search semantics; it only removes repeated ranking computations.

### Generation latency

| Metric | Control | Candidate | Improvement |
|---|---:|---:|---:|
| total | 368,407.01 ms | 329,321.34 ms | **10.61%** |
| p50 | 12,798.59 ms | 11,228.36 ms | **12.27%** |
| p95 | 21,681.41 ms | 18,124.05 ms | **16.41%** |
| p99 | 33,033.74 ms | 31,963.94 ms | **3.24%** |

Representative cases:

- 4059224: **-16.16%**
- 4056565: **-17.16%**
- 4051095: **-14.68%**
- 4050742: **-14.64%**
- 4061546: **-14.29%**
- 4050594: **-13.46%**
- 4059776: **-8.48%**

Large pools see less benefit:

- 4048571 (2439 pieces): **-0.69%**
- 4059795 (950 pieces): **+2.28% slower**

Interpretation: this removes comparator overhead effectively on medium Master tails, but very large orders are dominated by other work.

## What this proves

The best path is **not reducing the 40 rounds**. We can make those same rounds cheaper by eliminating repeated work inside each round.

This candidate is semantically stronger than heuristic pruning:

- no rounds removed;
- no candidates removed;
- no pattern changed;
- no Beam ordering changed;
- no downstream solver change.

## Do not reopen

Do not tune this optimization further with micro-variants of the comparator.

The next Master investigation, if needed, should target a larger cost center:

1. repeated JS <-> Rust serialization/hydration per Beam state; or
2. moving more of `armBeam` into native Rust while preserving the exact state ordering.

Do not reduce rounds, Beam width, or pattern families as part of that work.
