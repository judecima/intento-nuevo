# Holdout trim baseline audit — 2026-09-24

Base runtime: `d72d6f5729c4a65b15c168553b5815a760185f72`
Branch: `research/holdout-trim-baseline-20260924`

## Lepton XML semantics audit

Corpus:
- 15,787 XML;
- 15,787 project cases;
- 0 parse errors;
- 0 ambiguous trim cases.

Trim distribution:
- 5 x 5 mm: 8,851;
- 10 x 10 mm: 5,367;
- 0 x 0 mm: 1,139;
- 15 x 15 mm: 345;
- 3 x 3 mm: 85.

Therefore 14,648 / 15,787 cases (92.785%) use non-zero trim.

Historical quality cohorts:
- better: 1,353 cases, 1,317 non-zero trim (97.339%);
- equal: 14,034 cases, 12,951 non-zero trim (92.283%);
- worse: 72 cases, 52 non-zero trim (72.222%);
- unknown: 328 cases, all 328 non-zero trim.

Conclusion: historical candidate-vs-Lepton board-count and latency claims produced with project trim effectively zero are provisional. The corrected holdout baseline must be recomputed before furniture LP/pricing research.

## 5456195

The corpus-wide audit resolves the pending serial fairness semantics:
- Lepton boards: 7,680;
- trim X/Y: 10 / 10 mm;
- kerf: 4.4 mm;
- Lepton rotation observed: yes;
- portrait rate: 21.875%.

The old zero-trim serial result is not a final like-for-like comparison.

## Corrected runtime path

The frozen full-runtime validator now supports:
- `--respect-project-trim`: infer Lepton trim from project XML before constructing the optimizer input;
- `--ids-file PATH`: run a selected cohort only.

Smoke cohort:
`research/optimizer/holdout-trim-smoke-ids.txt`

Smoke:
```powershell
npm run optimizer:validate:auto:lepton-trim -- `
  --input "validation-full/serial-production-audit/_extracted" `
  --ids-file "research/optimizer/holdout-trim-smoke-ids.txt" `
  --output "validation-full/trim-corrected-smoke" `
  --progress-every 1
```

Full corrected candidate baseline:
```powershell
npm run optimizer:validate:auto:lepton-trim -- `
  --input "validation-full/serial-production-audit/_extracted" `
  --output "validation-full/trim-corrected"
```

Do not start furniture LP/pricing experiments until the corrected baseline is available.


## Canonical parser correction

`parseCanonicalXml()` now supports an explicit `projectTrimMode`:
- `"zero"` (default): preserves historical production behavior;
- `"infer"`: reconstructs project trim X/Y from Lepton level-1/2 node trim values after root-direction resolution.

The corrected holdout runner uses `projectTrimMode: "infer"` from parse time; it no longer mutates `parsed.case.trim` after canonicalization.

Contract tests cover:
- historical default remains 0 x 0;
- real project fixture infers and applies 5 x 5;
- ambiguous trim fails with `project-trim-ambiguous`.

## Secondary cohorts

From the semantics rows:
- 328 historical cases have no candidate-vs-Lepton comparison;
- 1,709 cases with >=5 pieces show no rotation in Lepton;
- of those no-rotation cases: 61 historical better, 1,627 equal, 0 worse, 21 unknown.

The audit now emits:
- `IDS_UNKNOWN.txt`;
- `IDS_ROTATION_REVIEW.txt` (the 61 historical better cases where Lepton did not rotate);
- material names per case, to review wood/decor grain risk;
- `IDS_FURNITURE_LE75.txt`;
- `IDS_OVER75.txt`;
- `IDS_ZERO_PIECES.txt`.

The current corpus split by physical Lepton boards is:
- 15,760 cases with <=75 boards and at least one piece;
- 26 cases with >75 boards;
- 1 zero-piece project.

The corrected product baseline should therefore be run first on `IDS_FURNITURE_LE75.txt`, while >75-board jobs are analyzed separately.


## Full corrected holdout run — semantic blocker

The first full furniture rerun with `projectTrimMode="infer"` completed 15,443 selected XML:
- 14,504 OK;
- 937 runtime exceptions;
- 2 canonical parse skips;
- candidate vs Lepton among OK rows: 1,078 better / 13,192 equal / 234 worse;
- raw net among OK rows: 687 boards saved.

This is **not yet the official matched-refilado baseline**.

Two independent contradictions show that treating Lepton `trim` as a globally reduced rectangular frame is not yet validated:

1. All 937 runtime failures occur on non-zero trim cases in the paired semantics audit:
   - 837 with 5 x 5;
   - 91 with 10 x 10;
   - 8 with 15 x 15;
   - 1 with 3 x 3.
   Their historical zero-trim outcomes were 99 better / 837 equal / 1 worse.

2. Among the 14,504 successful rows, **123 cases have candidate safe lower bound > physical Lepton board count**. All 123 were historical `equal -> worse` transitions after enabling trim. If restrictions were equivalent and the lower bound remained valid, this is impossible. These 123 contribute 333 boards of apparent regression.

Large examples:
- 5504203: old 75, Lepton 75, matched-global-trim candidate 113, LB 113;
- 5531188 / 5532387: old 24, Lepton 24, candidate 56, LB 56;
- 5453025: old 12, Lepton 12, candidate 30, LB 30;
- 5468441: old 4, Lepton 4, candidate 12, LB 12.

The strong/DFF lower-bound code explicitly uses
`W = placaBase - refiladoX` and `H = placaAltura - refiladoY`, so the contradiction can come from either:
- incorrect global-frame interpretation of Lepton trim; or
- a lower-bound validity bug for non-zero trim.

Do not classify the 234 current worse cases as algorithmic gaps yet.

Paired results on the 14,504 successful cases:
- old net on same cases: 1,250 boards;
- current raw net: 687;
- apparent trim effect: 563 boards (45.0% of paired old advantage).

But 123 internally contradictory rows account for 333 boards of apparent loss. Excluding only those contradictions (diagnostic only, not a certified baseline) leaves 14,381 rows with a 1,020-board net advantage (~2.20%).

One-board losses are also contaminated:
- current Lepton=1 worse cases: 155;
- old 1 -> new 2: 105;
- old 1 -> new 3: 15;
- old 2 -> new 2: 35.
Therefore the current 1->2 increase cannot yet be treated as a real generation gap.

Next gate:
1. audit Lepton far-edge usage for the union of:
   - 937 runtime failures;
   - 123 rows with lowerBound > Lepton;
2. determine actual trim semantics;
3. validate/recompute DFF/strong lower bounds under that semantics;
4. rerun only the affected cohort before declaring the holdout baseline official.
