from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def replace_once(path: str, old: str, new: str) -> None:
    p = ROOT / path
    text = p.read_text()
    if new in text:
        return
    if old not in text:
        raise SystemExit(f"expected fragment not found in {path}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1))


# ---------------------------------------------------------------------------
# Public legacy option surface. Budgets are optional: absence is legacy mode.
# ---------------------------------------------------------------------------
replace_once(
    "src/lib/optimizer/types.ts",
    "  semillasRescate?: number;\n  msRescate?: number;\n  [key: string]: unknown;",
    "  semillasRescate?: number;\n  msRescate?: number;\n  maxExpansionesBeam?: number;\n  watchdogBeamMs?: number;\n  maxNodosMaster?: number;\n  watchdogMasterMs?: number;\n  maxIntentosRescate?: number;\n  watchdogRescateMs?: number;\n  [key: string]: unknown;",
)

# ---------------------------------------------------------------------------
# Coverage / Pattern Master. In deterministic mode the node budget is the
# normal stop condition. The clock is only a watchdog. With maxNodos omitted,
# the historical clock-check ordering is preserved exactly.
# ---------------------------------------------------------------------------
replace_once(
    "src/lib/optimizer/legacy/cobertura.cjs",
    "  const t0 = Date.now();\n  const step0=control&&control.telemetry&&control.telemetry.master;\n  if(step0) step0.runs++;\n  let mejor = incumbente, mejorPlan = null;\n  const memo = new Map();\n  let nodos = 0, agotado = false, timeoutRegistrado=false;\n  const marcarTimeout=()=>{\n    agotado=true;\n    if(step0&&!timeoutRegistrado){ step0.timeoutHits++; timeoutRegistrado=true; }\n  };",
    "  const t0 = Date.now();\n  const step0=control&&control.telemetry&&control.telemetry.master;\n  if(step0) step0.runs++;\n  const maxNodosRaw=Number(control&&control.maxNodos);\n  const maxNodos=Number.isFinite(maxNodosRaw)&&maxNodosRaw>0?Math.floor(maxNodosRaw):null;\n  const modoDeterminista=maxNodos!==null;\n  const watchdogRaw=Number(control&&control.watchdogMs);\n  const watchdogMs=Number.isFinite(watchdogRaw)&&watchdogRaw>0?watchdogRaw:null;\n  let mejor = incumbente, mejorPlan = null;\n  const memo = new Map();\n  let nodos = 0, agotado = false, timeoutRegistrado=false, budgetRegistrado=false, watchdogRegistrado=false;\n  const marcarTimeout=()=>{\n    agotado=true;\n    if(step0&&!timeoutRegistrado){ step0.timeoutHits++; timeoutRegistrado=true; }\n  };\n  const marcarBudget=()=>{\n    agotado=true;\n    if(step0&&!budgetRegistrado){ step0.budgetHits++; budgetRegistrado=true; }\n  };\n  const marcarWatchdog=()=>{\n    agotado=true;\n    if(step0&&!watchdogRegistrado){ step0.watchdogHits++; step0.timeoutHits++; watchdogRegistrado=true; }\n  };",
)
replace_once(
    "src/lib/optimizer/legacy/cobertura.cjs",
    "  function dfs(rest, areaRest, usadas, plan) {\n    if (Date.now() - t0 > limiteMs) { marcarTimeout(); return; }\n    if (areaRest <= 1e-9) {\n      if (usadas < mejor) { mejor = usadas; mejorPlan = plan.slice(); }\n      return;\n    }\n    if (usadas + cota(rest, areaRest) >= mejor) return;\n\n    const clave = rest.join(',');\n    const previo = memo.get(clave);\n    if (previo !== undefined && previo <= usadas) return;\n    memo.set(clave, usadas);\n    nodos++;",
    "  function dfs(rest, areaRest, usadas, plan) {\n    if (!modoDeterminista && Date.now() - t0 > limiteMs) { marcarTimeout(); return; }\n    if (modoDeterminista && watchdogMs!==null && Date.now() - t0 > watchdogMs) { marcarWatchdog(); return; }\n    // En modo determinista el terminal se acepta antes de rechazar el siguiente\n    // nodo. Esto preserva la correccion recuperada de 2f2c202.\n    if (areaRest <= 1e-9) {\n      if (usadas < mejor) { mejor = usadas; mejorPlan = plan.slice(); }\n      return;\n    }\n    if (usadas + cota(rest, areaRest) >= mejor) return;\n\n    const clave = rest.join(',');\n    const previo = memo.get(clave);\n    if (previo !== undefined && previo <= usadas) return;\n    if (modoDeterminista && nodos >= maxNodos) { marcarBudget(); return; }\n    memo.set(clave, usadas);\n    nodos++;",
)
replace_once(
    "src/lib/optimizer/legacy/cobertura.cjs",
    "      dfs(nr, areaRest - da, usadas + 1, plan);\n      plan.pop();\n      if (Date.now() - t0 > limiteMs) { marcarTimeout(); return; }",
    "      dfs(nr, areaRest - da, usadas + 1, plan);\n      plan.pop();\n      if (!modoDeterminista && Date.now() - t0 > limiteMs) { marcarTimeout(); return; }\n      if (modoDeterminista && watchdogMs!==null && Date.now() - t0 > watchdogMs) { marcarWatchdog(); return; }",
)

# ---------------------------------------------------------------------------
# OneBoard. maxIntentosRescate is normal deterministic work; msRescate remains
# the exact legacy limiter when the deterministic budget is absent.
# ---------------------------------------------------------------------------
replace_once(
    "src/lib/optimizer/legacy/oneboard.cjs",
    "  const opts = { pases: 40, semillasRescate: 6, msRescate: 20000, ...config };\n  const base = M.optimizar(lineas, { ...config });",
    "  const opts = { pases: 40, semillasRescate: 6, msRescate: 20000, ...config };\n  const maxIntentosRaw=Number(opts.maxIntentosRescate);\n  const maxIntentos=Number.isFinite(maxIntentosRaw)&&maxIntentosRaw>0?Math.floor(maxIntentosRaw):null;\n  const modoDeterminista=maxIntentos!==null;\n  const watchdogRaw=Number(opts.watchdogRescateMs);\n  const watchdogMs=Number.isFinite(watchdogRaw)&&watchdogRaw>0?watchdogRaw:null;\n  let budgetRegistrado=false, watchdogRegistrado=false;\n  const marcarBudget=()=>{ if(step0&&!budgetRegistrado){ step0.budgetHits++; budgetRegistrado=true; } };\n  const marcarWatchdog=()=>{\n    if(step0&&!watchdogRegistrado){ step0.watchdogHits++; step0.timeoutHits++; watchdogRegistrado=true; }\n  };\n  const base = M.optimizar(lineas, { ...config });",
)
replace_once(
    "src/lib/optimizer/legacy/oneboard.cjs",
    "  let corrida = 0;\n  for (let s = 0; s < opts.semillasRescate && Date.now() - t0 < opts.msRescate; s++) {\n    for (const c1 of CR) for (const c2 of CR)\n      for (const dir of [M.DIR_Y, M.DIR_X])\n        for (const multi of [false, true]) {\n          if (Date.now() - t0 > opts.msRescate) break;\n          const cfg = { criterios: [c1, c2], criterio: c1, dirInicial: dir,\n                        ruido: s === 0 ? 0 : 0.3, multiRebanada: multi };\n          cfg._id = M.hashTexto(c1 + '>' + c2 + '|' + dir + '|' + multi);\n          intentos++;",
    "  let corrida = 0;\n  rescateLoop:\n  for (let s = 0; s < opts.semillasRescate && (modoDeterminista || Date.now() - t0 < opts.msRescate); s++) {\n    for (const c1 of CR) for (const c2 of CR)\n      for (const dir of [M.DIR_Y, M.DIR_X])\n        for (const multi of [false, true]) {\n          // Flags OFF: conservar el break historico del loop mas interno.\n          if (!modoDeterminista && Date.now() - t0 > opts.msRescate) break;\n          if (modoDeterminista && watchdogMs!==null && Date.now() - t0 > watchdogMs) { marcarWatchdog(); break rescateLoop; }\n          if (modoDeterminista && intentos >= maxIntentos) { marcarBudget(); break rescateLoop; }\n          const cfg = { criterios: [c1, c2], criterio: c1, dirInicial: dir,\n                        ruido: s === 0 ? 0 : 0.3, multiRebanada: multi };\n          cfg._id = M.hashTexto(c1 + '>' + c2 + '|' + dir + '|' + multi);\n          intentos++;",
)
replace_once(
    "src/lib/optimizer/legacy/oneboard.cjs",
    "  if(Date.now()-t0>=opts.msRescate){\n    timeoutRegistrado=true;\n    if(step0) step0.timeoutHits++;\n  }",
    "  if(!modoDeterminista && Date.now()-t0>=opts.msRescate){\n    timeoutRegistrado=true;\n    if(step0) step0.timeoutHits++;\n  }",
)

# ---------------------------------------------------------------------------
# Beam. maxExpansionesBeam replaces wall time as normal termination only when
# configured. presupuestoBeamMs remains untouched in legacy mode.
# ---------------------------------------------------------------------------
replace_once(
    "src/lib/optimizer/legacy/motor.cjs",
    "  const step0=opts._step0Telemetry&&opts._step0Telemetry.beam;\n  if(step0) step0.calls++;\n  let expansiones=0, timeoutRegistrado=false;",
    "  const step0=opts._step0Telemetry&&opts._step0Telemetry.beam;\n  if(step0) step0.calls++;\n  const maxExpRaw=Number(opts.maxExpansionesBeam);\n  const maxExpansiones=Number.isFinite(maxExpRaw)&&maxExpRaw>0?Math.floor(maxExpRaw):null;\n  const modoDeterminista=maxExpansiones!==null;\n  const watchdogRaw=Number(opts.watchdogBeamMs);\n  const watchdogMs=Number.isFinite(watchdogRaw)&&watchdogRaw>0?watchdogRaw:null;\n  let expansiones=0, timeoutRegistrado=false, budgetRegistrado=false, watchdogRegistrado=false;\n  const marcarBudget=()=>{ if(step0&&!budgetRegistrado){ step0.budgetHits++; budgetRegistrado=true; } };\n  const marcarWatchdog=()=>{\n    if(step0&&!watchdogRegistrado){ step0.watchdogHits++; step0.timeoutHits++; watchdogRegistrado=true; }\n  };",
)
replace_once(
    "src/lib/optimizer/legacy/motor.cjs",
    "  while(beam.length && guarda++<300){\n    // Step 0 sólo observa el mismo límite temporal existente.\n    if(Date.now()-t0 > opts.presupuestoBeamMs){\n      if(step0&&!timeoutRegistrado){ step0.timeoutHits++; timeoutRegistrado=true; }\n      break;\n    }",
    "  beamLoop:\n  while(beam.length && guarda++<300){\n    if(!modoDeterminista && Date.now()-t0 > opts.presupuestoBeamMs){\n      if(step0&&!timeoutRegistrado){ step0.timeoutHits++; timeoutRegistrado=true; }\n      break;\n    }\n    if(modoDeterminista && watchdogMs!==null && Date.now()-t0 > watchdogMs){\n      marcarWatchdog();\n      break;\n    }",
)
replace_once(
    "src/lib/optimizer/legacy/motor.cjs",
    "      for(const c of cands){\n        const placa={ancho:opts.anchoUtil, alto:opts.altoUtil, colocadas:c.colocadas,\n                     cortes:c.cortes, restos:c.restos, arbol:c.arbol};\n        expansiones++;",
    "      for(const c of cands){\n        if(modoDeterminista && watchdogMs!==null && Date.now()-t0 > watchdogMs){ marcarWatchdog(); break beamLoop; }\n        if(modoDeterminista && expansiones >= maxExpansiones){ marcarBudget(); break beamLoop; }\n        const placa={ancho:opts.anchoUtil, alto:opts.altoUtil, colocadas:c.colocadas,\n                     cortes:c.cortes, restos:c.restos, arbol:c.arbol};\n        expansiones++;",
)

# ---------------------------------------------------------------------------
# Step 0 exposes budget hits separately from watchdog/legacy clock hits.
# Pattern Master receives the deterministic node control.
# ---------------------------------------------------------------------------
replace_once(
    "src/lib/optimizer/legacy/v10.cjs",
    "    beam:{calls:0,expansionsTotal:0,expansionsMax:0,wallMsTotal:0,wallMsMax:0,timeoutHits:0},\n    master:{runs:0,nodesTotal:0,nodesMax:0,wallMsTotal:0,wallMsMax:0,timeoutHits:0},\n    oneboard:{runs:0,attemptsTotal:0,attemptsMax:0,wallMsTotal:0,wallMsMax:0,timeoutHits:0},",
    "    beam:{calls:0,expansionsTotal:0,expansionsMax:0,wallMsTotal:0,wallMsMax:0,timeoutHits:0,budgetHits:0,watchdogHits:0},\n    master:{runs:0,nodesTotal:0,nodesMax:0,wallMsTotal:0,wallMsMax:0,timeoutHits:0,budgetHits:0,watchdogHits:0},\n    oneboard:{runs:0,attemptsTotal:0,attemptsMax:0,wallMsTotal:0,wallMsMax:0,timeoutHits:0,budgetHits:0,watchdogHits:0},",
)
replace_once(
    "src/lib/optimizer/legacy/v10.cjs",
    "                                  mejor.resumen.placas, config.msMaster || 8000,\n                                  { telemetry: config._step0Telemetry || null });",
    "                                  mejor.resumen.placas, config.msMaster || 8000,\n                                  { telemetry: config._step0Telemetry || null,\n                                    maxNodos: config.maxNodosMaster,\n                                    watchdogMs: config.watchdogMasterMs });",
)

# ---------------------------------------------------------------------------
# Adapter: explicit env -> legacy options; the problem inputHash remains pure,
# while the runtime cache key includes the execution budget fingerprint.
# ---------------------------------------------------------------------------
replace_once(
    "src/lib/optimizer/engine/legacy-engine.ts",
    "interface ExperimentalStagedConfig {",
    "interface DeterministicBudgetConfig {\n  maxExpansionesBeam?: number;\n  watchdogBeamMs?: number;\n  maxNodosMaster?: number;\n  watchdogMasterMs?: number;\n  maxIntentosRescate?: number;\n  watchdogRescateMs?: number;\n  cacheDiscriminator: string;\n}\n\ninterface ExperimentalStagedConfig {",
)
replace_once(
    "src/lib/optimizer/engine/legacy-engine.ts",
    "function parseEnvPositiveInt(name: string, defaultValue: number): number {\n  const raw = process.env[name];\n  if (raw == null || raw === \"\") return defaultValue;\n  const value = Number.parseInt(raw, 10);\n  return Number.isFinite(value) && value > 0 ? value : defaultValue;\n}\n",
    "function parseEnvPositiveInt(name: string, defaultValue: number): number {\n  const raw = process.env[name];\n  if (raw == null || raw === \"\") return defaultValue;\n  const value = Number.parseInt(raw, 10);\n  return Number.isFinite(value) && value > 0 ? value : defaultValue;\n}\n\nfunction parseEnvOptionalPositiveInt(name: string): number | undefined {\n  const raw = process.env[name];\n  if (raw == null || raw === \"\") return undefined;\n  const value = Number.parseInt(raw, 10);\n  return Number.isFinite(value) && value > 0 ? value : undefined;\n}\n\nfunction resolveDeterministicBudgetConfig(): DeterministicBudgetConfig {\n  const maxExpansionesBeam = parseEnvOptionalPositiveInt(\"OPTIMIZER_MAX_BEAM_EXPANSIONS\");\n  const watchdogBeamMs = parseEnvOptionalPositiveInt(\"OPTIMIZER_BEAM_WATCHDOG_MS\");\n  const maxNodosMaster = parseEnvOptionalPositiveInt(\"OPTIMIZER_MAX_MASTER_NODES\");\n  const watchdogMasterMs = parseEnvOptionalPositiveInt(\"OPTIMIZER_MASTER_WATCHDOG_MS\");\n  // Nombres recuperados del V19 original.\n  const maxIntentosRescate = parseEnvOptionalPositiveInt(\"OPTIMIZER_MAX_RESCUE_ATTEMPTS\");\n  const watchdogRescateMs = parseEnvOptionalPositiveInt(\"OPTIMIZER_RESCUE_WATCHDOG_MS\");\n  const fmt = (value: number | undefined) => value == null ? \"off\" : String(value);\n  const cacheDiscriminator = [\n    \"det-budget-v1\",\n    `beam=${fmt(maxExpansionesBeam)}`,\n    `beamWd=${fmt(watchdogBeamMs)}`,\n    `master=${fmt(maxNodosMaster)}`,\n    `masterWd=${fmt(watchdogMasterMs)}`,\n    `rescue=${fmt(maxIntentosRescate)}`,\n    `rescueWd=${fmt(watchdogRescateMs)}`,\n  ].join(\"|\");\n  return {\n    maxExpansionesBeam, watchdogBeamMs, maxNodosMaster, watchdogMasterMs,\n    maxIntentosRescate, watchdogRescateMs, cacheDiscriminator,\n  };\n}\n",
)
replace_once(
    "src/lib/optimizer/engine/legacy-engine.ts",
    "  const strategy = parsed.strategy ?? \"baseline\";\n  const stagedConfig = resolveExperimentalStagedConfig(strategy);\n  const cacheKey = stagedConfig ? `${inputHash}|${stagedConfig.cacheDiscriminator}` : inputHash;",
    "  const strategy = parsed.strategy ?? \"baseline\";\n  const stagedConfig = resolveExperimentalStagedConfig(strategy);\n  const deterministicBudgets = resolveDeterministicBudgetConfig();\n  const cacheKey = [inputHash, deterministicBudgets.cacheDiscriminator, stagedConfig?.cacheDiscriminator]\n    .filter(Boolean)\n    .join(\"|\");",
)
replace_once(
    "src/lib/optimizer/engine/legacy-engine.ts",
    "  const lineas = toLegacyLines(parsed);\n  const options = toLegacyOptions(parsed, strategy);",
    "  const lineas = toLegacyLines(parsed);\n  const options = toLegacyOptions(parsed, strategy, deterministicBudgets);",
)
replace_once(
    "src/lib/optimizer/engine/legacy-engine.ts",
    "function toLegacyOptions(input: OptimizationInput, strategy: OptimizerStrategy): LegacyOptimizerOptions {",
    "function toLegacyOptions(\n  input: OptimizationInput,\n  strategy: OptimizerStrategy,\n  deterministicBudgets: DeterministicBudgetConfig,\n): LegacyOptimizerOptions {",
)
replace_once(
    "src/lib/optimizer/engine/legacy-engine.ts",
    "  return {\n    ...options,\n    ...profileOptions(input.constraints.profile ?? \"balanced\", totalPieces)\n  };",
    "  return {\n    ...options,\n    ...profileOptions(input.constraints.profile ?? \"balanced\", totalPieces),\n    maxExpansionesBeam: deterministicBudgets.maxExpansionesBeam,\n    watchdogBeamMs: deterministicBudgets.watchdogBeamMs,\n    maxNodosMaster: deterministicBudgets.maxNodosMaster,\n    watchdogMasterMs: deterministicBudgets.watchdogMasterMs,\n    maxIntentosRescate: deterministicBudgets.maxIntentosRescate,\n    watchdogRescateMs: deterministicBudgets.watchdogRescateMs,\n  };",
)

print("determinism port applied")
