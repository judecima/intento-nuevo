# Pre-Master Cheap Lower Bound Gate — 2026-09-18

## Decision

**PASS as an isolated experimental performance candidate.**

Baseline worker: `425ebba5de48eb0105d5cb46b08594b3dc50ff49`.

The candidate adds a cheap, safe hybrid lower-bound check after
baseline/compactation/MultiSlice/OneBoard and immediately before Pattern Master.

If the lower bound reaches the current physical incumbent, Pattern Master is
skipped because it cannot reduce board count.

This is remnant-safe relative to the current V10 path at this boundary: the
legacy Pattern Master only replaces the incumbent when it uses fewer boards.
If fewer boards are mathematically impossible, keeping the existing incumbent
preserves its exact physical layout and remnant quality.

## Physical corpus

Current Master-active cohort: **323 real XML orders**.

Parser cross-check:
- XML cases: 323
- Project: 255
- Order: 68
- physical-piece count matched historical manifest: **323/323**
- area lower bound matched historical manifest: **323/323**

## Cheap bound

The gate reuses the existing Hybrid LB in cheap/no-raster mode:

- V14 strong projection / incompatibility bounds;
- kerf-adjusted area bound;
- dual-feasible-function bound;
- projection bounds;
- incompatibility clique;
- raster disabled.

No pattern generation is involved.

## Certification result

- certified before Master: **97/323**
- gap=1 certified: **95/293**
- gap=2 certified: 1
- gap=43 certified: 1
- execution errors: **0**

Most important safety result:

**0/4 historical Master winners were certified.**

| order | pre-Master | area LB | cheap LB | Master final |
|---|---:|---:|---:|---:|
| 4050594 | 8 | 7 | 7 | 7 |
| 4056900 | 7 | 6 | 6 | 6 |
| 4057401 | 5 | 4 | 4 | 4 |
| 4059200 | 18 | 13 | 16 | 17 |

Therefore all four known Master improvements remain on the existing Pattern
Master path.

Binding certificates among the 95 certified gap=1 cases:

- DFF: 55
- kerf bound: 38
- V14 projection (`tall>1/3`): 2

## Lower-bound cost

Across all 323 cases:

| metric | CPU |
|---|---:|
| p50 | 0.399 ms |
| p95 | 5.891 ms |
| p99 | 12.763 ms |
| max | 107.663 ms |

For the 293 gap=1 cases:

| metric | CPU |
|---|---:|
| p50 | 0.378 ms |
| p95 | 5.798 ms |
| p99 | 12.763 ms |
| max | 25.538 ms |

## Projected Pattern-Master generation impact

Using the historical physical 323-case generation telemetry and charging the
cheap-LB wall time to every case:

| metric | current generation | with pre-Master LB |
|---|---:|---:|
| p50 | 9,433 ms | **5,113 ms** |
| p90 | 49,173 ms | **39,862 ms** |
| p95 | 64,351 ms | **59,535 ms** |
| p99 | 120,513 ms | 120,513 ms |
| max | 462,825 ms | 462,829 ms |

Aggregate historical generation time:
- current: 6,218.362 s
- projected with gate: 5,144.155 s
- saved: **1,074.207 s**
- reduction: **17.27%**

The gate does not materially improve p99 because the extreme-tail cases are not
certified. It does materially improve median, p90, p95 and aggregate CPU.

## Implementation

Research branch: `experiment/optimizer-premaster-cheap-lb`.

Opt-in controls:
- config: `usarCotaBarataAntesMaster: true`
- env: `OPTIMIZER_PREMASTER_CHEAP_LB_EXPERIMENTAL=1`

Default behavior remains frozen/off.

Telemetry is recorded under `metricas.lowerBound.preMaster*`.

## Promotion boundary

Before merging into the frozen worker:
1. CI contract must remain green;
2. run paired Full Optimize replay on the Master-active cohort if practical;
3. preserve all four historical winners;
4. zero industrial invalids;
5. zero board/remnant regressions;
6. then combine separately with the already-certified OneBoard baseline reuse.

No heuristic or pattern-generation policy changes are part of this candidate.
