# EXPERIENCE OPTIMIZER - SOURCE OF TRUTH

## ESTADO ACTUAL

Etapa: 4 - Exact Hit CERRADA TEMPORALMENTE + Diagnostico de la cola cara V10
Subetapa: 3A - Experience Store minimo + 4A - Exact Hit experimental/offline
Estado: implementadas, validadas por tests y medidas contra holdout en las dos estrategias.
La rama de Exact Memory queda cerrada temporalmente por decision explicita del 2026-09-04;
el trabajo vuelve al motor y arranca por diagnostico, sin implementar mejoras.
Ultima actualizacion: 2026-09-04

Trabajo mas reciente: "ABLACION RONDAS PATTERN MASTER" (2026-09-04). Ablacion offline de
rondasPatrones 40 -> 20 sobre los 2000 casos del holdout. Resultado: RECHAZADA por el gate.
1 regresion de placas estable y reproducible (6927 -> 6928 placas), con un ahorro medido de
24.4% del tiempo de V10. La regla de 0 regresiones manda: no se adopta y no se ejecuto la
variante de 10 rondas. rondasPatrones sigue en 40 en produccion.

Trabajo previo: "DIAGNOSTICO COLA CARA V10" (2026-09-04). Es puramente medicion, sin ningun
cambio funcional. Resultado principal: el 87.6% del tiempo del holdout esta en los 320 casos
que no alcanzan la cota inferior por area, y dentro de esos generarPatrones de Pattern Master
explica el 71.9% del tiempo, con 1 sola placa ahorrada en 129 activaciones de master.

Medido con estrategia baseline/fast y con estrategia v10/balanced. Ver
"Benchmark Exact Memory Etapa 4A 2026-09-03" y "Benchmark Exact Memory V10 2026-09-03".
Exact Memory sigue apagada y offline: experienceMemoryEnabled = false, sin conexion a produccion.

ETAPA 2B - Structural Fingerprint queda POSTERGADA, no cancelada. Se saltea deliberadamente
por autorizacion explicita: primero se quiere demostrar si Exact Memory produce ahorro real
de CPU y latencia con 0 regresiones, antes de invertir en invariancia estructural.

## OBJETIVO GLOBAL

Agregar de forma progresiva y medible una capa de experiencia/memoria de optimizacion que permita reconocer pedidos iguales o similares, reutilizar conocimiento generado por nuestro optimizador, priorizar estrategias, evitar trabajo historicamente inutil y reducir tiempos promedio/p95 sin regresiones de calidad frente a la baseline congelada.

Los XML historicos no son fuente de decisiones de Lepton. Solo pueden aportar la definicion del problema: piezas, cantidades, dimensiones, material, panel, kerf, veta, restricciones de rotacion y datos necesarios para reproducir el pedido. La experiencia se genera corriendo nuestro optimizador.

## BASELINE CONGELADA

Commit: 3dbcea727fe82b9a7b911caf458fb18f035cac19
Version: legacy-guillotine-v10-lepton-remnants-20260813
Dataset: CSVs historicos versionados: benchmark_project_fast.csv, benchmark_project_balanceado.csv, benchmark_project_v10.csv
Corpus externo disponible: D:\proyectos asistidos\lepton\data\lepton-xml
Corpus externo inspeccionado:
- XML files: 8669
- Raiz project: 7320
- Raiz Order: 1346
- Parse errors: 3
- Por mes LastWriteTime: 2025-03=1675, 2025-04=6346, 2026-04=648
Referencia adicional leida: carpeta experiencia/ en la raiz del repo.
Referencia adicional leida: carpeta experiencia/v2.
Referencia adicional leida: carpeta experiencia/v3.
Referencia adicional leida: carpeta experiencia/v4.
Casos:
- benchmark_project_fast.csv: total=2000, OK=1457, SKIP=450, ERROR=93
- benchmark_project_balanceado.csv: total=2000, OK=1450, SKIP=450, ERROR=100
- benchmark_project_v10.csv: total=2000, OK=1457, SKIP=450, ERROR=93
Resultado:
- Fast vs referencia externa Lepton: mejores=46, iguales=1374, peores=37, +1 placa=37, +2 placas=0, boards=4245, refBoards=4255
- Balanceado vs referencia externa Lepton: mejores=60, iguales=1383, peores=7, +1 placa=7, +2 placas=0, boards=4172, refBoards=4225
- V10 vs referencia externa Lepton: mejores=61, iguales=1386, peores=10, +1 placa=10, +2 placas=0, boards=4195, refBoards=4246
Tiempo:
- Fast: totalMs=44330, avgMs=30.43, p50=11, p90=72, p95=136, p99=260
- Balanceado: totalMs=4325333, avgMs=2982.99, p50=1045, p90=7624, p95=11660, p99=26119
- V10: totalMs=1646539, avgMs=1130.09, p50=116, p90=1586, p95=6984, p99=18804
Metricas relevantes:
- La UI usa por defecto baseline-fast.
- optimizerProfileForStrategy("baseline") => "fast"; optimizerProfileForStrategy("v10") => "balanced".
- optimizeProject mide engineMs y cacheHit.
- motor.cjs expone resumen.cacheHits, resumen.cacheFallos, resumen.rescueIntentado, resumen.rescueGano, resumen.rescueMs, resumen.etapasUsadas, resumen.maxXmlLayer, resumen.maxType2Layer, resumen.maxType1Layer, resumen.type2Nodes.
- v10.cjs acumula metricas por oneboard, master, multislice, compactacion y total, con activaciones, ganancias, placasAhorradas, invalidos, ms y peorMs.
- Los CSVs historicos no incluyen patternGenerationMs, solverMs, patternsGenerated ni nodos de resolverCobertura.

## REGLAS INVIOLABLES

- cero regresiones de cantidad de placas frente a la baseline congelada
- no modificar baseline
- no modificar heuristicas actuales sin autorizacion explicita
- no usar XML historicos como decisiones de Lepton
- no devolver automaticamente soluciones estructurales
- toda funcionalidad nueva debe poder desactivarse
- con experiencia deshabilitada, el resultado debe conservar comportamiento baseline
- una sola regresion debe registrarse explicitamente e impide declarar exitosa la etapa
- benchmarks reproducibles con fecha, commit, comando, dataset, cantidad de casos, configuracion, hardware disponible y resultado

## ETAPAS

### ETAPA 0 - Baseline e instrumentación
Estado: documentada; corpus externo localizado; benchmark HTML smoke validado; benchmark completo externo pendiente
Objetivo: establecer arquitectura actual, baseline, tests y benchmark disponible sin modificar comportamiento
Archivos modificados:
- EXPERIENCE_OPTIMIZER_TRUTH.md
Cambios:
- Creado archivo de verdad.
- Registrada arquitectura actual, benchmark historico y limitaciones de instrumentacion existente.
- Registrado corpus XML externo y referencia experiencia/.
Pruebas:
- npx vitest run tests/optimizer tests/optimizations tests/production/xml.test.ts tests/domain/optimizations.test.ts: 7 archivos, 37 tests passed.
- npx tsc --noEmit: passed.
- npm test: fallo 1 test no relacionado con optimizer experience; ver PROPUESTAS_NO_IMPLEMENTADAS.
- npx playwright install chromium: instalado runtime Chromium para ejecutar benchmark HTML headless.
- Smoke benchmark HTML fast con un XML project chico: OK, 1 caso, 1 pieza, 1 placa, 0 errores, 0.01 s agregado.
- Smoke benchmark HTML fast con un XML Order: SKIP esperado, raiz distinta de <project>.
Benchmark:
- Comando ejecutado: resumen con Import-Csv sobre benchmark_project_fast.csv, benchmark_project_balanceado.csv y benchmark_project_v10.csv.
- Benchmark HTML existente validado por Playwright sobre corpus externo, pero no se lanzo corrida completa sobre 7320 project XML.
Resultado:
- Benchmark historico resumido en BASELINE CONGELADA.
- No se modifico comportamiento del optimizador.
Decisión:
- Congelar commit 3dbcea727fe82b9a7b911caf458fb18f035cac19 como referencia de Etapa 0.
- Considerar los CSVs historicos como benchmark externo contra Lepton, no como regresion de experience memory.
- Usar experiencia/ como referencia documental/evidencia, no como codigo fuente a importar automaticamente.
Pendientes:
- Decidir si se corre benchmark externo completo sobre 7320 project XML o una muestra controlada.
- Definir runner reproducible en script versionado solo con autorizacion explicita, o seguir usando Playwright contra HTML existente.
- En instrumentacion futura, separar tiempo de generarPatrones, resolverCobertura, materializar y nodos/patrones de Pattern Master.

### ETAPA 1 - Dataset canonico
Estado: subetapas 1A y 1B implementadas y validadas; etapa completa
Objetivo: extraer/normalizar solo la definicion del problema desde OptimizationInput y, cuando exista corpus, desde XML historico.
Archivos modificados:
- src/lib/optimizer/canonical-case.ts
- src/lib/optimizer/index.ts
- tests/optimizer/canonical-case.test.ts
- EXPERIENCE_OPTIMIZER_TRUTH.md
- CHATGPT_EXPERIENCE_OPTIMIZER_HANDOFF.md
Cambios:
- Agregada representacion canonica desde OptimizationInput sin modificar optimizeProject ni heuristicas.
- Orden deterministico de piezas para que el orden de entrada no cambie la representacion canonica.
- Preservados panel, refilado, kerf, material, restricciones, cantidades, veta, rotacion, familia y cantos relevantes.
- No se implemento aprendizaje, fingerprints, store, cache ni hook runtime.
Pruebas:
- npx vitest run tests/optimizer/canonical-case.test.ts: 1 archivo, 9 tests passed.
- npx vitest run tests/optimizer tests/optimizations tests/production/xml.test.ts tests/domain/optimizations.test.ts: 8 archivos, 46 tests passed.
- npx tsc --noEmit: passed.
Benchmark:
- No se ejecuto benchmark completo nuevo en 1A porque no hay hook runtime al optimizador y no existe runner versionado por comando; baseline historica queda sin cambios.
Resultado:
- Representacion canonica disponible para tests y futuras etapas, con comportamiento productivo del optimizador sin cambios.
Decision:
- Completar Etapa 1 en una subetapa separada 1B con extraccion XML project/Order y fixtures antes de avanzar a fingerprints.

#### Subetapa 1B - Extraccion canonica XML project/Order
Estado: implementada y validada
Objetivo: extraer solo la definicion del problema desde XML historico project y Order, sin usar decisiones de Lepton.
Archivos modificados:
- src/lib/optimizer/canonical-xml.ts
- src/lib/optimizer/index.ts
- tests/optimizer/canonical-xml.test.ts
- tests/fixtures/optimizer/xml/project-minimal.xml
- tests/fixtures/optimizer/xml/project-directional.xml
- tests/fixtures/optimizer/xml/project-root-direction.xml
- tests/fixtures/optimizer/xml/order-minimal.xml
- tests/fixtures/optimizer/xml/order-grain.xml
- EXPERIENCE_OPTIMIZER_TRUTH.md
Cambios:
- Parser XML propio en modulo separado, con ramas explicitas para raiz <project> y raiz <Order>.
- Transformacion de ejes locales l/w a dimensiones globales por paridad de layer, con la direccion del nodo raiz inferida de las coordenadas x/y reales.
- Normalizacion de la orientacion de pieza y tablero en project a lado mayor x lado menor, porque la orientacion colocada es una decision de Lepton y varia entre paneles del mismo archivo.
- Cantidades multiplicadas por el atributo num del panel; QBoards de Order ignorado por ser decision de Lepton.
- Veta conservada con fuente y confianza: xml en Order, unknown en project; la ausencia de veta no se convierte en "sin veta".
- Rotacion derivada de la veta solo cuando hay senal explicita; si no, rotationAllowed=null y rotationSource="unknown".
- Exclusion por diseno de XML con stock mixto: el motor admite un unico formato de tablero por caso.
- No se modifico el motor, ni heuristicas, ni el flujo de optimizeProject.
Pruebas:
- npx vitest run tests/optimizer/canonical-xml.test.ts: 1 archivo, 30 tests passed.
- npx vitest run tests/optimizer tests/optimizations tests/production/xml.test.ts tests/domain/optimizations.test.ts: 9 archivos, 76 tests passed.
- npx tsc --noEmit: passed.
- npx vitest run: 22 archivos passed, 1 failed (server-only preexistente); 147 passed, 1 failed.
Benchmark:
- No se ejecuto optimizacion. Solo se corrio el parser sobre el corpus completo; ver "Auditoria XML Etapa 1B 2026-09-02".
Resultado:
- 8650 casos canonicos sobre 8669 XML del corpus, 0 casos inconsistentes.
Pendientes:
- Ninguno para 1B.

### ETAPA 2 - Fingerprints
Estado: subetapa 2A implementada y validada; subetapa 2B structural fingerprint POSTERGADA por decision explicita
Objetivo: implementar exactFingerprint y structuralFingerprint luego de analizar dataset canonico.

#### Subetapa 2A - Exact fingerprint
Estado: implementada y validada
Objetivo: identificar de forma exacta, determinista y versionada el problema de optimizacion representado por un CanonicalOptimizationCase.
Archivos modificados:
- src/lib/optimizer/fingerprints.ts
- src/lib/optimizer/index.ts
- tests/optimizer/fingerprints.test.ts
- EXPERIENCE_OPTIMIZER_TRUTH.md
Cambios:
- exactFingerprint(canonicalCase) devuelve un SHA-256 hexadecimal sobre una entrada estable que empieza por la version "experience-exact-v1".
- exactFingerprintPayload expone la entrada exacta del hash para poder auditarla sin recalcular.
- Multiset de piezas ordenado por code points, no con localeCompare, para no depender del locale ni de la build de ICU.
- Veta y rotacion codificadas con tres estados explicitos: "true", "false" y "unknown". unknown nunca equivale a false.
- Se suman cantidades solo entre lineas que coinciden en TODOS los campos que afectan el problema; nunca solo por ancho/alto.
- No se modifico canonical-case.ts ni canonical-xml.ts.
- No se implemento structuralFingerprint, ratioFingerprint, Experience Store ni cache.
- No se conecto nada a optimizeProject ni se toco el motor.
Pruebas:
- npx vitest run tests/optimizer/fingerprints.test.ts: 1 archivo, 36 tests passed.
- npx vitest run tests/optimizer tests/optimizations tests/production/xml.test.ts tests/domain/optimizations.test.ts: 10 archivos, 112 tests passed.
- npx tsc --noEmit: passed.
- npx vitest run: 23 archivos passed, 1 failed (server-only preexistente); 183 passed, 1 failed.
Benchmark:
- No se ejecuto optimizacion ni se midio ahorro temporal. Ver "Auditoria Exact Fingerprint Etapa 2A 2026-09-03".
Resultado:
- 8650 casos canonicos, 7920 fingerprints unicos, 730 recomputaciones evitables (8.44%).
Pendientes:
- Ninguno para 2A.

#### Subetapa 2B - Structural fingerprint
Estado: POSTERGADA, no cancelada
Motivo: autorizacion explicita del 2026-09-03 para saltearla temporalmente y validar primero Exact Memory de punta a punta.
Condiciones registradas para retomarla:
- Definir que invariancia se busca: cantidades, escala, o ambas.
- Definir el tratamiento de la veta unknown, que cubre 7305 de 8650 casos canonicos.
- Medirla contra un holdout reproducible, no dentro del mismo universo de aprendizaje.

### ETAPA 3 - Experience Store
Estado: subetapa 3A implementada y validada
Objetivo: crear almacenamiento desacoplado, inicialmente local/en memoria/archivo si alcanza para benchmark.

#### Subetapa 3A - Store minimo para Exact Memory
Estado: implementada y validada
Objetivo: guardar y recuperar planes producidos por NUESTRO optimizador, versionados, sin infraestructura externa.
Archivos modificados:
- src/lib/optimizer/experience/types.ts
- src/lib/optimizer/experience/store.ts
- src/lib/optimizer/experience/index.ts
- src/lib/optimizer/index.ts
- tests/optimizer/experience.test.ts
- EXPERIENCE_OPTIMIZER_TRUTH.md
Cambios:
- ExactExperienceEntry con exactFingerprint, strategy, profile opcional, storeVersion, fingerprintVersion, optimizerVersion, plan, boards, expectedPieceCount, pieceKeys, createdAt y metrics.originalEngineMs.
- Tres implementaciones de la misma interfaz: memoria (tests), archivo JSON unico (casos chicos) y directorio con una entrada por archivo (benchmark).
- freezeExperienceStore devuelve un store de solo lectura, marcado con readonly, para congelar la memoria antes de evaluar un holdout.
- isEntryCompatible exige storeVersion, fingerprintVersion y optimizerVersion; si cambia cualquiera, la entrada se ignora. No hay migracion automatica.
- Ningun archivo corrupto puede romper una optimizacion: se trata como MISS.
- Sin Redis, sin PostgreSQL, sin dependencias nuevas.
Pruebas:
- Grupos 1, 12 y 13 de tests/optimizer/experience.test.ts.
Resultado:
- Store desacoplado, versionado y desactivable, suficiente para correr TRAIN/HOLDOUT sin infraestructura externa.
Pendientes:
- Ninguno para 3A. No se implemento backend remoto ni politica de expiracion mas alla de maxEntries.

### ETAPA 4 - Exact Hit
Estado: subetapa 4A implementada, validada y medida
Objetivo: recuperar solucion exacta ya validada solo si el pedido coincide y pasa validaciones.

#### Subetapa 4A - Exact Hit experimental/offline con revalidacion
Estado: implementada y validada
Objetivo: reutilizar un plan guardado solo cuando el fingerprint coincide Y el plan vuelve a pasar los validadores existentes contra el pedido actual.
Archivos modificados:
- src/lib/optimizer/experience/revalidate.ts
- src/lib/optimizer/experience/exact-hit.ts
- src/lib/optimizer/experience/benchmark-input.ts
- src/lib/optimizer/experience/index.ts
- src/lib/optimizer/index.ts
- scripts/experience-benchmark.mjs
- tests/optimizer/experience.test.ts
- EXPERIENCE_OPTIMIZER_TRUTH.md
Cambios:
- optimizeProjectWithExperience envuelve a optimizeProject; no lo reemplaza ni lo modifica.
- Con experiencia deshabilitada delega y devuelve exactamente el resultado del motor.
- Un hit nunca se acepta por fingerprint solo. Se revalida version, tablero util, kerf, refilado, etapas, resto minimo, restriccion de veta, cantidad de piezas, cobertura de la demanda y geometria dentro del panel, y despues se corren los validadores existentes del proyecto sobre el plan ya remapeado: validarPlanIndustrial de legacy/v10.cjs y validateIndependentSlices.
- Remapeo de etiquetas: el plan reutilizado llega con reference/description del pedido historico y se le reasignan las del pedido actual en placements, en boards, en el plan legacy raw y en el arbol de corte, para que el XML de maquina no emita codigos viejos.
- Una entrada invalida nunca produce error hacia afuera: cuenta invalidCacheEntries, cuenta fallback y recalcula con el motor.
- Feature flag experienceMemoryEnabled = false y opcion enabled por llamada; el uso real de esta etapa es un runner offline.
Pruebas:
- 55 tests en tests/optimizer/experience.test.ts, incluidos los 12 obligatorios.
Benchmark:
- Ver "Benchmark Exact Memory Etapa 4A 2026-09-03" (estrategia baseline/fast).
- Ver "Benchmark Exact Memory V10 2026-09-03" (estrategia v10/balanced).
Pendientes:
- No se conecto al flujo de produccion. No se implemento structural memory, router, rescue learning ni pattern memory.

### ETAPA 5 - Structural Memory
Estado: no iniciada
Objetivo: usar experiencia estructural solo como priorizacion, warm-start o candidate injection.
Archivos modificados:
- ninguno
Cambios:
- ninguno
Pruebas:
- pendientes
Benchmark:
- pendiente
Resultado:
- pendiente
Decisión:
- no iniciar
Pendientes:
- esperar Etapas 1 a 4

### ETAPA 6 - Strategy Statistics
Estado: no iniciada
Objetivo: registrar por fingerprint/cluster intentos, wins, ties, losses, tiempos, rescueRate y lowerBoundReached por estrategia existente.
Archivos modificados:
- ninguno
Cambios:
- ninguno
Pruebas:
- pendientes
Benchmark:
- pendiente
Resultado:
- pendiente
Decisión:
- no iniciar
Pendientes:
- esperar dataset/fingerprints/store

### ETAPA 7 - Strategy Router
Estado: no iniciada
Objetivo: implementar router simple y explicable basado en estadisticas medidas, con fallback baseline.
Archivos modificados:
- ninguno
Cambios:
- ninguno
Pruebas:
- pendientes
Benchmark:
- pendiente
Resultado:
- pendiente
Decisión:
- no iniciar
Pendientes:
- esperar Etapa 6

### ETAPA 8 - Rescue Learning
Estado: no iniciada
Objetivo: aprender casos donde rescue mejora baseline y priorizar estrategias exitosas en casos similares futuros.
Archivos modificados:
- ninguno
Cambios:
- ninguno
Pruebas:
- pendientes
Benchmark:
- pendiente
Resultado:
- pendiente
Decisión:
- no iniciar
Pendientes:
- esperar Etapas previas

### ETAPA 9 - Benchmark general
Estado: no iniciada
Objetivo: evaluar train/validation/test o particion temporal, calidad, velocidad, aprendizaje y capacidad.
Archivos modificados:
- ninguno
Cambios:
- ninguno
Pruebas:
- pendientes
Benchmark:
- pendiente
Resultado:
- pendiente
Decisión:
- no iniciar
Pendientes:
- esperar implementacion previa

## CAMBIOS REALIZADOS

Fecha: 2026-09-04
Etapa: Ablacion rondas Pattern Master
Archivo: scripts/pattern-rounds-ablation.mjs
Cambio: script nuevo de ablacion offline. Inyecta rondasPatrones envolviendo la exportacion
optimizarV10 de v10.cjs, sin tocar legacy, e instrumenta etapas, pool, nodos del B&B, huella con
etiquetas, huella geometrica separada y metricas de remanente. Checkpoint incremental.
Motivo: medir el parametro sin modificar codigo productivo ni defaults.

Fecha: 2026-09-04
Etapa: Ablacion rondas Pattern Master
Archivo: experiencia/v7/
Cambio: salidas de la ablacion. all20.jsonl con los 2000 casos a 20 rondas, repro40-rN/repro20-rN
con la reproduccion del gate, timing40-rN/timing20-rN con la muestra pareada de tiempo.
Motivo: dejar la evidencia reproducible junto al comando que la genera.

Fecha: 2026-09-04
Etapa: Ablacion rondas Pattern Master
Archivo: EXPERIENCE_OPTIMIZER_TRUTH.md
Cambio: agregada la seccion "ABLACION RONDAS PATTERN MASTER" y actualizados ESTADO ACTUAL,
PRUEBAS EJECUTADAS, REGRESIONES DETECTADAS, DECISIONES TOMADAS, HALLAZGOS,
PROPUESTAS_NO_IMPLEMENTADAS, PENDIENTES y SIGUIENTE PASO AUTORIZADO.
Motivo: mantener este archivo como fuente de verdad.

Fecha: 2026-09-04
Etapa: Diagnostico cola cara V10
Archivo: scripts/v10-hotspot-diagnostic.mjs
Cambio: script nuevo de medicion. Separa el tiempo de V10 por etapa envolviendo las exportaciones
de motor.cjs, patrones.cjs, cobertura.cjs, materializar.cjs y oneboard.cjs antes de que v10.cjs
las capture por destructuring. Checkpoint incremental y reanudacion.
Motivo: responder el diagnostico sin modificar ningun archivo legacy. Resuelve la propuesta
"Instrumentacion fina de Pattern Master" sin tocar legacy ni el extractor.

Fecha: 2026-09-04
Etapa: Diagnostico cola cara V10
Archivo: experiencia/v6/
Cambio: salidas del diagnostico. hotspot-all.jsonl con 214 casos instrumentados, pool-growth.json
con la curva de saturacion del pool de patrones, y las listas de casos diag-*.txt.
Motivo: dejar la evidencia reproducible junto al comando que la genera.

Fecha: 2026-09-04
Etapa: Diagnostico cola cara V10
Archivo: EXPERIENCE_OPTIMIZER_TRUTH.md
Cambio: agregada la seccion "DIAGNOSTICO COLA CARA V10" con dataset, casos, comandos,
instrumentacion, limitaciones, metricas, familias, top de tiempos, hipotesis contrastadas y
3 oportunidades. Actualizados ESTADO ACTUAL, REGRESIONES DETECTADAS, DECISIONES TOMADAS,
PROPUESTAS_NO_IMPLEMENTADAS, PENDIENTES y SIGUIENTE PASO AUTORIZADO.
Motivo: mantener este archivo como fuente de verdad.

Fecha: 2026-09-02
Etapa: 0
Archivo: EXPERIENCE_OPTIMIZER_TRUTH.md
Cambio: creacion del archivo de verdad con baseline, arquitectura, pruebas, benchmark historico y pendientes.
Motivo: cumplir primera tarea sin modificar comportamiento del optimizador.

Fecha: 2026-09-02
Etapa: 0
Archivo: EXPERIENCE_OPTIMIZER_TRUTH.md
Cambio: incorporado corpus XML externo, smoke del benchmark HTML y resumen de la carpeta experiencia/.
Motivo: usar la evidencia existente como referencia sin modificar comportamiento ni iniciar Etapa 1.

Fecha: 2026-09-02
Etapa: 0
Archivo: EXPERIENCE_OPTIMIZER_TRUTH.md
Cambio: incorporada referencia experiencia/v2 con holdout 5k/2k, timing sample60, hits fuera de aprendizaje y proxy de dureza estructural.
Motivo: evaluar que evidencia ayuda al proyecto sin modificar motor ni iniciar Etapa 1.

Fecha: 2026-09-02
Etapa: 0
Archivo: EXPERIENCE_OPTIMIZER_TRUTH.md
Cambio: incorporada referencia experiencia/v3 con demos de Exact Memory, casos structural-only dificiles y pruebas directas de multislice/master.
Motivo: evaluar que evidencia ayuda al proyecto sin modificar motor ni iniciar Etapa 1.

Fecha: 2026-09-02
Etapa: 0
Archivo: EXPERIENCE_OPTIMIZER_TRUTH.md
Cambio: incorporada referencia experiencia/v4 con prototipo offline ExperienceRouterV2, resumen holdout, rutas y memorias ratio/structural.
Motivo: evaluar que evidencia ayuda al proyecto sin modificar motor ni iniciar Etapa 1.

Fecha: 2026-09-02
Etapa: 1A
Archivo: src/lib/optimizer/canonical-case.ts
Cambio: agregado modelo canonico y canonicalizeOptimizationInput/serializeCanonicalOptimizationCase.
Motivo: iniciar Dataset canonico desde el modelo interno estable sin modificar el motor.

Fecha: 2026-09-02
Etapa: 1A
Archivo: src/lib/optimizer/index.ts
Cambio: exportadas las funciones y tipos canonicos desde la fachada publica del optimizador.
Motivo: permitir tests y uso futuro sin acoplarse a rutas internas.

Fecha: 2026-09-02
Etapa: 1A
Archivo: tests/optimizer/canonical-case.test.ts
Cambio: agregadas pruebas de determinismo, orden independiente, veta, rotacion, cantidades, panel, kerf, material y metadatos relevantes.
Motivo: fijar el comportamiento de normalizacion antes de fingerprints.

Fecha: 2026-09-02
Etapa: 1A
Archivo: EXPERIENCE_OPTIMIZER_TRUTH.md
Cambio: actualizado estado de Etapa 1A, pruebas, decisiones y pendientes.
Motivo: mantener este archivo como fuente de verdad.

Fecha: 2026-09-02
Etapa: 1A
Archivo: CHATGPT_EXPERIENCE_OPTIMIZER_HANDOFF.md
Cambio: creado resumen operativo para compartir con ChatGPT.
Motivo: documentar baseline, arquitectura, cambios, pruebas, pendientes y siguiente paso.

Fecha: 2026-09-02
Etapa: 1B
Archivo: src/lib/optimizer/canonical-xml.ts
Cambio: parser canonico XML con ramas project/Order, transformacion de ejes por layer, inferencia de direccion raiz por coordenadas, normalizacion de orientacion, veta conservadora y exclusion de stock mixto.
Motivo: completar el dataset canonico desde el historico sin usar decisiones de Lepton.

Fecha: 2026-09-02
Etapa: 1B
Archivo: src/lib/optimizer/index.ts
Cambio: exportadas parseCanonicalXml, CanonicalXmlParseError y sus tipos desde la fachada publica del optimizador.
Motivo: permitir tests y uso futuro sin acoplarse a rutas internas.

Fecha: 2026-09-02
Etapa: 1B
Archivo: tests/optimizer/canonical-xml.test.ts
Cambio: 30 pruebas de formato, determinismo, orden, diferencias relevantes, orientacion project, veta Order y demanda Order.
Motivo: fijar el comportamiento de la extraccion XML antes de fingerprints.

Fecha: 2026-09-02
Etapa: 1B
Archivo: tests/fixtures/optimizer/xml/*.xml
Cambio: cinco fixtures minimos derivados de casos reales del corpus, dos de ellos verbatim.
Motivo: probar la transformacion de orientacion y la veta con datos reales y no con supuestos.

Fecha: 2026-09-02
Etapa: 1B
Archivo: EXPERIENCE_OPTIMIZER_TRUTH.md
Cambio: registrado el cierre de Etapa 1, la auditoria del corpus y los hallazgos de orientacion y veta.
Motivo: mantener este archivo como fuente de verdad.

Fecha: 2026-09-03
Etapa: 2A
Archivo: src/lib/optimizer/fingerprints.ts
Cambio: agregado exactFingerprint/exactFingerprintPayload y EXACT_FINGERPRINT_VERSION sobre CanonicalOptimizationCase.
Motivo: identificar el problema de optimizacion de forma exacta, determinista y versionada antes de cualquier memoria.

Fecha: 2026-09-03
Etapa: 2A
Archivo: src/lib/optimizer/index.ts
Cambio: exportados exactFingerprint, exactFingerprintPayload, EXACT_FINGERPRINT_VERSION y sus tipos.
Motivo: permitir tests y uso futuro sin acoplarse a rutas internas.

Fecha: 2026-09-03
Etapa: 2A
Archivo: tests/optimizer/fingerprints.test.ts
Cambio: 36 pruebas de estabilidad, version, orden, diferencias relevantes, tres estados de veta/rotacion, identidad del problema y casos XML reales.
Motivo: fijar el contrato del exact fingerprint antes de construir memoria sobre el.

Fecha: 2026-09-03
Etapa: 2A
Archivo: EXPERIENCE_OPTIMIZER_TRUTH.md
Cambio: registrada la subetapa 2A, la auditoria sobre el corpus, decisiones, hallazgos y propuestas.
Motivo: mantener este archivo como fuente de verdad.

Fecha: 2026-09-03
Etapa: 3A
Archivo: src/lib/optimizer/experience/types.ts, store.ts
Cambio: ExactExperienceEntry versionada, interfaz ExactExperienceStore y tres implementaciones (memoria, archivo JSON unico, directorio con una entrada por archivo), mas freezeExperienceStore readonly.
Motivo: guardar y recuperar planes propios sin infraestructura externa y poder congelar la memoria antes de evaluar un holdout.

Fecha: 2026-09-03
Etapa: 4A
Archivo: src/lib/optimizer/experience/revalidate.ts
Cambio: revalidateExactHit y buildPieceKeys. Revalida versiones, tablero util, kerf, refilado, etapas, resto minimo, restriccion de veta, cantidad de piezas, cobertura y geometria; remapea etiquetas en placements, boards, plan legacy raw y arbol de corte; corre validarPlanIndustrial y validateIndependentSlices sobre el plan remapeado.
Motivo: nunca aceptar un hit por fingerprint solo y nunca devolver etiquetas del pedido historico.

Fecha: 2026-09-03
Etapa: 4A
Archivo: src/lib/optimizer/experience/exact-hit.ts
Cambio: optimizeProjectWithExperience, envoltorio de optimizeProject con outcome disabled/hit/miss/fallback, desglose de tiempos y contadores.
Motivo: medir Exact Memory sin tocar el motor y con fallback silencioso ante entradas invalidas.

Fecha: 2026-09-03
Etapa: 4A
Archivo: src/lib/optimizer/experience/exact-hit.ts, store.ts, types.ts
Cambio: un store congelado se marca readonly y la capa dejo de reportar recorded=true cuando no guardo nada.
Motivo: el holdout informaba aprendizaje inexistente; corregido antes de medir.

Fecha: 2026-09-03
Etapa: 4A
Archivo: src/lib/optimizer/experience/benchmark-input.ts
Cambio: adaptador de CanonicalOptimizationCase a OptimizationInput solo para el benchmark offline, replicando los defaults de produccion.
Motivo: poder correr el corpus historico por el motor sin tocar el mapper de produccion.

Fecha: 2026-09-03
Etapa: 4A
Archivo: scripts/experience-benchmark.mjs
Cambio: runner versionado con modos train/baseline/experience/report, split reproducible, store congelado, procesos separados por modo y corridas repetidas.
Motivo: benchmark reproducible por comando, exigido por las reglas del proyecto.

Fecha: 2026-09-03
Etapa: 4A
Archivo: src/lib/optimizer/index.ts, src/lib/optimizer/experience/index.ts
Cambio: exportadas las funciones y tipos de la capa de experiencia.
Motivo: permitir tests y runner sin acoplarse a rutas internas.

Fecha: 2026-09-03
Etapa: 4A
Archivo: tests/optimizer/experience.test.ts
Cambio: 55 tests, incluidos los 12 obligatorios, mas store por directorio y adaptador de benchmark.
Motivo: fijar el contrato de Exact Memory antes de medir y antes de cualquier conexion al flujo real.

Fecha: 2026-09-03
Etapa: 4A
Archivo: EXPERIENCE_OPTIMIZER_TRUTH.md
Cambio: registradas Etapas 3A y 4A, la postergacion de 2B, el benchmark holdout, decisiones, hallazgos y propuestas.
Motivo: mantener este archivo como fuente de verdad.

Fecha: 2026-09-03
Etapa: 4A - benchmark V10
Archivo: scripts/experience-benchmark.mjs
Cambio: bandas de casos caros a 500/1000/3000/5000/10000 ms, top 10 de hits por ahorro absoluto, top 20 de cola cara sin hit sobre el universo baseline completo, y metricas de calidad separadas (qualityRegressions, boardsRegressions, pieceCountDifferences, placementDifferences, geometryDifferences, invalidPlans).
Motivo: medir el valor de Exact Memory donde evita ejecuciones costosas.

Fecha: 2026-09-03
Etapa: 4A - benchmark V10
Archivo: scripts/experience-benchmark.mjs
Cambio: opcion --files para restringir una corrida a una lista de casos, y modo de reporte con baseline completo y experience muestreado, que separa valores medidos de valores derivados.
Motivo: evitar recomputar 1971 misses que recorren el mismo camino del motor que el baseline, sin perder el universo completo del holdout.

Fecha: 2026-09-03
Etapa: 4A - benchmark V10
Archivo: scripts/experience-benchmark.mjs
Cambio: checkpoint incremental en .jsonl con reanudacion automatica, opcion --maxNew para avanzar en tandas y log cada 50 casos.
Motivo: una corrida de horas perdio 1250 casos al ser interrumpida; ahora un corte cuesta como mucho un caso.

Fecha: 2026-09-03
Etapa: 4A - benchmark V10
Archivo: scripts/experience-benchmark.mjs
Cambio: placementDigest separa huella con etiquetas y huella solo geometrica.
Motivo: distinguir un plan realmente distinto de una permutacion de etiquetas entre piezas identicas.

Fecha: 2026-09-03
Etapa: 4A - benchmark V10
Archivo: EXPERIENCE_OPTIMIZER_TRUTH.md
Cambio: registrado el benchmark V10 completo, sus desviaciones justificadas, la comparacion Fast/V10, hallazgos, decisiones y conclusion.
Motivo: mantener este archivo como fuente de verdad.

## PRUEBAS EJECUTADAS

- Ablacion rondasPatrones=20 sobre los 2000 casos del holdout.
  - Resultado: 0 errores, 0 planes invalidos, 1 regresion de placas.
  - Detalle: ver "ABLACION RONDAS PATTERN MASTER".
- Reproduccion del gate: 3 casos x 5 repeticiones x 2 variantes, un proceso por corrida.
  - Resultado: la regresion es ESTABLE, 10 de 10 corridas separan.
- Muestra pareada de tiempo: 38 casos x 2 variantes x 2 repeticiones, 1 proceso, intercaladas.
  - Resultado: generarPatrones -47.3% corregido por deriva; ahorro global proyectado 24.4%.
- npx vitest run tests/optimizer (despues del diagnostico de la cola cara V10)
  - Resultado: passed.
  - Detalle: 6 archivos, 140 tests. No se modifico codigo productivo en el diagnostico.
- npx tsc --noEmit (despues del diagnostico de la cola cara V10)
  - Resultado: passed.
- Diagnostico cola cara V10, 214 casos instrumentados sobre el holdout de 2000.
  - Resultado: 214 registros, 0 errores, placas identicas al baseline en 213 de 214.
  - Detalle: ver "DIAGNOSTICO COLA CARA V10". El caso divergente esta explicado y no es
    atribuible a la instrumentacion.
- npx vitest run tests/optimizer (despues del benchmark V10)
  - Resultado: passed.
  - Detalle: 6 archivos, 140 tests. No se modifico codigo productivo en el benchmark V10.
- npx tsc --noEmit (despues del benchmark V10)
  - Resultado: passed.
- Benchmark Exact Memory V10, corrido sobre el corpus completo.
  - Resultado: 0 regresiones de placas, 0 entradas invalidas, 0 fallbacks, 0 errores.
  - Detalle: ver "Benchmark Exact Memory V10 2026-09-03".
- npx vitest run tests/optimizer/experience.test.ts
  - Resultado: passed.
  - Detalle: 1 archivo, 55 tests. Cubre los 12 obligatorios de Etapa 4A: store save/get, miss, hit, fingerprint version mismatch, optimizer version mismatch, plan invalido, fallback, feature disabled con flujo baseline intacto, mismas placas baseline/cache, remapeo de etiquetas, no reutilizar etiquetas del pedido historico y entrada corrupta que no rompe el optimizador. Suma store por directorio y adaptador de benchmark.
- npx vitest run tests/optimizer tests/optimizations tests/production/xml.test.ts tests/domain/optimizations.test.ts
  - Resultado: passed.
  - Detalle: 11 archivos, 167 tests.
- npx tsc --noEmit
  - Resultado: passed.
- Benchmark Exact Memory Etapa 4A, 5 corridas sobre el corpus completo.
  - Resultado: 0 regresiones de placas, 0 entradas invalidas, 0 fallbacks.
  - Detalle: ver "Benchmark Exact Memory Etapa 4A 2026-09-03".
- npx vitest run tests/optimizer/fingerprints.test.ts
  - Resultado: passed.
  - Detalle: 1 test file, 36 tests.
- npx vitest run tests/optimizer tests/optimizations tests/production/xml.test.ts tests/domain/optimizations.test.ts
  - Resultado: passed.
  - Detalle: 10 test files, 112 tests.
- npx tsc --noEmit
  - Resultado: passed.
- npx vitest run
  - Resultado: failed solo por el test preexistente de frontera server-only.
  - Detalle: 23 test files passed, 1 failed; 183 passed, 1 failed.
- npx vitest run tests/optimizer/canonical-xml.test.ts
  - Resultado: passed.
  - Detalle: 1 test file, 30 tests.
- npx vitest run tests/optimizer tests/optimizations tests/production/xml.test.ts tests/domain/optimizations.test.ts
  - Resultado: passed.
  - Detalle: 9 test files, 76 tests.
- npx tsc --noEmit
  - Resultado: passed.
- npx vitest run
  - Resultado: failed solo por el test preexistente de frontera server-only.
  - Detalle: 22 test files passed, 1 failed; 147 passed, 1 failed.
  - Falla: tests/security/server-only.test.ts detecta offenders lib/branding/public.ts y lib/dashboard/cut-metrics.ts. Preexistente, fuera del optimizador, no se corrige en esta etapa.
- npx vitest run tests/optimizer/canonical-case.test.ts
  - Resultado: passed.
  - Detalle: 1 test file, 9 tests.
- npx vitest run tests/optimizer tests/optimizations tests/production/xml.test.ts tests/domain/optimizations.test.ts
  - Resultado: passed.
  - Detalle: 8 test files, 46 tests.
- npx tsc --noEmit
  - Resultado: passed.
- npx vitest run tests/optimizer tests/optimizations tests/production/xml.test.ts tests/domain/optimizations.test.ts
  - Resultado: passed.
  - Detalle: 7 test files, 37 tests.
- npx tsc --noEmit
  - Resultado: passed.
- npm test
  - Resultado: failed.
  - Detalle: 20 test files passed, 1 failed; 108 passed, 1 failed.
  - Falla: tests/security/server-only.test.ts detecta offenders lib/branding/public.ts y lib/dashboard/cut-metrics.ts.
- npx playwright install chromium
  - Resultado: passed.
  - Detalle: instalado Chromium headless de Playwright para poder ejecutar el HTML benchmark.
- Benchmark HTML smoke via Playwright sobre D:\proyectos asistidos\lepton\data\lepton-xml\4053523__nieves_mena4053523.xml
  - Resultado: passed.
  - Detalle: fast, project XML, OK=1, piezas=1, ref=1, ours=1, delta=0, errores=0, tiempo agregado=0.01 s.
- Benchmark HTML smoke via Playwright sobre D:\proyectos asistidos\lepton\data\lepton-xml\4015469__gabriela_meroni4015469.xml
  - Resultado: SKIP esperado.
  - Detalle: raiz Order, el benchmark HTML actual acepta project/panel/no./part.

## BENCHMARKS

### Benchmark 2026-09-02

Commit: 3dbcea727fe82b9a7b911caf458fb18f035cac19
Dataset: benchmark_project_fast.csv, benchmark_project_balanceado.csv, benchmark_project_v10.csv
Casos:
- Fast: 2000 filas; OK=1457, SKIP=450, ERROR=93
- Balanceado: 2000 filas; OK=1450, SKIP=450, ERROR=100
- V10: 2000 filas; OK=1457, SKIP=450, ERROR=93
Command:
- PowerShell Import-Csv summary sobre los tres CSVs versionados.
Hardware:
- Node os: win32 x64, 8 logical CPUs, 11th Gen Intel(R) Core(TM) i5-1135G7 @ 2.40GHz, 15.79 GB RAM.
- Get-CimInstance para CPU/RAM fallo por Acceso denegado.

Baseline:
- Sin codigo de experience memory implementado.
- CSVs historicos conservados como benchmark externo contra Lepton.

Experience:
- No implementada.

Difference:
- No aplica; no se cambio comportamiento.

Regressions:
- 0 regresiones de experience memory porque no hay cambio funcional.
- Las filas worse de los CSVs son contra referencia externa Lepton, no contra baseline congelada.

Resultados:
- Fast: better=46, equal=1374, worse=37, totalMs=44330, avgMs=30.43, p50=11, p90=72, p95=136, p99=260.
- Balanceado: better=60, equal=1383, worse=7, totalMs=4325333, avgMs=2982.99, p50=1045, p90=7624, p95=11660, p99=26119.
- V10: better=61, equal=1386, worse=10, totalMs=1646539, avgMs=1130.09, p50=116, p90=1586, p95=6984, p99=18804.

### Smoke benchmark HTML externo 2026-09-02

Commit: 3dbcea727fe82b9a7b911caf458fb18f035cac19
Dataset: D:\proyectos asistidos\lepton\data\lepton-xml
Casos:
- Corpus inspeccionado: XML=8669, project=7320, Order=1346, parse errors=3.
- Smoke project: 4053523__nieves_mena4053523.xml.
- Smoke Order: 4015469__gabriela_meroni4015469.xml.
Command:
- Playwright headless sobre Optimizador_V11_RC_Visual_Familias_Sobrantes_Editor_Manual.html, modo fast.
Resultado:
- project smoke: OK=1, piezas=1, ref=1, ours=1, delta=0, errores=0, tiempo agregado=0.01 s.
- Order smoke: SKIP esperado por raiz distinta de <project>.
Regressions:
- 0 regresiones de experience memory; no hay cambios funcionales.

### Referencia experiencia/ 2026-09-02

Origen: archivos en carpeta experiencia/ provistos como referencia de trabajo.
Archivos leidos:
- experiencia/EXPERIENCE_OPTIMIZER_TRUTH_CHATGPT.md
- experiencia/experience_memory_summary.json
- experiencia/canonical_cases.json
- experiencia/structural_memory_candidates.json
- experiencia/top_exact_rep_results20.json
- experiencia/hard_v10_results_v3.json
- experiencia/grain_material_review.csv
Dataset independiente:
- XML files=20818, canonical_cases=20844, project=17319, order=3525.
- directional=false: 13635; directional=true: 7209.
Memoria:
- exact_duplicate_groups=1569.
- cases_inside_exact_duplicate_groups=3803.
- exact_recomputations_avoidable_after_first=2234 (10.72%).
- structural_generalization_groups reportados en summary=220; archivo structural_memory_candidates.json contiene 200 grupos, 685 casos y 424 variantes exactas.
- grupos estructurales consistentes vs referencia: 122; inconsistentes: 78.
Baseline sample30 independiente:
- completed=28, timeouts=2, errors=0, avgMs=789.0, medianMs=736.5, p95Ms=1514, vs reference equal=27, worse=1.
Exact memory pilot:
- groups_tested=20, occurrences_covered=146, recomputations_avoided=126.
- measured_compute_ms_without_cache=93964; first_only=13705; avoided=80259; reduction=85.41%.
- En los 20 representantes leidos: boardsVsReference delta=0 en 20/20.
Rescue/hard V10:
- Caso 4066881__mariano_cenzano4066881: compactacion-franjas gano 1 placa, placas 2 -> 1, compactacion.ms=1522, total.ms=2513, rescueIntentado=true, rescueGano=true.
Veta/material:
- 200 materiales revisados en grain_material_review.csv.
- AUTO_HIGH=113 materiales / 8416 casos; REVIEW_WEB_MANUAL=87 materiales / 4093 casos.
- 37 materiales con confidence < 0.70.
- Regla tomada como referencia: no usar inferencias de veta con confianza baja como verdad automatica.

### Referencia experiencia/v2 2026-09-02

Origen: archivos en carpeta experiencia/v2 provistos como referencia de trabajo.
Archivos leidos:
- experiencia/v2/EXPERIENCE_OPTIMIZER_TRUTH_CHATGPT.md
- experiencia/v2/REPORT(20260903-004839).md
- experiencia/v2/summary(20260903-004845).json
- experiencia/v2/timing_summary60.json
- experiencia/v2/test_hits.csv
- experiencia/v2/structural_candidates.json
- experiencia/v2/structural_hardness_proxy.json
Particion:
- Train=5000 casos, case_id numerico 4000012-4034872.
- Holdout=2000 casos, case_id numerico 4034880-4049135.
- Orden por sufijo numerico de case_id: proxy reproducible, no fecha garantizada.
Hits fuera de aprendizaje:
- exact_hits=96/2000 (4.8%).
- structural_any=108/2000 (5.4%).
- structural_only=12/2000 (0.6%).
- ratio_any=103/2000 (5.15%).
- structural_candidates.json: 86 familias estructurales con hit, 121 train_cases, 108 test_cases, 11 variantes exactas nuevas en test.
Perfil holdout:
- median_piece_count=18, p95_piece_count=117.
- directional_count=695.
- high_conf_grain=1283 segun summary v2.
Timing sample60:
- muestra=60, exact_hits=25, completed=54, timeouts=6, errors=0.
- calidad vs referencia en completados: equal=54.
- baseline avgMs=522.0, medianMs=476.0, p95Ms=1154.
- exact-hit completados: n=24, avgMs=451.2, medianMs=421.0, p95Ms=1099.
- miss completados: n=30, avgMs=578.6, medianMs=476.0, p95Ms=1235.
Simulacion exact cache:
- lookup+validation asumido=5ms.
- baseline_cpu_proxy_ms=37336.
- memory_cpu_proxy_ms=25093.
- saving_pct=32.8 en muestra enriquecida en exact hits; no extrapolar al corpus completo.
- exact_hit_timeouts_avoided_if_cached=1.
Structural hardness proxy:
- n=108 structural hits.
- accuracy=97.22%.
- precision para pred_hard=true=100%.
- predicted_hard=12, actual_hard=15.
- Proxy de dificultad: reference_panels > ceil(area_piezas / area_tablero).
V10 difficult families:
- Prueba V10 completa sobre 8 familias predichas dificiles, train+holdout: 16/16 timeouts con timeout 3s.
- Interpretacion: no alcanza para saber que rescate gana; requiere entrenamiento offline con presupuesto mayor y estrategias separadas.

### Referencia experiencia/v3 2026-09-02

Origen: archivos en carpeta experiencia/v3 provistos como referencia de trabajo.
Archivos leidos:
- experiencia/v3/EXPERIENCE_OPTIMIZER_TRUTH_CHATGPT_UPDATED.md
- experiencia/v3/RESCUE_MEMORY_REPORT.md
- experiencia/v3/rescue_memory_experiment_summary.json
Experimento: Rescue / Experience Memory validation.
Exact cache demos:
- 4029715__Luis_Mendez4029715 -> 4034911__Luis_Mendez4034911: boards=5, source_optimization_ms=3416, reuse_validation_ms=1, valid=true, speedup_compute_vs_validation=3416x.
- 4046466__karla_villarreal ortega4046466 -> karla_villarreal ortega4096661: boards=6, source_optimization_ms=3262, reuse_validation_ms=1, valid=true, speedup_compute_vs_validation=3262x.
- quality_regressions_in_cache_demos=0.
- Nota: 1 ms mide validacion local de plan serializado ya localizado; no incluye lookup, red, storage ni deserializacion productiva.
Structural-only hard cases:
- 4041142__Rolando Rene_Rodriguez Cisneros4041142: baseline wall_ms=3013, placas=5, cota=4, reference_panels=5.
- 4046466__karla_villarreal ortega4046466: baseline wall_ms=3286, placas=6, cota=5, reference_panels=6.
Direct strategy tests:
- familia 2 / multislice: 5 placas, valido=true, wall_ms=5716; no mejora placas vs baseline y cuesta mas tiempo.
- familia 2 / master: timeout >=6000 ms.
- familia 3 / multislice: timeout >=6000 ms.
- familia 3 / master: timeout >=6000 ms.
Conclusion v3:
- Exact Memory con plan ganador completo + revalidacion queda experimentalmente respaldada.
- Structural fingerprint solo no alcanza para routear Rescue.
- Para generalizar entre cantidades distintas deben entrar ratioFingerprint, pieceCount, lowerBound, area relativa, repeticion y cantidad de tipos.
- En casos caros repetidos conviene guardar el plan ganador completo, no solo el nombre del Rescue.

### Referencia experiencia/v4 2026-09-02

Origen: experiencia/v4/EXPERIENCE_ROUTER_V2_CHATGPT.zip.
Contenido inspeccionado sin extraer al proyecto:
- experience_router_v2/README.md
- experience_router_v2/BENCHMARK.md
- experience_router_v2/EXPERIENCE_OPTIMIZER_TRUTH_ROUTER_V2.md
- experience_router_v2/experience_router_v2.py
- experience_router_v2/test_router_v2.py
- experience_router_v2/run_output.json
- experience_router_v2/test_output.txt
- experience_router_v2/results/router_summary.json
- experience_router_v2/results/router_predictions.csv
- experience_router_v2/results/decision_tree.txt
- experience_router_v2/results/decision_tree_model.json
- experience_router_v2/results/ratio_memory.json
- experience_router_v2/results/structural_memory.json
Experimento: ExperienceRouterV2 offline, no integrado a V10.
Dataset:
- Train=5000 casos.
- Holdout=2000 casos.
- Label: hard = reference_panels > area_lower_bound. Es proxy geometrico, no etiqueta de rescue requerido.
Salidas del router:
- EXACT_CACHE.
- FAST_BASELINE.
- EARLY_RESCUE_CANDIDATE.
- No decide MultiSlice, Pattern Master, Compactacion ni OneBoard.
Features usadas:
- piece_count, piece_types, total_area_ratio, lower_bound, max_repetition.
- distinct_widths, distinct_heights, avg_aspect_ratio, thin_piece_ratio, long_piece_ratio.
- directional, grain_confidence, stock_aspect_ratio.
- Memorias exact_fp, ratio_fp y structural_fp.
Modelo/calibracion:
- DecisionTreeClassifier max_depth=6, min_samples_leaf=25, class_weight=balanced, random_state=42.
- Threshold hard calibrado por split temporal interno 80/20 de train: 0.82.
Resultados holdout:
- exact_hits=96/2000 (4.8%).
- ratio_hits=103/2000 (5.15%).
- structural_hits=108/2000 (5.4%).
- route_counts: FAST_BASELINE=1720, EXACT_CACHE=96, EARLY_RESCUE_CANDIDATE=184.
- tree_accuracy=84.1%.
- tree_confusion_matrix=[[1444,219],[99,238]].
- early_rescue_candidate_precision_nonexact=71.20%.
- early_rescue_candidate_recall_nonexact=40.31%.
- early_rescue_candidate_tp=131, fp=53, fn=194.
- quality_regressions=0 porque es offline/advisory.
Predicciones:
- FAST_BASELINE: 1720; actualHard=194, actualEasy=1526, ratioHit=7, structuralHit=11.
- EXACT_CACHE: 96; actualHard=12, actualEasy=84, exactHit=96.
- EARLY_RESCUE_CANDIDATE: 184; actualHard=131, actualEasy=53, exactHit=0, structuralHit=1.
- Motivos: tree baseline-friendly=1718, tree geometric hardness=184, exact fingerprint=96, ratio memory easy=2.
Memorias:
- ratio_memory groups=4505, groupsNge2=339, groupsNge3=69, hardRateGe08=818, hardRateLe02=3687, maxN=13.
- structural_memory groups=352, groupsNge2=352, groupsNge3=69, hardRateGe08=64, hardRateLe02=286, maxN=13.
Prueba incluida en zip:
- test_output.txt: OK deterministic features, exact memory, 96 holdout hits, conservative routes.
- No se ejecuto localmente porque test_router_v2.py referencia paths absolutos /mnt/data/xml_experience/... no presentes en este workspace.
Interpretacion v4:
- Sirve para reducir el universo de candidatos offline de rescue: 184 de 2000 casos.
- No debe integrarse como router productivo todavia.
- No debe extrapolarse a costo real sin medir lookup, serializacion, validacion y fallback en nuestro runtime.

### Control Etapa 1A 2026-09-02

Commit: 3dbcea727fe82b9a7b911caf458fb18f035cac19
Dataset: input sintetico de tests sobre OptimizationInput; sin corrida XML.
Casos:
- tests/optimizer/canonical-case.test.ts: 9 casos.
Command:
- npx vitest run tests/optimizer/canonical-case.test.ts
- npx vitest run tests/optimizer tests/optimizations tests/production/xml.test.ts tests/domain/optimizations.test.ts
- npx tsc --noEmit
Configuracion:
- Sin experience memory.
- Sin hooks nuevos en optimizeProject.
- Sin cambios en heuristicas, limites, scoring, solver ni generacion de patrones.
Resultado:
- canonical-case: 1 archivo, 9 tests passed.
- suite relacionada optimizer/optimizations/xml/domain: 8 archivos, 46 tests passed.
- typecheck: passed.
Baseline:
- Baseline historica sin cambios.
Experience:
- No implementada; solo normalizacion canonica offline desde OptimizationInput.
Difference:
- No aplica a calidad/tiempo del motor porque no se cambio flujo runtime.
Regressions:
- 0 regresiones detectadas en tests relacionados.
- 0 regresiones de placas atribuibles a Etapa 1A; no se ejecuto optimizacion desde la nueva capa.

### Auditoria XML Etapa 1B 2026-09-02

Commit base: 3dbcea727fe82b9a7b911caf458fb18f035cac19
Dataset: D:\proyectos asistidos\lepton\data\lepton-xml
Command:
- Bundle de src/lib/optimizer/canonical-xml.ts con esbuild y corrida del parser sobre el corpus completo. Script fuera del repo, en scratchpad de sesion; no se versiono runner nuevo.
- No se ejecuto ninguna optimizacion.
Cobertura:
- XML totales: 8669
- Raiz project: 7323
- Raiz Order: 1346
- Otras raices: 0
- Ilegibles: 0
- Parse OK: 8650
- Parse ERROR: 6
- Excluidos por stock mixto: 13
- Canonical cases: 8650 (project 7305, Order 1345)
Errores:
- text-outside-root: 2
- invalid-attributes: 2
- unquoted-attribute: 1
- unexpected-closing-tag: 1
- Los 6 son XML fisicamente corruptos, no limitaciones del modelo canonico.
Exclusiones:
- mixed-board-formats: 13. Son projects con paneles de medidas distintas, por ejemplo 2600x1640 junto a 2600x1830. El motor solo admite un formato de tablero por caso, asi que se excluyen por diseno. El benchmark HTML existente aplica el mismo criterio.
Warnings:
- Archivos con warnings: 1579; warnings totales: 4458.
- "Order XML has no saw/kerf; using default 4.5": 4199. Ningun Order del corpus declara kerf.
- "project panel N root direction is undetermined; assuming x": 259. Paneles sin dos hermanos en origenes distintos y sin panel de referencia en el mismo archivo. No afecta el caso canonico porque la orientacion se normaliza.
Dataset resultante:
- Materiales distintos: 1556
- Espesores distintos: 40; rango 0 a 180, con 18 dominante.
- Kerf distintos: 4 -> 4, 4.4, 4.5, 5. Origen: xml en 7305 casos, default en 1345 (todos Order).
- Formatos de tablero distintos: 75; mas frecuentes 2500x1830, 2600x1830, 2815x1825, 2750x1830, 2590x1820.
- Direccion del nodo raiz: y en 22187 paneles, x en 472.
Veta:
- Material: true 351, false 994, unknown 7305. El unknown es exactamente el universo project, que no declara veta.
- Piezas por cantidad: true 12661, false 57553, unknown 277982.
- Rotacion por cantidad: permitida 58476, bloqueada 11738, unknown 277982.
Piezas:
- Cantidad total: 348196
- Media por caso: 40.25
- p50: 19
- p95: 130
- Maximo: 3600
- Tipos de pieza por caso: media 12.76, p50 7, p95 43, maximo 280.
Integridad:
- Casos sin piezas: 0
- Casos sin material: 0
- Casos sin tablero: 0
- Casos inconsistentes: 0
- Ninguna pieza queda fuera del tablero resuelto.
Comparacion con el analisis independiente previo:
- experiencia/ reporta 20818 XML y 20844 canonical cases, con project 17319 y Order 3525.
- El corpus disponible aca es mas chico: 8669 XML, project 7323 y Order 1346.
- La proporcion project/Order es similar: 84.5% / 15.5% aca contra 83.1% / 16.9% alla.
- No se forzaron los numeros del analisis previo; la diferencia es de corpus, no de criterio.
- experiencia/ genera mas canonical cases que XML (20844 sobre 20818), asi que alli un XML podia producir mas de un caso. Aca la relacion es 1 XML -> a lo sumo 1 caso.

### Auditoria Exact Fingerprint Etapa 2A 2026-09-03

Commit base: 3dbcea727fe82b9a7b911caf458fb18f035cac19
Dataset: D:\proyectos asistidos\lepton\data\lepton-xml
Version del fingerprint: experience-exact-v1
Command:
- Bundle de canonical-xml.ts, canonical-case.ts y fingerprints.ts con esbuild, y corrida de parser + exactFingerprint sobre el corpus completo. Script fuera del repo, en scratchpad de sesion.
- No se ejecuto el optimizador. No se midio ahorro temporal.
Cobertura:
- Casos canonicos totales: 8650 (project 7305, Order 1345)
- Parse ERROR: 6; excluidos por stock mixto: 13. Iguales a la auditoria de Etapa 1B.
Resultados:
- Fingerprints unicos: 7920
- Grupos duplicados (tamano >= 2): 529
- Casos dentro de grupos duplicados: 1259
- Recomputaciones evitables despues de la primera: 730
- Exact hit potencial dentro del corpus: 8.44%
- Grupo mas grande: 21 casos
Distribucion de tamanos de grupo:
- 1 caso: 7391 grupos
- 2 casos: 419 grupos
- 3 casos: 72 grupos
- 4 casos: 24 grupos
- 5 casos: 6 grupos
- 6 casos: 3 grupos
- 7 casos: 1 grupo
- 9 casos: 1 grupo
- 12 casos: 2 grupos
- 21 casos: 1 grupo
Los 10 grupos mas grandes:
- 21 casos, 8 tipos / 18 piezas, 2750x1830, MELAMINA FAPLAC NATURE CARVALHO MEZZO 18mm; ej. Adrian_Blencio4087463.xml, Adrian_Blencio4087464.xml
- 12 casos, 5 tipos / 16 piezas, 2750x910, TRUPAN MDF MELAMINA MESOP PARAISO 18MM; ej. 4020975__papanoel2905-ml..., 4020979__papanoel2905-ml...
- 12 casos, 10 tipos / 18 piezas, 2600x1830, FIBROFACIL ENCHAPADO PARAISO 18MM; ej. 4034717__mirabilecontacto..., 4034759__mirabilecontacto...
- 9 casos, 13 tipos / 96 piezas, 2750x1830, TRUPAN MDF MELAMINA NEGRO 18mm; ej. 4021006__Martin_Quiroga4021006.xml, 4021022__Martin_Quiroga4021022.xml
- 7 casos, 10 tipos / 56 piezas, 2750x1830, MELAMINA FAPLAC BLANCO TUNDRA 18mm; ej. 4018536__Natalia_Requejo4018536.xml, 4018537__Natalia_Requejo4018537.xml
- 6 casos, 32 tipos / 61 piezas, 2750x1830, TRUPAN MDF MELAMINA GRIS CENIZA 18mm; ej. 4020251__ruben_gualtieri_59..., 4020252__ruben_gualtieri_59...
- 6 casos, 1 tipo / 8 piezas, 2600x1830, EMDF3W954 BLANCO ABSOLUTO 3X183X260; ej. 4022529__Gabriela_Rojas4022529.xml, 4026286__Gabriela_Rojas4026286.xml
- 6 casos, 11 tipos / 19 piezas, 2600x1830, FIBROFACIL ENCHAPADO PARAISO 18MM; ej. 4035010__mirabilecontacto..., 4035079__mirabilecontacto...
- 5 casos, 40 tipos / 104 piezas, 2600x1830, BLANCO MDF 18mm 2600x1830; ej. 4017495__Lucas Miguel_Sasso4017495.xml, 4017520__Lucas Miguel_Sasso4017520.xml
- 5 casos, 11 tipos / 54 piezas, 2750x1830, TRUPAN MDF MELAMINA GRIS HUMO 18mm; ej. 4026747__ruben_gualtieri_59..., 4026751__ruben_gualtieri_59...
Variante estricta de control (hash de la serializacion canonica completa, es decir incluyendo etiquetas):
- Fingerprints unicos: 7934
- Grupos duplicados: 522
- Casos dentro de grupos duplicados: 1238
- Recomputaciones evitables: 716
- Exact hit potencial: 8.28%
- Grupo mas grande: 16 casos
- Diferencia contra el fingerprint elegido: 14 recomputaciones evitables adicionales, provenientes de 14 grupos que unen casos con etiquetas distintas pero el mismo problema.
Controles:
- Grupos que mezclan project y Order: 0. La exclusion del campo source no genera colisiones artificiales entre formatos, porque project queda con veta unknown y Order con veta true/false.
- Grupos que unen casos con etiquetas distintas: 14.
Comparacion conceptual con la referencia independiente de experiencia/:
- experiencia/ reporta sobre 20844 casos: 1569 grupos duplicados, 3803 casos dentro de grupos y 2234 recomputaciones evitables (10.72%).
- Aca, sobre 8650 casos: 529 grupos, 1259 casos dentro de grupos y 730 recomputaciones evitables (8.44%).
- Casos dentro de grupos duplicados: 18.2% alla contra 14.6% aca. Grupos duplicados sobre casos: 7.5% alla contra 6.1% aca.
- Mismo orden de magnitud. La diferencia es esperable porque la probabilidad de repeticion crece con el tamano del corpus y el corpus disponible aca es menos de la mitad.
- No se forzaron los porcentajes de la referencia.

### Benchmark Exact Memory Etapa 4A 2026-09-03

Commit base: 3dbcea727fe82b9a7b911caf458fb18f035cac19
Dataset: D:\proyectos asistidos\lepton\data\lepton-xml
Version de fingerprint: experience-exact-v1
Version de store: experience-store-v1
Version de motor: legacy-guillotine-v10-lepton-remnants-20260813
Estrategia: baseline (perfil fast), que es el default de la UI.
Hardware: Intel Core i5-1135G7, 4 nucleos / 8 hilos, 15.8 GB RAM, Windows 10 Pro, Node v22.21.1.
Command:
- node scripts/experience-benchmark.mjs train      --train 5000 --holdout 2000 --rebuild
- node scripts/experience-benchmark.mjs baseline   --train 5000 --holdout 2000 --label r1
- node scripts/experience-benchmark.mjs experience --train 5000 --holdout 2000 --label r1
- node scripts/experience-benchmark.mjs experience --train 5000 --holdout 2000 --label r2
- node scripts/experience-benchmark.mjs baseline   --train 5000 --holdout 2000 --label r2
- node scripts/experience-benchmark.mjs report     --train 5000 --holdout 2000
Salidas: experiencia/v5/ (train, baseline r1/r2, experience r1/r2, summary).

Split:
- XML totales: 8669.
- Orden: numero de pedido embebido en el nombre del archivo. Declarado explicitamente como PROXY de orden temporal; no hay fecha real confiable.
- TRAIN: primeros 5000 casos canonicos. HOLDOUT: los 2000 siguientes.
- El split se aplica sobre casos canonicos: en los 7014 archivos consumidos hubo 5 parse errors y 9 exclusiones por stock mixto, que no consumen cupo.
- El HOLDOUT corre contra un store congelado (readonly) y no puede poblar la memoria antes de ser evaluado.
- Store del TRAIN: 4544 entradas.

Configuracion de medicion:
- baseline y experience corren en procesos separados, porque optimizeProject tiene un cache interno de 50 entradas por proceso.
- Cada modo se corrio dos veces alternando el orden (baseline r1, experience r1, experience r2, baseline r2) y el reporte toma por caso el menor totalMs de su modo.
- Dispersion entre corridas del mismo modo: baseline 18.18%, experience 9.80%. Es del mismo orden que el ahorro buscado; sin repeticion no se podia concluir nada.
- Cache interno del motor: 82 hits en baseline y 82 en experience. Identico en ambos caminos, asi que no desbalancea la comparacion.

Resultado HOLDOUT, memoria congelada (medicion estricta fuera de aprendizaje):
- Casos: 2000. Errores: 0 en ambos caminos.
- exactHits: 29. exactHitRate: 1.45%.
- misses: 1971. invalidCacheEntries: 0. fallbacks: 0.
- Latencia baseline: avg 121.93 ms, p50 22.06, p90 226.49, p95 388.01, p99 1055.70, max 38793.82, total 243850 ms.
- Latencia experience: avg 122.42 ms, p50 21.86, p90 227.84, p95 391.65, p99 1066.87, max 39098.15, total 244841 ms.
- Solo sobre los 29 hits: baseline avg 113.65 ms (total 3295.88 ms) contra experience avg 6.60 ms (total 191.41 ms).
- Costo de la capa: fingerprint avg 0.404 ms, lookup avg 0.190 ms, deserializacion en hit avg 3.311 ms, validacion en hit avg 0.432 ms.
- Overhead real por miss: 0.561 ms de media (fingerprint + lookup); delta pareado mediano baseline->experience en miss: 0.424 ms.
- CPU: motor evitado 3295.88 ms, costo de la experiencia sobre esos hits 191.41 ms, ahorro neto 3104.48 ms, es decir 94.19% sobre los casos con hit.
- CPU global medida: -0.41%. Es decir, con 1.45% de hit rate el ahorro NO se distingue del ruido entre procesos, que es de 9.8% a 18.2%.

Resultado TRAIN, memoria que aprende sobre la marcha (simulacion de cache continua, NO es medicion fuera de aprendizaje):
- Casos: 5000. Errores: 0.
- exactHits: 452. Tasa: 9.04%. invalidCacheEntries: 0. fallbacks: 0.
- Casos no guardados por referencias ambiguas: 4. Son exactamente los que buildPieceKeys rechaza para no poder remapear mal.
- Motor evitado 47888 ms, costo de la experiencia sobre esos hits 4449 ms, ahorro neto sobre hits 43439 ms (90.7%).
- Overhead total sobre los 4548 miss: 3812 ms (0.838 ms de media).
- Tiempo con experiencia 802466 ms contra 842093 ms estimados sin experiencia: ahorro neto 39627 ms, 4.71% del total.

Casos caros:
- En HOLDOUT: 2 hits con baseline > 500 ms, 0 con > 1000 ms, 0 con > 3000 ms.
  - 4047636__Martin_Pisoni4047636.xml: 920.79 ms -> 15.41 ms (lookup 4.51, deserializacion 5.80, validacion 1.92), speedup 59.7x, placas 6 y 6.
  - 4055118__federico_mercado4055118.xml: 760.39 ms -> 32.00 ms (lookup 12.55, deserializacion 17.77, validacion 0.97), speedup 23.8x, placas 16 y 16.
- En TRAIN, sobre 452 hits, hay mas muestra:
  - > 500 ms: 18 hits, costo original total 15293 ms, media 849.6 ms; costo con memoria 33.58 ms de media; speedup mediano 26.8x, maximo 77x.
  - > 1000 ms: 2 hits, costo original medio 2213 ms, con memoria 94.95 ms.
  - > 3000 ms: 1 hit. 4027155__Francisco_Herrera4027155.xml: 3203 ms -> 125.78 ms, 25x, 21 placas.
- El caso mas caro del corpus en el holdout tarda 38.8 s y NO tiene hit. La memoria exacta no ataca todavia la cola cara: la ataca solo cuando ese pedido exacto se repite.

Calidad:
- qualityRegressions: 0.
- boardsExperience > boardsBaseline: 0 casos.
- Placas totales: 6992 baseline contra 6992 experience.
- Diferencias de cantidad de piezas o de colocaciones: 0.
- Hits cuya disposicion difiere del plan baseline: 0 sobre 29. La huella de colocaciones (placa, x, y, ancho, alto, referencia) es identica, asi que el remapeo de etiquetas es fiel.
- Hits con plan invalido: 0.
- invalidCacheEntries: 0. fallbacks: 0. No hubo ninguna entrada que fallara la revalidacion.

Lectura:
- El mecanismo funciona y es seguro: 0 regresiones, 0 entradas invalidas, disposicion identica y 94.19% de ahorro sobre los casos con hit.
- Lo que limita el resultado no es el costo de la capa sino la tasa de aciertos con memoria congelada en una frontera temporal unica.
- Con 1.45% de hit rate el ahorro global no supera el ruido de medicion. Con memoria que aprende sobre la marcha, 9.04% de hit rate y 4.71% de CPU, si lo supera.

### Benchmark Exact Memory V10 2026-09-03

Commit base: 3dbcea727fe82b9a7b911caf458fb18f035cac19
Dataset: D:\proyectos asistidos\lepton\data\lepton-xml, 8669 XML.
Estrategia: v10, perfil balanced. Mapping verificado en codigo: optimizerProfileForStrategy("v10") devuelve "balanced" en src/lib/optimizations/project-input.ts, replicado por benchmarkProfileForStrategy.
Versiones: fingerprint experience-exact-v1, store experience-store-v1, motor legacy-guillotine-v10-lepton-remnants-20260813.
Hardware: Intel Core i5-1135G7, 4 nucleos / 8 hilos, 15.8 GB RAM, Windows 10 Pro, Node v22.21.1.
Command:
- node scripts/experience-benchmark.mjs train      --strategy v10 --train 5000 --holdout 2000 --files <28 casos fuente>
- node scripts/experience-benchmark.mjs baseline   --strategy v10 --train 5000 --holdout 2000 --label r1
- node scripts/experience-benchmark.mjs experience --strategy v10 --train 5000 --holdout 2000 --label sample --files <29 hits + 100 misses>
- node scripts/experience-benchmark.mjs report     --strategy v10 --train 5000 --holdout 2000
Salidas: experiencia/v5/train-v10-*.json, baseline-v10-*-r1.json, experience-v10-*-sample.json, summary-v10-*.json.

Split:
- Identico al de Etapa 4A: TRAIN = primeros 5000 casos canonicos, HOLDOUT = los 2000 siguientes.
- Orden: numero de pedido del nombre de archivo, declarado como PROXY de orden temporal. No es fecha real.
- Store congelado (readonly) antes de evaluar el holdout. El holdout no puede poblar la memoria.

Desviaciones de alcance, con su justificacion:
- TRAIN ejecutado sobre 28 casos, no 5000. El exact fingerprint se calcula sobre el CanonicalOptimizationCase, que no incluye estrategia ni perfil, asi que el conjunto de fingerprints del holdout que existen en el train es el mismo que en Fast. Se ejecutaron bajo V10 exactamente los 28 casos del train que originan esas entradas. Para toda consulta que hace el holdout el store contiene lo mismo que uno entrenado con los 5000, y el lookup es por hash de la clave, asi que el tamano del store no cambia su costo. Verificado empiricamente: el holdout produjo 29 hits, los mismos que en Fast.
- EXPERIENCE ejecutado sobre 129 casos, no 2000: los 29 hits completos mas una muestra estratificada de 100 misses. Un miss recorre exactamente el mismo camino del motor que el baseline, y recomputar 1971 de ellos costaba mas de 5 horas sin producir informacion nueva. Verificado: en los 100 misses medidos, placas y disposicion identicas al baseline en 100 de 100.
- Muestra de misses estratificada por tiempo baseline V10 real, en terciles, con indices equiespaciados dentro de cada tercil. Reproducible, sin azar. Baratos n=33 rango 0..172 ms; medios n=33 rango 172..1140 ms; caros n=34 rango 1150..1387932 ms.
- Por lo anterior, globalExperienceMs es DERIVADO y esta marcado como tal. No es una corrida experience completa.
- Una sola corrida por modo. En Fast la repeticion hacia falta porque el ahorro era del orden del ruido; aca el ahorro sobre un hit es de segundos contra milisegundos, tres ordenes de magnitud por encima del ruido.

Cobertura:
- Casos: 2000. Errores: 0 en baseline y 0 en experience.
- Cache interno del motor en baseline: 79 activaciones, ninguna sobre un caso con hit. Los ahorros medidos no estan contaminados por ese cache.

Exact hit rate:
- exactHits 29 sobre 2000 = 1.45%. Identico a Fast, como se esperaba: el fingerprint no depende de la estrategia.
- misses 1971, de los cuales 100 medidos. invalidCacheEntries 0. fallbacks 0.

Latencia baseline V10, 2000 casos (ms):
- avg 6305.40, p50 455.02, p90 12111.46, p95 40202.35, p99 88187.12, max 1387932.43, total 12610796.54.

Latencia experience, 129 casos medidos (ms):
- avg 4032.41, p50 241.21, p90 6635.36, p95 27579.38, p99 67935.91, max 84515.68, total 520180.41.
- Solo sobre los 29 hits: baseline avg 7169.26 (total 207908.43) contra experience avg 85.05 (total 2466.30).

Costo de la capa (ms):
- fingerprint avg 0.674, p95 2.176, max 5.363.
- lookup avg 17.981, p50 0.137, p95 118.987, max 350.927. La media la levantan los hits, que leen y parsean el plan desde disco; en un miss el lookup es un acceso fallido a archivo.
- deserializacion en hit avg 4.330, max 27.774.
- validacion en hit avg 0.548, max 3.700.
- Overhead medido por miss: media 0.819, p50 0.507, p90 1.642, p95 2.336, p99 4.309, max 5.582, sobre muestra de 100.

CPU medido:
- baselineTotalMs 12610796.54
- baselineMsExactHits 207908.43
- experienceMsExactHits 2466.30
- netSavingOnHits 205442.14
- savingPercentOnHits 98.81%

CPU derivado (no es una corrida completa):
- formula: globalExperienceMsDerived = baselineTotalMs - baselineMsExactHits + experienceMsExactHits + estimatedMissOverheadMs
- meanMissOverheadMeasured 0.819 ms sobre muestra de 100; estimatedMissOverheadMs = 0.819 x 1971 = 1613.46 ms
- globalExperienceMsDerived 12406967.87
- globalSavingMsDerived 203828.68
- globalSavingPercentDerived 1.62%

Casos caros con hit:
- Mayor a 500 ms: 14 hits, baseline total 205058.07 ms, media 14647.01 ms, experience media 121.08 ms, ahorro 203362.98 ms, speedup mediano 77.3x, maximo 2300.8x, placas 101 y 101.
- Mayor a 1000 ms: 14 hits, identico al anterior: ningun hit cae entre 500 y 1000 ms.
- Mayor a 3000 ms: 11 hits, baseline media 18202.08 ms, experience media 144.35 ms, speedup mediano 122.6x, placas 90 y 90.
- Mayor a 5000 ms: 8 hits, baseline media 23638.68 ms, experience media 180.16 ms, speedup mediano 113.7x, placas 79 y 79.
- Mayor a 10000 ms: 6 hits, baseline media 28689.10 ms, experience media 179.37 ms, speedup mediano 113.7x, placas 68 y 68.
- Los 14 hits que superan 500 ms concentran 205058 ms de los 207908 ms que ahorra la memoria: el 98.6% del ahorro viene de ellos.

Los 10 hits con mayor ahorro absoluto (ms):
- 4047636__Martin_Pisoni4047636.xml: 60325.14 a 172.93, 348.8x, ahorro 60152.21, placas 6 y 6.
- 4050051__REMODELACIONES ORTEGA_ORTEGA4050051.xml: 58544.45 a 25.45, 2300.8x, ahorro 58519.01, placas 20 y 20.
- 4060744__Mega_Maderas4060744.xml: 16181.85 a 154.46, 104.8x, ahorro 16027.38, placas 16 y 16.
- 4049264__Horacio Jose _Godoy 4049264.xml: 15243.81 a 124.29, 122.6x, ahorro 15119.52, placas 4 y 4.
- 4059495__Cesar_Carpintero4059495.xml: 11174.24 a 337.17, 33.1x, ahorro 10837.08, placas 7 y 7.
- 4055118__federico_mercado4055118.xml: 10665.13 a 261.91, 40.7x, ahorro 10403.22, placas 15 y 15.
- 4047714__BRENDA MEDINA_medina4047714.xml: 8746.26 a 12.16, 719.3x, ahorro 8734.10, placas 6 y 6.
- 4061190__Joaquin Ignacio_Escalante4061190.xml: 8228.59 a 352.92, 23.3x, ahorro 7875.67, placas 5 y 5.
- 4053420__LUCAS_RODRIGUEZ4053420.xml: 4482.71 a 135.03, 33.2x, ahorro 4347.68, placas 5 y 5.
- 4047679__Dana_Zimmer4047679.xml: 3558.47 a 9.40, 378.6x, ahorro 3549.07, placas 3 y 3.

Cola cara sin hit:
- 1971 casos sin hit acumulan 12402888 ms, es decir 98.35% del tiempo baseline del holdout.
- Los 20 mas caros sin hit acumulan 3594496 ms: 28.50% del tiempo baseline total, en 1% de los casos.
- Top 20 por baselineMs:
  1. 4048571__JORGE_Tortoroglio4048571.xml 1387932 ms, 112 placas, 2439 piezas
  2. 4059795__diego_primo4059795.xml 183176 ms, 63 placas, 950 piezas
  3. 4052383__JESSICA BELINDA_GARCIA ANGUIANO4052383.xml 182728 ms, 33 placas, 223 piezas
  4. 4052960__Guillermo_Morales4052960.xml 149319 ms, 14 placas, 114 piezas
  5. 4056720__pablo cesar_alejo morales4056720.xml 146096 ms, 28 placas, 1428 piezas
  6. 4056676__pablo cesar_alejo morales4056676.xml 140840 ms, 28 placas, 1417 piezas
  7. 4052357__JESSICA BELINDA_GARCIA ANGUIANO4052357.xml 126688 ms, 14 placas, 81 piezas
  8. 4052356__ALEJANDRA_RUIZ4052356.xml 121155 ms, 16 placas, 116 piezas
  9. 4048437__ignacio_lahoz4048437.xml 104874 ms, 9 placas, 114 piezas
  10. 4051546__JACOB_LIMON4051546.xml 104447 ms, 16 placas, 189 piezas
  11. 4055211__Alejandro Luis_Aperlo4055211.xml 102479 ms, 11 placas, 152 piezas
  12. 4052394__JESSICA BELINDA_GARCIA ANGUIANO4052394.xml 98402 ms, 13 placas, 65 piezas
  13. 4053866__Silvio_Barraza4053866.xml 97713 ms, 8 placas, 131 piezas
  14. 4051614__Edgar Efrain_Renero Hernandez4051614.xml 96112 ms, 29 placas, 167 piezas
  15. 4053522__Juan Carlos_Rojas4053522.xml 95847 ms, 41 placas, 518 piezas
  16. 4052498__cristian_berger4052498.xml 95555 ms, 14 placas, 146 piezas
  17. 4053333__Ramiro_Portela4053333.xml 92926 ms, 25 placas, 304 piezas
  18. 4053110__Ariel emanuel_Nieva4053110.xml 90349 ms, 12 placas, 128 piezas
  19. 4053987__JAVIER MATIAS_FONTANA4053987.xml 89444 ms, 16 placas, 120 piezas
  20. 4059352__victor_moneta4059352.xml 88414 ms, 29 placas, 430 piezas
- El caso mas caro del corpus tarda 23.1 minutos en un solo pedido y no tiene hit.

Calidad:
- qualityRegressions 0.
- boardsRegressions 0. Ningun caso con boardsExperience mayor que boardsBaseline.
- Placas totales sobre los 129 casos medidos: 536 baseline contra 536 experience.
- pieceCountDifferences 0. invalidPlans 0.
- placementDifferences 1, geometryDifferences 0.
- Los 100 misses muestreados dieron placas y disposicion identicas al baseline: 100 de 100.

El unico caso con huella de disposicion distinta, auditado pieza por pieza:
- 4047665__Dana_Zimmer4047665.xml, 5 placas y 5, 106 piezas y 106, ambos planes validos.
- El multiconjunto de rectangulos colocados es IDENTICO; el area colocada tambien.
- Solo 4 colocaciones llevan otra etiqueta en el mismo rectangulo, y son intercambios entre las referencias 6 y 12, ambas de 400x50 y cantidad 2. Intercambios entre piezas de distinta medida: 0.
- Es una permutacion de etiquetas entre piezas indistinguibles, no un plan distinto: no cambia ni las placas, ni las piezas, ni un solo corte. Ocurre porque el plan reutilizado viene de otro pedido y el remapeo asigna las unidades de una misma clase de equivalencia en el orden de la demanda.
- Por eso qualityRegressions dejo de contar diferencias de etiqueta y se agrego geometryDigest, que compara solo la geometria.

Comparacion Fast contra V10, con los numeros ya documentados de Fast:

|                        | FAST            | V10                    |
|------------------------|-----------------|------------------------|
| hitRate                | 1.45% (29/2000) | 1.45% (29/2000)        |
| avg hit baseline       | 113.65 ms       | 7169.26 ms             |
| avg hit experience     | 6.60 ms         | 85.05 ms               |
| saving on hits         | 94.19%          | 98.81%                 |
| global saving          | -0.41% medido   | +1.62% derivado        |
| hits mayores a 500 ms  | 2               | 14                     |
| hits mayores a 1 s     | 0               | 14                     |
| hits mayores a 3 s     | 0               | 11                     |
| hits mayores a 5 s     | no medido       | 8                      |
| hits mayores a 10 s    | no medido       | 6                      |
| max speedup            | 59.7x           | 2300.8x                |
| ahorro absoluto        | 3.10 s          | 205.44 s               |

Lectura:
- El hit rate es identico porque el fingerprint es el mismo; lo que cambia es cuanto vale cada hit.
- El mismo 1.45% de aciertos vale 3.10 s en Fast y 205.44 s en V10: 66 veces mas.
- En Fast el ahorro global quedaba sepultado en el ruido; en V10 es 1.62%, chico pero por encima del ruido y con signo positivo.
- La economia es asimetrica: la capa cuesta 0.819 ms por miss, es decir 1.61 s en los 1971 misses, contra 205.44 s ahorrados. Relacion 127 a 1.
- Pero el 98.35% del tiempo sigue estando en casos sin hit, y el 28.50% en apenas 20 pedidos. Exact Memory no toca ese problema.

Conclusion: opcion B. Exact Memory aporta valor real y verificado en repeticiones caras, con hit rate bajo. Ver DECISIONES TOMADAS.

## DIAGNOSTICO COLA CARA V10

Fecha: 2026-09-04
Commit base: 3dbcea727fe82b9a7b911caf458fb18f035cac19
Version de motor: legacy-guillotine-v10-lepton-remnants-20260813
Naturaleza: SOLO MEDICION. No se modifico ninguna heuristica, scoring, limite, Fast, V10,
OneBoard, Pattern Master, MultiSlice, compactacion, solver ni generacion de patrones.
No se creo Router, Structural Memory ni Mongo. No se toco Exact Memory. No se toco produccion.

### Dataset

Universo: los 2000 casos del HOLDOUT del "Benchmark Exact Memory V10 2026-09-03",
estrategia v10 / perfil balanced, con sus tiempos ya registrados en
experiencia/v5/baseline-v10-5000-2000-r1.json. Total 12610796.54 ms.
Corpus: D:\proyectos asistidos\lepton\data\lepton-xml. Split identico al del benchmark V10:
TRAIN = primeros 5000 casos canonicos, HOLDOUT = los 2000 siguientes.

### Casos analizados

Se corrieron 214 casos con instrumentacion por etapa, elegidos de forma deterministica:
- 128 casos: TODOS los que superan 30 s en el baseline V10. Ese conjunto incluye por
  construccion el top 20 por tiempo, los 52 que superan 60 s y los 18 que superan 90 s.
- 86 casos de control rapidos/medios, emparejados por cantidad de piezas contra los caros
  (para cada caro, un caso al percentil 25 y otro al 75 de los casos con pieceCount dentro
  de +-15%). Sin azar.
Cobertura: esos 214 casos representan 9400916 ms del baseline, es decir el 74.5% del tiempo
total del holdout, con el 10.7% de los casos.
Incluidos explicitamente: 4048571__JORGE_Tortoroglio4048571.xml (1387932 ms, 112 placas,
2439 piezas) y los casos chicos anormalmente caros (65 a 150 piezas por encima de 90 s).
Resultado: 214 registros, 0 errores.

### Comandos

- node scripts/v10-hotspot-diagnostic.mjs --files experiencia/v6/diag-files.txt --out experiencia/v6/hotspot-v10.jsonl
- node scripts/v10-hotspot-diagnostic.mjs --files experiencia/v6/diag-w1.txt   --out experiencia/v6/hotspot-w1.jsonl   --maxNew 2
- node scripts/v10-hotspot-diagnostic.mjs --files experiencia/v6/diag-w2.txt   --out experiencia/v6/hotspot-w2.jsonl   --maxNew 2
- node scripts/v10-hotspot-diagnostic.mjs --files experiencia/v6/diag-rest.txt --out experiencia/v6/hotspot-rest.jsonl --maxNew 3
Salidas: experiencia/v6/hotspot-all.jsonl (union de las cuatro, 214 registros),
experiencia/v6/pool-growth.json, experiencia/v6/diag-*.txt.
Hardware: Intel Core i5-1135G7, 4 nucleos / 8 hilos, 15.8 GB RAM, Windows 10 Pro, Node v22.21.1.

### Instrumentacion disponible y como se obtuvo

Lo que YA existia y se leyo sin agregar nada:
- v10.cjs acumula por modulo (oneboard, master, multislice, compactacion) activaciones,
  ganancias, placasAhorradas, invalidos, ms y peorMs. legacy-engine.ts lo expone en
  plan.metricasV10 y la cota en plan.cotaV10.
- motor.cjs expone en resumen: etapasUsadas, maxXmlLayer, maxType2Layer, type2Nodes,
  rescueIntentado, rescueGano, rescueMs, cacheHits, cacheFallos.

Lo que NO existia: la separacion interna de Pattern Master entre generarPatrones,
patronesMonotipo, resolverCobertura y materializar, mas patrones generados y nodos del B&B.
Esta era la "Instrumentacion fina de Pattern Master" registrada en PROPUESTAS_NO_IMPLEMENTADAS.

Se resolvio SIN modificar ningun archivo legacy. El punto minimo y seguro resulto ser el
limite de modulo: cada .cjs captura sus dependencias por destructuring en el momento en que
se carga, asi que el script de diagnostico requiere motor.cjs, patrones.cjs, cobertura.cjs,
materializar.cjs y oneboard.cjs, envuelve sus EXPORTACIONES con un cronometro, y recien
despues carga el bundle que hace require de v10.cjs. v10.cjs captura entonces las versiones
envueltas. Los envoltorios llaman al original con los mismos argumentos y devuelven el mismo
valor; lo unico que agregan es Date.now().

Verificacion de fidelidad:
- Placas identicas a las del baseline registrado en 213 de 214 casos.
- stageMs.compactacion coincide con el contador propio de v10 (ejemplo: 256 contra 257 ms).
- El unico caso divergente se explica abajo, en Limitaciones, y no es efecto de los envoltorios.

### Limitaciones

- El diagnostico corrio con la maquina en uso (servidor de desarrollo Next de otro proyecto
  activo). El lote de 52 casos finales corrio con mediana de 1.92x el tiempo del baseline; el
  primer lote de 113 casos corrio con mediana 0.93x. Por eso los ms ABSOLUTOS de la corrida no
  son comparables al baseline y el informe usa, para atribuir tiempo, la PROPORCION por etapa
  medida en cada caso aplicada al ms de baseline de ese mismo caso.
- Control de validez de esa decision: en la banda comparable de 30 a 60 s, el lote limpio y el
  lote cargado dan generarPatrones 65.9% contra 70.2%, MultiSlice 14.7% contra 14.3%, baseline
  6.5% contra 5.3%. El reparto es estable; los ms absolutos no.
- 48 de los 214 casos se corrieron con dos procesos en paralelo para acortar el reloj. Sus
  proporciones por etapa quedan dentro del mismo rango (generarPatrones 73.9%). Se dejan
  marcados por archivo de origen.
- V10 NO es reproducible bit a bit entre corridas: presupuestoBeamMs (1500 ms por llamada a
  armarPlacas) y msMaster (8000 ms por B&B) son presupuestos de reloj, asi que el plan depende
  de cuanto alcanza a explorar la maquina. Caso 4059200__ALEJANDRA_RUIZ4059200.xml: 17 placas
  y 43590 ms en el baseline registrado, 18 placas y 111438 ms aca, reproducido en corrida
  aislada. Es 1 caso sobre 214 y NO es efecto de la instrumentacion.
- 1787 casos del holdout quedaron sin instrumentar (25.5% del tiempo). De ellos, 192 estan
  fuera de cota y por lo tanto tambien corren rescates, con 1878706 ms. Las cifras de
  atribucion de abajo son por eso un PISO, no un total.
- 1 caso de los 214 fue servido por el cache interno de 50 entradas de optimizeProject y se
  excluyo de la atribucion por etapa.

### Metricas medidas

Reparto por etapa, cola cara (128 casos con baseline > 30 s), sobre el tiempo de la corrida:

| etapa                    | ms         | %     |
|--------------------------|-----------:|------:|
| baseline V8              |    832184  |  5.9% |
| compactacion             |    594940  |  4.2% |
| MultiSlice               |   2044718  | 14.5% |
| master / generarPatrones |  10133290  | 71.9% |
| master / patronesMonotipo|     86435  |  0.6% |
| master / resolverCobertura|   399115  |  2.8% |
| master / materializar    |         1  |  0.0% |
| master total             |  10618841  | 75.3% |
| RESCATES EN TOTAL        |  13258499  | 94.1% |

El reparto es estable por banda: 30-60 s da generarPatrones 69.2%, 60-90 s da 73.6%,
mas de 90 s da 73.7%, top 20 da 73.2%. No hay una banda con un cuello distinto.

Banda de control (86 casos con baseline <= 30 s): baseline 58.3%, compactacion 33.9%,
MultiSlice 3.7%, master 3.5%. Ahi el motor base domina y compactacion es el segundo costo.

Atribucion en ms de BASELINE (proporcion medida por caso x ms de baseline de ese caso),
sobre el 74.5% del holdout que se instrumento:

| etapa                    | ms baseline | % del holdout completo |
|--------------------------|------------:|-----------------------:|
| baseline V8              |     686200  |                  5.4%  |
| compactacion             |     485649  |                  3.9%  |
| MultiSlice               |    1420203  |                 11.3%  |
| master / generarPatrones |    6494872  |                 51.5%  |
| master / patronesMonotipo|      58352  |                  0.5%  |
| master / resolverCobertura|    250045  |                  2.0%  |
| RESCATES EN TOTAL        |    8709121  |                 69.1%  |

Victorias por modulo, cola cara (128 casos):

| modulo       | activaciones | gano | placasAhorradas | invalidos | ms       | ms por placa ahorrada |
|--------------|-------------:|-----:|----------------:|----------:|---------:|----------------------:|
| compactacion |           62 |   24 |               1 |         0 |   595001 |                595001 |
| MultiSlice   |          128 |    3 |               3 |         0 |  2044729 |                681576 |
| OneBoard     |            0 |    0 |               0 |         0 |        0 |                     - |
| master       |          128 |    1 |               1 |         0 | 10618915 |              10618915 |

Las 24 "ganancias" de compactacion con 1 sola placa ahorrada NO son un error: probar() se
llama con permitirMismas=true, asi que compactacion acepta candidatos con las MISMAS placas
cuando mejoran el remanente. Su aporte es calidad de remanente, no cantidad de placas.

Pattern Master por dentro (129 casos que lo activan, 10624131 ms):
- generarPatrones 10138485 ms = 95.4% del master.
- patronesMonotipo 86529 ms = 0.8%.
- resolverCobertura 399116 ms = 3.8%.
- materializar 1 ms = 0.0%.
- Llamadas a optimizar dentro de generarPatrones: 5119, es decir 39.7 por caso (rondasPatrones
  cae en el default 40 porque el perfil balanced no lo define).
- Llamadas a optimizar dentro de patronesMonotipo: 4943, es decir 38.3 por caso.
- Pool de patrones: medio 292, maximo 2124.
- B&B: 29009933 nodos; agoto el presupuesto msMaster=8000 en 35 de 129 casos.
- materializar se ejecuto en 1 de 129 casos. En los otros 128 el B&B nunca encontro una
  solucion mejor que el incumbente, asi que no hubo nada que materializar.

Curva de saturacion del pool (12 casos, muestra deterministica equiespaciada por costo de
generarPatrones, medida con una replica fiel del bucle de patrones.cjs, mismo RNG y semillas):
- El pool NO se satura: en 11 de 12 casos la ronda 39, la ultima, todavia aporta patrones nuevos.
- Tiempo posterior a la ultima ronda que aporto algo: 3131 ms de 761833, es decir 0.4%.
- Pool medio tras 10 rondas 64.2, tras 20 rondas 120.2, tras 40 rondas 232.1.
- Tiempo acumulado a 10 rondas 217176 ms (28.5%), a 20 rondas 406620 ms (53.4%), a 40 rondas 761833 ms.
- Consecuencia: un corte por saturacion NO ahorraria nada. El crecimiento es aproximadamente
  lineal en rondas, asi que cualquier ahorro exige reducir rondas y aceptar un pool mas chico.

Trabajo inutil medido, sin cambiar ningun resultado:
- En 208 de los 214 casos el baseline V8 ya habia producido el plan final: ningun rescate
  ahorro una sola placa.
- Tiempo gastado en rescates en esos 208 casos: 12846212 ms de 14247522, es decir el 90.2%.
- Desglose de ese tiempo: generarPatrones 9778840 ms, MultiSlice 1978495 ms,
  compactacion 632351 ms, resolverCobertura 375001 ms, patronesMonotipo 81525 ms.

Compuerta de la cota inferior por area, sobre los 2000 casos del holdout:
- 1680 casos alcanzan la cota. optimizarV10 retorna temprano y no corre MultiSlice, OneBoard
  ni master. Consumen 1560040 ms, el 12.4% del tiempo.
- 320 casos no la alcanzan y corren toda la cadena de rescates. Consumen 11050756 ms, el 87.6%.

### Familias encontradas

Sobre los 320 casos fuera de cota del holdout completo:

| familia                          |   n |         ms | % del holdout | avg ms | pz mediana | tipos mediana |
|----------------------------------|----:|-----------:|--------------:|-------:|-----------:|--------------:|
| F1 gap +1, <= 120 piezas         | 222 |    5246269 |         41.6% |  23632 |         36 |            13 |
| F5 gap +1, > 120 piezas          |  41 |    2329050 |         18.5% |  56806 |        162 |            47 |
| F3 pedido masivo, > 500 piezas   |   5 |    1953891 |         15.5% | 390778 |       1417 |            14 |
| F2 gap >= 2 placas               |  21 |    1234996 |          9.8% |  58809 |         95 |            23 |
| F4 monotipo o casi monotipo      |  31 |     286551 |          2.3% |   9244 |          4 |             1 |

gap = placas finales menos cota inferior por area.

Reparto por etapa dentro de cada familia, sobre los casos instrumentados:

| familia            |  n | baseline | compactacion | MultiSlice | generarPatrones | resolverCobertura | placas ahorradas |
|--------------------|---:|---------:|-------------:|-----------:|----------------:|------------------:|-----------------:|
| F0 en cota         | 84 |    44.7% |        30.1% |       8.4% |           16.2% |              0.0% |                2 |
| F1 gap+1 <=120 pz  | 67 |     7.3% |         9.3% |      18.4% |           63.2% |              1.4% |                1 |
| F2 gap>=2          | 16 |     4.3% |         4.0% |      10.8% |           73.9% |              6.3% |                1 |
| F3 masivo >500 pz  |  5 |     8.1% |         0.0% |      19.5% |           69.8% |              1.7% |                0 |
| F4 monotipo        |  5 |     8.6% |         0.0% |      13.1% |           76.5% |              0.0% |                0 |
| F5 gap+1 >120 pz   | 37 |     3.4% |         0.0% |       8.1% |           83.8% |              4.0% |                2 |

Lectura: la familia dominante en tiempo NO es la de los pedidos grandes. Es F1, pedidos con
mediana de 36 piezas y 13 tipos que terminan a una sola placa de la cota por area y gastan
23.6 s de promedio, con dos tercios de ese tiempo en generarPatrones.

### Top de tiempos

Top 20 del holdout por ms de baseline, con desglose medido (ms de la corrida de diagnostico):

| # | archivo | baseline ms | V8 | compac | MultiSlice | generarPatrones | B&B | pool | nodos | pz | tipos | placas/cota |
|--:|---------|------------:|---:|-------:|-----------:|----------------:|----:|-----:|------:|---:|------:|------------:|
| 1 | 4048571__JORGE_Tortoroglio4048571 | 1387932 | 96009 | 0 | 237518 | 931062 | 8014 | 2124 | 284834 | 2439 | 72 | 112/108 |
| 2 | 4059795__diego_primo4059795 | 183176 | 27991 | 0 | 66618 | 193371 | 8009 | 1211 | 619710 | 950 | 66 | 63/60 |
| 3 | 4052383__JESSICA BELINDA_GARCIA ANGUIANO4052383 | 182728 | 4501 | 0 | 10436 | 130741 | 8010 | 845 | 497035 | 223 | 141 | 33/31 |
| 4 | 4052960__Guillermo_Morales4052960 | 149319 | 8962 | 0 | 25290 | 160408 | 146 | 389 | 3216 | 114 | 76 | 14/13 |
| 5 | 4056720__pablo cesar_alejo morales4056720 | 146096 | 29544 | 0 | 73482 | 244648 | 8001 | 127 | 319532 | 1428 | 4 | 28/26 |
| 6 | 4056676__pablo cesar_alejo morales4056676 | 140840 | 28562 | 0 | 66847 | 224515 | 8002 | 125 | 296700 | 1417 | 4 | 28/26 |
| 7 | 4052357__JESSICA BELINDA_GARCIA ANGUIANO4052357 | 126688 | 8016 | 11995 | 21329 | 86681 | 8003 | 304 | 733986 | 81 | 39 | 14/12 |
| 8 | 4052356__ALEJANDRA_RUIZ4052356 | 121155 | 6505 | 7618 | 11527 | 55166 | 8002 | 190 | 535224 | 116 | 16 | 16/15 |
| 9 | 4048437__ignacio_lahoz4048437 | 104874 | 8541 | 12893 | 19833 | 52667 | 284 | 229 | 23987 | 114 | 31 | 9/8 |
| 10 | 4051546__JACOB_LIMON4051546 | 104447 | 2892 | 0 | 6760 | 105513 | 8003 | 423 | 648825 | 189 | 54 | 16/14 |
| 11 | 4055211__Alejandro Luis_Aperlo4055211 | 102479 | 2916 | 0 | 8970 | 92553 | 70 | 313 | 3549 | 152 | 55 | 11/10 |
| 12 | 4052394__JESSICA BELINDA_GARCIA ANGUIANO4052394 | 98402 | 7908 | 0 | 19104 | 89849 | 95 | 267 | 4095 | 65 | 45 | 13/12 |
| 13 | 4053866__Silvio_Barraza4053866 | 97713 | 2806 | 0 | 6470 | 104529 | 55 | 250 | 1688 | 131 | 66 | 8/7 |
| 14 | 4051614__Edgar Efrain_Renero Hernandez4051614 | 96112 | 2559 | 0 | 8071 | 137097 | 8003 | 484 | 566618 | 167 | 31 | 29/26 |
| 15 | 4053522__Juan Carlos_Rojas4053522 | 95847 | 8618 | 0 | 18403 | 58183 | 8023 | 269 | 441212 | 518 | 14 | 41/39 |
| 16 | 4052498__cristian_berger4052498 | 95555 | 2922 | 0 | 6199 | 123541 | 75 | 319 | 611 | 146 | 28 | 14/13 |
| 17 | 4053333__Ramiro_Portela4053333 | 92926 | 9276 | 0 | 14113 | 57110 | 8009 | 656 | 473089 | 304 | 89 | 25/24 |
| 18 | 4053110__Ariel emanuel_Nieva4053110 | 90349 | 3789 | 0 | 8488 | 99879 | 5745 | 317 | 424207 | 128 | 49 | 12/11 |
| 19 | 4053987__JAVIER MATIAS_FONTANA4053987 | 89444 | 7102 | 10040 | 19408 | 81694 | 8001 | 149 | 417839 | 120 | 9 | 16/15 |
| 20 | 4059352__victor_moneta4059352 | 88414 | 16666 | 0 | 39819 | 137866 | 8016 | 848 | 267026 | 430 | 186 | 29/28 |

Ninguno de los 20 ahorro una sola placa con rescates.

La unica victoria de master en todo el diagnostico:
- 4050594__Mega_Maderas4050594.xml, 55979 ms, 7 placas contra cota 7, pool 182, 809 nodos.
  generarPatrones 31608 ms, B&B 25 ms, materializar 1 ms. 1 placa ahorrada.
  Es 1 placa en 129 activaciones y 10624131 ms de master.

### Correlaciones

Spearman rho contra totalMs sobre los 2000 casos del holdout:
pieceCount 0.766, distinctPairs 0.725, pieceTypes 0.723, boards 0.712, distinctW 0.705,
areaRatio 0.694, distinctH 0.684, lowerBound 0.665, maxRep 0.503, thinRatio 0.376,
longRatio 0.226, typeRatio -0.233, repRatio -0.625, bigRatio -0.038, grainRatio 0.049.

Ninguna variable estructural sola explica el costo. El separador real es binario y no es
estructural: alcanzar o no la cota inferior por area. 1680 casos en cota consumen el 12.4% del
tiempo; 320 fuera de cota consumen el 87.6%.

Efecto medido del umbral maxPiezasBeam=120 de motor.cjs, sobre los 2000 casos:

| banda de piezas | n en cota | avg ms en cota | n fuera de cota | avg ms fuera | ms por pieza fuera |
|-----------------|----------:|---------------:|----------------:|-------------:|-------------------:|
| 1-40            |      1274 |            342 |             153 |         8869 |                457 |
| 40-60           |       200 |           2474 |              39 |        25153 |                545 |
| 60-80           |        80 |           3354 |              23 |        41849 |                590 |
| 80-100          |        44 |           3695 |              34 |        52947 |                607 |
| 100-120         |        23 |           4667 |              12 |        70484 |                635 |
| 120-140         |        19 |           1079 |              12 |        64226 |                501 |
| 140-200         |        28 |           1152 |              21 |        57216 |                358 |
| 200-400         |        11 |           3141 |              17 |        55485 |                224 |
| 400 o mas       |         1 |           4477 |               9 |       243211 |                186 |

El costo por pieza sube hasta la banda 100-120 y despues se derrumba. armarPlacas saltea Beam
Search cuando piezas.length > maxPiezasBeam, asi que un pedido de 110 piezas hace mas trabajo
que uno de 200. Eso explica por que la cantidad de piezas no predice el costo.

### Hipotesis, contrastadas contra la medicion

1. "El cuello sigue siendo generarPatrones, como mostraron benchmarks historicos." CONFIRMADA.
   71.9% del tiempo de la cola cara, 95.4% del tiempo de Pattern Master, 51.5% del holdout
   completo como piso medido.
2. "El solver / B&B se vuelve relevante en estos casos nuevos." NO CONFIRMADA. resolverCobertura
   es el 2.8% de la cola cara. Agota su presupuesto de 8 s en 35 de 129 casos, pero incluso ahi
   su costo esta acotado por msMaster y es dos ordenes de magnitud menor que generarPatrones.
3. "Hay rescates que se ejecutan durante muchos segundos y casi nunca ganan." CONFIRMADA.
   master: 128 activaciones y 1 placa en la cola cara. MultiSlice: 128 activaciones y 3 placas.
   OneBoard: 0 activaciones, porque exige cota === 1.
4. "El costo correlaciona con alguna variable estructural." NO CONFIRMADA como predictor unico.
   Ver Correlaciones. El separador es la compuerta de la cota, no una variable continua.
5. "El pool de patrones se satura y las ultimas rondas no aportan." REFUTADA. En 11 de 12 casos
   la ronda 39 todavia aporta patrones nuevos y el pool crece casi linealmente.
6. Hipotesis propia probada y DESCARTADA: reforzar la cota inferior con un conteo de piezas por
   placa por tipo, calculado por grilla en la mejor orientacion. No es admisible: en 9 de 2000
   casos la cota candidata supera las placas realmente alcanzadas, o sea habria cortado la
   busqueda antes de tiempo y degradado el resultado. Solo habria gateado 24 casos y el 1.8%
   del holdout, asi que ni siquiera compensaba buscarle una variante valida ahora.

### Oportunidades, maximo 3, ordenadas por ahorro potencial

#### Oportunidad 1 - Pattern Master: 40 re-optimizaciones completas por caso que no producen mejora

Problema:
generarPatrones ejecuta rondasPatrones (default 40) optimizaciones completas del pedido sobre
subconjuntos aleatorios de lineas, antes de saber si el master puede mejorar algo. Es el mayor
costo del motor, por lejos, y en la medicion casi no compra placas.

Evidencia:
- 71.9% del tiempo de la cola cara; 95.4% del tiempo de Pattern Master; 51.5% del holdout
  completo como piso medido (6494872 ms de baseline).
- 129 activaciones de master, 1 placa ahorrada en total. materializar se ejecuto en 1 de 129
  casos: en los otros 128 el B&B nunca supero el incumbente, asi que no habia nada que materializar.
- 5119 llamadas a optimizar dentro de generarPatrones, 39.7 por caso.
- El pool no se satura, asi que no hay corte gratis: pool medio 64.2 a las 10 rondas, 120.2 a
  las 20, 232.1 a las 40, con tiempo 28.5% / 53.4% / 100%.

Casos afectados:
Los 320 casos del holdout que no alcanzan la cota (16%), que concentran el 87.6% del tiempo.

Tiempo perdido:
9778840 ms de generarPatrones dentro de los 208 casos donde ningun rescate ahorro una placa.

Hipotesis:
El pool que el B&B necesita para ganar, cuando gana, es mucho mas chico que el que se construye.
La unica victoria de master ocurrio con un pool de 182 patrones y 809 nodos, valores por debajo
de la mediana.

Cambio minimo propuesto:
NO tocar patrones.cjs. rondasPatrones YA es un parametro de perfil en profileOptions de
src/lib/optimizer/engine/legacy-engine.ts, donde balanced hoy no lo define y por eso cae en el
default 40 de v10.cjs. El cambio minimo es de configuracion, no de algoritmo.
Antes de cambiarlo, correr una ABLACION offline con rondasPatrones en 10 y en 20 sobre los 2000
casos del holdout, comparando placas caso por caso contra la baseline congelada.

Riesgo:
Medio. Reducir rondas reduce el pool y por lo tanto puede cambiar el resultado del B&B. La
evidencia dice que el pool casi nunca produce una mejora, pero eso se midio en 214 casos, no en
los 2000. Por eso el paso siguiente es la ablacion, no el cambio.

Como medir exito:
0 regresiones de placas sobre los 2000 casos del holdout contra la baseline congelada, y
reduccion de avgMs, p95 y p99. Umbral de decision: si 20 rondas da 0 regresiones, el ahorro
esperado es del orden del 47% del tiempo de generarPatrones.

#### Oportunidad 2 - MultiSlice: plan alternativo completo con 4 placas en 214 casos

Problema:
planMultiSlice corre una optimizacion completa con multiVariantes:true, que duplica la lista de
configuraciones internas del motor. Se activa en todos los casos fuera de cota y casi nunca gana.

Evidencia:
- 14.5% del tiempo de la cola cara; 11.3% del holdout completo (1420203 ms de baseline).
- 128 activaciones en la cola cara con 3 placas ahorradas, mas 2 activaciones en la banda de
  control con 1 placa: 4 placas en 214 casos, a 681576 ms por placa en la cola cara.
- 1978495 ms de MultiSlice cayeron en casos donde ningun rescate ahorro una placa.

Casos afectados:
Los mismos 320 casos fuera de cota.

Tiempo perdido:
1978495 ms medidos en casos sin ninguna ganancia.

Hipotesis:
MultiSlice aporta valor real pero raro, y hoy se paga en todos los casos fuera de cota sin
ninguna condicion previa mas que no estar en la cota.

Cambio minimo propuesto:
usarMultiSlice ya es un flag por configuracion (constraints.allowMultiSlice, mapeado en
toLegacyOptions). Correr el holdout completo con MultiSlice apagado y contar exactamente cuantas
placas se pierden y cuanto tiempo se ahorra. Recien con ese numero decidir entre apagarlo,
acotarlo por tiempo o dejarlo.

Riesgo:
Bajo para medir, porque es un flag existente y la medicion es offline. Medio para apagarlo: es el
rescate que mas placas gano en el diagnostico, 4 sobre 5 totales.

Como medir exito:
Placas perdidas contra ms ahorrados sobre los 2000 casos. Si el precio por placa se mantiene en
el orden de los 680000 ms, la relacion es indefendible; si baja mucho, conviene acotarlo por
presupuesto en vez de apagarlo.

#### Oportunidad 3 - No existe presupuesto agregado por caso: los techos locales se multiplican

Problema:
Los presupuestos del motor son locales y se componen. presupuestoBeamMs = 1500 ms aplica por
llamada a armarPlacas; msMaster = 8000 ms aplica por B&B. Pero un caso caro hace del orden de 80
llamadas a optimizar (1 baseline + 1 compactacion + 1 MultiSlice + 39.7 de generarPatrones +
38.3 de patronesMonotipo), y cada optimizar recorre 4 pases x 3 profundidades = 12 armarPlacas.
El techo teorico de Beam por caso queda en torno a 80 x 12 x 1500 ms = 24 minutos. El peor caso
real medido es 1284007 ms, o sea 21 minutos. No hay ningun tope que impida ese resultado.

Evidencia:
- Peor caso 4048571__JORGE_Tortoroglio4048571.xml: 1387932 ms en el baseline, 11.01% del tiempo
  del holdout entero en un solo pedido.
- El costo por pieza cae a la mitad al cruzar maxPiezasBeam=120 (635 ms/pieza en la banda
  100-120 contra 501, 358, 224 y 186 en las bandas superiores). Pedidos de 65 a 150 piezas
  superan 90 s porque estan justo en la banda donde Beam si corre.
- p95 del holdout 40202 ms, p99 88187 ms. La media de 6305 ms no describe el problema.

Casos afectados:
La cola: 128 casos superan 30 s, 52 superan 60 s, 18 superan 90 s, 1 supera 23 minutos.

Tiempo perdido:
No es tiempo "inutil" en el mismo sentido que las otras dos: es tiempo sin techo. Los 20 casos
mas caros concentran el 28.50% del tiempo total del holdout.

Hipotesis:
Un presupuesto agregado por caso acota el p99 sin tocar el resultado de la enorme mayoria de los
casos, porque el 84% de los casos ya termina por debajo de 5 s.

Cambio minimo propuesto:
Un presupuestoTotalMs por caso en optimizarV10 que, al agotarse, devuelva el mejor plan validado
hasta ese momento. Como V10 solo reemplaza al baseline con candidatos que pasan validarPlanIndustrial
y usan menos placas, cortar por tiempo no puede devolver algo peor que el baseline V8.

Riesgo:
Bajo en calidad, porque el piso es el plan V8. Pero introduce dependencia explicita del reloj, y
esa dependencia ya existe y ya se manifesto: 4059200__ALEJANDRA_RUIZ4059200.xml dio 17 placas en
el baseline registrado y 18 aca, con el mismo codigo, por presupuestoBeamMs. Formalizar un
presupuesto por caso hace ese comportamiento explicito en vez de emergente, pero no lo elimina.
Complejidad media: es el unico de los tres que exige tocar v10.cjs.

Como medir exito:
p95 y p99 del holdout contra placas perdidas, barriendo el presupuesto en 10 s, 30 s y 60 s.

### Ninguna modificacion funcional

- No se modifico ningun archivo bajo src/lib/optimizer/legacy/.
- No se modifico src/lib/optimizer/engine/legacy-engine.ts.
- No se modificaron heuristicas, scoring, limites, Fast, V10, OneBoard, Pattern Master,
  MultiSlice, compactacion, solver ni generacion de patrones.
- No se creo Router, Structural Memory ni Structural Fingerprint. No se implemento Mongo.
  No se toco Exact Memory ni experienceMemoryEnabled. No se toco produccion.
- Unico archivo agregado: scripts/v10-hotspot-diagnostic.mjs, script de medicion que no
  participa de ningun flujo de la aplicacion.
- Salidas de datos agregadas bajo experiencia/v6/.
- Ninguna de las 3 oportunidades fue implementada.

## ABLACION RONDAS PATTERN MASTER

Fecha: 2026-09-04
Commit base: 3dbcea727fe82b9a7b911caf458fb18f035cac19
Version de motor: legacy-guillotine-v10-lepton-remnants-20260813
Naturaleza: ABLACION OFFLINE. No se modifico codigo productivo ni legacy. No se cambio ningun
default. No se toco V10 productivo, Pattern Master, heuristicas ni Exact Memory.
Resultado: FASE A rechazada por el gate. FASE B (10 rondas) NO ejecutada.

### Objetivo

Comprobar si reducir `rondasPatrones` de 40 a 20 baja fuertemente el tiempo de V10 sin aumentar
placas, sobre el holdout de 2000 casos y contra la baseline congelada.

### Metodologia

`rondasPatrones` ya es un parametro de configuracion: profileOptions() de legacy-engine.ts lo
define para los perfiles fast (8) y deep (60), y el perfil balanced no lo define, asi que v10.cjs
cae en su default `config.rondasPatrones || 40`. La ablacion lo inyecta desde afuera envolviendo
la exportacion `optimizarV10` de v10.cjs antes de que el bundle la use. El envoltorio llama al
original con las mismas `lineas` y las mismas `metricas`, y con la config identica salvo
`rondasPatrones`. Ningun archivo legacy fue modificado.

Verificacion de la inyeccion: las llamadas a `optimizar` dentro de `generarPatrones` bajaron de
39.7 por caso (medidas en el diagnostico con 40 rondas) a 19.0 por caso. El pool baja en la misma
proporcion: 70 -> 47, 111 -> 61, 139 -> 87 en los casos de control.

La ablacion se partio en dos pasadas, por una razon de medicion:

- PASADA DE CALIDAD, los 2000 casos, en 2 procesos paralelos. Mide placas, huellas, validez y
  metricas de Pattern Master. Las placas son casi insensibles a la carga de la maquina.
- PASADA DE TIEMPO, muestra estratificada de 38 casos, 1 solo proceso, corridas de 40 y 20
  intercaladas y repetidas dos veces. De aca sale el ahorro; de la pasada paralela NO.

Motivo: los ms de la pasada paralela estan inflados por contencion en ambos lados y no comparan
contra una medicion simultanea. Hay un control interno que lo demuestra: los 1680 casos que
alcanzan la cota nunca ejecutan Pattern Master, asi que `rondasPatrones` no puede afectarlos, y
ahi el "ahorro" medido en paralelo dio -59.70%. Eso es contencion pura, no el parametro.

Correccion de deriva en la pasada de tiempo: cuatro etapas son fisicamente inmunes al parametro
(baseline V8, compactacion, MultiSlice y patronesMonotipo, que corre antes y no depende de
rondas). Su cociente 20r/40r mide la deriva de maquina entre corridas y se usa para normalizar.
Con el minimo de 2 repeticiones por caso y variante la deriva quedo en x1.079.

Hardware: Intel Core i5-1135G7, 4 nucleos / 8 hilos, 15.8 GB RAM, Windows 10 Pro, Node v22.21.1.
Corpus: D:\proyectos asistidos\lepton\data\lepton-xml. Split identico al benchmark V10:
TRAIN = primeros 5000 casos canonicos, HOLDOUT = los 2000 siguientes.

### Comandos

- node scripts/pattern-rounds-ablation.mjs --rondas 20 --out experiencia/v7/rondas20.jsonl --maxNew 120
- node scripts/pattern-rounds-ablation.mjs --rondas 20 --files experiencia/v7/w1.txt --out experiencia/v7/w1.jsonl --maxNew 60
- node scripts/pattern-rounds-ablation.mjs --rondas 20 --files experiencia/v7/w2.txt --out experiencia/v7/w2.jsonl --maxNew 60
- node scripts/pattern-rounds-ablation.mjs --files experiencia/v7/repro.txt --out experiencia/v7/repro40-rN.jsonl   (N = 1..5)
- node scripts/pattern-rounds-ablation.mjs --rondas 20 --files experiencia/v7/repro.txt --out experiencia/v7/repro20-rN.jsonl   (N = 1..5)
- node scripts/pattern-rounds-ablation.mjs --files experiencia/v7/timing-sample.txt --out experiencia/v7/timing40-rN.jsonl   (N = 1,2)
- node scripts/pattern-rounds-ablation.mjs --rondas 20 --files experiencia/v7/timing-sample.txt --out experiencia/v7/timing20-rN.jsonl   (N = 1,2)
Salidas: experiencia/v7/.

### Resultado 40 contra 20, calidad, los 2000 casos

| metrica              | valor  |
|----------------------|-------:|
| cases                |   2000 |
| errors               |      0 |
| invalidPlans         |      0 |
| boardsBaseline (40)  |   6927 |
| boards20             |   6928 |
| deltaBoards total    |     +1 |
| boardsRegressions    |      1 |
| boardsImprovements   |      0 |
| boardsEqual          |   1999 |
| diferencias de cantidad de colocaciones | 0 |
| casos con huella (con etiquetas) distinta | 3 |

Master con 20 rondas: activado en 323 casos, ahorro placas en 4 casos, 4 placas en total.
Con 40 rondas el mismo mecanismo ahorra 5. La diferencia neta es exactamente 1 placa.

### Tiempos

Los percentiles de la corrida completa estan CONTAMINADOS por el paralelismo y se registran solo
como referencia de que no deben usarse:

|       | 40r baseline congelada | 20r pasada paralela |
|-------|-----------------------:|--------------------:|
| p50   |                    456 |                 715 |
| p90   |                  12389 |               16666 |
| p95   |                  40435 |               39607 |
| p99   |                  88414 |               98064 |
| max   |                1387932 |              853404 |
| total |               12610797 |            14160131 |

Muestra pareada de 38 casos, 1 proceso, intercalada, minimo de 2 repeticiones por caso y variante:

| grupo                          |  n | deriva | total 40r | total 20r | ahorro crudo | ahorro corregido |
|--------------------------------|---:|-------:|----------:|----------:|-------------:|-----------------:|
| TODOS                          | 38 | x1.079 |    637211 |    488872 |       23.28% |           28.92% |
| EN COTA (control)              | 12 | x0.953 |     40132 |     28713 |       28.50% |           24.90% |
| NO alcanzan lower bound        | 26 | x1.092 |    597079 |    460159 |       22.90% |           29.40% |

Placas en la muestra: 233 con 40 rondas y 233 con 20. 0 regresiones dentro de la muestra.

### Impacto en generarPatrones

| grupo                   | 40r    | 20r crudo | 20r corregido | reduccion corregida |
|-------------------------|-------:|----------:|--------------:|--------------------:|
| TODOS (38 casos)        | 383660 |    218077 |        202044 |              47.3%  |
| NO alcanzan lower bound | 365003 |    209824 |             - |              47.4%  |
| EN COTA                 |  18657 |      8253 |             - |              53.6%  |

La reduccion corregida de 47.3% coincide con la medicion independiente de la curva de saturacion
del pool registrada en "DIAGNOSTICO COLA CARA V10": alli el tiempo acumulado a 20 rondas era el
53.4% del tiempo a 40 rondas.

Proyeccion al holdout completo: generarPatrones es el 51.5% del tiempo del holdout segun el
diagnostico, asi que el ahorro global esperado es 0.515 x 47.3% = 24.4%.

El B&B NO se encarece en agregado al achicar el pool: 17835 -> 16298 ms y 1656074 -> 1396787
nodos en la muestra. Es un efecto local, no sistemico; ver el caso de la regresion mas abajo,
donde si se multiplica.

### Casos que no alcanzan lower bound

320 de 2000 casos. Son los unicos donde Pattern Master se ejecuta de verdad y donde el parametro
puede cambiar algo. En la muestra pareada concentran el 93.7% del tiempo (597079 de 637211 ms) y
dan un ahorro corregido de 29.4%. La unica regresion de placas del holdout esta en este grupo.

### Regresiones

1 regresion: `4058501__Marcos _Cumini Londero4058501.xml`, 8 placas con 40 rondas y 9 con 20.

Reproduccion, maquina en reposo, UN PROCESO POR CORRIDA, 5 repeticiones de cada variante,
intercaladas:

| caso                                | 40 rondas       | 20 rondas       | veredicto |
|-------------------------------------|-----------------|-----------------|-----------|
| 4058501__Marcos _Cumini Londero     | 8,8,8,8,8       | 9,9,9,9,9       | ESTABLE   |
| 4056900__Alfredo_Arrua              | 6,6,6,6,6       | 6,6,6,6,6       | sin diferencia de placas |
| 4059200__ALEJANDRA_RUIZ             | 17,17,17,17,17  | 17,17,17,17,17  | sin diferencia de placas |

10 de 10 corridas separan limpiamente en el caso de la regresion. Clasificacion: ESTABLE, no
intermitente. Es atribuible a `rondasPatrones`.

Separacion de las cuatro dimensiones de calidad pedidas, 40 contra 20:

| caso                            | placas | geometria | solo etiquetas | remanente |
|---------------------------------|--------|-----------|----------------|-----------|
| 4058501__Marcos _Cumini Londero | 8 -> 9 REGRESION | distinta | no | util 84.29% -> 74.93%, sobrante comercial 2.943 -> 7.798 m2, mayor 0.845 -> 3.469 |
| 4056900__Alfredo_Arrua          | 6 -> 6 igual     | distinta | no | util 93.59% -> 93.59%, sobrante 0.000 -> 0.000, cortes 121 -> 120, sierra 117.3 -> 116.2 m |
| 4059200__ALEJANDRA_RUIZ         | 17 -> 17 igual   | distinta | no | util 72.57% -> 72.57%, sobrante comercial 8.036 -> 8.421 m2, mayor 1.210 -> 1.454 |

Ninguno de los tres es una permutacion de etiquetas: los tres son planes realmente distintos.
En 4056900 el plan de 20 rondas es marginalmente mejor (un corte menos). En 4059200 el remanente
comercial de 20 rondas es algo mayor, lo que por el orden de prioridad cuenta como leve mejora.
En 4058501 es peor en todo salvo tiempo.

Mecanismo exacto de la regresion, medido reproduciendo el pool con anotacion de ronda de origen
y corriendo `resolverCobertura` real sobre el:

- V8 produce 9 placas. Con 40 rondas Pattern Master rescata a 8; con 20 rondas no.
- La solucion de 8 placas usa 8 patrones, con rondas de origen 0, 0, 3, 8, 20, 22, 32 y 33.
- 4 de los 8 patrones aparecen en la ronda 20 o despues. La ronda mas tardia usada es la 33.
- El patron decisivo tardio es `700x740 x6 + 999x449 x1 + 799x449 x1`, una placa que agrupa 6 de
  las 10 unidades del tipo 700x740. El greedy de V8 nunca la arma porque coloca por area
  descendente y dispersa esas unidades.
- Control con el pool truncado a 20 rondas (87 patrones): sin mejora sobre el incumbente de 9,
  explorando 396509 nodos. Con el pool de 40 rondas (139 patrones): 8 placas en 36502 nodos.
- Es decir, los patrones adicionales no solo habilitan la solucion: la hacen 10 veces mas barata
  de encontrar, porque mejoran la cota del branch and bound.

### Sensibilidad al reloj

- En las 30 corridas de reproduccion con la maquina en reposo, ningun caso vario de placas entre
  repeticiones de la misma variante. La sensibilidad al reloj registrada en el diagnostico
  aparece bajo carga, no en reposo.
- El caso 4059200__ALEJANDRA_RUIZ4059200.xml, que en el diagnostico habia dado 18 placas en vez
  de 17, en reposo da 17 de forma consistente en las 10 corridas, con las dos variantes.
- Conclusion: la regresion de 4058501 NO es sensibilidad al reloj. Es el parametro.

### Defecto de protocolo detectado y corregido

El primer intento de reproduccion uso `--repeat 5` dentro de un mismo proceso. Las repeticiones
2 a 5 fueron servidas por el cache interno de 50 entradas de optimizeProject, reconocible por
engineCacheHit=true, rondasPatrones=null y tiempos de 6 a 19 ms. Esos datos se descartaron y la
reproduccion se rehizo con UN PROCESO POR CORRIDA, que es la convencion ya fijada en este archivo
para separar baseline de variantes. El script quedo documentado con esa advertencia.

### Hallazgo colateral: placementDigest de scripts/experience-benchmark.mjs

`scripts/experience-benchmark.mjs` invoca `placementDigest(result, true)` y
`placementDigest(result, false)` para producir placementDigest y geometryDigest, pero la funcion
declara un solo parametro y siempre incluye `placement.reference`. Los dos valores son por lo
tanto identicos, y el geometryDigest de ese runner no separa geometria de etiquetas. No se
modifico: queda registrado en PROPUESTAS_NO_IMPLEMENTADAS. La baseline congelada del benchmark
V10 no guardo geometryDigest, asi que la separacion geometria/etiquetas de esta ablacion se
obtuvo re-corriendo los casos con el runner nuevo, que calcula las dos huellas correctamente.

### Decision

Clasificacion: **C - regresion de placas reproducible. Variante rechazada como parametro global.**

`rondasPatrones = 20` produce 1 regresion de placas estable y reproducible sobre 2000 casos. La
regla inviolable del proyecto es 0 regresiones, asi que la variante no se adopta, aunque el
ahorro sea grande.

FASE B (10 rondas) NO se ejecuto, por la regla de la tarea: si 20 rondas ya pierde una placa, 10
solo puede ser igual o peor, y el gate exige detenerse.

Precio medido de esa placa: aproximadamente 24.4% del tiempo total de V10 sobre el holdout.

Matiz importante para la decision futura, no para esta tarea: la regresion NO es un caso limite
de una familia identificable. Es un caso donde el patron decisivo aparecio en la ronda 33 de 40,
por sorteo. `generarPatrones` toma en cada ronda un subconjunto aleatorio de aproximadamente el
55% de las lineas, sin ninguna direccion. Que el patron util salga temprano o tarde es azar. Por
eso no existe una regla estructural del tipo "estos casos necesitan 40 rondas": lo que existe es
una loteria que a veces paga tarde. Sobre 2000 casos hay 1 solo positivo, insuficiente para
ajustar cualquier predictor sin sobreajustar.

### Ninguna modificacion funcional

- No se modifico ningun archivo bajo src/lib/optimizer/legacy/.
- No se modifico src/lib/optimizer/engine/legacy-engine.ts ni ningun default de perfil.
- `rondasPatrones` sigue valiendo 40 en el perfil balanced de produccion.
- No se creo Router, Structural Memory ni Mongo. No se toco Exact Memory ni experienceMemoryEnabled.
- Unico archivo agregado: scripts/pattern-rounds-ablation.mjs, script de ablacion offline que no
  participa de ningun flujo de la aplicacion.
- Salidas de datos bajo experiencia/v7/.

## REGRESIONES DETECTADAS

- Ablacion rondasPatrones=20: 1 regresion de placas sobre 2000 casos.
  4058501__Marcos _Cumini Londero4058501.xml pasa de 8 a 9 placas. Reproducida 5 de 5 veces con
  20 rondas y 5 de 5 veces a 8 placas con 40 rondas, maquina en reposo y un proceso por corrida.
  Clasificacion ESTABLE, atribuible al parametro y no al reloj. Por esta regresion la variante
  queda RECHAZADA y no se ejecuto la variante de 10 rondas.
- Ablacion rondasPatrones=20: 0 errores, 0 planes invalidos, 0 diferencias de cantidad de
  colocaciones sobre 2000 casos. 2 casos mas con huella distinta y mismas placas, auditados: uno
  marginalmente mejor (un corte menos) y otro con remanente comercial algo mayor.
- Ablacion rondasPatrones=20: NO se introdujo ninguna regresion en produccion, porque no se
  modifico ningun default. rondasPatrones sigue en 40 en el perfil balanced.

- Diagnostico cola cara V10: 0 regresiones introducidas. No hubo cambio funcional: la
  instrumentacion vive en un script y solo agrega Date.now() alrededor de las exportaciones
  legacy. Placas identicas al baseline registrado en 213 de 214 casos.
- Diagnostico cola cara V10: 1 caso con placas distintas al baseline registrado,
  4059200__ALEJANDRA_RUIZ4059200.xml, 17 placas antes y 18 ahora. NO es atribuible a la
  instrumentacion: se reprodujo en corrida aislada y su causa es que presupuestoBeamMs y
  msMaster son presupuestos de reloj, asi que el plan depende de cuanto alcanza a explorar la
  maquina. Queda registrado como hallazgo: V10 no es reproducible bit a bit entre corridas.

- Experience memory: 0.
- Etapa 1B: 0 regresiones. No hay cambio de comportamiento en el motor; la capa canonica es offline y no esta conectada a optimizeProject.
- Etapa 2A: 0 regresiones. El fingerprint es una funcion pura offline, no esta conectada a optimizeProject y no modifica canonical-case.ts ni canonical-xml.ts.
- Etapa 3A/4A: 0 regresiones de placas. Sobre 2000 casos de holdout, placas totales 6992 contra 6992, ningun caso con boardsExperience > boardsBaseline, 0 diferencias de cantidad de piezas y 0 hits con disposicion distinta del plan baseline. Con la experiencia deshabilitada el resultado es exactamente el del motor.
- Etapa 3A/4A: 0 entradas invalidas y 0 fallbacks en 2000 casos de holdout y 5000 de train.
- Benchmark V10: 0 regresiones de placas sobre 2000 casos de holdout. Ningun caso con boardsExperience mayor que boardsBaseline; 536 placas contra 536 en los 129 casos medidos; 0 diferencias de cantidad de piezas; 0 planes invalidos; 0 entradas invalidas; 0 fallbacks; 0 errores.
- Benchmark V10: 1 hit con huella de disposicion distinta, auditado y descartado como regresion. Geometria identica, area identica, mismas placas y mismas piezas; la diferencia es una permutacion de etiquetas entre dos referencias de 400x50 intercambiables.
- Test suite general: npm test falla por boundary server-only preexistente/no relacionado con esta etapa. Sigue siendo la misma falla preexistente despues de 1B.
- Benchmark externo contra Lepton: CSVs historicos registran casos worse (+1 placa) en Fast=37, Balanceado=7, V10=10. No son regresiones de experience memory.

## DECISIONES TOMADAS

- No modificar motor legacy ni heuristicas.
- No crear runner de benchmark nuevo en esta etapa porque la primera tarea pide localizar y ejecutar benchmark existente, no implementar infraestructura nueva.
- Usar CSVs historicos como evidencia de benchmark disponible.
- Registrar corpus XML externo como disponible, pero no versionado dentro del repo.
- Registrar que el benchmark HTML actual acepta project XML y saltea Order XML.
- Usar experiencia/ como referencia documental y de evidencia; no importar resultados como decisiones runtime.
- Usar experiencia/v2 como referencia metodologica porque mide train/holdout fuera de aprendizaje.
- Usar experiencia/v3 como referencia experimental para priorizar Exact Memory antes que Structural Rescue.
- Usar experiencia/v4 como referencia para disenar un router offline de tres salidas, no como codigo a integrar automaticamente.
- No extrapolar la simulacion de ahorro 32.8% de sample60 al corpus completo: la muestra esta enriquecida con exact hits.
- No usar structuralFingerprint solo para elegir Rescue; requiere features quantity-aware y fallback baseline.
- No usar la etiqueta hard de v4 como sinonimo de rescue requerido: es reference_panels > area_lower_bound.
- Etapa 1A queda limitada a canonicalizacion desde OptimizationInput; no se declara completa la Etapa 1 hasta cubrir XML project/Order.
- No agrupar piezas duplicadas en esta subetapa: se preserva la definicion del pedido y solo se ordena deterministicamente.
- No incorporar parser XML nuevo en 1A para evitar mezclar modelo canonico con decisiones de extraccion no validadas.
- No ejecutar benchmark completo nuevo en 1A porque no hay cambio runtime ni runner versionado por comando; el benchmark historico queda como baseline congelada.
- Etapa 1B: la extraccion XML vive en src/lib/optimizer/canonical-xml.ts, separada del modelo canonico en canonical-case.ts.
- Etapa 1B: en un XML project los atributos l/w de un <no.N> se interpretan con la transformacion por paridad de layer, nunca como ancho/alto globales directos.
- Etapa 1B: la direccion del nodo raiz se infiere de las coordenadas x/y de los hijos, no comparando root l/w contra panel l/w.
- Etapa 1B: la orientacion de pieza y tablero en project se normaliza a lado mayor x lado menor porque la orientacion colocada es una decision de Lepton.
- Etapa 1B: en Order se conservan L/W tal como los declara la demanda, sin normalizar, porque ahi la orientacion si es un dato del pedido.
- Etapa 1B: Board Grain='0' significa material CON veta y Grain='1' material SIN veta; en Part la convencion es la inversa, Grain='1' respeta la veta.
- Etapa 1B: la ausencia del atributo Grain se representa como unknown y nunca como "sin veta".
- Etapa 1B: rotationAllowed solo se deriva cuando hay veta explicita de material y de pieza; en cualquier otro caso queda null con rotationSource "unknown".
- Etapa 1B: QBoards de Order y la cantidad de paneles de project no se usan; son decisiones de Lepton.
- Etapa 1B: el atributo num del panel si se usa, porque expresa cuantas veces se repite ese patron y por lo tanto la demanda real.
- Etapa 1B: los XML con paneles de medidas o materiales distintos se excluyen del dataset por diseno, porque el optimizador trabaja con un unico formato de tablero por caso.
- Etapa 1B: el refilado se mantiene en 0 y el atributo trim del nodo raiz se guarda solo como referencia en stats, igual que hace el benchmark HTML existente.
- Etapa 1B: no se versiono runner de auditoria; el script vivio en el scratchpad de la sesion y sus resultados quedan registrados aca.
- Etapa 2A: el exact fingerprint vive en src/lib/optimizer/fingerprints.ts; no se modifico canonical-case.ts ni canonical-xml.ts.
- Etapa 2A: hash SHA-256 con node:crypto, misma convencion que optimizationInputHash en engine/legacy-engine.ts; no se agrego ninguna dependencia.
- Etapa 2A: la entrada del hash empieza por la version "experience-exact-v1", asi un cambio de esquema no puede reutilizar hashes viejos.
- Etapa 2A: el fingerprint tiene su propia codificacion estable y no reutiliza serializeCanonicalOptimizationCase, que no esta versionada.
- Etapa 2A: el orden del multiset de piezas se resuelve por code points y no con localeCompare, para no depender del locale ni de ICU.
- Etapa 2A: la veta y la rotacion se codifican con tres estados explicitos; "unknown" nunca equivale a "false".
- Etapa 2A: el fingerprint identifica el problema de optimizacion y no la etiqueta del pedido. Quedan afuera source, reference, description, familia, id de material, grainSource, grainConfidence, rawGrain y rotationSource.
- Etapa 2A: se suman cantidades solo entre lineas que coinciden en TODOS los campos relevantes del problema, nunca solo por ancho/alto. La suma ocurre dentro del fingerprint y no altera el CanonicalOptimizationCase.
- Etapa 2A: la representacion canonica de Etapa 1 se considero determinista y suficiente, asi que no se cambio Etapa 1. El riesgo de localeCompare quedo registrado como propuesta, no como cambio.
- Etapa 2A: no se implemento structuralFingerprint, ratioFingerprint, Experience Store, cache ni hook a optimizeProject.
- Etapa 2A: no se versiono runner de auditoria; el script vivio en el scratchpad de la sesion.

- Etapa 3A/4A: se saltea temporalmente la Etapa 2B por autorizacion explicita, para medir primero si Exact Memory ahorra CPU real con 0 regresiones. Structural Fingerprint queda postergado, no cancelado.
- Etapa 3A: la capa vive aislada en src/lib/optimizer/experience/. No se modificaron canonical-case.ts, canonical-xml.ts ni fingerprints.ts, y no se toco el motor legacy.
- Etapa 3A: la clave del store es exactFingerprint + strategy + profile. Dos estrategias distintas resuelven el mismo problema de forma distinta, asi que no pueden compartir entrada.
- Etapa 3A: una entrada solo se reutiliza si coinciden storeVersion, fingerprintVersion (EXACT_FINGERPRINT_VERSION) y optimizerVersion (LEGACY_OPTIMIZER_VERSION). Si cambia cualquiera es MISS y no hay migracion automatica.
- Etapa 3A: se guarda el plan producido por NUESTRO optimizador. Nunca un plan de Lepton. El XML historico sigue siendo solo definicion del problema.
- Etapa 3A: hay tres implementaciones de la misma interfaz porque tienen usos distintos. La de archivo unico no escala al corpus completo: un plan pesa del orden de 200 KB y miles de entradas superan el tamano maximo de string de V8. Por eso el benchmark usa un store por directorio, con una entrada por archivo y lectura perezosa.
- Etapa 3A: el store por directorio hace que cada hit pague de verdad la lectura y el parseo del plan. Es la medicion conservadora, y es lo que pasaria con un backend real.
- Etapa 3A: freezeExperienceStore marca el store como readonly, y con un store readonly la capa no reporta que aprendio. Sin eso, un holdout congelado informaba recorded=true sin haber guardado nada.
- Etapa 4A: optimizeProjectWithExperience envuelve a optimizeProject en vez de modificarlo. Con enabled=false devuelve exactamente el resultado del motor y no consulta ni escribe el store.
- Etapa 4A: un hit nunca se acepta por fingerprint solo. Se revalida contra el input actual y despues se corren los validadores existentes del proyecto sobre el plan remapeado, no sobre el plan guardado.
- Etapa 4A: la revalidacion reutiliza validarPlanIndustrial de legacy/v10.cjs y validateIndependentSlices; no se escribio un validador nuevo.
- Etapa 4A: las comprobaciones de tablero, kerf y restricciones son defensa en profundidad contra un store editado o corrupto, aunque el fingerprint ya las distinga.
- Etapa 4A: el remapeo de etiquetas se hace por clave de equivalencia de pieza (exactPieceKey), no por posicion ni por nombre. Si el pedido tiene una referencia repetida entre piezas no equivalentes, buildPieceKeys devuelve null, el plan no se guarda y por lo tanto nunca se puede remapear mal.
- Etapa 4A: el remapeo alcanza tambien al plan legacy raw y a su arbol de corte, porque generateMachineXml lee de ahi; si no, el XML de maquina saldria con los codigos del pedido historico.
- Etapa 4A: no se agrego reference ni description al exact fingerprint para evitar el remapeo. El fingerprint sigue identificando el problema, no la etiqueta.
- Etapa 4A: una entrada invalida se cuenta como invalidCacheEntry, dispara fallback al motor y nunca devuelve error al usuario.
- Etapa 4A: el plan se clona antes de devolverse, para que quien lo reciba no pueda mutar el store.
- Etapa 4A: experienceMemoryEnabled sigue en false y nada se conecto al flujo de produccion. El uso de esta etapa es un runner offline.
- Benchmark 4A: se versiono scripts/experience-benchmark.mjs, resolviendo la propuesta "Runner reproducible de benchmark XML" para el caso de Exact Memory. Bundlea el optimizador TypeScript con esbuild y fija import.meta.url a un modulo real del repo para que los require de legacy/*.cjs sigan resolviendo.
- Benchmark 4A: baseline y experience se corren en PROCESOS SEPARADOS. optimizeProject tiene un cache interno de 50 entradas por proceso, y correr los dos caminos en el mismo proceso contaminaria la comparacion.
- Benchmark 4A: cada modo se corre dos veces alternando el orden, y el reporte toma por caso el MENOR totalMs de su modo. El ruido entre procesos medido en el piloto era del mismo orden que el ahorro buscado, asi que una sola corrida por modo no alcanzaba para concluir nada.
- Benchmark 4A: el orden del corpus es el numero de pedido embebido en el nombre del archivo, declarado explicitamente como PROXY de orden temporal porque no hay fecha real confiable. El split se aplica sobre casos canonicos, no sobre archivos: un XML corrupto o excluido por stock mixto no consume cupo.
- Benchmark 4A: el HOLDOUT corre contra un store congelado y no puede poblar la memoria antes de ser evaluado.
- Benchmark 4A: el adaptador benchmarkInputFromCanonicalCase colapsa la veta unknown en false, porque OptimizationInput no tiene un tercer estado. Es correcto -- es exactamente lo que resuelve el motor -- pero hace que dentro del benchmark la clase de equivalencia sea algo mas gruesa que la del fingerprint sobre casos canonicos de Etapa 2A.
- Benchmark 4A: el adaptador es solo para el benchmark offline; no participa del flujo real y replica los defaults de produccion de buildOptimizationInputFromProject.

- Benchmark V10: se corrio la misma arquitectura de Exact Memory sin cambiarla. No se creo otra memoria, no se tocaron fingerprints, validadores ni motor. Los unicos archivos modificados fueron scripts/experience-benchmark.mjs y este archivo.
- Benchmark V10: la clave del store separa estrategia y perfil, asi que las entradas de Fast no se reutilizan como V10. El store de V10 vive en un directorio propio.
- Benchmark V10: el TRAIN se ejecuto sobre 28 casos en vez de 5000 porque el exact fingerprint no depende de la estrategia, asi que el conjunto de entradas que el holdout puede consultar es identico. Verificado empiricamente: 29 hits, los mismos que en Fast.
- Benchmark V10: el EXPERIENCE se ejecuto sobre 129 casos (29 hits mas 100 misses estratificados) en vez de 2000, porque un miss recorre el mismo camino del motor que el baseline. Verificado: placas y disposicion identicas en los 100 misses medidos.
- Benchmark V10: por lo anterior globalExperienceMs es derivado y esta marcado como tal en la salida y en el informe. No se presenta como una corrida experience completa.
- Benchmark V10: una sola corrida por modo. La repeticion alternada de Fast existia porque el ahorro era del orden del ruido entre procesos; en V10 el ahorro por hit es de segundos contra milisegundos y no necesita esa proteccion.
- Benchmark V10: se agrego checkpoint incremental al runner despues de perder 1250 casos de una corrida de casi dos horas que fue interrumpida. Cada caso se persiste apenas termina y la corrida reanuda donde quedo.
- Benchmark V10: qualityRegressions dejo de contar diferencias de etiqueta. Una permutacion de etiquetas entre piezas indistinguibles no cambia placas, piezas ni cortes. Se agrego geometryDigest para comparar solo la geometria y se informa placementDifferences por separado.
- Benchmark V10: no se implemento MongoDB ni ningun backend remoto, no se agrego driver ni dependencia y no se cambio configuracion. Queda registrado solo como propuesta.

- Diagnostico 2026-09-04: se cierra temporalmente la rama de Exact Memory y el trabajo vuelve al
  motor. No se continua con Experience Memory, Structural Fingerprint, Router ni Mongo.
- Diagnostico 2026-09-04: la primera tarea del motor es medir, no mejorar. No se implemento
  ninguna de las 3 oportunidades detectadas.
- Diagnostico 2026-09-04: la instrumentacion fina de Pattern Master se resolvio SIN modificar
  legacy. El punto minimo y seguro es el limite de modulo: envolver las exportaciones de los
  .cjs desde el script, antes de que v10.cjs las capture por destructuring. Los envoltorios solo
  agregan Date.now() y devuelven el mismo valor.
- Diagnostico 2026-09-04: los ms absolutos de la corrida de diagnostico NO se usan para atribuir
  tiempo, porque la maquina estaba en uso y el ultimo lote corrio a 1.92x. Se usa la proporcion
  por etapa medida en cada caso aplicada al ms de baseline de ese mismo caso, y se verifico que
  esa proporcion es estable entre el lote limpio y el cargado.
- Diagnostico 2026-09-04: se corrieron 48 de los 214 casos con dos procesos en paralelo para
  acortar el reloj. Se acepto porque el informe usa proporciones y no ms absolutos, y porque
  todas las etapas de un caso comparten proceso y contencion. Se registra el lote de origen.
- Diagnostico 2026-09-04: se probo y se DESCARTO reforzar la cota inferior con un conteo de
  piezas por placa por tipo calculado por grilla. No es admisible: en 9 de 2000 casos supera las
  placas realmente alcanzadas. No se propone como oportunidad.
- Diagnostico 2026-09-04: no se propone cortar generarPatrones por saturacion del pool, porque
  se midio que el pool no se satura: en 11 de 12 casos la ronda 39 todavia aporta patrones nuevos.

- Ablacion 2026-09-04: rondasPatrones=20 queda RECHAZADA como parametro global por 1 regresion de
  placas estable. La regla de 0 regresiones se aplica aunque el ahorro sea del 24.4%.
- Ablacion 2026-09-04: no se ejecuto la variante de 10 rondas. El gate exige detenerse cuando 20
  produce una regresion reproducible, y 10 solo puede ser igual o peor.
- Ablacion 2026-09-04: la calidad se midio sobre los 2000 casos en 2 procesos paralelos y el
  tiempo sobre una muestra pareada de 38 casos en 1 solo proceso. Las placas son casi insensibles
  a la carga; los ms no. Los ms de la pasada paralela estan marcados como no utilizables.
- Ablacion 2026-09-04: el ahorro se corrige por deriva de maquina usando como normalizador las
  cuatro etapas que el parametro no puede afectar (V8, compactacion, MultiSlice, patronesMonotipo).
  Sin esa correccion el numero es inservible: en la pasada paralela esas etapas inmunes mostraron
  -59.70% de "ahorro", que es contencion pura.
- Ablacion 2026-09-04: las repeticiones de un mismo caso deben correrse en procesos separados. El
  cache interno de 50 entradas de optimizeProject sirve la segunda corrida sin ejecutar el motor.
  El primer intento de reproduccion quedo invalidado por eso y se rehizo.
- Ablacion 2026-09-04: no se modifico ningun default. rondasPatrones sigue en 40 en balanced.

## HALLAZGOS ETAPAS 3A Y 4A

- El mecanismo de Exact Memory es seguro en los datos medidos: 0 regresiones de placas, 0 entradas invalidas, 0 fallbacks y 0 hits con plan invalido, sobre 2000 casos de holdout y 5000 de train.
- Un hit devuelve exactamente el mismo plano que el motor. La huella de colocaciones (placa, x, y, ancho, alto, referencia) coincide en los 29 hits del holdout, asi que el remapeo de etiquetas es fiel y no altera geometria.
- El costo de la capa es despreciable frente al motor: 0.404 ms de fingerprint y 0.190 ms de lookup, contra una mediana de 22 ms de motor. Sobre un hit, deserializar el plan (3.3 ms) cuesta mas que validarlo (0.43 ms).
- Sobre los casos con hit el ahorro es 94.19% en holdout y 90.7% en train. Sobre casos caros el speedup mediano es 26.8x y el maximo medido 77x.
- El limite no es el costo de la capa sino la tasa de aciertos. Con memoria congelada en una frontera temporal unica el hit rate es 1.45%, y con eso el ahorro global (-0.41% medido) no supera el ruido entre procesos, que va de 9.8% a 18.2%.
- La diferencia entre 8.44% de duplicados en todo el corpus (Etapa 2A) y 1.45% de hits en holdout congelado se explica por la estructura de los duplicados: son re-pedidos del mismo cliente con numeracion consecutiva, asi que casi todos los pares caen del mismo lado del corte temporal. El holdout congelado solo captura los pares que cruzan la frontera.
- Con memoria que aprende sobre la marcha, la misma capa da 9.04% de hit rate y 4.71% de reduccion de CPU sobre 5000 casos. Es la configuracion que se parece a produccion, pero NO es una medicion fuera de aprendizaje y no debe presentarse como tal.
- El ruido entre procesos obliga a repetir corridas. En el piloto una sola corrida por modo mostraba a experience 22% mas lenta que baseline por razones ajenas a la capa; con dos corridas por modo y minimo por caso, la diferencia cae a -0.41%.
- Exact Memory no ataca todavia la cola cara. El caso mas lento del holdout tarda 38.8 s y no tiene hit; solo hubo 2 hits por encima de 500 ms y ninguno por encima de 1000 ms. La memoria exacta ayuda cuando el pedido exacto se repite, no cuando el pedido es dificil.
- El motor ya tiene un cache interno de 50 entradas por proceso, indexado por hash del input completo. Se activo 82 veces en los 2000 casos del holdout, identico en ambos caminos. Exact Memory y ese cache se solapan parcialmente y todavia nadie decidio como conviven.
- buildPieceKeys rechazo 4 casos de 5000 por tener una referencia repetida entre piezas no equivalentes. Esos casos no se guardan, asi que la ambiguedad de remapeo nunca llega a producirse.
- El adaptador del benchmark colapsa la veta unknown en false porque OptimizationInput no tiene un tercer estado. Dentro del benchmark, entonces, la clase de equivalencia del fingerprint es algo mas gruesa que la medida en Etapa 2A sobre casos canonicos. Es correcto porque es lo que realmente resuelve el motor, pero hay que tenerlo presente al comparar los dos numeros.
- Guardar planes completos es caro en disco: una entrada pesa del orden de 200 KB y el store del train ocupa 4544 entradas. Cualquier backend real necesita politica de retencion.

## HALLAZGOS BENCHMARK V10

- El hit rate no depende de la estrategia: el exact fingerprint se calcula sobre el caso canonico, que no incluye estrategia ni perfil. Fast y V10 dan los mismos 29 hits sobre 2000. Lo que cambia no es cuantas veces acierta la memoria sino cuanto vale cada acierto.
- El mismo 1.45% de aciertos ahorra 3.10 s en Fast y 205.44 s en V10. El valor de Exact Memory es proporcional al costo de la estrategia que evita.
- El ahorro esta concentrado: los 14 hits que superan 500 ms aportan el 98.6% del ahorro total. Los otros 15 hits son practicamente irrelevantes.
- El speedup maximo medido es 2300x: un pedido de 20 placas que el motor resuelve en 58.5 s y la memoria devuelve revalidado en 25 ms.
- La economia de la capa es fuertemente asimetrica. Cuesta 0.819 ms por miss, o sea 1.61 s en los 1971 misses, contra 205.44 s ahorrados: relacion 127 a 1. El riesgo de tenerla encendida es despreciable frente a su beneficio.
- El costo dominante de un hit no es validar sino leer: lookup avg 17.98 ms y deserializacion 4.33 ms, contra validacion 0.55 ms. La revalidacion completa, que es lo que da seguridad, es la parte mas barata del camino.
- V10 tiene una cola mucho mas larga de lo que sugerian los CSVs historicos: p95 40.2 s, p99 88.2 s y un caso de 23.1 minutos. La media de 6.3 s no describe el problema.
- El 98.35% del tiempo del holdout esta en casos sin hit, y el 28.50% en apenas 20 pedidos sobre 2000. Exact Memory, por definicion, no puede tocar nada de eso.
- Ese 28.50% concentrado en 20 casos es el argumento cuantitativo para evaluar Structural/Router/Rescue: no hace falta mejorar el promedio, hace falta atacar una cola muy chica y muy cara.
- Los casos mas caros sin hit no son todos enormes: hay pedidos de 65 a 150 piezas que tardan mas de 90 s. El tamano del pedido no predice bien el costo, asi que un router necesitaria features mas finas que la cantidad de piezas.
- Un plan reutilizado puede asignar etiquetas distintas a piezas indistinguibles sin cambiar un solo corte. Aparecio en 1 de 29 hits en V10 y en 0 de 29 en Fast. No es una regresion, pero hay que medirlo con una huella geometrica para no confundirlo con una.

## HALLAZGOS DIAGNOSTICO COLA CARA V10

- El separador del costo no es estructural sino binario: alcanzar o no la cota inferior por area.
  1680 casos la alcanzan y consumen el 12.4% del tiempo; 320 no la alcanzan y consumen el 87.6%.
  optimizarV10 retorna temprano cuando la alcanza, asi que ahi no corren MultiSlice, OneBoard ni master.
- generarPatrones es el cuello de botella, confirmando la hipotesis historica: 71.9% del tiempo de
  la cola cara, 95.4% del tiempo de Pattern Master y 51.5% del holdout completo como piso medido.
- Pattern Master casi no compra placas: 129 activaciones, 1 placa ahorrada. materializar se ejecuto
  en 1 de 129 casos, porque en los otros 128 el B&B nunca supero el incumbente.
- El solver NO es el problema. resolverCobertura es el 2.8% de la cola cara. Agota msMaster=8000 en
  35 de 129 casos, pero su costo esta acotado por ese presupuesto y es dos ordenes de magnitud menor
  que generarPatrones.
- En 208 de 214 casos el baseline V8 ya habia producido el plan final. El 90.2% del tiempo medido se
  fue en rescates que no ahorraron una sola placa.
- Las 24 "ganancias" de compactacion con 1 sola placa ahorrada no son un error: probar() se llama con
  permitirMismas=true, asi que compactacion acepta candidatos con las mismas placas cuando mejoran el
  remanente. Su aporte es calidad de remanente, no cantidad de placas. En la banda en cota es el 30.1%
  del tiempo.
- OneBoard nunca se activo en los 214 casos, porque exige cota === 1.
- La cantidad de piezas no predice el costo por un motivo concreto: armarPlacas saltea Beam Search
  cuando piezas.length > maxPiezasBeam = 120. El costo por pieza sube hasta la banda 100-120 (635 ms
  por pieza) y despues se derrumba (501, 358, 224, 186). Un pedido de 110 piezas trabaja mas que uno
  de 200.
- La familia dominante en tiempo no es la de los pedidos grandes. Es F1: 222 casos con mediana de 36
  piezas y 13 tipos, a una sola placa de la cota, 41.6% del tiempo del holdout, 23.6 s de promedio.
- Los presupuestos del motor son locales y se multiplican. Un caso caro hace del orden de 80 llamadas
  a optimizar y cada una recorre 12 armarPlacas, cada uno con presupuestoBeamMs = 1500 ms. No hay
  ningun techo agregado por caso, y el peor caso real tarda 21 minutos.
- V10 no es reproducible bit a bit entre corridas ni entre maquinas, porque presupuestoBeamMs y
  msMaster son presupuestos de reloj. Medido: 1 caso sobre 214 cambio de 17 a 18 placas con el mismo
  codigo. Esto afecta a cualquier verificacion futura de "0 regresiones" hecha por re-ejecucion.
- El pool de patrones no se satura: en 11 de 12 casos la ronda 39 todavia aporta patrones nuevos y el
  pool crece casi linealmente (64.2 patrones a las 10 rondas, 120.2 a las 20, 232.1 a las 40). No hay
  un corte gratis por saturacion.
- Exact Memory sigue sin poder tocar nada de esto: ninguno de los 128 casos de la cola cara tuvo hit.

## HALLAZGOS ABLACION RONDAS PATTERN MASTER

- Bajar rondasPatrones de 40 a 20 reduce generarPatrones un 47.3% corregido por deriva, y proyecta
  un 24.4% del tiempo total de V10 sobre el holdout. El numero coincide con la curva de saturacion
  del pool medida por separado en el diagnostico (53.4% del tiempo a 20 rondas).
- El precio de ese 24.4% es exactamente 1 placa sobre 6927. No es aceptable bajo la regla vigente,
  pero es el numero que hay que tener a la vista para cualquier decision futura.
- Pattern Master decide muy poco: con 20 rondas se activa en 323 casos y ahorra placas en 4. Con
  40 ahorra 5. Todo el debate sobre rondasPatrones se juega sobre 5 placas en 2000 pedidos.
- La regresion no responde a ninguna familia estructural. El patron decisivo aparecio en la ronda
  33 de 40, y generarPatrones sortea en cada ronda un subconjunto aleatorio de ~55% de las lineas
  sin ninguna direccion. Que el patron util salga temprano o tarde es azar, no estructura.
- Con 1 solo caso positivo sobre 2000 no se puede construir un predictor de "cuando hacen falta 40
  rondas" sin sobreajustar. Para intentarlo habria que generar positivos corriendo el corpus
  completo de 8669 XML a 40 y a 20, no solo el holdout.
- Los casos donde el pool SI decide tienen un perfil contraintuitivo: piezas GRANDES y muy
  REPETIDAS, no piezas chicas. En 4 de los 5 casos donde master gano, thinRatio es 0.00, con
  repeticion maxima de 14 a 30. El caso de la regresion tiene thinRatio 0.00 y su patron decisivo
  agrupa 6 unidades de un mismo tipo de 700x740 en una sola placa. Pattern Master solo puede ganar
  cuando hay pocos tipos y muchas repeticiones, porque ahi el espacio de combinaciones de placa es
  chico y la eleccion global importa.
- Un pool mas grande no solo habilita mejores soluciones: las hace mas baratas de encontrar. En el
  caso de la regresion, el B&B resuelve con 139 patrones en 36502 nodos y con 87 patrones no
  encuentra nada en 396509 nodos. La cota del branch and bound poda mucho mejor con mas patrones.
  En agregado, sin embargo, el solver no se encarece al achicar el pool.
- El motor no es sensible al reloj en reposo: en 30 corridas de reproduccion ningun caso vario de
  placas entre repeticiones de la misma variante. La variacion registrada en el diagnostico
  aparece bajo carga.

## HALLAZGOS ETAPA 2A

- El exact fingerprint identifica el problema de optimizacion, no la etiqueta del pedido. Excluye source, reference, description, familia, id de material y la procedencia de la veta (grainSource, grainConfidence, rawGrain, rotationSource). Incluye tablero, refilado, kerf, material, veta del material, restricciones y, por pieza, dimensiones, cantidad, veta, rotacion, cantos y tipo de canto.
- Excluir las etiquetas aporta valor medible pero acotado: 14 recomputaciones evitables adicionales sobre 730, es decir un 1.9% mas que la variante estricta. Es un ajuste chico, no un cambio de orden de magnitud.
- Excluir source no produce ninguna colision entre project y Order: 0 grupos mezclados sobre 529. El motivo es que todo project queda con veta unknown y todo Order con veta true/false, asi que nunca pueden ser el mismo problema con la informacion disponible hoy.
- Sumar cantidades entre lineas identicas es necesario para que el fingerprint sea identidad del problema: un pedido con dos lineas de 2 y 3 unidades identicas en todos los campos relevantes es el mismo problema que un pedido con una linea de 5. Hay un test que lo fija y otro que verifica que no se suman lineas que difieren en una restriccion.
- Los grupos duplicados del corpus son claramente re-pedidos del mismo cliente con numeracion consecutiva: Adrian_Blencio4087463 y 4087464, papanoel2905-ml, mirabilecontacto, Martin_Quiroga, ruben_gualtieri_59. Es el patron que Exact Memory deberia capturar.
- El grupo mas grande tiene 21 casos y es un pedido chico y repetido: 8 tipos, 18 piezas, 2750x1830.
- La distribucion es de cola larga: 7391 de 7920 grupos tienen un solo caso, y solo 8 grupos superan los 6 casos.
- canonical-case.ts ordena las piezas con localeCompare, que depende del locale y de la build de ICU del runtime. Verificado en esta maquina (locale es-AR, ICU 77.1): para las claves serializadas de dos piezas, localeCompare devuelve -1 donde la comparacion por code points devuelve lo contrario. El exact fingerprint NO se ve afectado porque reordena internamente por code points, pero serializeCanonicalOptimizationCase si podria variar entre maquinas. Registrado en PROPUESTAS_NO_IMPLEMENTADAS.

## HALLAZGOS ETAPA 1B

Hechos medidos sobre D:\proyectos asistidos\lepton\data\lepton-xml, solo con el parser.

- En un XML project los atributos l/w de un <no.N> estan expresados sobre el eje de corte de ese nodo, no en ancho/alto global. La transformacion es l = dir==="x" ? anchoGlobal : altoGlobal, y la direccion alterna por layer.
- La transformacion se deriva del codigo propio: legacy/xml-exporter.cjs dimsNodoXml define la escritura y legacy/motor.cjs alterna dirHijo en cada nivel del arbol.
- Verificacion sobre 1500 XML project, 4527 paneles y 82444 relaciones padre/hijo, usando el invariante "el hijo mide exactamente part.cut sobre el eje de corte del padre": la transformacion por paridad de layer acierta 82444/82444 (100%); leer width=l y height=w directamente acierta 41485/82444 (50.3%).
- Confirmado entonces que interpretar width = node.l es incorrecto en aproximadamente la mitad de los nodos.
- La direccion del nodo raiz NO se puede inferir comparando root l/w contra panel l/w: panel l/w nombra el mismo rectangulo que el nodo raiz pero no siempre en orden ancho/alto global. Sobre 2427 paneles reales esa inferencia produce cajas fuera del tablero en 1198 paneles (49.4%).
- Inferir la direccion del raiz desde las coordenadas x/y de los hijos encaja en 2366/2366 paneles resolubles, con 0 conflictos internos, y discrepa de la inferencia por panel en 1253 paneles (53%).
- La orientacion global no es estable ni dentro de un mismo archivo. En 4015522__Cristian_Quinteros4015522.xml los paneles 1, 2, 3 y 5 expresan el tablero como 2600x1830 y el panel 4 lo expresa transpuesto como 1830x2600. La misma pieza fisica aparecia con dos orientaciones distintas segun el panel.
- Consecuencia: la orientacion colocada es una decision de Lepton y no puede ser la dimension canonica. Por eso la pieza y el tablero de project se normalizan a lado mayor x lado menor.
- Consecuencia secundaria: una vez normalizada la orientacion, el caso canonico de project es invariante a la transformacion por layer. La transformacion se conserva porque es la que permite validar geometricamente el archivo y detectar piezas fuera del tablero, y porque seria necesaria si alguna vez se quisiera reutilizar la ubicacion.
- El atributo num del panel es mayor a 1 en 78 de 1582 paneles medidos, con valores de hasta 60. Ignorarlo subestimaria la demanda. El benchmark HTML existente no lo aplica.
- El atributo num de <part> es 1 en los 82444 casos medidos.
- Los XML project usan comillas dobles en los atributos y los XML Order usan comillas simples. El parser acepta ambos y hay un test que lo fija.
- Ningun Order del corpus declara kerf: los 1345 casos Order usan el default 4.5 y quedan marcados con kerfSource "default".
- Los project si declaran saw en los 1582 paneles medidos.
- Semantica de veta en Order, verificada por correlacion con el nombre del material sobre 500 archivos: Board Grain='0' aparece en decorados direccionales como OLMO FINLANDES, HELSINKI, CEDRO y CAMELIA, y Board Grain='1' en lisos como Blanco, Bianco y Gris Sombra. Es decir Grain='0' significa material CON veta.
- En Part la convencion no esta invertida: Grain='1' aparece sobre todo en tableros con veta (1224 de 1370) y Grain='0' sobre todo en tableros sin veta (4850 de 4983).
- Los XML project no declaran veta en ningun lado: los 7305 casos project quedan con hasGrain null y grainSource unknown.
- Todos los Order del corpus tienen exactamente un WorkList y un unico formato de tablero; los multiples Job son programas de corte de Lepton sobre el mismo stock, no materiales distintos.

## HIPÓTESIS

- La primera reduccion de tiempo probablemente vendra de evitar trabajo repetido en Pattern Master/generarPatrones y de routear estrategias, pero aun no esta medido con dataset canonico actual.
- exact hits podrian ser de bajo riesgo si se validan contra input canonico y validadores actuales.
- La memoria estructural debe empezar como priorizacion/warm-start, no como devolucion directa de solucion.
- La referencia experiencia/ sugiere que exact hit puede ahorrar computo real en pedidos repetidos: 2234 recomputaciones evitables sobre 20844 casos canonicos en ese dataset independiente.
- La referencia experiencia/ sugiere que structural memory debe ser conservadora: 78 de 200 candidatos estructurales leidos no son consistentes en placas de referencia.
- La veta/material requiere una politica explicita: Order trae senal XML directa; project puede requerir inferencia por material, pero los casos de baja confianza no deben cachear orientacion automaticamente.
- La referencia experiencia/v2 sugiere que exact memory conserva valor fuera de aprendizaje: 96 exact hits sobre 2000 holdout luego de aprender 5000 casos.
- La referencia experiencia/v2 sugiere que structural fingerprint puede servir como predictor de dificultad: accuracy 97.22% y precision 100% para pred_hard=true sobre 108 structural hits.
- La referencia experiencia/v2 no demuestra todavia que estrategia de rescue conviene: 16/16 V10 completos sobre familias dificiles terminaron en timeout de 3s.
- La referencia experiencia/v3 refuerza Exact Memory: dos casos caros pasaron de 3416 ms y 3262 ms de optimizacion fuente a 1 ms de revalidacion local, con 0 regresiones en la demo.
- La referencia experiencia/v3 muestra que multislice/master no deben promoverse por structural-only sin mas features: en dos familias dificiles, multislice no mejoro placas o hizo timeout, y master hizo timeout.
- La referencia experiencia/v4 sugiere que un router advisory puede aislar candidatos costosos: 184 EARLY_RESCUE_CANDIDATE de 2000 holdout, con precision 71.20% y recall 40.31% sobre no-exactos.
- La referencia experiencia/v4 tambien muestra que el arbol deja 194 hard cases en FAST_BASELINE; por eso no puede bloquear fallback ni reemplazar benchmark de estrategias.

## PROPUESTAS_NO_IMPLEMENTADAS

### Runner reproducible de benchmark XML

Estado: RESUELTO PARCIALMENTE en Etapa 4A con scripts/experience-benchmark.mjs, que corre el corpus por comando contra NUESTRO optimizador. Lo que sigue sin portar es la comparacion contra las placas de referencia de Lepton que hace el benchmark HTML.

Problema detectado: el benchmark completo vive como flujo interactivo en HTML y los CSVs historicos estan versionados. El corpus XML ahora esta ubicado fuera del repo en D:\proyectos asistidos\lepton\data\lepton-xml, pero no hay runner versionado para repetir la corrida completa por comando.
Cambio sugerido: portar estrictamente la extraccion de `extraerCasoProjectBenchmark` a un script Node de benchmark, sin cambiar heuristicas.
Beneficio esperado: re-ejecutar baseline completa con comando versionado y medir nuevas etapas contra el mismo corpus.
Riesgo: diferencias de parser DOM/browser vs Node si se reimplementa sin cuidado.
Archivos involucrados: nuevo script bajo scripts/, posible test bajo tests/optimizer/, EXPERIENCE_OPTIMIZER_TRUTH.md.

### Ablacion de rondasPatrones

Problema detectado: generarPatrones ejecuta 40 optimizaciones completas por caso y explica el 51.5%
del tiempo del holdout, con 1 sola placa ahorrada por master en 129 activaciones. El pool no se
satura, asi que el unico ahorro posible es reducir rondas.
Cambio sugerido: NO cambiar codigo todavia. Correr el holdout de 2000 casos con rondasPatrones en 10
y en 20, comparando placas caso por caso contra la baseline congelada. rondasPatrones ya es un
parametro de perfil en profileOptions de legacy-engine.ts, asi que la ablacion no toca algoritmos.
Beneficio esperado: si 20 rondas da 0 regresiones, el ahorro es del orden del 47% del tiempo de
generarPatrones.
Riesgo: reducir el pool puede cambiar el resultado del B&B en casos no medidos. Por eso primero la
ablacion, no el cambio.
Estado: NO IMPLEMENTADA. Es la Oportunidad 1 del diagnostico.
Archivos involucrados: scripts/experience-benchmark.mjs o un runner de ablacion, EXPERIENCE_OPTIMIZER_TRUTH.md.

### Ablacion de MultiSlice

Problema detectado: MultiSlice corre en los 320 casos fuera de cota y aporto 4 placas en 214 casos, a
681576 ms por placa en la cola cara. Es el 11.3% del holdout.
Cambio sugerido: correr el holdout con constraints.allowMultiSlice en false y contar exactamente
cuantas placas se pierden y cuanto tiempo se ahorra. Es un flag existente; no toca codigo.
Beneficio esperado: un numero duro de placas contra ms para decidir entre apagarlo, acotarlo por
tiempo o dejarlo.
Riesgo: bajo para medir. Medio para apagarlo, porque es el rescate que mas placas gano.
Estado: NO IMPLEMENTADA. Es la Oportunidad 2 del diagnostico.
Archivos involucrados: runner de ablacion, EXPERIENCE_OPTIMIZER_TRUTH.md.

### Presupuesto agregado por caso en optimizarV10

Problema detectado: presupuestoBeamMs y msMaster son techos locales que se multiplican. Un caso caro
hace del orden de 80 llamadas a optimizar, cada una con 12 armarPlacas de hasta 1500 ms. No hay tope
por caso y el peor pedido tarda 21 minutos.
Cambio sugerido: un presupuestoTotalMs por caso que, al agotarse, devuelva el mejor plan validado.
Como V10 solo reemplaza el baseline con candidatos que pasan validarPlanIndustrial y usan menos
placas, cortar por tiempo no puede devolver algo peor que V8.
Beneficio esperado: acotar p95 y p99 sin tocar el 84% de los casos, que ya terminan bajo 5 s.
Riesgo: bajo en calidad, piso V8. Pero hace explicita una dependencia del reloj que ya existe y ya se
manifesto (1 caso cambio de 17 a 18 placas entre corridas). Es el unico de los tres que exige tocar
v10.cjs.
Estado: NO IMPLEMENTADA. Es la Oportunidad 3 del diagnostico.
Archivos involucrados: src/lib/optimizer/legacy/v10.cjs, scripts/extract-legacy-optimizer.mjs.

### Cota inferior reforzada por piezas por placa - DESCARTADA

Problema detectado: la cota inferior por area ignora la geometria, y 320 casos que no la alcanzan
consumen el 87.6% del tiempo. Se evaluo reforzarla con max(cotaArea, ceil(cantidad_i / piezasPorPlaca_i)).
Resultado: DESCARTADA por no ser admisible. Medido sobre los 2000 casos del holdout, la cota candidata
supera las placas realmente alcanzadas en 9 casos, o sea habria cortado la busqueda antes de tiempo y
degradado el resultado. Ademas solo habria gateado 24 casos y el 1.8% del holdout.
Conclusion: el conteo por grilla de piezas por placa NO es una cota inferior valida para corte
guillotina. Si alguna vez se retoma, hay que demostrar la admisibilidad antes de usarla como compuerta.
Archivos involucrados: ninguno. No se implemento.

### Generacion dirigida de patrones en Pattern Master

Problema detectado: generarPatrones sortea en cada ronda un subconjunto aleatorio de ~55% de las
lineas, sin ninguna direccion. En el unico caso donde bajar de 40 a 20 rondas costo una placa, el
patron decisivo aparecio recien en la ronda 33, y agrupaba 6 unidades de un mismo tipo repetido.
Un generador que buscara deliberadamente agrupar tipos de alta repeticion habria encontrado ese
patron en la ronda 1.
Cambio sugerido: NO implementar todavia. Primero medir, offline, cuantos de los patrones que las
soluciones ganadoras efectivamente usan son de alta repeticion monotipo o casi monotipo, sobre un
conjunto de casos donde master gane. Si la proporcion es alta, evaluar sembrar el pool con esos
patrones antes de las rondas aleatorias.
Beneficio esperado: encontrar los patrones utiles con muchas menos rondas, o sea el ahorro de
tiempo sin la regresion de placas.
Riesgo: es un cambio de heuristica dentro de Pattern Master, no un parametro. Requiere autorizacion
explicita y un holdout completo con 0 regresiones.
Estado: NO IMPLEMENTADA. Requiere antes generar mas casos positivos: con 5 victorias de master en
2000 casos no alcanza para validar nada.
Archivos involucrados: src/lib/optimizer/legacy/patrones.cjs, scripts/extract-legacy-optimizer.mjs.

### Cota inferior que contemple el kerf

Problema detectado: la cota inferior por area se calcula con dimensiones crudas. v10.cjs:154 suma
`l.cant * l.base * l.altura` y medidaCorte (motor.cjs:15) no agrega el kerf, solo resta canto
cuando descontarCanto esta activo, que en produccion es false. La cota asume por lo tanto una
sierra de espesor cero y es sistematicamente inalcanzable en cuanto el kerf supera la holgura.
Medido en 4048571__JORGE_Tortoroglio4048571.xml: area de piezas 107.427 placas, cota 108, holgura
0.53%, pero la sierra sola consume 10467567 mm2 = 2.22 placas, o sea el 2.06% del area de 108
placas. Piezas mas sierra dan 109.65 placas: el minimo realista es 110, no 108. V10 alcanzo 112 y
gasto 21 minutos persiguiendo un numero que no existe.
Cambio sugerido: NO implementar todavia. Estudiar si existe una cota inferior valida que incorpore
el kerf, y demostrar su admisibilidad antes de usarla como compuerta. Recordar que ya se probo y
se descarto una cota por conteo de piezas por placa por no ser admisible.
Beneficio esperado: convertir "no alcance la cota" en una senal real. Hoy los 320 casos fuera de
cota consumen el 87.6% del tiempo y en la enorme mayoria la cota nunca fue alcanzable.
Riesgo: una cota mal formulada corta busquedas que si podian mejorar. Es el riesgo mas serio de
todo lo propuesto y exige demostracion formal, no evidencia empirica.
Estado: NO IMPLEMENTADA.
Archivos involucrados: src/lib/optimizer/legacy/v10.cjs, src/lib/optimizer/legacy/motor.cjs.

### placementDigest de experience-benchmark.mjs ignora su segundo argumento

Problema detectado: scripts/experience-benchmark.mjs llama placementDigest(result, true) y
placementDigest(result, false) para producir placementDigest y geometryDigest, pero la funcion
declara un solo parametro y siempre incluye placement.reference. Los dos valores son identicos, y
el geometryDigest de ese runner no separa geometria de etiquetas.
Cambio sugerido: hacer que el segundo argumento controle la inclusion de la etiqueta y ordenar las
filas para la huella geometrica, como hace scripts/pattern-rounds-ablation.mjs.
Beneficio esperado: que la separacion geometria/etiquetas del benchmark sea real.
Riesgo: bajo; es un script de benchmark, no codigo productivo. Cambia huellas ya registradas, asi
que hay que versionar el cambio.
Estado: NO IMPLEMENTADO. Detectado durante la ablacion; no se toco el script.
Archivos involucrados: scripts/experience-benchmark.mjs.

### MongoExactExperienceStore

Problema detectado: el store de Etapa 3A es local por proceso. El hit rate medido supone una memoria compartida; con un store por proceso el rendimiento real seria menor.
Cambio sugerido: implementar MongoExactExperienceStore detras de la interfaz ExactExperienceStore existente, sin cambiar exact-hit.ts ni revalidate.ts.
Beneficio esperado: memoria compartida entre procesos e instancias, con politica de retencion e indices por clave.
Riesgo: agrega infraestructura externa, driver y configuracion; el costo de lookup pasa a depender de la red, lo que en V10 sigue siendo despreciable frente a segundos de motor pero en Fast puede no serlo.
Estado: NO IMPLEMENTADO por decision explicita. No se agrego driver, ni dependencia, ni configuracion.
Archivos involucrados: nuevo modulo bajo src/lib/optimizer/experience/.

### Atacar la cola cara sin hit

Estado: DIAGNOSTICADA el 2026-09-04, no implementada. Ver "DIAGNOSTICO COLA CARA V10". El
diagnostico mostro que la via no pasa por Structural Memory ni Router sino por el costo interno de
Pattern Master: generarPatrones explica el 51.5% del holdout completo y master ahorro 1 placa en 129
activaciones.
Problema detectado: en el holdout V10, el 98.35% del tiempo esta en casos sin hit y el 28.50% en apenas 20 pedidos sobre 2000. Exact Memory no puede tocar ese tiempo.
Cambio sugerido: ver las 3 oportunidades de "DIAGNOSTICO COLA CARA V10". Ninguna implementada.
Beneficio esperado: es la unica via medida para bajar el tiempo total, no solo el de los repetidos.
Riesgo: son justamente las etapas que hoy estan postergadas y sin autorizacion.
Archivos involucrados: por definir.

### Conectar Exact Memory al flujo real

Problema detectado: Exact Memory esta implementada, validada y medida, pero vive apagada y solo se usa desde un runner offline. El ahorro medido no llega a produccion.
Cambio sugerido: hook detras de experienceMemoryEnabled en el borde de optimizeProject, con store inyectable y fallback silencioso, mas telemetria de outcome.
Beneficio esperado: trasladar a produccion el ahorro medido en holdout.
Riesgo: es el primer cambio que toca el camino real; exige politica de invalidacion por version de motor y decidir donde vive la memoria entre procesos.
Archivos involucrados: src/lib/optimizer/engine/legacy-engine.ts o un envoltorio en src/lib/optimizations/run.ts, src/lib/optimizer/experience/.

### Backend de store compartido entre procesos

Problema detectado: el store de Etapa 3A es local. En produccion hay varios procesos y la memoria de uno no sirve al otro; ademas el store por directorio crece sin politica de retencion.
Cambio sugerido: definir un backend compartido y una politica de expiracion o de tope por tamano, detras de la misma interfaz ExactExperienceStore.
Beneficio esperado: hit rate real parecido al medido, en vez de uno por proceso.
Riesgo: explicitamente fuera del alcance autorizado de 3A; no se implemento Redis ni PostgreSQL.
Archivos involucrados: src/lib/optimizer/experience/store.ts, nuevo modulo de backend.

### Comparar Exact Memory contra el cache interno del motor

Problema detectado: optimizeProject ya tiene un cache propio de 50 entradas por proceso, indexado por hash del input completo, etiquetas incluidas. Exact Memory y ese cache se solapan parcialmente y nadie decidio como conviven.
Cambio sugerido: medir cuanto aporta Exact Memory por encima del cache interno y decidir si el cache interno se mantiene, se agranda o se reemplaza.
Beneficio esperado: evitar dos capas de cache con politicas distintas sobre el mismo camino.
Riesgo: tocar el cache interno es tocar el motor.
Archivos involucrados: src/lib/optimizer/engine/legacy-engine.ts.

### Parser canonico project y Order

Problema detectado: el benchmark HTML actual acepta raiz <project>, pero el corpus externo tiene tambien 1346 XML con raiz Order y la referencia experiencia/ contiene 3525 casos Order en su dataset independiente.
Cambio sugerido: en Etapa 1 disenar extraccion canonica que contemple ambos formatos, manteniendo pruebas separadas para project y Order.
Beneficio esperado: no perder una parte relevante del historico y capturar veta/material cuando Order lo expresa explicitamente.
Riesgo: mezclar ejes locales de project con dimensiones globales de Order podria crear fingerprints incorrectos si no se prueba con fixtures.
Archivos involucrados: src/lib/optimizer/canonical-case.ts, tests/optimizer/canonical-case.test.ts, posible script de extraccion XML.

### Politica conservadora de veta/material

Problema detectado: experiencia/grain_material_review.csv muestra materiales con confianza alta y baja; 37 materiales leidos tienen confidence < 0.70.
Cambio sugerido: no convertir inferencias de veta de baja confianza en verdad automatica; registrar fuente/confianza en canonical case y fingerprints.
Beneficio esperado: evitar regresiones por rotacion incorrecta en materiales direccionales.
Riesgo: una politica demasiado conservadora puede reducir exact hits/structural hits inicialmente.
Archivos involucrados: src/lib/optimizer/canonical-case.ts, tests/optimizer/canonical-case.test.ts, posible script de extraccion XML.

### Entrenamiento offline de rescates por estrategia

Problema detectado: experiencia/v2 muestra que structural memory predice familias dificiles, pero 16/16 ejecuciones V10 completas sobre 8 familias dificiles terminaron en timeout de 3s y no identifican estrategia ganadora.
Cambio sugerido: crear un benchmark offline separado que ejecute baseline, compactacion, OneBoard, MultiSlice y Pattern Master por separado sobre familias predichas dificiles, con presupuesto alto y registro de wins/ties/losses/boardsSaved/ms.
Beneficio esperado: convertir structural memory de detector de dificultad en Rescue Memory accionable para probar primero la estrategia historicamente ganadora.
Riesgo: alto costo CPU si se ejecuta sobre demasiados casos o dentro del flujo interactivo.
Archivos involucrados: nuevo script bajo scripts/, posible output bajo temp_benchmark/ o carpeta autorizada, EXPERIENCE_OPTIMIZER_TRUTH.md.

### ExperienceRouterV2 quantity-aware

Problema detectado: experiencia/v3 concluye que structuralFingerprint solo es demasiado grueso para routear Rescue; en pruebas directas multislice/master no mejoraron o hicieron timeout sobre structural-only dificiles.
Cambio sugerido: disenar offline un router explicable que combine structuralFingerprint con ratioFingerprint, pieceCount, distinctPieceTypes, lowerBound, area relativa, repeticion maxima y distribucion de cantidades antes de promover una estrategia. experiencia/v4 aporta un prototipo de tres salidas: EXACT_CACHE, FAST_BASELINE y EARLY_RESCUE_CANDIDATE.
Beneficio esperado: evitar gastar CPU en rescates historicamente inutiles y priorizar rescates solo cuando el contexto cuantitativo coincide.
Riesgo: si se entrena con pocos casos puede sobreajustar y perder cobertura; debe mantener fallback baseline y selector anti-regresion.
Archivos involucrados: futuros scripts/benchmarks offline, src/lib/optimizer/canonical-case.ts, futura capa Strategy Router; no implementar antes de Etapas 1-6.

### Port controlado de Router V2 a runtime TypeScript

Problema detectado: experiencia/v4 esta implementado en Python/sklearn y empaquetado como zip offline; el proyecto productivo es TypeScript/Next y no debe incorporar dependencias nuevas ni runtime Python sin autorizacion.
Cambio sugerido: si el router llega a integrarse, portar solo la logica necesaria a TypeScript con tests de equivalencia contra fixtures/export JSON, o convertir el arbol a reglas/datos estaticos versionados.
Beneficio esperado: conservar determinismo, deploy simple y menor superficie operacional.
Riesgo: diferencias sutiles entre sklearn y la implementacion TS pueden cambiar rutas; se necesitan tests golden con casos de train/holdout.
Archivos involucrados: futura capa Strategy Router, tests/optimizer, posible script offline para exportar arbol/modelo.

### Persistencia de plan ganador completo para Exact Memory

Problema detectado: experiencia/v3 muestra mayor valor en casos caros repetidos cuando se guarda el plan ganador completo y se revalida, no solo el nombre de estrategia.
Cambio sugerido: en Etapa 3/4 disenar el Experience Store para persistir plan/placements/cortes/restos suficientes para validar cobertura, geometria y compatibilidad con input canonico exacto.
Beneficio esperado: exact hit puede evitar recomputar casos caros y reducir timeouts repetidos.
Riesgo: planes serializados pueden quedar incompatibles si cambia version del motor, esquema, kerf, restricciones o validadores; debe versionarse por LEGACY_OPTIMIZER_VERSION y fingerprint exacto.
Archivos involucrados: futura capa ExperienceStore, validadores existentes, src/lib/optimizer/types.ts si se necesita tipo interno nuevo.

### Instrumentacion fina de Pattern Master

Estado: RESUELTA el 2026-09-04 sin modificar legacy. scripts/v10-hotspot-diagnostic.mjs envuelve las
exportaciones de los .cjs antes de que v10.cjs las capture, y separa generarPatrones,
patronesMonotipo, resolverCobertura y materializar, mas tamano de pool y nodos del B&B. El riesgo
anotado abajo (tocar legacy generado) quedo evitado: no se modifico ningun archivo legacy.
Ver "DIAGNOSTICO COLA CARA V10".

Problema detectado: v10.cjs mide `master.ms` agregado, pero no separa generarPatrones, resolverCobertura, materializar, patrones generados ni nodos.
Cambio sugerido: agregar instrumentacion opcional y desactivable alrededor de generarPatrones/resolverCobertura/materializar, sin alterar scoring ni limites.
Beneficio esperado: identificar cuello de botella real antes de Experience Store/Structural Memory.
Riesgo: tocar legacy generado directamente viola la frontera si no se hace via extractor/adaptador o con autorizacion especifica.
Archivos involucrados: src/lib/optimizer/legacy/v10.cjs, scripts/extract-legacy-optimizer.mjs, posible adaptador en src/lib/optimizer/engine/.

### Normalizacion de orientacion como decision de fingerprint

Problema detectado: en Etapa 1B se normalizo la orientacion de las piezas de project a lado mayor x lado menor porque la orientacion colocada es una decision de Lepton. Esa normalizacion asume rotacion libre, que es cierta mientras el project no declare veta.
Cambio sugerido: si en el futuro se infiere veta por material para casos project, revisar si la orientacion normalizada sigue siendo valida para materiales direccionales, y de ser necesario conservar la orientacion colocada junto con la normalizada.
Beneficio esperado: no perder la restriccion de veta en materiales direccionales cuando la inferencia por material exista.
Riesgo: conservar la orientacion colocada sin normalizar reintroduce la decision de Lepton en el fingerprint.
Archivos involucrados: src/lib/optimizer/canonical-xml.ts, futura capa de fingerprints.

### Agrupar piezas duplicadas en el caso canonico

Problema detectado: en project las piezas terminales se agrupan por identidad completa porque el arbol de corte repite la misma pieza en cada ubicacion; en Order cada Part ya viene con su cantidad. Son dos criterios distintos de agrupamiento para el mismo modelo.
Cambio sugerido: evaluar en Etapa 2 si conviene un unico criterio de agrupamiento por dimension y restricciones, comun a los tres origenes.
Beneficio esperado: fingerprints mas comparables entre origenes.
Riesgo: agrupar por dimension mezclaria piezas con codigos, cantos o descripciones distintas; requiere decidir que forma parte de la identidad del pedido.
Archivos involucrados: src/lib/optimizer/canonical-case.ts, src/lib/optimizer/canonical-xml.ts.

### Recuperar los 6 XML corruptos del corpus

Problema detectado: 6 archivos del corpus estan fisicamente corruptos: texto fuera del root, atributos sin comillas y una etiqueta de cierre con basura embebida.
Cambio sugerido: no tocarlos. Si alguna vez importa recuperarlos, hacerlo con un preproceso separado y explicito, nunca relajando el parser.
Beneficio esperado: mantener el parser estricto y que un XML corrupto falle de forma controlada.
Riesgo: relajar el parser esconde corrupcion real y contamina el dataset.
Archivos involucrados: ninguno por ahora.

### Direccion de raiz por defecto en paneles sin evidencia

Problema detectado: 259 paneles no exponen dos hermanos en origenes distintos ni tienen otro panel de referencia en el mismo archivo, y caen al default "x" con warning. El corpus muestra que la convencion real de Lepton es abrumadoramente "y" (22187 contra 472).
Cambio sugerido: si alguna vez la orientacion colocada vuelve a importar, usar "y" como default en lugar de "x".
Beneficio esperado: menos ruido de warnings y una ubicacion mas fiel en esos casos.
Riesgo: ninguno hoy, porque la orientacion se normaliza y el default no cambia el caso canonico.
Archivos involucrados: src/lib/optimizer/canonical-xml.ts.

### Orden de piezas con localeCompare en canonical-case.ts

Problema detectado: canonical-case.ts ordena las piezas con stableStringify(a).localeCompare(stableStringify(b)). localeCompare depende del locale y de la build de ICU del runtime, asi que el orden del array de piezas y por lo tanto la salida de serializeCanonicalOptimizationCase podrian variar entre maquinas o entre versiones de Node. Verificado en esta maquina, locale es-AR e ICU 77.1: localeCompare invierte el orden respecto de la comparacion por code points para claves que difieren en mayusculas.
Cambio sugerido: reemplazar localeCompare por una comparacion por code points en canonical-case.ts.
Beneficio esperado: que la serializacion canonica sea reproducible entre entornos, no solo dentro de una misma maquina.
Riesgo: cambiar el orden del array cambiaria la salida de serializeCanonicalOptimizationCase para casos ya serializados. Hoy nadie persiste esa salida, asi que el riesgo es bajo, pero es un cambio de Etapa 1 y no estaba autorizado en 2A.
Impacto actual: ninguno sobre exactFingerprint, que ordena internamente por code points y por eso es inmune.
Archivos involucrados: src/lib/optimizer/canonical-case.ts, tests/optimizer/canonical-case.test.ts.

### Falla server-only fuera del optimizador

Problema detectado: `npm test` falla en tests/security/server-only.test.ts por uso de helper service-role fuera de prefijos permitidos: lib/branding/public.ts y lib/dashboard/cut-metrics.ts.
Cambio sugerido: revisar si esos usos son seguros y ajustar frontera/allowlist o mover llamadas a modulo server-only.
Beneficio esperado: recuperar test suite general verde.
Riesgo: cambio de seguridad fuera del alcance de Etapa 0 de optimizer experience.
Archivos involucrados: tests/security/server-only.test.ts, src/lib/branding/public.ts, src/lib/dashboard/cut-metrics.ts.

## PENDIENTES

- Definir si el benchmark externo de Etapa 0 se corre completo sobre 7320 project XML o sobre muestra controlada.
- Definir si se crea runner versionado o si se usa Playwright sobre el HTML existente para la corrida de baseline XML.
- Etapa 1B completada: extraccion canonica desde XML project y Order implementada, probada y auditada.
- Para benchmarks posteriores, preferir split train/holdout reproducible como experiencia/v2, idealmente temporal si puede obtenerse fecha real.
- Para Etapa 8 futura, preparar benchmark offline de rescates por estrategia separada sobre familias estructurales predichas dificiles.
- Para Etapa 4 futura, persistir/revalidar plan ganador completo en exact hits, versionado por motor y fingerprint exacto.
- Para Etapa 7 futura, no routear rescates con structuralFingerprint solo; incorporar features quantity-aware como sugiere experiencia/v3.
- Para Etapa 7 futura, usar experiencia/v4 como referencia de router advisory de tres salidas y validar contra holdout propio antes de integrarlo.
- Para Etapa 8 futura, usar los 184 EARLY_RESCUE_CANDIDATE de v4 como posible muestra estratificada inicial, no como decision productiva.
- Mantener experienceMemoryEnabled o equivalente en futuras etapas funcionales.
- Resuelto en 2A: el fingerprint de project usa la orientacion normalizada de Etapa 1B y no incorpora la ubicacion original de Lepton.
- Confirmado en 2A: 7305 de 8650 casos quedan con veta unknown, y por eso ningun grupo duplicado mezcla project con Order.
- Para 2B, decidir si structuralFingerprint tolera diferencias de cantidad y como trata la veta unknown, que es la mayoria del corpus.
- Antes de Etapa 4, revisar que el exact hit revalide contra el input canonico completo, porque el fingerprint deliberadamente ignora referencias y descripciones y hay que remapear las etiquetas del plan reutilizado.
- Si en algun momento se necesita inferencia de veta por material, registrar grainSource "material-inference" y una confianza, y no tratarla como verdad automatica.
- Resuelto en 4A: el exact hit revalida contra el input canonico completo y remapea las etiquetas del pedido nuevo; era el pendiente anotado antes de Etapa 4.
- Resuelto parcialmente en 4A: existe runner versionado de benchmark XML contra nuestro optimizador; falta portar la comparacion contra las placas de referencia de Lepton.
- Decidir si Exact Memory se conecta al flujo real detras de experienceMemoryEnabled, y con que backend, porque un store por proceso no reproduce el hit rate medido.
- Decidir como conviven Exact Memory y el cache interno de 50 entradas de optimizeProject.
- Si se quiere evidencia mas fuerte sobre casos caros, repetir el benchmark con estrategia v10 (perfil balanced), donde el costo por caso es un orden de magnitud mayor. Con perfil fast solo 2 hits superaron 500 ms en el holdout.
- Definir politica de retencion del store: cada entrada pesa del orden de 200 KB.
- Diagnostico 2026-09-04: decidir si se autoriza la ablacion de rondasPatrones (Oportunidad 1), que es
  medicion y no cambio de codigo.
- Diagnostico 2026-09-04: decidir si se autoriza la ablacion de MultiSlice (Oportunidad 2), que tambien
  es medicion sobre un flag existente.
- Diagnostico 2026-09-04: quedan 192 casos fuera de cota sin instrumentar, con 1878706 ms. Si se quiere
  cerrar la atribucion al 100% del holdout, hay que correrlos.
- Diagnostico 2026-09-04: toda verificacion futura de "0 regresiones" por re-ejecucion tiene que
  contemplar que V10 no es reproducible bit a bit, porque sus presupuestos son de reloj. Conviene
  repetir corridas o fijar los presupuestos antes de declarar una regresion.
- Ablacion 2026-09-04: decidir si se autoriza generar mas casos positivos corriendo el corpus
  completo de 8669 XML a 40 y a 20 rondas, unica via para saber si la regresion es unica o si hay
  una familia detras.
- Ablacion 2026-09-04: decidir si el ahorro del 24.4% justifica explorar una variante que conserve
  la calidad, por ejemplo generacion dirigida de patrones, en vez de simplemente recortar rondas.
- Ablacion 2026-09-04: queda abierta la pregunta de la cota inferior sin kerf, que es la que
  mantiene a 320 casos persiguiendo objetivos inalcanzables.

## SIGUIENTE PASO AUTORIZADO

Ninguno. La ablacion de rondasPatrones esta completa, medida y registrada, y el trabajo se detiene
aca. No se modifico ningun default ni codigo productivo.

FASE A: rondasPatrones = 20 -> clasificacion C, RECHAZADA por 1 regresion de placas estable.
FASE B: rondasPatrones = 10 -> NO EJECUTADA, por el gate.

No continuar con Experience Memory. No iniciar Structural Memory, Router ni Mongo. No modificar
heuristicas, scoring, limites, Fast, V10, OneBoard, Pattern Master, MultiSlice, compactacion,
solver ni generacion de patrones.

Lo que la ablacion dejo establecido:

- Hay un 24.4% del tiempo de V10 disponible en generarPatrones, y cuesta exactamente 1 placa sobre
  6927 tomarlo por la via simple de recortar rondas. La regla de 0 regresiones lo impide.
- El problema no es el numero de rondas sino que la generacion de patrones es aleatoria y sin
  direccion. El patron que costo la placa aparecio en la ronda 33 por sorteo.
- Pattern Master decide muy poco en terminos absolutos: 5 placas en 2000 pedidos.

Recomendacion, ordenada por relacion impacto sobre riesgo:

1. Generar mas casos positivos antes de cualquier cambio. Correr el corpus completo de 8669 XML a
   40 y a 20 rondas. Hoy hay 1 solo caso de regresion y 5 victorias de master; con esa muestra no
   se puede decidir nada estructural ni construir un predictor. Es medicion pura, sin riesgo.

2. Medir si los patrones que las soluciones ganadoras usan son de alta repeticion. Si lo son, la
   generacion dirigida de patrones daria el ahorro sin la regresion, porque encontraria esos
   patrones en las primeras rondas. Sigue siendo medicion offline.

3. Recien despues, y con autorizacion explicita, evaluar un cambio en patrones.cjs. Es heuristica,
   no parametro, y exige holdout completo con 0 regresiones.

Lo que la evidencia dice que NO conviene hacer:
- No adoptar rondasPatrones=20 ni 10 como parametro global.
- No buscar una regla "estos casos necesitan 40 rondas" con los datos actuales: hay 1 positivo.
- No asumir que las piezas chicas son el problema: en 4 de 5 casos donde master gana, thinRatio es
  0.00 y la repeticion es alta.
