# Subset Generator recovery checkpoint — 4006648

Research-only recovery of the heterogeneous-pattern experiment that was not committed before the previous chat reached its context limit. It does **not** modify `src/lib/optimizer/**` and is not a production promotion.

## Recovered baseline

The recovered Rescue policy uses 14 restarts per board, Rescue ON, Beam OFF, 2 passes and no multi-variants. Farthest-first Jaccard diversity over the exact 40 Legacy masks reproduces the gold-case curve `20→11, 24→11, 28→10, 32→10, 40→10`. Full-order remains at 12 boards, Legacy-40 remains at 10, and the area lower bound is 9.

## Directed escalation checkpoint

The first directed policy now passes the explicit gold-case gate: **10 boards with only 10 Rescue masks**. It does not use Rescue output to choose those masks. Selection is based only on two cheap deterministic probes:

1. one-pass / one-restart, Rescue OFF, Beam OFF at seed offset `10000`;
2. the same cheap probe at seed offset `40000`;
3. rank subset masks by `z(averageUtilization) + 0.5 * z(boardCountInstability)`;
4. run the existing Rescue14 / Beam-OFF generator only on the top 10.

For canonical `4006648`, the deterministic selected rounds are:

```text
14, 31, 5, 3, 10, 34, 13, 35, 11, 29
```

They solve at 10 boards with 3,503 Master nodes and a 61-pattern pool. In three clean-process measurements on the recovery host, directed end-to-end CPU was 1.22–1.33 s (median 1.24 s), versus 3.16–3.43 s (median 3.21 s) for Rescue28 on the same checkpoint: about **2.6x median speedup**. Timings are telemetry, not test assertions.

## Why this matters

Small subset enumeration remains rejected: types absent from a final board can alter the greedy construction trajectory. The search object is the **mask context**, not merely the final set of consumed types. Directed escalation now demonstrates that the 28-mask quality result can be recovered with a bounded 10-mask escalation and lower end-to-end CPU on the gold case.

## Validation

```bash
node research/optimizer/pattern-generators/subset-generator/4006648.test.mjs
node research/optimizer/pattern-generators/subset-generator/4006648.directed.test.mjs
node research/optimizer/pattern-generators/subset-generator/4006648.directed-benchmark.mjs

# optional expensive control
node research/optimizer/pattern-generators/subset-generator/4006648.legacy-baseline.mjs
```

The directed test asserts the exact selected rounds, `<=10` escalations, 10 boards and a non-exhausted Master. The benchmark reports timing without asserting host-dependent thresholds.

## Scope boundary

This is still **research-only**. The selector score was discovered on `4006648`; it has not yet been validated over the 239-case MID_DENSITY cohort. The earlier run remains only 13/239 complete, with 226 unevaluated. Do not present those 226 as tested and do not promote this selector into `src/lib/optimizer/**` until the batch gate demonstrates zero regressions and acceptable median/p95 CPU.
