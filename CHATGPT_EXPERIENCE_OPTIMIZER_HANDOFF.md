# Handoff para ChatGPT - Experience Optimizer

## Estado actual

Proyecto: optimizador de corte guillotina 2D para muebles/MDF.

Etapa actual: 1 - Dataset canonico.

Subetapa completada: 1A - canonicalizacion desde `OptimizationInput`.

Estado: implementado y validado por tests/typecheck. Falta Etapa 1B para extraer casos canonicos desde XML historicos `project` y `Order`.

Fuente de verdad obligatoria: `EXPERIENCE_OPTIMIZER_TRUTH.md`.

## Reglas principales

- No cambiar motor, heuristicas, scoring, limites ni APIs existentes fuera de la etapa autorizada.
- No usar XML historicos como decisiones de Lepton.
- Los XML solo aportan la definicion del problema.
- La experiencia futura debe generarse corriendo nuestro optimizador.
- Cero regresiones de placas contra baseline congelada.
- Toda funcionalidad nueva debe poder desactivarse.
- No avanzar de etapa sin autorizacion explicita.

## Baseline congelada

Commit: `3dbcea727fe82b9a7b911caf458fb18f035cac19`.

Version: `legacy-guillotine-v10-lepton-remnants-20260813`.

Benchmark historico versionado:

- `benchmark_project_fast.csv`: total=2000, OK=1457, SKIP=450, ERROR=93, better=46, equal=1374, worse=37, avgMs=30.43, p95=136.
- `benchmark_project_balanceado.csv`: total=2000, OK=1450, SKIP=450, ERROR=100, better=60, equal=1383, worse=7, avgMs=2982.99, p95=11660.
- `benchmark_project_v10.csv`: total=2000, OK=1457, SKIP=450, ERROR=93, better=61, equal=1386, worse=10, avgMs=1130.09, p95=6984.

Corpus XML externo:

- Path informado: `D:\proyectos asistidos\lepton\data\lepton-xml`.
- XML files: 8669.
- Raiz `project`: 7320.
- Raiz `Order`: 1346.
- Parse errors: 3.

## Arquitectura localizada

- Entrada/fachada del optimizador: `src/lib/optimizer/engine/legacy-engine.ts`.
- Exports publicos: `src/lib/optimizer/index.ts`.
- Tipos del input/output: `src/lib/optimizer/types.ts`.
- Schema de validacion: `src/lib/optimizer/schema.ts`.
- Mapper desde proyecto/draft a input: `src/lib/optimizations/project-input.ts`.
- Generacion de patrones: `src/lib/optimizer/legacy/patrones.cjs`.
- Solver Pattern Master: `src/lib/optimizer/legacy/cobertura.cjs`.
- OneBoard: `src/lib/optimizer/legacy/oneboard.cjs`.
- V10/Pattern Master/MultiSlice/metricas: `src/lib/optimizer/legacy/v10.cjs`.
- Rescue interno: `src/lib/optimizer/legacy/motor.cjs`.
- Export XML maquina: `src/lib/optimizer/exporters/machine-xml.ts`.
- Parser XML historico: existe embebido en `Optimizador_V11_RC_Visual_Familias_Sobrantes_Editor_Manual.html`, no como modulo TypeScript.

## Referencias leidas

Se evaluaron `experiencia/`, `experiencia/v2`, `experiencia/v3` y `experiencia/v4`.

Hallazgos principales:

- Exact memory tiene senal fuerte y bajo riesgo si se revalida: en pilotos evita recomputaciones repetidas.
- Structural memory sola es demasiado gruesa para elegir rescates.
- Router V2 de `v4` es offline/advisory y no debe integrarse todavia.
- No hay runner versionado para repetir benchmark XML completo por comando.

## Cambios implementados en Etapa 1A

Archivo agregado: `src/lib/optimizer/canonical-case.ts`.

Contenido:

- `CanonicalOptimizationCase`.
- `CanonicalOptimizationPiece`.
- `canonicalizeOptimizationInput(input)`.
- `serializeCanonicalOptimizationCase(value)`.

Comportamiento:

- Valida con `optimizationInputSchema`.
- Preserva panel, refilado, kerf, material, restricciones, cantidades, veta, rotacion, familia y cantos.
- Ordena piezas deterministicamente para que el orden de entrada no altere el caso canonico.
- No agrupa piezas.
- No aprende.
- No calcula fingerprints.
- No toca `optimizeProject`.

Archivo modificado: `src/lib/optimizer/index.ts`.

- Exporta funciones y tipos canonicos.

Archivo agregado: `tests/optimizer/canonical-case.test.ts`.

- Testea determinismo.
- Testea independencia del orden de piezas.
- Testea diferencias de veta, rotacion, cantidad, panel, kerf y material.
- Testea preservacion de familia/cantos y omision de metadata no relevante.

## Pruebas ejecutadas

- `npx vitest run tests/optimizer/canonical-case.test.ts`
  - Resultado: passed.
  - Detalle: 1 archivo, 9 tests.
- `npx vitest run tests/optimizer tests/optimizations tests/production/xml.test.ts tests/domain/optimizations.test.ts`
  - Resultado: passed.
  - Detalle: 8 archivos, 46 tests.
- `npx tsc --noEmit`
  - Resultado: passed.

## Benchmark/control

No se ejecuto benchmark completo nuevo en Etapa 1A porque no hay hook runtime al optimizador y no existe runner versionado por comando. La baseline historica queda sin cambios.

Regresiones detectadas en Etapa 1A: 0.

## Pendientes recomendados

Siguiente paso recomendado: Etapa 1B - extraccion canonica desde XML `project` y `Order`.

Archivos candidatos para 1B:

- `src/lib/optimizer/canonical-xml.ts` o modulo equivalente.
- `tests/optimizer/canonical-xml.test.ts`.
- Fixtures XML minimos bajo una carpeta de tests existente o nueva.
- `EXPERIENCE_OPTIMIZER_TRUTH.md`.

No avanzar a fingerprints hasta completar y validar Etapa 1.
