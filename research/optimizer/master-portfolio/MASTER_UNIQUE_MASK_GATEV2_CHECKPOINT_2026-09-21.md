# Master unique-mask after Gate V2 — checkpoint 2026-09-21

Branch: `research/master-unique-mask-gatev2-20260921`

## Scope

This experiment targets only cases that still reach Master after Gate V2 and have 1..4 piece types.

Policy under test:

- keep the original 40-round schedule;
- for equal type-subset masks, execute only the first occurrence;
- do not change the coverage solver;
- keep the full legacy path outside 1..4 types.

The policy is still research-only. Duplicate masks can have different round seeds, so safety is established by A/B evidence rather than assumed from mask equality.

## Direct A/B evidence

Historical Gate V2 targets with 1..4 types: 30.

Exact/reproducible snapshots available in the current repository: 9.
The other 21 are excluded from the scored set because the current canonical snapshot does not match the historical `piece_count/type_count`. They are not counted as failures.

Scored cases:

- 9/9 industrially valid in both arms;
- 9/9 same board count;
- 9/9 candidate remnant quality not worse;
- 9/9 same Master win / boards-saved outcome;
- affected historical Master winners: 4056900 and 4057401;
- both winners preserved.

Timing on the direct paired runner:

- baseline Master: 55,402 ms;
- unique-mask Master: 11,310 ms;
- Master saving: 44,092 ms = **79.586%**;
- baseline end-to-end wall: 78,999.58 ms;
- candidate end-to-end wall: 35,267.81 ms;
- end-to-end saving: 43,731.77 ms = **55.357%**.

Observed executed rounds:

- 1 type: 1 distinct non-empty mask instead of 40 scheduled rounds;
- 2 types: 3 distinct masks;
- 3 types: 7 distinct masks;
- 4 types: 15 distinct masks.

## Important exclusions

21/30 historical targets cannot be scored against their old manifest snapshot using `canonical_cases.json` because their current normalized piece/type counts differ. This includes two very expensive historical four-type cases (4056676 and 4056720). Do not extrapolate direct parity to those historical snapshots until exact inputs are recovered.

## Decision

The result is a real measured speed improvement on the reproducible 1..4-type Gate V2 survivor slice, with zero observed objective regressions and both affected historical winners retained.

Keep the policy behind its experimental option/flag. Next useful work is either:

1. recover exact snapshots for the 21 excluded historical targets; or
2. certify the policy on current canonical/live-equivalent inputs independently of the historical manifest.

Do not generalize the rule beyond four types from this checkpoint.
