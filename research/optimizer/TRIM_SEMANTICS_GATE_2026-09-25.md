# Trim Semantics Gate — 2026-09-25

## Result

The 1,660-case gate strongly rejects the interpretation "trim means shrink the full usable rectangle by trim on each audited far axis" and fully supports the candidate rule "factory edge OR reserved trim" on this cohort.

### Cohort

- 1,060 problem cases:
  - 937 runtime failures under global trim
  - 123 cases with candidate lower bound > Lepton boards
- 600 deterministic controls:
  - 400 equal vs Lepton
  - 200 better vs Lepton
- All 1,660 have non-zero, unambiguous Lepton trim.

### Geometry signal

Problem cohort:
- 1,060 / 1,060 touch a physical far edge in the Lepton layout.
- 0 / 1,060 violate the candidate `factoryEdgeOrReserve` rule.

Control cohort:
- only 6 / 600 touch a physical far edge.
- 0 / 600 violate the candidate `factoryEdgeOrReserve` rule.

Combined:
- `globalFarInset`: 594 pass / 1,066 fail = 35.783% pass.
- `factoryEdgeOrReserve`: 1,660 pass / 0 fail = 100% pass.
- 0 physical boards violate `factoryEdgeOrReserve`.

By trim, `factoryEdgeOrReserve` passes:
- 5×5: 1,273 / 1,273
- 10×10: 356 / 356
- 15×15: 27 / 27
- 3×3: 4 / 4

## Candidate rule under test

For each audited far axis:

- margin == 0: allowed, interpreted as use of the factory edge;
- margin >= declared trim: allowed, interpreted as reserving trim;
- 0 < margin < trim: rejected.

This is a geometry gate, not yet a product-policy decision.

## Interpretation

The 1,060 problematic cases are separated almost perfectly from the control cohort by whether the Lepton layout uses the physical far edge:

- problem: 100%
- controls: 1%

This supports the diagnosis that the current global reduced-rectangle model does not reproduce Lepton trim semantics.

The next gate is corpus-wide:
1. run the same read-only audit on all project XMLs;
2. require `factoryEdgeOrReserve.failingCases == 0`;
3. if the corpus-wide gate passes, implement one consistent trim policy across schema/factibility, generators, materialization, validator, and all lower bounds;
4. rerun the furniture holdout;
5. require zero cases with `LB > Lepton` before freezing the official baseline.

Do not mine A–F optimizer gaps from the global-trim run: that run contains geometry-semantic false losses.
