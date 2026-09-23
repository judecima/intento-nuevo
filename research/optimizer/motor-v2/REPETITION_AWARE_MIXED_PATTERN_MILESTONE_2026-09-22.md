# Motor V2 — Repetition-aware mixed-pattern milestone — 2026-09-22

Status: **VALID RESEARCH MILESTONE / NOT PRODUCTION-PROMOTED**

Frozen production reference:
- branch: `motor-beta-v1`
- freeze commit: `07428bad8b1a4670c92ca0919fad32d3f487d63f`

Research branch:
- `research/motor-v2-structural-20260922`

## Goal

Recover repeated-batch board-count gaps without:
- changing `motor-beta-v1`,
- globally increasing `maxPiezasBeam`,
- hard-coding a kit,
- forcing one layout to be replicated N times,
- allowing remnant quality to override board count.

The prototype enumerates physically bounded **mixed usage vectors per board** over logical quantities, validates each one-board physical pattern, then gives the resulting pool to the existing exact coverage solver.

The solver is therefore free to combine:
- whole kits,
- partial kits,
- multiple kits per board,
- non-proportional vectors,
- different vectors on different boards.

## Gate

Fixture:
`research/optimizer/motor-v2/fixtures/REPEATED_MIXED_MILESTONE_8.json`

It contains:
- 4 frozen V3>Lepton repeated-batch gaps,
- 4 repeated controls where frozen V3 already equals Lepton.

Research work budget:
- `MAX_PHYSICAL_TESTS=64`

Acceptance:
- candidate must be physically valid,
- candidate must use **strictly fewer boards** than frozen V3,
- otherwise exact V3 remains the fallback.

## Measured result

Cases: **8**

- accepted board improvements: **3**
- unchanged/fallback: **5**
- invalid accepted plans: **0**
- board regressions: **0**
- total boards saved: **17**
- Lepton gaps closed: **3**
- accepted candidates reaching safe LB: **3**

### Closed gaps

| Case | Frozen V3 | Safe LB | Lepton | Motor V2 research | Saved |
|---|---:|---:|---:|---:|---:|
| 5504203 | 90 | 75 | 75 | **75** | **15** |
| 5432432 | 4 | 3 | 3 | **3** | **1** |
| 5526837 | 13 | 12 | 12 | **12** | **1** |

All three final plans passed industrial validation.

A separate current-runtime check on the four gap cases reproduced their stored V3 board counts exactly before evaluating the research candidate.

### Unresolved gap

`5436342`:
- V3 20
- Lepton 19
- safe LB 18
- work budget exhausted after 64 physical vector tests
- research candidate did not improve
- fallback remains V3 20

This is the intended safe failure mode.

### Controls

The four control cases remained unchanged:
- 5461490: 2 -> 2
- 5482541: 2 -> 2
- 5515640: 4 -> 4
- 5521519: 10 -> 10

## 5504203 result

Demand:
- 75 x 1220x455
- 150 x 1828x605
- stock 2440x1220
- kerf 4.5

Frozen V3:
- 90 boards

Safe DFF lower bound:
- **75**

The research generator:
- enumerated 4 mixed vectors after physical quantity bounds,
- needed only 2 physical feasibility tests,
- discovered physical vector `[1,2]`,
- existing coverage solver reached **75** in 75 nodes,
- solver did not exhaust its budget,
- final 225-piece plan passed industrial validation.

Crucially, the algorithm did **not** assume that `[1,2]` must be replicated.
It was merely one generated physical pattern. The exact solver chose it 75 times because it was optimal for this demand.

## Evidence that the search is not a fixed-kit replicator

Case `5526837` reaches 12 boards using several different vectors, including:
- `[12,1,1]`
- `[4,3,0]`
- `[0,0,2]`
- `[0,3,0]`

This demonstrates that the architecture permits partial and non-proportional demand combinations.

## Interpretation

This milestone confirms the root diagnosis from case 5504203:

> repeated large requests are not inherently difficult for the exact coverage solver; the frozen legacy generator can fail to expose the mixed physical patterns the solver needs.

The new prototype improves **pattern generation representation**, not the global objective.

Board count remains lexicographically dominant:
1. fewer boards,
2. only at equal boards, official commercial remnant quality,
3. latency/complexity after quality.

## Performance status

This is a **quality milestone**, not a performance promotion.

Observed research costs are still too high for universal synchronous execution on all 2–3 type cases. The next step is to reduce candidate-vector work and learn a cheap applicability gate while preserving these 3/3 wins.

## Decision

PASS as a Motor V2 research milestone.

Do not merge into `motor-beta-v1` yet.

Next gate:
1. run on the full repeated `V3 > safe LB` cohort,
2. preserve 0 invalids / 0 board regressions,
3. measure additional strict wins,
4. reduce physical-vector tests before any production integration.
