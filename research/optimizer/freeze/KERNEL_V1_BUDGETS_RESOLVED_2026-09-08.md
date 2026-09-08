# Kernel V1 — deterministic budgets RESOLVED

Date: 2026-09-08
Kernel candidate: `4063963260abb10c8d68d0e553942899c925cc2f`

## Result

The finite candidate-budget equivalence gate is complete and PASS.

```text
baselineCases       56
completedPassCases  56
failures              0
promotionReady      true
```

All 56 candidate-budget reruns satisfied:

- industrial/geometric validation OK;
- historical terminal-dimension demand multiset exact;
- board count exactly equal to the budgets-OFF baseline for the same physical file;
- Beam/Master/OneBoard watchdog hits = 0.

## Promoted production values

```text
OPTIMIZER_MAX_BEAM_EXPANSIONS   = 1,024
OPTIMIZER_BEAM_WATCHDOG_MS      = 5,000
OPTIMIZER_MAX_MASTER_NODES      = 1,600,000
OPTIMIZER_MASTER_WATCHDOG_MS    = 60,000
OPTIMIZER_MAX_RESCUE_ATTEMPTS   = 384
OPTIMIZER_RESCUE_WATCHDOG_MS    = 10,000
```

These values are promoted from `deterministicBudgets.candidateValues` to `deterministicBudgets.values`.

## Decisive cases

### Beam — `4052960__Guillermo_Morales4052960.xml`

```text
beam.calls           149
beam.expansionsMax  1,010
beam budget         1,024
beam.budgetHits         0
watchdogHits            0
boards              14 / 14 baseline
```

The deterministic expansion budget completed below the 1,024 ceiling and preserved the baseline board count. The historical time-driven Beam fallback was not observed in the budgeted rerun.

The 1,024 value is intentionally close to the largest observed Beam requirement. Formal correctness over all 8,168 feasible resto cases is the next gate. If an unseen case reaches the Beam budget and correctness/quality changes, only the Beam budget is revisited under the already-versioned failure policy.

### Master — `4059352`

```text
master.runs          1
master.nodesMax      1,600,000
master budget        1,600,000
master.budgetHits    1
watchdogHits         0
boards               29 / 29 baseline
```

This is the strongest deterministic-budget evidence in the finite gate: Master consumed the complete fixed node budget, the deterministic cutoff fired, no watchdog fired, and the final board count remained identical to the budgets-OFF baseline.

The Master node budget controls only `resolverCobertura`; it does not bound `generarPatrones`, whose dominant CPU cost remains a documented post-freeze performance concern.

### OneBoard

21 validation cases exercised complete `attemptsMax=384` enumeration with `budgetHits=0`; the known early-success case completed in 51 attempts. The budget therefore preserves the full current structural rescue search space rather than truncating it.

## Watchdogs

Across all 56 finite validation reruns:

```text
Beam watchdog hits      0
Master watchdog hits    0
OneBoard watchdog hits  0
```

Watchdogs remain safety fuses. A deterministic work-budget hit is allowed and is not equivalent to a watchdog hit; `4059352` demonstrates this distinction directly.

## Gate transition

Budget calibration is CLOSED.

```text
Traceability / correctness semantics .... CLOSED
Calibration observability ............... CLOSED
Runtime planning ........................ CLOSED
Deterministic budgets ................... RESOLVED
Formal correctness ...................... CURRENT GATE
Formal determinism repeat ............... NEXT
Kernel V1 FROZEN ........................ TARGET
```

Formal correctness uses the exact fixed resto cohort:

- 8,650 accepted physical identities;
- 482 `EXPECTED_INFEASIBLE` classifications;
- 8,168 feasible cases executed with the promoted production budgets;
- one fresh Node process per feasible case;
- zero watchdog hits required;
- full plan hash recorded for every successful feasible case to serve as the baseline for the subsequent formal determinism repeat.
