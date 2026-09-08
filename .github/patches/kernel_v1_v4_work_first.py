from pathlib import Path
import json
import re

HARNESS = Path('scripts/kernel-freeze/kernel-budget-calibration-v4.mjs')
POLICY = Path('research/optimizer/freeze/KERNEL_V1_FORMAL_CERTIFICATION_POLICY.json')
WORKFLOW = Path('.github/workflows/kernel-v1-v4-work-first-apply.yml')
SELF = Path('.github/patches/kernel_v1_v4_work_first.py')

s = HARNESS.read_text(encoding='utf-8')

needle = '  const timeoutMs = args.timeout == null ? 7_200_000 : positiveInt(args.timeout, "--timeout");\n'
assert needle in s
s = s.replace(
    needle,
    needle
    + '  const calibrationOrder = String(args.order ?? "work-first");\n'
    + '  if (!new Set(["work-first", "cheap-first"]).has(calibrationOrder)) fail("--order must be work-first or cheap-first");\n',
    1,
)

needle = '  const hints = readHistoricalTimingHints();\n'
assert needle in s
s = s.replace(needle, needle + '  const activationHints = readHistoricalBudgetedPathHints();\n', 1)

needle = '  const ordered = orderCalibration(state.feasible, hints, policy.execution?.knownExtremeTailOrders ?? []);'
assert needle in s
s = s.replace(
    needle,
    '''  const ordered = orderCalibration(
    state.feasible,
    hints,
    policy.execution?.knownExtremeTailOrders ?? [],
    activationHints,
    calibrationOrder,
  );''',
    1,
)

needle = '      phase: "calibration",\n      executionBindingId: EXECUTION_BINDING_ID,\n      telemetryContractId: TELEMETRY_CONTRACT_ID,\n'
assert needle in s
s = s.replace(needle, needle + '      calibrationOrder,\n', 1)

line_replacements = {
    '      beamExpansionsTotal: values((row) => row.step0?.beam?.expansionsTotal),\n':
        '      beamExpansionsTotal: values((row) => row.step0?.beam?.expansionsTotal),\n'
        '      beamExpansionsMax: values((row) => row.step0?.beam?.expansionsMax),\n',
    '      beamCalls: values((row) => row.step0?.beam?.calls),\n':
        '      beamCalls: values((row) => row.step0?.beam?.calls),\n'
        '      beamWallMsTotal: values((row) => row.step0?.beam?.wallMsTotal),\n'
        '      beamWallMsMax: values((row) => row.step0?.beam?.wallMsMax),\n'
        '      beamTimeoutHits: values((row) => row.step0?.beam?.timeoutHits),\n'
        '      beamBudgetHits: values((row) => row.step0?.beam?.budgetHits),\n'
        '      beamWatchdogHits: values((row) => row.step0?.beam?.watchdogHits),\n',
    '      masterNodesTotal: values((row) => row.step0?.master?.nodesTotal),\n':
        '      masterNodesTotal: values((row) => row.step0?.master?.nodesTotal),\n'
        '      masterNodesMax: values((row) => row.step0?.master?.nodesMax),\n',
    '      masterRuns: values((row) => row.step0?.master?.runs),\n':
        '      masterRuns: values((row) => row.step0?.master?.runs),\n'
        '      masterWallMsTotal: values((row) => row.step0?.master?.wallMsTotal),\n'
        '      masterWallMsMax: values((row) => row.step0?.master?.wallMsMax),\n',
    '      oneboardAttemptsTotal: values((row) => row.step0?.oneboard?.attemptsTotal),\n':
        '      oneboardAttemptsTotal: values((row) => row.step0?.oneboard?.attemptsTotal),\n'
        '      oneboardAttemptsMax: values((row) => row.step0?.oneboard?.attemptsMax),\n',
    '      oneboardRuns: values((row) => row.step0?.oneboard?.runs),\n':
        '      oneboardRuns: values((row) => row.step0?.oneboard?.runs),\n'
        '      oneboardWallMsTotal: values((row) => row.step0?.oneboard?.wallMsTotal),\n'
        '      oneboardWallMsMax: values((row) => row.step0?.oneboard?.wallMsMax),\n',
}
for old, new in line_replacements.items():
    assert old in s, old
    s = s.replace(old, new, 1)

needle = '    historicalHotspotTimingMass: {\n'
assert needle in s
insert = '''    orderingModesObserved: [...new Set(rows.map((row) => row.calibrationOrder ?? "v4-pre-ordering-field"))],
    budgetParameterSemantics: {
      OPTIMIZER_MAX_BEAM_EXPANSIONS: { enforcementScope: "per armarPlacasBeam invocation", primaryCalibrationStatistic: "beam.expansionsMax", aggregateOperationalStatistic: "beam.expansionsTotal" },
      OPTIMIZER_BEAM_WATCHDOG_MS: { enforcementScope: "per armarPlacasBeam invocation", primaryCalibrationStatistic: "beam.wallMsMax", aggregateOperationalStatistic: "beam.wallMsTotal" },
      OPTIMIZER_MAX_MASTER_NODES: { enforcementScope: "per resolverCobertura run", primaryCalibrationStatistic: "master.nodesMax", aggregateOperationalStatistic: "master.nodesTotal" },
      OPTIMIZER_MASTER_WATCHDOG_MS: { enforcementScope: "per resolverCobertura run", primaryCalibrationStatistic: "master.wallMsMax", aggregateOperationalStatistic: "master.wallMsTotal" },
      OPTIMIZER_MAX_RESCUE_ATTEMPTS: { enforcementScope: "per rescatarUnaPlaca invocation", primaryCalibrationStatistic: "oneboard.attemptsMax", aggregateOperationalStatistic: "oneboard.attemptsTotal" },
      OPTIMIZER_RESCUE_WATCHDOG_MS: { enforcementScope: "per rescatarUnaPlaca invocation", primaryCalibrationStatistic: "oneboard.wallMsMax", aggregateOperationalStatistic: "oneboard.wallMsTotal" },
      aggregateRequestBudget: "NOT_PRESENT_IN_KERNEL_V1_CANDIDATE",
    },
'''
s = s.replace(needle, insert + needle, 1)

old_rule = '      "Calibrate from aggregate per-order work; do not translate historical presupuestoBeamMs=1500 per call directly into an expansion count.",\n'
assert old_rule in s
s = s.replace(
    old_rule,
    '      "Calibrate each deterministic budget from the work/time statistic in the exact scope where that parameter is enforced: Beam expansionsMax/wallMsMax per Beam invocation, Master nodesMax/wallMsMax per coverage run, and OneBoard attemptsMax/wallMsMax per rescue invocation.",\n'
    '      "Keep aggregate per-order totals as operational-load evidence; Candidate A has no aggregate request budget and this freeze must not add one.",\n',
    1,
)

pattern = r'function orderCalibration\(items, hints, tailOrders\) \{.*?\n\}\n\nfunction calibrationEnv'
replacement = '''function orderCalibration(items, hints, tailOrders, activationHints, mode) {
  const tails = new Set(tailOrders.map(String));
  const isTail = (file) => [...tails].some((order) => file.includes(order));
  const activated = (file) => {
    const hint = activationHints.get(file);
    return Boolean(hint && (hint.masterActivations > 0 || hint.oneboardActivations > 0));
  };
  return [...items].sort((a, b) => {
    const at = isTail(a.file), bt = isTail(b.file);
    if (at !== bt) return at ? 1 : -1;
    const ah = hints.get(a.file), bh = hints.get(b.file);
    if (mode === "work-first") {
      const aa = activated(a.file), ba = activated(b.file);
      if (aa !== ba) return aa ? -1 : 1;
      if (Number.isFinite(ah) && Number.isFinite(bh) && ah !== bh) return bh - ah;
      if (Number.isFinite(ah) !== Number.isFinite(bh)) return Number.isFinite(ah) ? -1 : 1;
      const aq = quantity(a.case), bq = quantity(b.case);
      return bq - aq || cmp(a.file, b.file);
    }
    if (Number.isFinite(ah) && Number.isFinite(bh) && ah !== bh) return ah - bh;
    if (Number.isFinite(ah) !== Number.isFinite(bh)) return Number.isFinite(ah) ? -1 : 1;
    const aq = quantity(a.case), bq = quantity(b.case);
    return aq - bq || cmp(a.file, b.file);
  });
}

function calibrationEnv'''
s, count = re.subn(pattern, replacement, s, count=1, flags=re.S)
assert count == 1
HARNESS.write_text(s, encoding='utf-8')

policy = json.loads(POLICY.read_text(encoding='utf-8'))
policy['schemaVersion'] = 'kernel-v1-formal-certification-policy-v8'
db = policy['deterministicBudgets']
db['rule'] = 'Do not run formal determinism certification with absent, guessed, smoke-test, or CI-convenience budgets. Calibrate each deterministic budget from work/time measured in the exact invocation scope where that parameter is enforced, while separately reporting aggregate per-order work. Watchdog hits must be zero during formal certification.'
cp = db['calibrationProtocol']
cp['initialOrder'] = 'work-first by default: historically Master/OneBoard-activated cases first, then higher historical hotspot engineMs and larger piece-count proxies; known extreme-tail orders remain forced last. --order cheap-first preserves the prior operational ordering. Ordering changes execution priority only, never the exact 8,650-case calibration universe.'
cp['beamRule'] = 'OPTIMIZER_MAX_BEAM_EXPANSIONS is enforced per armarPlacasBeam invocation, so its primary calibration statistic is beam.expansionsMax. beam.expansionsTotal is retained as aggregate per-order load evidence and must not be mistaken for the per-call budget.'
cp['budgetScopeRule'] = 'Primary budget statistics must match enforcement scope: Beam expansionsMax/wallMsMax per Beam invocation; Master nodesMax/wallMsMax per resolverCobertura run; OneBoard attemptsMax/wallMsMax per rescatarUnaPlaca invocation.'
cp['aggregateWorkRule'] = 'Also report per-order aggregate totals and call/run counts to characterize request-level load. Kernel V1 Candidate A has no aggregate request work budget; adding one changes search semantics and requires a new candidate plus recertification.'
cp['samplingRule'] = 'Early --maxNew batches may be work-first to increase deterministic-path evidence density. This is an ordering/sampling-efficiency device only; production budget promotion still requires sufficient tail evidence and the final certification universe remains the exact feasible subset of the fixed 8,650 resto cohort.'
policy['execution']['ordering']['calibration'] = 'work-first by default for early budget evidence: historical Master/OneBoard activation, then historical engineMs descending / piece-count descending; known extreme tail last. --order cheap-first available. Final universe unchanged.'
policy['execution']['partialCoverage'] = [x.replace('completed feasible v3 resto cases', 'completed feasible v4 resto cases') for x in policy['execution']['partialCoverage']]
POLICY.write_text(json.dumps(policy, indent=2) + '\n', encoding='utf-8')

WORKFLOW.unlink(missing_ok=True)
SELF.unlink(missing_ok=True)
