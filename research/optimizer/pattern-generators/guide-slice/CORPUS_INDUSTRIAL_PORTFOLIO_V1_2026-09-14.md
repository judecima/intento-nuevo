# Industrial Portfolio V1 — resto.zip corpus pass (2026-09-14)

## Scope
- Corpus: `resto.zip`, 8,669 XML; 8,663 parsed, 6 parse errors.
- Portfolio frozen at branch checkpoint `74f6650a7b2d96b3050f4657daceb44e57d12ce5` for the measured pass.
- No production path under `src/lib/optimizer/**` modified.

## Classification
Raw gate: NOT_APPLICABLE 6,366; GUIDE_HUB 2,153; COMMON_BAND 144.
Corpus pass exposed a gate bug: 862 GUIDE_HUB cases are monotype and cannot produce guide/hub pairs. Excluding them leaves **1,435 effective activable cases** (1,291 GUIDE_HUB + 144 COMMON_BAND).

## End-to-end on 1,435 effective activable cases
- 798 valid industrial plans.
- 515 no exact coverage: explicit fallback required.
- 122 input/infeasible errors under current trim/config.
- Every solved candidate passed geometry and complete guillotine sequence.
- Portfolio generation CPU across all 1,435 evaluated cases: **4,948.154 ms**.
- GUIDE_HUB solved median generation CPU: **0.301 ms**, p95 8.79 ms.
- COMMON_BAND solved median: **3.888 ms**, p95 32.352 ms.

798 / 8,663 = **9.21%** of parseable corpus currently produces a valid candidate plan using only the two industrial families. This is replacement *potential*, not a promotion rate; full current-optimizer A/B has not been run for every one of these cases.

## Historical panel count (diagnostic only)
Among the 798 valid candidates: 710 equal to historical XML panel count, 12 fewer, 76 more. Historical XML is not a strict oracle; these 76 are clustering candidates, not confirmed regressions.

## Why not run Legacy-40 over all 8,669 every iteration
A fresh GUIDE_HUB example with 43 pieces / 3 types consumed ~9,992 ms CPU in Legacy 40+monotype generation. A stratified batch already becomes operationally expensive. The efficient workflow is: full cheap corpus scan, then targeted Legacy A/B for candidates and cluster representatives.

## Next family map among 6,366 NOT_APPLICABLE
- REPEATED_STRIPS: 3,705
- HETEROGENEOUS_HIGH_TYPES: 736
- PARTIAL_COMMON_BAND: 728
- OTHER: 710
- MODERATE_HUB: 487

Known sentinels line up with this map:
- 4050594 → REPEATED_STRIPS
- 4020442 → REPEATED_STRIPS
- 4058501 → REPEATED_STRIPS under this simple structural classifier
- 4059200 → HETEROGENEOUS_HIGH_TYPES

## Recommended sequence
1. Fix monotype routing (existing monotype path, not Guide-Slice).
2. Build **REPEATED_STRIPS** next: it is the largest uncovered structural cluster and contains 4050594 / 4020442 / 4058501.
3. Then **PARTIAL_COMMON_BAND** (>4 types or only a dominant subset sharing the band dimension).
4. Then **MODERATE_HUB** (hub ratio ~0.35–0.50).
5. Leave heterogeneous high-type cases for a later specialized family / fallback until a repeatable physical structure is identified.

Each family must be developed on representative gold cases, then rerun frozen on all 8,663 parseable cases before changing another rule.
