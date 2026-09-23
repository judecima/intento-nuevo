# Motor V2 — Integrated Structural Repetition Broad Gate — Exact Result — 2026-09-23

Frozen reference:
- motor-beta-v1 @ 07428bad8b1a4670c92ca0919fad32d3f487d63f

Research branch:
- research/motor-v2-structural-20260922

Workflow:
- run 35853091477
- head 75ba9677cfbf68cac0747fe7bd54e2c9bf2507dc

## Global result over all gate-eligible holdout cases

Eligible cases: **732**

- rescue actually attempted after baseline>safe-LB: **18**
- baseline already at safe LB: **714**
- early structural safe-LB return: **6**
- board wins vs frozen beta: **2**
- boards saved vs frozen beta: **16**
- invalid route plans: **0**
- invalid beta plans: **0**
- board regressions: **0**
- equal-board remnant regressions: **0**
- equal-board remnant improvements: 0
- equal-board remnant equal: **730**

Lepton comparison:
- route better: 26
- equal: 705
- worse: 1

Timing:
- route total: **155,754.497 ms**
- frozen beta total: **146,974.230 ms**
- global delta: **+8,780.267 ms**
- global saving: **-5.974%**
- p50: 81.718 vs 69.579 ms
- p95: 797.097 vs 751.441 ms
- p99: **1,579.843 vs 2,007.181 ms** (route improves tail)

## Exact board wins

### 5432432
- baseline: 4
- safe LB: 3
- frozen beta: 4
- Motor V2 route: **3**
- Lepton: 3
- physical tests: 1
- valid mixed patterns: 1
- route: 879.875 ms
- beta: 812.681 ms

### 5504203
- baseline: 90
- safe LB: 75
- frozen beta: 90
- Motor V2 route: **75**
- Lepton: 75
- physical tests: 1
- valid mixed patterns: 1
- route: **1,338.248 ms**
- beta: **2,173.333 ms**
- saved: **15 boards**
- route is ~38.4% faster on this case

## Four early-return duplicates

The structural route also reaches the same final board count beta eventually reaches in four cases:

- 5441129: baseline 12 -> route 10 = beta 10; route ~207 ms faster
- 5447933: baseline 11 -> route 10 = beta 10; route ~1,230 ms faster
- 5492016: baseline 45 -> route 40 = beta 40; route ~167 ms slower
- 5531829: baseline 9 -> route 8 = beta 8; route ~588 ms faster

These are not quality wins, but show that structural safe-LB certification can replace later expensive V10 work.

## Routing diagnosis

### True opportunity population: 18 cases

Aggregate:
- route: **33,348.498 ms**
- beta: **33,497.661 ms**
- net delta: **-149.163 ms**
- route saving: **+0.445%**

Therefore the structural route is already slightly faster on the population where it is actually needed.

### Early safe-LB subset: 6 cases

Aggregate:
- route: **8,450.850 ms**
- beta: **11,077.004 ms**
- saving: **23.708%**

### Actual board-win subset: 2 cases

Aggregate:
- route: **2,218.123 ms**
- beta: **2,986.014 ms**
- saving: **25.716%**

### Unnecessary 714 cases

These cases had baseline already at safe LB and never needed structural search.

Aggregate:
- route: **122,405.999 ms**
- beta: **113,476.568 ms**
- overhead: **8,929.430 ms**
- overhead per case: ~**12.5 ms**
- saving: **-7.869%**

This overhead alone is larger than the entire global regression.

## Conclusion

The broad gate FAIL is a **routing failure, not a geometry/quality failure**.

The structural generator itself satisfies the safety contract on this cohort:
- 0 invalids
- 0 board regressions
- 0 equal-board remnant regressions
- 16 boards saved
- p99 improved

The next architecture must not run any new lower-bound/gate work on cases already certified by the existing V10 path.

Correct placement:
- inside the Master branch / after the existing safe-LB decision,
- only when V10 was going to enter Master anyway,
- if structural candidate reaches safe LB, short-circuit Master,
- otherwise execute frozen Master unchanged.

Expected benefit from measured data:
- remove ~8.93 s of unnecessary broad overhead,
- preserve 2 real board wins and 4 early-equivalent wins,
- keep 0 correctness/remnant regressions,
- likely turn aggregate economics positive without changing pattern geometry.
