# Kernel V1 calibration v4 — work-first checkpoint

Date: 2026-09-08
Kernel candidate: `4063963260abb10c8d68d0e553942899c925cc2f`

## Empirical telemetry result

The v4 physical telemetry probe demonstrated live deterministic-work instrumentation without changing the kernel candidate. A fresh current run exercised Beam with non-zero measured expansions and Master with non-zero measured nodes.

Conclusion: Step 0 work telemetry is operational. Calibration v3 rows remain correctness/timing evidence but are not authoritative work-budget evidence because v3 did not require measured work magnitude.

## Calibration execution profile

`benchmarkInputFromCanonicalCase(canonical, { strategy: "v10" })` defaults V10 benchmark execution to the `balanced` profile, not `deep`.

Therefore the historical wall-clock ceilings active during this calibration are:

- Beam: `presupuestoBeamMs = 1500` ms (motor default retained by balanced)
- Pattern Master: `msMaster = 8000` ms
- OneBoard: `msRescate = 20000` ms

This matters when interpreting timeout telemetry. In particular, Beam `timeoutHits > 0` is consistent with a per-invocation `wallMsMax` above 1500 ms; 2500 ms belongs to the `deep` profile and is not the calibration ceiling used here.

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

The physical rows plus `analyze-calibration-v4-censoring.mjs` establish an explicit separation between completed work and historical wall-clock-censored work.

Initial evidence:

- Beam: 375 invocations, 0 timeout hits; the initial `beam.expansionsMax` observations were completed-work evidence.
- Master: the first 3 runs all hit the historical 8-second ceiling and were right-censored throughput observations, not completed-search requirements.
- OneBoard: direct measured evidence is described below.

Later evidence added a Beam-censored case and the first naturally completed Master run:

- `4052960__Guillermo_Morales4052960.xml`: Beam 149 calls, 89,104 aggregate expansions, `expansionsMax=1,010`, `wallMsMax=1,805`, `timeoutHits=1` under the balanced 1,500 ms Beam ceiling. This row contains time-censored Beam work and its `expansionsMax` must not be treated as an uncensored completed-search requirement.
- The same case ran Master once for 580 nodes in about 19 ms with no 8-second censoring. Once the row is re-run under the corrected calibration gate and becomes `pass=true`, it is the first Master observation in the uncensored population.

Therefore Master production-node budget selection still requires an explicit historical-equivalence/reference-machine policy plus formal validation. Beam budget selection must use the uncensored Beam population separately from cases with timeout hits.

## Controlled Beam fallback semantics

`4052960__Guillermo_Morales4052960.xml` exposed an explicit candidate behavior that the original v4 gate was too strict about.

Observed result before the gate correction:

- final plan valid: yes
- demand multiset exact: yes, 114/114 pieces
- boards: 14
- Beam calls: 149
- Beam aggregate expansions: 89,104
- Beam maximum expansions per invocation: 1,010
- Beam fallback warning: `No se pudo completar el plan con Beam Search; revisar la pieza "52" (2325×599.6 mm).`
- final greedy fallback plan: valid

The candidate intentionally catches Beam failure inside `armarPlacas`, logs the warning, and degrades to the already-built greedy plan. The no-complete-plan exception is itself an explicit controlled branch of `armarPlacasBeam`, not an instrumentation failure.

Calibration v4 now classifies Beam fallbacks semantically:

- `CONTROLLED_NO_COMPLETE_BEAM_PLAN`: accepted only when the final result is valid and Beam work/terminal-control accounting is present;
- `UNEXPECTED_BEAM_EXCEPTION`: remains fatal;
- no arbitrary expansion threshold is used to decide legitimacy.

This preserves visibility into Beam failure without discarding a valid, highly informative calibration case or weakening the gate for unrelated exceptions.

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

The static scan reported:

- feasible cases: 8,168
- static `areaLB == 1` candidates: 3,266 (39.99% of feasible cases)
- candidates with `referencePanels > 1`: 234
- bounded scan size: 48

The bounded 48-case OneBoard stratum completed before the later Beam fallback abort: with 4 earlier calibration rows, the checkpoint reached 52 successful rows before `4052960` became the failing 53rd row. Subsequent execution therefore proceeds into the post-OneBoard Beam/Master-heavy work-first ordering.

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

`analyze-calibration-v4-censoring.mjs` reports this distinction instead of treating every OneBoard timeout marker as right-censoring.

## Product/latency finding

OneBoard is a confirmed synchronous latency hotspot for small orders. In eight observed unsuccessful cases it spends approximately 19–21 seconds enumerating the full 384 configurations without reducing the board count. This is separate from the Kernel V1 freeze decision: changing when/how OneBoard runs would alter search behavior and belongs after freeze (or in a new candidate). It is, however, strong evidence for moving expensive rescue work out of the interactive synchronous path in the post-freeze Worker architecture.

## Early calibration ordering

Calibration v4 defaults to `--order work-first` with this sequence:

1. up to 48 physical `resto` feasible cases with static `areaLB == 1`, prioritized by `referencePanels > 1` then larger piece count;
2. then normal hotspot-driven work-first ordering for historically activated expensive paths;
3. known extreme-tail orders remain forced last.

`--oneboardScanLimit N` changes the bounded static OneBoard candidate scan. `--oneboardScanLimit 0` disables it. `--order cheap-first` retains cheap-to-expensive ordering and does not use work-first stratification.

This changes execution priority only. It does not change the exact 8,650-case certification universe, the candidate runtime, or permit budget promotion from an arbitrary substituted cohort. Existing successful `calibration-v4.partial.jsonl` rows remain valid and are skipped by filename on subsequent invocations. The failed pre-policy `4052960` row is intentionally not in the `done` set and will be re-run; after it passes, `uniqueLatest` makes the new successful row authoritative for summaries.

## Current budget evidence status

- Beam: mixed completed and time-censored evidence now observed. Uncensored `expansionsMax` values must be analyzed separately from timeout-hit cases; more tail coverage is required before fixing the final expansion/watchdog values.
- Master: both populations now exist conceptually: the first 3 runs were censored at 8 seconds, while `4052960` produced a 580-node ~19 ms natural completion that will enter the authoritative uncensored set after re-run.
- OneBoard: strong structural evidence; provisional deterministic attempt budget is 384, with watchdog still pending completed-search wall-time analysis.

## Gate state

- Historical infeasible replay: exact 60/60.
- Historical correctness predicate/execution semantics: recovered.
- Physical `resto` feasibility classification: 8,168 feasible / 482 expected-infeasible.
- Step 0 telemetry: empirically demonstrated.
- OneBoard static 48-case evidence stratum: completed before the Beam fallback abort.
- Controlled Beam no-complete-plan fallback: now explicitly accepted only with valid final output and live accounting.
- Unexpected Beam exceptions: still fatal.
- Calibration execution profile: balanced; Beam historical ceiling 1,500 ms, Master 8,000 ms, OneBoard 20,000 ms.
- Kernel runtime identity: must remain exact to `406396...` and is rechecked by the main freeze CI.
- Production deterministic budgets/watchdogs: still unresolved.
- Kernel V1 frozen: no.
- Worker isolation: blocked until freeze.
