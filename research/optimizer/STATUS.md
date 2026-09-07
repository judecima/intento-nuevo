# Optimizer status

Base branch: `feature/agregar_configuracion_organizacion`

## Governing objective — frozen
1. minimize board count;
2. with the same board count, maximize industrial/commercial remnant quality;
3. never add a board to improve remnant;
4. only after quality is preserved, reduce computation time;
5. zero correctness regressions.

Remnant quality is therefore ahead of latency. A fast path that preserves boards but loses an accepted equal-board remnant improvement is not release-safe.

## CLOSED — V19
- integrated in main line
- staged experimental features remain behind disabled flags

## CLOSED / MERGED — V20 post-baseline certification

Frozen 213-hotspot result:
- baseline total: 14,247,507 ms
- boards: 2,371
- deterministic historical stages avoided by certification: 1,886,016 ms
- relative stage-time benefit: ~13.24%
- board regressions observed: 0
- invalid plans observed: 0
- cheap-LB violations observed: 0
- cheap-LB errors observed: 0

Original performance gate was 15%. It was not reached and is not rewritten retrospectively.

Runtime flag remains OFF by default:
`OPTIMIZER_POST_BASELINE_CHEAP_LB_EXPERIMENTAL=0`

### Release status: BLOCKED — remnant regression
V20 correctly certifies the minimum board count, but its early return skips the global dead-strip compactation stage. On the currently measured certified sample:
- 89 certified cases;
- compactation would have activated 52 times;
- compactation saved 0 boards, as expected after certification;
- compactation produced 20 accepted equal-board remnant improvements.

Therefore current V20 improves latency while degrading objective #2 on a material fraction of certified cases. Do not enable the canary until this is repaired or the product objective is explicitly changed.

Planned repair: after board-count certification, skip global rescues that can no longer reduce boards, but run a cheap **per-board remnant defragmentation/repack**. Each existing board is treated as a fixed one-board subproblem; accept a replacement only when it still uses exactly one board, passes validation, and `calidadRestos` improves. This preserves the fixed board count while attempting to recover the remnant polish lost by the global compactation skip.

## FROZEN — lower-bound performance research
No new DFF / projection / clique / raster work is allowed for the latency roadmap unless a new correctness defect requires it.

## CLOSED — V21 generation experiments
Rejected before integration:
- V21a certified fast prepass: insufficient performance ceiling;
- V21b fixed 20-round/family candidate: correctness failure on `4058501` (9 boards vs legacy 8);
- geometric/repetition families: did not generate the late heterogeneous columns required by the critical holdout.

## PAUSED — V22 Pattern Master budget evidence
V22 evidence remains valid, but runtime work is paused until the V20 remnant regression is resolved.

Stable cost finding:
- generation + monotype: 96.24% of historical Master wall time;
- coverage solver: 3.76%.

Rejected by evidence:
- hard gap cutoff;
- blind fixed-round cutoff;
- patience on board-count improvement;
- patience on currently selected/useful columns.

Mandatory Master sentinels:
- `4050594` => 7 boards;
- `4056900` => 6 boards;
- `4057401` => 4 boards;
- `4058501` => 8 boards;
- `4059200` => 17 boards.

Open diagnostic signal when V22 resumes: empirical pool saturation.

## Governance rule
No optimizer runtime change is accepted unless:
1. its expected metric movement and gate are written before implementation;
2. board count never regresses;
3. equal-board remnant quality is not degraded relative to the accepted reference path;
4. mandatory sentinels preserve their board count;
5. benchmark cohorts are explicitly identified;
6. failed thresholds are not moved after observing results.
