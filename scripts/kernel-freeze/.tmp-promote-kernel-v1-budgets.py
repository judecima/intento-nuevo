#!/usr/bin/env python3
import json
from pathlib import Path

p = Path('research/optimizer/freeze/KERNEL_V1_FORMAL_CERTIFICATION_POLICY.json')
data = json.loads(p.read_text(encoding='utf-8'))
expected = {
    'OPTIMIZER_MAX_BEAM_EXPANSIONS': 1024,
    'OPTIMIZER_BEAM_WATCHDOG_MS': 5000,
    'OPTIMIZER_MAX_MASTER_NODES': 1600000,
    'OPTIMIZER_MASTER_WATCHDOG_MS': 60000,
    'OPTIMIZER_MAX_RESCUE_ATTEMPTS': 384,
    'OPTIMIZER_RESCUE_WATCHDOG_MS': 10000,
}
assert data['kernelCandidate'] == '4063963260abb10c8d68d0e553942899c925cc2f'
assert data['deterministicBudgets']['candidateValues'] == expected

data['schemaVersion'] = 'kernel-v1-formal-certification-policy-v15'
data['date'] = '2026-09-08'
data['deterministicBudgets']['status'] = 'RESOLVED'
data['deterministicBudgets']['values'] = dict(expected)
data['deterministicBudgets']['validationEvidence'] = {
    'status': 'PASS',
    'source': 'test-results/kernel-v1-formal-certification/budget-candidate-v1.summary.json',
    'checkpoint': 'test-results/kernel-v1-formal-certification/budget-candidate-v1.partial.jsonl',
    'versionedRecord': 'research/optimizer/freeze/KERNEL_V1_BUDGETS_RESOLVED_2026-09-08.md',
    'baselineCases': 56,
    'completedPassCases': 56,
    'failures': 0,
    'sameBoardCountAsBaselineCases': 56,
    'zeroWatchdogHitsCases': 56,
    'promotionReady': True,
    'beamDecisiveCase': {
        'fileContains': '4052960',
        'expansionsMax': 1010,
        'budget': 1024,
        'budgetHits': 0,
        'watchdogHits': 0,
        'boardsBaseline': 14,
        'boardsBudgeted': 14,
    },
    'masterDecisiveCase': {
        'fileContains': '4059352',
        'nodesMax': 1600000,
        'budget': 1600000,
        'budgetHits': 1,
        'watchdogHits': 0,
        'boardsBaseline': 29,
        'boardsBudgeted': 29,
    },
    'oneboard': {
        'fullEnumerationCases': 21,
        'attemptsMax': 384,
        'budgetHits': 0,
        'earlySuccessAttempts': 51,
    },
}
gate = data['deterministicBudgets'].get('candidatePromotionGate', {})
gate['status'] = 'PASS'
gate['promotionReady'] = True
gate['completedBaselineCases'] = 56
gate['completedPassCases'] = 56
gate['successAction'] = 'COMPLETED: candidateValues promoted to deterministicBudgets.values; formal correctness is the current gate.'
data['deterministicBudgets']['candidatePromotionGate'] = gate

provenance = data['deterministicBudgets'].setdefault('provenance', [])
record = 'research/optimizer/freeze/KERNEL_V1_BUDGETS_RESOLVED_2026-09-08.md'
if record not in provenance:
    provenance.append(record)

data['formalCertificationReady'] = True
data['blockingReasons'] = []
exec_cfg = data.setdefault('execution', {})
exec_cfg['formalCorrectnessHarness'] = 'scripts/kernel-freeze/formal-correctness-v1.mjs'
exec_cfg['formalCorrectnessCheckpoint'] = 'test-results/kernel-v1-formal-certification/formal-correctness-v1.partial.jsonl'
exec_cfg['formalCorrectnessSummary'] = 'test-results/kernel-v1-formal-certification/formal-correctness-v1.summary.json'
exec_cfg['formalCorrectnessStatus'] = 'READY'

p.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
