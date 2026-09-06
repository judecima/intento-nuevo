# Optimizer status

## CLOSED — V19/V20 integration

Base branch: `feature/agregar_configuracion_organizacion`

### V19
- integrated in main line
- experimental features remain behind flags

### V20 — post-baseline certification
Status: **CLOSED / MERGED**

Result on frozen 213-hotspot cohort:
- baseline total: 14,247,507 ms
- boards: 2,371
- lower-bound / fast-path estimated benefit: 1,886,016 ms
- relative benefit: ~13.24%
- board regressions observed: 0
- invalid plans observed: 0
- cheap-LB violations observed: 0
- cheap-LB errors observed: 0

Original performance gate was 15%. It was not reached and is not rewritten retrospectively. The miss is documented as a cohort-extrapolation error (trim/cohort mismatch), not as a correctness failure.

Runtime activation remains OFF by default:
`OPTIMIZER_POST_BASELINE_CHEAP_LB_EXPERIMENTAL=0`

## FROZEN — lower-bound performance research

No new DFF / projection / clique / raster work is allowed for the latency roadmap unless a new regression or correctness defect requires it.

Reason: the dominant hotspot is Pattern Master, not lower-bound computation.

## OPEN — V21 Pattern Master generation

Single objective: reduce Pattern Master latency without losing a board.

Frozen baseline on 213 hotspot cases:
- Pattern Master: 10,624,131 ms
- total: 14,247,507 ms
- boards: 2,371

### Acceptance gates
Correctness:
- board regressions: 0
- invalid plans: 0
- new exceptions: 0

Performance target:
- Pattern Master <= 6,500,000 ms on the 213 hotspot cohort
- total <= 9,000,000 ms on the same cohort

If V21 does not reach these targets, stop tuning family thresholds and move to V22 (adaptive Master budget).

### V21 scope
Allowed:
- family-base candidate generation
- family-height candidate generation
- random fallback
- pattern provenance and roundFound/firstSeenRound instrumentation

Not allowed in V21:
- new lower bounds
- new raster experiments
- new clique/projection research
- solver objective changes
- remnant tradeoffs that add boards

## Rule
No new optimizer change enters the roadmap unless the expected metric movement and acceptance threshold are written before implementation.
