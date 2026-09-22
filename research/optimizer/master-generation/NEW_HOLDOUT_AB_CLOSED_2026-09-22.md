# New Holdout A/B Validation — CLOSED — 2026-09-22

Source:
- 4 uploaded ZIPs
- 16,992 XML total
- 16,986 canonical-parseable
- IDs 5,221,643 .. 5,336,643
- no numeric overlap with previous corpus (previous max 5,221,642)

Frozen rules:
- A: Master active AND typeCount > 40 -> P3
- B: Master active AND 20 <= typeCount <= 40 AND pieces/typeCount >= 4 -> P3
- thresholds were not retuned on this holdout

Eligibility:
- A/B candidates: 1,162
- screen completed: 1,162/1,162, 0 errors
- Master-active: 480
  - A: 379
  - B: 101

P3 vs Full40 on all 480 Master-active cases:
- losses: 0
- equal board count: 479
- P3 better than Full40: 1 (order 5264906, 26 -> P3 25 vs Full40 26)
- equal-board quality regressions: 0

Full40 wins vs pre-Master:
- 3 wins: 5226838, 5231953, 5271166
- P3 captured 3/3
- P3 additionally won 5264906 where Full40 did not

CPU:
- P3 total: 1,163,878.507 ms
- Full40 total: 6,451,050.577 ms
- saving: 81.9583%
- p50: 804.939 ms vs 14,743.430 ms
- p95: 12,955.830 ms vs 24,443.868 ms
- p99: 14,737.538 ms vs 28,289.994 ms

Rule A:
- cases: 379
- losses: 0
- parity: 378
- P3 better than Full40: 1 (5264906)
- Full40 wins: 3
- Full40 wins captured by P3: 3/3
- CPU saving: 81.9198%

Rule B:
- cases: 101
- losses: 0
- parity: 101/101
- Full40 wins: 0
- CPU saving: 82.0932%

Lepton comparison inside the 480 Master-active cases:
P3:
- better: 114
- equal: 359
- worse: 7

Full40:
- better: 113
- equal: 360
- worse: 7

The seven P3-worse-than-Lepton cases are also Full40-worse-than-Lepton, so they are optimizer gaps rather than losses caused by the P3 rules:
- 5223192: Lepton 78, P3 79, Full40 79
- 5227131: Lepton 5, P3 6, Full40 6
- 5294528: Lepton 22, P3 23, Full40 23
- 5295864: Lepton 7, P3 8, Full40 8
- 5301282: Lepton 58, P3 59, Full40 59
- 5324826: Lepton 5, P3 6, Full40 6
- 5329409: Lepton 18, P3 19, Full40 19

Interpretation:
- Rule A now has sealed out-of-sample validation with 379 Master-active cases and 3 novel Full40 wins; P3 captured all 3.
- Rule B has 101 sealed out-of-sample Master-active cases with 0 losses, but this holdout contains 0 Full40 wins in B, so novel-win capture for B remains untested.
- Incremental generation remains infrastructure: Full40 parity is separately validated; no universal fixed early cutoff beyond A/B is promoted.
