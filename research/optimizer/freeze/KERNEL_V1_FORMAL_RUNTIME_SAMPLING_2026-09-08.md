# Kernel V1 — formal runtime sampling gate

Date: 2026-09-08
Kernel candidate: `4063963260abb10c8d68d0e553942899c925cc2f`

## Purpose

Before starting the two full formal passes (correctness and determinism repeat), estimate their operational cost from a representative random sample rather than from deliberately biased work-first or hotspot cohorts.

This is a planning gate only. It does not replace formal correctness/determinism evidence and does not change `src/lib/optimizer/**`.

## Population

The exact accepted `resto` cohort is 8,650 identities. Under `HISTORICAL_VALIDITY_V1` physical classification:

- feasible / sent to `optimizeProject`: 8,168
- expected-infeasible / classified but not optimized: 482

Runtime projection for the expensive per-case optimizer execution must therefore use 8,168 fresh child executions per formal pass, not 8,650.

## Why previous timing cohorts cannot estimate the formal cost

- the 213 hotspot marker deliberately represents the expensive historical tail;
- calibration v4 `work-first` deliberately prioritizes cases likely to exercise Beam, Master, and OneBoard;
- neither is a representative sample of the full feasible population.

The formal runtime estimate must use a reproducible random-without-replacement ordering over all 8,168 feasible identities.

## Reproducible sample

`kernel-budget-calibration-v4.mjs` supports:

- `--order random`
- `--sampleSeed <literal seed>`
- a dedicated `--out` directory so runtime-planning rows never mix with the authoritative work-first budget checkpoint.

Random ordering is deterministic: identities are ordered by SHA-256 of `sampleSeed + NUL + literal filename`. The same seed therefore selects the same prefix of the feasible population on every machine/run.

Recommended seed:

`kernel-v1-formal-runtime-sample-20260908`

Recommended target:

- checkpoint after 100 random cases;
- extend to 200 using the same output directory and seed;
- do not substitute a convenient hand-picked cohort if the random sample happens to include slow cases.

## Fresh-process overhead measurement

Calibration v4 now records two clocks for new rows:

- `wallMs`: existing child-side `optimizeProject()` wall time, measured after optimizer import/input preparation;
- `processWallMs`: parent-side time from immediately before `fork()` until child exit;
- `freshProcessOverheadMs = processWallMs - wallMs`.

The overhead therefore includes process startup, module/bundle import, input preparation, IPC and shutdown around the actual optimizer call. It directly measures the cost of the intended one-fresh-process-per-feasible-case isolation model.

Do not weaken isolation based on an assumed startup overhead. Measure it first. Batching inside one process is considered only if the projected measured overhead is operationally material and only with an explicit state-reset/equivalence design.

## Commands

First 100:

```bash
node scripts/kernel-freeze/kernel-budget-calibration-v4.mjs \
  --historicalCorpus /tmp/parte1 \
  --corpus /tmp/resto \
  --order random \
  --sampleSeed kernel-v1-formal-runtime-sample-20260908 \
  --oneboardScanLimit 0 \
  --maxNew 100 \
  --out test-results/kernel-v1-formal-runtime-sample
```

Estimate after 100:

```bash
node scripts/kernel-freeze/estimate-formal-runtime-v1.mjs \
  --input test-results/kernel-v1-formal-runtime-sample/calibration-v4.partial.jsonl \
  --preflight test-results/kernel-v1-formal-runtime-sample/corpus-preflight-v3.json
```

Extend from 100 to 200 by rerunning v4 with the same `--out`, `--order`, and `--sampleSeed` and `--maxNew 100`. Successful rows are checkpointed by literal filename, so the second invocation adds the next 100 random identities instead of repeating the first 100.

## Estimator outputs

`estimate-formal-runtime-v1.mjs` reports:

- sample p50/p90/p95/p99/max and arithmetic mean for end-to-end fresh-process time;
- the same for child-only optimizer time and fresh-process overhead;
- projected hours for one formal pass and both passes;
- a bootstrap 95% interval for the sample mean/projection;
- the fraction of mean end-to-end time attributable to fresh-process overhead;
- known versioned extreme tails and whether the random sample happened to include them.

The estimator writes:

`test-results/kernel-v1-formal-runtime-sample/formal-runtime-estimate-v1.json`

## Tail interpretation

Rare extreme cases can dominate total runtime and may be missed by a 100-200 case random sample. Therefore the estimator keeps the versioned known extreme tails visible as a separate planning reserve and records whether they were sampled.

Do not mechanically add historical tail times to the random-population projection: that would double-count tail probability. Use the tail reserve to assess sample representativeness and to schedule known extremes explicitly at the end of each formal pass.

## Budget timing boundary

This first sample measures the current Candidate A historical-clock behavior with production deterministic budgets still unresolved. Once the six production budget/watchdog values are versioned, rerun the same literal random sample (same seed, separate output directory) if those values materially change runtime before committing to the full formal passes.

The six current knobs still do not budget `generarPatrones`; the random end-to-end sample intentionally captures that cost because it will remain present in Kernel V1 formal execution.

## Decision gate

Before launching the full correctness pass, require a runtime estimate sufficient to choose an execution plan:

- expected hours per pass;
- uncertainty band;
- known-tail reserve;
- measured fresh-process overhead;
- explicit decision whether serial execution is practical or whether formal execution must be partitioned/parallelized while preserving one fresh process per case.

Parallelizing independent fresh-process cases or splitting the fixed identity set into deterministic shards does not by itself weaken isolation. Changing from fresh-process-per-case to multi-case process reuse is a separate methodological change and requires explicit justification.
