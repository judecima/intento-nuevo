# Subset Generator recovery checkpoint — 4006648

Research-only recovery of the heterogeneous-pattern experiment that was not committed before the previous chat reached its context limit. It does **not** modify `src/lib/optimizer/**` and is not a production promotion.

## What is recovered

The experiment keeps the exact 40 masks produced by Legacy Pattern Master (`seed=7`, subset threshold `0.45`) but changes the expensive constructor policy used inside selected masks:

- 14 restarts per board;
- Rescue ON;
- Beam OFF;
- 2 passes;
- no multi-variants.

Masks are ranked deterministically with farthest-first Jaccard diversity, anchored at round 0. On canonical case `4006648` (21 logical types, 42 physical pieces, board 2600x1830, kerf 4.4, canonical trim 0), this reproduces the previously reported quality threshold:

| Diverse masks | Boards |
| ---: | ---: |
| 20 | 11 |
| 24 | 11 |
| 28 | 10 |
| 32 | 10 |
| 40 | 10 |

The full-order round 0 remains at 12 boards and Legacy-40 remains at 10 boards. The area lower bound is 9, so this checkpoint does not claim optimality.

## Why this matters

Small subset enumeration was rejected: types not present in a final board still alter the greedy construction trajectory. The useful search object is therefore the **mask context**, not merely the set of types consumed by the final pattern.

The 28-mask result is the first bounded subset policy in this line of work that preserves the 10-board result on the difficult heterogeneous case while removing Beam and substantially reducing generation CPU versus Legacy-40.

## Validation

Run:

```bash
node research/optimizer/pattern-generators/subset-generator/4006648.test.mjs

# optional expensive control (~Legacy-40 generation cost)
node research/optimizer/pattern-generators/subset-generator/4006648.legacy-baseline.mjs
```

The test checks the canonical fixture, exact diversity ordering and board-count curve `20→11, 24→11, 28→10, 32→10, 40→10`. Timing is reported but deliberately not asserted because CPU time is host-dependent.

## Scope boundary

The prior MID_DENSITY batch was intentionally incomplete: only 13/239 cases finished before the tool window ended; 226 remain unevaluated. Those 226 must not be represented as tested. Rescue28 is therefore **not promoted for bulk execution**. The next research step is directed escalation: cheap probe -> rank masks by Master-relevant signal -> apply Rescue14 only to a small top-K, with `4006648 <=10 escalated masks` as the first gate.
