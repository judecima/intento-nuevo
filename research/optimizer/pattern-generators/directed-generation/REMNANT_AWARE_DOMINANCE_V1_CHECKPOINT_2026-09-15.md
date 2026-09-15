# Remnant-Aware Dominance V1 — research milestone

Status: **PASS as an isolated research milestone. NOT promoted to production.**

## Why this is different from the rejected remnant-safe classifier

The previous gate tried to predict when a cheap plan was safe to return early. A fresh audit found a real remnant regression, so that entire statistical authorization path remains rejected.

This checkpoint does not predict safety and does not authorize early return. It only replaces one physical pattern by another when both consume the **exact same piece vector** and the replacement carries a local composable non-regression certificate.

## Observation

The frozen subset generator deduplicates by usage vector and retains the pattern with larger consumed area. For a real duplicate usage vector, consumed area is normally identical; therefore equal-area physical alternatives are effectively first-wins. Different cut geometries can consequently be discarded even when one leaves a strictly better industrial remnant.

## Certificate

A candidate may replace the current physical representative only when:

1. usage vector is identical;
2. consumed area is equal within `1e-6`;
3. machine-depth metrics are componentwise no worse (`maxXmlLayer`, `maxType2Layer`, `maxType1Layer`, `type2Nodes`);
4. commercial largest remnant is not smaller;
5. commercial second-largest remnant is not smaller;
6. commercial fragment count does not increase;
7. when fragment count ties, total commercial-remnant area does not decrease; and
8. at least one frozen quality/depth criterion strictly improves.

Incomparable alternatives remain first-wins. There is no weighted score and no learned threshold.

## Why the certificate composes

The Master only sees usage vectors and consumed areas. Replacement preserves both and preserves insertion order, so its board-count search skeleton is unchanged.

For a plan made of several boards, the frozen depth metrics compose through maxima (plus additive `type2Nodes`). Componentwise local non-regression therefore cannot worsen the global depth tuple.

Commercial-remnant quality is the lexicographic tuple largest, second-largest, fewer fragments, then total area. Componentwise non-regression of the local top two plus non-increasing fragment count is preserved after union with the same remnants from every other board. If fragment count ties, non-decreasing local total area preserves the final fallback criterion as well.

This is a sufficient, intentionally conservative certificate. It is not claimed to be necessary.

## Evidence

`remnant-aware-dominance.test.mjs` passes **10/10** under Node 22. The suite includes adversarial cases (larger first remnant but worse second, extra commercial fragments, depth regression) and **20,000 deterministic composition trials** in which every certified local dominance is unioned with arbitrary common remnants and checked with the frozen legacy comparator.

A non-gating screening over four slices of the embedded provenance projection (`8` cases at offsets `0`, `5000`, `10000`, `15000`) produced:

- 32 cases;
- 142 duplicate usage vectors, all equal-area;
- 3 certified physical replacements in 3 different cases;
- 0 anomalous-area duplicates;
- 0 coverage-skeleton changes;
- 0 execution errors.

Examples with a certified replacement: `emporio_madera4090675`, `4017854__Adrian_Maru4017854`, `4052685__dario.siciliani_dario.siciliani4052685`.

The projection reports 15,760 cases under `<=50 pieces / <=20 types`, while the current physical-XML canonical cohort is 15,758. Therefore the 32-case projection screen is evidence that the opportunity exists, **not** a substitute for the frozen physical-XML gate.

## Files

- `remnant-aware-dominance.mjs`: certificate + remnant-aware deduplication.
- `remnant-aware-dominance.test.mjs`: deterministic/adversarial/compositional tests.
- `remnant-aware-probe.mjs`: research-only P13 pool comparison that asserts board count, vector-plan and full frozen-plan non-regression invariants.
- `REMNANT_AWARE_DOMINANCE_V1_GATE_2026-09-15.json`: machine-readable checkpoint evidence.

## Decision

The next milestone is no longer “invent a remnant score”. We now have the first bridge between the two previously proposed directions:

- **A: mathematical quality certificate**, locally for equivalent coverage vectors; and
- **B: remnant-aware generation**, by retaining certified better physical representatives.

Production remains untouched. The next gate is a physical-XML replay over the frozen 15,758 synchronous cases, measuring certified replacement yield and latency while requiring zero plate/depth/remnant regressions. If yield is too small, the same certificate should be used to guard explicit remnant-preserving split generation rather than returning to statistical classifiers.
