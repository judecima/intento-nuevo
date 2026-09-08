from pathlib import Path
import json

path = Path('scripts/kernel-freeze/kernel-budget-calibration-v4.mjs')
s = path.read_text(encoding='utf-8')

old = '''  const maxNew = args.maxNew == null ? Infinity : positiveInt(args.maxNew, "--maxNew");
  const timeoutMs = args.timeout == null ? 7_200_000 : positiveInt(args.timeout, "--timeout");
  const calibrationOrder = String(args.order ?? "work-first");
  if (!new Set(["work-first", "cheap-first"]).has(calibrationOrder)) fail("--order must be work-first or cheap-first");'''
new = '''  const maxNew = args.maxNew == null ? Infinity : positiveInt(args.maxNew, "--maxNew");
  const timeoutMs = args.timeout == null ? 7_200_000 : positiveInt(args.timeout, "--timeout");
  const calibrationOrder = String(args.order ?? "work-first");
  if (!new Set(["work-first", "cheap-first"]).has(calibrationOrder)) fail("--order must be work-first or cheap-first");
  const oneboardQuota = args.oneboardQuota == null ? 12 : nonNegativeInt(args.oneboardQuota, "--oneboardQuota");'''
assert old in s
s = s.replace(old, new, 1)

old = '''    activationHints,
    calibrationOrder,
  );'''
new = '''    activationHints,
    calibrationOrder,
    oneboardQuota,
  );'''
assert old in s
s = s.replace(old, new, 1)

old = '''      calibrationOrder,
      file: item.file,'''
new = '''      calibrationOrder,
      calibrationOneboardQuota: oneboardQuota,
      file: item.file,'''
assert old in s
s = s.replace(old, new, 1)

old = '''    orderingModesObserved: [...new Set(rows.map((row) => row.calibrationOrder ?? "v4-pre-ordering-field"))],
    budgetParameterSemantics: {'''
new = '''    orderingModesObserved: [...new Set(rows.map((row) => row.calibrationOrder ?? "v4-pre-ordering-field"))],
    oneboardQuotaValuesObserved: [...new Set(rows.map((row) => row.calibrationOneboardQuota ?? "v4-pre-oneboard-quota-field"))],
    budgetParameterSemantics: {'''
assert old in s
s = s.replace(old, new, 1)

start = s.index('function orderCalibration(items, hints, tailOrders, activationHints, mode) {')
end = s.index('\nfunction calibrationEnv() {', start)
new_func = '''function orderCalibration(items, hints, tailOrders, activationHints, mode, oneboardQuota) {
  const tails = new Set(tailOrders.map(String));
  const isTail = (file) => [...tails].some((order) => file.includes(order));
  const hintFor = (file) => activationHints.get(file) ?? null;
  const oneboardActivated = (file) => Number(hintFor(file)?.oneboardActivations ?? 0) > 0;
  const anyActivated = (file) => {
    const hint = hintFor(file);
    return Boolean(hint && (hint.masterActivations > 0 || hint.oneboardActivations > 0));
  };
  const historicalMs = (file) => hints.get(file);
  const cheapComparator = (a, b) => {
    const ah = historicalMs(a.file), bh = historicalMs(b.file);
    if (Number.isFinite(ah) && Number.isFinite(bh) && ah !== bh) return ah - bh;
    if (Number.isFinite(ah) !== Number.isFinite(bh)) return Number.isFinite(ah) ? -1 : 1;
    const aq = quantity(a.case), bq = quantity(b.case);
    return aq - bq || cmp(a.file, b.file);
  };
  const workComparator = (a, b) => {
    const aa = anyActivated(a.file), ba = anyActivated(b.file);
    if (aa !== ba) return aa ? -1 : 1;
    const ah = historicalMs(a.file), bh = historicalMs(b.file);
    if (Number.isFinite(ah) && Number.isFinite(bh) && ah !== bh) return bh - ah;
    if (Number.isFinite(ah) !== Number.isFinite(bh)) return Number.isFinite(ah) ? -1 : 1;
    const aq = quantity(a.case), bq = quantity(b.case);
    return bq - aq || cmp(a.file, b.file);
  };

  const nonTails = items.filter((item) => !isTail(item.file));
  const tailItems = items.filter((item) => isTail(item.file)).sort(cheapComparator);
  if (mode === "cheap-first") return nonTails.sort(cheapComparator).concat(tailItems);

  // Reserve an explicit early evidence stratum for OneBoard. Cheapest known
  // historical activations are sampled first so the rare path cannot be
  // starved by expensive Master-heavy hotspots. This changes order only.
  const reservedOneboard = nonTails
    .filter((item) => oneboardActivated(item.file))
    .sort(cheapComparator)
    .slice(0, oneboardQuota);
  const reservedFiles = new Set(reservedOneboard.map((item) => item.file));
  const remaining = nonTails
    .filter((item) => !reservedFiles.has(item.file))
    .sort(workComparator);
  return reservedOneboard.concat(remaining, tailItems);
}'''
s = s[:start] + new_func + s[end:]

old = '''function positiveInt(value, label) { const n = Number(value); if (!Number.isSafeInteger(n) || n <= 0) fail(`${label} must be a positive integer`); return n; }
function parseArgs(values) {'''
new = '''function positiveInt(value, label) { const n = Number(value); if (!Number.isSafeInteger(n) || n <= 0) fail(`${label} must be a positive integer`); return n; }
function nonNegativeInt(value, label) { const n = Number(value); if (!Number.isSafeInteger(n) || n < 0) fail(`${label} must be a non-negative integer`); return n; }
function parseArgs(values) {'''
assert old in s
s = s.replace(old, new, 1)
path.write_text(s, encoding='utf-8')

policy_path = Path('research/optimizer/freeze/KERNEL_V1_FORMAL_CERTIFICATION_POLICY.json')
policy = json.loads(policy_path.read_text(encoding='utf-8'))
policy['schemaVersion'] = 'kernel-v1-formal-certification-policy-v10'
cp = policy['deterministicBudgets']['calibrationProtocol']
cp['initialOrder'] = 'work-first with an explicit OneBoard evidence stratum: reserve up to 12 historically OneBoard-activated feasible cases, cheapest first, then continue normal Master/OneBoard-activated work-first ordering; known extreme-tail orders remain forced last. --oneboardQuota overrides the stratum size and --order cheap-first disables work-first stratification. Ordering changes execution priority only, never the exact 8,650-case calibration universe.'
cp['oneboardEvidenceRule'] = 'OneBoard is rare (cota===1 activation condition) and must not rely on incidental appearance in a Master-heavy sample. Early work-first calibration reserves an explicit default quota of 12 historically OneBoard-activated feasible cases, cheapest first. The quota is evidence-density tooling only; production budget promotion still requires current-run measured OneBoard attempts and adequate tail evidence.'
policy['execution']['ordering']['calibration'] = 'work-first stratified: up to 12 historical OneBoard-activated feasible cases cheapest first, then normal historical Master/OneBoard activation with engineMs descending / piece-count descending; known extreme tail last. --oneboardQuota overrides quota; --order cheap-first available. Final universe unchanged.'
policy_path.write_text(json.dumps(policy, indent=2) + '\n', encoding='utf-8')
