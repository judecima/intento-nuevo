# Optimizer status

## CLOSED — V19/V20 integration

Base branch: `feature/agregar_configuracion_organizacion`

### V19
- integrated in main line
- experimental features remain behind flags

### V20 — post-baseline certification
Status: **CLOSED / MERGED**

Frozen 213-hotspot result:
- pre-V20 total: 14,247,507 ms
- boards: 2,371
- avoided work: 1,886,016 ms
- relative benefit: ~13.24%
- board regressions observed: 0
- invalid plans observed: 0
- cheap-LB violations observed: 0
- cheap-LB errors observed: 0

Original performance gate was 15%. It was not reached and is not rewritten retrospectively.

## FROZEN — lower-bound performance research

No new DFF / projection / clique / raster work enters the latency roadmap unless a correctness defect requires it.

## V21 Pattern Master generation

Measurement mode:
- V20 ON: `OPTIMIZER_POST_BASELINE_CHEAP_LB_EXPERIMENTAL=1`
- staged OFF: `OPTIMIZER_V10_STAGED_EXPERIMENTAL=0`

Frozen post-V20 hotspot baseline:
- total: 12,361,491 ms
- remaining Pattern Master: 9,149,864 ms
- non-Master remainder: 3,211,627 ms
- boards: 2,371

Acceptance gate remains:
- board regressions = 0
- invalid plans = 0
- new exceptions = 0
- `V21 total / V20 total <= 0.7280675` on the same machine
- equivalent to at least 27.193% end-to-end reduction

### V21a — certified family prepass
Status: **CLOSED / FAIL EARLY**

Theoretical ceiling was ~0.26% of post-V20 total. Rejected before full benchmark.

### V21b — 20 random + original family seeds
Status: **CLOSED / FAIL CORRECTNESS**

Decisive gold case `4058501`:
- legacy 40 random: 8,8,8 boards
- 20 random only: 9,9,9 boards
- 20 random + original family seeds: 9,9,9 boards

The original V21b speed signal was dominated by halving random work. The family seeds did not recover the late winning column, so the 213 benchmark was cancelled.

### V21c — late-column diagnosis / direct basis
Status: **OPEN / DIAGNOSTIC**

No round-count reduction is allowed until the missing late column is identified.

Next gate on `4058501`:
1. instrument the unmodified 40-round legacy generator;
2. identify selected pattern vectors whose source/first-seen round is >20;
3. inspect their geometry and demand composition;
4. check whether the direct `RepetitiveFamilyBasis` generates those same vectors;
5. only then test a reduced-random candidate.

The direct repetitive-basis prototype is treated separately from failed V21b. It is not accepted until the full-order 4058501 gate proves 8 boards.

## Rule

No optimizer change enters the roadmap unless its expected metric movement and acceptance threshold are written before implementation.
