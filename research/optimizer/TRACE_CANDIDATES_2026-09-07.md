# Trace repair candidates

Decision: 2026-09-07. Production runtime stays unchanged until a candidate passes
the required gates. V20, deterministic budgets and V22 remain out of scope.

## Rejected source

`e133e7e` from `experiencia/traza-diferida.bundle` loses all final traces when
Pattern Master wins `4050594`. See [the failure report](DEFERRED_TRACE_GATE_2026-09-07.md).
Do not integrate that commit unchanged.

## Candidate A: linked trace with Master traces retained

Source: a separate clone of the same bundle under
`node_modules/.cache/deferred-trace-linked`, plus
`trace-candidate-a.patch` in this directory. The patch removes only the two
`trazaDiag: false` overrides in generarPatrones and patronesMonotipo. The linked
representation and normalization adapter remain as in the bundle.

Expected metric movement: fewer trace-array copies, lower CPU/wall, exact
semantic plan identity. The original ~21.6% saving is not assigned to A; it
combined linked representation with trace suppression. Measure A separately.

Gate order, fixed before the run:

1. Mixed/monotype materialization trace contracts must pass.
2. `4050594`: 7 boards, 103 pieces, no untraced placements, 247 steps, valid plan,
   geometryHash and fullPlanHash equal to the recorded reference; area bound 7.
3. The other four Master sentinels: `4056900=6`, `4057401=4`, `4058501=8`,
   `4059200=17`, plus exact A/B geometry, full plan and trace identity.
4. Only after these pass, run the frozen 213-case gate; stop on the first failure.

Sentinels are a separate cross-cohort set. Only `4050594` and `4059200` belong to
the original 213 marker, which historically records 18 boards for `4059200`.
Do not silently replace the later 17-board sentinel with that historical value.
If today's reference itself misses a sentinel, diagnose input/options/clock
differences before claiming candidate regression or passing the gate.

Runs:

```powershell
$env:TRACE_CANDIDATE_ROOT='node_modules/.cache/deferred-trace-linked'
npm test -- tests/optimizer/pattern-trace.test.ts
# 2/2 PASS; candidate root is a test-only override.

node scripts/deferred-trace-gate.mjs --candidate node_modules/.cache/deferred-trace-linked --sentinels --out test-results/deferred-trace-linked-sentinels-r1
```

The runner uses fresh serial processes, identical serialized input, V10 balanced,
staged/cheap-LB OFF and no process-cache hits. Sources include content hashes and
uncommitted runtime changes, since A intentionally differs from its bundle HEAD.
Single-run timings are descriptive. Stable performance requires repeated paired
measurements on the same cases, with a gate that continues to preserve quality.

Initial result: `4050594` PASS. Both variants have fullPlanHash
`e858a3bfd89f69b7165954039f3f809752250712736316239f349d8fafbdcd42`,
7 boards, 103 traced pieces, 247 diagnostic steps, and area/engine lower bounds 7.
Wall: 31,932.80 -> 30,437.93 ms. CPU: 45,437 -> 44,219 ms.
This single pair does not establish the saving on the full corpus.

## Candidate B: selective replay, conditional

Only pursue B if A does not retain useful performance. This is a design contract,
not an implemented or approved-for-release fast path.

- Generate without traces, recording minimal round/monotype provenance, original
  ordered subset types, seed, source board index and physical geometry identity.
- Preserve provenance through resolverCobertura as metadata; do not change B&B
  selection, tie-breaking or budgets.
- A non-winning Master must perform zero replays.
- For a winning plan, group selected origins and replay each distinct source once
  with traces enabled, preserving the original effective options and input order.
- Require the replay's physical geometry/tree identity to match the selected
  pattern before using it. All final placements must have traces.
- On mismatch/missing provenance/replay failure, reject the replay and rerun the
  original full Master with traces; retain a valid incumbent throughout. Never
  emit an untraced winner or accept a mismatching replay.
- Record replay/fallback CPU, origins, matches and failures. A fallback is not a
  proof of exact legacy plan identity while budgets depend on the clock; subject
  its output to the same quality/hash gate, not an automatic safety exemption.

Replay geometry equality alone does not prove identical diagnostic anchors,
provisional slices or contraction steps. Full-trace/full-plan equality remains
mandatory for B, including cases with repeated patterns, grouped origins and
forced replay mismatch. This is why A is evaluated first.
