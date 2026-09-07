# V20 remnant repair — frozen experiment

Date: 2026-09-07
Branch: `optimizer-v20-remnant-defrag`

## Why this exists

The current V20 fast return correctly preserves the primary objective (minimum board count), but it returns before global dead-strip compactation can improve remnant quality at the same board count.

Frozen product objective:
1. minimum board count;
2. at equal boards, better commercial/industrial remnant;
3. never add boards for remnant;
4. only then reduce compute time;
5. zero regressions.

Current measured certified sample:
- certified cases: 89;
- skipped compactation activations: 52;
- compactation board gains: 0;
- accepted equal-board remnant improvements: 20.

Therefore current V20 is not release-safe even though its board-count certificate and latency benefit are real.

## Repair hypothesis

Once board count is certified, board membership can be frozen. Re-pack each existing physical board independently, using only the pieces already assigned to it. A replacement board is accepted only if:
- the local candidate still fits in exactly one board;
- its `calidadRestos` is strictly better;
- the entire reconstructed plan passes the industrial validator.

Pieces are never moved between boards, so the experiment cannot trade one board against another to improve remnant.

Order-level structural deltas are retained as read-only geometric guidance so the local repack does not lose the signal used by global compactation.

## A/B/C definition

A — current V20 certified baseline.

B — exact global dead-strip compactation reference that V20 skips, gated by the same activation conditions as legacy V10.

C — per-board remnant defragmentation.

MultiSlice, OneBoard and Pattern Master are intentionally excluded from this experiment because the measured quality regression is the equal-board compactation improvement.

## Frozen validity gate

Before judging C, the evaluator must reproduce the measured reference cohort:
- certified = 89;
- compactation activations = 52;
- accepted reference remnant improvements = 20.

If those values do not match, the run is INCONCLUSIVE; do not tune the repair against it.

## Two different questions — do not conflate them

### 1. Safety of the repair relative to V20 today — mandatory

C must satisfy:
- board regressions = 0;
- invalid final plans = 0;
- C is never worse than A according to the existing remnant comparator.

If any of these fail, the per-board repair itself is unsafe and the experiment is closed.

### 2. Recovery of quality lost versus legacy compactation — measured, not used as an early-stop gate

B and C explore different search spaces. Global compactation may improve remnant by moving pieces between boards; C deliberately freezes board membership. Therefore 20/20 recovery may be structurally unreachable for this technique.

The experiment must report, not hide:
- how many of the 20 B improvements C matches or beats;
- which files remain below B;
- the exact quality deltas for every miss;
- the cost ratio C/B.

Partial recovery is not grounds to call the technique itself unsafe. For example, 17/20 with 0 board/validation/A regressions is a valid experimental result that must be inspected case by case rather than discarded by a post-hoc threshold.

However, release equivalence is a separate claim: if C misses any accepted B improvement, V20 + C is still not bit-for-bit/quality-equivalent to the legacy objective-#2 path. Shipping that state would require an explicit product decision or an additional polish mechanism for the remaining cases.

No recovery threshold will be moved after observing the run. `--minRecovered` may be supplied only if a floor is declared before the run; otherwise recovery remains descriptive.

## Commands

```powershell
git checkout optimizer-v20-remnant-defrag
git pull

node scripts/experience-benchmark.mjs report --rebuild

node scripts/v20-remnant-defrag-eval.mjs `
  --v20 <ACTUAL_V20_CHECKPOINT_JSONL> `
  --corpus "D:\proyectos asistidos\lepton\data\lepton-xml" `
  --out experiencia/v20-remnant-defrag-eval.json

node scripts/v20-remnant-defrag-check.mjs `
  --result experiencia/v20-remnant-defrag-eval.json `
  --expectCertified 89 `
  --expectActivations 52 `
  --expectRef 20
```

Optional strict release-equivalence check:

```powershell
node scripts/v20-remnant-defrag-check.mjs `
  --result experiencia/v20-remnant-defrag-eval.json `
  --expectCertified 89 `
  --expectActivations 52 `
  --expectRef 20 `
  --requireLegacyParity 1
```

Possible outcomes:
- exit 2 / INCONCLUSIVE: A/B reference does not reproduce 89/52/20;
- exit 1 / SAFETY FAIL: board, validation, or current-V20 remnant quality regresses;
- exit 3 / RECOVERY BELOW PREDECLARED FLOOR: only when `--minRecovered` was declared before the run;
- exit 4 / NOT LEGACY-EQUIVALENT: safety passed, but strict parity was explicitly required and at least one B improvement is missed;
- exit 0 / SAFETY PASS: C does not make V20 worse; the report states separately whether legacy remnant parity is complete or partial.

## Runtime status

No `v10.cjs` wiring is authorized yet. V20 canary remains blocked until:
1. the safety experiment is valid;
2. the remaining B-vs-C misses, if any, are explicitly resolved or accepted as a product trade-off;
3. net end-to-end performance is measured.
