# Rust Pattern Generator — Real Corpus Gate

Date: 2026-09-18  
Branch: `feature/optimizer-rust-pattern-generator`  
Native artifact source commit: `4e878958be84d9c4bdd25165043a0e4457888f75`

## Decision

**CORPUS GATE: FAIL — DO NOT PROMOTE B0.1 AS A REPLACEMENT FOR THE PRODUCTION V10 PATTERN GENERATOR.**

The Rust implementation is technically valid against the H2 grammar and integrates cleanly with Next.js/Node, but it does not preserve the production optimizer's board-count quality on the real corpus. The failure is not an invalid-layout issue: the affected final plans pass industrial and independent-slice validation but use more boards.

No production V10 import or default execution path is changed by this branch.

## Physical corpus identity

The gate used the original seven physical archives, not duplicated later uploads:

| Archive | XML files | SHA-256 |
|---|---:|---|
| resto.zip | 8,669 | `15ff286970883ef0799621f102a8ae15956c291fe3a32f3572d8c86ce4adefa1` |
| parte-1.zip | 2,000 | `03dac990e71ad43c9b56ab03ab80c38917aa647c952e2de112e515be5d639ed5` |
| parte2.zip | 2,002 | `cd1e0d2266ed876cc9aa8157df4769023d91a0b60dffc01b341755d36aa79ca7` |
| parte3.zip | 2,000 | `e6b41601016d8a9b733fc94f34ae0e3e20e4e51248009c6b7e4d35f836c884fc` |
| parte4.zip | 2,015 | `19187864b2cb8cdc9fb13fdae8d65254a606e49c924069707e134b5789833265` |
| parte5.zip | 2,049 | `cd54addc45b819e6d07ea3885eec752008f25c6055e5abff6082648ad692698c` |
| part_6.zip | 2,083 | `8761065e45f51bff2094c98862fedf1acdd6029d9755e04b35e589b91ae764fb` |
| **Total** | **20,818** | — |

Canonical parsing on this physical set produced:

- **20,783 parseable** cases.
- **35 invalid/mixed** inputs.
- **1,152** parseable cases containing an obvious piece-vs-stock impossibility.
- Piece-count distribution: 13,325 <=30; 2,919 at 31–50; 2,873 at 51–100; 958 at 101–160; 547 at 161–350; 161 above 350.

## Why the gate targets Pattern Master

B0.1 is only relevant when Pattern Master is exercised. Historical per-order V10 evidence in the repository identifies:

- **323 unique real orders** where Master was exercised.
- **5 unique real Master winners** where Master historically saved a board:
  `4050594`, `4056900`, `4057401`, `4058501`, `4059200`.

Those five are therefore mandatory quality sentinels for a generator replacement.

The fixed Rust policy is the same bounded B policy used by the prior H4 pilot:

```text
maxExpansions          = 20,000
maxAndCombinations     = 50,000
maxFrontierEntries     = 10,000
maxMaterializations    = 500
maxVariantsPerUsage    = 8
```

## Forced Rust generation on all five real Master winners

Using the compiled Linux x64 N-API artifact from the branch CI, the Rust generator was invoked directly with the canonical real-order context for every Master winner.

| Order | Frozen V10 boards | V10 area LB | Rust status | Rust physical pool |
|---|---:|---:|---|---:|
| 4050594 | 7 | 7 | WORK_LIMIT | 0 |
| 4056900 | 6 | 6 | WORK_LIMIT | 0 |
| 4057401 | 4 | 4 | WORK_LIMIT | 0 |
| 4058501 | 8 | 7 | WORK_LIMIT | 0 |
| 4059200 | 17 | 13 | WORK_LIMIT | 0 |

All five stop on `maxExpansions=20,000`. There are no materialization failures because no non-empty root survives to a physical pool.

This is sufficient to reject B0.1 as a production replacement: the exact orders for which the legacy generator is known to matter receive no replacement columns.

## End-to-end reproduction on current source

Four of the five sentinels completed end-to-end locally with the current source. `4059200` exceeded the local 300 s watchdog and is reported separately rather than silently dropped.

| Order | Legacy V10 | Rust replacement | Delta | Industrial | Independent slices |
|---|---:|---:|---:|---|---|
| 4050594 | 7 | 7 | 0 | PASS | PASS |
| 4056900 | 6 | 7 | **+1** | PASS | PASS |
| 4057401 | 4 | 5 | **+1** | PASS | PASS |
| 4058501 | 8 | 9 | **+1** | PASS | PASS |
| 4059200 | watchdog locally; frozen reference 17 | not scored end-to-end | — | — | — |

For `4050594`, the current V10 pipeline reaches the lower bound before the replacement Master generator is called; forced generator-only evaluation still returns WORK_LIMIT/pool=0.

For the three observed regressions the Rust path returns a valid incumbent from the rest of V10, but cannot recover the board that the legacy Pattern Master generator historically recovers.

## Additional Master-active diagnostic

A bounded prefix of the 323 historically Master-active real orders was evaluated directly before stopping the diagnostic after the production rejection was already established:

- 36 real Master-active orders evaluated.
- 35 WORK_LIMIT, 1 COMPLETE.
- 2/36 produced a non-empty physical pool.
- 0 generator/materialization errors.
- wall time on this machine: p50 472 ms, p95 2,527 ms, p99 2,710 ms, max 2,715 ms.

This prefix is diagnostic and is **not** presented as a random or prevalence estimate. The five mandatory Master winners are the quality gate.

## Interpretation

The Rust port correctly implements the experimental B0.1 grammar. The corpus failure shows that **B0.1 itself is not semantically equivalent to the production legacy pattern generator**. Increasing budgets would be a new search-policy experiment and is not an acceptable way to claim parity.

The legacy generator's key behavior is different: for each seeded round it hides a deterministic subset of item types and invokes the production plate constructor, retaining the best physical plate for each usage vector. The expensive work is therefore inside the production packing kernel, not merely in the outer pattern loop.

## Next engineering step

Do not tune B0.1 further for production promotion.

Create a separate implementation line for an **exact-semantic Rust port of the production pattern-generation path**:

1. preserve the legacy seeded subset schedule and usage-vector deduplication exactly;
2. port the production plate-construction hot path used by `patrones.cjs`;
3. retain the existing JS industrial validator as the promotion arbiter;
4. first require exact pool/board parity on the five Master winners;
5. then run the 323 Master-active cohort;
6. only after zero board regressions expand to the complete 20,783 parseable corpus;
7. keep Next.js as the application runtime and Rust as a Node/N-API compute module.

Status of this branch: **H2 VALIDATED / REAL-CORPUS REPLACEMENT REJECTED / PRODUCTION UNCHANGED**.
