# Optimizer Productization V1

Estado: **production candidate de integracion**. El kernel de optimizacion permanece congelado.

## Baseline

- Kernel/produccion de partida: `prototipo-inicial` @ `a58c8615ba345c5d93bc347946914288f9455cc7`.
- La investigacion de patrones/remanente vive fuera de esta rama y no se incorpora implicitamente.
- Productization V1 no modifica la matematica, generadores, B&B, Master, MultiSlice ni scoring del optimizador.

## Lo que ya existia antes de este hito

El repositorio ya tenia:

- fachada `optimizeProject` y perfiles `fast/balanced/deep`;
- persistencia versionada de jobs, resultados, placas, piezas, cortes y remanentes;
- validacion industrial del resultado antes de guardarlo;
- proyectos, organizaciones, roles y RLS;
- visor de plano, simulacion de cortes y diagnostico;
- edicion manual visual sin mutar el XML/kernel;
- flujo de pedidos/produccion y exportacion XML de maquina;
- impresion del plano mediante el navegador;
- deteccion y listado de sobrantes comerciales del resultado.

## Cambios de Productization V1

### 1. Routing de ejecucion

La frontera `<=50 piezas fisicas / <=20 tipos logicos` decide **donde ejecutar**, nunca que algoritmo o calidad utilizar.

- dentro de la cohorte: ejecucion inline historica;
- fuera de la cohorte: job `queued` + worker;
- ambos caminos preservan `strategy` y `profile` solicitados y ejecutan el mismo kernel congelado.

El routing esta en `src/lib/optimizations/execution-policy.ts` y tiene tests unitarios.

### 2. Cola y worker

Los pedidos grandes:

1. se guardan con la misma version del proyecto;
2. crean/reutilizan un `optimization_job` activo equivalente;
3. ponen el proyecto en `optimizing`;
4. un worker reclama atomicamente `queued -> running`;
5. ejecuta `runAndStoreOptimization` con service-role y version esperada;
6. persiste exactamente las mismas tablas/validaciones que el camino inline;
7. termina en `completed`/`optimized` o `failed`/`draft`.

El endpoint interno es `POST /api/internal/optimizer-worker` y exige `Authorization: Bearer $OPTIMIZER_WORKER_SECRET`.

Un consumidor desplegable se ejecuta con:

```bash
npm run optimizer:worker
```

Variables:

```text
OPTIMIZER_WORKER_SECRET=
OPTIMIZER_WORKER_URL=https://app.example.com/api/internal/optimizer-worker
OPTIMIZER_WORKER_IDLE_MS=1000
OPTIMIZER_WORKER_ERROR_MS=5000
OPTIMIZER_WORKER_ONCE=0
```

`OPTIMIZER_WORKER_ONCE=1` permite usar el mismo consumidor desde cron.

### 3. UX de jobs asincronos

Mientras el ultimo job esta `queued` o `running`, el layout del proyecto monta `OptimizationJobWatcher`, muestra el estado y refresca los Server Components cada 2,5 s solo cuando la pestaña esta visible. El watcher desaparece al completar/fallar.

### 4. Telemetria

No se crea un segundo sistema de metricas. Se reutiliza:

- `optimization_jobs.created_at`;
- `started_at`;
- `completed_at`;
- `result_json.metrics.engineMs`;
- `result_json.metrics.cacheHit`.

Con eso se calculan p50/p95/p99 de:

- espera en cola;
- ejecucion;
- tiempo end-to-end;
- tiempo puro del kernel.

Los administradores pueden consultar `/optimizer/telemetry` dentro de una organizacion activa.

Interpretacion:

- sube cola, motor estable -> falta capacidad de workers;
- sube motor -> investigar workloads/casos reales antes de tocar el kernel.

### 5. Salida operativa

Se conserva la impresion del plano y se agrega `/projects/:id/labels`, una hoja A4 imprimible con una etiqueta por pieza:

- proyecto/version;
- referencia y descripcion;
- placa;
- medidas originales;
- material y espesor;
- rotacion;
- cantos;
- posicion/nivel;
- identificador de pieza.

La impresion del navegador permite papel o `Guardar como PDF`, evitando otra dependencia de PDF para la misma salida.

## Migracion requerida

Aplicar `supabase/migrations/20260915203000_optimizer_job_profile.sql`.

Agrega `optimization_jobs.profile` y una unicidad parcial para impedir dos jobs activos del mismo proyecto/version/algoritmo/strategy/profile.

Los accesos nuevos a `profile` estan aislados en la capa de cola/worker hasta la siguiente regeneracion normal de `database.types.ts` desde Supabase.

## Despliegue recomendado

1. aplicar migraciones;
2. desplegar la app con `SUPABASE_SERVICE_ROLE_KEY` y `OPTIMIZER_WORKER_SECRET` solo del lado servidor;
3. levantar al menos un proceso `npm run optimizer:worker`;
4. comprobar `/optimizer/telemetry`;
5. probar un caso <=50/<=20 y uno por encima del limite;
6. verificar que ambos producen un resultado industrial valido con el profile solicitado.

## Rollback

El rollback no requiere tocar el kernel.

- detener el consumidor worker;
- volver la app al baseline anterior;
- jobs `queued` quedan visibles y pueden cancelarse operativamente;
- resultados ya completados siguen siendo snapshots versionados.

## Remanentes: limite deliberado

Hoy el sistema **detecta, persiste y muestra** remanentes comerciales de cada optimizacion. Eso no equivale a utilizarlos como materia prima de un pedido futuro.

El contrato actual de `OptimizationInput` contiene **un unico formato de tablero** (`board.width/height`). Consumir stock previo implicaria soportar un conjunto heterogeneo de placas/remanentes, disponibilidad/reserva/consumo y nuevas reglas de objetivo. Eso cambia el problema de optimizacion y, por definicion, reabre el kernel.

Por lo tanto Productization V1 termina aqui. Un futuro **Remnant Inventory V1** puede modelar stock y lifecycle sin tocar V10; la utilizacion automatica de ese stock por el solver solo debe abrirse con un objetivo, corpus y gate propios.

## Definition of Done

Productization V1 se considera cerrado cuando:

- `npm run typecheck` pasa;
- suite de tests pasa;
- build Next pasa;
- routing inline/worker esta testeado;
- jobs grandes no bloquean la request de usuario;
- UI sigue automaticamente jobs activos;
- telemetria es consultable;
- plano y etiquetas son imprimibles;
- no hay cambios del kernel respecto del baseline congelado.
