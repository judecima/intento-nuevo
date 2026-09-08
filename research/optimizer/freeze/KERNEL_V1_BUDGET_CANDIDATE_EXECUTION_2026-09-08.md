# Kernel V1 — executable budget candidate gate

Date: 2026-09-08
Candidate runtime: `4063963260abb10c8d68d0e553942899c925cc2f`

Runtime sampling is no longer a blocker. The current gate is the finite candidate-budget equivalence validation implemented in `scripts/kernel-freeze/kernel-budget-calibration-v4.mjs`.

## Candidate values

```text
OPTIMIZER_MAX_BEAM_EXPANSIONS   = 1024
OPTIMIZER_BEAM_WATCHDOG_MS      = 5000
OPTIMIZER_MAX_MASTER_NODES      = 1600000
OPTIMIZER_MASTER_WATCHDOG_MS    = 60000
OPTIMIZER_MAX_RESCUE_ATTEMPTS   = 384
OPTIMIZER_RESCUE_WATCHDOG_MS    = 10000
```

The values are read from `deterministicBudgets.candidateValues` in the formal policy. The runner removes inherited `OPTIMIZER_*` variables and explicitly injects these six values only in candidate-validation mode.

## One-time cache creation

Use the same output directory that already contains the budgets-OFF calibration checkpoint. The first invocation after the cache change performs the expensive physical preflight once and persists `preflight-state-cache-v4.json`.

```bash
node scripts/kernel-freeze/kernel-budget-calibration-v4.mjs \
  --historicalCorpus /tmp/parte1 \
  --corpus /tmp/resto \
  --validateCandidateBudgets \
  --maxNew 0
```

Expected preflight log on the first run:

```text
{"phase":"preflight-cache","status":"MISS"}
```

Subsequent invocations with unchanged physical corpora/binding use the content-addressed cache and should report:

```text
{"phase":"preflight-cache","status":"HIT",...}
```

The cache key hashes the physical XML contents plus the versioned execution-binding inputs. It is not a blind `--skip-preflight` flag.

## Finite foreground batches

Run in the foreground in small batches. The runner automatically selects only filenames already present as PASS in `calibration-v4.partial.jsonl`, orders them by budgets-OFF runtime ascending, and checkpoints candidate results separately.

```bash
node scripts/kernel-freeze/kernel-budget-calibration-v4.mjs \
  --historicalCorpus /tmp/parte1 \
  --corpus /tmp/resto \
  --validateCandidateBudgets \
  --maxNew 5
```

Repeat the same command until the candidate summary is complete. No random sampling, OneBoard discovery, or hotspot expansion is performed for this promotion gate.

Candidate checkpoint:

```text
test-results/kernel-v1-formal-certification/budget-candidate-v1.partial.jsonl
```

Candidate summary:

```text
test-results/kernel-v1-formal-certification/budget-candidate-v1.summary.json
```

## Acceptance

Every budgets-OFF baseline case must satisfy all of:

- optimizer output valid;
- historical terminal-dimension multiset exact;
- exact same `boardCount` as the budgets-OFF row for the same physical filename;
- Beam watchdog hits = 0;
- Master watchdog hits = 0;
- OneBoard watchdog hits = 0;
- Beam fallback accepted only under the existing controlled-no-complete-plan rule.

The summary reaches:

```text
status = PASS
promotionReady = true
```

only when all baseline checkpoint cases have passed.

The runner aborts on the first candidate-equivalence failure after checkpointing it. That failure is not a reason to restart calibration. Inspect its telemetry, change only the implicated path's candidate budget/watchdog, and re-run failed/same-path cases.

## Promotion

When `promotionReady=true`:

1. copy `candidateValues` into `deterministicBudgets.values`;
2. set deterministic budget status to `RESOLVED`;
3. version the candidate-validation summary;
4. start formal correctness;
5. run formal determinism repeat;
6. freeze Kernel V1 if both formal gates pass with zero watchdog hits.

This is the current finite milestone. No further runtime-estimation milestone precedes it.
