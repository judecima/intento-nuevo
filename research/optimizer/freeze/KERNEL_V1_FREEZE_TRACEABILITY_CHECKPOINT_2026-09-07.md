# Kernel V1 Freeze — Traceability Complete / Formal Policy Checkpoint

Date: 2026-09-07

## Decision

Do **not** declare `Kernel V1 FROZEN` yet.

Historical traceability is complete. The remaining blockers are no longer corpus archaeology: they are two formal certification contracts that must not be invented for convenience.

Kernel candidate remains unchanged:

`4063963260abb10c8d68d0e553942899c925cc2f`

## Traceability complete

- 5 historical sentinels: recovered.
- 213 historical hotspots: recovered.
- historical `fullPlanHash` semantics: recovered.
- physical `resto.zip`: 8,669 XML / 8,669 unique names.
- exact current-comparable correctness cohort: 8,650 records / 8,650 XML identities.
- correctness cohort identity-set SHA-256:

`36d005421ae79b01867e0bba377c1bf526801bcd4dcfa2b0180e12cf354458f3`

No parser relaxation is used. The 13 `mixed-board-formats` XML are excluded because a canonical optimization case supports one board format. The six malformed XML never entered the embedded canonical corpus.

## Parse-error history reconciled

The earlier source-of-truth inventory recorded:

- `project`: 7,320
- `Order`: 1,346
- parse errors: 3

That inventory is retained as historical evidence, but it is **not** the authoritative canonical classification.

The later `Auditoria XML Etapa 1B 2026-09-02` in the same source-of-truth already records the corrected canonical audit:

- XML total: 8,669
- root `project`: 7,323
- root `Order`: 1,346
- parse OK / canonical candidates before mixed-stock exclusion accounting: 8,650
- parse errors: 6
- mixed-board exclusions: 13
- canonical cases: 8,650
  - project: 7,305
  - Order: 1,345

Parse-error breakdown:

- `text-outside-root`: 2
- `invalid-attributes`: 2
- `unquoted-attribute`: 1
- `unexpected-closing-tag`: 1

Therefore the previously noted `3 vs 6` discrepancy is not an unresolved missing-file problem. It is an older inventory superseded, for canonical classification, by the later Etapa 1B audit.

## Why 8,650 is not a chosen threshold

Two independent derivations converge:

```text
physical archive -> current parser
8,669 - 19 rejected = 8,650

embedded resto -> audited mixed-board exclusion
8,663 distinct identities - 13 mixed-board identities = 8,650
```

The six malformed XML are exactly the archive identities absent from embedded `resto`; all 13 mixed-board identities resolve uniquely inside embedded `resto`.

This is evidence, not a fitted gate.

## Formal certification policy — BLOCKED, explicitly

The previous aggregate status `READY_FOR_FORMAL_CERTIFICATION` was too strong. Traceability is ready; **formal execution policy is not**.

### Blocker A — production deterministic budgets are not calibrated/versioned

The Kernel V1 Candidate explicitly states that deterministic work budgets and their watchdogs are optional and OFF by default. With no deterministic work budget, historical wall-clock behavior is intentionally preserved for calibration.

Formal freeze requires:

`same input + seed + deterministic budget => same fullPlanHash`

and:

`watchdog hits = 0 under calibrated production budgets`

No authoritative numeric production values were recovered for:

- `OPTIMIZER_MAX_BEAM_EXPANSIONS`
- `OPTIMIZER_BEAM_WATCHDOG_MS`
- `OPTIMIZER_MAX_MASTER_NODES`
- `OPTIMIZER_MASTER_WATCHDOG_MS`
- `OPTIMIZER_MAX_RESCUE_ATTEMPTS`
- `OPTIMIZER_RESCUE_WATCHDOG_MS`

Smoke-test values are not production calibration and CI-convenience values are not acceptable substitutes.

### Blocker B — exact formal correctness predicate is not yet proven/versioned

The historical HTML benchmark classifies board deltas versus Lepton as better/equal/worse, and the frozen roadmap requires minimizing boards, never adding boards for remnant quality, and preserving validity/quality.

However, the source-of-truth also says the versioned Node benchmark still lacked the ported Lepton reference-board comparison. Therefore a rule such as:

`boards <= reference_panels`

is plausible, but is **not** silently promoted to the formal freeze contract.

The policy file keeps the predicate unresolved until its provenance is recovered or an explicit project decision is versioned.

## Reproducible policy + harness

Policy:

`research/optimizer/freeze/KERNEL_V1_FORMAL_CERTIFICATION_POLICY.json`

Harness:

`scripts/kernel-freeze/formal-certification.mjs`

The harness has four modes:

```text
preflight
calibrate
correctness
determinism
```

### `preflight`

Re-derives the exact 8,650 cohort from the embedded corpus + audited exclusions, checks its frozen SHA-256, verifies `src/lib/optimizer/**` is unchanged from the Kernel V1 candidate, and reports policy readiness.

It succeeds as a traceability checkpoint while reporting `TRACEABILITY_COMPLETE_FORMAL_POLICY_BLOCKED`; `--require-ready` turns unresolved policy into a hard failure.

### `calibrate`

Allowed while formal policy is blocked. It:

- forces deterministic budgets OFF;
- enables Step 0 telemetry;
- disables staged/experimental optimizer flags;
- runs each case in a fresh process;
- checkpoints one JSONL row immediately after every case;
- supports `--maxNew N` for resumable batches;
- starts with a cheap-to-expensive proxy;
- pushes the known extreme-tail orders (`4048571`, `4056720`, `4056676`, `4059795`) to the end;
- records Beam/Master/OneBoard work telemetry for production-budget calibration.

### `correctness`

Refuses to start until both deterministic budgets and the formal correctness predicate are resolved in policy. It uses the calibrated budgets, zero experimental flags, fresh processes and per-case checkpoints. Zero watchdog hits is mandatory.

### `determinism`

Requires a complete green correctness pass. It re-runs the exact same 8,650 inputs in fresh processes, ordered by measured correctness-pass wall time, and requires exact equality of the recovered `fullPlanHash` case by case.

Partial progress reports both:

- case coverage;
- time-mass coverage, using the completed correctness pass as the denominator for the determinism repeat.

## Stable state reached

```text
Kernel V1 Candidate
    4063963260abb10c8d68d0e553942899c925cc2f
        |
        +-- Freeze traceability
        |   +-- 5 sentinels ............ RECOVERED
        |   +-- 213 hotspots ........... RECOVERED
        |   +-- fullPlanHash ........... RECOVERED
        |   +-- archive ................ 8,669 / 8,669
        |   +-- correctness cohort ..... 8,650 / 8,650 exact
        |
        +-- Formal certification policy
            +-- resumable harness ...... PREPARED
            +-- production budgets ..... BLOCKED / UNCALIBRATED
            +-- correctness predicate .. BLOCKED / UNRESOLVED

        => TRACEABILITY COMPLETE
        => FORMAL CERTIFICATION HARNESS PREPARED
        => FORMAL POLICY BLOCKED
        => NOT Kernel V1 FROZEN
```

No Worker work is authorized by this checkpoint. No optimizer heuristic, parser policy, scoring rule, search behavior or runtime default is changed.

## Next gate

1. Run resumable Step 0 calibration on production-representative hardware with deterministic budgets OFF.
2. Version calibrated Beam/Master/OneBoard work budgets and emergency watchdogs.
3. Recover or explicitly version the formal correctness predicate.
4. Run the exact 8,650-case correctness pass.
5. Run the exact 8,650-case determinism repeat and require identical `fullPlanHash` plus zero watchdog hits.
6. Only then promote to `Kernel V1 FROZEN`.
