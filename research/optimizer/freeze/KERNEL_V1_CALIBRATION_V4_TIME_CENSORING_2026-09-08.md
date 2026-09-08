# Kernel V1 calibration v4 — historical time censoring

Date: 2026-09-08
Kernel candidate: `4063963260abb10c8d68d0e553942899c925cc2f`

## Why this checkpoint exists

Calibration v4 measures deterministic work counters while the historical wall-clock limits are still active because deterministic production budgets are intentionally OFF during calibration. Therefore a work counter observed on an invocation that reaches its historical timeout is a **right-censored observation**: it records how much work fit before the clock stopped the search, not how much work the search would require to finish.

This distinction is mandatory before promoting deterministic work budgets.

## Exact censoring signals

Do not infer censoring from `wallMsMax` proximity alone. Step 0 already records exact timeout events per invocation/run:

- Beam: `beam.timeoutHits / beam.calls`
- Pattern Master: `master.timeoutHits / master.runs`
- OneBoard: `oneboard.timeoutHits / oneboard.runs`

Each historical timeout hit is registered at most once in the corresponding invocation/run.

The companion analyzer is:

`scripts/kernel-freeze/analyze-calibration-v4-censoring.mjs`

It reads the existing `calibration-v4.partial.jsonl` checkpoint and can be run while or after the physical calibration without restarting or invalidating completed rows.

## Interpretation rules

### Uncensored path

If a path has sufficient tail coverage and zero historical timeout hits, its per-invocation work maxima can be interpreted as completed-search work observations for that sampled region. This is the desirable regime for deriving a deterministic work budget from empirical distributions.

### Time-censored path

If a path has non-zero historical timeout hits, the work maxima from affected cases are not completed-search requirements. They are throughput-at-time-cap observations and depend on the calibration machine/runtime.

For a censored path, do **not** promote a deterministic work budget by treating the maximum censored counter as the amount of work the algorithm naturally requires.

Instead choose one of two explicit policies:

1. obtain targeted uncensored evidence by running a separately scoped calibration experiment with a sufficiently high measurement ceiling, without changing the frozen kernel candidate; or
2. define a reference-machine/product work-budget policy explicitly, choose a fixed deterministic budget from that policy, and then validate the chosen value through formal correctness, quality comparison, determinism, and zero-watchdog certification.

The selected deterministic value is portable once fixed; what must not be hidden is that its selection came from a declared policy/reference environment rather than from an uncensored estimate of required search work.

## Candidate A aggregate-load boundary

Candidate A has per-invocation deterministic budgets only. It has no aggregate request work budget. Aggregate totals such as `beam.expansionsTotal`, `master.nodesTotal`, call/run counts, CPU and wall time remain operational-load evidence.

Do not add an aggregate request stop condition during the Kernel V1 freeze. That would change search semantics and require a new candidate and recertification.

## Current gate implication

Historical replay, correctness semantics and telemetry wiring remain complete. Time censoring does not invalidate correctness observations already collected. It affects only how deterministic production budgets are inferred from calibration work counters.

Kernel V1 remains **not frozen** until production budgets/watchdogs are explicitly selected, versioned and certified.
