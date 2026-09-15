# Directed Generation V2 — PASS checkpoint (2026-09-15)

## Frozen baseline

- branch: `prototipo-inicial`
- commit: `a58c8615ba345c5d93bc347946914288f9455cc7`
- P13 remains frozen: `[0,7,11,12,14,15,16,17,18,19,21,26,35]`

No P14/P15/P18 escalation is reopened.

## Dataset and leakage control

The executable Project+Order <=160 corpus contains 20,074 cases. Canonical panel/configuration + sorted logical demand is hashed with SHA-256. Exact duplicate geometries share one signature and one fold: train buckets 0..5, validation 6..7, test 8..9. The test fold was not used to select or refine the policy.

## Candidate

The 20k corpus was used as a teacher, but runtime does not require an ML model. A shallow tree was distilled to three low-value geometry regions. Cases in those regions skip synchronous P13 and retain the existing background fallback.

For selected cases, generation is staged: generate frozen P13 round 0; solve against LB; if LB is certified, stop; otherwise generate the other 12 frozen P13 rounds and solve their union with round 0. The miss path reconstructs exactly the frozen P13 context set rather than creating a new portfolio.

## Acceptance gate

Required before opening test: >=95% useful P13 closure retention; >=25% synchronous pattern-generation CPU reduction; zero allowed final board regression because fallback remains available; at most one refinement after validation.

## Untouched test result

Router cohort: 368 unique geometries.

- baseline P13 useful closures: 82
- retained useful closures: 79 = **96.34%**
- geometry selected for synchronous directed P13: 267 / 368
- baseline P13 generation CPU: 204,119.495 ms
- candidate synchronous generation CPU: 116,790.227 ms
- reduction: **42.78%**
- round 0 early-certifies 77 / 79 retained closures
- execution errors: 0

Before the test fold was opened, direct validation execution compared the directed cascade with P13 on 280 geometries: **280/280 equal board count, 0 worse**.

## Decision

**PASS. Directed Generation V2 is a valid improvement.**

It is accepted because it reduces synchronous generation materially without changing the frozen portfolio, without XML-specific rules, and without sacrificing final quality: skipped cases go to the existing fallback, while selected misses reconstruct the full P13 pool.

The next permissible step is integration behind the existing SaaS routing/feature flag and an end-to-end replay. Further model/threshold tuning is explicitly out of scope for this checkpoint.
