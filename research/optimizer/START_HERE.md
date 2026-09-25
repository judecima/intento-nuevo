# START HERE — MDF Optimizer Research

## Active continuation — 2026-09-25

Repository:
`judecima/intento-nuevo`

Active branch:
`research/holdout-trim-baseline-20260924`

Canonical handoff:
`research/optimizer/STATUS_2026-09-25_TRIM_SEMANTICS_HANDOFF.md`

Supporting trim gate:
`research/optimizer/TRIM_SEMANTICS_GATE_2026-09-25.md`

For a new chat:

1. checkout/read the active branch above;
2. read `STATUS_2026-09-25_TRIM_SEMANTICS_HANDOFF.md` completely before proposing work;
3. read `TRIM_SEMANTICS_GATE_2026-09-25.md`;
4. trust the latest commit on this same branch if HEAD has advanced;
5. do not reconstruct state from older handoffs unless the canonical status explicitly points to them;
6. preserve the lexicographic objective: minimum boards first, commercial remnant second, latency third;
7. do not start A–F gap mining until trim semantics are closed and the corrected holdout is rerun;
8. do not deploy to Vercel;
9. do not modify `.gitignore` or `.vercelignore` or clean local research artifacts.

Immediate milestone:
- run the full-corpus trim rule audit;
- require `factoryEdgeOrReserve.failingCases == 0`;
- only then implement one coherent trim policy across schema, generators, materializer, validator, and lower bounds.

## Older handoffs

The following files are historical context only and are superseded by the 2026-09-25 status unless explicitly referenced there:

- `research/optimizer/CURRENT_PROGRESS_2026-09-22.md`
- `research/optimizer/CHAT_HANDOFF_2026-09-22.md`

Do not use the older 2026-09-22 active branch as the continuation point.
