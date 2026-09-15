# Directed Generation V2 — bounded research plan

Baseline: branch `prototipo-inicial` at `a58c8615ba345c5d93bc347946914288f9455cc7`.
Research branch: `feature/optimizar-patrones`.

## Goal

Use the canonical corpus to choose a small, explainable pattern-generation strategy from cheap geometry features. This is not an attempt to make P13 universal and does not reopen portfolio escalation.

## Leakage control

A canonical geometry signature excludes file/order identity and includes panel/configuration + sorted logical demand. The SHA-256 signature assigns every exact duplicate to the same deterministic fold: train hash buckets 0–5, validation 6–7, test 8–9. The test fold stays untouched until the candidate is frozen.

## Acceptance gate

Directed Generation V2 is valid only if, on untouched holdout and with the frozen fallback retained:

1. final board count is never worse than the frozen baseline;
2. pattern-generation CPU falls by at least 25% at essentially equal useful closure/improvement rate (>=95%), or useful closure/improvement rises by at least 10% at comparable CPU;
3. historical smoke/correctness tests remain green;
4. routing remains explainable: no XML/name rules and no unbounded portfolio growth;
5. production code remains untouched until the research gate passes.

At most one refinement is allowed after validation. If it still fails, Directed Generation V2 is rejected.
