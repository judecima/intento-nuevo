# Master40 Rust Context (large-only) — REJECTED

Date: 2026-09-21

## Decision

**REJECT as a performance optimization.**

The experiment moved the full 40-round scheduler for large greedy-only Master cases into one Rust call, preserving:
- all 40 rounds;
- the exact round schedule;
- seeds;
- per-round subset expansion;
- greedy pass/stage selection;
- pattern harvesting;
- final usage-vector dedup.

The JS implementation remained the oracle.

## Workflow

Run: 35553386710

Result: success.

## Correctness

All three directed cases were truly eligible for the Rust-resident context:

- 4048571: 40/40 rounds executed in Rust, 0 failed rounds
- 4059795: 40/40 rounds executed in Rust, 0 failed rounds
- 4059352: 40/40 rounds executed in Rust, 0 failed rounds

Pool parity:

- 4048571: 2046 patterns, identical digest
- 4059795: 1032 patterns, identical digest
- 4059352: 660 patterns, identical digest
- overall: **3/3 exact pool parity**

## Performance

| Case | Control | Rust Master40 Context | Improvement |
|---|---:|---:|---:|
| 4048571 | 22,158.40 ms | 21,901.47 ms | **1.16%** |
| 4059795 | 8,508.04 ms | 8,503.16 ms | **0.06%** |
| 4059352 | 7,129.97 ms | 7,123.01 ms | **0.10%** |

Aggregate:

- control: 37,796.41 ms
- candidate: 37,527.64 ms
- improvement: **0.71%**

## Conclusion

Once Rank Cache, Lean Beam, Whole Greedy Rust, and Native Large Round are already active, the remaining JS↔Rust transition **between Master rounds is not a material bottleneck**.

The cost is now overwhelmingly inside the Rust packing work itself.

Therefore:

- do not continue porting scheduler/dedup merely to remove round-level JS↔Rust calls;
- do not spend more time trying to make Master40 a single call for performance alone;
- keep the existing JS scheduler as the simpler orchestration layer unless future architectural reasons justify moving it.

## Next target

Profile and reduce work **inside Rust pack_request / candidate construction** while preserving:
- 40 rounds;
- exact candidate semantics;
- exact pattern pool.

The strongest remaining performance target is the native packing kernel itself, especially on very large orders such as 4048571 and 4059795.
