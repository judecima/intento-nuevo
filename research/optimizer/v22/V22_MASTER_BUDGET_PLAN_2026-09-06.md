# V22 — Adaptive Pattern Master budget

Date: 2026-09-06
Branch: `optimizer-v22-master-budget-audit`
Issue: #19

## Why V21d is closed

The frozen hard cohort cannot satisfy the V21d sample gate:
- 214 rows in `diag-files.txt` / 213 non-cache hotspot cases;
- Pattern Master activates 129 times;
- accepted Master board wins: 1 (`4050594`);
- `4058501`, the V21c gold diagnostic case, is not part of that scan.

The >=5 Master-win structural sample is therefore impossible on this cohort. V21d is closed as statistically infeasible, not as evidence for or against heterogeneous columns.

A full 8,669-case Master-win scan is deferred because the observed win density makes it a poor latency-research investment.

## V22 objective

Reduce Pattern Master CPU while preserving every known board improvement.

Critical implementation fact: current `msMaster` budgets only `resolverCobertura`; it does not budget `generarPatrones`. The hotspot is dominated by pattern generation, so solver-only budget tuning is insufficient.

Known sentinels:
- `4050594__Mega_Maderas4050594.xml`: final 7 boards, cota 7, one board saved by Master; Master ~31.8 s, generation ~31.6 s, solve ~25 ms.
- `4058501__Marcos _Cumini Londero4058501.xml`: 9 -> 8; 4/8 selected columns first appear at rounds >=20, therefore a blind 20-round cap is invalid.

## Phase A — offline economics

No optimizer runtime change.

Use `scripts/v22-master-budget-audit.mjs` to infer:
- pre-Master boards = final boards + `master.placasAhorradas`;
- gap = pre-Master boards - cota;
- Master CPU by gap;
- generation vs coverage-solver share;
- counterfactual policies `run Master only when gap <= N` and their historical lost wins.

Preferred run also supplies the local V20 candidate JSONL so rows certified by V20 are removed before measuring the remaining Master economics.

## Fixed acceptance gates

Correctness:
- frozen 213 boards: exactly 2,371;
- board regressions: 0;
- invalid plans: 0;
- new exceptions: 0;
- both quality sentinels keep their winning board count.

Performance:
- Pattern Master <= 6,500,000 ms on the frozen 213 cohort;
- total <= 9,000,000 ms on the same cohort.

These gates are inherited from the existing roadmap and are not moved after measurement.

## Decision rule

1. If large-gap skipping removes substantial Master CPU and loses zero historical wins, implement that activation gate first behind an experimental flag.
2. If most surviving Master CPU is gap=1, do not tune solver-only `msMaster`; design a generation budget/progressive-round policy instead.
3. Column generation / dual pricing remains deferred until activation and generation-budget controls are exhausted.
