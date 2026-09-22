# R3-M Integrated V10 A/B — 2026-09-22

Status: INTEGRATED RESEARCH PASS / DEFAULT OFF / NOT PRODUCTION-PROMOTED

Branch: `research/perfv3-industrial-incremental-20260922`

## Purpose

Validate the disabled R3-M V10 integration wrapper itself, not only the isolated Guide-Row candidate.

Requirements:
- all frozen 438 R3-M hits must certify;
- 0 board losses;
- 0 equal-board remnant regressions;
- physical validity and exact demand preserved;
- fallback misses must return current V3-equivalent output;
- production default remains unchanged.

## Implementation

Wrapper:
- `research/optimizer/pattern-generators/guide-row/integrated-v10-r3m.mjs`
- commit: `6095ad25b293ac29ca57e0a21f6da0ca97978dd6`

A/B harness:
- `research/optimizer/pattern-generators/guide-row/r3m-integration-ab.mjs`
- commit: `6cab3c99f3fe02428aa9d74f114163b4b899d207`

Workflow:
- `.github/workflows/optimizer-guide-row-r3m-integration.yml`
- commit: `c5266443a467b51a198d2186be00cf2cc027b657`

GitHub Actions:
- run: `35757630324`
- conclusion: SUCCESS

## Frozen 438-case result

Compared:
- 438

Correctness:
- integrated errors: 0
- reference errors: 0
- uncertified expected hits: 0
- board losses: 0
- remnant regressions: 0
- remnant equal: 435
- remnant better: 3

Timing:
- integrated total: 6,486.832 ms
- V3 reference total: 16,866.595 ms
- total saving: 61.54%
- aggregate speedup: 2.60x
- integrated p50: 6.934 ms
- V3 p50: 15.162 ms
- p50 saving: 54.27%
- integrated p95: 52.321 ms
- V3 p95: 138.069 ms
- p95 saving: 62.10%

The small difference versus the isolated R3-M benchmark is expected orchestration / runner variance. The integrated path still preserves a material speedup.

## Fallback parity

Three explicit misses were tested with the experimental flag ON:

1. monotype
   - reason: TYPE_COUNT_OUTSIDE_2_3
   - wrapper boards = V3 boards
   - official remnant parity
   - physical placement digest equal

2. directional/grained
   - reason: DIRECTIONAL_EXCLUDED
   - wrapper boards = V3 boards
   - official remnant parity
   - physical placement digest equal

3. multitype low-branching miss
   - reason: NATURAL_STATES_GT_3
   - wrapper boards = V3 boards
   - official remnant parity
   - physical placement digest equal

Therefore the integration contract is behaving as intended:
- certified narrow region -> early return;
- every tested miss -> current V3 fallback.

## Decision

R3-M integrated wrapper: PASS as disabled research integration.

Not production-promoted yet because:
- current 16,986-case corpus was used during R3 tuning;
- the next user-provided ~20k corpus is still reserved as sealed external validation;
- directional/grained requests remain outside the certification rule;
- monotype remains a separate remnant-concentration problem.

## Next

1. keep wrapper disabled by default;
2. preserve frozen R3-M thresholds and polish parameters;
3. use the next ~20k user corpus as sealed external validation without retuning;
4. if sealed validation has 0 board losses and 0 remnant regressions, R3-M can be considered for production promotion;
5. separately continue monotype concentrated-remnant work and directional validation.
