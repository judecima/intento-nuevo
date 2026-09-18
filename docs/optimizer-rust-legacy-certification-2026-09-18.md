# Rust legacy generator — certification checkpoint

Date: 2026-09-18

Branch under certification: `optimizer-rust-legacy-stable-20260918`  
Frozen implementation commit: `23c70e08b7ca1760b59399b4d89028958c5c6744`

## Status

This checkpoint certifies the **frozen stable Rust implementation**, not the later cache-parity experiment on `feature/optimizer-rust-legacy-pattern-generator`.

Current per-case evidence has been deduplicated so that a successful retry wins over a failed attempt for the same physical XML.

### Scored cohort

- Master-active cohort target: 323 real orders.
- Unique orders observed so far: 141.
- Successfully scored: **129**.
- Unscored operational cases: **12**.
- Board-count regressions among scored cases: **0**.
- Cases with invalid Rust physical patterns: **0**.
- Invalid Rust materializations: **0**.
- Cases where Rust is slower in CPU time: **2 / 129**.

The percentile method is Type-7 linear interpolation, equivalent to the usual NumPy/R default formulation over the **per-order measurements**.

## Per-case CPU latency

| Percentile | Legacy JS | Rust |
|---|---:|---:|
| p50 | 4,262.196 ms | 2,387.492 ms |
| p90 | 22,343.883 ms | 8,516.318 ms |
| p95 | 26,376.059 ms | 10,764.092 ms |
| p99 | 36,054.395 ms | 12,846.658 ms |

## Per-case wall latency

| Percentile | Legacy JS | Rust |
|---|---:|---:|
| p50 | 9,298.388 ms | 4,852.608 ms |
| p90 | 40,146.287 ms | 19,131.620 ms |
| p95 | 52,195.604 ms | 24,546.445 ms |
| p99 | 83,695.731 ms | 27,464.532 ms |

## Per-case speedup distribution

| Percentile | Legacy CPU / Rust CPU |
|---|---:|
| p50 | 1.920× |
| p90 | 3.059× |
| p95 | 3.553× |
| p99 | 4.513× |

Aggregate CPU across the 129 scored orders is **2.274×** faster in Rust. Aggregate wall time is **2.131×** faster.

## Winner gate

The isolated promotion gate currently confirms:

- `4050594`: legacy 7 boards, Rust 7; valid; CPU speedup ~2.081×.
- `4056900`: legacy 6 boards, Rust 6; valid; CPU speedup ~2.067×.
- `4057401`: legacy 4 boards, Rust 4; valid; CPU speedup ~1.411×.
- `4059200`: still unscored in the current balanced/40-round gate because it is an extreme heavy-tail case.

Therefore this checkpoint is **not yet production-promoted**. The p50/p90/p95/p99 figures above are validated for the 129 scored cases, but must not be represented as the final 323-case distribution until the remaining orders are classified.

## Reproduction

Run:

```bash
node research/optimizer/pattern-generators/rust/report-master-active-percentiles.mjs results.jsonl
```

The reporter computes percentiles from one successful result per physical order and explicitly reports unscored cases, regressions, invalid outputs and slower Rust cases.
