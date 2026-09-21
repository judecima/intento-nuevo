# Master P9 staged — provenance-derived checkpoint (2026-09-21)

Branch: `research/master-p9-staged-20260921`

## Why P9 exists

The prior P15 early-stop experiment preserved board count but lost remnant quality on 4056900.
A full40 provenance run then traced the actual rounds used by the three historical gap=1 Master winners:

- 4050594 used rounds 0, 5, 22; round 0 was board-essential in leave-one-round-out.
- 4056900 used rounds 0, 1, 17, 20, 36; rounds 20 and 36 were remnant-sensitive.
- 4057401 used rounds 0, 2, 6; all three were board-essential.

The union is therefore:

```
P9 = [0, 1, 2, 5, 6, 17, 20, 22, 36]
```

This set is learned from full40 provenance, not from arbitrary threshold search.

## Safe staged policy

For Gate V2 survivors with `gap == 1`:

1. Execute P9 first through the incremental Rust Master generator.
2. Solve on P9.
3. If a valid plan reaches the lower bound, stop.
4. Otherwise execute only the 31 missing rounds, reusing the same generator state, then run the normal full solve.

The fallback reproduces the full40 search space; misses only pay the extra early solve.

## 16-case A/B

Exact historical-parity cases: 16.

Quality:
- board parity: 16/16
- remnant quality not worse: 16/16
- historical Master winners present: 4050594, 4056900, 4057401
- winners stopped early: 3/3
- regressions: 0

Timing:
- baseline Master work: 56,087.16 ms
- P9 staged: 45,873.97 ms
- saved: 10,213.18 ms
- reduction: 18.21%

The 13 non-winners all fell back to full40. Their early P9 solve overhead was tiny (roughly 0.02–11.15 ms in this run), so misses did not materially add cost.

## Winner-only timing

On the three historical gap=1 winners:

- baseline Master work: 14,422.88 ms
- P9 staged: 4,097.72 ms
- saved: 10,325.16 ms
- reduction: 71.59%

Per winner:
- 4050594: 7,967.04 -> 1,740.47 ms, -78.15%
- 4056900: 4,671.88 -> 1,648.50 ms, -64.71%
- 4057401: 1,783.96 -> 708.75 ms, -60.27%

Critically, 4056900 now preserves remnant quality, unlike the rejected P15 early-stop.

## Decision

P9 staged is a real candidate improvement for the `gap == 1` Master path:
- provenance-derived,
- incremental,
- exact full40 fallback,
- 0 board regressions in the tested set,
- 0 remnant regressions in the tested set,
- 18.21% measured Master-work reduction across the 16-case A/B,
- 71.59% reduction on the three cases where early termination is actually possible.

Do not generalize P9 to `gap > 1`: reaching a one-board improvement there does not certify optimality.
