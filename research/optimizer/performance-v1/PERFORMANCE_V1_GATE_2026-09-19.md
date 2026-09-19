# Performance V1 — final gate candidate (2026-09-19)

## Goal

Close the performance work with one bounded milestone: Fast / Balanced / Deep must reuse safe work from the previous effort level without changing the physical solution. For the Balanced -> Deep transition, Deep60 must reuse the exact first 40 Rust Master rounds produced by Balanced40 and execute only rounds 40..59.

## Candidate

Two changes only:

1. `packBoardLegacyBeamCandidates` receives a total deterministic tie-break using the already-computed canonical `usage_signature`. This removes `HashMap::into_values()` ordering from the candidate truncation contract.
2. Rust Pattern Master gets an opt-in warm round cache for deterministic Beam budgets. The cache is fail-closed: incompatible policy, watchdog, geometry/options changes, cache miss or disabled feature all execute the historical cold path.

The feature remains OFF by default through `OPTIMIZER_RUST_MASTER_ROUND_REUSE_EXPERIMENTAL=0`.

## Safety contract

Reuse is allowed only when all of the following hold:

- rounds are exactly 40 or 60;
- seed is 7;
- `maxExpansionesBeam` is finite and positive;
- no Beam watchdog is active;
- the <=4 unique-mask experiment is not active;
- problem geometry and every relevant optimizer option match the cache key.

Only `presupuestoBeamMs`, `rondasPatrones` and `msMaster` are excluded from the key because deterministic Beam ignores the wall-clock Beam budget and those two Master fields do not change per-round construction.

Cache policy: LRU, 4 contexts, TTL 10 minutes. Failures are never cached.

## Evidence before CI

Local deterministic cohort: 11 real canonical orders.

- schedule prefix: `legacyRoundSubsets(n, 40, 7) == legacyRoundSubsets(n, 60, 7)[0:40]` for n=1..60;
- first 40 round parity: 11/11;
- Deep60 pool parity: 11/11;
- Master physical plan digest parity: 11/11;
- warm continuation contract: 11/11 with exactly 40 hits + 20 new rounds;
- Deep incremental cost: 11,398.18 ms cold -> 4,500.61 ms warm;
- aggregate reduction: 60.51%;
- minimum per-case reduction in that cohort: 53.32%.

The earlier nondeterministic cases were traced to the native Beam candidate selector: equal LB/area/remnant candidates inherited unstable `HashMap` iteration order before `truncate()`. A deterministic signature tie-break made repeated executions stable in the local oracle.

## Final CI acceptance

`optimizer-performance-v1-final.yml` is the promotion gate. It must:

1. compile Rust and pass `cargo test`;
2. execute the committed 11-case cohort with the built native addon;
3. obtain 11/11 identical Deep60 pattern pools;
4. obtain 11/11 identical materialized Master plan digests;
5. observe exactly `40 reused + 20 generated` rounds in every warm Deep60 case;
6. keep aggregate Deep incremental generation reduction >= 40%;
7. prove watchdog mode disables reuse and runs cold;
8. pass the existing stable-candidate winner gate;
9. pass Rust tests, TypeScript typeckheck, full test suite and production build.

If any condition fails, Performance V1 is REJECTED and the candidate is not promoted. No new optimization investigation is opened inside this milestone.
