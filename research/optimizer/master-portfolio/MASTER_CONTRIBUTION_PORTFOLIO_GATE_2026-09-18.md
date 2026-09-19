# Master Contribution Portfolio Gate — 2026-09-18

## Scope

Research-only evaluation of the Master contribution/provenance idea over the frozen 323 Master-active cohort. No production promotion is implied by this document.

## Frozen cohort

Source: `experiencia/v7/all20.jsonl`

- Master-active cases: **323**
- Current real board winners: **4**
  - `4050594`: 8 -> 7
  - `4056900`: 7 -> 6
  - `4057401`: 5 -> 4
  - `4059200`: 18 -> 17

The pre-Master incumbent minus lower-bound distribution is:

| gap | cases |
|---:|---:|
| 1 | 293 |
| 2 | 19 |
| 3 | 4 |
| 4 | 2 |
| 5 | 3 |
| 6 | 1 |
| 43 | 1 |

The first three winners are all **gap=1**. `4059200` is **gap=5** (`18 -> 17`, lower bound 13).

## Provenance / contribution portfolio

The incremental research branch freezes the following P18 contribution round order:

```text
0, 2, 3, 5, 6, 10, 12, 13, 16,
17, 18, 19, 21, 22, 25, 33, 34, 36
```

This is useful as a contribution portfolio, but it is **not a proof that 18 rounds are globally minimal**.

Local replay confirms the important difficult winner `4059200`:

| mode | generation | solve | boards | quality vs full40 |
|---|---:|---:|---:|---|
| P18 | ~5.09 s | ~20.00 s | 17 | identical |
| full40 | ~11.63 s | ~20.00 s | 17 | reference |

P18 therefore removes more than half of generation for this case while preserving the physical result. However it **cannot safely terminate there**: with lower bound 13, a 17-board incumbent does not prove that rounds omitted from P18 could not produce 16 or fewer boards.

That is the key distinction between a useful contribution portfolio and a safe pruning rule.

## Safe portfolio: prefix7

The branch `experiment/optimizer-master-contribution-portfolio` contains a stricter optimization:

```text
rounds 0..6
    +
monotype
    |
deterministic B&B probe
max 5,000 nodes
    |
    +-- reaches lower bound -> materialize + validate + stop
    |
    +-- otherwise -> generate only rounds 7..39
                    combine with prefix
                    continue normal full Master
```

Activation is deliberately restricted to:

- Rust pattern generator enabled;
- exactly 40 legacy rounds;
- unique-mask experiment disabled;
- `preMasterBoards - lowerBound == 1`;
- feature flag explicitly enabled.

### Certified winners

The existing physical tests certify:

| case | incumbent | LB | prefix7 | fallback |
|---|---:|---:|---:|---|
| 4050594 | 8 | 7 | **7** | no |
| 4056900 | 7 | 6 | **6** | no |
| 4057401 | 5 | 4 | **4** | no |

All three are materialized and industrially validated. Their remnant-quality assertions are preserved.

### Exact fallback contract

The branch also tests:

```text
prefix rounds 0..6
+
remaining rounds 7..39
+
combinarPatrones()
==
direct full40 Rust pool
```

on the physical pattern digest.

Therefore a failed prefix probe does not require re-running its first seven rounds and still reconstructs the full40 pattern contract.

## Partial physical replay

A local replay of the mounted corpus completed **136 / 323** cases before the execution envelope was exhausted.

This run used a temporary 10 ms solve cap only to inspect portfolio behavior quickly; it is **not** the branch's final 5,000-node gate and should not be treated as certification.

Observed on those 136 cases:

- errors: **0**
- expected gap=1 winners encountered: **3**
- winners recovered: **3 / 3**
- unexpected board improvements: **0**
- solve-exhausted probes: 14
- prefix generation p50: ~0.58 s
- prefix generation p90: ~1.81 s
- prefix generation p95: ~2.43 s
- prefix generation p99: ~3.38 s

The exact branch uses a deterministic **5,000-node** budget instead of a wall-clock timeout.

## Impact on the historical 323 tail

Historical Master time over the 323:

| metric | value |
|---|---:|
| total | ~6,633.8 s |
| p50 | ~9.97 s |
| p90 | ~50.89 s |
| p95 | ~70.55 s |
| p99 | ~120.30 s |

Historical full40 pattern generation alone:

| metric | value |
|---|---:|
| total | ~6,116.6 s |
| p50 | ~9.22 s |
| p90 | ~48.47 s |
| p95 | ~63.32 s |
| p99 | ~111.67 s |

The three prefix7 winners historically consumed approximately:

```text
4050594  26.104 s Master
4056900  21.572 s Master
4057401   5.776 s Master
```

Replacing only those three by the measured early path removes roughly **50.5 s** before accounting for probe overhead on fallthrough cases, about **0.76%** of historical aggregate Master time.

More importantly, those winners rank below the historical p90 tail. Consequently:

> **prefix7 is a strong local optimization and a safe reuse mechanism, but it does not solve p95/p99.**

The p95/p99 tail is dominated by non-winning or hard-gap cases, especially expensive generation cases such as `4048571` and `4059795`.

## Decision

### Keep

**Prefix7 staged Master: KEEP as experimental candidate.**

Reasons:

1. catches the three certifiable current winners;
2. stops only when the lower bound proves optimal board count;
3. has a deterministic 5,000-node probe;
4. does not regenerate rounds 0..6 after fallthrough;
5. reconstructs the full40 pool contract on fallback;
6. is OFF by default.

### Do not promote as a global portfolio prune

**P18 contribution portfolio: RESEARCH ONLY.**

It is useful for ordering/generation reuse and reproduces the difficult `4059200` result in local replay, but cannot be used as a global early-stop because that case remains above its lower bound.

## Next tail optimization target

The evidence shifts the next optimization away from selecting a smaller fixed family set.

The high-value target is now:

```text
cheap staged generation
        ↓
cheap proof/probe
        ↓
reuse generated rounds
        ↓
generate next contribution tranche only if needed
        ↓
full40 exact fallback
```

For p95/p99, prioritize the **319 non-winning / non-certifying Master cases**, especially the top historical generation tail. A useful next experiment is to profile contribution by tranche on the heavy-tail cases and determine whether a cheap negative signal can skip or postpone expensive round families without changing the exact fallback contract.

