# Kernel V1 calibration v4 — 55-case evidence update

Date: 2026-09-08
Kernel candidate: `4063963260abb10c8d68d0e553942899c925cc2f`

This checkpoint records the first calibration state with substantial measured populations for all three deterministic work paths. It supersedes the earlier attribution of ~18–21 second small-order wall time to OneBoard itself; the latency symptom was real, but the causal attribution was wrong.

## OneBoard — work budget effectively resolved

Observed over the current authoritative calibration rows:

- activated cases: 22
- invocations: 22
- structurally complete single-run cases: 21
- `attemptsMax`: n=22, p50=384, p90=384, max=384
- `wallMsMax`: n=22, p50=1,813 ms, p90=2,324 ms, max=2,366 ms
- raw timeout hits: 0
- censoring status: `NO_RIGHT_CENSORING_OBSERVED`

Interpretation:

`OPTIMIZER_MAX_RESCUE_ATTEMPTS = 384` has both structural and empirical exact-equivalence support. The current OneBoard search space itself is finite at 384 configurations, and the measured population reaches that structural ceiling without historical timeout censoring.

The deterministic rescue watchdog remains a separate safety value. It should be placed comfortably above the completed-search wall-time envelope so it does not replace the deterministic attempt budget with a hardware-dependent truncation. The current measured envelope is 2,366 ms; the final watchdog value must still be versioned and then prove zero watchdog hits under formal certification.

Correction to earlier latency interpretation: the ~18–21 second wall times observed in several small `areaLB=1` orders are not OneBoard execution time. OneBoard's measured median is ~1.8 seconds and current maximum ~2.37 seconds. The order-level latency remains a real product concern, but its cause lies elsewhere in the V10 pipeline.

## Beam — completed-work core plus extreme tail

Current evidence:

- activated cases: 48
- invocations: 2,518
- timeout hits: 4
- timeout rate: ~0.16% of invocations
- cases with any Beam timeout: 1
- uncensored `expansionsMax`: n=47, p50=20, p90=32, max=1,016

Interpretation:

The Beam distribution is strongly right-skewed. The normal regime is tiny relative to the extreme tail: p50=20 and p90=32 expansions per invocation, while the largest uncensored observed invocation reaches 1,016. A budget selected from the raw maximum would therefore be roughly 30x the observed p90.

Beam calibration must keep uncensored and timeout-containing cases separate. The current sample is already strong evidence that the historical 1,500 ms ceiling almost never binds, but the final deterministic expansion budget must preserve the rare high-work cases that materially affect plan quality. Formal correctness/quality validation, not a single percentile, decides whether a proposed tail budget is sufficient.

## Pattern Master — explicitly bimodal

Current evidence:

- invocations: 27
- timeout hits: 5 (~18.5%)
- uncensored runs: 22
- uncensored `nodesMax`: p50=1, p90=1, max=580
- censored runs: 5, reaching up to ~1.3M nodes at the historical ~8 second wall-clock ceiling

Interpretation:

Master is not well represented by one empirical percentile. It has two distinct regimes:

1. trivial convergence: most uncensored runs terminate immediately, usually at one node;
2. explosive search: a minority run until the historical 8 second time ceiling and are right-censored.

Therefore `OPTIMIZER_MAX_MASTER_NODES` must remain a documented historical-equivalence/reference-machine policy decision for the explosive regime, followed by formal correctness/quality validation. The censored node counts are throughput under a wall clock, not completed-search requirements.

## Budget status after 55 cases

- `OPTIMIZER_MAX_RESCUE_ATTEMPTS`: strong provisional value `384`.
- `OPTIMIZER_RESCUE_WATCHDOG_MS`: pending; completed-search envelope currently maxes at 2,366 ms.
- `OPTIMIZER_MAX_BEAM_EXPANSIONS`: empirical distribution established, tail-policy decision still pending.
- `OPTIMIZER_BEAM_WATCHDOG_MS`: pending formal value; historical timeout incidence is currently very low.
- `OPTIMIZER_MAX_MASTER_NODES`: historical-equivalence policy still required for explosive/censored regime.
- `OPTIMIZER_MASTER_WATCHDOG_MS`: pending formal value.

Production values in `KERNEL_V1_FORMAL_CERTIFICATION_POLICY.json` remain null until all six values are explicitly selected, versioned, and validated. Kernel runtime identity remains unchanged.

## Small-order latency attribution

Because OneBoard is no longer a plausible explanation for the ~20 second small-order wall time, a separate non-kernel diagnostic has been added:

`scripts/kernel-freeze/diagnose-calibration-v4-latency.mjs`

It selects the slowest successful `areaLB=1` rows already present in `calibration-v4.partial.jsonl`, reuses their cached canonical inputs, re-runs them in fresh processes under the same V10 balanced calibration environment, and reports:

- `metricasV10.total.ms`
- OneBoard ms
- Master ms
- MultiSlice ms
- compactation ms
- cheap lower-bound ms
- remnant-polish ms
- residual V10 ms
- nested Beam wall time/work and composition call counts

Output:

`test-results/kernel-v1-formal-certification/latency-diagnostics-v4.json`

The residual is deliberately not named "baseline": it is total V10 orchestration time minus explicitly timed top-level modules and may contain baseline/composition work plus other untimed orchestration/validation. Nested Beam/composition telemetry is reported alongside it to locate the expensive subpath without double-counting.

This diagnostic changes no search semantics, budgets, parser behavior, corpus membership, or calibration ordering.
