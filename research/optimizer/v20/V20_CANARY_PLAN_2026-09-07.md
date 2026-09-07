# V20 controlled canary plan — BLOCKED

Date: 2026-09-07
Base: `feature/agregar_configuracion_organizacion`
Runtime flag: `OPTIMIZER_POST_BASELINE_CHEAP_LB_EXPERIMENTAL`

## Current release decision

**DO NOT ENABLE THE V20 CANARY YET.**

The board-count certification is correct, but the current early return skips the global compactation stage before it has a chance to improve remnant quality at the same board count. That violates the frozen product objective ordering:

1. minimize board count;
2. with the same board count, maximize commercial/industrial remnant quality;
3. never add a board for remnant;
4. only then reduce computation time;
5. zero regressions.

Measured on the currently available certified sample:
- 89 certified cases;
- 52 compactation activations skipped;
- 0 compactation board gains;
- 20 accepted equal-board remnant improvements lost by the current V20 early return.

Therefore V20 is a real latency optimization but **not yet a release-safe quality-preserving optimization**.

## Why the board certification itself remains valid

The physical baseline is an upper bound: N boards are feasible.
The lower bound is a mathematical floor: fewer than L boards are impossible.
When `N == L`, the board count is proven optimal.

The defect is not board count. The defect is returning before objective #2 (equal-board remnant polish) is finished.

## Required repair before canary

Experimental branch: `optimizer-v20-remnant-defrag`.

The repair is intentionally local:
- keep the V20 lower-bound certification;
- skip global searches that can no longer reduce board count;
- re-pack pieces **within each already-used board only**;
- never move pieces between boards;
- accept a board replacement only if it still uses exactly one board and `calidadRestos` improves;
- validate the whole repaired plan industrially.

Reference evaluator:
`scripts/v20-remnant-defrag-eval.mjs`

Experiment gates are separate:
- SAFETY: 0 board regressions, 0 invalid repaired plans, and no remnant worse than current V20;
- RECOVERY: count and describe which of the 20 accepted legacy remnant improvements the repair matches or beats.

Partial recovery (for example, 17/20) is not automatically an unsafe or failed
repair. It does not demonstrate legacy equivalence either. Before canary, resolve
or explicitly accept each remaining quality gap, then evaluate net runtime
including polish. No such acceptance is implied by this roadmap update.

Per the [active roadmap](../ROADMAP_2026-09-07.md), complete the deferred-trace
213-case gate before advancing this repair. V20 remains OFF by default.

## Future canary configuration — only after repair passes

```env
OPTIMIZER_V10_STAGED_EXPERIMENTAL=0
OPTIMIZER_POST_BASELINE_CHEAP_LB_EXPERIMENTAL=1
```

Repository defaults remain OFF until the repair gate and canary are both clean.

## Rollback after eventual rollout

```env
OPTIMIZER_POST_BASELINE_CHEAP_LB_EXPERIMENTAL=0
```

Restart/redeploy the affected process. No data migration is required.

## Non-goals

This repair does not validate V21/V22 Pattern Master research. V22 remains paused while V20's objective-order regression is resolved.
