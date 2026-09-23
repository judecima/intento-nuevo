# Optimizer SaaS Hardening V1 — 2026-09-23

Estado: **CERRADO / CERTIFICADO**

## Base congelada

- Motor Auto: `motor-auto-v1`
- Commit de kernel/Auto: `de6c92240346bc63da7d3a7f63bb2b821dd99e32`
- Rama de hardening: `feature/optimizer-saas-hardening-20260923`
- Commit funcional certificado antes del benchmark: `ea6b8b6aa8fa10242438b54ff80303754fe879e8`
- Rama checkpoint: `optimizer-saas-hardening-v1`

El hardening **no cambia geometría, Pattern Master, B&B, scoring de remanente ni reglas de calidad**.

## Lo incorporado

### 1. Identidad runtime inmutable

Cada ejecución queda identificada por la variante completa:

- motor V1 / V2
- effort fixed / auto / advanced
- pattern generator JS / Rust

Los jobs queued persisten esa identidad en `algorithm_version`.
El worker reconstruye el runtime desde el job, no desde flags que puedan haber cambiado después del enqueue.

Esto evita:

- compartir cache entre V1 y Auto;
- que un deploy cambie la variante de un job ya en cola;
- mezclar resultados fixed/auto/advanced.

### 2. Rollout determinístico de Auto

Variable:

```text
OPTIMIZER_AUTO_ROLLOUT_PERCENT=0..100
```

La asignación es estable por proyecto.

Ejemplo de rollout recomendado:

```text
5 -> 10 -> 25 -> 50 -> 100
```

Una vez creado el job, su variante queda congelada aunque luego cambie el porcentaje.

### 3. Telemetría runtime

El resumen de optimizaciones expone:

- `algorithmVersion`
- `effortMode`
- `stopReason`
- tiempos queue/run/engine/total

Permite distinguir, entre otros:

- `structural-safe-lb`
- `safe-lb`
- `advanced-exhausted`

### 4. Execution Isolation V1

Los jobs queued ejecutan el tramo CPU-heavy del optimizador en un **child process real**.

El proceso padre conserva:

- construcción del input;
- cache key;
- validación industrial;
- normalización;
- persistencia.

El child ejecuta:

- V10;
- Pattern Master;
- B&B/cobertura;
- generador Rust.

La comunicación usa IPC con serialización `advanced`.

El camino inline conserva la ejecución síncrona para no pagar overhead de proceso en trabajos pequeños.

### 5. Timeout real

Variable:

```text
OPTIMIZER_KERNEL_TIMEOUT_MS=120000
```

Default: **120 s**.

Al vencer el presupuesto el child recibe `SIGKILL`.
No es un `Promise.race`: el cálculo CPU realmente termina.

### 6. Crash containment

Si el kernel child termina inesperadamente:

- el proceso web/worker padre continúa;
- el job falla de forma explícita;
- no hay fallback silencioso al kernel in-process.

Contrato certificado por test de crash forzado.

### 7. Cancelación real

Un job `queued` o `running` puede pasar a `cancelled`.

Para jobs en ejecución:

1. el worker observa el estado;
2. dispara un `AbortController`;
3. se mata el child;
4. el job permanece `cancelled`;
5. el proyecto vuelve a `draft`.

El completion usa CAS `running -> completed`, por lo que una cancelación tardía no puede ser pisada por un completion.
Si la cancelación ocurre durante la ventana de persistencia, el resultado persistido se limpia.

La UI del proyecto expone botón **Cancelar** mientras el job está queued/running.

## Gates

### SaaS Hardening

Workflow: `Optimizer SaaS Hardening`

Run certificado:

- `35889633079` — **SUCCESS**

Incluye:

- Rust build;
- TypeScript typecheck;
- runtime identity;
- Auto/V2 contracts;
- sync/isolated physical parity;
- timeout kill;
- explicit abort;
- crash containment;
- telemetry;
- Next production build.

### Isolation overhead

Workflow: `Optimizer Isolation Overhead`

Run:

- `35889633212` — **SUCCESS**

Todos los pares sync/isolated mantuvieron:

- validación industrial;
- board count;
- digest físico.

Medianas CI:

| Caso | Sync | Isolated | Delta |
|---|---:|---:|---:|
| threshold-60 | 727.1 ms | 859.2 ms | +132.2 ms (+18.2%) |
| master-5440200 | 311.6 ms | 375.7 ms | +64.1 ms (+20.6%) |
| structural-5504203 | 3081.6 ms | 2381.8 ms | -699.8 ms (-22.7%) |

Lectura:

- el coste absoluto de crear un proceso está en el orden de ~60–130 ms en los dos casos cortos medidos;
- para ejecución queued asíncrona es aceptable;
- no hay evidencia suficiente para justificar todavía un pool de procesos persistentes;
- el sentinel estructural fue incluso más rápido aislado, por lo que no debe interpretarse el delta como un simple coste fijo.

## Estado de producto

A partir de este checkpoint:

- el kernel Auto está congelado;
- no hay una mejora de performance del kernel obligatoria;
- el runtime SaaS tiene identidad, rollout, timeout, crash isolation y cancelación real;
- cualquier nueva optimización debe justificarse por telemetría real de producción.

## Próximo hito recomendado, condicionado

No abrir automáticamente otra investigación.

Abrir **Warm Worker / Direct Compute Worker V1** sólo si producción muestra alguno de estos síntomas:

1. el overhead de proceso representa una parte material del p50/p95 de jobs queued;
2. la duración de la request interna al worker se vuelve un límite operativo;
3. la tasa de jobs hace relevante reutilizar procesos/Rust warm state;
4. se necesita escalar workers de compute independientemente del servidor Next.

Hasta entonces, mantener el diseño actual por simplicidad y aislamiento.
