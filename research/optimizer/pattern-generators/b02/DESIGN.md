# B0.2: coordinate-order challenger after H4/B0.1

Date: 2026-09-14.

Scope: research only. `src/lib/optimizer/**`, frozen B0 and B0.1 remain unchanged.
Only `4057401` was used for the real-case diagnostics recorded here.

## Motivation

B0.1 fixed root starvation under the frozen H4 budget but its retained root pool on
`4057401` contained only the small `744x450` type. Instrumentation showed that none
of the first three (large) types had even been discovered within 20,000 expansions.
The bottleneck was therefore exploration order, not propagation of already found
large pieces.

## Challenger

B0.2 keeps B0.1's incremental scheduler and bounded productive-delta priority, but
changes coordinate proposal order from ascending to descending. It does not remove
coordinates or add dominance/pair filtering. With unbounded tiny fixtures the set
of canonical trees remains equal to the independent oracle; under a work cap the
visited prefix is intentionally different and is versioned in provenance.

`K` remains an explicit policy parameter. No K value is promoted by this experiment.
The portable evidence records a diagnostic sweep for K=1,2,4,8,12,16 under the
same H4 work limits.

## Current result on 4057401

- B0.1: 32 physical patterns, 2 root usage vectors, no complete demand coverage.
- B0.2 with H4 K=8: 121 patterns, 9 root usage vectors, exact coverage needs 8 boards.
- B0.2 diagnostic K=1: 24 patterns, 12 root usage vectors, exact coverage needs 7 boards.
- Legacy A reference: 4 boards.

The missing target compositions remain `[0,1,0,4]`, `[2,0,0,2]` and `[0,0,1,4]`.
Therefore B0.2 is **not promotion-ready** and must not replace A.

## Reproduction

```powershell
node research/optimizer/pattern-generators/b02/and-or.test.mjs
node research/optimizer/pattern-generators/b02/4057401-probe.mjs <output.json> 1
```

The probe reads the committed H4 portable report, not ignored `test-results/`.
