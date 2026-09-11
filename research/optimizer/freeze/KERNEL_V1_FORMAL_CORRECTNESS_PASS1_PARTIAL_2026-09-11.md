# Kernel V1 — Formal Correctness PASS #1 partial checkpoint

Date: 2026-09-11

Status: **RUNNING / NOT FROZEN**

Kernel candidate under certification:

```text
4063963260abb10c8d68d0e553942899c925cc2f
```

Execution binding:

```text
physical-xml-historical-validity-v1
```

Correctness predicate:

```text
HISTORICAL_VALIDITY_V1
```

## Corpus accounting

The physical/canonical reconciliation remains unchanged:

```text
8,669 physical XML
   -19 parser exclusions
------
8,650 formally accepted cases
  -482 EXPECTED_INFEASIBLE (preflight classification; not sent to optimizeProject)
------
8,168 feasible optimizeProject executions
```

Accepted identity-set SHA-256:

```text
36d005421ae79b01867e0bba377c1bf526801bcd4dcfa2b0180e12cf354458f3
```

## PASS #1 progress represented by this checkpoint

Validated from the supplied formal-correctness artefacts:

```text
feasibleCompletedPass      3,725 / 8,168   45.6048%
expectedInfeasibleCases      482 /   482  100.0000%
classifiedAcceptedCases    4,207 / 8,650   48.6358%

failures                       0
fullPlanHashesRecorded      3,725
null fullPlanHash               0
watchdog hits                   0
```

The `3,725` feasible records are `3,725` distinct physical XML identities. There is no overlap between those identities and the `482` EXPECTED_INFEASIBLE identities.

Every feasible row checked in `formal-correctness-v1.partial.jsonl` satisfies:

```text
ok = true
validationOk = true
demandMultisetOk = true
fullPlanHash != null
zeroWatchdogHits = true
missingTraces = empty
unaccepted Beam fallback = false
```

## Deterministic production budgets in force

```text
OPTIMIZER_MAX_BEAM_EXPANSIONS=1024
OPTIMIZER_BEAM_WATCHDOG_MS=5000
OPTIMIZER_MAX_MASTER_NODES=1600000
OPTIMIZER_MASTER_WATCHDOG_MS=60000
OPTIMIZER_MAX_RESCUE_ATTEMPTS=384
OPTIMIZER_RESCUE_WATCHDOG_MS=10000
```

Formal PASS #1 observations at this checkpoint:

```text
Beam budget-hit cases       0
Master budget-hit cases     5
OneBoard budget-hit cases   0
Beam watchdog hits          0
Master watchdog hits        0
OneBoard watchdog hits      0
```

The five Master budget hits are compatible with the versioned policy: Master has an intentional deterministic ceiling of `1,600,000` nodes; formal certification requires valid output under the production budgets and zero watchdog hits. A budget hit is therefore not itself a correctness failure.

Observed Master-budget-hit identities:

```text
4061107__FANY_PUENTE4061107.xml
4060603__JACOB_LIMON4060603.xml
4049317__ALEJANDRA_RUIZ4049317.xml
4057842__Cristian_Quinteros4057842.xml
4059352__victor_moneta4059352.xml
```

All five have valid historical-demand output and a non-null `fullPlanHash` in the checkpoint.

## Runtime evidence (informational, not a correctness predicate)

For the 3,725 completed feasible rows:

```text
wallMs mean   ~886.8 ms
wallMs p50    ~384.7 ms
wallMs p90   ~1,124.7 ms
wallMs p95   ~2,766.3 ms
wallMs p99   ~8,085.3 ms
wallMs max  135,818.5 ms
```

The slowest row in this checkpoint is `4059352__victor_moneta4059352.xml`, which reaches the Master work budget but does not hit the Master watchdog.

## Artefact integrity

Supplied bundle:

```text
kernel-v1-artefactos.tar.gz
SHA-256 198efe4a3f2173374f4b975924cebe42c59d86f94b513739f7596fd9f6464b94
```

Principal evidence files:

```text
formal-correctness-v1.partial.jsonl
27ad3801533e6ae9de124e186c2c07c1defc5956c122aefff3b057df5bf97c3a

formal-correctness-v1.summary.json
3b6eb0a09222fa583cc5a4f243af4e3e4de9eace2859dfc8057b98be6d232bb7

formal-correctness-v1.expected-infeasible.json
ec9dba516931fb5bc676596c1a3184c018947914fcaf7a77f5877e44ab524d73

corpus-preflight-v3.json
5cccdd81d776c04471493a279650ee226693e498da8830b3ad909b89cb96d84f

budget-candidate-v1.summary.json
a4d645f70657de5af399d7e4ccc254e4a478eeb337f3ed85876a9f14e66cfa4c
```

The supplied summary reports `runtimeMatchesCandidate=true` and status `RUNNING`.

## Freeze boundary

This checkpoint does **not** declare Kernel V1 frozen.

No search heuristic, scoring rule, Worker path, parser behavior, correctness predicate, execution binding, deterministic budget, or Kernel V1 semantic is changed here.

Remaining formal sequence:

```text
complete PASS #1: 8,168 / 8,168 feasible
        ↓
failures=0, hashes non-null, watchdogHits=0
        ↓
run determinism-repeat over the fixed feasible cohort
        ↓
compare fullPlanHash against PASS #1
        ↓
fullPlanHash mismatches=0
        ↓
final freeze report / immutable frozen ref
```

Until those gates complete, status remains **Kernel V1 Candidate under formal certification**.
