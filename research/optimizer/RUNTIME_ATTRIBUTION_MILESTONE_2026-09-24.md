# Runtime Attribution Milestone — 2026-09-24

Base holdout: commit `d72d6f5729c4a65b15c168553b5815a760185f72`.

## Scope

This milestone does not change optimizer production behavior. It changes validation and diagnostic scripts only.

Goals:
- preserve original timed exceptions instead of masking them with a null dereference;
- prevent V1 evidence from claiming COMPARED when the Auto candidate is unavailable;
- persist full Auto Master block telemetry in future full validations;
- replay a targeted performance cohort without enabling heavy Step0 telemetry;
- attribute p95/p99 cost using telemetry already emitted by V10.

## Targeted replay cohort

`optimizer:validate:attribution` selects the union of:
- source FAIL rows;
- current p99 by candidate CPU;
- p95 CPU rows that never entered Master;
- all rows where Master reduced board count;
- all rows worse than Lepton;
- deterministic controls.

The replay persists:
- source and replay board/remnant result;
- CPU/wall/engine timing;
- V10 total timing;
- compactation, MultiSlice, OneBoard and Master metrics;
- complete effort-controller blocks, including pool size, candidate count, generation CPU delta, solver nodes, exhaustion and target flags;
- lower-bound and remnant-polish telemetry;
- original and replay errors.

It explicitly disables `OPTIMIZER_STEP0_TELEMETRY` so diagnostics do not add the heavier hot-loop instrumentation.

## Safety

The branch may reuse the completed holdout from the base commit only when the git diff contains validator/diagnostic files from an explicit allowlist. Any optimizer runtime or native Rust change makes the replay refuse to run.

No cutoff, lower bound, solver behavior, pattern generator, remnant comparator, or production route is changed in this milestone.
