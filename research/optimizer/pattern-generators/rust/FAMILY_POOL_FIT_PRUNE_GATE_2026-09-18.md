# Rust family-pool index / monotonic fit prune gate — 2026-09-18

## Decision

**REJECTED for promotion.**

Both variants preserve exact physical output in the tested A/B, but neither produces enough latency improvement to justify complexity.

Source baseline: `425ebba5de48eb0105d5cb46b08594b3dc50ff49`.

## A/B cohort

Four frozen winner fixtures (4050594, 4056900, 4057401, 4059200), four deterministic orderings each, ten alternating repeats per workload: **160 samples**.

All variants had exact output parity.

## Variant A — incremental family pool index

Instead of rebuilding count-per-signature and first representative by scanning the active piece Vec at every free position, keep that state incrementally.

Result:
- wall total reduction: ~1.13%
- wall p95: 2.533 ms -> 2.719 ms (worse)
- wall p99: 3.753 ms -> 3.656 ms
- CPU total reduction: ~3.40%
- CPU p95: 2.701 ms -> 3.155 ms (worse)

Insufficient / mixed result. Not promoted.

## Variant B — exact monotonic family-fit pruning

Within one fill region, perpendicular space is constant and remaining advance only decreases. Therefore, if a family has no legal orientation at a position it cannot become legal later in the same row/column. The implementation blocks that family for the rest of the fill region.

Correctness: exact output parity.

Result against frozen legacy:
- wall total: 234.551 ms -> 238.781 ms = **1.80% slower**
- wall p50: 1.573 ms -> 0.925 ms
- wall p95: 2.533 ms -> 2.879 ms (worse)
- wall p99: 3.753 ms -> 4.480 ms (worse)
- CPU total: 264.673 ms -> 261.101 ms = 1.35% reduction
- CPU p95: 2.701 ms -> 5.012 ms (worse)

The prune is mathematically valid but does not improve the relevant latency distribution in this implementation.

## Closure

Do not merge either optimization into the frozen worker. Keep the branch as research evidence only.

The next performance experiment moves one level up: Progressive Pattern Master, where complete pattern-generation rounds can potentially be skipped once the coverage solver reaches a certified lower bound.
