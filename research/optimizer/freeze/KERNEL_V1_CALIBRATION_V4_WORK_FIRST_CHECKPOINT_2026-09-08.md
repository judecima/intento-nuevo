# Kernel V1 calibration v4 — work-first checkpoint

Date: 2026-09-08
Kernel candidate: `4063963260abb10c8d68d0e553942899c925cc2f`

## Current status

Calibration v4 is the authoritative deterministic-work calibration harness. The physical historical replay remains exact 60/60 on `parte1`; the exact `resto` accepted cohort remains 8,650 identities under `physical-xml-historical-validity-v1`.

The physical `resto` classifier currently observes:

- feasible: 8,168
- expected-infeasible: 482
- infeasible rate: 5.57%

This is an observed property of `resto`, not an extrapolation from the historical `parte1` benchmark.

## Execution profile and historical clock ceilings

`benchmarkInputFromCanonicalCase(canonical, { strategy: "v10" })` runs the benchmark binding with profile `balanced`.

Historical wall-clock ceilings active in this calibration are therefore:

- Beam: 1,500 ms per Beam invocation
- coverage solver (`resolverCobertura`): 8,000 ms per run
- OneBoard: 20,000 ms per rescue run

Calibration itself keeps the new deterministic production budgets/watchdogs OFF; formal zero-watchdog evidence is collected only after production values are versioned and enabled.

## Budget scopes

The candidate production knobs are scoped per invocation/run:

- `OPTIMIZER_MAX_BEAM_EXPANSIONS` -> `beam.expansionsMax` per `armarPlacasBeam`
- `OPTIMIZER_BEAM_WATCHDOG_MS` -> `beam.wallMsMax` per Beam invocation
- `OPTIMIZER_MAX_MASTER_NODES` -> `master.nodesMax` per `resolverCobertura` run
- `OPTIMIZER_MASTER_WATCHDOG_MS` -> `master.wallMsMax` per coverage-solver run
- `OPTIMIZER_MAX_RESCUE_ATTEMPTS` -> `oneboard.attemptsMax` per `rescatarUnaPlaca`
- `OPTIMIZER_RESCUE_WATCHDOG_MS` -> `oneboard.wallMsMax` per rescue run

Aggregate request totals remain operational-load evidence. Candidate A has no aggregate request work budget.

A newly confirmed scope boundary is critical: `OPTIMIZER_MAX_MASTER_NODES` controls the coverage solver only. It does **not** budget the preceding `generarPatrones` / `patronesMonotipo` phase. See `KERNEL_V1_MASTER_PATTERN_GENERATION_BOUNDARY_2026-09-08.md`.

## Controlled Beam fallback semantics

The candidate intentionally degrades Beam to greedy when `armarPlacasBeam` cannot complete a plan. Calibration v4 now classifies this semantically:

- `CONTROLLED_NO_COMPLETE_BEAM_PLAN`: accepted only when the final output is valid, demand multiset is exact, and Beam work/terminal-control accounting is present
- `UNEXPECTED_BEAM_EXCEPTION`: fatal

No arbitrary expansion threshold is used to decide legitimacy.

`4052960__Guillermo_Morales4052960.xml` established this distinction with a valid 114/114-piece final plan after 149 Beam calls and 89,104 aggregate Beam expansions. Its Beam population includes a timeout under the balanced 1,500 ms ceiling, so the row contributes censored Beam evidence rather than an uncensored completion requirement.

## OneBoard discovery and 55-case evidence

The 213 historical hotspot rows contain zero OneBoard activations, so OneBoard evidence is sourced directly from physical `resto` using static `areaLB == 1` as a cheap candidate filter.

Static physical scan:

- feasible cases: 8,168
- `areaLB == 1`: 3,266
- `referencePanels > 1`: 234
- bounded early scan: 48

At 55 successful calibration cases, OneBoard evidence is:

- activated cases: 22
- invocations: 22
- structurally complete single-run cases: 21
- `attemptsMax`: n=22, p50=384, p90=384, max=384
- `wallMsMax`: n=22, p50=1,813 ms, p90=2,324 ms, max=2,366 ms
- raw timeout hits: 0
- censoring status: `NO_RIGHT_CENSORING_OBSERVED`

The finite OneBoard search space is exactly:

`6 seeds x 4 c1 x 4 c2 x 2 initial directions x 2 multi modes = 384`

Therefore `OPTIMIZER_MAX_RESCUE_ATTEMPTS = 384` has both structural and empirical exact-equivalence support. The associated watchdog remains to be chosen above the completed-search wall-time envelope so it acts as a safety fuse rather than a second search budget.

### Correction of prior latency attribution

An earlier checkpoint interpretation incorrectly attributed roughly 18–21 seconds of some small orders to OneBoard. The 55-case evidence disproves that: OneBoard itself is roughly 1.8–2.4 seconds in the observed complete runs.

The ~20-second small-order symptom was real; its dominant cause was elsewhere.

## Beam — 55-case distribution

At 55 successful cases:

- activated cases: 48
- invocations: 2,518
- timeout hits: 4 (about 0.16% of invocations)
- cases with any Beam timeout: 1
- uncensored cases: 47
- uncensored `expansionsMax`: p50=20, p90=32, max=1,016

Beam therefore has a small normal regime with a long extreme tail. Censored and uncensored observations must remain separated. A final production expansion budget must protect relevant tail behavior rather than being chosen from the p50/p90 alone.

## Master — two different scopes and two solver regimes

Coverage-solver telemetry at 55 successful cases:

- invocations: 27
- timeout hits: 5 (18.5%)
- uncensored runs: 22
- uncensored `nodesMax`: p50=1, p90=1, max=580
- censored runs: 5, reaching hundreds of thousands to >1 million nodes under the historical 8-second solver ceiling

The coverage solver is therefore strongly bimodal: most uncensored runs terminate almost immediately, while a small regime explodes and is wall-clock censored. A single percentile over the mixed population is not meaningful for `OPTIMIZER_MAX_MASTER_NODES`; the explosive regime requires the documented historical-equivalence/reference-machine policy plus formal validation.

More importantly, the latency diagnostic shows that the **full Pattern Master stage** can still take around 10 seconds when solver telemetry reports only one node and approximately zero solver wall time. This is not a contradiction: `metricas.master.ms` includes pattern generation, coverage solving, and materialization, whereas Step 0 `master.nodes*` / `master.wallMs*` are coverage-solver telemetry only.

## Small-order latency attribution

The dedicated latency diagnostic decomposed the slow `areaLB=1` orders. Representative case:

`4020442` — about 21.916 s total, 50 pieces, 2 boards:

- Pattern Master total stage: about 10.028 s (46%)
- MultiSlice: about 4.573 s (21%)
- residual V10: about 2.554 s (12%)
- OneBoard: about 2.535 s (12%)
- compactation: about 2.226 s (10%)

Board-count gains in that run:

- OneBoard: 0
- Master: 0
- MultiSlice: 0
- compactation: 0

Master was the dominant stage across the eight diagnosed slow cases.

Inside V10, Pattern Master performs:

1. `generarPatrones(lineas, config, config.rondasPatrones || 40)`
2. `patronesMonotipo(lineas, config)`
3. `resolverCobertura(...)`
4. branch-and-bound solve
5. optional materialization/acceptance

The 55-case latency evidence therefore re-confirms the historical performance finding: expensive pattern generation can dominate Pattern Master even when the coverage solver itself is trivial.

## Freeze boundary

The six deterministic budget/watchdog knobs being calibrated are legitimate and useful, but Kernel V1 must not claim that they bound total optimizer CPU or total Pattern Master latency.

Pattern generation has no separate production work-budget knob in Candidate A. It runs the candidate's fixed pattern-generation policy (40 rounds by default in the V10 Master call plus monotype generation). Adding early stop, a generation-work counter/budget, dominance pruning, caching, fewer/different rounds, or any other pattern-pool change can alter search semantics.

Therefore this freeze intentionally leaves pattern generation unchanged. That work belongs after `Kernel V1 FROZEN` (performance/Kernel V2) or requires a new Kernel V1 candidate plus recertification.

This is the explicit tradeoff of the freeze: **deterministic/auditable bounded scopes now, dominant pattern-generation performance cost intentionally preserved.**

## Current budget evidence status

- `OPTIMIZER_MAX_RESCUE_ATTEMPTS`: 384 — strong structural + empirical candidate, practically closed pending promotion with watchdogs/formal gates
- `OPTIMIZER_RESCUE_WATCHDOG_MS`: pending; completed OneBoard envelope currently max ~2,366 ms
- `OPTIMIZER_MAX_BEAM_EXPANSIONS`: pending; uncensored p50=20, p90=32, max=1,016 with a rare censored tail
- `OPTIMIZER_BEAM_WATCHDOG_MS`: pending
- `OPTIMIZER_MAX_MASTER_NODES`: pending; use historical-equivalence policy for the explosive solver regime, not a mixed percentile
- `OPTIMIZER_MASTER_WATCHDOG_MS`: pending
- Pattern-generation work budget: **not present in Candidate A and not added during this freeze**

## Gate state

- Historical infeasible replay: exact 60/60
- Historical correctness predicate/execution semantics: recovered
- Exact accepted `resto` cohort: 8,650
- Physical `resto`: 8,168 feasible / 482 expected-infeasible
- Step 0 deterministic-work telemetry: demonstrated
- Controlled Beam fallback policy: resolved
- OneBoard attempt budget evidence: strong / 384
- Beam budget evidence: substantial, tail still under evaluation
- Master solver budget policy: conceptually resolved, production value still pending
- Pattern-generation cost boundary: explicitly documented and intentionally out of freeze scope
- Production deterministic budgets/watchdogs: not yet fully versioned
- Formal correctness: not started
- Formal determinism repeat: not started
- Kernel V1 frozen: no
- Worker isolation: blocked until freeze
