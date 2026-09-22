# H1 - Effective Branching Audit - 2026-09-22

Status: CLOSED AS DISCOVERY / NOT PROMOTED

Branch: research/perfv3-industrial-incremental-20260922

## Scope

This closes H1 from CURRENT_PROGRESS_2026-09-22.md. It does not modify src/lib/optimizer/** and does not promote a new production gate.

Frozen objective remains:
1. minimum board count;
2. at equal boards, commercial remnant quality;
3. fragmentation;
4. only then latency.

Rejected investigations remain rejected.

## Corpus recovery

The reconstructed corpus matches the checkpoint exactly:
- historical canonical: 20,842 valid, 2 invalid inputs;
- new XML: 16,992 total;
- new valid: 16,986;
- new excluded: 6, all mixed-board-formats;
- combined H1 mining base: 37,828 valid cases.

The next user-supplied ~20k remain sealed.

## H1 metric

H1 v1 is geometry-only discovery telemetry. It does not infer grain from material names.

For every logical guide family and fitting geometric orientation:
1. collapse quantity to the maximal natural repetition along the row;
2. compute residual row width after kerf;
3. count logical successor families that physically fit residual width and guide-row height;
4. group successors with identical unordered rectangle geometry into one residual-effect class;
5. record whether one successor family can repeat to close the residual within max(kerf, 0.6 mm);
6. aggregate median, p95 and maximum branching per case.

Because project XML does not authoritatively encode the current per-piece rotation override, both orientations are used as a geometry-only upper envelope. H2 must use runtime canRotate / grain state.

## 37,828-case distribution

| Metric | p50 | p95 | p99 |
|---|---:|---:|---:|
| logical types | 8 | 42 | 79 |
| pieces / type | 2.25 | 9.00 | 29.33 |
| guide successor max | 6 | 40 | 77 |
| residual successor median | 3.5 | 27 | 52 |
| residual successor p95 | 6 | 39 | 76 |
| residual effect-class max | 6 | 36 | 65 |
| equivalence compression | 0% | 26.15% | 38.77% |
| residual closure rate | 0% | 13.64% | 22.48% |

The tail is real: raw piece count does not describe how many physically plausible continuations survive after a repeated guide family is compressed.

## Historical Master-C relation

Historical Master-active candidates partition under accepted A/B rules as:
- A: 405;
- B: 124;
- C: 1,168;
- C board-count wins: 43.

Spearman correlation with masterMs inside Master-C:

| Metric | rho |
|---|---:|
| piece count | 0.8203 |
| type count | 0.7217 |
| guide successor max | 0.6493 |
| successor max | 0.6490 |
| effect-class max | 0.6336 |
| successor p95 | 0.6135 |
| effect-class p95 | 0.5973 |
| top-3 quantity share | -0.5653 |

A deterministic 5-fold log-cost sanity model:

| Features | CV log-R2 | MAE |
|---|---:|---:|
| piece count only | 0.6528 | 1,839 ms |
| raw demand descriptors | 0.7557 | 1,580 ms |
| raw + residual branching | 0.7947 | 1,488 ms |

Conclusion: effective branching adds information; it is not a replacement for piece count.

## Frozen Rule-C discovery candidate

Across the 43 historical Master-C wins:
- max guideSuccessorMax: 33;
- max successorP95: 32;
- max effectClassMax: 33.

Discovery candidate guideSuccessorMax >= 35:
- 47 historical Master-C cases;
- 0 wins;
- 348,159 ms Master CPU;
- 8.84% of Master-C CPU.

This threshold is NOT promoted. It is data-derived and must be blind-validated on the current new corpus with Full40 board parity and equal-board remnant parity.

Previously documented zero-win union:
- 266 cases;
- 0 wins;
- 591,299 ms;
- 15.02% of Master-C CPU.

Union plus guideSuccessorMax >= 35:
- 294 cases;
- 0 wins;
- 801,907 ms;
- 20.36% of Master-C CPU.

The H1 condition adds 28 cases and 210,608 ms, another 5.35 percentage points of historical Master-C CPU.

## Sentinel 4961912

Use the current versioned fixture / current uploaded XML: 31 types, 61 pieces. The older historical canonical row with the same numeric order has 34 types and must not be used as the H2 sentinel.

H1 on the current 31-type fixture:
- pieces: 61;
- types: 31;
- max quantity: 6;
- pieces/type: 1.97;
- guide-successor median: 26;
- guide-successor max: 30;
- residual-successor median: 21;
- residual-successor p95/max: 30 / 30;
- residual-effect-class median/max: 21 / 30;
- residual closure rate: 3.23%.

This explains why 4961912 is a useful H2 stress case: moderate piece count, but high residual fan-out after quantity compression.

A research-only sanity run against the available legacy motor snapshot also placed all 61 pieces in 2 boards, matching LB=2. This supports the early-construction/certification direction only; it is not a current-V3 latency benchmark and does not certify remnant optimality.

## H1 decision

Accepted as telemetry / discovery:
- residual successor and effect-class metrics;
- maximal natural guide repetition as the first compressed residual state;
- guideSuccessorMax >= 35 frozen for H3 validation only.

Not accepted:
- no Master skip from H1 alone;
- no new fixed round cutoff;
- no material-name grain inference;
- no local-fill dominance rule that can worsen remnant.

## Next

H2 - Guide-Row / Residual Builder, research-only and not wired to production.

H2 must:
1. consume effective runtime orientation semantics, including explicit canRotate=true override;
2. prioritize maximal natural guide repetition;
3. filter physically impossible successors before expensive construction;
4. group geometry-equivalent residual effects without merging logical demand identity;
5. retain remnant-aware alternatives rather than pruning solely by local fill;
6. validate on current 4961912, existing Master wins and seven Lepton-gap sentinels;
7. remain disabled until 0 board regressions and 0 equal-board remnant regressions are demonstrated.
