# MOTOR BETA V2 CANDIDATE — FREEZE GATE — 2026-09-23

Status: **CANDIDATE FROZEN / NOT PROMOTED TO PRODUCTION**

Reference:
- `motor-beta-v1 @ 07428bad8b1a4670c92ca0919fad32d3f487d63f`

Research source:
- `research/motor-v2-structural-20260922`

## Candidate architecture

The V2 structural route is a conservative Master short-circuit:

1. frozen V10 path remains the universal fallback
2. only repeated 2–3 type demand inside the synchronous envelope is considered
3. quantity repetition gate requires `gcd(quantity) >= 3`
4. only one bounded physical structural probe is attempted
5. short-circuit is allowed only when the candidate is industrially valid and reaches the safe lower bound
6. otherwise frozen Master executes unchanged

Board-count objective remains lexicographically dominant.
Equal-board remnant quality is never allowed to regress.

## Broad safety / quality gate

Workflow:
- `Optimizer Motor V2 Master Structural Short Circuit Broad`
- run: **35860838473**
- head: `5299c3ae22d3ec44a41e62b34c133918020a444b`

Population:
- **347** eligible holdout cases

Result:
- structural attempts: **10**
- short-circuits: **5**
- invalid Motor V2 plans: **0**
- invalid beta plans: **0**
- board regressions: **0**
- equal-board remnant regressions: **0**
- board wins: **2**
- total boards saved: **16**
- equal-board remnant equal: **345**

Wins:
- `5432432`: beta 4 -> V2 **3**, Lepton 3
- `5504203`: beta 90 -> V2 **75**, Lepton 75

Lepton classification:
- better: 17
- equal: 329
- worse: 1

This gate therefore PASSES safety and board/remnant quality.

### Broad timing caveat

The sharded one-shot broad run reports:
- V2 total: 103,391.997 ms
- beta total: 95,890.378 ms
- raw delta: **-7.823%**

This timing is NOT the promotion timing metric because each case is executed once in fixed route-first order and the 32 shards run on independent GitHub runners. It is retained as a conservative cold/order-sensitive observation.

## Serial alternating A/B performance gate

Workflow:
- `Optimizer Motor V2 Master Structural Serial Perf`
- run: **35860838472**
- candidate head: `5299c3ae22d3ec44a41e62b34c133918020a444b`
- result: **SUCCESS**

Method:
- 18 protected repeated-demand cases
- route/beta execution order alternated
- 4 repetitions per case
- per-case medians compared

After the GCD>=3 work-avoidance gate:
- affected cases: **10**
- short-circuits: **5**
- invalid plans: **0**
- board regressions: **0**
- remnant regressions: **0**
- board wins: **2**
- boards saved: **16**

Timing:
- V2 aggregate median total: **22,087.871 ms**
- beta aggregate median total: **22,608.083 ms**
- net saving: **520.213 ms**
- saving: **2.3010%**
- speedup: **1.02355x**

p50:
- V2: **1966.26 ms**
- beta: **2245.77 ms**

p95/p99 remain slightly worse on this small affected cohort and remain hardening targets.

## Critical repeated-batch sentinel

`5504203`
- beta: **90**
- V2: **75**
- Lepton: **75**
- safe LB: **75**
- board saving: **15**
- industrial validation: PASS

The improvement is generated through mixed physical usage patterns and exact coverage; no fixed-kit replication is imposed.

## Candidate decision

The V2 structural route has now demonstrated:

- broad safety: PASS
- broad board quality: PASS
- broad remnant non-regression: PASS
- protected serial performance: PASS
- 0 invalid accepted plans
- 0 board regressions
- 0 equal-board remnant regressions
- 16 boards saved on the protected holdout

This qualifies for a frozen `motor-beta-v2-candidate` branch.

It is NOT yet production-promoted.

Next promotion gate:
1. compare V1 vs V2 candidate on the full protected historical corpus,
2. preserve zero correctness/remnant regressions,
3. confirm wins remain,
4. measure production-representative p50/p95/p99,
5. then decide whether V2 becomes the default beta runtime.
