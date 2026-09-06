# V21b family-seeded Master — early signal

V21b changes only Pattern Master pool generation:
- legacy: 40 random rounds + monotype;
- V21b: deterministic family-base/family-height seeds + 20 random rounds + monotype;
- same coverage solver, materialization and industrial validator.

Local paired measurements on exact corpus XMLs:

| Case | OFF total | ON total | OFF Master | ON Master | Boards OFF/ON |
|---|---:|---:|---:|---:|---:|
| 4061281 | 21,072 ms | 17,191 ms | 9,187 ms | 4,826 ms | 5 / 5 |
| 4054893 | 12,261 ms | 9,812 ms | 6,516 ms | 4,298 ms | 7 / 7 |
| 4050594 | 21,769 ms | 15,422 ms | 12,228 ms | 5,656 ms | 7 / 7 |

Aggregate sample:
- total: 55,102 -> 42,425 ms = **-23.0%**;
- Master: 27,931 -> 14,780 ms = **-47.1%**;
- board regressions: **0/3**;
- critical Master-win case 4050594 still saves the board and reaches 7 boards.

This 3-case sample is deliberately not the acceptance benchmark. Its Master share is ~50.7%, while the frozen post-V20 hotspot has ~74% of remaining time in Master. If the ~40-47% Master reduction generalizes, the historical-equivalent total projects to roughly 8.7M-8.1M ms, below the 9.0M gate.

Next gate: same-machine 213-case A/B against the existing V20 checkpoint, then 8,669-case zero-board-regression validation.
