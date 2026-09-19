# Rust Greedy → Beam Reuse Gate — 2026-09-18

Status: **DEFER / do not promote**

Branch: `experiment/optimizer-rust-greedy-beam-reuse`  
PR: #25  
Validated implementation: lazy native cache.

## Safety

- Exact physical-plan parity passed for 4056900 and 4057401.
- Master40 pool parity passed for 4052960 and 4050167.
- Rust workflow #55 passed all tests/build.
- Feature remains OFF by default.

## Wall-time

### Direct hybrid

| Order | Baseline | Reuse | Saving |
| --- | ---: | ---: | ---: |
| 4056900 | 464.669 ms | 459.283 ms | 1.16% |
| 4057401 | 104.722 ms | 101.045 ms | 3.51% |

### Master40 real tails

| Order | Pieces / types | Baseline | Reuse | Saving |
| --- | --- | ---: | ---: | ---: |
| 4052960 | 114 / 76 | 15.108 s | 14.869 s | 1.58% |
| 4050167 | 89 / 32 | 9.874 s | 9.633 s | 2.43% |

Telemetry confirms real avoided work:
- 4052960: 161 reused batches / 18,299 avoided pack requests.
- 4050167: 175 reused batches / 21,021 avoided pack requests.

## Decision

The reuse is semantically safe but the hit rate is too low to justify the extra native cache lifecycle and complexity now. It can help p95 slightly, but it cannot affect p99 because the p99 cases are above the Beam piece ceiling.

Keep the experiment as a reference implementation; do not promote while larger exact optimizations remain available.
