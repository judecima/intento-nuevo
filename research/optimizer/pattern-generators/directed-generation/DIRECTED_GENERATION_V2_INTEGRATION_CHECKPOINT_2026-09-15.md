# Directed Generation V2 — Integration gate closed

## Decision

**Research remains VALID. Production integration is REJECTED for now.**

The research checkpoint at `9340468c412ac3ab66e58e0ee17710002b5d4fb7` proved that geometry-directed generation generalizes against the frozen P13 research baseline: on the untouched test split it retained 79/82 useful closures (96.34%) and reduced synchronous generation CPU by 42.78%, with 77/79 retained closures certified by round 0 alone.

That result is preserved. This gate tested a different question: whether that research policy can be inserted into the current production V10 path without violating the optimizer objective tuple.

## Integration attempts

### 1. Directed P13 after the current V10 rescues

A fail-safe prototype was placed before the historical Master with the feature disabled by default. If Directed did not certify the lower bound, execution fell back to the historical Master.

Result: safe, but mostly redundant. The current V10 `balanced` baseline plus compactation / MultiSlice / OneBoard is substantially stronger than the lightweight `Fast` baseline used during Directed V2 research. Most geometries that round 0 can certify have already been closed before the directed probe is reached.

### 2. Round 0 before MultiSlice / OneBoard

Moving only the cheap round-0 probe earlier preserves the fail-safe property: it may return only after a physical, industrially valid plan reaches the lower bound; otherwise the historical pipeline continues.

A deterministic sync cohort of 24 cases was selected from the 20k corpus with `pieceQty <= 50`, `logical types <= 20`, reference-area gap 1, both Project and Order, and the frozen Directed policy. 22 completed under the external replay budget and 2 were censored. Among the 22 completed cases:

- 15 reached the directed route;
- 0 board regressions;
- 0 equal-board remnant regressions;
- 0 invalid plans;
- no useful round-0 production closure was observed because the current balanced V10 path had already consumed those easy wins.

Five accumulated hard controls also completed with 0 board regressions, 0 remnant regressions and 0 invalid plans.

### 3. Fast-first synchronous cascade

The natural alternative is the architecture already suggested by the SaaS size-tier research: `Fast -> certificate / Directed round0 -> fallback V10/background`.

This is where the production objective blocks promotion. In the 22 completed replay cases, 5 were already certified at the area lower bound by the lightweight Fast path. Returning those plans immediately would preserve the minimum number of boards, but **3/5 had worse commercial-remnant quality than current V10**.

Therefore lower-bound certification proves objective #1 only. It is not sufficient to return early under the frozen priority:

1. minimum boards;
2. for the same board count, better commercial remnant;
3. never add a board only for remnant.

### 4. Cheap certified remnant polish

One bounded refinement was allowed. The best tested variant was:

`passes=2, restartsPerBoard=4, rescue=false, beam=false`

It recovered 4/5 certified cases with remnant quality equal to or better than V10, at a median ~39 ms, but **1/5 still regressed in remnant quality**. That is a real regression, so the variant is rejected rather than weakening the acceptance gate.

## What is frozen now

- `prototipo-inicial` remains unchanged at `a58c8615ba345c5d93bc347946914288f9455cc7`.
- Directed Generation V2 research remains valid at `9340468c412ac3ab66e58e0ee17710002b5d4fb7`.
- No production source change from this integration experiment is promoted.
- The 20k corpus has demonstrated that geometry can predict where generation is useful, but the next production-directed policy must learn/predict the **full objective tuple**, not board count alone.

## Next milestone

The next acceptable milestone is **Remnant-Safe Directed Generation**: use the 20k corpus to label not only whether a context reaches fewer boards, but also whether its same-board plan meets or beats the production remnant-quality tuple. Any Fast-first production cascade remains blocked until that gate has zero equal-board remnant regressions on holdout.
