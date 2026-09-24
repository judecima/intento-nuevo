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
