# MOTOR BETA V2 — RUNTIME PROMOTION — 2026-09-23

Status: **BETA V2 RUNTIME CERTIFIED**

Frozen predecessor:
- `motor-beta-v1 @ 07428bad8b1a4670c92ca0919fad32d3f487d63f`

Candidate lineage:
- `motor-beta-v2-candidate @ 9bfbc820cad92e929d47f7e7a5d532f0993b4699`
- runtime integration branch: `feature/motor-beta-v2-runtime-20260923`

## Protected validation population

Three independent valid populations were used:

- historical canonical: **20,842 valid**
- prior sealed external holdout: **13,839 valid**
- new sealed holdout v2: **15,784 valid**

Total protected valid cases: **50,465**

Motor V2 can differ from V1 only inside the narrow repeated-demand structural envelope.
Eligible cases across those populations:

- historical: 348
- prior sealed holdout: 278
- new holdout v2: 347
- total potentially different: **973**

Across the protected V1/V2 gates:
- invalid accepted plans: **0**
- board regressions: **0**
- equal-board remnant regressions: **0**

The new holdout contributes the strict V2 board wins:
- `5432432`: **4 -> 3**
- `5504203`: **90 -> 75**

Total strict saving vs V1 on that protected holdout: **16 boards**.

Historical and prior sealed holdout populations were neutral vs V1 inside the V2 envelope, with zero quality regressions.

## Production runtime integration

V2 is no longer implemented through a research monkeypatch.

Production files:
- `src/lib/optimizer/experimental/structural-repetition-rescue-v2.cjs`
- `src/lib/optimizer/legacy/rust/incremental-master.cjs`
- `src/lib/optimizer/engine/legacy-engine.ts`

Concurrency contract:
- structural state is local to each incremental Master generator instance
- no global active request state
- V1 and V2 can coexist in the same process
- cache keys include motor version
- algorithmVersion identifies V2
- runtime selector: `optimizeProject(input, { motorVersion: "v1" | "v2" })`
- environment selector: `OPTIMIZER_MOTOR_VERSION=v2`
- default remains V1 unless V2 is explicitly selected, preserving rollback safety

V2 defaults to the certified Rust-backed stack when selected.

## Production runtime CI

Workflow:
- `Optimizer Motor Beta V2 Production Runtime Gate`
- run: **35875281041**
- head: `8c0c28c352d2e3968c8df89bdc547dac7d2a4517`
- conclusion: **SUCCESS**

Runtime contract:
- TypeScript typecheck: PASS
- facade V2 sentinel test: PASS
- V1/V2 cache isolation: PASS
- `optimizeProject(..., { motorVersion:"v2" })` returns the certified 75-board plan for 5504203

Broad production parity on new holdout V2 envelope:
- cases: **347**
- valid: **347**
- invalid: **0**
- board wins: **2**
- board losses: **0**
- boards saved: **16**
- equal-board remnant worse: **0**
- equal-board remnant equal: **345**

Wins:
- 5432432: V1 4 -> V2 **3**, Lepton 3
- 5504203: V1 90 -> V2 **75**, Lepton 75

One-shot sharded wall timing:
- V1 total: 102,206.007 ms
- V2 total: 102,498.605 ms
- delta: **-0.2863%**
- p50: **123.15 -> 114.01 ms**
- p95: 1114.42 -> 1130.65 ms
- p99: 2313.76 -> 2382.48 ms

This one-shot broad timing remains near-neutral and order/runner sensitive.

The controlled serial alternating A/B gate remains the promotion performance reference:
- V2: 22,087.871 ms
- V1: 22,608.083 ms
- saving: **+2.3010%**
- 0 invalids
- 0 board regressions
- 0 remnant regressions
- same 16 boards saved

## Architecture

V2 is a conservative Master short-circuit:

1. frozen V10 path remains the fallback
2. only 2–3 logical types in the synchronous envelope are considered
3. quantity repetition requires GCD >= 3
4. one bounded structural physical probe is attempted
5. only a valid candidate reaching the safe lower bound can short-circuit Master
6. otherwise the frozen Master path executes unchanged

The structural route never fixes a kit layout and never forces replication.
It generates physical mixed usage patterns and the exact coverage solver remains free to combine patterns globally.

## Objective contract

1. fewer boards always wins
2. at equal boards, worse official full-plan remnant is never accepted
3. industrial validator must pass
4. failure/miss falls back to V1 behavior

## Decision

The production runtime implementation reproduces the certified research candidate and passes the protected quality gates.

This commit is suitable to freeze as `motor-beta-v2`.

Remaining work before broad SaaS production:
- authoritative grain/canRotate validation outside project-XML limitations
- production observability / reproducibility
- hard latency budgets and effort controller
- progressive Auto mode over Fast / V10 / V10+Lepton / Advanced

Do not mutate `motor-beta-v2` directly. Future behavior changes should branch from it.
