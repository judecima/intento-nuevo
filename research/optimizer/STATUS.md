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

Runtime activation remains OFF by default:
`OPTIMIZER_POST_BASELINE_CHEAP_LB_EXPERIMENTAL=0`

## FROZEN — lower-bound performance research

No new DFF / projection / clique / raster work enters the latency roadmap unless a correctness defect requires it. Pattern Master is the dominant remaining hotspot.

## OPEN — V21 Pattern Master generation

Single objective: reduce end-to-end post-V20 latency without losing a board.

Measurement mode:
- V20 ON: `OPTIMIZER_POST_BASELINE_CHEAP_LB_EXPERIMENTAL=1`
- staged OFF: `OPTIMIZER_V10_STAGED_EXPERIMENTAL=0`

Frozen historical post-V20 baseline on 213 hotspot cases:
- total: 12,361,491 ms
- remaining Pattern Master: 9,149,864 ms
- non-Master remainder: 3,211,627 ms
- boards: 2,371

### Acceptance gate

Correctness:
- board regressions: 0
- invalid plans: 0
- new exceptions: 0

Performance, measured against V20 on the same machine:
- `V21 total / V20 total <= 0.7280675`
- at least **27.193% end-to-end reduction**
- historical-machine equivalent: `<= 9,000,000 ms`

Diagnostic Master target, not a separate gate:
- at least **36.74% reduction** of remaining post-V20 Master
- historical equivalent `<= 5,788,373 ms`

### V21a — certified family prepass
Status: **CLOSED / FAIL EARLY**

A prepass was allowed to skip full Master only when its validated candidate reached the active lower bound. On the frozen hotspot only one Master-active case can satisfy that condition, so its theoretical maximum benefit is about 31,793 ms (~0.26% of post-V20 total). It cannot reach the V21 gate and is not part of the runtime candidate.

### V21b — family-seeded Pattern Master
Status: **IMPLEMENTED / BENCHMARK PENDING**

Runtime flag, OFF by default:
`OPTIMIZER_V21_FAMILY_MASTER_EXPERIMENTAL=0`

Pool generation changes only when the flag is ON:
- deterministic exact `family-base` seeds
- deterministic exact `family-height` seeds
- 20 random rounds instead of 40
- monotype fallback remains
- same guillotine motor creates every physical family pattern
- same coverage solver
- same materialization
- same industrial validator

No V10 control-flow change is part of V21b; `v10.cjs` is identical to main/V20.

Early paired signal on three exact hotspot XMLs:
- total: 55,102 -> 42,425 ms = **-23.0%**
- Pattern Master: 27,931 -> 14,780 ms = **-47.1%**
- board regressions: **0/3**
- the only historical Master board-win case tested (`4050594`) still reaches 7 boards

This three-case sample is directional only. PASS/FAIL is decided by the frozen 213 same-machine A/B. If that passes, V21b must then pass the 8,669-case zero-board-regression gate before merge.

### Stop rule

The 20 random rounds are frozen before the full benchmark. If V21b misses the normalized target or loses any board, close it as FAIL and move to V22. Do not retune the round count after seeing the 213 result.

## Rule

No new optimizer change enters the roadmap unless the expected metric movement and acceptance threshold are written before implementation.
