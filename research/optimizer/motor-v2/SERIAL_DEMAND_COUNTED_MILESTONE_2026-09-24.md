# Serial Demand-Counted Research Milestone — 2026-09-24

Status: **FROZEN RESEARCH MILESTONE — DO NOT PROMOTE TO PRODUCTION**

Branch: `research/serial-demand-counted-20260924`

## Purpose

Investigate a compact route for very large repetitive MDF jobs without expanding every
physical piece during search.

The production objective remains furniture-oriented work (roughly <= 75 boards).
This serial route is secondary and is frozen here to avoid diverting effort from the
commercial target.

## What was demonstrated

- Demand can stay aggregated by type instead of expanding 10k+ physical JS objects.
- One physical board pattern can be represented by a usage vector.
- The master can operate on integer multiplicities of those patterns.
- Physical IDs/materialization are only needed after the master chooses a plan.
- The serial generator can create complete, physically validated coverage pools in about
  sub-second to low-single-second time on the studied large cases.
- Case 5456195 previously reached 7680 boards, exactly matching both Lepton and the safe
  lower bound, with only 8 counted master decisions in the successful iteration.
- The main remaining quality limitation in the Ignacio cases is the **pattern pool**, not
  merely the counted B&B.

## Final pool-only audit

The final audit preserved the 96-probe baseline pool and added dual-guided pricing
instead of replacing the baseline.

Exported file:
`SERIAL_COUNTED_SHADOW_RESULT(5).json`

Configuration:
- 4 XML cases recovered
- pool-only mode
- baseline physical tests: 96
- max physical tests: 176
- total generation wall: ~3.72 s
- solver intentionally skipped

### Exact restricted-master LP audit

The exported usage vectors were re-solved offline as:

`min sum(x_p)`
subject to
`A x = demand`, `x >= 0`.

This is a diagnostic of the best *fractional* solution available from the generated
pool. Therefore, if this LP optimum is above Lepton, no integer solver using only that
pool can match Lepton.

| Case | Lepton | Patterns | Exact LP of final pool | Gap LP vs Lepton | Prior pool LP |
|---|---:|---:|---:|---:|---:|
| 5445701 | 591 | 165 | 612.7221 | +21.7221 | 613.6550 |
| 5445716 | 621 | 178 | 642.1849 | +21.1849 | 651.4410 |
| 5447573 | 588 | 175 | 609.8712 | +21.8712 | 612.2760 |
| 5456195 | 7680 | 26 | 7680.0000 | 0.0000 | 7680.0000 |

Result:
- additive pricing improved all three Ignacio pools versus the previous baseline,
  especially 5445716;
- 5456195 preserved the exact 7680 LP optimum;
- nevertheless, all three Ignacio restricted masters remain >21 boards above Lepton
  even fractionally.

Therefore **more B&B tuning cannot close those three gaps with this pool**.

## Dual-guided pricing result

Pricing was useful but incomplete.

The final approximate dual objectives emitted by the research generator were:
- 5445701: 603.8080
- 5445716: 635.0025
- 5447573: 600.1848
- 5456195: 7675.2803

For the Ignacio cases, types around 11, 10, 12, 8/9/7 repeatedly received the highest
dual prices. The generator found new useful columns, but later pricing rounds saturated:
new physical probes stopped lowering the restricted master enough to reach Lepton.

The next technically correct serial step would be a stronger geometric pricing oracle
that directly maximizes the dual value of a single feasible guillotine board. That work
is intentionally deferred.

## Decision

Freeze this line.

Do **not**:
- increase serial search budgets;
- keep tuning counted B&B for the Ignacio cases;
- continue column-generation work now;
- promote any serial research code into V10.

Resume the main product milestone instead:

1. target jobs with Lepton <= 75 boards;
2. remove pathological furniture tails;
3. prioritize cases such as 5490953 (~4 boards, 39 types, ~24 min) and
   5489487 (~17 boards, 34 types, ~24 min);
4. preserve zero board-count regressions;
5. then reduce p95/p99 and close remaining quality gaps against Lepton.

## Files introduced by this research line

- `src/lib/optimizer/experimental/counted-coverage.cjs`
- `src/lib/optimizer/experimental/serial-directed-pattern-generator.cjs`
- `research/optimizer/motor-v2/serial-counted-shadow.mjs`

These remain research-only.
