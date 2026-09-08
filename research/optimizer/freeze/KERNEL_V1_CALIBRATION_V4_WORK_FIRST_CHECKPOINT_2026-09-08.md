# Kernel V1 calibration v4 — work-first checkpoint

Date: 2026-09-08
Kernel candidate: `4063963260abb10c8d68d0e553942899c925cc2f`

## Empirical telemetry result

The v4 physical telemetry probe demonstrated live deterministic-work instrumentation without changing the kernel candidate. A fresh current run exercised Beam with non-zero measured expansions and Master with non-zero measured nodes; no Beam fallback warning was observed.

Conclusion: Step 0 work telemetry is operational. Calibration v3 rows remain correctness/timing evidence but are not authoritative work-budget evidence because v3 did not require measured work magnitude.

## Budget-scope correction

The production budget knobs are enforced per invocation/run, not per whole request. Therefore the primary calibration statistic must match that enforcement scope:

- `OPTIMIZER_MAX_BEAM_EXPANSIONS` -> `beam.expansionsMax` per `armarPlacasBeam` invocation.
- `OPTIMIZER_BEAM_WATCHDOG_MS` -> `beam.wallMsMax` per Beam invocation.
- `OPTIMIZER_MAX_MASTER_NODES` -> `master.nodesMax` per `resolverCobertura` run.
- `OPTIMIZER_MASTER_WATCHDOG_MS` -> `master.wallMsMax` per coverage run.
- `OPTIMIZER_MAX_RESCUE_ATTEMPTS` -> `oneboard.attemptsMax` per `rescatarUnaPlaca` invocation.
- `OPTIMIZER_RESCUE_WATCHDOG_MS` -> `oneboard.wallMsMax` per rescue invocation.

Aggregate per-order totals remain operational-load evidence. Candidate A has no aggregate request work budget. Adding one would change search semantics and requires a new candidate plus recertification.

## Early calibration ordering

Calibration v4 defaults to `--order work-first` for early batches:

1. historically Master/OneBoard-activated feasible cases first;
2. then higher historical hotspot `engineMs` where available;
3. then larger piece-count proxy;
4. known extreme-tail orders remain forced last.

`--order cheap-first` retains the previous cheap-to-expensive operational ordering.

This changes execution priority only. It does not change the exact 8,650-case certification universe or permit budget promotion from an arbitrary substituted cohort.

## Gate state

- Historical infeasible replay: exact 60/60.
- Historical correctness predicate/execution semantics: recovered.
- Step 0 telemetry: empirically demonstrated.
- Kernel runtime identity: must remain exact to `406396...` and is rechecked by the main freeze CI.
- Production deterministic budgets/watchdogs: still unresolved.
- Kernel V1 frozen: no.
- Worker isolation: blocked until freeze.
