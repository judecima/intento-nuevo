# Master40 Simple Choose — CLOSED candidate

Date: 2026-09-21

## Decision

**ACCEPT as a Performance V1 candidate.**

Keep all 40 Master rounds, all configs, all deterministic requests, all random restarts, the same Beam/Greedy paths, and the same downstream solver.

Simple Choose is an exact fast path inside the Rust `choose()` selector when:
- `multi_rebanada == false`; and
- dead-strip penalty is not active at the current level.

In that safe domain, the generic selector was doing work that cannot affect the result:
- building multi-slice measures even though multi-slice is off;
- carrying dead-strip risk machinery when the penalty is inactive;
- dispatching string-based generic ranking for every candidate.

The fast path preserves:
- the same representative order;
- the same candidate feasibility checks;
- the same top-3 ordering;
- the same random selection behavior;
- the same pool result.

## Why this target matters

Native profiling on the large Master tails showed that the remaining runtime is overwhelmingly inside the packer.

Across 4048571 / 4059795 / 4059352:
- ~87% of wall time is inside pack calls;
- `choose()` accounts for ~61.6% of pack time;
- >2.14 billion candidate evaluations were observed across the 3-case profile.

Other already-tested lines:
- Prepared Pool: **REJECTED**, aggregate ~-0.31% / noise-slower.
- Ordered Reps: **REJECTED**, aggregate ~-0.60% / mixed.
- Rust-resident Master40 scheduler alone: safe but only ~0-1%; JS↔Rust boundary is no longer the main bottleneck.

## Directed gate

Workflow: 35554360884

40 rounds in both arms, with Rank Cache + Lean Beam + Native Whole Greedy + Native Large Round already active in both.

- 4048571: **-11.19%**
- 4059795: **-11.80%**
- 4059352: **-15.15%**
- aggregate: **-12.07%**
- pool parity: **3/3**

## Broad generation gate

Workflow: 35555395909

Cohort:
- historical Master-active: 129
- exact canonical matched: 91
- selected large/tail cases: 30
- unmatched historical cases: 38
- rounds: 40

Correctness:
- pool parity failures: **0/30**

Generation latency:
- total: 224,962.84 -> 208,428.32 ms = **-7.35%**
- p50: 7,436.74 -> 6,847.36 ms = **-7.93%**
- p95: 13,101.18 -> 12,611.42 ms = **-3.74%**
- p99: 16,956.36 -> 15,308.25 ms = **-9.72%**

Representative cases:
- 4048571: **-10.75%**
- 4059795: **-10.38%**
- 4059352: **-8.36%**
- 4053333: **-13.18%**
- 4050509: **-11.67%**
- 4057789: **material positive, same pool**
- 4059776: small negative noise, same pool.

## End-to-end V10 gate

Workflow: 35555399070

Configuration:
- full V10;
- 40 Master rounds;
- packing cache disabled;
- MultiSlice envelope unchanged;
- Rank Cache active in both;
- Lean Beam active in both;
- Native Whole Greedy active in both;
- Native Large Round active in both;
- Simple Choose only in candidate.

Correctness:
- invalid: **0**
- digest differences: **0**
- board regressions: **0**
- remnant regressions: **0**

Latency:
- total: 475,979.04 -> 464,487.08 ms = **-2.41%**
- p50: 13,027.00 -> 12,270.13 ms = **-5.81%**
- p95: 35,046.70 -> 34,587.59 ms = **-1.31%**
- p99: 79,836.73 -> 78,786.89 ms = **-1.31%**

Master stage:
- 313,257 -> 299,127 ms = **-4.51%**
- activations: 24 -> 24

Representative V10:
- 4048571: 97.60 -> 96.50 s, same 112 boards/digest; Master 34.43 -> 31.94 s.
- 4059795: 36.34 -> 35.43 s, same 63 boards/digest; Master 18.70 -> 17.80 s.
- 4061529: **-6.58% E2E**
- 4050892: **-7.00% E2E**
- 4053866: **-7.63% E2E**

Cases where Master did not activate show only runner noise and no physical differences.

## Conclusion

This is a real, safe improvement. The next performance work should stay inside `choose()/fill()`, not return to JS↔Rust boundary work.

Do not reopen:
- Prepared Pool;
- Ordered Reps;
- Master40 scheduler migration as a latency optimization;
- round-count reduction.

The next candidate should target exact reductions in candidate evaluations inside `choose()` while preserving representative order and the exact top-3 result.
