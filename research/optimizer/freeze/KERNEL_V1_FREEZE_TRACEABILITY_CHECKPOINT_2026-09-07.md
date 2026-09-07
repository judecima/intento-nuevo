# Kernel V1 Freeze — Traceability Complete Checkpoint

Date: 2026-09-07

## Decision

Do **not** declare `Kernel V1 FROZEN` yet.

Historical traceability is now complete enough to start the formal freeze certification without changing the optimizer, parser policy, heuristics, search behavior, budgets, scoring, or Worker behavior.

Kernel candidate remains unchanged:

`4063963260abb10c8d68d0e553942899c925cc2f`

## Traceability status

### 1. Five sentinels — RECOVERED

Exact historical contract is versioned in `scripts/deferred-trace-gate.mjs`:

- `4050594` -> 7 boards
- `4056900` -> 6 boards
- `4057401` -> 4 boards
- `4058501` -> 8 boards
- `4059200` -> 17 boards

### 2. 213 hotspots — RECOVERED

Exact source is `experiencia/v6/hotspot-all.jsonl`, filtered by the historical gate as:

- `ok !== false`
- `!engineCacheHit`

Result: exactly 213 rows and 213 unique XML identities.

Frozen identity-set SHA-256:

`34b867a789d0abf62818eae305a095f3e3f01a439d25df372e522fecd9ada5f1`

### 3. fullPlanHash — RECOVERED

Historical runner semantics are versioned and inspected by CI:

- algorithm: SHA-256
- serialization: `JSON.stringify(stable(value))`
- object keys: recursively sorted
- arrays: order preserved
- full plan: `{ geometry, traces, quality }`
- geometry excludes diagnostic representation fields `trace`, `_diagLink`, `_diagPath`
- quality excludes `engineMs` and `cacheHit`

Reference case `4050594`:

`e858a3bfd89f69b7165954039f3f809752250712736316239f349d8fafbdcd42`

### 4. Correctness corpus — RECOVERED AND RECONCILED

The earlier diagnosis that six historical XML filenames were missing was incomplete. The isolated local audit of `resto.zip` establishes:

- XML files: 8,669
- unique XML names: 8,669

Current canonical parser classification:

- `project`: 7,305
- `Order`: 1,345
- rejected: 19
- accepted/current-comparable: 8,650

Historical inventory was:

- `project`: 7,320
- `Order`: 1,346
- parse errors: 3

The historical source-of-truth independently records that Etapa 1B produced **8,650 canonical cases over 8,669 XML** and that mixed-stock XML is excluded by design because one optimization case supports one board format.

The 19 current rejections are versioned in:

`research/optimizer/freeze/KERNEL_V1_RESTO_ARCHIVE_AUDIT_2026-09-07.json`

Breakdown:

- `mixed-board-formats`: 13
- `unquoted-attribute`: 1
- `text-outside-root`: 2
- `unexpected-closing-tag`: 1
- `invalid-attributes`: 2

No parser relaxation is used for the freeze.

## Reconciliation against the embedded corpus

The embedded `resto` partition contains:

- canonical records: 8,680
- distinct XML identities: 8,663

Reproducible CI reconciliation proves:

- all 13 `mixed-board-formats` identities resolve uniquely inside embedded `resto`: **13/13**
- the other six current parser rejections are exactly absent from embedded `resto`: **6/6**
- `8,663 + 6 = 8,669` reconstructs the complete archive identity count
- removing the 13 mixed-board identities from embedded `resto` yields exactly **8,650 distinct XML identities**
- after that exclusion there are exactly **8,650 canonical records**, i.e. one record per comparable XML identity

Current-comparable correctness identity-set SHA-256:

`36d005421ae79b01867e0bba377c1bf526801bcd4dcfa2b0180e12cf354458f3`

This closes the correctness provenance problem without modifying `ensureSingleBoardFormat` or any production parser behavior.

## Reproducible evidence

Workflow:

`.github/workflows/optimizer-kernel-freeze.yml`

Scripts:

- `scripts/kernel-freeze/build-provenance.mjs`
- `scripts/kernel-freeze/analyze-correctness-partitions.mjs`
- `scripts/kernel-freeze/reconcile-resto-archive.mjs`
- `scripts/kernel-freeze/finalize-traceability.mjs`

Reports:

- `research/optimizer/freeze/KERNEL_V1_FREEZE_PROVENANCE.json`
- `research/optimizer/freeze/KERNEL_V1_CORRECTNESS_PARTITIONS.json`
- `research/optimizer/freeze/KERNEL_V1_RESTO_RECONCILIATION.json`
- `research/optimizer/freeze/KERNEL_V1_FREEZE_TRACEABILITY.json`

`KERNEL_V1_FREEZE_PROVENANCE.json` still contains the older embedded-only `correctness8669=BLOCKED` diagnostic. That field is intentionally treated as legacy forensic evidence: an embedded canonical projection cannot contain XML that the parser rejects. The final correctness traceability decision is the archive/embedded reconciliation report and the aggregate freeze traceability report.

## Stable state reached

```text
Kernel V1 Candidate
    4063963260abb10c8d68d0e553942899c925cc2f
        |
        +-- Freeze traceability
            +-- 5 sentinels ............ RECOVERED
            +-- 213 hotspots ........... RECOVERED
            +-- fullPlanHash ........... RECOVERED
            +-- historical archive ..... 8,669 / 8,669 unique
            +-- current parser rejects . 19 documented
            +-- correctness cohort ..... 8,650 / 8,650 exact

        => KERNEL V1 FREEZE TRACEABILITY COMPLETE
        => READY FOR FORMAL CERTIFICATION
        => NOT YET Kernel V1 FROZEN
```

No Worker work is authorized by this checkpoint and no Kernel V1 algorithm or parser-policy change is justified by it.

## Next gate

Run the formal correctness + determinism certification over the exact 8,650 current-comparable cohort identified by SHA-256

`36d005421ae79b01867e0bba377c1bf526801bcd4dcfa2b0180e12cf354458f3`

against the unchanged Kernel V1 candidate. Only after that run is green should the project promote to `Kernel V1 FROZEN`.
