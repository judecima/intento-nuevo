from pathlib import Path

p = Path('scripts/kernel-freeze/kernel-budget-calibration-v4.mjs')
s = p.read_text(encoding='utf-8')

old = '''  const calibrationOrder = String(args.order ?? "work-first");
  if (!new Set(["work-first", "cheap-first"]).has(calibrationOrder)) fail("--order must be work-first or cheap-first");
'''
new = '''  const calibrationOrder = String(args.order ?? "work-first");
  if (!new Set(["work-first", "cheap-first", "random"]).has(calibrationOrder)) fail("--order must be work-first, cheap-first, or random");
  const calibrationSampleSeed = String(args.sampleSeed ?? "kernel-v1-runtime-sample-20260908");
'''
assert old in s, 'order block not found'
s = s.replace(old, new, 1)

old = '''    calibrationOrder,
    oneboardScanLimit,
  );
'''
new = '''    calibrationOrder,
    oneboardScanLimit,
    calibrationSampleSeed,
  );
'''
assert old in s, 'orderCalibration call block not found'
s = s.replace(old, new, 1)

old = '''      calibrationOrder,
      calibrationOneboardScanLimit: oneboardScanLimit,
'''
new = '''      calibrationOrder,
      calibrationSampleSeed: calibrationOrder === "random" ? calibrationSampleSeed : null,
      calibrationOneboardScanLimit: oneboardScanLimit,
'''
assert old in s, 'row calibration metadata block not found'
s = s.replace(old, new, 1)

old = '''      phase: "calibration",
      file: item.file,
      wallMs: result.wallMs,
'''
new = '''      phase: "calibration",
      file: item.file,
      wallMs: result.wallMs,
      processWallMs: result.processWallMs,
      freshProcessOverheadMs: result.freshProcessOverheadMs,
'''
assert old in s, 'console result block not found'
s = s.replace(old, new, 1)

old = '''async function runCase({ bundle, item, env, timeoutMs, out, label }) {
  const dir = join(out, ".cases-v4");
'''
new = '''async function runCase({ bundle, item, env, timeoutMs, out, label }) {
  const processStarted = performance.now();
  const dir = join(out, ".cases-v4");
'''
assert old in s, 'runCase header not found'
s = s.replace(old, new, 1)

old = '''      else if (code !== 0 || !record) rejectPromise(new Error(`worker ${code}`));
      else resolvePromise({ ...record, stderrTail: stderrTail.trim() || null });
'''
new = '''      else if (code !== 0 || !record) rejectPromise(new Error(`worker ${code}`));
      else {
        const processWallMs = performance.now() - processStarted;
        const engineWallMs = Number(record.wallMs ?? 0);
        resolvePromise({
          ...record,
          processWallMs,
          freshProcessOverheadMs: Math.max(0, processWallMs - engineWallMs),
          stderrTail: stderrTail.trim() || null,
        });
      }
'''
assert old in s, 'runCase resolve block not found'
s = s.replace(old, new, 1)

old = '''  const values = (fn) => distribution(rows.map((row) => Number(fn(row) ?? 0)));
'''
new = '''  const values = (fn) => distribution(rows.map((row) => Number(fn(row) ?? 0)));
  const optionalValues = (fn) => distribution(rows.map((row) => Number(fn(row))).filter(Number.isFinite));
'''
assert old in s, 'summary values helper not found'
s = s.replace(old, new, 1)

old = '''    aggregatePerOrderDistributions: {
      wallMs: values((row) => row.wallMs),
      cpuMs: values((row) => row.cpuMs),
'''
new = '''    aggregatePerOrderDistributions: {
      wallMs: values((row) => row.wallMs),
      processWallMs: optionalValues((row) => row.processWallMs),
      freshProcessOverheadMs: optionalValues((row) => row.freshProcessOverheadMs),
      cpuMs: values((row) => row.cpuMs),
'''
assert old in s, 'summary aggregate block not found'
s = s.replace(old, new, 1)

old = '''    orderingModesObserved: [...new Set(rows.map((row) => row.calibrationOrder ?? "v4-pre-ordering-field"))],
'''
new = '''    orderingModesObserved: [...new Set(rows.map((row) => row.calibrationOrder ?? "v4-pre-ordering-field"))],
    randomSampleSeedsObserved: [...new Set(rows.map((row) => row.calibrationSampleSeed).filter(Boolean))],
'''
assert old in s, 'orderingModesObserved block not found'
s = s.replace(old, new, 1)

old = '''function orderCalibration(items, hints, tailOrders, activationHints, mode, oneboardScanLimit) {
  const tails = new Set(tailOrders.map(String));
'''
new = '''function orderCalibration(items, hints, tailOrders, activationHints, mode, oneboardScanLimit, sampleSeed) {
  if (mode === "random") {
    return [...items].sort((a, b) => {
      const ah = sha256(`${sampleSeed}\\0${a.file}`);
      const bh = sha256(`${sampleSeed}\\0${b.file}`);
      return cmp(ah, bh) || cmp(a.file, b.file);
    });
  }
  const tails = new Set(tailOrders.map(String));
'''
assert old in s, 'orderCalibration signature not found'
s = s.replace(old, new, 1)

p.write_text(s, encoding='utf-8')
print('patched kernel-budget-calibration-v4.mjs')
