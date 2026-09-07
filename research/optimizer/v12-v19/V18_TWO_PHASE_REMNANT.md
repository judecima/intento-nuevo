# V18 — Two-phase board optimality and remnant refinement

## Goal

Reduce perceived latency without changing the lexicographic objective:

1. minimum board count;
2. at equal board count, better remnant;
3. then runtime.

V18 does **not** remove Compactation. It separates the moment when board-count optimality is known from the later same-board remnant refinement.

```text
Primary phase
Baseline -> Hybrid Lower Bound -> if certified, return optimal board-count plan

Refinement phase
Compactation -> may keep board count and improve remnant -> replace/update if better
```

If the baseline is not certified, use the complete V17 staged route and keep Compactation on the critical path.

## Historical finding

On the historical 2,000-case holdout:

- Compactation activated: 1,392
- activations with no later rescue: 1,183
- of those, 1,182 recorded no board saving in Compactation
- accumulated Compactation time in those 1,182: ~1,273 s
- 208 still improved remnant at equal board count

Conservative perceived-latency replay:

| Metric | Historical | Primary replay |
|---|---:|---:|
| average | 7,080 ms | **6,455 ms** |
| p50 | 713 ms | **332 ms** |
| p95 | 39,237 ms | 39,237 ms |
| p99 | 97,250 ms | 97,250 ms |

Estimated aggregate perceived-latency saving: **~8.83%**.

## Prototype API

`v10-two-phase-remnant.cjs` exposes:

```js
runPrimaryBoardPhase(lineas, config)
runRemnantRefinement(lineas, config, primaryPlan)
```

The primary phase runs baseline + Hybrid LB and only sets `certified=true` when `lowerBound >= baselineBoards` and the plan is physically valid.

The refinement phase runs the same dead-strip Compactation and accepts fewer boards or equal boards with better remnant, never more boards.

## Direct controls

`4051587`:

- primary: 5 boards, LB 5, certified, ~3.2 s
- refinement: ~6.5 s, accepted `same-boards-better-remnant`
- legacy synchronous: ~10.4 s
- final V18 quality reaches the same level while board optimality is known much earlier

`4051461`:

- primary: 6 boards, LB 6, certified, ~2.8 s
- refinement: ~6.6 s, no improvement
- legacy: ~8.0 s

## Rejected subexperiment

Fine-grained baseline -> Compactation packing reuse was correct in geometry/quality but slower because instrumentation/key/remapping overhead dominated. Example `4049378`: ~2.7 s without reuse vs ~5.3 s with reuse. **Rejected.**

## Status

Green experimental architecture/prototype, but **not wired to the main UI**. The intended UI architecture is to show a certified board-count plan immediately, continue remnant refinement in a worker/background path, and replace the plan only if same-board remnant quality improves.
