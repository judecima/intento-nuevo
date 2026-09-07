# V22b — Evidence before any Pattern Master budget policy

Date: 2026-09-06
Branch: `optimizer-v22b-progressive-master-evidence`
Parent: V20 base `cf167bf85399cd90bda8c7eb8b5a050bdaa1a8f0`
Issue: #19

## Closed result: V22a FAIL

V22a (`run Master only when gap <= 1`) is rejected for correctness.

Mandatory holdout result:
- `4050594`: 7 boards, gap 1, Master runs — PASS.
- `4058501`: V22a ON => 9 boards, gap 2, Master skipped — FAIL.
- same binary with V22a OFF => 8 boards.

The threshold will not be moved to gap 2/3 after seeing this result.

## Gap-only activation is permanently rejected

Known 40-round Master wins span:
- `4056900`: pre-Master 7 -> 6, cota 6, gap 1;
- `4058501`: pre-Master 9 -> 8, cota 7, gap 2;
- `4059200`: pre-Master 18 -> 17, cota 13, gap 5.

There is no empirically supported hard maximum gap at which Pattern Master becomes unable to win. Gap remains diagnostic only.

## Mandatory cross-cohort quality set = 5

`experiencia/master-quality-sentinels.json`

Confirmed 40-round references:
- `4050594` => 7 boards;
- `4056900` => 6 boards;
- `4058501` => 8 boards;
- `4059200` => 17 boards;
- `4057401` => 4 boards.

`4057401` was promoted from calibration candidate after a successful 40-round reproduction.

Historical `experiencia/v7/all20.jsonl` contains four distinct 20-round Master wins:
- `4050594`;
- `4056900`;
- `4057401`;
- `4059200`.

`4058501` is absent from that 20-round win list because 20 rounds regress it to 9 boards; 40 rounds recover 8 boards.

## Stable cost fact

Pattern Master historical wall time remains dominated by generation:
- generation + monotype: 96.24%;
- coverage solver: 3.76%.

Therefore `msMaster`/coverage-solver tuning is not the primary latency lever.

## Prefix profiler result — parity valid

The accumulated-prefix profiler was run on all five sentinels with checkpoints:

`5,10,15,20,25,30,35,40`

`parity40=true` in all five cases.

Observed curves:

| Case | Gap | Reference | First improvement | Later behavior |
|---|---:|---:|---:|---|
| `4050594` | 1 | 7 | 5 | plateau through 40; no later selected columns |
| `4056900` | 1 | 6 | 10 | new material continues through round 37 |
| `4058501` | 2 | 8 | 35 | no selected columns through round 30; full 8-board solution appears at 35 |
| `4059200` | 5 | 17 | 5 | new columns continue through round 26 |
| `4057401` | 1 | 4 | 10 | small pool; early empirical saturation |

### Decisive adversarial case: `4058501`

Checkpoint curve:

```text
rondas    5  10  15  20  25  30  35  40
placas    9   9   9   9   9   9   8   8
sel       0   0   0   0   0   0   8   8
nuevasSel 0   0   0   0   0   0   2   0
```

For thirty rounds there is no board improvement and no selected/useful-column signal. The complete winning solution appears only at checkpoint 35.

Therefore the following policy families are classified UNSAFE and CLOSED:
- stop after N rounds/checkpoints without board improvement;
- stop after N rounds/checkpoints without currently selected/useful columns;
- choosing a larger N after observing this plateau.

## Remaining signal under study: empirical pool saturation

This is diagnostic only; no runtime policy is authorized.

Important distinction:
- a long zero-growth streak means the current generator is empirically recycling vectors;
- it does **not** mathematically prove that no unseen vector can appear later.

`4057401` motivates measuring saturation because its pool nearly stops growing while `4058501` continues adding vectors until late. But `4057401` is also a small order with few types, so saturation may simply be a proxy for problem size.

## Next evidence cohort — fixed before measurement

Use 40 historical Master activations with zero recorded board gain.

Selection rule:
1. exclude all mandatory sentinels;
2. require successful, non-cache, valid historical rows with Master activation and zero Master board gain;
3. sort by historical type-complexity proxy (`pool.patronesMonotipo`, fallback `optimizarCalls.monotipo`);
4. split into four equal-count quartiles;
5. inside each quartile, select evenly across the historical Master-time range.

Purpose:
- cover small and large type spaces;
- cover cheap and expensive Master calls;
- avoid testing saturation only on small orders or only on the expensive tail.

Selector:
`node scripts/v22b-select-saturation-cohort.mjs`

## Saturation metrics — exact per round

`v22b-master-prefix-profile.mjs` now records, for every generation round:
- `newVectors`;
- accumulated `poolSize`;
- last round that added a vector;
- rounds since last new vector;
- maximum consecutive zero-growth streak;
- vectors added in the last 5/10/20 rounds;
- total zero-growth rounds;
- total growth rounds.

The profiler also records actual canonical `types` and `pieces`, so saturation can be tested against order complexity instead of relying on the historical proxy.

## Diagnostic analysis — no threshold selection

`node scripts/v22b-saturation-analyze.mjs`

The analyzer reports:
- saturation distributions across the 40 non-wins;
- Spearman correlation of saturation against type count and piece count;
- sensitivity tables for zero-growth streaks 5/10/15/20;
- how many non-wins each streak would cut;
- generation rounds saved as a structural proxy;
- whether any known sentinel would potentially be cut before its known winning checkpoint.

Interpretation rules:
1. A strong relationship between small type count and saturation weakens saturation as an independent signal.
2. Any known sentinel threatened by a candidate streak closes that streak immediately.
3. Zero sentinel losses is necessary but not sufficient for safety.
4. Generation-round savings are not wall-time savings; same-machine timing is required only after a candidate policy survives evidence.
5. No threshold is selected retroactively to make the result pass.

## Commands

```powershell
git checkout optimizer-v22b-progressive-master-evidence
git pull
node scripts/experience-benchmark.mjs report --rebuild

# 1) Re-profile all five mandatory sentinels with per-round pool growth.
node scripts/v22b-master-prefix-profile.mjs `
  --corpus "D:\proyectos asistidos\lepton\data\lepton-xml" `
  --out experiencia/v22b-master-prefix-profile.json

# 2) Select a deterministic, stratified 40-case Master non-win cohort.
node scripts/v22b-select-saturation-cohort.mjs `
  --source experiencia/v7/all20.jsonl `
  --out experiencia/v22b-saturation-nonwins-40.txt `
  --meta experiencia/v22b-saturation-nonwins-40.json

# 3) Profile the 40 non-wins with the exact same generator/checkpoints.
node scripts/v22b-master-prefix-profile.mjs `
  --corpus "D:\proyectos asistidos\lepton\data\lepton-xml" `
  --files experiencia/v22b-saturation-nonwins-40.txt `
  --out experiencia/v22b-saturation-nonwins-40-profile.json

# 4) Produce the saturation diagnostic; this does not authorize a cutoff.
node scripts/v22b-saturation-analyze.mjs `
  --wins experiencia/v22b-master-prefix-profile.json `
  --nonwins experiencia/v22b-saturation-nonwins-40-profile.json `
  --out experiencia/v22b-saturation-analysis.json
```

## Current policy status

Rejected by evidence:
- cutoff by gap;
- fixed round cap;
- furniture/family predictor as a sufficient safe replacement;
- patience on board improvement;
- patience on currently selected/useful columns.

Open:
- empirical pool saturation, diagnostic only.

If saturation also fails to discriminate without threatening quality, V22b ends as `NO_SAFE_CHEAP_SIGNAL`; the next direction should not be another hand-tuned cutoff. It should move to a structurally different approach such as master-guided/dual-priced generation or asynchronous rescue.
