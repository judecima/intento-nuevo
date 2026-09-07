#!/usr/bin/env python3
from pathlib import Path


def replace_once(path, old, new, label):
    p = Path(path)
    s = p.read_text()
    if old not in s:
        raise SystemExit(f'{label}: anchor not found in {path}')
    p.write_text(s.replace(old, new, 1))

# ---------------------------------------------------------------- motor: Beam + composition counters
motor = Path('src/lib/optimizer/legacy/motor.cjs')
s = motor.read_text()
if '_step0Telemetry' in s:
    raise SystemExit('Step0 motor instrumentation already present')

old = """function armarPlacasBeam(piezas, opts, configs, pase){\n  const areaPlaca=opts.anchoUtil*opts.altoUtil;\n  const t0=Date.now();\n  let beam=[{pool:piezas.slice(), placas:[], util:0}];\n  let completas=[];\n  let guarda=0;\n\n  while(beam.length && guarda++<300){\n    // El costo de Beam crece con el numero de placas; sin techo, un pedido\n    // grande lo multiplica por cuatro sin mejorar el resultado.\n    if(Date.now()-t0 > opts.presupuestoBeamMs) break;\n"""
new = """function armarPlacasBeam(piezas, opts, configs, pase){\n  const areaPlaca=opts.anchoUtil*opts.altoUtil;\n  const t0=Date.now();\n  const step0=opts._step0Telemetry&&opts._step0Telemetry.beam;\n  if(step0) step0.calls++;\n  let expansiones=0, timeoutRegistrado=false;\n  const cerrarStep0=()=>{\n    if(!step0) return;\n    const ms=Date.now()-t0;\n    step0.expansionsTotal+=expansiones;\n    step0.expansionsMax=Math.max(step0.expansionsMax,expansiones);\n    step0.wallMsTotal+=ms;\n    step0.wallMsMax=Math.max(step0.wallMsMax,ms);\n  };\n  let beam=[{pool:piezas.slice(), placas:[], util:0}];\n  let completas=[];\n  let guarda=0;\n\n  while(beam.length && guarda++<300){\n    // Step 0 sólo observa el mismo límite temporal existente.\n    if(Date.now()-t0 > opts.presupuestoBeamMs){\n      if(step0&&!timeoutRegistrado){ step0.timeoutHits++; timeoutRegistrado=true; }\n      break;\n    }\n"""
if old not in s: raise SystemExit('beam entry anchor not found')
s=s.replace(old,new,1)

old = """      for(const c of cands){\n        const placa={ancho:opts.anchoUtil, alto:opts.altoUtil, colocadas:c.colocadas,\n                     cortes:c.cortes, restos:c.restos, arbol:c.arbol};\n        siguientes.push({\n"""
new = """      for(const c of cands){\n        const placa={ancho:opts.anchoUtil, alto:opts.altoUtil, colocadas:c.colocadas,\n                     cortes:c.cortes, restos:c.restos, arbol:c.arbol};\n        expansiones++;\n        siguientes.push({\n"""
if old not in s: raise SystemExit('beam expansion anchor not found')
s=s.replace(old,new,1)

old = """  if(!completas.length){\n    const p=beam[0]?.pool?.[0] || piezas[0];\n    throw new Error(`No se pudo completar el plan con Beam Search${p ? `; revisar la pieza \"${p.detalle||'sin nombre'}\" (${p.base}\\u00d7${p.altura} mm)` : ''}.`);\n  }\n\n  completas.sort((a,b)=>{\n"""
new = """  if(!completas.length){\n    cerrarStep0();\n    const p=beam[0]?.pool?.[0] || piezas[0];\n    throw new Error(`No se pudo completar el plan con Beam Search${p ? `; revisar la pieza \"${p.detalle||'sin nombre'}\" (${p.base}\\u00d7${p.altura} mm)` : ''}.`);\n  }\n\n  completas.sort((a,b)=>{\n"""
if old not in s: raise SystemExit('beam throw anchor not found')
s=s.replace(old,new,1)

old = """  return completas[0].placas;\n}\n\n/* Calidad industrial del remanente.\n"""
new = """  cerrarStep0();\n  return completas[0].placas;\n}\n\n/* Calidad industrial del remanente.\n"""
if old not in s: raise SystemExit('beam return anchor not found')
s=s.replace(old,new,1)

old = """function armarPlacas(piezas, opts, configs, pase){\n  const greedy=armarPlacasGreedy(piezas,opts,configs,pase);\n"""
new = """function armarPlacas(piezas, opts, configs, pase){\n  if(opts._step0Telemetry) opts._step0Telemetry.composition.armarPlacasCalls++;\n  const greedy=armarPlacasGreedy(piezas,opts,configs,pase);\n"""
if old not in s: raise SystemExit('armarPlacas anchor not found')
s=s.replace(old,new,1)

old = """function optimizar(lineas, config){\n  const opts={placaBase:2750, placaAltura:1830, refiladoX:10, refiladoY:10,\n"""
new = """function optimizar(lineas, config){\n  const opts={placaBase:2750, placaAltura:1830, refiladoX:10, refiladoY:10,\n"""
# same anchor used below after opts closes, do not replace yet
if old not in s: raise SystemExit('optimizar anchor not found')

old = """              preferirMenorProfundidad:true,\n              usarRescue:true, maxPiezasRescue:30, presupuestoRescueMs:300, multiRebanada:false, multiVariantes:false, ...config};\n\n  const piezas=[]; let id=0;\n"""
new = """              preferirMenorProfundidad:true,\n              usarRescue:true, maxPiezasRescue:30, presupuestoRescueMs:300, multiRebanada:false, multiVariantes:false, ...config};\n  if(opts._step0Telemetry) opts._step0Telemetry.composition.optimizarCalls++;\n\n  const piezas=[]; let id=0;\n"""
if old not in s: raise SystemExit('optimizar telemetry anchor not found')
s=s.replace(old,new,1)

old = """      const oEtapas={...opts,etapas:etapasActual};\n      const placas=armarPlacas(\n"""
new = """      const oEtapas={...opts,etapas:etapasActual};\n      if(opts._step0Telemetry) opts._step0Telemetry.composition.stageCalls++;\n      const placas=armarPlacas(\n"""
if old not in s: raise SystemExit('stage anchor not found')
s=s.replace(old,new,1)
motor.write_text(s)

# ---------------------------------------------------------------- coverage: observe runs/nodes/wall/timeouts only
cov = Path('src/lib/optimizer/legacy/cobertura.cjs')
s = cov.read_text()
old = "function resolverCobertura(patrones, demanda, areaPlaca, incumbente, limiteMs = 20000) {\n"
new = "function resolverCobertura(patrones, demanda, areaPlaca, incumbente, limiteMs = 20000, control = null) {\n"
if old not in s: raise SystemExit('coverage signature anchor not found')
s=s.replace(old,new,1)

old = """  const t0 = Date.now();\n  let mejor = incumbente, mejorPlan = null;\n  const memo = new Map();\n  let nodos = 0, agotado = false;\n"""
new = """  const t0 = Date.now();\n  const step0=control&&control.telemetry&&control.telemetry.master;\n  if(step0) step0.runs++;\n  let mejor = incumbente, mejorPlan = null;\n  const memo = new Map();\n  let nodos = 0, agotado = false, timeoutRegistrado=false;\n  const marcarTimeout=()=>{\n    agotado=true;\n    if(step0&&!timeoutRegistrado){ step0.timeoutHits++; timeoutRegistrado=true; }\n  };\n"""
if old not in s: raise SystemExit('coverage state anchor not found')
s=s.replace(old,new,1)
s=s.replace("if (Date.now() - t0 > limiteMs) { agotado = true; return; }", "if (Date.now() - t0 > limiteMs) { marcarTimeout(); return; }", 1)
s=s.replace("if (Date.now() - t0 > limiteMs) return;", "if (Date.now() - t0 > limiteMs) { marcarTimeout(); return; }", 1)

old = """      dfs(demanda.slice(), areaTotal, 0, []);\n      return { placas: mejor, plan: mejorPlan, nodos, agotado };\n"""
new = """      dfs(demanda.slice(), areaTotal, 0, []);\n      if(step0){\n        const ms=Date.now()-t0;\n        step0.nodesTotal+=nodos;\n        step0.nodesMax=Math.max(step0.nodesMax,nodos);\n        step0.wallMsTotal+=ms;\n        step0.wallMsMax=Math.max(step0.wallMsMax,ms);\n      }\n      return { placas: mejor, plan: mejorPlan, nodos, agotado };\n"""
if old not in s: raise SystemExit('coverage return anchor not found')
s=s.replace(old,new,1)
cov.write_text(s)

# ---------------------------------------------------------------- OneBoard: attempts + wall + timeout
one = Path('src/lib/optimizer/legacy/oneboard.cjs')
s = one.read_text()
old = """function rescatarUnaPlaca(lineas, config = {}) {\n  // Todo parametro leido con opts.x necesita su default aca mismo: sin esto\n"""
new = """function rescatarUnaPlaca(lineas, config = {}) {\n  const step0=config._step0Telemetry&&config._step0Telemetry.oneboard;\n  const wallStart=Date.now();\n  let intentos=0, timeoutRegistrado=false;\n  if(step0) step0.runs++;\n  const terminarStep0=()=>{\n    if(!step0) return;\n    const ms=Date.now()-wallStart;\n    step0.attemptsTotal+=intentos;\n    step0.attemptsMax=Math.max(step0.attemptsMax,intentos);\n    step0.wallMsTotal+=ms;\n    step0.wallMsMax=Math.max(step0.wallMsMax,ms);\n  };\n  // Todo parametro leido con opts.x necesita su default aca mismo: sin esto\n"""
if old not in s: raise SystemExit('oneboard entry anchor not found')
s=s.replace(old,new,1)

old = """  if (base.resumen.placas <= 1 || cota !== 1)\n    return { plan: base, baseline: base, activado: false, historial: [] };\n"""
new = """  if (base.resumen.placas <= 1 || cota !== 1){\n    terminarStep0();\n    return { plan: base, baseline: base, activado: false, historial: [], intentos };\n  }\n"""
if old not in s: raise SystemExit('oneboard inactive anchor not found')
s=s.replace(old,new,1)

old = """          const res = intentar(lineas, cfg, ordenes[s % ordenes.length], opts, 1000 + s * 97);\n          if (!res) continue;\n"""
new = """          intentos++;\n          const res = intentar(lineas, cfg, ordenes[s % ordenes.length], opts, 1000 + s * 97);\n          if (!res) continue;\n"""
if old not in s: raise SystemExit('oneboard attempts anchor not found')
s=s.replace(old,new,1)

old = """            const plan = comoPlan(res, opts);\n            return { plan, baseline: base, activado: true, exito: true,\n                     restante: 0, historial, corridas: corrida,\n                     ms: Date.now() - t0 };\n"""
new = """            const plan = comoPlan(res, opts);\n            terminarStep0();\n            return { plan, baseline: base, activado: true, exito: true,\n                     restante: 0, historial, corridas: corrida, intentos,\n                     ms: Date.now() - t0 };\n"""
if old not in s: raise SystemExit('oneboard success anchor not found')
s=s.replace(old,new,1)

old = """  return { plan: base, baseline: base, activado: true, exito: false,\n           restante: mejorRestante, historial, corridas: corrida,\n           ms: Date.now() - t0 };\n"""
new = """  if(Date.now()-t0>=opts.msRescate){\n    timeoutRegistrado=true;\n    if(step0) step0.timeoutHits++;\n  }\n  terminarStep0();\n  return { plan: base, baseline: base, activado: true, exito: false,\n           restante: mejorRestante, historial, corridas: corrida, intentos,\n           ms: Date.now() - t0 };\n"""
if old not in s: raise SystemExit('oneboard final anchor not found')
s=s.replace(old,new,1)
one.write_text(s)

# ---------------------------------------------------------------- V10 owns per-order telemetry and passes it through
v10 = Path('src/lib/optimizer/legacy/v10.cjs')
s = v10.read_text()
anchor = "function nuevasMetricas() {\n"
helper = """function nuevaTelemetriaStep0(){\n  return {\n    beam:{calls:0,expansionsTotal:0,expansionsMax:0,wallMsTotal:0,wallMsMax:0,timeoutHits:0},\n    master:{runs:0,nodesTotal:0,nodesMax:0,wallMsTotal:0,wallMsMax:0,timeoutHits:0},\n    oneboard:{runs:0,attemptsTotal:0,attemptsMax:0,wallMsTotal:0,wallMsMax:0,timeoutHits:0},\n    composition:{optimizarCalls:0,armarPlacasCalls:0,stageCalls:0},\n  };\n}\n\n"""
if anchor not in s: raise SystemExit('step0 factory anchor not found')
s=s.replace(anchor,helper+anchor,1)

old = """function optimizarV10(lineas, config, metricas = nuevasMetricas()) {\n  const t0 = Date.now();\n"""
new = """function optimizarV10(lineas, config, metricas = nuevasMetricas()) {\n  const t0 = Date.now();\n  if(config.instrumentarStep0===true){\n    const telemetry=config._step0Telemetry||nuevaTelemetriaStep0();\n    config={...config,_step0Telemetry:telemetry};\n    metricas.step0=telemetry;\n  }\n"""
if old not in s: raise SystemExit('v10 entry anchor not found')
s=s.replace(old,new,1)

old = """      const s = resolverCobertura(pool, lineas.map(l => l.cant), areaPlaca,\n                                  mejor.resumen.placas, config.msMaster || 8000);\n"""
new = """      const s = resolverCobertura(pool, lineas.map(l => l.cant), areaPlaca,\n                                  mejor.resumen.placas, config.msMaster || 8000,\n                                  { telemetry: config._step0Telemetry || null });\n"""
if old not in s: raise SystemExit('v10 coverage anchor not found')
s=s.replace(old,new,1)

old = "module.exports = { optimizarV10, nuevasMetricas, validarPlanIndustrial };\n"
new = "module.exports = { optimizarV10, nuevasMetricas, nuevaTelemetriaStep0, validarPlanIndustrial };\n"
if old not in s: raise SystemExit('v10 export anchor not found')
s=s.replace(old,new,1)
v10.write_text(s)

# ---------------------------------------------------------------- runtime opt-in via env; default remains false
engine = Path('src/lib/optimizer/engine/legacy-engine.ts')
s = engine.read_text()
old = """    usarMultiSlice: strategy === \"v10\" ? input.constraints.allowMultiSlice !== false : false,\n    usarCompactacion: strategy === \"v10\" ? input.constraints.allowDeadStripCompaction !== false : false\n  };\n"""
new = """    usarMultiSlice: strategy === \"v10\" ? input.constraints.allowMultiSlice !== false : false,\n    usarCompactacion: strategy === \"v10\" ? input.constraints.allowDeadStripCompaction !== false : false,\n    instrumentarStep0: strategy === \"v10\" && parseEnvFlag(\"OPTIMIZER_STEP0_TELEMETRY\", false)\n  };\n"""
if old not in s: raise SystemExit('engine options anchor not found')
s=s.replace(old,new,1)
engine.write_text(s)

print('Step0 instrumentation applied')
