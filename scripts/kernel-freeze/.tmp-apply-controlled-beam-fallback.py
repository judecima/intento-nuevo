from pathlib import Path
import json

p = Path('scripts/kernel-freeze/kernel-budget-calibration-v4.mjs')
s = p.read_text()

old = '''    const beamFallbackWarning = hasBeamFallbackWarning(result.stderrTail);\n    const pass = Boolean('''
new = '''    const beamFallback = classifyBeamFallback(result.stderrTail);\n    const beamFallbackWarning = beamFallback.present;\n    const beamFallbackAccepted = !beamFallback.present || (beamFallback.controlled && beamAccounting.ok);\n    const pass = Boolean('''
assert old in s
s = s.replace(old, new, 1)
s = s.replace('      !beamFallbackWarning\n    );', '      beamFallbackAccepted\n    );', 1)
s = s.replace('      beamFallbackWarning,\n      pass,', '      beamFallbackWarning,\n      beamFallback,\n      beamFallbackAccepted,\n      pass,', 1)
s = s.replace('beamFallbackWarning=${beamFallbackWarning}; stderr=', 'beamFallback=${JSON.stringify(beamFallback)}; stderr=', 1)

old = '''    const beamFallbackWarning = hasBeamFallbackWarning(result.stderrTail);\n    const valid = result.ok && result.validationOk && !result.cacheHit && result.pieces === result.expectedPieces && result.demandMultisetOk && telemetryWired && beamAccounting.ok && !beamFallbackWarning;'''
new = '''    const beamFallback = classifyBeamFallback(result.stderrTail);\n    const beamFallbackWarning = beamFallback.present;\n    const beamFallbackAccepted = !beamFallback.present || (beamFallback.controlled && beamAccounting.ok);\n    const valid = result.ok && result.validationOk && !result.cacheHit && result.pieces === result.expectedPieces && result.demandMultisetOk && telemetryWired && beamAccounting.ok && beamFallbackAccepted;'''
assert old in s
s = s.replace(old, new, 1)
s = s.replace('      beamFallbackWarning,\n      stderrTail:', '      beamFallbackWarning,\n      beamFallback,\n      beamFallbackAccepted,\n      stderrTail:', 1)

old = '''function hasBeamFallbackWarning(stderrTail) {\n  return /Beam Search falló, se usa greedy:/i.test(String(stderrTail ?? ""));\n}'''
new = '''function classifyBeamFallback(stderrTail) {\n  const text = String(stderrTail ?? "");\n  const present = /Beam Search falló, se usa greedy:/i.test(text);\n  if (!present) return { present: false, controlled: false, classification: "NONE" };\n  const controlled = /Beam Search falló, se usa greedy:[\\s\\S]*No se pudo completar el plan con Beam Search/i.test(text);\n  return {\n    present: true,\n    controlled,\n    classification: controlled ? "CONTROLLED_NO_COMPLETE_BEAM_PLAN" : "UNEXPECTED_BEAM_EXCEPTION",\n  };\n}'''
assert old in s
s = s.replace(old, new, 1)

s = s.replace(
    'Any swallowed Beam fallback warning fails the probe.',
    'A controlled Beam no-complete-plan fallback is accepted only when the final result is valid and Beam work/terminal accounting is live; any other Beam exception remains fatal.',
)
s = s.replace(
    '"Beam calls may legitimately be zero when greedy already reaches the area lower bound; when Beam is called, v4 requires work/terminal-control accounting and rejects swallowed Beam fallbacks.",',
    '"Beam calls may legitimately be zero when greedy already reaches the area lower bound. A controlled no-complete-plan Beam fallback is legitimate candidate behavior when the final greedy result is valid and Beam work/terminal-control accounting is present; unexpected Beam exceptions remain fatal.",',
)

old = '''    engineMs: result.metrics.engineMs,\n    cacheHit: Boolean(result.metrics.cacheHit),'''
new = '''    engineMs: result.metrics.engineMs,\n    profile: result.profile,\n    cacheHit: Boolean(result.metrics.cacheHit),'''
assert old in s
s = s.replace(old, new, 1)

old = '''    historicalClassifierValidation: state.historicalReplay,\n    aggregatePerOrderDistributions: {'''
new = '''    historicalClassifierValidation: state.historicalReplay,\n    calibrationProfilesObserved: [...new Set(rows.map((row) => row.profile ?? "balanced-v10-benchmark-default"))],\n    historicalWallClockCeilings: {\n      beamMs: 1500,\n      masterMs: 8000,\n      oneboardMs: 20000,\n      note: "benchmarkInputFromCanonicalCase strategy=v10 defaults to balanced; balanced leaves motor Beam at its historical 1500ms default, while V10 Master defaults to 8000ms and OneBoard rescue to 20000ms.",\n    },\n    aggregatePerOrderDistributions: {'''
assert old in s
s = s.replace(old, new, 1)
p.write_text(s)

polp = Path('research/optimizer/freeze/KERNEL_V1_FORMAL_CERTIFICATION_POLICY.json')
policy = json.loads(polp.read_text())
policy['schemaVersion'] = 'kernel-v1-formal-certification-policy-v12'
cp = policy['deterministicBudgets']['calibrationProtocol']
cp['benchmarkProfile'] = 'benchmarkInputFromCanonicalCase(...,{strategy:"v10"}) defaults to profile=balanced. Historical calibration ceilings are therefore Beam 1500ms (motor default), Master 8000ms, OneBoard 20000ms.'
cp['beamFallbackRule'] = 'The candidate explicitly degrades Beam to greedy when armarPlacasBeam throws. Calibration accepts only the controlled no-complete-plan error (message starts No se pudo completar el plan con Beam Search) when the final output remains valid and Beam work/terminal-control accounting is present. Any other Beam exception remains a calibration failure.'
cp['beamTimeoutInterpretation'] = 'Beam timeoutHits is aggregated across Beam invocations. Under the v10 benchmark balanced profile the historical per-invocation Beam ceiling is 1500ms, not 2500ms. A case with timeoutHits>0 contains time-censored Beam work even if other invocations terminate normally.'
polp.write_text(json.dumps(policy, indent=2, ensure_ascii=False) + '\n')
