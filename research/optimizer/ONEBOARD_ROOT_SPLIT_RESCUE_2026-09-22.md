# OneBoard Root-Split Rescue — post-blind research — 2026-09-22

Status: RESEARCH BREAKTHROUGH / NOT YET PROMOTED

This work starts only after the sealed furniture result was frozen in commit:
`657fd5ad1656bba3b8690986ef76fa884078dc6b`.

No result below was used to alter the blind holdout measurement.

## Starting point

Fresh sealed furniture cohort:
- 15,024 PROJECT cases with physical Lepton count 1..10
- frozen V3 worse than Lepton: 56 = 0.372737%
- all 56 gaps are exactly +1 board
- safe LB == Lepton on 56/56

The dominant sub-tail is:
- Lepton 1 -> V3 2: **36 cases**
- 64.29% of the complete furniture gap tail

Current frozen OneBoard on these 36:
- closes: 0
- exhausts 384 trajectories in all 36
- best partial leaves exactly 1 piece in 32/36
- best partial leaves exactly 2 pieces in 4/36

## Rejected local hypothesis

Naive missing-piece guide-first ordering:
- closes 0/36
- improves partial remainder 0/36

Do not repeat.

## Structural diagnosis

Lepton trees were used only for diagnosis, never as candidate input.

Root-band diagnostics:
- on 29/36 cases, if the existing packer is given the exact piece assignment of each Lepton root band, every band can already be packed with existing primitives/trajectories
- only 7/36 have an additional internal-band failure

Interpretation:
the dominant failure is root-band assignment/composition, not lower bound, not global stage depth, and not missing cutting primitives.

For cases with a single missing family in the current best partial:
- 30/34 have all copies of that family concentrated in one Lepton root band

## Stage ceiling sweep

Same OneBoard trajectories, changing only the stage ceiling for diagnosis:
- stages=2: 0/36 closed
- stages=3: 2/36 closed
- stages=4 frozen: 0/36 closed

Stage 3 closes:
- 5445635
- 5530206

This is useful but not sufficient by itself.

## Root split prototype

A research-only rescue was built with these properties:
- no Lepton cut positions are used
- candidate first-cut thicknesses come only from dimensions present in the order
- both root axes are considered
- existing packer primitives are reused inside both resulting regions
- first-region pattern diversity comes from generic piece-type guides and existing criteria
- a candidate is accepted only when exact demand is covered and `validarPlanIndustrial` returns OK

### One explicit root cut

Result on the 36 fresh `1 -> 2` gaps:
- **30/36 closed = 83.33%**
- invalid accepted plans: **0**
- all accepted solutions use exactly one board

Prototype cost on these 36 hard failures:
- total: 14,316 ms
- successful cases total: 5,949 ms
- successful-case p50: ~94 ms
- successful-case p95: ~688 ms
- successful-case max: 1,271 ms
- failed-case cost dominates the tail

This is an unoptimized research harness, not production latency.

### Additional structural arms

Among the six cases not closed by the one-root-cut rescue:
- same-root continuation closes 5446682
- stage-3 sweep closes 5530206
- two explicit root cuts close:
  - 5518840
  - 5532458

Combined known closures:
- **34/36 = 94.44%**

Still open:
- 5486146
- 5495885

5486146:
- Lepton uses six root bands
- every exact Lepton band is independently packable by our current packer
- remaining issue is multi-band assignment/composition

5495885:
- Lepton uses six root bands
- one of the large internal bands is not reproduced even when given its exact piece subset
- this case has both root-assignment and internal-band difficulty

These two should not force the normal rescue into an expensive universal search.

## Backward generalization

The one-root-cut prototype was evaluated on the historical PROJECT one-board gaps whose corpus geometry is non-directional, avoiding material-name grain inference.

Historical cohort:
- 9 known V3 2 vs physical Lepton 1 cases
- **7/9 closed by the same one-root-cut algorithm**
- no Lepton cut geometry was used to construct candidates

Closed:
- 4034825
- 4034830
- 4035484
- 4037139
- 4087679
- 4092271
- 4096862

This is evidence that root-split rescue is a recurring geometric mechanism rather than a rule specific to the fresh holdout.

## Existing H2 comparison

Frozen H2 on all 56 fresh furniture gaps:
- valid candidates: 56/56
- strict V3 board wins: 3
- closes one-board 1->2 gaps: **0/36**

Therefore:
- H2 remains useful for a small non-OneBoard tail
- H2 is not the correct architecture for the dominant one-board feasibility tail

## Product impact if the already-observed safe wins generalize

Research-only projection, NOT a promoted benchmark:
- original furniture gaps: 56
- observed OneBoard structural closures: 34
- independent H2 strict wins outside the 36: 3
- potential remaining gaps: 19
- potential remaining tail: **19 / 15,024 = 0.12646%**
- potential equal-or-better: **99.87354%**

This projection must not be reported as current V3 performance until the rescue is integrated and a regression run passes.

## Recommended architecture

Do not make this expensive rescue part of the normal OneBoard path.

Preferred design:

1. Keep current cheap OneBoard unchanged.
2. Let the full frozen V3 pipeline run normally.
3. Only if the final plan is still > 1 board and a safe lower bound is exactly 1, enter a final `Critical OneBoard Gap Rescue`.
4. Rescue tiers:
   - Tier A: lower stage ceiling 3 (cheap)
   - Tier B: one natural root split (main rescue)
   - Tier C: two-root/multi-root continuation only in high/deep effort or with a narrow structural gate
5. Accept only:
   - exact demand
   - industrial validator OK
   - strictly fewer boards

This puts almost all additional compute on the ~0.37% quality tail instead of taxing the normal 99.6% furniture workload.

## Next work

1. implement Tier A + Tier B as a research wrapper after final V3
2. validate against all fresh 15,024 furniture cases for zero regression by construction and measure added aggregate wall time
3. validate historical one-board gaps and known non-gap sentinels
4. derive a narrow Tier C gate; do not make the expensive multi-root search universal
5. only after regression evidence decide whether to promote
