# Industrial Portfolio V1.3 — Partial Common Band checkpoint (2026-09-14)

## Frozen family set
1. `COMMON_BAND`
2. `GUIDE_HUB`
3. `REPEATED_STRIPS`
4. `PARTIAL_COMMON_BAND`
5. otherwise `NOT_APPLICABLE` -> existing fallback path

No file under `src/lib/optimizer/**` is modified.

## PARTIAL_COMMON_BAND v2
Industrial signal: at least 60% of piece types share one exact height or one exact width, with 3–20 types and at most 160 pieces.

Generation is bounded to five deterministic calls:
- four cheap focused calls: seeds `1000,1001,1004,1020`, 1 pass, 2 restarts, Beam/Rescue/MultiVariantes off;
- one escalation: seed 1000, 2 passes, adaptive restarts, Beam/MultiVariantes off, Rescue enabled where the legacy motor itself allows it.

The generator keeps a complete industrial incumbent. Objective is lexicographic: fewer boards first; at equal boards, official `calidadPlanPlacas/compararCalidad`.

## Why escalation exists
`4054100` proved that its two optimal Legacy boards already exist in round 0 on the full order. The missing component was not subset hiding: it was the deeper focused construction/Rescue path. Beam and MultiVariantes are not required.

Fresh 3x A/B:
- `4054100`: Legacy median 1054.487 ms CPU vs Partial 252.654 ms; 2 vs 2 boards; identical remnant; 76.04% generation saving.
- `4063272`: Legacy median 10210.700 ms CPU vs Partial 428.355 ms; 3 vs 3 boards; identical remnant; 95.80% generation saving.

## Corpus pass
8,663 parseable XML.

Router counts:
- GUIDE_HUB: 1,291
- COMMON_BAND: 144
- REPEATED_STRIPS: 1,905
- PARTIAL_COMMON_BAND: 479
- NOT_APPLICABLE: 4,844

Total activation: **3,819 / 8,663 = 44.08%**.

PARTIAL_COMMON_BAND specifically:
- 479/479 valid industrial incumbents;
- 0 geometry failures;
- 0 incomplete guillotine sequences;
- generation CPU total 16.855 s;
- median 23.213 ms, p95 104.094 ms.

Historical XML diagnostic: 467 equal board count, 9 fewer, 3 more. The three "more" cases were checked against current Legacy and are not regressions: Legacy uses the same board counts (4067840 4/4, 5001443 2/2, 4063282 2/2).

The 160-piece gate excludes the observed real regressions from the lightweight candidate: 4060744 and 4040363 (186 pieces, 16 candidate vs 15 Legacy) and 4029290 (283 pieces). These remain fallback cases.

Combining the V1.2 validated candidates with the 479 new valid incumbents gives **3,238 candidate-valid cases = 37.38% of the parseable corpus**. This is replacement potential, not a promotion rate.

## Regression
Research regression: **84/84 PASS**, including H0/H2/B0.1 relevant gates and all four industrial families.

## Next rule
Do not relax PARTIAL_COMMON_BAND further yet. Freeze V1.3 and classify the remaining 4,844 cases. The next family should be chosen from the residual by structural concentration and current Legacy cost, not by broadening a working gate.
