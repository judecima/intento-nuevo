# Master Gate V2 — confirmed performance improvement (2026-09-21)

Branch: `research/master-gate-criba-v1-20260921`

## Gate

```
allow Master when:
  gap > 1
  OR multiplicityMean >= 4.75

skip Master when:
  gap == 1
  AND multiplicityMean < 4.75
```

The gate is opt-in / experimental and does not alter the 40-round Master path when Master is allowed.

## Historical Master-active 323

- cases: 323
- Master selected: 90
- Master skipped: 233
- invocation reduction: 72.136%
- historical Master winners retained: 4/4
- missed winners: 0
- recorded Master time: 6,536,990 ms -> 2,921,423 ms
- recorded Master time saved: 3,615,567 ms (55.309%)
- p50 Master time: 9,486 ms -> 0 ms
- p95 Master time: 70,545.2 ms -> 52,385.2 ms
- p99: unchanged at 120,303.16 ms
- max: unchanged at 470,833 ms

The time projection above uses the recorded per-case Master timings from the historical 323-case manifest.

## New rejected-region probes

The candidate certification scanned 40 cases and found 12 previously unlabelled, real `gap=1 && multiplicityMean<4.75` cases.

- 12/12 ran the full 40-round Master baseline
- Master wins: 0/12
- boards saved by Master: 0

This extends the negative evidence beyond the original labelled set.

## Nearest-neighbour adversarial pilot

A separate pilot searched geometries nearest to known Master winners and skipped already-known cases.

- scanned: 36
- real `gap>0` eligible cases: 8
- full 40-round Master runs: 8
- Master wins: 0/8
- generation time paid: 139,262.77 ms
- solve time paid: 47,290.70 ms

These are deliberately difficult probes because they are geometrically close to known winners.

## Runtime A/B

A direct runtime A/B compared baseline vs Gate V2 on 8 reject cases plus 3 controls.

Reject region:
- 8/8 Master invocations skipped by candidate
- industrial validity preserved: 8/8
- board-count parity: 8/8
- baseline wall time: 191,074.29 ms
- candidate wall time: 89,312.15 ms
- wall time saved: 101,762.14 ms
- end-to-end reduction: 53.258%

Controls:
- 3/3 allowed through the gate
- industrial validity preserved: 3/3
- board-count parity: 3/3

Physical-plan digests are not used as the safety criterion because repeated optimizer executions are not bit-deterministic. Digest parity was 0/11 in this A/B even when the gate did not change objective outcome. The safety criterion is industrial validity plus board-count parity; the gate only skips Master, and Master does not accept same-board remnant-only replacements.

## Conclusion

Gate V2 is a demonstrated performance improvement on the tested scope:

- 72.1% fewer Master invocations on the 323 historical Master-active cases.
- 4/4 historical Master winners retained.
- 0/20 wins found in new skip-region stress probes (12 certification + 8 nearest-neighbour).
- 53.3% measured end-to-end wall-time reduction on direct A/B reject cases.
- 0 board-count regressions in the direct A/B.
- full 40-round Master remains unchanged for cases that pass the gate.

This is sufficient to keep Gate V2 as an opt-in candidate and move the next effort to broader end-to-end certification rather than further threshold searching.
