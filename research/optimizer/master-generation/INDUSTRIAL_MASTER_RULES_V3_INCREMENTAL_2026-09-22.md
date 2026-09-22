# Industrial Master Rules V3 — Incremental Contract

Date: 2026-09-22

## Goal

Reduce Master CPU without changing objective priority:
1. minimum boards,
2. remnant quality,
3. never spend an extra board for remnant.

## Industrial rules

### Rule A — High diversity
If Master is active and typeCount > 40:
- execute production rounds 0..2
- solve P3
- stop

### Rule B — Mid diversity, high repetition
If Master is active and:
- 20 <= typeCount <= 40
- pieces / typeCount >= 4

then:
- execute production rounds 0..2
- solve P3
- stop

### Rule C — Incremental generation contract
For any Master case that continues beyond the first block:
- rounds are generated in canonical production order 0..39
- a generated round is never generated twice within the same Master execution
- the pattern pool is cumulative
- later blocks append new rounds only
- no guided/static round reordering is allowed
- Full40 must remain parity-equivalent to production Full40

This is infrastructure, not a statistical cutoff rule.

## Explicitly rejected behavior

Do not reintroduce guided scheduling such as [9,23,32,1].
The frozen holdout showed 24 scheduling improvements vs 22 worsenings and only ~1.39% aggregate CPU benefit, so it was not a stable industrial rule.

## Existing parity evidence for incremental Full40

Frozen holdout:
- 46 wins
- Full40 incremental parity: 46/46
- pool/solver final parity failures: 0

## Acceptance gate for V3

V2 vs V3 full corpus:
- board losses = 0
- equal-board quality regressions = 0
- global CPU lower than V2
- p95/p99 not worse materially

V3 must report A, B and C separately.
