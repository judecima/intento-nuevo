# Guide-Slice v1 — industrial guided pattern portfolio

This challenger does not replace or edit `src/lib/optimizer/**`. It reduces the *number of pattern-generation calls* while delegating the physical construction of each panel to the existing industrial motor.

Rules preserved by delegation to `motor.cjs`:
- guillotine cuts cross the current free region edge-to-edge;
- the guide/anchor proposes the next slice;
- legal rotation and grain are respected by `orientaciones`;
- axis alternates by physical level;
- kerf, trim/edge dimensions and stage ceiling remain the motor's rules;
- real slice contraction remains enabled;
- each panel has its own root axis. A final plan may freely mix X- and Y-rooted panels.

Portfolio rule:
1. Select the stable highest-demand type as a repeated **hub/filler**.
2. For each other logical type, expose only `[guide, hub]` to one deterministic motor call.
3. Use the motor in deterministic greedy mode: `ruido=0`, one pass, one restart, no Beam, no Rescue and no multi-variant expansion.
4. Every physical board returned by those calls is a Master pattern. Type identity remains the original logical index; equal dimensions are never merged.

This is not a general promotion yet. The first gate is sentinel `4057401`, where the frozen 40-round reference uses 4 boards. The challenger must reproduce 4 boards, industrial validation and equal-board remnant quality before another order is evaluated.

## Industrial Portfolio v1 — second checkpoint

The research portfolio now has two mutually exclusive low-cost gates:

1. **COMMON_BAND**: for 3–4 logical types that all share the exact same physical band dimension. Generate every 3-type subset with exactly two fixed deterministic seeds (`1000`, `1005`), one pass, one restart, Beam/Rescue off. Physical construction still delegates to `motor.cjs`, so guillotine edge-to-edge cuts, kerf, rotation/grain, stage ceilings and slice contraction remain the industrial rules.
2. **GUIDE_HUB**: if COMMON_BAND does not apply, allow Guide-Slice only for at most 8 types and a stable highest-demand hub with demand ratio >= 0.50.
3. Otherwise return **NOT_APPLICABLE** with zero motor calls. Legacy remains the safety fallback outside research.

The root axis is always pattern/panel-local. A Master plan may mix X- and Y-rooted boards freely.

### 4056900 physical sentinel

Binding recovered from `4056900__Alfredo_Arrua4056900.xml`: board 2740x1820, kerf 4.4, four physical logical types / 94 pieces. All four types share height 350 mm, so COMMON_BAND applies.

Fresh-process A/B checkpoint (3 repeats, alternating order):
- Legacy 40 rounds median pattern-generation CPU: 13109.347 ms; 66 patterns; 6 boards; best commercial remnant 163240 mm2.
- Industrial Portfolio median pattern-generation CPU: 367.345 ms; 27 patterns; 6 boards; best commercial remnant 164220 mm2.
- CPU reduction: 97.1978%.
- Industrial validation: exact 94/94 demand, geometry valid, sequence complete; all candidate panels validated as edge-to-edge guillotine.
- Determinism: 3/3 identical pool/order hashes and selected vectors/root axes.

### External 4961912 fixture

The supplied project XML normalizes to 31 types / 61 pieces, historical 2 panels, area lower bound 2 and maximum repetition 6. It is intentionally a **negative gate/generalization fixture**: the portfolio returns NOT_APPLICABLE and performs zero pattern-generation calls. Project XML does not declare grain, so it is not used yet as a scored rotation-quality benchmark.
