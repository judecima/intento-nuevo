# Motor V2 — Master Structural Short-Circuit Serial Performance PASS — 2026-09-23

Status: **PASS / VALID RESEARCH MILESTONE / NOT YET PROMOTED TO motor-beta-v1**

Frozen reference:
- branch: `motor-beta-v1`
- commit: `07428bad8b1a4670c92ca0919fad32d3f487d63f`

Research branch:
- `research/motor-v2-structural-20260922`

Candidate head used by the serial gate:
- `5299c3ae22d3ec44a41e62b34c133918020a444b`

Workflow:
- `Optimizer Motor V2 Master Structural Serial Perf`
- run: **35860838472**
- result: **SUCCESS**

## Architecture

The repetition-aware structural rescue is no longer a broad pre-V10 stage.

It is evaluated only from the Master path and:
- uses one bounded physical probe,
- short-circuits legacy Master only when a valid structural solution reaches the safe lower bound,
- otherwise frozen Master remains the fallback.

Cheap applicability refinement:
- logical type count: 2..3
- existing piece-count sync envelope preserved
- quantity repetition required
- `gcd(quantity) >= 3`

The GCD>=3 filter is a work-avoidance gate only. It cannot make the frozen result worse because rejected cases execute beta unchanged.

## Serial alternating A/B gate

Protected target population:
- 18 repeated-demand cases previously used to diagnose the Master route.

Measurement:
- four repetitions per case,
- alternating execution order route/beta and beta/route,
- per-case median used for aggregate timing.

### Safety / quality

- target cases: **18**
- structural affected after GCD gate: **10**
- short-circuits: **5**
- invalid Motor V2 plans: **0**
- invalid beta plans: **0**
- board regressions: **0**
- equal-board remnant regressions: **0**
- equal-board remnant equal: **8**
- board wins: **2**
- total boards saved vs beta: **16**

Board wins:
- `5432432`: beta 4 -> Motor V2 **3**, Lepton 3
- `5504203`: beta 90 -> Motor V2 **75**, Lepton 75

### Performance

Affected-case median totals:
- Motor V2: **22,087.871 ms**
- frozen beta: **22,608.083 ms**
- net saving: **520.213 ms**
- saving: **2.3010%**
- speedup: **1.02355x**

Percentiles over affected-case medians:
- p50: **1966.26 ms** vs beta **2245.77 ms**
- p95: **3935.53 ms** vs beta **3789.72 ms**
- p99: **3948.35 ms** vs beta **3810.93 ms**

So aggregate and p50 improve; p95/p99 remain slightly worse on this small affected cohort and remain a future performance-hardening target.

### Useful short-circuit examples

`5432432`:
- 4 -> **3**
- median 526.98 ms vs beta 743.96 ms
- ~29.2% faster

`5441129`:
- same final 10 boards
- median 1378.02 ms vs beta 1631.39 ms
- ~15.5% faster

`5447933`:
- same final 10 boards
- median 2233.72 ms vs beta 2875.52 ms
- ~22.3% faster

`5504203`:
- 90 -> **75**
- median 2787.84 ms vs beta 2805.84 ms
- ~0.6% faster in this serial run
- quality gain remains 15 boards

## Why GCD>=3 was added

Before this work-avoidance gate the same serial A/B had:
- 17 affected cases,
- same 2 board wins / 16 boards saved,
- 0 invalids / 0 board loss / 0 remnant regression,
- but aggregate timing was **0.0522% slower** than beta.

The GCD=2 cases produced no one-probe structural certifications in the protected cohorts and only added probe cost.

After skipping them:
- affected cases: 17 -> **10**
- quality wins preserved: **2/2**
- saved boards preserved: **16**
- economy: -0.0522% -> **+2.3010%**

## Decision

This is the first Motor V2 structural route to pass simultaneously on the serial protected population:

1. fewer/equal boards only,
2. zero equal-board remnant regressions,
3. zero invalid plans,
4. positive aggregate runtime economics.

This qualifies as the next valid Motor V2 milestone.

It is **not yet promoted to motor-beta-v1**. The remaining promotion gate is the broad holdout run with this exact frozen candidate. No further tuning should be done before recording that broad result.
