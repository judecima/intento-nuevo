# Subset Generator research checkpoints

Research-only experiments for heterogeneous pattern generation. Nothing in this directory is a production promotion and these checkpoints do **not** modify `src/lib/optimizer/**`.

## Recovered Rescue28 baseline

The recovered Rescue policy uses 14 restarts per board, Rescue ON, Beam OFF, 2 passes and no multi-variants. Farthest-first Jaccard diversity over the 40 Legacy masks reproduced the historical `4006648` curve `20→11, 24→11, 28→10, 32→10, 40→10` on the manually recovered fixture.

## Historical Directed10 checkpoint (`8ac6080`)

The first Directed10 experiment selected ten masks from two cheap deterministic probes and reached 10 boards on the recovered `4006648` fixture. That experiment remains useful evidence that bounded escalation can work, but it is **not current-parser validation**.

During the subsequent batch gate we found that the recovered fixture's piece order differs from the deterministic piece order produced by the current `parseCanonicalXml` pipeline. Because Legacy masks are indexed by piece position, the difference is material: with current canonical ordering, the old Directed10 selector gives `Fast=12`, `Rescue28=10`, `Directed10=12`.

Do not use the historical Directed10 result as evidence of generalization for current canonical inputs.

## Current-canonical Portfolio10 checkpoint

The current checkpoint replaces per-case ranking with a fixed, deterministic portfolio of ten Rescue contexts:

```text
0, 8, 12, 16, 17, 19, 26, 33, 35, 37
```

Policy: 2 passes, 14 restarts per board, Rescue ON, Beam OFF, no per-case probe.

On current-canonical `4006648` it preserves the Rescue28 result:

```text
area LB      9
Fast        12
Rescue28    10
Portfolio10 10
```

The reconstructed current-parser MID_DENSITY gate contains 90 open `project` cases (parts 1–6, <=160 physical pieces, >=20 logical types, `0.50 <= strip-type density < 0.70`, `Fast > area LB`). Portfolio10 was compared against Rescue28 over the full gate using area-bound certification and exact geometry/config deduplication where applicable:

- 90/90 cases accounted for;
- 0 regressions vs Rescue28;
- 87 equal;
- 3 case-level wins (2 unique geometries/configs);
- 14 improvements vs Fast, versus 11 for Rescue28;
- 7 cases reach the area lower bound.

Four representative serial same-host benchmarks showed 1.81x–3.10x CPU speedup, sample median 2.46x. Timing is telemetry, not a test assertion.

See:

- `PORTFOLIO10_CHECKPOINT_2026-09-14.md`
- `PORTFOLIO10_MID_DENSITY_2026-09-14.json`
- `fixtures/4006648-canonical-current.json`
- `4006648.portfolio.test.mjs`

## Validation

```bash
node research/optimizer/pattern-generators/subset-generator/4006648.portfolio.test.mjs

# Historical/recovery controls
node research/optimizer/pattern-generators/subset-generator/4006648.test.mjs
node research/optimizer/pattern-generators/subset-generator/4006648.directed.test.mjs
node research/optimizer/pattern-generators/subset-generator/4006648.directed-benchmark.mjs
node research/optimizer/pattern-generators/subset-generator/4006648.legacy-baseline.mjs
```

Existing optimizer smoke tests remained **32/32 PASS** during Portfolio10 validation. Whole-project typecheck was not run because the recovered snapshot does not include installed `node_modules`.

## Scope boundary

Portfolio10 passes the current-parser MID_DENSITY research gate but is still **research-only**. Before production integration, validate it against the broader open heterogeneous cohort and other density families, then collect clean serial p50/p95 latency under the intended runtime budget.
