# Trim semantics — full-corpus closure — 2026-09-25

Branch: `research/holdout-trim-baseline-20260924`

Parent commit audited: `acf04768277da7783dcbac0b97e69ccc52e044ba`

## Reproduction inputs

The audit was reconstructed from the four sealed holdout ZIPs:
- `validacion_v2_1.zip`
- `validacion_v2_2.zip`
- `validacion_v2_3.zip`
- `validacion_v2_4.zip`

Corpus:
- 15,787 project XMLs.
- Trim distribution reproduced exactly: 5x5 = 8,851; 10x10 = 5,367; 15x15 = 345; 0x0 = 1,139; 3x3 = 85.

The independent local checker was first calibrated against the committed JS semantics on the existing 1,660-case gate:
- 1,660 / 1,660 rows matched for physical board count;
- 1,660 / 1,660 matched for physical piece count;
- 1,660 / 1,660 matched for inferred trim;
- 1,660 / 1,660 matched for far-edge flags;
- 1,660 / 1,660 matched for both trim-rule outcomes;
- reproduced `globalFarInset = 594 pass / 1,066 fail`;
- reproduced `factoryEdgeOrReserve = 1,660 pass / 0 fail`.

## Literal first full-corpus result

Before correcting audit-domain handling:
- `globalFarInset`: 14,558 pass / 1,229 fail; 2,571 violating physical boards.
- `factoryEdgeOrReserve`: 15,785 pass / 2 fail; 2 violating physical boards.
- apparent failing IDs: `5433805`, `5462022`.

Neither apparent failure contains an observed product-piece margin in the forbidden interval `0 < margin < trim`.

### 5433805

- Lepton XML reports 3 physical boards and 32 product pieces.
- The first two boards contain all 32 terminal product pieces.
- Panel 3 contains no terminal type=1 product placement at all.
- Therefore right/bottom product margins are undefined for that board.
- The corrected runtime candidate places the same 32 pieces on 2 valid boards; Lepton reports 3.

Conclusion: panel 3 is not geometric evidence for or against trim. It is a no-product board and the rule is not applicable to it.

### 5462022

This is the already-known malformed XML from the sealed holdout manifest.

The XML contains five terminal type=1 references (IDs 3..7), but none of those child nodes exists in the XML. There is therefore no terminal placement geometry to audit.

Conclusion: this is invalid/unresolvable input, not a trim-rule counterexample.

## Corrected audit-domain rule

For each physical board:

1. If terminal product references exist but their child geometry is missing, the project is an audit error / invalid input.
2. If the board contains zero terminal product placements, trim geometry is N/A for that board.
3. Otherwise, for each far axis:
   - margin == 0 is allowed as factory-edge use;
   - margin >= declared trim is allowed as reserved trim;
   - 0 < margin < trim is rejected.

This preserves the actual `factoryEdgeOrReserve` geometry rule; it only makes its observation domain explicit.

Expected corrected full-corpus gate:
- XML files discovered: 15,787.
- Auditable project XMLs: 15,786.
- Known invalid/unresolvable XMLs: 1 (`5462022`).
- N/A physical boards with zero terminal product placements: 1 (panel 3 of `5433805`).
- `factoryEdgeOrReserve.failingCases = 0`.
- `factoryEdgeOrReserve.violatingPhysicalBoards = 0`.
- `globalFarInset.failingCases = 1,227`.
- `globalFarInset.violatingPhysicalBoards = 2,569`.

## Decision

Observed Lepton trim geometry is closed as:

`factory edge OR reserve trim`

for every product-bearing board with observable terminal geometry.

This is still not a plant-policy decision. Product policy remains explicitly split as:
- `mandatory`
- `factoryEdgeAllowed`

The next milestone is to implement this policy coherently across every geometry consumer before rerunning the 15,443 furniture holdout and requiring `count(lowerBound > LeptonBoards) == 0`.

No optimizer motor heuristic was changed in this closure.
