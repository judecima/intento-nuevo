#!/usr/bin/env python3
from pathlib import Path

p = Path('src/lib/optimizer/legacy/v10.cjs')
s = p.read_text()

if 'function intentarPolishV20(' in s:
    raise SystemExit('V20 safe wiring already present')

metrics_old = """    lowerBound: {\n      externalUsed: 0,\n      externalViolation: 0,\n      certifiedAfterBaseline: 0,\n      cheapRuns: 0,\n      cheapCertified: 0,\n      cheapViolation: 0,\n      cheapErrors: 0,\n      cheapMs: 0,\n      cheapValue: 0,\n      cheapReason: null,\n    },\n    total: { casos: 0, ms: 0 }\n"""
metrics_new = """    lowerBound: {\n      externalUsed: 0,\n      externalViolation: 0,\n      certifiedAfterBaseline: 0,\n      cheapRuns: 0,\n      cheapCertified: 0,\n      cheapViolation: 0,\n      cheapErrors: 0,\n      cheapMs: 0,\n      cheapValue: 0,\n      cheapReason: null,\n    },\n    remnantPolish: {\n      runs: 0,\n      valid: 0,\n      changed: 0,\n      attemptedBoards: 0,\n      improvedBoards: 0,\n      rejectedBoards: 0,\n      invalidFinal: 0,\n      errors: 0,\n      skipped: 0,\n      ms: 0,\n    },\n    total: { casos: 0, ms: 0 }\n"""
if metrics_old not in s:
    raise SystemExit('metrics anchor not found')
s = s.replace(metrics_old, metrics_new, 1)

anchor = "function calcularCotaBarataPostBaseline(lineas, config, baseline, metricas) {\n"
helper = """function intentarPolishV20(plan, config, piezasEsperadas, metricas) {\n  const m = metricas.remnantPolish;\n  const t0 = process.hrtime.bigint();\n  m.runs++;\n  try {\n    // Explicit false is a rollback switch. Safety means falling through to the\n    // legacy compactation path, never returning early without objective #2.\n    if (config.usarDefragRemanentePorPlaca === false) {\n      m.skipped++;\n      return { valido: false, plan };\n    }\n    const { defragmentarPlanPorPlaca } = require('../experimental/per-board-remnant-defrag.cjs');\n    const r = defragmentarPlanPorPlaca(plan, { piezasEsperadas });\n    m.attemptedBoards += +r.attemptedBoards || 0;\n    m.improvedBoards += +r.improvedBoards || 0;\n    m.rejectedBoards += +r.rejectedBoards || 0;\n    if (r.invalidFinal) {\n      m.invalidFinal++;\n      return { valido: false, plan };\n    }\n    const v = validarPlanIndustrial(r.plan, piezasEsperadas);\n    if (!v || !v.ok) {\n      m.invalidFinal++;\n      return { valido: false, plan };\n    }\n    m.valid++;\n    if (r.changed) m.changed++;\n    return { valido: true, plan: r.plan };\n  } catch (_) {\n    m.errors++;\n    return { valido: false, plan };\n  } finally {\n    m.ms += Number(process.hrtime.bigint() - t0) / 1e6;\n  }\n}\n\n"""
if anchor not in s:
    raise SystemExit('helper anchor not found')
s = s.replace(anchor, helper + anchor, 1)

block_old = """  const usarCheap = usarCotaBarataPostBaseline(config);\n  const certificarTemprano = config.certificarAntesCompactacion === true || usarCheap;\n\n  // Primer corte: si area/external LB ya certifican, ni siquiera calculamos la\n  // cheap LB. Esto cubre los casos baratos baseline == areaLB.\n  if (\n    certificarTemprano &&\n    baseline?.resumen &&\n    baseline.resumen.placas <= cota\n  ) {\n    metricas.lowerBound.certifiedAfterBaseline++;\n    metricas.total.ms += Date.now() - t0;\n    return { plan: baseline, metricas, cota, cotaArea };\n  }\n\n  // V20 experimental: sólo para los que NO cerraron por área. Calcula la misma\n  // Hybrid Cheap LB validada en V15-V19, explícitamente sin Raster. Si iguala\n  // al incumbente físico, el número de placas queda certificado y cortamos\n  // compactación + MultiSlice + OneBoard + Master.\n  if (usarCheap && baseline?.resumen) {\n"""
block_new = """  const usarCheap = usarCotaBarataPostBaseline(config);\n  const certificarTemprano = config.certificarAntesCompactacion === true || usarCheap;\n  const certificadoInicial = !!(\n    certificarTemprano &&\n    baseline?.resumen &&\n    baseline.resumen.placas <= cota\n  );\n  let polishCertificado = null;\n  const obtenerPolishCertificado = () => {\n    if (polishCertificado === null)\n      polishCertificado = intentarPolishV20(baseline, config, piezasEsperadas, metricas);\n    return polishCertificado;\n  };\n\n  // Primer corte: fuera de V20 conserva exactamente el retorno histórico.\n  // Con V20, una certificación de placas no puede saltarse silenciosamente el\n  // objetivo #2: primero se ejecuta el polish por placa; si falla, continuamos\n  // hacia compactación legacy en lugar de devolver el baseline.\n  if (certificadoInicial) {\n    metricas.lowerBound.certifiedAfterBaseline++;\n    if (!usarCheap) {\n      metricas.total.ms += Date.now() - t0;\n      return { plan: baseline, metricas, cota, cotaArea };\n    }\n    const polished = obtenerPolishCertificado();\n    if (polished.valido) {\n      metricas.total.ms += Date.now() - t0;\n      return { plan: polished.plan, metricas, cota, cotaArea };\n    }\n  }\n\n  // V20 experimental: sólo para los que NO cerraron por área. Calcula la misma\n  // Hybrid Cheap LB validada en V15-V19, explícitamente sin Raster. Si iguala\n  // al incumbente físico, el número de placas queda certificado. El fast return\n  // sólo se permite después de un polish válido; de lo contrario cae al camino\n  // legacy de compactación.\n  if (usarCheap && baseline?.resumen && !certificadoInicial) {\n"""
if block_old not in s:
    raise SystemExit('early-cert anchor not found')
s = s.replace(block_old, block_new, 1)

return_old = """    if (baseline.resumen.placas <= cota) {\n      metricas.lowerBound.cheapCertified++;\n      metricas.lowerBound.certifiedAfterBaseline++;\n      metricas.total.ms += Date.now() - t0;\n      return { plan: baseline, metricas, cota, cotaArea };\n    }\n"""
return_new = """    if (baseline.resumen.placas <= cota) {\n      metricas.lowerBound.cheapCertified++;\n      metricas.lowerBound.certifiedAfterBaseline++;\n      const polished = obtenerPolishCertificado();\n      if (polished.valido) {\n        metricas.total.ms += Date.now() - t0;\n        return { plan: polished.plan, metricas, cota, cotaArea };\n      }\n    }\n"""
if return_old not in s:
    raise SystemExit('cheap return anchor not found')
s = s.replace(return_old, return_new, 1)

p.write_text(s)
print('V20 safe wiring applied')
