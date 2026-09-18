# Rust Legacy Pattern Generator — Certification Final

Date: 2026-09-18

Frozen implementation:
- branch: `optimizer-rust-legacy-stable-20260918`
- commit: `23c70e08b7ca1760b59399b4d89028958c5c6744`

Certification branch:
- `optimizer-rust-legacy-certification-20260918`

## Decision

**Status: CANDIDATE FOR FEATURE-FLAGGED INTEGRATION. NOT PRODUCTION DEFAULT.**

The Rust implementation is stable enough to be integrated behind an opt-in feature flag with a mandatory JavaScript fallback. Production behavior must remain unchanged while the flag is off.

## Final Rust-only performance coverage

The production-equivalent Pattern Master generation path was measured with 40 rounds for all **323/323 historical Master-active real orders**.

All 323 cases produced a valid Rust timing result.

### CPU latency — Rust, 323/323 cases

| Percentile | Rust CPU |
|---|---:|
| p50 | 6,728.741 ms |
| p90 | 29,051.075 ms |
| p95 | 35,433.978 ms |
| p99 | 48,731.090 ms |

### Wall latency — Rust, 323/323 cases

| Percentile | Rust wall |
|---|---:|
| p50 | 8,548.092 ms |
| p90 | 36,079.852 ms |
| p95 | 42,447.869 ms |
| p99 | 61,030.731 ms |

These are the final Rust-only latency percentiles for the complete 323-case Master-active cohort.

## Paired JS vs Rust quality/performance gate

A fully paired gate — legacy generator, Rust generator, coverage solving, materialization and industrial validation — completed on **159 real Master-active orders**.

Results:

- board-count regressions: **0 / 159**
- invalid Rust materializations: **0 / 159**
- Rust slower in CPU: **4 / 159**

### CPU latency — paired cohort (n=159)

| Percentile | Legacy JS | Rust |
|---|---:|---:|
| p50 | 6,965.083 ms | 4,500.688 ms |
| p90 | 27,382.189 ms | 15,530.802 ms |
| p95 | 39,523.895 ms | 18,205.273 ms |
| p99 | 56,119.342 ms | 28,345.700 ms |

### Wall latency — paired cohort (n=159)

| Percentile | Legacy JS | Rust |
|---|---:|---:|
| p50 | 9,616.464 ms | 5,878.804 ms |
| p90 | 37,111.582 ms | 21,142.009 ms |
| p95 | 56,773.271 ms | 26,445.427 ms |
| p99 | 72,132.018 ms | 36,678.503 ms |

### Per-case CPU speedup — paired cohort

| Percentile | Legacy / Rust |
|---|---:|
| p50 | 1.677× |
| p90 | 2.873× |
| p95 | 3.376× |
| p99 | 4.879× |

Aggregate speedup across the paired cohort:
- CPU: **1.912×**
- wall: **1.926×**

## Mandatory Master winner gate

All historical Master winners that can change the final board count are green:

| Order | Pre-Master | Expected | Rust | Valid |
|---|---:|---:|---:|---|
| 4050594 | 8 | 7 | 7 | PASS |
| 4056900 | 7 | 6 | 6 | PASS |
| 4057401 | 5 | 4 | 4 | PASS |
| 4059200 | 18 | 17 | 17 | PASS |

The isolated 4059200 Rust-only quality gate generated 152 patterns, solved 18→17 boards, materialized successfully and passed industrial validation.

## Why 159 paired cases are sufficient for candidate status but not production default

The Rust generator is being considered only as a replacement for Pattern Master generation. V10 preserves the incumbent unless Master produces a strictly better valid board count.

Therefore:
- a non-winning Master case cannot worsen the final board count merely because the Rust pool differs;
- all known historical cases where Master actually saves a board have been explicitly validated;
- a Rust exception or unavailable native addon must fall back to the existing JS generator.

The remaining unpaired Master-active cases still matter for production confidence and shadow telemetry, but they are not a reason to block a **flag-off-by-default** integration.

## Promotion contract

Integration may proceed only with:

1. feature flag default OFF;
2. native addon availability check;
3. try/catch around Rust generation;
4. automatic JS fallback on any Rust exception, invalid pool or unavailable addon;
5. optional shadow comparison telemetry before enabling Rust as primary;
6. no change to V10 acceptance logic, coverage solver, materializer or industrial validator.

Status after this gate:

**RUST LEGACY GENERATOR CANDIDATE / FEATURE-FLAG INTEGRATION ALLOWED / PRODUCTION DEFAULT NOT ALLOWED YET.**
