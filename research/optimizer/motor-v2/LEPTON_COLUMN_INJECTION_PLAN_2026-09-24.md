# Lepton column injection before 3-stage pricing — 2026-09-24

Branch: `research/serial-lepton-column-audit-20260924`

## Purpose

Do not build a 3-stage pricing oracle until the known Lepton solution for case 5445701 has been decomposed into demand vectors and compared with the current pool.

The Lepton solution is a concrete witness set. It lets us separate:
1. vectors already generated;
2. vectors only hidden by exact-equality master formulation;
3. genuinely missing structural columns;
4. physical restriction mismatches.

## Stage convention

Use **physical cut levels** everywhere.

- Lepton `<project>`: `physicalCutLevels = max terminal child layer - 1`.
- Optimizer physical plan: `physicalCutLevels = max(cut.nivel)`.
- Current `two-stage-pricing-oracle.cjs` emits cuts at levels 1 and 2, so it is a two-physical-cut-level family under this convention.
- A Lepton terminal at XML layer 4 means three physical cut levels.

Do not classify by XML node count or by legacy naming alone.

## Column classes

For a Lepton usage vector `u` and pool vector `v`:

- **A / exact:** some pool vector equals `u`.
- **A2 / dominated-only:** no exact vector exists, but some pool vector satisfies `v_i >= u_i` for every type and is strict for at least one type.
  This is evidence of a downward-closure/master-formulation opportunity. It is **not** permission to physically overproduce pieces: any >= formulation must be paired with a safe way to drop surplus leaves / derive the exact subpattern and then validate exact demand.
- **Missing:** neither exact nor dominated.

After exact modeled 2-stage convergence, each Lepton vector is also evaluated at the final dual prices. A Lepton vector with dual value > 1 is a direct negative-reduced-cost witness outside the current union pool + modeled 2-stage family.

## Gates before 3-stage implementation

### Gate 0 — extraction consistency

Reconstruct the complete demand from Lepton vectors and panel multiplicities.

Required:
- reconstructed boards = Lepton physical boards;
- reconstructed demand = canonical demand exactly.

### Gate 1 — injected-RMP sanity

Inject the unique Lepton usage vectors into the converged RMP.

Required:
- LP status OPTIMAL;
- LP objective <= Lepton integer board count.

Because the RMP sees only usage vectors, failure here indicates extraction/RMP inconsistency first. It does not by itself prove a physical restriction mismatch.

### Gate 2 — physical compatibility / class F

Separately validate Lepton layout semantics against the same:
- panel useful frame / refilado;
- kerf;
- rotation/grain rules;
- allowed physical cut depth.

Only after this check can a mismatch be classified as different constraints.

### Gate 3 — 3-level pricing correctness

If every negative-reduced-cost Lepton witness uses <=3 physical cut levels and is physically compatible, an exact three-physical-cut-level pricing oracle must be able to drive the RMP to at most the objective reachable with those witness columns.

For 5445701:
- current matched 2-stage-converged LP: ~591.557;
- Lepton integer: 591.

Useful milestones:
- LP < 591.557: 3-level family adds useful structure;
- LP <= 591: family no longer excludes a 591-board integer solution;
- materialized integer <=591: actual gap closed.

## Tool

Run:

```powershell
npm run optimizer:research:lepton-column-audit -- `
  --case 5445701 `
  --source "validation-full/serial-production-audit/_extracted"
```

Output:
`research/optimizer/motor-v2/LEPTON_COLUMN_INJECTION_5445701.json`

The tool reports exact/dominated/missing counts weighted by physical board multiplicity, physical-cut-level distributions, final 2-stage dual reduced costs, and RMP objective after Lepton-vector injection.
