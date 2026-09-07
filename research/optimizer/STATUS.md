# Optimizer status

Base branch: `feature/agregar_configuracion_organizacion`

## Active roadmap - user decision 2026-09-07

The [frozen roadmap](ROADMAP_2026-09-07.md) supersedes earlier sequencing:
1. deferred trace: complete the 213-case identity/trace gate; integrate only if it passes;
2. V20 remnant repair: separate safety from legacy recovery, then net timing and canary decision;
3. Step 0 telemetry, recover V19 deterministic budgets, calibrate per-order work and freeze hashes;
4. isolate the current optimizer behind a queue and workers, before strategy facades;
5. architecture/facade with separate board reduction, certification and remnant polish;
6. interactive initial plan and background improvements;
7. shared/subproblem memory, strategy ranking/ML and external challengers later.

Deferred trace source: `experiencia/traza-diferida.bundle`, commit `e133e7e`.
The reported 61/61 gate is user-provided evidence pending artifact linkage;
the bundle itself records five measured cases. Neither implies a completed 213-case gate.
Local review now reproduces a failing Master sentinel: `4050594` retains 7 boards
and identical geometry but loses traces on all 103 final pieces (247 -> 0 steps).
See [the gate report](DEFERRED_TRACE_GATE_2026-09-07.md). Candidate integration is
blocked; repair trace preservation before continuing the full cohort.
Repair experiment: [candidate A and conditional candidate B](TRACE_CANDIDATES_2026-09-07.md).
A retains linked traces and removes the two Master trace-suppression overrides.
Its two materialization contracts and `4050594` full-plan gate pass; remaining
sentinel/cohort evidence must be completed before integration.
V22 remains paused; local guided/family pattern generation remains closed.
The ~31.9% combined saving is an orthogonality scenario, not a measured result.

## Governing objective — frozen
1. minimize board count;
2. with the same board count, maximize industrial/commercial remnant quality;
3. never add a board to improve remnant;
4. only after quality is preserved, reduce computation time;
5. zero correctness regressions.

Remnant quality is therefore ahead of latency. A fast path that preserves boards but loses an accepted equal-board remnant improvement is not release-safe.

## CLOSED — V19
- integrated in main line
- staged experimental features remain behind disabled flags

Important recovered V19 work is preserved outside the merged line and must not be rewritten from memory:
- `fe9d246` — deterministic Beam + Pattern Master B&B budgets with clock watchdogs;
- `2f2c2020f47c4c8a471d99360b70528646ace128` — deterministic OneBoard attempts + exact legacy coverage semantics fix.

The exact recovery source and migration rules are documented in `research/optimizer/determinism/DETERMINISM_RECOVERY_AND_STEP0_2026-09-07.md`.

## CLOSED / MERGED — V20 post-baseline certification

Frozen 213-hotspot result:
- baseline total: 14,247,507 ms
- boards: 2,371
- deterministic historical stages avoided by certification: 1,886,016 ms
- relative stage-time benefit: ~13.24%
- board regressions observed: 0
- invalid plans observed: 0
- cheap-LB violations observed: 0
- cheap-LB errors observed: 0

Original performance gate was 15%. It was not reached and is not rewritten retrospectively.

Runtime flag remains OFF by default:
`OPTIMIZER_POST_BASELINE_CHEAP_LB_EXPERIMENTAL=0`

### Release status: BLOCKED — remnant regression
V20 correctly certifies the minimum board count, but its early return skips the global dead-strip compactation stage. On the currently measured certified sample:
- 89 certified cases;
- compactation would have activated 52 times;
- compactation saved 0 boards, as expected after certification;
- compactation produced 20 accepted equal-board remnant improvements.

Therefore current V20 improves latency while degrading objective #2 on a material fraction of certified cases. Do not enable the canary until this is repaired or the product objective is explicitly changed.

Planned repair: after board-count certification, skip global rescues that can no longer reduce boards, but run a cheap **per-board remnant defragmentation/repack**. Each existing board is treated as a fixed one-board subproblem; accept a replacement only when it still uses exactly one board, passes validation, and `calidadRestos` improves.

The repair experiment now separates:
- **safety relative to V20 today**: mandatory 0 board regressions, 0 invalid plans, and never worse remnant than current V20;
- **legacy compactation recovery**: measured independently because global compactation may move pieces between boards while per-board repair cannot.

Partial recovery is not automatically treated as an unsafe implementation, but any remaining quality gap versus accepted legacy compactation must be explicitly resolved or accepted before V20 can be called release-equivalent on objective #2.

## NEXT AFTER V20 — deterministic search Step 0

Architecture refactoring is blocked until search budgets stop depending on wall-clock speed.

Current clock-governed areas include:
- Beam (`presupuestoBeamMs` per invocation);
- Pattern Master coverage (`msMaster`/coverage wall-clock limit);
- OneBoard (`msRescate`).

Before calibrating deterministic counters, run a **telemetry-only Step 0** on the frozen 213 cohort. Counters must observe but not govern decisions.

Required per-order telemetry includes aggregate Beam calls/expansions/time/timeout hits, Master nodes/time/timeout hits, OneBoard attempts/time/timeout hits, optimizer/packing call multiplicity, remnant quality, validation and full canonical plan hash.

Beam calibration must use **aggregate per-order work**, not a conversion of the historical 1500 ms per-call budget, because that budget composes across many calls and does not bound total request time.

After Step 0:
1. define the actual adversarial timeout-sensitive cohort;
2. calibrate deterministic Beam/Master/OneBoard budgets using the recovered V19 implementations;
3. retain clock limits only as watchdog fuses;
4. freeze a deterministic reference and full-plan hashes;
5. only then begin architecture/facade refactoring.

The hot path (`elegir`, `llenar`, `empacarPlaca`, `mejorEncaje`, `armarPlacas`) remains untouched during the first architecture phase.

## FROZEN — lower-bound performance research
No new DFF / projection / clique / raster work is allowed for the latency roadmap unless a new correctness defect requires it.

## CLOSED — V21 generation experiments
Rejected before integration:
- V21a certified fast prepass: insufficient performance ceiling;
- V21b fixed 20-round/family candidate: correctness failure on `4058501` (9 boards vs legacy 8);
- geometric/repetition families: did not generate the late heterogeneous columns required by the critical holdout.

## PAUSED — V22 Pattern Master budget evidence
V22 evidence remains valid, but runtime work is paused until the V20 remnant regression and deterministic-budget prerequisite are resolved.

Stable cost finding:
- generation + monotype: 96.24% of historical Master wall time;
- coverage solver: 3.76%.

Rejected by evidence:
- hard gap cutoff;
- blind fixed-round cutoff;
- patience on board-count improvement;
- patience on currently selected/useful columns.

Mandatory Master sentinels:
- `4050594` => 7 boards;
- `4056900` => 6 boards;
- `4057401` => 4 boards;
- `4058501` => 8 boards;
- `4059200` => 17 boards.

Open diagnostic signal when V22 resumes: empirical pool saturation.

## Generated legacy rule

The current Next runtime under `src/lib/optimizer/**` is the source of truth.
Port recovered deterministic logic directly into that runtime as specified by
`determinism/DETERMINISM_RECOVERY_AND_STEP0_2026-09-07.md`.
The HTML and extractor are historical/comparison tools and must not overwrite
active runtime modules. This supersedes the former generated-legacy ownership rule.

New product/domain architecture must live outside `legacy/`.

## Governance rule
No optimizer runtime change is accepted unless:
1. its expected metric movement and gate are written before implementation;
2. board count never regresses;
3. equal-board remnant quality is not degraded relative to the accepted reference path without an explicit product decision;
4. mandatory sentinels preserve their board count;
5. benchmark cohorts are explicitly identified;
6. failed thresholds are not moved after observing results;
7. architecture-only refactors after deterministic freeze preserve the full canonical plan hash.
