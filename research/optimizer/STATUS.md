# Optimizer status

## CLOSED — V19/V20 integration

Base branch: `feature/agregar_configuracion_organizacion`

### V19
- integrated in main line
- experimental features remain behind flags

### V20 — post-baseline certification
Status: **CLOSED / MERGED**

Result on frozen 213-hotspot cohort:
- pre-V20 total: 14,247,507 ms
- boards: 2,371
- avoided work: 1,886,016 ms
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

Single objective: reduce end-to-end post-V20 latency without losing a board.

Measurement mode:
- V20 ON: `OPTIMIZER_POST_BASELINE_CHEAP_LB_EXPERIMENTAL=1`
- staged OFF: `OPTIMIZER_V10_STAGED_EXPERIMENTAL=0`

Frozen historical post-V20 baseline on 213 hotspot cases:
- total: 12,361,491 ms
- remaining Pattern Master: 9,149,864 ms
- non-Master remainder: 3,211,627 ms
- boards: 2,371

The pre-V20 Master number 10,624,131 ms is historical context only and is not the V21 baseline.

### Acceptance gate — single performance verdict

Correctness:
- board regressions: 0
- invalid plans: 0
- new exceptions: 0

Performance is normalized for hardware and must be measured against V20 control on the **same machine**:
- `V21 total / V20 total <= 0.7280675`
- equivalent to at least **27.193% end-to-end reduction**
- on the historical machine this corresponds to `<= 9,000,000 ms`

Do not compare raw milliseconds across different machines.

Diagnostic Master KPI, not a second gate:
- historical equivalent Master `<= 5,788,373 ms`
- approximately **36.74% reduction** of remaining post-V20 Master

### V21 preflight — CLOSED

The historical non-Master floor is ~3.212M ms, therefore the 9.0M historical-equivalent target is mathematically reachable through Master reduction.

Extreme case `4048571` remains Master-bound in the frozen profile:
- ~96,009 ms baseline
- ~950,067 ms Pattern Master
- 2,439 pieces

### V21 implementation

Allowed:
- exact same-axis `family-base` generation
- exact same-axis `family-height` generation
- four-round random exploration
- physically validated family patterns
- early return only if the fast pool reaches the active lower bound
- otherwise full legacy Pattern Master fallback
- V21 provenance and metrics

Not allowed in V21:
- new lower bounds
- new raster experiments
- new clique/projection research
- solver objective changes
- remnant tradeoffs that add boards
- rewriting the gate after measurement

If V21 misses the normalized target, close it as FAIL and move to V22 instead of tuning arbitrary thresholds indefinitely.

## Rule

No new optimizer change enters the roadmap unless the expected metric movement and acceptance threshold are written before implementation.
