# V15 F1 attribution — corrected with fixed trim 10/10

## Scope

This rebuild fixes the F1 cohort with the requested production test trim:

- `refiladoX = 10`
- `refiladoY = 10`
- F1: `boards40 == areaLB(trim10/10) + 1`
- heavy: `pieces >= 20 && types >= 8`
- holdout: 2000 historical orders
- canonically consistent: 1826

The old recovered 156-case cohort used trim 0/0 and is retained only as historical evidence. It must not be quoted as the corrected production-like cohort.

## Corrected cohort

Eligible heavy F1 cases: **136**

| Method | Certified |
|---|---:|
| V14 Strong LB | 4 / 136 |
| Cheap Hybrid | **40 / 136** |
| Full Hybrid + Raster | **42 / 136** |
| Raster incremental | 2 |

## Individual-term attribution

| Term | reaches incumbent | unique |
|---|---:|---:|
| Kerf | 30 | 0 |
| DFF | **39** | **5** |
| Projection | 4 | 0 |
| Clique | 2 | 0 |
| Raster | 33 | 2 |

Binding among the 40 cheap-hybrid certifications:

- Kerf: 30
- DFF: 9
- Area/tie inherited from hybrid max: 1

Interpretation: Kerf remains the dominant binding term in the cheap cascade, but DFF has the strongest standalone reach and contributes unique certificates. Projection/Clique remain safe support terms but have low marginal value in this corrected heavy-F1 cohort. Raster adds only 2 certificates and should remain conditional.

## Safety case

The known late-round case remains inside the corrected cohort:

```text
4058501
areaLB(trim10/10) = 7
20 rounds = 9 boards
40 rounds = 8 boards
```

Therefore the 21..40 fallback remains mandatory whenever no mathematical certificate closes the incumbent.

## Decision

Use the 136-case trim-10/10 cohort for future F1-heavy attribution. Do not use the old 156-case trim-0/0 percentages as production-like evidence.
