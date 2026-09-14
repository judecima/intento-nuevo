# Industrial Portfolio V1.5 — residual closure checkpoint (2026-09-14)

## Scope and invariant
This is a research checkpoint only. No file under `src/lib/optimizer/**` is modified.

Frozen objective remains lexicographic:
1. minimize board count;
2. at equal board count maximize official commercial-remnant quality;
3. never add a board to improve remnant;
4. preserve complete industrial guillotine validity;
5. fall back whenever the fast/specialized path is not certification-safe.

## Canonical corpus binding
The strict canonical XML parser accepts **8,650** cases from the 8,669 XML archive.
The remaining 19 are input/preprocessing cases, not optimizer misses:
- 13 `mixed-board-formats`: must be split by stock/material format before optimization;
- 6 malformed XML: rejected as invalid input.

## V1.5 specialized router
Order is deliberately conservative:
1. `COMMON_BAND`
2. monotype -> existing monotype route
3. `GUIDE_HUB`
4. `REPEATED_STRIPS`
5. `PARTIAL_COMMON_BAND`
6. `WEAK_REPEATED_STRIPS`
7. `LARGE_REPEATED_STRIPS`
8. `WEAK_PARTIAL_BAND`
9. otherwise `NOT_APPLICABLE`

Strict canonical counts:
- `COMMON_BAND`: 144
- `GUIDE_HUB`: 1,291
- `REPEATED_STRIPS`: 1,903
- `PARTIAL_COMMON_BAND`: 478
- `WEAK_REPEATED_STRIPS`: 2,060
- `LARGE_REPEATED_STRIPS`: 725
- `WEAK_PARTIAL_BAND`: 181
- monotype existing route: 860
- no dominant specialized family: 1,008

Specialized industrial families therefore cover **6,782 / 8,650 = 78.40%**.
Including the existing monotype route, **7,642 / 8,650 = 88.35%** of canonical cases have a direct structural path.
The remaining **1,008 / 8,650 = 11.65%** stay explicitly generic.

## LARGE_REPEATED_STRIPS v1
Signal:
- 20–40 logical types;
- at most 160 physical pieces;
- at least 2 repeated narrow types;
- repeat count >=2;
- narrow side <=25% of a legal board axis;
- repeated-strip quantity >=70% of total demand.

Generation uses three deterministic complete full-order round-0 constructions: seeds `1000,1004,1005`, `pases=2`, preserving the industrial mechanisms in `motor.cjs`. The complete incumbent is retained by board count then official remnant quality.

Seed `1005` is not arbitrary: prior A/B found a remnant-quality edge case (`4043260`) where `[1000,1004]` kept board count but lost quality; seed `1005` recovered Legacy quality.

Evidence:
- prior physical-corpus pass: 725/725 candidates geometrically/guillotine valid;
- the five historical-board-count risk cases were checked against current Legacy and were not regressions (four improved current Legacy by one board; one tied boards and improved remnant);
- strict-canonical rerun in this checkpoint reached 281/725 with 281/281 valid before the work-budget cut. It was stopped rather than spending additional CPU duplicating the already-complete physical pass.

## WEAK_PARTIAL_BAND v1
Signal:
- best exact shared width/height covers >=40% and <60% of logical types;
- 3–19 logical types;
- at most 160 physical pieces.

Generation uses four cheap deterministic focused calls (`1000,1001,1004,1020`) plus one deterministic Rescue escalation. The 19-type ceiling is an anti-regression gate; the 20-type border had a remnant-quality regression during research.

Strict canonical pass:
- **181/181** complete industrial incumbents valid;
- 0 generator errors;
- median generation CPU **21.179 ms**;
- p95 **65.886 ms**;
- max **155.371 ms**.

## Generic Fast Incumbent — latency layer, not promotion family
The 1,008 cases with no dominant industrial family are not mislabeled as a new family. They receive an optional latency-first incumbent:
- full order, seed `1000`;
- `pases=1`;
- `restartsPorPlaca=2`;
- Beam off;
- Rescue off;
- MultiVariantes off.

This layer is explicitly **not certified to replace the final optimizer**. Telemetry carries `requiresFallbackCertification=true`.

Exhaustive strict-canonical residual pass:
- **1,008/1,008** complete industrial incumbents valid;
- 0 geometry/guillotine failures;
- overall median CPU **65.424 ms**, p95 **451.476 ms**, p99 **1,329.433 ms**;
- <=160 pieces (764 cases): median **36.076 ms**, p95 **183.897 ms**, max **303.184 ms**;
- >160 pieces (244 cases): median **250.684 ms**, p95 **1,199.318 ms**, max **14,106.127 ms**.

Recommended execution class:
- <=160 pieces: synchronous first response candidate;
- >160 pieces: worker/background candidate due tail latency;
- in both classes: existing full pipeline remains mandatory for certification/improvement.

Why fallback remains mandatory: on 373 cases compared with a more complete single full-order industrial round, Fast Incumbent had 18 +1-board outcomes; at equal board count it had 161 worse-remnant outcomes. Median CPU saving was ~92.54%, so it is valuable for UX, not as the final answer.

## Monotype
The existing one-logical-type route was evaluated over all 860 strict-canonical monotype cases:
- 860/860 valid;
- median CPU **0.552 ms**;
- p95 **20.354 ms**.

## Residual closure
All 8,650 canonical cases now have an explicit execution class:
- 6,782 specialized industrial-family candidates;
- 860 monotype direct path;
- 1,008 generic Fast Incumbent + mandatory full fallback/certification.

All 8,669 archive XML are also accounted for when preprocessing is included:
- 8,650 canonical optimizer cases;
- 13 mixed-stock/material-format XML -> split before optimizing;
- 6 malformed XML -> reject with validation error.

This is **100% routing/accounting**, not 100% optimization certification. No claim is made that every fast incumbent equals Legacy/current-pipeline optimality.

## Regression
Research suite for the available extracted snapshot: **67/67 PASS** including H0/H1/H2/B0.1 relevant tests plus V1.5 residual-family tests.

## SaaS execution architecture implied by V1.5
`parse/normalize -> structural router -> specialized/monotype or Fast Incumbent -> industrial validator -> immediate UI result -> full current pipeline/rescues -> replace only if board count or equal-board remnant quality improves`.

This preserves perceived latency without weakening the frozen business objective.
