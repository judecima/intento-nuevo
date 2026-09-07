# Worker Isolation Spike — 2026-09-07

## Estado

**CANDIDATE / NO MERGE todavía.**

Este spike implementa el punto 6 del roadmap sobre una rama separada, sin modificar `src/lib/optimizer/**` y sin adelantar el freeze de Kernel V1.

Base remota usada: `ec63965bab1599a191f03eeca01151eb92ac8384` (`optimizer-kernel-v1-integration`).

Rama: `optimizer-worker-isolation-spike`.

Gate CI de referencia: GitHub Actions run `34149966903`, commit `ce9a5fbef429351ef28661ada305fe1bf9c9203a`.

## Arquitectura implementada

```text
Next / runAndStoreOptimization
        |
        v
OptimizationExecutor
   | direct (default)
   | worker (opt-in)
        |
        v
bounded in-process queue
        |
        v
Worker Thread
        |
        v
same optimizeProject(input)
```

No se agregaron heurísticas, estrategias ni cambios de presupuesto al kernel.

## Contratos implementados

### Direct fallback

`OPTIMIZER_EXECUTION_MODE` sólo activa Worker si su valor es `worker`. Cualquier otro valor conserva la ejecución directa actual.

### Cola y concurrencia

- `OPTIMIZER_WORKER_CONCURRENCY`: concurrencia máxima; default `1`; nunca supera `availableParallelism()`.
- `OPTIMIZER_QUEUE_MAX_PENDING`: máximo de jobs esperando; default `32`.
- `OPTIMIZER_WORKER_MAX_OLD_SPACE_MB`: límite opcional de old generation por Worker mediante `resourceLimits.maxOldGenerationSizeMb`.

### Deduplicación

Hay dos niveles in-process:

1. `runAndStoreOptimization` comparte ejecución + persistencia para el mismo `organization/project/version/strategy/inputHash`.
2. El executor comparte una ejecución Worker para el mismo `inputHash` mientras esté queued/running.

Esto **no es deduplicación distribuida** entre múltiples procesos o réplicas de Next. Un backend multi-instancia necesitará una clave/lock durable en la cola o base.

### Resultados obsoletos

- Una versión nueva del mismo proyecto cancela tasks viejas queued.
- Si una task vieja está ejecutándose en un Worker del mismo proceso, se termina ese Worker.
- Antes de persistir se verifica la versión actual del proyecto.
- Después de persistir detalles se verifica nuevamente antes de publicar el job como `completed`.
- La actualización de `projects.status = optimized` queda condicionada por `project.id + project.version`.
- Un job detectado como superseded termina `cancelled`, no `failed`.

La publicación no está envuelta todavía en una transacción SQL única. Existe una ventana residual entre compare-and-set/checks independientes; el cierre absoluto de esa ventana requiere una operación transaccional/RPC durable y debe resolverse antes de declarar aislamiento distribuido production-ready.

### Telemetría del executor

Por ejecución:

- `mode`
- `queueMs`
- `hostMs`
- `engineMs`
- `overheadMs`
- `deduplicated`

`queueMs` mide espera por un slot del executor; `overheadMs` separa costo del host/Worker del tiempo informado por el motor.

## Gate direct vs Worker

Se agregó `scripts/optimizer-worker-smoke.mjs`.

El smoke compila dos entradas Node aisladas, ejecuta el mismo `OptimizationInput` directamente y en `worker_threads`, y compara:

- validación,
- cantidad de placas,
- `geometryHash`,
- `traceHash`,
- `fullPlanHash`.

La identidad usa el mismo contrato del gate de Candidate A: geometría + trazas + métricas de calidad, excluyendo sólo `engineMs` y `cacheHit`.

Resultado en GitHub Actions run `34149966903`:

```json
{
  "status": "PASS",
  "failures": [],
  "boardCount": 1,
  "pieces": 5,
  "validation": {
    "direct": true,
    "worker": true
  },
  "geometryHash": "4cfb2484d5c20502f9b09275cb58531f95607ec01d229dc8947a9975b596374e",
  "traceHash": "ebc4b724088e8b4dcdd0c5a4adcf9c0cea6b7dc767acdc3768ef5eb2414d2ca6",
  "fullPlanHash": "603ad2498a60568712fe490b69a84b421d23fce83565f37a7fce194f3dc2a69f",
  "directWallMs": 36.62035,
  "workerWallMs": 88.75567,
  "workerEngineMs": 35.308833,
  "workerTransportOverheadMs": 53.446837
}
```

Los tiempos son una sola muestra sintética y sólo sirven para comprobar que el overhead se está midiendo. No deben usarse para dimensionar producción.

## Gates de CI actuales

En el mismo commit/run:

- `tsc --noEmit`: PASS.
- `tests/optimizer/pattern-trace.test.ts`: PASS.
- `tests/optimizer/optimizer.test.ts`: PASS.
- 8 tests totales: PASS.
- direct vs Worker full-plan smoke: PASS.
- `next build` con Next 14.2.16: PASS.

## Lo que este spike NO certifica

- No certifica Candidate A sobre 213 casos.
- No certifica V20 remnant recovery/safety.
- No calibra presupuestos deterministas.
- No reemplaza el gate 8.669 correctness.
- No demuestra todavía rendimiento con pedidos reales grandes.
- No demuestra deduplicación entre réplicas/procesos.
- No mide todavía p50/p90/p95 de `queueMs`/`overheadMs` con concurrencia real.
- No prueba un pool persistente de Workers: hoy se crea un Worker por job y su costo queda explícito en `overheadMs`.

## Gate antes de integrar al Kernel V1

No mergear este spike antes del freeze del punto 5.

Después de que los commits locales de Candidate A / V20 / Step0 / determinismo estén en una rama remota certificable:

1. rebase/cherry-pick del spike encima del Kernel V1 candidate;
2. `fullPlanHash` direct vs Worker sobre 5 sentinelas;
3. repetir sobre los 213 hotspot;
4. medir `queueMs`, `engineMs`, `overheadMs`, RSS/heap y throughput con concurrencia 1/2/... acorde al host;
5. comprobar cancelación de versiones obsoletas;
6. decidir si el overhead justifica Worker por job o un pool persistente;
7. recién entonces habilitar `OPTIMIZER_EXECUTION_MODE=worker` en canary.

## Conclusión

La separación `Next -> executor -> worker -> optimizeProject` es técnicamente viable en el proyecto actual y el primer gate de identidad completa pasa. El spike queda deliberadamente fuera del Kernel V1 hasta cerrar los puntos 1–5 del roadmap.
