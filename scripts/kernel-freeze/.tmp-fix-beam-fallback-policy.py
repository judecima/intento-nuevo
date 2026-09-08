from pathlib import Path
import json
p = Path('research/optimizer/freeze/KERNEL_V1_FORMAL_CERTIFICATION_POLICY.json')
d = json.loads(p.read_text())
d['schemaVersion'] = 'kernel-v1-formal-certification-policy-v13'
cp = d['deterministicBudgets']['calibrationProtocol']
cp['telemetryProbeRule'] = 'Before calibration, a fresh valid run must show non-zero Beam expansions, Master nodes, or OneBoard attempts. Calls/runs alone do not satisfy the probe. A controlled Beam no-complete-plan fallback is allowed only with valid final output and live Beam work/terminal-control accounting; unexpected Beam exceptions fail the probe.'
p.write_text(json.dumps(d, indent=2, ensure_ascii=False) + '\n')
