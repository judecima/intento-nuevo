# V22b — Evidence before progressive Pattern Master budget

Date: 2026-09-06
Branch: `optimizer-v22b-progressive-master-evidence`
Parent: V20 base `cf167bf85399cd90bda8c7eb8b5a050bdaa1a8f0`
Issue: #19

## Closed result: V22a FAIL

V22a (`run Master only when gap <= 1`) is rejected for correctness.

Mandatory holdout result:
- `4050594`: 7 boards, gap 1, Master runs — PASS.
- `4058501`: V22a ON => 9 boards, gap 2, Master skipped — FAIL.
- same binary with V22a OFF => 8 boards.

The threshold will not be moved to gap 2/3 after seeing this result.

## Stronger cross-cohort falsification of gap-only activation

Known 40-round Master wins outside the 213 hotspot include:
- `4056900`: pre-Master 7 -> 6, cota 6, gap 1;
- `4058501`: pre-Master 9 -> 8, cota 7, gap 2;
- `4059200`: pre-Master 18 -> 17, cota 13, gap 5.

Therefore there is no empirically supported hard maximum gap at which Pattern Master becomes unable to win. Gap remains diagnostic only; it is forbidden as a hard skip predictor for V22b.

## Historical 2,000-row evidence without rerunning optimizer

`experiencia/v7/all20.jsonl` contains four distinct 20-round Pattern Master wins:
- `4050594`;
- `4056900`;
- `4057401`;
- `4059200`.

`4058501` is deliberately absent from that win list because 20 rounds regress it to 9 boards; 40 rounds recover 8 boards.

Thus the currently known quality set spans five distinct cases. `4057401` remains a calibration candidate until a 40-round reproduction confirms its expected result.

Artifacts:
- mandatory manifest: `experiencia/master-quality-sentinels.json`;
- historical extractor: `scripts/v22b-extract-master-wins.mjs`;
- reusable quality gate: `scripts/master-sentinel-check.mjs`.

## Why V22b does not implement a stopping rule yet

The stable cost fact remains:
- pattern generation + monotype: 96.24% of historical Master wall time;
- coverage solver: 3.76%.

A generation budget is therefore the right component to study, but the safe stopping signal is not yet known.

Already falsified predictors:
- hard gap threshold — falsified by wins at gap 2 and gap 5;
- blind fixed 20-round cap — falsified by `4058501`;
- furniture/repetition families — did not produce any of the four late selected vectors required by `4058501`.

## Prefix diagnostic — fixed before measurement

Use `scripts/v22b-master-prefix-profile.mjs` with generation checkpoints:

`5,10,15,20,25,30,35,40`

For every case it records:
- pre-Master boards and cota;
- board result at each accumulated generation prefix;
- random pool size and newly-added columns;
- selected columns and their first-seen round;
- how many selected columns are new since the previous checkpoint;
- solver nodes/exhaustion/time;
- first checkpoint that improves the pre-Master incumbent;
- parity of the profiler's 40-round pool against the unchanged legacy `generarPatrones(...,40)` vector set.

This phase is diagnostic only. It must not change `v10.cjs`, `patrones.cjs`, the production flag set, round count, solver objective, or acceptance rules.

## Predeclared interpretation rules

1. **Profiler validity**
   - `parity40` must be true for every profiled case that includes checkpoint 40.
   - If parity fails, stop and fix the diagnostic; do not draw optimization conclusions.

2. **Simple board-count patience**
   - If any mandatory Master-win sentinel shows a long plateau in board count and later improves, a stopping rule based only on "N checkpoints without board improvement" is classified UNSAFE.
   - We will not choose N after seeing the longest plateau.

3. **Useful-column arrival signal**
   - If late improvements are consistently preceded by selected columns newly entering the accumulated pool, selected-column/pool progress may be investigated as a continuation signal.
   - This is evidence for a later candidate, not sufficient by itself to skip Master.

4. **No hard predictor from gap**
   - gap may be logged/correlated but cannot authorize skipping a case.

5. **Quality gate for every future candidate**
   - every mandatory sentinel must preserve its expected board count;
   - any single board regression closes the candidate immediately before the 213 benchmark.

## Commands

Extract all recorded 20-round Master wins (no optimizer execution):

```powershell
node scripts/v22b-extract-master-wins.mjs `
  --source experiencia/v7/all20.jsonl `
  --sentinels experiencia/master-quality-sentinels.json `
  --out experiencia/v22b-all20-master-wins.json
```

Profile mandatory sentinels plus the `4057401` calibration candidate:

```powershell
git checkout optimizer-v22b-progressive-master-evidence
git pull
node scripts/experience-benchmark.mjs report --rebuild

node scripts/v22b-master-prefix-profile.mjs `
  --corpus "D:\proyectos asistidos\lepton\data\lepton-xml" `
  --includeCandidates 1 `
  --out experiencia/v22b-master-prefix-profile.json
```

## Decision after this evidence

Only after the prefix curves are known do we decide whether a progressive generation budget is feasible.

Possible outcomes:
- `BOARD_PATIENCE_UNSAFE`: late wins occur after plateaus; do not implement simple no-board-improvement patience.
- `PROGRESS_SIGNAL_CANDIDATE`: a non-lossy observable signal exists before late wins and merits a separately gated runtime experiment.
- `NO_SAFE_CHEAP_SIGNAL`: no cheap observable signal separates wins from non-wins; stop heuristic budgeting and reconsider master-guided/dual-priced generation or asynchronous execution.

No threshold will be retrofitted to make a failed candidate pass.
