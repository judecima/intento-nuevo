# START HERE — MDF Optimizer Research

Active branch:
`research/perfv3-industrial-incremental-20260922`

Branch HEAD at handoff:
`ace8e4c79f5d01e7ebfe150e0acf86220e4a753c`

Canonical progress checkpoint:
`research/optimizer/CURRENT_PROGRESS_2026-09-22.md`

For a new chat:
1. checkout/read the active branch above;
2. read CURRENT_PROGRESS_2026-09-22.md before proposing work;
3. treat A/B + incremental V3 as the accepted baseline;
4. do not repeat experiments listed as rejected;
5. continue the effective-branching / Guide-Strip / residual-builder line;
6. preserve the lexicographic objective: minimum boards first, then commercial remnant quality, then latency;
7. respect per-piece rotation override: board grain defines the default, but explicit canRotate=true is allowed;
8. use the current 37,828 valid cases as discovery/mining data;
9. keep the next ~20k user cases sealed as external validation until new thresholds/rules are frozen.

If branch HEAD has advanced, trust the latest commit on this same branch and then read the checkpoint again.


## Chat handoff — 2026-09-22
Before continuing in a new conversation, read:
- `research/optimizer/CHAT_HANDOFF_2026-09-22.md`

It freezes the current state before the user's next ~15k sealed holdout, including Safe Cascade v1, Monotype-v2 external PASS, R3-M-v4 frozen candidate, H2 1399 results, early cheap-LB family evidence, and the no-retuning holdout protocol.
