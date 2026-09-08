from pathlib import Path
import json

# Patch calibration v4 with a content-addressed preflight cache.
p = Path('scripts/kernel-freeze/kernel-budget-calibration-v4.mjs')
s = p.read_text(encoding='utf-8')

needle = 'const REPO = resolve(dirname(SCRIPT), "../..");\n'
insert = needle + 'const KERNEL_CANDIDATE = "4063963260abb10c8d68d0e553942899c925cc2f";\n'
assert needle in s
if 'const KERNEL_CANDIDATE =' not in s:
    s = s.replace(needle, insert, 1)

old = '''  const bundle = await buildBundle(out);\n  const historicalReplay = await validateHistoricalInfeasibleReplay({ bundle, historicalCorpus, out });\n  const state = await preparePhysicalCorpus(bundle, corpus, out, historicalReplay);\n'''
new = '''  const bundle = await buildBundle(out);\n  const preflightCachePath = join(out, "preflight-state-cache-v4.json");\n  const preflightCacheKey = computePreflightCacheKey({ corpus, historicalCorpus });\n  let historicalReplay;\n  let state;\n  const cachedPreflight = existsSync(preflightCachePath) ? readJson(preflightCachePath) : null;\n  if (\n    cachedPreflight?.schemaVersion === "kernel-v1-preflight-state-cache-v4" &&\n    cachedPreflight?.cacheKey === preflightCacheKey &&\n    cachedPreflight?.kernelCandidate === KERNEL_CANDIDATE &&\n    cachedPreflight?.executionBindingId === EXECUTION_BINDING_ID &&\n    cachedPreflight?.historicalReplay &&\n    cachedPreflight?.state\n  ) {\n    historicalReplay = cachedPreflight.historicalReplay;\n    state = cachedPreflight.state;\n    console.log(JSON.stringify({ phase: "preflight-cache", status: "HIT", feasible: state.feasible?.length ?? 0, infeasible: state.infeasible?.length ?? 0 }));\n  } else {\n    console.log(JSON.stringify({ phase: "preflight-cache", status: "MISS" }));\n    historicalReplay = await validateHistoricalInfeasibleReplay({ bundle, historicalCorpus, out });\n    state = await preparePhysicalCorpus(bundle, corpus, out, historicalReplay);\n    writeJson(preflightCachePath, {\n      schemaVersion: "kernel-v1-preflight-state-cache-v4",\n      generatedAt: new Date().toISOString(),\n      kernelCandidate: KERNEL_CANDIDATE,\n      executionBindingId: EXECUTION_BINDING_ID,\n      cacheKey: preflightCacheKey,\n      historicalReplay,\n      state,\n    });\n  }\n'''
assert old in s, 'main preflight block not found'
s = s.replace(old, new, 1)

marker = '''function terminalDimensionKey(a, b) {\n'''
helper = '''function computePreflightCacheKey({ corpus, historicalCorpus }) {\n  const payload = {\n    schema: "kernel-v1-preflight-cache-key-v1",\n    kernelCandidate: KERNEL_CANDIDATE,\n    executionBindingId: EXECUTION_BINDING_ID,\n    restoCorpusSha256: hashXmlDirectory(corpus),\n    parte1CorpusSha256: hashXmlDirectory(historicalCorpus),\n    auditSha256: sha256(readFileSync(AUDIT_PATH)),\n    semanticsSha256: sha256(readFileSync(SEMANTICS_PATH)),\n    embeddedSha256: sha256(readFileSync(EMBEDDED_PATH)),\n    historicalCsvSha256: sha256(readFileSync(HISTORICAL_CSV_PATH)),\n  };\n  return sha256(JSON.stringify(payload));\n}\n\nfunction hashXmlDirectory(dir) {\n  const hash = createHash("sha256");\n  const names = readdirSync(dir).filter((name) => name.toLowerCase().endsWith(".xml")).sort(cmp);\n  for (const name of names) {\n    hash.update(name);\n    hash.update("\\0");\n    hash.update(readFileSync(join(dir, name)));\n    hash.update("\\0");\n  }\n  return hash.digest("hex");\n}\n\n'''
assert marker in s, 'terminalDimensionKey marker not found'
if 'function computePreflightCacheKey' not in s:
    s = s.replace(marker, helper + marker, 1)

p.write_text(s, encoding='utf-8')
print('patched v4 preflight cache')

# Promote a finite, explicit candidate budget set without marking it RESOLVED.
policy_path = Path('research/optimizer/freeze/KERNEL_V1_FORMAL_CERTIFICATION_POLICY.json')
policy = json.loads(policy_path.read_text(encoding='utf-8'))
policy['schemaVersion'] = 'kernel-v1-formal-certification-policy-v14'
db = policy['deterministicBudgets']
db['status'] = 'CANDIDATE_VALUES_PENDING_VALIDATION'
db['candidateValues'] = {
    'OPTIMIZER_MAX_BEAM_EXPANSIONS': 1024,
    'OPTIMIZER_BEAM_WATCHDOG_MS': 5000,
    'OPTIMIZER_MAX_MASTER_NODES': 1600000,
    'OPTIMIZER_MASTER_WATCHDOG_MS': 60000,
    'OPTIMIZER_MAX_RESCUE_ATTEMPTS': 384,
    'OPTIMIZER_RESCUE_WATCHDOG_MS': 10000,
}
db['candidateEvidence'] = {
    'beam': '48 activated cases / 2518 invocations; 47 cases without Beam timeout have expansionsMax p50=20 p90=32 max=1016. 1024 is the first deterministic equivalence candidate and must preserve baseline boardCount on the finite validation cohort.',
    'master': '27 resolverCobertura invocations; 22 uncensored (p50=1 p90=1 max=580) and 5 historical-time-censored explosive runs up to 1306553 nodes at ~8s. 1600000 is an explicit reference-equivalence candidate above the observed censored work envelope; it is not claimed to be natural completed-search work.',
    'oneboard': '22/22 activated runs; attemptsMax p50=p90=max=384; zero raw timeout hits; 384 is both the structural search-space ceiling and the empirical completed-run maximum.',
    'watchdogs': 'Watchdogs are safety fuses, not work budgets: Beam 5s is above the observed ~1.8s historical-timeout call envelope; Master 60s accommodates 1.6M nodes even near the slowest observed censored throughput (~33k nodes/s); OneBoard 10s is >4x the observed 2.366s completed-run envelope.',
}
db['candidatePromotionGate'] = {
    'scope': 'Re-run the already measured calibration checkpoint cases under candidate values; no new statistical sampling is required for promotion.',
    'requirements': [
        'validationOk=true and historical demand multiset exact for every case',
        'boardCount exactly equals the budgets-OFF baseline for every re-run case',
        'all Beam/Master/OneBoard watchdogHits are zero',
        'controlled Beam fallback remains acceptable only under the existing semantic fallback rule',
    ],
    'failureRule': 'If a case fails, adjust only the budget/watchdog for the path implicated by telemetry and re-run failed cases plus their same-path cohort. Do not restart calibration methodology or expand the runtime-estimation sample.',
    'successAction': 'Copy candidateValues into deterministicBudgets.values, set deterministicBudgets.status=RESOLVED, version the evidence, then start formal correctness.',
}
policy['formalCertificationReady'] = False
policy['blockingReasons'] = ['Candidate deterministic budgets/watchdogs require finite baseline-equivalence validation before promotion.']
policy_path.write_text(json.dumps(policy, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
print('patched policy v14 budget candidate')
