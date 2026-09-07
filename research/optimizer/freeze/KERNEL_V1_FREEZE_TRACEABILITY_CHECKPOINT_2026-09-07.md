# Kernel V1 Freeze — Traceability Checkpoint

Date: 2026-09-07

## Decision

Do **not** declare `Kernel V1 FROZEN` yet.

The freeze investigation has reached a stronger reproducible checkpoint without changing optimizer heuristics, search behavior, budgets, scoring, Worker behavior, or the Kernel V1 candidate.

Kernel candidate remains:

`4063963260abb10c8d68d0e553942899c925cc2f`

Freeze provenance checkpoint before this document:

`411b25735217ea96166fd25cc299f6cab1aef6c3`

## Traceability recovered

### 1. Five sentinels — RECOVERED

Exact historical contract is versioned in `scripts/deferred-trace-gate.mjs`:

- `4050594` -> 7 boards
- `4056900` -> 6 boards
- `4057401` -> 4 boards
- `4058501` -> 8 boards
- `4059200` -> 17 boards

The embedded canonical corpus resolves each sentinel to its XML identity.

### 2. 213 hotspots — RECOVERED

Exact source is `experiencia/v6/hotspot-all.jsonl`, filtered by the historical gate as:

- `ok !== false`
- `!engineCacheHit`

The result is exactly 213 rows and 213 unique XML files.

Frozen identity-set SHA-256:

`34b867a789d0abf62818eae305a095f3e3f01a439d25df372e522fecd9ada5f1`

All 213 identities are present in the embedded canonical corpus.

### 3. fullPlanHash contract — RECOVERED

Historical runner semantics are versioned and now inspected by CI.

Contract:

- algorithm: SHA-256
- serialization: `JSON.stringify(stable(value))`
- object keys: recursively sorted
- arrays: order preserved
- full plan: `{ geometry, traces, quality }`
- geometry: boards, placements, cuts, remnants and physical trees, excluding diagnostic representation fields `trace`, `_diagLink`, `_diagPath`
- traces: final placement traces
- quality: metrics excluding `engineMs` and `cacheHit`

Reference sentinel `4050594` fullPlanHash:

`e858a3bfd89f69b7165954039f3f809752250712736316239f349d8fafbdcd42`

### 4. 8,669 correctness corpus — LINEAGE RECOVERED, SIX XML IDENTITIES STILL MISSING

Historical inventory is independently versioned as:

- source: `D:/proyectos asistidos/lepton/data/lepton-xml`
- XML files: 8,669
- root `project`: 7,320
- root `Order`: 1,346
- parse errors: 3

The 20,844-case embedded corpus preserves seven source partitions. The partition named `resto` is the historical-lineage match:

- canonical records: 8,680
- distinct XML identities: 8,663
- distinct `project` XML: 7,318
- distinct `Order` XML: 1,345
- cross-partition duplicate identities: 0

Historical delta from `resto`:

- missing `project`: 2
- missing `Order`: 1
- historical parse errors: 3
- total unresolved XML identities: 6

Arithmetic:

`7,318 + 1,345 = 8,663`

`(7,320 - 7,318) + (1,346 - 1,345) + 3 = 6`

`8,663 + 6 = 8,669`

Therefore the original correctness corpus is no longer an unidentified 8,669-case population. Its surviving embedded lineage is isolated to `resto` with 8,663 exact XML identities, and the entire remaining gap is six filenames: two `project`, one `Order`, and three historical parse-error XMLs.

Frozen recovered `resto` identity-set SHA-256:

`6052286b28a5b47637e69f16ad5755358d7772123c0d80a2b10d33d6a0b63f50`

The six missing filenames are **not** inferred. Until their exact historical identities are recovered or an equally strong historical manifest proves them, the 8,669 correctness gate remains formally incomplete.

## Reproducible CI

Workflow: `.github/workflows/optimizer-kernel-freeze.yml`

Versioned forensic scripts:

- `scripts/kernel-freeze/build-provenance.mjs`
- `scripts/kernel-freeze/analyze-correctness-partitions.mjs`

Persisted evidence:

- `research/optimizer/freeze/KERNEL_V1_FREEZE_PROVENANCE.json`
- `research/optimizer/freeze/KERNEL_V1_CORRECTNESS_PARTITIONS.json`

CI hard-fails if the recovered 5-sentinel cohort, 213-hotspot cohort, embedded 20,844 corpus count, or historical fullPlanHash contract drifts.

The source-partition analysis is descriptive and cannot promote the kernel merely because counts line up. It explicitly records that the six missing filenames have not been recovered.

## Stable state reached

```text
Kernel V1 Candidate
    4063963260abb10c8d68d0e553942899c925cc2f
        |
        +-- Freeze traceability
            +-- 5 sentinels ............ RECOVERED
            +-- 213 hotspots ........... RECOVERED
            +-- fullPlanHash ........... RECOVERED
            +-- correctness lineage .... 8,663 / 8,669 exact
                +-- 2 project missing
                +-- 1 Order missing
                +-- 3 parse-error XML missing

        => KERNEL V1 FREEZE TRACEABILITY CHECKPOINT
        => NOT Kernel V1 FROZEN
```

No Worker work is authorized by this checkpoint and no Kernel V1 algorithm change is justified by it.

## Next gate

The next promotion condition is narrow and objective: recover the exact six historical XML filenames (or an authoritative historical 8,669-file manifest from which they can be derived), freeze the complete file-set hash, then run the formal correctness/determinism certification against the unchanged Kernel V1 candidate.
