# Kernel V1 — Calibration V4 Observability Checkpoint

Date: 2026-09-08

## Scope

This checkpoint changes freeze/calibration tooling only. `src/lib/optimizer/**` remains unchanged from Kernel V1 candidate `4063963260abb10c8d68d0e553942899c925cc2f`.

## Physical execution evidence reported from the calibration host

- Historical `parte1` infeasibility replay: 60/60 exact filenames, `exactSetMatch=true`.
- Correctness execution binding `physical-xml-historical-validity-v1`: empirically validated by that replay.
- Calibration v3: at least 80 valid cases with zero correctness/multiset failures.
- Composition Step 0 counters are live (`optimizarCalls`, `armarPlacasCalls`, `stageCalls`).
- Calibration v3 is **not authoritative for deterministic work-budget derivation**: cases reported `beam.calls > 0` while `beam.expansionsTotal`, Beam wall-time/control counters, Master work, and OneBoard work remained zero.

These physical-run observations are execution evidence from the calibration host; the generated local `test-results` artifacts are not claimed to be versioned in this repository by this checkpoint.

## V4 work-telemetry contract

Authoritative calibration harness:

`scripts/kernel-freeze/kernel-budget-calibration-v4.mjs`

Telemetry contract:

`step0-work-telemetry-v2`

V4 does not accept a call/run counter as proof that deterministic work is measured. A probe PASS requires at least one fresh valid run with one of:

- `beam.expansionsTotal > 0`
- `master.nodesTotal > 0`
- `oneboard.attemptsTotal > 0`

For Beam, `beam.calls > 0` with no expansions and no timeout/budget/watchdog terminal-control evidence is an observability failure.

V4 also captures child-process stderr and treats the existing safe fallback warning

`Beam Search falló, se usa greedy: ...`

as a failed observability probe/calibration row. This lets the next physical execution distinguish a missing aggregate counter from a Beam exception that is intentionally swallowed by the safe greedy fallback.

## Watchdog evidence boundary

Calibration runs with deterministic budgets and watchdogs OFF. Therefore `watchdogHits=0` during calibration is **not** formal zero-watchdog evidence. That evidence is collected later, after production watchdog values are calibrated, versioned, and enabled for formal certification.

## Disposition of v3

V3 remains useful for:

- correctness evidence,
- historical execution binding validation,
- timing/environment observations.

V3 rows must not be used to derive `OPTIMIZER_MAX_BEAM_EXPANSIONS`, `OPTIMIZER_MAX_MASTER_NODES`, or `OPTIMIZER_MAX_RESCUE_ATTEMPTS`.

## Next gate

Run V4 first with `--maxNew 1`. If the v4 probe measures real Beam/Master/OneBoard work, continue calibration in batches. If it fails, inspect `telemetry-probe-v4.json` and the captured `stderrTail` before modifying the optimizer runtime.

Any required change under `src/lib/optimizer/**`, even telemetry-only, must be promoted explicitly as a new Kernel candidate and rechecked; it must not be hidden under the original `406396...` candidate identity.
