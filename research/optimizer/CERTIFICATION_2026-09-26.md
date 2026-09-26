# Optimizer consolidation checkpoint — 2026-09-26

Base estable de producto:
- branch: feature/optimizer-saas-hardening-20260923
- commit: d72d6f5729c4a65b15c168553b5815a760185f72

Candidato de investigación validado:
- commit: 0c1970736e6802001cb441a06341566713ccd958
- runtime: V2 / Auto / Rust / remnant polish
- cohort: muebles Lepton <= 75 placas

Resultado completo:
- XML seleccionados: 15,443
- canónicos válidos: 15,441
- skips de parser: 2
- failures: 0
- runtime exceptions: 0
- candidate invalid: 0
- lowerBound > Lepton: 0
- mejor que Lepton: 1,171 (7.584%)
- igual a Lepton: 14,179 (91.827%)
- peor que Lepton: 91 (0.589%)
- placas netas ahorradas vs Lepton: 1,140

Distribución de los 91 gaps:
- 90 casos: +1 placa
- 1 caso: +6 placas
- caso +6: 5502759, Lepton 56, candidato 62, LB 54, stop certified-industrial-p3 tras 3 rondas

Performance:
- p50 wall: 355.716 ms
- p90 wall: 4,604.125 ms
- p95 wall: 10,439.900 ms
- p99 wall: 32,816.721 ms
- max wall: 220,340.884 ms

Semántica certificada:
- espacio útil = tablero físico - trim
- el trim no es kerf exterior adicional
- en XML project, una terminal usa part.cut y el span neto del nodo hijo
- los sentinelas 5468441 y 5504203 recuperaron 4/4 y 75/75

Esta rama nace del último baseline estable de producto y no incorpora en bloque los commits experimentales de research.
Sólo consolida el parser canónico final, tests y harnesses necesarios para reproducir la validación.
