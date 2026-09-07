# Optimizer status

Base branch: `feature/agregar_configuracion_organizacion`

## CLOSED — V19
- integrated in main line
- staged experimental features remain behind disabled flags

## CLOSED / MERGED — V20 post-baseline certification

Result on the frozen 213-hotspot cohort:
- baseline total: 14,247,507 ms
- boards: 2,371
- deterministic historical stages avoided by certification: 1,886,016 ms
- relative benefit: ~13.24%
- board regressions observed: 0
- invalid plans observed: 0
- cheap-LB violations observed: 0
- cheap-LB errors observed: 0

Original performance gate was 15%. It was not reached and is not rewritten retrospectively.

Runtime flag remains OFF by default in the repository:
`OPTIMIZER_POST_BASELINE_CHEAP_LB_EXPERIMENTAL=0`

Release status: **READY FOR CONTROLLED CANARY**. The recommended production experiment is to enable only this flag while keeping `OPTIMIZER_V10_STAGED_EXPERIMENTAL=0`, with rollback by setting the V20 flag back to `0` and restarting the service.

V20 does not search for a better plan. It strengthens the lower bound after the physical baseline and returns early only when the baseline board count is mathematically certified. If a computed cheap lower bound ever exceeds the physical incumbent, it is ignored and recorded as `cheapViolation`.

## FROZEN — lower-bound performance research

No new DFF / projection / clique / raster work is allowed for the latency roadmap unless a new correctness defect requires it.

## CLOSED — V21 generation experiments

Rejected before integration:
- V21a certified fast prepass: insufficient performance ceiling.
- V21b fixed 20-round/family candidate: correctness failure on `4058501` (9 boards vs legacy 8).
- geometric/repetition families: did not generate the late heterogeneous columns required by the critical holdout.

## OPEN — V22 Pattern Master generation budget evidence

Stable cost finding:
- generation + monotype: 96.24% of historical Master wall time
- coverage solver: 3.76%

Rejected by evidence:
- hard gap cutoff: real Master wins exist at gap 1, 2 and 5
- blind fixed-round cutoff
- patience on board-count improvement
- patience on currently selected/useful columns

Mandatory cross-corpus quality sentinels:
- `4050594` => 7 boards
- `4056900` => 6 boards
- `4057401` => 4 boards
- `4058501` => 8 boards
- `4059200` => 17 boards

`4058501` is the critical late-win holdout: no board improvement or selected-column signal through round 30; the 8-board solution appears at round 35.

Current open signal: **empirical pool saturation**. This is diagnostic only, not a runtime policy. The current evidence branch is `optimizer-v22b-progressive-master-evidence` and profiles 40 stratified Master non-wins against the 5 mandatory wins while controlling for order/type complexity.

## Governance rule

No optimizer runtime change is accepted unless:
1. its expected metric movement and gate are written before implementation;
2. all mandatory Master quality sentinels preserve board count;
3. any benchmark cohort is explicitly identified and cannot silently stand in for a different holdout/corpus;
4. a failed threshold is not moved after observing the result.
