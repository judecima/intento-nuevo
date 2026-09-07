# Kernel V1 Freeze — Historical Correctness Contract Recovered

Date: 2026-09-07

Kernel candidate remains unchanged: `4063963260abb10c8d68d0e553942899c925cc2f`.

## Decision

Roadmap item **5d.2 is recovered from historical benchmark data**. Board-count comparison against Lepton is **not** the historical correctness acceptance predicate.

The authoritative evidence is `benchmark_project_v10.csv`. The recovery gate is `scripts/kernel-freeze/recover-correctness-contract.mjs`, which produces `KERNEL_V1_CORRECTNESS_CONTRACT.json`.

```text
                    delta<0   delta=0   delta>0    na
OK                       61      1386        10     0
ERROR                     3        30         0    60
SKIP                      0         0         0   450
```

The 10 `OK` rows with `delta>0` and 33 `ERROR` rows with `delta<=0` prove that `delta/reference_panels` is a quality comparison, not the acceptance gate.

Historical non-OK semantics:

- 33 `ERROR`: `multiset piezas` — exact demand not covered;
- 60 `ERROR`: demanded piece cannot fit usable board — expected infeasible input;
- 449 `SKIP`: unsupported root for the historical project-only benchmark;
- 1 `SKIP`: mixed board dimensions.

Recovered predicate: `HISTORICAL_VALIDITY_V1`.

For a feasible input, correctness means a fresh geometrically/industrially valid plan covering the **exact demanded piece multiset**. Physical infeasibility is classified separately and is not a kernel regression.

The 60 infeasible rows above belong only to the historical 2,000-case benchmark. They are not asserted to be the full-corpus count.

## Calibration input correction

`experiencia/canonical_cases.json` is a provenance projection, not a runtime `CanonicalOptimizationCase`. It must not be passed directly to `benchmarkInputFromCanonicalCase` for the long run.

The new calibration runner is `scripts/kernel-freeze/kernel-budget-calibration-v2.mjs`. It requires the extracted physical `resto` directory and, before optimizing anything, verifies:

1. 8,669 unique physical XML identities;
2. exact archive identity equality;
3. the exact 19 current-parser rejection identities/codes;
4. exactly 8,650 accepted identities with SHA-256 `36d005421ae79b01867e0bba377c1bf526801bcd4dcfa2b0180e12cf354458f3`;
5. the exact expected-infeasible subset from usable-board geometry and rotation constraints.

It writes `corpus-preflight.json` and `expected-infeasible.json`, then calibrates only feasible cases with budgets OFF, Step 0 telemetry ON, fresh processes and per-case JSONL checkpoints.

It also verifies the demanded multiset independently; total placement count alone is not accepted as proof of exact demand.

Budget selection must use aggregate per-order work distributions. The historical Beam `presupuestoBeamMs=1500` is per invocation and is not converted directly to an expansion count.

No aggregate request stop condition is added inside this freeze; doing so changes search semantics and requires a new Kernel V1 candidate.

```text
5c   Historical traceability             COMPLETE
5d.2 Historical correctness predicate    RECOVERED — HISTORICAL_VALIDITY_V1
5d.1 Production budget calibration       NEXT
5d.3 Formal correctness                  PENDING
5d.4 Determinism repeat                  PENDING
5e   Kernel V1 FROZEN                    NOT YET
6    Worker isolation                    UNTOUCHED
```
