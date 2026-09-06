# Optimizer research history — staged V10 (V12–V19)

This directory persists the experimental work that was previously spread across chat sessions and generated artifacts.

## Invariants

- Frozen legacy V10 remains the default production path.
- Experimental staged path is opt-in only.
- Primary quality gate: **0 board-count regressions** against the frozen 40-round V10 baseline.
- Equal board count preserves the legacy remnant-quality ordering.
- `4058501` is the canonical counterexample: 20 rounds => 9 boards, 40 rounds => 8 boards. Therefore rounds 20..39 remain mandatory unless a valid lower bound certifies the incumbent.

## Timeline

- **V12 / V13 — Integrality Repair + incremental Pattern Master:** early physical pool, Morton/Z-order, directed replace+2, industrial filtering, exact repair sieve, `empacarPlaca`, then existing B&B. `4058501` can be repaired 9 -> 8, but 8 is not mathematically certified because area/strong LB remain 7.
- **V14 — Feature-flag staged path:** staged optimizer wired behind `OPTIMIZER_V10_STAGED_EXPERIMENTAL=1`, with isolated cache discriminator. Legacy remains untouched when the flag is off.
- **V15 — Hybrid Lower Bound:** Strong V14 + Kerf + DFF + Projection + Clique, with adaptive Raster. Heavy F1 benchmark showed materially stronger certification than V14 alone.
- **V16 — Persisted pools / wall-clock:** cold generation dominates cost. With persisted physical pools, post-Master work is small; Integrality Repair is gated to <=16 types and keeps the `4058501` win.
- **V17 — Pre-MultiSlice certificate:** after baseline + compactation, Hybrid LB may safely stop before MultiSlice/OneBoard when the incumbent is mathematically certified. This is the current green staged runtime snapshot in `src/lib/optimizer/experimental/`.
- **V18 — Two-phase remnant refinement:** experimental API separates board-count optimality from same-board remnant refinement. Green as architecture/prototype, not wired to the UI/main path.
- **V19 — Cross-Round Memoization:** **REJECTED**. With `sharedPackingMinPool=35`, physical pools can remain identical, but runtime did not improve consistently; the implementation and benchmark are kept only for reproducibility under `v19/rejected/`.

## Runtime flags (V17 staged snapshot)

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

`OPTIMIZER_V10_STAGED_EXPERIMENTAL=0` is the safety default.

## Status

### Green experimental

- Hybrid Lower Bound with adaptive Raster.
- Lower-bound gate before MultiSlice (after compactation).
- Incremental Pattern Master rounds 20..39 with preserved RNG sequence.
- Integrality Repair gated by type count.
- V18 two-phase remnant module as a non-wired prototype.

### Rejected / archive only

- Global reduction from 40 to 20 Pattern Master rounds.
- Compactation risk gate (safe but not economically useful).
- Fine-grained baseline -> compactation packing reuse.
- V19 Cross-Round Memoization.

See each report and JSON summary for measured evidence and limitations.
