from pathlib import Path

p = Path('scripts/kernel-freeze/kernel-budget-calibration-v4.mjs')
s = p.read_text(encoding='utf-8')

old = '  const maxNew = args.maxNew == null ? Infinity : positiveInt(args.maxNew, "--maxNew");\n'
new = '  const maxNew = args.maxNew == null ? Infinity : nonNegativeInt(args.maxNew, "--maxNew");\n'
assert old in s, 'maxNew block not found'
s = s.replace(old, new, 1)

old = '''  const staticOneboardCandidates = state.feasible\n    .filter((item) => staticAreaLowerBound(item.case) === 1)\n    .sort(compareStaticOneboardCandidates);\n'''
new = '''  const runtimePopulation = state.feasible\n    .map((item) => ({\n      file: item.file,\n      format: item.format,\n      pieces: quantity(item.case),\n      staticAreaLowerBound: staticAreaLowerBound(item.case),\n      referencePanels: item.referencePanels,\n    }))\n    .sort((a, b) => cmp(a.file, b.file));\n  writeJson(join(out, "formal-runtime-population-v1.json"), {\n    schemaVersion: "kernel-v1-formal-runtime-population-v1",\n    generatedAt: new Date().toISOString(),\n    executionBindingId: EXECUTION_BINDING_ID,\n    feasibleCases: runtimePopulation.length,\n    features: ["pieces", "staticAreaLowerBound", "referencePanels"],\n    note: "Static planning metadata only. No optimizer execution is required to build this inventory.",\n    cases: runtimePopulation,\n  });\n\n  const staticOneboardCandidates = state.feasible\n    .filter((item) => staticAreaLowerBound(item.case) === 1)\n    .sort(compareStaticOneboardCandidates);\n'''
assert old in s, 'static candidate block not found'
s = s.replace(old, new, 1)

p.write_text(s, encoding='utf-8')
print('patched kernel-budget-calibration-v4.mjs')
