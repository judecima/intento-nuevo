# V21a certified prepass — early close

The first V21 variant attempted family patterns before Pattern Master and allowed an early return only when the validated candidate reached the active lower bound.

Frozen-hotspot ceiling analysis:
- Master is activated in many hotspot cases, but only **1/213** Master-active cases finishes exactly at the active lower bound after Master: `4050594__Mega_Maderas4050594.xml`.
- Therefore a prepass that may skip Master only at the lower bound can avoid Master in at most one hotspot case.
- Historical Master cost of that case: **31,793 ms**, which is only about **0.26%** of the post-V20 12.36M ms total.

Measured locally:
- the prepass correctly certified `4050594`, but added ~0.9–1.7 s overhead on non-certified expensive cases before falling back to the unchanged Master.

Verdict: **FAIL EARLY / CLOSED**. The variant is mathematically incapable of reaching the V21 acceptance target (>=27.193% post-V20 total reduction), independent of implementation quality.

Replacement candidate V21b:
- no separate prepass;
- seed the actual Pattern Master pool with deterministic `family-base` / `family-height` columns;
- reduce random rounds from 40 to 20;
- keep the existing coverage solver, materialization and validation;
- accept only if the 213 hotspot performance gate and the 8,669-case zero-board-regression gate pass.
