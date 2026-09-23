# 5504203 — REPEATED-BATCH ROOT CAUSE — 2026-09-22

Status: ROOT CAUSE CONFIRMED / RESEARCH ONLY / BETA UNCHANGED

Branch:
`research/motor-v2-structural-20260922`

Frozen beta:
`motor-beta-v1 @ 07428bad8b1a4670c92ca0919fad32d3f487d63f`

## Case

- stock: 2440 x 1220
- kerf: 4.5
- demand:
  - 75 x 1220 x 455
  - 150 x 1828 x 605
- total pieces: 225
- physical Lepton boards: 75
- frozen V3: 90
- area LB: 70
- safe DFF/hybrid LB: **75**

Therefore the optimizer already knows that 75 is the correct safe lower-bound target.

## Hypothesis tested: local remnant preference caused 90 boards

The legacy greedy board constructor allows layouts within `tolerancia` of maximum placed area and can choose among them using local commercial-remnant quality.

Ablation on this exact case:

- `tolerancia=0.02` -> baseline **90**
- `tolerancia=0.005` -> baseline **90**
- `tolerancia=0` -> baseline **90**

Conclusion:
**the 2% local-remnant tolerance is not the root cause of this 90 -> 75 miss.**

It remains an architectural risk to audit separately because local remnant must never override the global primary objective, but it does not explain this sentinel.

## Confirmed root cause: mixed pattern is removed by large-piece Beam cutoff

Frozen default:
- `maxPiezasBeam=120`
- request pieces = 225
- global Beam is therefore skipped in the baseline and also unavailable to the legacy pattern constructor when it optimizes the full mixed subset.

Frozen pattern pool with `maxPiezasBeam=120`:
- Master patterns: 2
- monotype patterns: 2
- unique usage vectors after dedup: **2**
- mixed usage vector `[1,2]`: **ABSENT**
- coverage solver result: **90 boards**
- solver nodes: 84
- solver exhausted/budget hit: false

The coverage solver is not the failure here: the required physical pattern is simply absent from its pool.

Research ablation only:
- `maxPiezasBeam=300`
- baseline becomes 89 boards
- pattern generator produces a third unique usage vector:
  - **[1,2]**
  - physical area: 2,766,980 mm2
- coverage solver with the same demand returns:
  - **75 boards**
  - 75 nodes
  - no exhaustion
- final V10: **75 valid boards**
- Master saves 14 boards from the 89-board research incumbent

This proves that the frozen Master/coverage machinery can solve the case exactly once the missing mixed pattern is present.

## Important architectural interpretation

The correct lesson is NOT:
`compute one reduced kit and replicate it g times`.

That would artificially constrain the solution space. In a general repeated furniture batch:
- multiple kits can share one board,
- fractional kit combinations across boards can be globally superior,
- different board patterns can be mixed,
- the optimum may require usage vectors that are not proportional to the original kit vector.

The useful information in repeated demand is **state compression / pattern-generation guidance**, not a mandatory replicated layout.

For this particular case `[1,2]` repeated 75 times happens to be optimal because:
1. the physical pattern exists,
2. its usage vector exactly divides demand,
3. 75 equals the safe DFF lower bound.

General Generator V2 must instead generate a bounded set of high-value physical usage vectors and let the exact coverage solver choose arbitrary integer combinations.

## Objective contract for Motor V2

Board count remains lexicographically dominant at every acceptance boundary:

1. fewer boards
2. only at equal board count, better official commercial remnant
3. only after both, latency/complexity

Local remnant heuristics may rank alternatives only when doing so cannot remove a candidate necessary for a lower global board count.

## Next research target

Build a research-only **repetition-aware mixed-pattern generator** that:
- operates on logical quantities, not 225 expanded piece identities,
- generates multiple feasible mixed usage vectors per board,
- permits non-proportional / partial-kit combinations,
- physically validates every generated pattern,
- passes the resulting pool to the existing exact coverage solver,
- falls back to frozen beta unchanged.

Required sentinel:
- 5504203 must recover 75 boards without globally raising `maxPiezasBeam` to 300 and without hard-coding the [1,2] vector.
