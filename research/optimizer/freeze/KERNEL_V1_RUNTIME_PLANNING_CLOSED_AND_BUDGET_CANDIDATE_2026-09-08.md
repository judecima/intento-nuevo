# Kernel V1 — runtime planning CLOSED / budget candidate

Date: 2026-09-08
Kernel candidate: `4063963260abb10c8d68d0e553942899c925cc2f`

## Decision

Runtime planning is CLOSED. Do not extend the random runtime sample to n=100 or n=200 as a prerequisite for Kernel V1 freeze.

The n=54 reproducible random sample plus post-stratification is sufficient to make a conservative execution-plan decision:

- fresh process per feasible case remains mandatory;
- measured fresh-process overhead is about 73 ms / 1.1%, so multi-case batching is rejected;
- the formal optimized denominator is 8,168 feasible cases per pass; 482 accepted resto identities are `EXPECTED_INFEASIBLE` and are classified without `optimizeProject`;
- runtime is heavy-tailed, so point estimates are planning context rather than a certification predicate;
- use **2 shards** as the initial formal execution baseline, with one fresh process per case and known extreme tails scheduled late;
- do not increase concurrency unless watchdog validation is repeated under the new declared concurrency.

The purpose of runtime sampling was to avoid launching an unknown multi-day job. That question is answered. Further runtime-estimation work does not block freeze.

## n=54 planning evidence

Uniform random sample:

- mean end-to-end process time: ~6,859 ms;
- p50: ~984 ms;
- p90: ~9,911 ms;
- p95: ~61,146 ms;
- max: ~90,063 ms;
- fresh-process overhead: ~73 ms mean (~1.1%).

Uniform bootstrap remained wide because the tail dominates the mean. Post-stratification produced a similar point estimate (~7,535 ms) and showed that almost all uncertainty is concentrated in high-piece-count strata, especially `3-4/high`, `5+/high`, and `1/high`. That explains the uncertainty but does not need to be reduced further before freeze.

## Preflight cache

`kernel-budget-calibration-v4.mjs` now persists `preflight-state-cache-v4.json` in the selected output directory.

The cache key is content-addressed from:

- physical resto XML contents;
- physical parte1 XML contents;
- Kernel candidate identity;
- execution-binding identity;
- resto audit artifact;
- correctness execution-semantics artifact;
- embedded canonical corpus;
- historical benchmark CSV.

On a matching cache hit, v4 reuses the exact historical replay result and prepared feasible/infeasible physical state instead of re-running the 2,000-file historical replay and re-parsing/classifying all 8,669 resto XML. The XML content hashes are still recomputed, which is intentionally much cheaper than semantic replay/parsing and prevents silent reuse after corpus mutation.

The first run after this change will create the cache; subsequent short batches in the same output directory should hit it.

## Budget candidate

The six production knobs now have a versioned **candidate** set. They are NOT yet promoted to `deterministicBudgets.values` and formal certification remains blocked until the finite validation gate passes.

```text
OPTIMIZER_MAX_BEAM_EXPANSIONS   = 1,024
OPTIMIZER_BEAM_WATCHDOG_MS      = 5,000
OPTIMIZER_MAX_MASTER_NODES      = 1,600,000
OPTIMIZER_MASTER_WATCHDOG_MS    = 60,000
OPTIMIZER_MAX_RESCUE_ATTEMPTS   = 384
OPTIMIZER_RESCUE_WATCHDOG_MS    = 10,000
```

### Beam rationale

48 activated calibration cases / 2,518 invocations were observed. Among the 47 cases with no Beam timeout, `expansionsMax` had p50=20, p90=32, max=1,016. The long-tail maximum rather than the median drives equivalence. `1,024` is the first fixed deterministic candidate; it must prove baseline board-count equivalence on the finite validation cohort.

### Master rationale

27 `resolverCobertura` invocations were observed: 22 uncensored runs (p50=1, p90=1, max=580) and five historical-time-censored explosive runs reaching up to 1,306,553 nodes at ~8 seconds. The distribution is bimodal. `1,600,000` is therefore an explicit reference-equivalence policy value above the observed censored work envelope, not a claim about natural search completion.

The Master node budget controls only `resolverCobertura`; it does not budget the dominant `generarPatrones` cost. That cost boundary remains outside Kernel V1 freeze.

### OneBoard rationale

22/22 activated runs reached `attemptsMax=384`, with p50=p90=max=384 and zero raw timeout hits. `384` is both the structural search-space ceiling and the empirically completed-run ceiling, so this work budget is effectively closed.

### Watchdog rationale

Watchdogs are safety fuses, not search budgets.

- Beam 5 s is comfortably above the observed ~1.8 s historical-timeout call envelope.
- Master 60 s allows the 1.6M-node deterministic budget even near the slowest observed historical censored throughput (~33k nodes/s).
- OneBoard 10 s is more than 4x the observed 2.366 s completed-run envelope.

## Finite promotion gate — no more calibration sampling

Budget calibration ends when this gate passes.

Re-run the cases already present in the authoritative calibration checkpoint with the candidate values enabled and compare each result with its budgets-OFF baseline.

Requirements for every re-run case:

1. `validationOk=true`;
2. historical terminal-dimension demand multiset exact;
3. `boardCount` exactly equal to the budgets-OFF baseline for that same file;
4. Beam/Master/OneBoard `watchdogHits=0`;
5. controlled Beam no-complete-plan fallback remains acceptable only under the already-versioned semantic fallback rule.

Failure policy:

- identify the path implicated by telemetry;
- change only that path's budget/watchdog;
- re-run the failed cases plus the same-path calibration cohort;
- do not restart random runtime sampling, OneBoard discovery, traceability archaeology, or correctness-semantics recovery.

Success action:

- copy `candidateValues` to `deterministicBudgets.values`;
- set deterministic budget status to `RESOLVED`;
- version the finite validation evidence;
- start formal correctness over the fixed 8,650 accepted resto cohort / 8,168 optimized feasible cases;
- then run the formal determinism repeat;
- if both pass with zero watchdog hits, mark `Kernel V1 FROZEN`;
- only after that start Worker isolation and post-freeze `generarPatrones` performance work.

## Roadmap after this checkpoint

```text
Traceability/correctness semantics ........ CLOSED
Calibration-path observability ............ CLOSED
Runtime planning .......................... CLOSED
Budget candidate .......................... DEFINED
Finite budget equivalence validation ...... CURRENT GATE
Formal correctness ........................ NEXT
Formal determinism repeat ................. NEXT
Kernel V1 FROZEN .......................... TARGET
Worker / generarPatrones performance ...... AFTER FREEZE ONLY
```

No additional runtime-sampling milestone is required before the current budget-equivalence gate.
