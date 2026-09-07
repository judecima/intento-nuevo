# Kernel V1 Candidate — 2026-09-07

Status: **CANDIDATE, not frozen**.

This checkpoint closes the implementation work through roadmap point 4 without claiming the long-corpus gates from point 5.

## Included

1. Candidate A linked diagnostic traces in the runtime.
2. V20 per-board remnant-safe certified return.
3. Step 0 instrumentation for Beam, Pattern Master, OneBoard and composition multiplicity.
4. Deterministic work-budget path:
   - Beam: `maxExpansionesBeam`; wall clock only as `watchdogBeamMs` when the work budget is enabled.
   - Pattern Master coverage: `maxNodosMaster`; wall clock only as `watchdogMasterMs` when the work budget is enabled.
   - OneBoard: `maxIntentosRescate`; wall clock only as `watchdogRescateMs` when the work budget is enabled.

When a deterministic work budget is absent, the historical wall-clock behavior is preserved. This is intentional so calibration can be performed before changing runtime defaults.

## Adapter environment variables

- `OPTIMIZER_MAX_BEAM_EXPANSIONS`
- `OPTIMIZER_BEAM_WATCHDOG_MS`
- `OPTIMIZER_MAX_MASTER_NODES`
- `OPTIMIZER_MASTER_WATCHDOG_MS`
- `OPTIMIZER_MAX_RESCUE_ATTEMPTS` (recovered V19 name)
- `OPTIMIZER_RESCUE_WATCHDOG_MS` (recovered V19 name)

All are optional and default to OFF.

The optimization problem `inputHash` remains independent of runtime budgets. The in-process optimization cache key adds a deterministic-budget discriminator so results computed under different execution budgets cannot alias.

## Contract checks at this checkpoint

- Coverage `maxNodos=1`: exactly 1 node, exhausted, no plan.
- Coverage `maxNodos=2`: exactly 2 nodes, not exhausted, 2-board terminal plan accepted.
- OneBoard `maxIntentosRescate=3`: four isolated runs produce `3,3,3,3` attempts.
- Beam deterministic cap: expansion count is bounded by `maxExpansionesBeam`, independently of `presupuestoBeamMs`.
- Flags OFF retain legacy time-budget behavior.

## Not yet certified

This document does **not** declare Kernel V1 frozen. Roadmap point 5 still requires:

- 5 sentinels,
- 213 hotspot cohort,
- 8,669 correctness corpus,
- repeated runs,
- final invariant: same input + seed + deterministic budget => same `fullPlanHash`,
- watchdog hits = 0 under calibrated production budgets.

The worker-isolation spike remains separate until these freeze gates are satisfied. Hot-path optimization and roadmap points 7+ remain out of scope for this candidate.
