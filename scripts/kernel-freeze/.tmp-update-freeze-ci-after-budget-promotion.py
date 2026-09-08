#!/usr/bin/env python3
from pathlib import Path

p = Path('.github/workflows/optimizer-kernel-freeze.yml')
s = p.read_text(encoding='utf-8')
repls = {
"          node --check scripts/kernel-freeze/formal-certification-v3.mjs\n": "          node --check scripts/kernel-freeze/formal-certification-v3.mjs\n          node --check scripts/kernel-freeze/formal-correctness-v1.mjs\n",
"          if (pre.policy.deterministicBudgetsReady) throw new Error('Budgets unexpectedly ready without calibration');\n": "          if (!pre.policy.deterministicBudgetsReady) throw new Error('Promoted deterministic budgets must be ready');\n",
"          if (pre.policy.blockingReasons.length !== 1 || !pre.policy.blockingReasons[0].includes('budgets')) throw new Error('Budget calibration must be the only remaining policy blocker');\n": "          if (pre.policy.blockingReasons.length !== 0) throw new Error('Formal preflight must have no policy blockers after budget promotion');\n",
"          if (pre.policy.formalCertificationReady || final.formalCertification.policyReady) throw new Error('Kernel must not be formally ready before budget calibration');\n": "          if (!pre.policy.formalCertificationReady || !final.formalCertification.policyReady) throw new Error('Formal policy must be ready after deterministic budget promotion');\n",
"          console.log('FORMAL_CERTIFICATION_ONLY_POLICY_BLOCKER=deterministic-budget-calibration');\n": "          console.log('FORMAL_CERTIFICATION_POLICY_READY=true');\n",
}
for old, new in repls.items():
    if old not in s:
        raise SystemExit(f'missing expected workflow text: {old!r}')
    s = s.replace(old, new, 1)
p.write_text(s, encoding='utf-8')
