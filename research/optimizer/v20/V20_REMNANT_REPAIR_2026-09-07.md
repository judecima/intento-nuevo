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

B — exact global dead-strip compactation reference that V20 skips, gated by the same activation conditions as legacy V10. This is the quality target.

C — per-board remnant defragmentation.

MultiSlice, OneBoard and Pattern Master are intentionally excluded from this experiment because the measured quality regression is the equal-board compactation improvement.

## Frozen validity gate

Before judging C, the evaluator must reproduce the measured reference cohort:
- certified = 89;
- compactation activations = 52;
- accepted reference remnant improvements = 20.

If those values do not match, the run is INCONCLUSIVE; do not tune the repair against it.

## Frozen quality gate

C passes only if:
- board regressions = 0;
- invalid final plans = 0;
- every one of the 20 accepted B improvements is matched or beaten by C according to the existing `compararCalidad(calidadRestos)` ordering.

Partial recovery is not sufficient. Objective #2 is not a statistical preference.

Only after the quality gate passes do we evaluate whether C is materially cheaper than B and whether the net V20 end-to-end latency benefit remains worthwhile.

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

Possible verdicts:
- exit 2 / INCONCLUSIVE: A/B reference does not reproduce 89/52/20;
- exit 1 / FAIL: at least one board, validation or remnant regression remains;
- exit 0 / QUALITY PASS: remnant parity is restored; proceed to end-to-end timing before runtime integration.

## Runtime status

No `v10.cjs` wiring is authorized yet. V20 canary remains blocked until this experiment passes quality and subsequent net-performance measurement.
