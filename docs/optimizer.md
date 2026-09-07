# Optimizer

The source optimizer comes from `Optimizador_V10_Interactivo_Modos_Validacion_XML_Lepton.html` (the default of `npm run optimizer:extract`; override it with `LEGACY_OPTIMIZER_HTML`).

That version ranks plans by cut depth: with the same board count it prefers the shallower tree (`maxXmlLayer` → `maxType2Layer` → `maxType1Layer` → `type2Nodes`) and only then the remnant quality. Depth matters because every level of the tree is a `layer` in the machine XML, and the real production files never go past 4. The plan summary now carries `maxXmlLayer`, `maxType2Layer`, `maxType1Layer`, `type2Nodes` and `etapasUsadas`.

Phase 4 extracted it mechanically into `src/lib/optimizer/legacy/` through `scripts/extract-legacy-optimizer.mjs`. Those `.cjs` files are generated legacy code and must not be edited manually.

## Public API

Use the typed facade:

- `optimizeProject(input)` in `src/lib/optimizer/engine/legacy-engine.ts`
- `generateMachineXml(result, machineProfile)` in `src/lib/optimizer/exporters/machine-xml.ts`
- `validateIndependentSlices(plan)` in `src/lib/optimizer/validators/independent-slices.ts`

`optimizeProject` validates input with Zod and returns normalized boards, placements, cuts, remnants, metrics, validation, and the raw legacy result.

Default strategy is `baseline`. `strategy: "v10"` calls the extracted V10 layer explicitly.

## Cost Of A Save

Optimizing is cheap next to the database. Measured against the project's Supabase instance from a developer machine: one PostgREST round trip costs ~300 ms (median), while the engine itself takes ~0.6 s for a 40-piece project (baseline) and ~1.0-1.5 s with the V10 layer.

That is why `saveProjectDraftAction` writes in batches: one `upsert` for every piece plus one `delete` for the removed ones (in parallel), skipping the project update when no parameter changed, and handing the already-loaded project, material and items to `runAndStoreOptimization` through `preloaded` so it does not read them again. The four detail tables of the result are inserted in parallel. A save of a 13-row project went from ~28 round trips to ~9.

Piece writes bump `projects.version` once per row, so the action re-reads the version after the batch and uses that value both for the optimization job and for the value it returns to the editor.

## Plan Rendering

Placements carry the data the interactive viewer needs: `edges` (tapacanto per side), `sourceWidth`/`sourceHeight` (measures as loaded, before rotation) and `trace` (the region/slice decisions that led to the placement, taken from the legacy `_diagPath`).

`buildCutPlanView` in `src/lib/optimizations/plan-view.ts` turns the persisted rows into the serializable model used by `CutPlanViewer`. Piece, cut and remnant coordinates stay relative to the trimmed area, exactly as the legacy engine emits them; the SVG adds `trimX`/`trimY` when drawing. Trim, kerf and remnant thresholds are read from the options the optimizer actually used (`result_json.raw.opts`) and fall back to the current project row for results stored before that field existed.

## Legacy Modules

Extracted modules:

- `motor`
- `patrones`
- `cobertura`
- `materializar`
- `oneboard`
- `validador_industrial_v3`
- `v10`
- `xml-exporter`

## Critical Invariant

The anchor piece proposes a provisional slice size, but the final slice contracts to the actual used width or height. The next sibling starts at final size plus kerf, never at provisional size plus kerf.

This protects against the ghost-width bug:

- provisional anchor width: `622 mm`
- real occupied width: `578 mm`
- next slice starts at `578 + kerf`

The characterization test `tests/optimizer/optimizer.test.ts` asserts that a known contraction case keeps independent sibling slices valid.
