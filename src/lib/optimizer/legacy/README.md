# Legacy kernel inside the Next optimizer

## Source of truth

As of 2026-09-07, the active optimizer source of truth is the **Next project** under:

```text
src/lib/optimizer/**
```

This includes the CommonJS kernel in this directory and the typed adapter/orchestration code around it.

The HTML files in the repository root are historical/reference artifacts. They are **not** the development source of truth and must not overwrite the active Next runtime during normal work.

## Historical provenance

These `.cjs` files were originally extracted from `Optimizador_V10_Interactivo_Modos_Validacion_XML_Lepton.html`. That provenance is useful for archaeology and comparisons, but future optimizer changes are made, reviewed and benchmarked against the code consumed by Next.

The public typed entry point is `src/lib/optimizer/index.ts`, which routes through `engine/legacy-engine.ts` into this kernel.

## HTML extractor

`scripts/extract-legacy-optimizer.mjs` now writes historical snapshots outside the runtime by default. Overwriting `src/lib/optimizer/legacy` requires the explicit emergency flag:

```text
ALLOW_LEGACY_RUNTIME_OVERWRITE=1
```

That override is for deliberate archaeology/comparison only, not normal optimizer development.

## Architecture rule

Keep the hot kernel functional and allocation-conscious. New product/domain architecture belongs around it under `src/lib/optimizer/**`, not in the root HTML artifacts.
