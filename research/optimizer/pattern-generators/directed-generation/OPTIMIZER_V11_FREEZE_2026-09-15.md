# Optimizer V11 — final research freeze (2026-09-15)

Status: **FROZEN. Optimizer research loop closed.**

This checkpoint deliberately ends the open-ended optimizer-improvement cycle. It executes the two remaining bounded questions agreed after the Remnant-Safe Directed gate and does not create another research branch afterward.

## Frozen production baseline

`prototipo-inicial` remains unchanged at `a58c8615ba345c5d93bc347946914288f9455cc7`.

No production source is modified or promoted by this checkpoint. Therefore the final closure introduces zero plate regressions, zero remnant regressions, zero invalid plans and zero synchronous latency regressions into production.

## Corpus reconciliation

The current physical archive was reconstructed from `resto.zip` plus parts 1..6:

- 20,818 physical XML files;
- 20,783 accepted by the current canonical parser;
- 35 rejected/malformed inputs.

Applying the literal synchronous rule `<=50 physical pieces / <=20 canonical logical types` to those 20,783 parseable files yields:

- 15,565 cases;
- 12,998 Project;
- 2,567 Order.

The earlier Remnant-Safe checkpoint records a different upstream canonical universe of 20,844 cases and 15,758 eligible cases (13,168 Project / 2,590 Order). Those are not the same corpus binding. This freeze does **not** change thresholds or parser semantics to manufacture the historical 15,758 number. The mismatch is recorded and closed.

## Gate 1 — Certified Remnant Dominance

Result: **PASS as a mathematical/research primitive; NOT promoted.**

The certificate replaces a physical pattern only when coverage vector and consumed area are identical, machine-depth metrics are componentwise non-worse, the largest and second-largest commercial remnants are non-worse, fragment count does not increase, and total commercial remnant does not decrease when fragment count ties.

Evidence revalidated in this environment:

- 10/10 deterministic/adversarial tests PASS;
- 20,000 deterministic composition trials;
- 0 composition counterexamples.

Existing evidence already showed real yield (3 certified replacements in a 32-case projection screen). A new 32-case physical screen produced 2 certified replacements and zero coverage-skeleton regressions.

The primitive is safe, but it is not promoted into production. Its current host is the research P13 pool, while the previous Directed V2 integration gate already established that inserting that path into balanced V10 is largely redundant. A multi-hour full P13 replay would only estimate yield for a path that is not being promoted. The conservative closure is to preserve the certificate as research evidence and leave production unchanged.

## Gate 2 — one and only one Remnant-Aware Generation V1

Result: **REJECTED.**

Exactly one deterministic variant was tested. It reuses the existing V10 dead-strip signal (`penalizarFranjaMuerta` plus deterministic structural deltas), with fixed seed 7919, 2 passes, 14 restarts, Rescue ON and Beam OFF. New coverage vectors are never admitted; a generated pattern can only replace an existing identical vector if Certified Remnant Dominance approves it.

Deterministic physical screen: 32 cases, 8 at each of offsets 0, 4000, 8000 and 12000 of the reproducible synchronous cohort.

Results:

- 0 execution errors;
- 0 coverage-skeleton regressions;
- 64 generated candidate patterns;
- 43 had an equivalent existing usage vector;
- 2 certified replacements in 2/32 cases;
- 21 new vectors ignored by design;
- 41 equivalent candidates rejected by the certificate;
- P13 generation CPU: 34,082.004 ms;
- extra remnant-aware generation CPU: 5,952.198 ms;
- overhead: **+17.46% of P13 generation CPU**;
- median extra generation CPU: 195.047 ms.

The candidate is safe because uncertified candidates cannot enter the pool, but the value/cost ratio fails the frozen goal: 2/32 certified opportunities do not justify adding ~17.5% generation CPU to the synchronous path.

There is no second variant, no seed sweep, no threshold adjustment and no V2.

## Final decision

The correct V11 freeze is **not to create a new production algorithm merely to have a V11 label**. The current V10 production baseline remains the production candidate. The remnant work produced useful knowledge and a reusable certificate, but neither remaining bounded change clears the combined safety + production-value bar strongly enough to justify complexity.

The optimizer research loop is now closed. Specifically out of scope after this checkpoint:

- Beam V2/V3;
- more restarts;
- tree V2;
- another remnant-safe classifier;
- ML policy selection;
- threshold retuning;
- XML-specific exceptions;
- additional remnant-score variants.

Future work moves to productization and operational quality: Worker isolation, end-to-end latency, cut visualization, labels/export, remnant inventory/reuse, telemetry and SaaS integration.

The kernel may be reopened only if real production orders demonstrate a concrete recurring gap. It is not reopened to chase another small benchmark percentage.
