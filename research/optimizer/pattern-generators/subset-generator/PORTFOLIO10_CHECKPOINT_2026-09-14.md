# Portfolio10 current-canonical checkpoint

Research-only checkpoint. This does **not** modify `src/lib/optimizer/**` and is not a production promotion.

## Canonical-order correction

The earlier `8ac6080` Directed10 checkpoint used a manually recovered `4006648` fixture whose piece order differs from the deterministic order produced by the current `parseCanonicalXml` pipeline. Legacy masks are indexed by piece position, so that ordering difference is algorithmically material. Re-running the old selector on the current canonical order gives `Fast=12`, `Rescue28=10`, `Directed10=12`.

The older checkpoint is retained as historical research evidence, but it is **superseded as current-parser validation** by this checkpoint.

## Portfolio10

Ablation on current-canonical difficult cases showed that useful contexts are complementary and that per-mask scores are fragile. A fixed ten-round portfolio was therefore tested instead of another adaptive selector:

```text
0, 8, 12, 16, 17, 19, 26, 33, 35, 37
```

It uses the existing Rescue14 policy (2 passes, 14 restarts per board, Rescue ON, Beam OFF) only on those ten Legacy masks. There is no per-case probe or ranking overhead.

On current-canonical `4006648`:

```text
area LB      9
Fast        12
Rescue28    10
Portfolio10 10
```

## Current-parser MID_DENSITY gate

The corpus was reparsed with the current canonical parser: 20,818 XML total, 20,783 accepted and 35 mixed/malformed inputs excluded. The gate uses parts 1–6, `project` cases, at most 160 physical pieces, at least 20 logical types, and strip density `0.50 <= density < 0.70`, where a strip type has `cant >= 2` and aspect ratio at least 2. Only cases with `Fast > area lower bound` enter the open cohort.

This produces exactly **90 open current-parser MID_DENSITY cases**. Exact geometry/config deduplication leaves 67 unique inputs. Area-bound certification plus deduplication reduces the expensive Rescue28 control to 60 unique comparisons.

Quality result over all 90 cases:

| Metric | Result |
| --- | ---: |
| Portfolio10 worse than Rescue28 | **0** |
| Portfolio10 equal to Rescue28 | 87 |
| Portfolio10 better than Rescue28 | **3** |
| Portfolio10 improvements vs Fast | **14** |
| Rescue28 improvements vs Fast | 11 |
| Portfolio10 reaches area LB | 7 |

The three case-level wins over Rescue28 are `Damian_Vazquez4129718`, its duplicate geometry `Damian_Vazquez4129782`, and `Luis Alberto_Cuevas4073456`; that is two unique geometry/config wins.

One case (`Rodolfo Dario_Gonzalez4108232`) exhausts the Master under both Portfolio10 and Rescue28 at 17 boards versus area LB 15. It is therefore not evidence of optimality, but it is also not a Portfolio10 regression.

## Serial CPU telemetry

Four representative same-host serial comparisons produced speedups from **1.81x to 3.10x**, with sample median **2.46x**, while preserving board count. Timings are telemetry and are deliberately not asserted in tests.

## Regression smoke

Existing smoke suite remained green: frontier 9/9, tiny oracle 2/2, cut policy 2/2, and-or 18/18, H2 repeat 1/1 — **32/32 PASS**. Whole-project typecheck was not run because the recovered snapshot has no installed `node_modules`.

## Decision

Portfolio10 passes this research gate and is strictly more defensible than the adaptive Directed10 checkpoint for the current parser. It still remains research-only. The next gate is the broader open heterogeneous cohort / other density families plus clean serial p50/p95 before any integration into production runtime.
