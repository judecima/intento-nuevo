# Reconstruction status — optimizer V12–V19

Date: 2026-09-05
Branch: `optimizer-research-v19`

## Purpose

This branch persists optimizer work that had previously lived partly in ChatGPT conversations and downloadable experiment artifacts. It intentionally keeps the production/legacy path unchanged by default.

## Reconstructed live experimental path

The following recovered modules are present under `src/lib/optimizer/experimental/`:

- `strong-lower-bound.cjs` — conservative geometric lower bound.
- `claude-lower-bounds.cjs` — kerf, DFF, projection, clique and adaptive raster cascade.
- `hybrid-lower-bound.cjs` — combines V14 strong LB with the advanced cascade.
- `compactation-risk-gate.cjs` — V17 dead-strip/compactation risk gate.
- `integrality-repair.cjs` — targeted +1-board integrality-gap repair.
- `v10-hybrid-pipeline.cjs` — V17 staged pipeline.
- `v10-two-phase-remnant.cjs` — V18 primary-board / remnant-refinement prototype.

`src/lib/optimizer/engine/legacy-engine.ts` is wired to the V17 staged path only when the explicit master flag is enabled. The default remains the legacy V10 path.

## Feature flags

Default-safe configuration is documented in `.env.example`:

```env
OPTIMIZER_V10_STAGED_EXPERIMENTAL=0
OPTIMIZER_STRONG_LOWER_BOUND_EXPERIMENTAL=1
OPTIMIZER_PRE_MULTISLICE_LB_EXPERIMENTAL=1
OPTIMIZER_INTEGRALITY_REPAIR_EXPERIMENTAL=1
OPTIMIZER_INCREMENTAL_MASTER_EXPERIMENTAL=1
OPTIMIZER_ADAPTIVE_RASTER_EXPERIMENTAL=1
OPTIMIZER_RASTER_MAX_PIECES=40
OPTIMIZER_RASTER_MAX_TYPES=16
OPTIMIZER_REPAIR_MAX_TYPES=16
```

The subfeature flags matter only after `OPTIMIZER_V10_STAGED_EXPERIMENTAL=1` is enabled.

## Version status

| Version | Persisted status | Decision |
| --- | --- | --- |
| V12/V13 | Historical rationale in research docs | Baseline lineage |
| V14 | Strong LB / feature-flag semantics carried into reconstructed staged path | Foundation |
| V15 | Hybrid lower-bound cascade reconstructed | Retained experimentally |
| V16 | Persisted-pool / wall-clock findings documented; staged architecture retained | Retained experimentally |
| V17 | Full staged runtime reconstructed and wired behind feature flag | Last green executable staged snapshot |
| V18 | Two-phase remnant API reconstructed, not default-wired | Prototype retained |
| V19 | Source + benchmark summary archived under `v19-rejected/` | **REJECTED** |

## Critical invariants retained

1. Primary objective remains minimum board count.
2. Same-board remnant quality is secondary and must never increase board count.
3. Legacy V10 remains the default when experimental flags are disabled.
4. Pattern Master keeps the 40-round fallback. The historical `4058501` counterexample showed that globally reducing to 20 rounds can regress the result from 8 to 9 boards.
5. V19 Cross-Round Memoization is not present in the live experimental runtime. It is archived only, because its exact-pool benchmark did not produce a reliable runtime improvement.
6. Validation/acceptance gates remain required before accepting experimental plans.

## Historical validation recovered

V17 pre-MultiSlice certification audit:

- eligible cases: 238
- certified before MultiSlice: 71 (29.8%)
- observed validation violations: 0
- estimated MultiSlice + OneBoard time avoidable on those certified cases: ~350.2 s

V19 gold case `4058501`, 40 rounds:

- legacy: 19,220.126 ms
- cross-round memo: 20,169.871 ms
- exact physical pattern pool: 130 vs 130
- saving: -4.94%
- conclusion: reject V19

## Validation performed during reconstruction

- Recovered V15–V19 `.cjs` artifacts were checked with `node --check` before reconstruction.
- Remote branch tree was audited after publication to confirm the reconstructed runtime files and V19 archive are present.
- GitHub currently reports no status checks for the reconstruction HEAD; therefore this document does not claim a CI pass.

## What is deliberately not done

- No merge into the default branch.
- No activation of experimental flags by default.
- No live integration of V19.
- No claim that V18 is production-ready; it remains an explicit prototype for the two-phase UX/background-refinement direction.

## Recommended baseline for future work

Use V17 (`v10-hybrid-pipeline.cjs`) as the recovered experimental baseline. Treat V18 as an optional architectural layer on top of a certified board-count result. Keep V19 as a negative experiment so the same memoization approach is not accidentally repeated without a materially different cost model.
