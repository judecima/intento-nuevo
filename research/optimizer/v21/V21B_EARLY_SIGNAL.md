# V21b family-seeded Master — early signal

V21b changes only Pattern Master pool generation:
- legacy: 40 random rounds + monotype;
- V21b: deterministic family-base/family-height seeds + 20 random rounds + monotype;
- same coverage solver, materialization and industrial validator.

## Current-branch exact-XML signal

Initial paired measurements on three exact hotspot XMLs using the V21 branch candidate:

| Case | OFF total | ON total | OFF Master | ON Master | Boards OFF/ON |
|---|---:|---:|---:|---:|---:|
| 4061281 | 21,072 ms | 17,191 ms | 9,187 ms | 4,826 ms | 5 / 5 |
| 4054893 | 12,261 ms | 9,812 ms | 6,516 ms | 4,298 ms | 7 / 7 |
| 4050594 | 21,769 ms | 15,422 ms | 12,228 ms | 5,656 ms | 7 / 7 |

Aggregate:
- total: 55,102 -> 42,425 ms = **-23.0%**;
- Master: 27,931 -> 14,780 ms = **-47.1%**;
- board regressions: **0/3**;
- critical Master-win case 4050594 still reaches 7 boards.

## Expanded directional Order-XML sample

A second local direct-CJS sample was expanded to five real Order XMLs with Master active. That local checkout is an older V19-era runtime, therefore these numbers are **directional only and are not an acceptance result**.

| Case | OFF total | ON total | OFF Master | ON Master | Boards OFF/ON |
|---|---:|---:|---:|---:|---:|
| 4058501 | 31,012 ms | 16,175 ms | 23,614 ms | 9,217 ms | 9 / 9 |
| 4054501 | 22,048 ms | 12,327 ms | 19,748 ms | 9,983 ms | 6 / 6 |
| 4058104 | 38,146 ms | 15,969 ms | 35,276 ms | 12,999 ms | 13 / 13 |
| 4054269 | 20,067 ms | 16,058 ms | 17,349 ms | 13,456 ms | 11 / 11 |
| 4053752 | 20,595 ms | 11,098 ms | 18,002 ms | 8,408 ms | 8 / 8 |

Aggregate directional sample:
- total: 131,868 -> 71,627 ms = **-45.68%**;
- Master: 113,989 -> 54,063 ms = **-52.57%**;
- board regressions inside this local sample: **0/5**.

Do not compare the board count of 4058501 from this old local runtime against the frozen current benchmark: the runtime revisions are different.

## Historical safety warning: 20 random rounds alone are not safe

The repository already contains the V7 rounds ablation. On `4058501__Marcos _Cumini Londero4058501.xml`, the historical repeated repro produced:
- 40 random rounds: **8 boards**, 5/5 runs;
- 20 random rounds: **9 boards**, 5/5 runs.

Therefore V21b cannot be justified as merely “halve the random rounds”. The deterministic family seeds must recover columns that otherwise appear after round 20. This is why the case-by-case board gate is mandatory and why a full 8,669-case regression run is required before merge.

## Interpretation

Both timing samples point in the required direction: the measured Master reduction is greater than the diagnostic target of 36.74%. Neither sample is the release verdict.

The authoritative gate remains the same-machine 213-case A/B against the existing V20 checkpoint:
- board regressions = 0;
- invalid plans = 0;
- new exceptions = 0;
- `V21_total / V20_total <= 0.7280675`.

If the 213 gate passes, run the 8,669-case zero-board-regression validation. No algorithm or round-count tuning is allowed between these gates.
