# Experimental optimizer research

Recovered V17/V18 optimizer path. **Disabled by default.**

Enable V17 staged execution only for controlled testing:

```env
OPTIMIZER_V10_STAGED_EXPERIMENTAL=1
OPTIMIZER_PRE_MULTISLICE_LB_EXPERIMENTAL=1
```

The staged pipeline includes Hybrid Lower Bound, adaptive Raster, Integrality Repair, incremental Pattern Master and the V17 pre-MultiSlice certification gate.

`v10-two-phase-remnant.cjs` is the V18 prototype for returning a certified board-count plan first and refining remnant quality afterwards. It is not wired as the default path.

V19 Cross-Round Memoization is intentionally absent from this directory because the benchmark rejected it. Its exact recovered source and evidence are under `research/optimizer/v12-v19/v19-rejected/`.
