# Rust legacy generator — certification checkpoint

Date: 2026-09-18

Branch under certification: `optimizer-rust-legacy-stable-20260918`  
Frozen implementation commit: `23c70e08b7ca1760b59399b4d89028958c5c6744`

## Status

This checkpoint certifies the **frozen stable Rust implementation**, not the later cache-parity experiment on `feature/optimizer-rust-legacy-pattern-generator`.

Current per-case evidence has been deduplicated so that a successful retry wins over a failed attempt for the same physical XML.

### Scored cohort

- Master-active cohort target: 323 real orders.
- Unique orders observed so far: 142.
- Successfully scored: **130**.
- Unscored operational cases: **12**.
- Board-count regressions among scored cases: **0**.
- Cases with invalid Rust physical patterns: **0**.
- Invalid Rust materializations: **0**.
- Cases where Rust is slower in CPU time: **2 / 130**.

The percentile method is Type-7 linear interpolation, equivalent to the usual NumPy/R default formulation over the **per-order measurements**.

## Per-case CPU latency

| Percentile | Legacy JS | Rust |
|---|---:|---:|
| p50 | 4,458.610 ms | 2,393.562 ms |
| p90 | 22,260.422 ms | 8,609.779 ms |
| p95 | 26,366.385 ms | 11,537.914 ms |
| p99 | 36,039.377 ms | 13,000.041 ms |

## Per-case wall latency

| Percentile | Legacy JS | Rust |
|---|---:|---:|
| p50 | 9,432.252 ms | 4,971.122 ms |
| p90 | 40,094.836 ms | 19,085.555 ms |
| p95 | 52,078.636 ms | 24,487.191 ms |
| p99 | 83,519.734 ms | 27,453.450 ms |

## Per-case speedup distribution

| Percentile | Legacy CPU / Rust CPU |
|---|---:|
| p50 | 1.917× |
| p90 | 3.055× |
| p95 | 3.553× |
| p99 | 4.505× |

Aggregate CPU across the 130 scored orders is **2.252×** faster in Rust. Aggregate wall time is **2.121×** faster.

## Winner gate

The isolated promotion gate currently confirms:

- `4050594`: legacy 7 boards, Rust 7; valid; CPU speedup ~2.081×.
- `4056900`: legacy 6 boards, Rust 6; valid; CPU speedup ~2.067×.
- `4057401`: legacy 4 boards, Rust 4; valid; CPU speedup ~1.411×.
- `4059200`: legacy 17 boards, Rust 17; valid; equal remnant quality; CPU speedup ~1.470×.

All **4/4 Master winners** are now green on board count and industrial validity. This checkpoint is still **not yet production-promoted** because the p50/p90/p95/p99 figures above are validated for the 130 scored cases, not the final 323-case distribution. The remaining cases must still be classified before calling these the final production percentiles.

## Reproduction

Run:

```bash
node research/optimizer/pattern-generators/rust/report-master-active-percentiles.mjs results.jsonl
```

The reporter computes percentiles from one successful result per physical order and explicitly reports unscored cases, regressions, invalid outputs and slower Rust cases.
