# Kernel V1 — Pattern Master cost boundary

Date: 2026-09-08
Kernel candidate: `4063963260abb10c8d68d0e553942899c925cc2f`

## Purpose

Record the measured scope boundary between Pattern Master pattern generation and the coverage solver during Kernel V1 calibration. This is a freeze/certification interpretation artifact only; it does not change `src/lib/optimizer/**`.

## 55-case calibration evidence

The 55-case v4 checkpoint produced three distinct deterministic-budget regimes:

- OneBoard: 22 activated cases / 22 invocations; `attemptsMax` p50=384, p90=384, max=384; 21 structurally complete single-run cases; raw timeout hits=0; `wallMsMax` p50=1813 ms, p90=2324 ms, max=2366 ms. `OPTIMIZER_MAX_RESCUE_ATTEMPTS=384` therefore has both structural and empirical exact-equivalence support.
- Beam: 48 activated cases / 2,518 invocations; 4 timeout hits (0.16% of invocations), all in one case. Among 47 cases without any Beam timeout, `expansionsMax` p50=20, p90=32, max=1,016. The normal distribution is small with a long extreme tail; censored and uncensored Beam evidence must remain separated.
- Master coverage solver: 27 invocations; 5 timeout hits (18.5%). Among 22 uncensored runs, `nodesMax` p50=1, p90=1, max=580. The remaining five runs are the explosive/censored regime, reaching hundreds of thousands to more than one million nodes under the historical 8-second solver ceiling.

## Latency attribution

The dedicated latency diagnostic on slow `areaLB=1` cases corrected an earlier attribution error. Example:

`4020442` — about 21.916 s total, 50 pieces, 2 boards:

- Pattern Master total stage: about 10.028 s (46%)
- MultiSlice: about 4.573 s (21%)
- residual V10: about 2.554 s (12%)
- OneBoard: about 2.535 s (12%)
- compactation: about 2.226 s (10%)

All four rescue stages reported zero board-count gain. Master was the dominant stage across the eight diagnosed slow cases.

The earlier statement that OneBoard itself consumed roughly 18–21 seconds was wrong. OneBoard's measured per-run envelope in the 55-case calibration is about 1.8–2.4 seconds. The symptom (roughly 20-second small orders) was real; the dominant cause was misattributed.

## Critical Master scope distinction

V10 starts `metricas.master.ms` immediately before pattern generation and stops it after generation + coverage solving + materialization. The sequence is:

1. `generarPatrones(lineas, config, config.rondasPatrones || 40)`
2. `patronesMonotipo(lineas, config)`
3. `resolverCobertura(...)`
4. `s.resolver(...)`
5. optional materialization/acceptance

By contrast, Step 0 `master.nodesTotal`, `master.nodesMax`, `master.wallMsTotal`, timeout/budget/watchdog counters are owned by `resolverCobertura` and describe the coverage solver scope, not the full Pattern Master stage.

The slow small-order evidence demonstrates the practical difference: a case can show approximately 10 seconds in `metricas.master.ms`, while the coverage solver performs one node and reports approximately zero solver wall time. In such a case almost all Master cost happened before the branch-and-bound solver, in pattern generation.

## Consequence for deterministic budgets

`OPTIMIZER_MAX_MASTER_NODES` is a real deterministic budget, but it controls only the coverage solver. It does **not** cap the dominant pattern-generation cost in cases where `generarPatrones` is expensive.

The current candidate has no `OPTIMIZER_MAX_PATTERN_*` production knob. Pattern generation executes a fixed configured number of rounds (40 in the V10 call when `rondasPatrones` is absent) plus monotype pattern generation. This is deterministic candidate behavior, but it is not separately budgeted by the Kernel V1 production knobs being calibrated.

Therefore Kernel V1 freeze must not claim that the six current deterministic budget/watchdog knobs bound total optimizer CPU or total Pattern Master latency. They stabilize the explicitly budgeted Beam / coverage-solver / OneBoard scopes. Pattern-generation latency remains an intentional known boundary of Candidate A.

Adding a work/time budget, pruning policy, caching policy, early stop, dominance filter, or any other structural change inside `generarPatrones` can change the generated pattern pool and therefore search semantics. That belongs after Kernel V1 freeze (Kernel V2/performance work) or requires promotion of a new Kernel V1 candidate and recertification.

## Post-freeze priority

Pattern generation returns to the top of the performance roadmap after Kernel V1 is frozen. The current evidence supports prioritizing:

- early/deduplicated pattern dominance,
- coverage-potential pruning before expensive materialization,
- structural caching where input/config identity allows it,
- better ordering/selection of the 40 subset rounds,
- explicit generation work accounting and, only in a new candidate, a deterministic pattern-generation budget,
- moving expensive rescue computation off the synchronous interactive path where product architecture permits it.

This performance work must remain separate from the current freeze so the runtime identity of candidate `406396...` stays intact.
