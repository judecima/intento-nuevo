# Incremental Rust pool index gate — 2026-09-18

## Status

**PROMOTABLE EXPERIMENTAL CANDIDATE.**

This change is still isolated from production. It is stacked on top of the post-compact FS0/u_k lower-bound experiment.

Branch:

`experiment/optimizer-rust-incremental-pool-index`

Final implementation commit before this report:

`17e64a6c583da6754f5e5aba25d6af34e3442c2b`

CI-only validation branch:

`experiment/optimizer-rust-incremental-pool-index-gate-run`

Green workflow:

- PR #24
- Optimizer Rust Pattern Generator
- run `35412848263`
- run number `30`
- all steps green: cargo tests, native build, Rust generator tests, legacy packer/hybrid tests, worker routing, 4057401 benchmark, typecheck, full test suite, Next build.

## Problem

The legacy Rust packer rebuilt signature counts and first representatives by scanning the complete remaining piece pool on every placement.

For repeated-piece orders this makes candidate selection pay O(remaining pieces) before it can even evaluate the much smaller signature frontier.

Examples on the first board:

- `4048571`: 2,439 pieces, 69 physical signatures. The legacy representative rebuild scans about 1.19M pool entries across one request batch. Piece/signature ratio: ~35.3.
- `4059795`: 950 pieces, 50 signatures. Piece/signature ratio: ~19.0.

## Implementation

`Scratch` now has two exact execution paths selected once per pack state:

```text
pool.len() > 4 * signature_count
        |
        +-- yes -> incremental counts + first representative index
        |
        +-- no  -> legacy full scan
```

The indexed path:

1. initializes signature counts and the first pool index for every signature once;
2. preserves the original Vec order;
3. after removing the selected representative, decrements only affected indices;
4. finds the next representative of the removed signature;
5. sorts representative indices before candidate evaluation, preserving the exact order produced by the legacy pool scan.

The low-repetition path executes the original scan and original `Vec::remove` behavior, avoiding index-maintenance overhead where the index does not pay for itself.

No criteria, request order, RNG seed, stage policy, beam policy, materialization, remnant scoring or coverage logic changes.

## Residual domain after post-compact + FS0/u_k

Master-active corpus: 323.

After lower-bound certification, residual cases with more than four types:

- 176 cases.
- Historical generation: 4,411,859 ms.
- 54/176 satisfy the incremental-index condition.
- Those 54 cases contain ~44.0% of the historical residual generation cost.

This is important because the policy is structural rather than order-specific: it activates on repeated physical signatures, not a whitelist.

## Physical parity gate

Round 0 was replayed old vs final native addon on all 176 residual >4-type cases.

Result:

```text
176 / 176 exact physical parity
0 errors
0 mismatches
```

The comparison includes:

- board count;
- placed piece ids and refs;
- x/y/base/height/rotation/level;
- cuts;
- remnants;
- complete cut tree.

Selected cases were also compared independently and were byte-for-byte equal after normalization:

- 4048571
- 4059795
- 4056565
- 4058921
- 4056900
- 4057401
- 4059200

## Measured performance — all 176 residual cases, round 0

### Indexed domain

54 cases:

```text
legacy total   21,742.0 ms
candidate      18,595.9 ms
gain              -14.47%
```

### Non-indexed domain

122 cases:

```text
legacy total   36,809.5 ms
candidate      37,108.4 ms
delta               +0.81%
```

The non-indexed delta is small enough to treat as benchmark noise for now; the code executes the legacy representative scan in this domain.

### Whole residual cohort — measured round 0

```text
legacy total   58,551.6 ms
candidate      55,704.3 ms
gain               -4.86%

p50   249.29 -> 249.61 ms
p90   610.98 -> 630.56 ms
p95   679.84 -> 692.20 ms
p99  1488.47 -> 844.88 ms
max  4416.94 -> 2637.63 ms
```

The optimization is intentionally tail-focused. It does not materially move p50/p95 in a single-round replay, but it cuts the measured p99 by ~43% because the two dominant repeated-piece tails enter the indexed path.

## Tail A/B

Repeated round-0 runs:

### 4048571

```text
legacy:    4166 / 4269 ms
candidate: 2431 / 2305 ms
```

Approximately 43–46% faster, with identical 112 boards and 102 deduplicated patterns for the round.

### 4059795

```text
legacy:    1410 / 1310 ms
candidate: 788 / 787 ms
```

Approximately 40–44% faster, with identical 63 boards and 51 deduplicated patterns.

## Multi-round checks

Rounds `0,1,2`:

```text
4048571   6377.23 -> 3747.07 ms   -41.24%
4059795   2242.78 -> 1385.45 ms   -38.23%
```

Rounds `10,20,30,39`:

```text
4048571   5722.21 -> 3227.87 ms   -43.59%
4059795   1827.68 -> 1185.58 ms   -35.13%
```

Board and pattern counts were identical in each comparison.

This reduces the risk that the speedup is specific to the all-types first round.

## Historical-tail projection

This section is a projection, not a full-40 replay of all 176 cases.

Residual >4-type historical generation before this change:

```text
total  4,411,859 ms
p50       15,929 ms
p90       55,996 ms
p95       74,272 ms
p99      134,731 ms
max      462,825 ms
```

A conservative projection that applies only the measured multi-round gains of the two dominant tails and assumes **zero gain everywhere else** gives:

```text
total  4,169,473 ms   (-5.49%)
p95       74,272 ms   unchanged
p99       88,148 ms   (-34.6%)
max      271,942 ms   (-41.2%)
```

A broader projection that applies each indexed case's measured round-0 gain, clamps regressions to zero and leaves every non-indexed case unchanged gives:

```text
total  4,093,647 ms   (-7.21%)
p50       15,408 ms
p90       54,904 ms
p95       72,228 ms
p99       88,148 ms
max      276,381 ms
```

Do not treat the broader numbers as certified full-40 timings; the conservative top-two projection is the safer planning number until a full replay is completed.

## Safety tests added

Rust unit coverage now explicitly exercises both paths:

- a low-repetition pool that must use the legacy scan;
- a high-repetition pool that must use the incremental index;
- after repeated removals, incremental counts and representative indices are compared with a fresh full rescan.

## Decision

Keep the implementation.

It is an exact internal acceleration with strong physical parity evidence and a large tail benefit. It should remain isolated from production until the stacked optimizer branch is promoted as a whole.

The next performance target should not be another mask-level portfolio. The remaining cost is inside repeated executions of pack requests / board states after representative rebuilding has been reduced.
