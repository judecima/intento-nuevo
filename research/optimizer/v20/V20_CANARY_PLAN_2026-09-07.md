# V20 controlled canary plan

Date: 2026-09-07
Base: `feature/agregar_configuracion_organizacion`
Runtime flag: `OPTIMIZER_POST_BASELINE_CHEAP_LB_EXPERIMENTAL`

## Purpose

Validate the already-merged V20 post-baseline certification in a controlled production slice without changing optimizer quality rules.

V20 only returns early when the physical baseline board count is certified by area/external/cheap lower bounds. It does not replace the baseline, Pattern Master, solver objective, materializer, or validator.

## Canary configuration

Keep staged pipeline disabled:

```env
OPTIMIZER_V10_STAGED_EXPERIMENTAL=0
OPTIMIZER_POST_BASELINE_CHEAP_LB_EXPERIMENTAL=1
```

Repository defaults remain unchanged; this is an environment/deployment decision.

## Entry checks

Before enabling the canary:
- `node scripts/v20-cheap-lb-smoke.mjs` passes;
- no unresolved optimizer correctness regression;
- current deployment has a reversible environment-variable rollout path;
- baseline production telemetry is available for latency comparison.

## Canary acceptance

Correctness — mandatory:
- `cheapViolation = 0`;
- `cheapErrors = 0`;
- invalid plans = 0;
- optimizer exceptions do not increase;
- no observed board-count regression on replayed or paired requests when a comparison is available.

Effectiveness — expected:
- `cheapCertified > 0`;
- p50/p95 optimizer latency do not regress;
- certified requests show reduced downstream rescue work.

The historical 213-case evidence estimates ~13.24% aggregate stage-time benefit. This is not a required production canary percentage because traffic/case mix differs from the benchmark cohort.

## Rollback

Set:

```env
OPTIMIZER_POST_BASELINE_CHEAP_LB_EXPERIMENTAL=0
```

and restart/redeploy the affected process. No data migration or result-format rollback is required.

Immediate rollback triggers:
- any `cheapViolation > 0`;
- any reproducible board-count regression attributable to V20;
- invalid-plan increase attributable to the canary;
- sustained latency regression.

## Rollout sequence

1. Enable on one canary instance or the smallest reversible traffic slice available.
2. Compare correctness counters and latency against the non-canary path.
3. If clean, expand gradually.
4. Keep the feature flag available until enough production evidence exists to make V20 the default.

## Non-goals

This canary does not validate V21/V22 Pattern Master research. V22 remains a separate evidence track.
