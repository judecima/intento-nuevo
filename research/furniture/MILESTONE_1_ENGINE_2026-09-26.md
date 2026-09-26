# Furniture milestone 1 — parametric engine

Target branch: `feature/furniture-engine`.

## Scope

- Portable parametric furniture engine integrated under `src/lib/furniture/**`.
- 21 registered templates.
- A single `FurnitureModel` is the source for 3D geometry, cut list and hardware BOM.
- Default back thickness: 5 mm.
- Default drawer-bottom thickness: 5 mm.
- Both remain configurable through `BuildConfig`.
- Adapter uses the canonical optimizer `OptimizationInput` type and constraint policy.
- Optimization inputs are grouped by physical material, not by furniture instance.
- `back` and `drawerBottom` share one MDF optimization when mapped to the same 5 mm material.
- `body`, `front` and `drawer` may share the 18 mm body material.

## Milestone sentinel

`cabinet_base_120_2p3c`, 1200 × 870 × 600 mm, body thickness 18 mm:

- Melamine 18 mm → independent optimizer input.
- MDF 5 mm → back + drawer bottoms in one independent optimizer input.
- Both inputs must pass `optimizationInputSchema`.
- Both must return a valid optimization plan.

## Validation commands

Portable test:

```powershell
npm run test:furniture
```

V2/Auto/Rust integration:

```powershell
npm run optimizer:rust:build
$env:REQUIRE_RUST_PATTERN_GENERATOR = "1"
npm run test:furniture
Remove-Item Env:REQUIRE_RUST_PATTERN_GENERATOR
```

No optimizer corpus rerun is required: this milestone does not modify `src/lib/optimizer/**`, `native/**` or runtime policy.
