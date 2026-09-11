# Kernel V1 — Formal Correctness 50% Gate

Date: 2026-09-11

Status: **RUNNING / NOT FROZEN**

Kernel candidate under certification:

```text
4063963260abb10c8d68d0e553942899c925cc2f
```

Execution binding: `physical-xml-historical-validity-v1`

Correctness predicate: `HISTORICAL_VALIDITY_V1`

## Stable milestone reached

The formal accepted cohort is now exactly half resolved:

```text
physical XML                    8,669
parser exclusions                  19
formal accepted                 8,650

EXPECTED_INFEASIBLE               482 / 482
feasible optimizeProject PASS   3,843 / 8,168
-------------------------------------------
formal resolved                 4,325 / 8,650 = 50.0000%

failures                            0
fullPlanHash recorded            3,843
null fullPlanHash                    0
watchdogHits                         0
```

This advances the previous versioned checkpoint from `3,725` to `3,843` feasible PASS cases: **+118 newly certified feasible identities**.

Production budgets remain unchanged:

```text
OPTIMIZER_MAX_BEAM_EXPANSIONS=1024
OPTIMIZER_BEAM_WATCHDOG_MS=5000
OPTIMIZER_MAX_MASTER_NODES=1600000
OPTIMIZER_MASTER_WATCHDOG_MS=60000
OPTIMIZER_MAX_RESCUE_ATTEMPTS=384
OPTIMIZER_RESCUE_WATCHDOG_MS=10000
```

Observed control totals at this checkpoint:

```text
Beam budgetHits        0
Master budgetHits      5
OneBoard budgetHits    0

Beam watchdogHits      0
Master watchdogHits    0
OneBoard watchdogHits  0
```

The five Master budget-hit cases are the same already documented cases. A deterministic Master budget hit is allowed by policy; a watchdog hit or invalid output is not.

## Physical-corpus binding revalidated

The supplied physical corpora were independently mounted and checked before continuation:

```text
parte-1 XML count                  2,000
parte-1 content SHA-256
7686cdd48a6e2489c9580cccb98f0abc9c9514b7e004d951116e6a784d37bc5d

resto XML count                    8,669
resto content SHA-256
01415944783d9ddd73b5a2fd37d33e60d438696990677fec9babd9fb5997c90b
```

All 19 versioned parser-rejection identities are present in the supplied `resto` corpus. Removing those literal filenames yields exactly 8,650 accepted identities and reproduces the versioned identity-set hash:

```text
36d005421ae79b01867e0bba377c1bf526801bcd4dcfa2b0180e12cf354458f3
```

The freshly regenerated preflight state reports:

```text
feasible                 8,168
expected infeasible        482
```

The historical `parte1` infeasible replay also reproduced the exact historical classifier gate:

```text
historical expected infeasible  60
detected                         60
exactSetMatch                  true
```

## Exact candidate transport / reproduction proof

Because the execution sandbox could not clone/install the repository directly, a temporary **unmerged** transport PR was used only to export executable evidence. CI first required:

```text
git diff --quiet 4063963260abb10c8d68d0e553942899c925cc2f -- src/lib/optimizer
```

and only after that check built the formal candidate bundle from the locked repository dependencies.

Transport evidence:

```text
source snapshot artifact digest
sha256:9852bad537ce436ba6bada01ad97382796c281b4583cc46d0b90ffd2fc1f12a1

formal candidate bundle artifact digest
sha256:52b43c942a46ab9fddc34e9016657c56f3a6951e9cc8b2c5963aef02ab5e5311

transport bundle workflow commit
4daedc55d34bb81039481674a9d82148fd005d14
```

The temporary PR `#20` was closed **without merge** after the artifacts were retrieved. It did not modify `src/lib/optimizer`, budgets, scoring, parser behavior, correctness semantics, or the freeze policy.

Before continuing PASS #1, an already-certified case was replayed using the exported exact bundle:

```text
4027904__PABLO_VILLASENIN4027904.xml

expected fullPlanHash
fb2c435d905d7946c061081d498e6c4f370e59a080011474021b33d37f4c2b25

replayed fullPlanHash
fb2c435d905d7946c061081d498e6c4f370e59a080011474021b33d37f4c2b25

match = true
validationOk = true
demandMultisetOk = true
watchdogHits = 0
```

The transport-local parent orchestration bypassed only repeated source transport/static-preflight work that had already been independently verified in this session. The formal child execution, optimizer bundle, production environment values, validity predicate, geometry/trace/quality hashing, Beam fallback acceptance, budget telemetry, and watchdog acceptance rules remained the versioned formal-correctness implementation.

## Evidence hashes at the 50% gate

```text
formal-correctness-v1.partial.jsonl
SHA-256 834d22ebea48528f67e44f74dea93e50aaad01c177ef597ac438f30ce9f88daf
size    7,598,873 bytes

formal-correctness-v1.summary.json
SHA-256 3619f844257984039a3c15d8053afbaeece17a7a128f1f47d511dd1f84a777e3

preflight-state-cache-v4.json
SHA-256 5176a455f19eac473d82b32d9c1d3f05899fa41737cc914d69b8b29485ee7195
```

## Freeze boundary

This checkpoint **does not** declare Kernel V1 frozen.

No Kernel V1 semantic change is introduced by this checkpoint.

Remaining formal sequence:

```text
complete feasible PASS #1: 8,168 / 8,168
        ↓
failures=0, fullPlanHash non-null, watchdogHits=0
        ↓
formal determinism repeat over fixed feasible cohort
        ↓
compare every repeated fullPlanHash with PASS #1
        ↓
fullPlanHash mismatches=0
        ↓
final freeze report
        ↓
immutable Kernel V1 FROZEN ref
```
