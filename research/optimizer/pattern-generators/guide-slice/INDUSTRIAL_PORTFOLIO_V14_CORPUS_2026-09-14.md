# Industrial Portfolio V1.4 — Weak Repeated Strips checkpoint (2026-09-14)

## Frozen family set
1. `COMMON_BAND`
2. `GUIDE_HUB`
3. `REPEATED_STRIPS`
4. `PARTIAL_COMMON_BAND`
5. `WEAK_REPEATED_STRIPS`
6. otherwise `NOT_APPLICABLE` -> existing fallback / downstream rescue pipeline

No file under `src/lib/optimizer/**` is modified.

## WEAK_REPEATED_STRIPS v1
Industrial signal:
- at least 2 repeated narrow piece types;
- repeat count >= 2;
- repeated-strip quantity >= 30% of total demand;
- narrow side <= 25% of a legal board axis;
- at most 19 logical types;
- at most 160 physical pieces.

Generation is intentionally not a weakened greedy constructor. It executes exactly two deterministic full-order round-0 constructions (`seed=1000` and `seed=1004`, `pases=2`) while preserving the industrial mechanisms already present in `motor.cjs`. The best complete incumbent is retained lexicographically: board count first, then official remnant quality.

The 19-type ceiling is an anti-regression gate. A known 20-type case (`4016855`) showed remnant-quality regression when the gate was broader. The 19-type cohort was then evaluated separately before promotion.

## Full weak-family corpus pass
New residual cases selected by the V1.4 gate: **2,060**.

- 2,060 / 2,060 valid complete industrial incumbents;
- 0 generator errors;
- 0 geometry failures;
- 0 incomplete guillotine sequences;
- generation CPU total: **587,591.586 ms**;
- median: **159.195 ms**;
- p95: **980.794 ms**.

Historical XML diagnostic only:
- 1,915 equal board count;
- 131 fewer boards;
- 14 one-board-higher than historical XML.

The 14 historical discrepancies were checked against current Legacy in the risk pass; they do not establish regressions against the current optimizer. Historical XML remains a diagnostic, not a strict oracle.

## Fresh A/B evidence
Across the accumulated A/B cohort under the final gate (`ratio>=30%`, `types<=19`), no board-count or remnant regression is known. The measured cohort showed roughly 90% median generation saving; the lowest observed saving remained materially positive.

Fresh representative at the 19-type boundary (`4026528`):
- Weak v1: 3 boards, 5 retained patterns, **890.918 ms CPU**;
- Legacy 40 + monotype: 3 boards, 96 patterns, **10,348.690 ms CPU**;
- generation saving: **91.39%**.

## Frozen sentinel caveat: 4058501
`4058501` is deliberately not part of the strong `REPEATED_STRIPS` family. V1.4 may classify it as `WEAK_REPEATED_STRIPS`; the weak family returns 9 boards, matching the isolated Legacy Pattern Master result. The frozen 8-board target belongs to the complete optimizer pipeline and still requires its downstream rescue/repair path. Therefore V1.4 is a pattern-generation portfolio checkpoint, not authorization to remove downstream fallback/rescue layers.

## Router coverage on all parseable resto.xml cases
Total parseable: **8,663**.

- `GUIDE_HUB`: 1,291
- `COMMON_BAND`: 144
- `REPEATED_STRIPS`: 1,905
- `PARTIAL_COMMON_BAND`: 479
- `WEAK_REPEATED_STRIPS`: 2,060
- `NOT_APPLICABLE`: 2,784

Total activation: **5,879 / 8,663 = 67.86%**.

Combining V1.3 candidate-valid evidence (3,238) with the 2,060 fully validated weak-family incumbents gives **5,298 candidate-valid cases = 61.16% of the parseable corpus**. This remains replacement potential, not a production promotion rate, until the complete current pipeline A/B gate is run for all promotion candidates.

## Regression
Research regression after V1.4 integration: **87/87 PASS** for the H0/H2/B0.1 relevant suite plus all five industrial-family tests.

Repository-wide `tsc --noEmit` was not a usable gate in this extracted runtime because development dependencies/types (`@playwright/test`, `vitest`, Node/Next types and others) are absent. Those failures pre-exist this research change; no TypeScript production file is modified by V1.4.

## Next
Freeze V1.4. Reclassify the remaining 2,784 cases. Do not widen `WEAK_REPEATED_STRIPS` beyond the current gates without a new A/B cohort. The next family should be chosen from the residual by structural concentration and Legacy generation cost.
