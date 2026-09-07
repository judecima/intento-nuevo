# Determinism recovery + Step 0 telemetry

Date: 2026-09-07

## Why this is a prerequisite

The legacy optimizer still uses wall-clock limits as algorithmic stop conditions in Beam, Pattern Master coverage and OneBoard. A refactor can change allocation/call overhead and therefore change how much search fits inside the same time budget even when decision logic is unchanged.

Consequently, exact plan-hash equivalence is not a reliable refactor gate until search budgets are deterministic.

## Recovered work — do not rewrite from memory

The user-provided bundle `optimizer-v19-integration-reviewed.bundle` contains branch `v19-int` at:

- `2f2c2020f47c4c8a471d99360b70528646ace128` — `fix(optimizer): determinizar OneBoard y restaurar la ruta legacy exacta en cobertura`
- parent `fe9d246` — `feat(optimizer): deterministic budgets and cheap LB gate`

### Useful deterministic-budget logic in `fe9d246`

Preserve/rebase these parts:

- Beam: `maxExpansionesBeam` decides the normal search budget.
- Beam: `watchdogBeamMs` remains a hard runaway fuse only.
- Coverage B&B: `{ maxNodos, watchdogMs }` budget object.
- Pattern Master: `maxNodosMaster` decides normal B&B termination.
- Pattern Master: `watchdogMasterMs` remains a fuse.
- Runtime cache fingerprint includes deterministic budget flags so results from different search budgets cannot share the same in-process cache entry.
- Tests proving node-count cutoff semantics.

Do **not** blindly port the old cheap-LB integration from `fe9d246`; lower-bound work evolved through V20 and must use the current V20 semantics instead.

### Useful logic in `2f2c202`

Preserve/rebase exactly:

- OneBoard: `maxIntentosRescate` decides normal search.
- OneBoard: `watchdogRescateMs` is only a fuse when deterministic attempts are configured.
- Env: `OPTIMIZER_MAX_RESCUE_ATTEMPTS`.
- Env: `OPTIMIZER_RESCUE_WATCHDOG_MS`.
- Cache fingerprint includes OneBoard deterministic budget and watchdog.
- OneBoard returns `intentos` telemetry.
- Reproducibility test for deterministic attempt count.

Important correctness fix in `cobertura.cjs`:

- the legacy route must preserve the original ordering of the wall-clock check relative to terminal-state handling;
- deterministic-node mode may register a terminal solution reached by the last admitted node;
- legacy mode must retain the exact old behavior when deterministic budgets are disabled.

This separation is required so `flags OFF` remains genuinely legacy-compatible.

## Generated legacy source rule

`src/lib/optimizer/legacy/*.cjs` is mechanically regenerated from the HTML source by `scripts/extract-legacy-optimizer.mjs`.

Therefore the recovered changes must **not** be reintroduced only as manual edits to generated files.

When determinism work resumes:

1. port the transformations into `patchExtractedModule()` / extractor-owned post-processing;
2. regenerate the legacy files;
3. assert generated output contains the deterministic budget logic;
4. add a regeneration-parity test so rerunning the extractor cannot silently erase determinism.

The new product/domain architecture must remain outside `legacy/`.

## Beam calibration warning — budget is currently per invocation

`presupuestoBeamMs` is a per-call budget, not an order-level budget. `armarPlacas`/Beam can be invoked many times across a single optimization, and `optimizar` itself may be invoked repeatedly by rescues/pattern generation.

Therefore `maxExpansionesBeam` must **not** be calibrated simply as the number of expansions that fit in one 1500 ms call.

Calibration must use aggregated per-order telemetry.

## Step 0 — telemetry only, no decision changes

Before deterministic counters govern anything, instrument the current clock-governed path and run the frozen 213 cohort.

No new counter may change a loop condition in Step 0.

Per optimization request record at minimum:

### Beam
- `beamCalls`
- `beamExpansionsTotal`
- `beamExpansionsMaxPerCall`
- `beamWallMsTotal`
- `beamWallMsMaxPerCall`
- `beamTimeoutHits`
- `beamWatchdogHits` (future deterministic mode)

### Pattern Master coverage
- `masterRuns`
- `masterNodesTotal`
- `masterNodesMaxRun`
- `masterWallMsTotal`
- `masterTimeoutHits`

### OneBoard
- `oneboardRuns`
- `oneboardAttemptsTotal`
- `oneboardAttemptsMaxRun`
- `oneboardWallMsTotal`
- `oneboardTimeoutHits`

### Composition / multiplicity
- `optimizarCalls`
- `armarPlacasCalls` or equivalent packing-call count
- per-stage call counts sufficient to explain multiplication of per-call budgets

### Result identity
- board count
- industrial validation result
- remnant quality tuple
- full canonical plan hash (placements + cuts + remnants, normalized deterministically)

## Step 0 output

The first 213 telemetry run must answer:

1. which cases actually hit a wall-clock limit;
2. which stage hits it;
3. total work done per request, not merely per call;
4. distribution p50/p90/p95/max of expansions/nodes/attempts;
5. correlation between timeout hits and plan/hash instability;
6. the adversarial cohort to use for budget calibration.

`4055246` is a mandatory known time-sensitive case because a small runtime perturbation already changed its full plan hash while preserving board count.

The five Master sentinels remain mandatory quality sentinels:
- `4050594`
- `4056900`
- `4057401`
- `4058501`
- `4059200`

## Calibration sequence after Step 0

Only after telemetry:

1. calibrate Beam deterministic work budget using **aggregate per-order** cost/work distributions, not one 1500 ms invocation;
2. calibrate Master node budget;
3. reuse recovered OneBoard deterministic-attempt implementation and calibrate its attempt count;
4. retain clock watchdogs as emergency fuses only;
5. record watchdog activation as a determinism violation;
6. run adversarial cohort;
7. run 213 hotspot;
8. run 8,669 correctness corpus.

During the wall-clock -> deterministic-budget transition, board/remnant/validation quality is authoritative. Full-plan hash is diagnostic because the search policy itself is changing.

After deterministic budgets are frozen, full-plan hash equality becomes the mandatory gate for architecture-only refactors.

## Architecture after determinism

Do not wrap the hot path in classes. Keep these functions untouched initially:
- `elegir`
- `llenar`
- `empacarPlaca`
- `mejorEncaje`
- `armarPlacas`

Refactor orchestration first, outside `legacy/`, using separate objective contracts:
- `LowerBoundProvider`
- `BoardReductionStrategy`
- `RemnantPolishStrategy`

Board-count certification may terminate the board-reduction phase, but must never implicitly terminate remnant polish.

## Current ordering

1. finish V20 remnant repair evidence;
2. Step 0 telemetry;
3. deterministic budget calibration using recovered V19 work;
4. freeze deterministic reference + full-plan hashes;
5. architecture/facade refactor;
6. domain separation;
7. resume V22 / new optimization research.
