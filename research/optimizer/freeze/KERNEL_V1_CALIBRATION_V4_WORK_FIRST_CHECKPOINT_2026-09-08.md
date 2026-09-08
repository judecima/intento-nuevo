# Kernel V1 calibration v4 — work-first checkpoint

Date: 2026-09-08
Kernel candidate: `4063963260abb10c8d68d0e553942899c925cc2f`

## Empirical telemetry result

The v4 physical telemetry probe demonstrated live deterministic-work instrumentation without changing the kernel candidate. A fresh current run exercised Beam with non-zero measured expansions and Master with non-zero measured nodes; no Beam fallback warning was observed.

Conclusion: Step 0 work telemetry is operational. Calibration v3 rows remain correctness/timing evidence but are not authoritative work-budget evidence because v3 did not require measured work magnitude.

## Budget-scope correction

The production budget knobs are enforced per invocation/run, not per whole request. Therefore the primary calibration statistic must match that enforcement scope:

- `OPTIMIZER_MAX_BEAM_EXPANSIONS` -> `beam.expansionsMax` per `armarPlacasBeam` invocation.
- `OPTIMIZER_BEAM_WATCHDOG_MS` -> `beam.wallMsMax` per Beam invocation.
- `OPTIMIZER_MAX_MASTER_NODES` -> `master.nodesMax` per `resolverCobertura` run.
- `OPTIMIZER_MASTER_WATCHDOG_MS` -> `master.wallMsMax` per coverage run.
- `OPTIMIZER_MAX_RESCUE_ATTEMPTS` -> `oneboard.attemptsMax` per `rescatarUnaPlaca` invocation.
- `OPTIMIZER_RESCUE_WATCHDOG_MS` -> `oneboard.wallMsMax` per rescue invocation.

Aggregate per-order totals remain operational-load evidence. Candidate A has no aggregate request work budget. Adding one would change search semantics and requires a new candidate plus recertification.

## Time-censoring evidence

The first work-first physical rows plus `analyze-calibration-v4-censoring.mjs` established an explicit separation between completed work and historical wall-clock-censored work:

- Beam: 375 invocations, 0 timeout hits, 0% observed time censoring. Current `beam.expansionsMax` samples are completed-work evidence.
- Master: 3 invocations, 3 timeout hits, 100% observed time censoring. Current `master.nodesMax` values are right-censored throughput observations under the historical `msMaster=8000` ceiling, not completed-search requirements.
- OneBoard: later physical-resto scanning produced direct measured evidence; see below.

Therefore Master production-node budget selection must use an explicit historical-equivalence/reference-machine policy plus formal validation, rather than treating censored `nodesMax` maxima as required work.

## Physical resto feasibility observation

The current physical `resto` execution binding classified the fixed 8,650 accepted identities as:

- feasible: 8,168
- expected-infeasible: 482
- expected-infeasible rate: 5.57%

This is an observed property of the exact `resto` cohort, not an extrapolation from the historical `parte1` benchmark. The historical 60 infeasible cases remain only the classifier-validation set.

## OneBoard evidence source correction

The 213 historical hotspot rows contain zero `oneboard.activaciones > 0`, including their few `cota == 1` rows. Hotspot activation therefore cannot source OneBoard calibration evidence.

Calibration v4 derives OneBoard candidates directly from the exact physical `resto` feasible cohort using the same V10 static prerequisite as the live path:

`areaLB = ceil(sum(piece.width * piece.height * quantity) / usableBoardArea) == 1`

`usableBoardArea` uses the versioned historical execution binding, including the historical project trim semantics.

The first full static scan reported:

- feasible cases: 8,168
- static `areaLB == 1` candidates: 3,266 (39.99% of feasible cases)
- candidates with `referencePanels > 1`: 234
- bounded scan size: 48

The candidate universe is therefore large; OneBoard is not intrinsically rare in small orders. It was absent from the historical hotspot marker because that marker represents expensive/high-cota cases, not because the live rescue path is uncommon.

## OneBoard measured work

In the first 10 static candidates executed after the scan:

- 9/10 activated OneBoard with measured attempts.
- 8/9 measured activations exhausted exactly 384 attempts and remained at 2 boards.
- 1/9 measured activations succeeded early after 51 attempts and returned a 1-board plan.
- Full-enumeration OneBoard cases consumed roughly 18.7–21.0 seconds on the calibration machine.

The 384-attempt value is the finite structural search space in the current candidate:

`6 seeds x 4 c1 x 4 c2 x 2 initial directions x 2 multi modes = 384`

This gives `OPTIMIZER_MAX_RESCUE_ATTEMPTS = 384` a direct exact-equivalence basis for Kernel V1: it permits the complete current OneBoard search space while making the work limit deterministic. It remains provisional until the associated watchdog and formal correctness/determinism gates are versioned and passed.

### OneBoard timeout interpretation

The legacy OneBoard timeout counter needs path-specific interpretation. `oneboard.cjs` increments `timeoutHits` after the loop if elapsed time is at or above `msRescate`, so a row can report a timeout marker even after all 384 attempts were completed. Therefore:

- `attempts == 384` proves structural completion for a single OneBoard run, even if the legacy timeout marker is set afterward;
- `timeoutHits > 0 && attempts < 384` remains potentially time-censored unless separate success evidence proves an intentional early exit;
- a deterministic rescue watchdog must be chosen above the completed-search wall-time envelope so it acts as a safety watchdog rather than reintroducing hardware-dependent search truncation.

`analyze-calibration-v4-censoring.mjs` was updated to report this distinction instead of treating every OneBoard timeout marker as right-censoring.

## Product/latency finding

OneBoard is now a confirmed synchronous latency hotspot for small orders. In eight observed unsuccessful cases it spends approximately 19–21 seconds enumerating the full 384 configurations without reducing the board count. This is separate from the Kernel V1 freeze decision: changing when/how OneBoard runs would alter search behavior and belongs after freeze (or in a new candidate). It is, however, strong evidence for moving expensive rescue work out of the interactive synchronous path in the post-freeze Worker architecture.

## Early calibration ordering

Calibration v4 defaults to `--order work-first` with this sequence:

1. up to 48 physical `resto` feasible cases with static `areaLB == 1`, prioritized by `referencePanels > 1` then larger piece count;
2. then normal hotspot-driven work-first ordering for historically activated expensive paths;
3. known extreme-tail orders remain forced last.

`--oneboardScanLimit N` changes the bounded static OneBoard candidate scan. `--oneboardScanLimit 0` disables it. `--order cheap-first` retains cheap-to-expensive ordering and does not use work-first stratification.

This changes execution priority only. It does not change the exact 8,650-case certification universe, the candidate runtime, or permit budget promotion from an arbitrary substituted cohort. Existing successful `calibration-v4.partial.jsonl` rows remain valid and are skipped by filename on subsequent invocations.

## Current budget evidence status

- Beam: completed-work evidence, 375 invocations with 0 observed timeouts; more tail coverage is still required before fixing the final expansion/watchdog numbers.
- Master: 3/3 observed runs time-censored by the historical 8-second ceiling; node budget must use the documented reference-machine/historical-equivalence policy and then formal validation.
- OneBoard: strong structural evidence; provisional deterministic attempt budget is 384, with watchdog still pending completed-search wall-time analysis.

## Gate state

- Historical infeasible replay: exact 60/60.
- Historical correctness predicate/execution semantics: recovered.
- Physical `resto` feasibility classification: 8,168 feasible / 482 expected-infeasible.
- Step 0 telemetry: empirically demonstrated.
- Beam time-censoring in current sample: none observed.
- Master time-censoring in current sample: 100%, policy issue explicitly recorded.
- OneBoard work evidence: demonstrated; 9/10 activation in first static scan rows, 8 full 384-attempt enumerations.
- Kernel runtime identity: must remain exact to `406396...` and is rechecked by the main freeze CI.
- Production deterministic budgets/watchdogs: still unresolved.
- Kernel V1 frozen: no.
- Worker isolation: blocked until freeze.
