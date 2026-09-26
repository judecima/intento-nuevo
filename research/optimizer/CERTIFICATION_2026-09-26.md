# Optimizer official baseline — 2026-09-26

Base de producto previa:
- branch: feature/optimizer-saas-hardening-20260923
- commit: d72d6f5729c4a65b15c168553b5815a760185f72

Parser corregido de investigación:
- commit: 0c1970736e6802001cb441a06341566713ccd958

Baseline consolidado:
- branch: feature/optimizer-consolidated-20260926
- commit de código/harness final: a43204f1fb93ca1078efa0b0e631849837f0a82b
- runtime: V2 / Auto / Rust / remnant polish
- producto objetivo: muebles Lepton <= 75 placas

Validación:
- 15,443 casos comunes entre 0c197073 y 3b241b0: 0 diferencias funcionales caso por caso
- 317 casos adicionales recuperados tras corregir el parser de caseId del harness
- universo producto total: 15,760 casos
- canónicos válidos: 15,758
- parse skips heredados: 2
- failures: 0
- runtime exceptions: 0
- candidate invalid: 0
- lowerBound > Lepton: 0

Calidad agregada sobre 15,758 comparables:
- mejor que Lepton: 1,194 (7.577%)
- igual a Lepton: 14,472 (91.839%)
- peor que Lepton: 92 (0.584%)
- placas netas ahorradas vs Lepton: 1,162

Cohorte adicional de 317:
- mejor / igual / peor: 23 / 293 / 1
- placas netas ahorradas: 22
- único gap adicional: 5507446
  - Lepton 11
  - candidato 12
  - lower bound 10
  - 84 piezas / 5 tipos
  - trim 10x10
  - Master 40 rondas
  - stop: advanced-exhausted

Semántica certificada:
- espacio útil = tablero físico - trim
- el trim no se modela como kerf exterior adicional
- en XML project, una terminal usa part.cut y el span neto del nodo hijo
- los sentinelas 5431063, 5431285, 5468441 y 5504203 conservan 1/1, 2/2, 4/4 y 75/75

Nota de harness:
- audit-holdout-lepton-semantics.mjs y validate-production-runtime-full.mjs deben extraer caseId con la misma regla: primer bloque delimitado de 5+ dígitos
- el bug anterior elegía el bloque numérico más largo del filename y excluía 317 casos del --ids-file

Esta rama es la línea base oficial para iniciar furniture-engine.
No se reabre el corpus completo por cambios fuera de src/lib/optimizer/**, native/** o políticas runtime; primero se prueba equivalencia estructural y cohorte afectada.
