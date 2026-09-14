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
