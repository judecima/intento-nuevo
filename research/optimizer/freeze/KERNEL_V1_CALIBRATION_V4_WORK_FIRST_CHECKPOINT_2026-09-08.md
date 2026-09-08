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

## Time-censoring evidence

The first work-first physical rows plus `analyze-calibration-v4-censoring.mjs` established an explicit separation between completed work and historical wall-clock-censored work:

- Beam: 375 invocations, 0 timeout hits, 0% observed time censoring. Current `beam.expansionsMax` samples are completed-work evidence.
- Master: 3 invocations, 3 timeout hits, 100% observed time censoring. Current `master.nodesMax` values are right-censored throughput observations under the historical `msMaster=8000` ceiling, not completed-search requirements.
- OneBoard: 0 current invocations in the first work-first rows; no empirical attempt-budget evidence yet.

Therefore Master production-node budget selection must use an explicit historical-equivalence/reference-machine policy plus formal validation, rather than treating censored `nodesMax` maxima as required work.

## Early calibration ordering

Calibration v4 defaults to `--order work-first`, now stratified so the rare OneBoard path cannot be starved by Master-heavy hotspots:

1. reserve up to 12 historically OneBoard-activated feasible cases, cheapest historical cases first;
2. then continue normal work-first ordering across historical Master/OneBoard activation, higher historical hotspot `engineMs`, and larger piece-count proxies;
3. known extreme-tail orders remain forced last.

`--oneboardQuota N` changes the reserved OneBoard evidence stratum size. `--oneboardQuota 0` disables that reservation. `--order cheap-first` retains the previous cheap-to-expensive operational ordering and does not use work-first stratification.

This changes execution priority only. It does not change the exact 8,650-case certification universe, the candidate runtime, or permit budget promotion from an arbitrary substituted cohort. Existing successful `calibration-v4.partial.jsonl` rows remain valid and are skipped by filename on subsequent invocations.

## Gate state

- Historical infeasible replay: exact 60/60.
- Historical correctness predicate/execution semantics: recovered.
- Step 0 telemetry: empirically demonstrated.
- Beam time-censoring in current sample: none observed.
- Master time-censoring in current sample: 100%, policy issue explicitly recorded.
- OneBoard work evidence: pending, explicit quota added.
- Kernel runtime identity: must remain exact to `406396...` and is rechecked by the main freeze CI.
- Production deterministic budgets/watchdogs: still unresolved.
- Kernel V1 frozen: no.
- Worker isolation: blocked until freeze.
