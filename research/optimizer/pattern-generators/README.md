# Prototipo B y harness: diseño de implementación

Fecha: 2026-09-11. Contrato rector:
[Pattern Generator Architecture Experiment](../PATTERN_GENERATOR_ARCHITECTURE_EXPERIMENT_2026-09-11.md).

Estado actualizado 2026-09-14: piloto H4 de **4057401 terminado**, con presupuesto
fijo y comparación de costo reproducible. B consume menos CPU pero entrega cinco
placas frente a cuatro de A; Q2 falla. Q1 detecta referencias XML incorrectas en A.
No hay promoción ni evaluación de otro pedido. Frontera, oracle y búsqueda B0
mantienen la evidencia H2; los archivos de B0 y del kernel no cambiaron.
El código de `src/lib/optimizer/**` conserva la referencia `4063963`.

## Unidades y orden de implementación

| Módulo | Responsabilidad | Estado |
|---|---|---|
| `work-budget.mjs` | Contabilidad por pedido, admisión antes de trabajar, frontera viva | Implementado |
| `context.mjs` | Tipos estables, medidas/orientaciones y geometría exacta | H1 implementado |
| `cut-policy.mjs` | Partición, etapas y enumeración perezosa de coordenadas | H1/H2 implementado |
| `frontier.mjs` | Alternativas por consumo, deduplicación y diversidad | H2 implementado |
| `tiny-oracle.mjs` | Enumeración exhaustiva independiente sin cache ni poda de alternativas | H2 implementado |
| `descriptors.mjs` | Árboles compartidos y resúmenes de consumo, cortes y remanentes | H2 implementado |
| `and-or.mjs` | Expansión OR, combinación AND y reutilización de estados | H2 implementado; sólo probado en fixtures diminutos |
| `physical-pattern.mjs` | Árbol manual a `{uso, area, placa}` verificable | H1 implementado |
| `ordering.mjs` | Selección de raíces, orden del pool y hashes | Implementado |
| `harness/child.mjs` | Inyección A/B aislada antes de cargar V10 | H3 implementado |
| `harness/run.mjs` | Identidad, procesos nuevos y persistencia de errores | H3 y piloto fijo 4057401; scored pendiente |
| `harness/report.mjs` | Paridad, repetibilidad, aislamiento y controles | H3 implementado |
| `harness/h4-pilot.mjs` | Vínculo XML real, política fija y ocho procesos | Piloto 4057401 ejecutado |
| `harness/cpu-meter.mjs`, `b0-observer.mjs` | CPU exclusiva y observación del materializador | Probados sin cambios en B0 |
| `harness/pilot-report.mjs` | Q1/Q2/Q3 y comparación emparejada | Resultados 4057401 documentados |

Primero probar el adaptador físico con árboles pequeños construidos a mano.
Después implementar la búsqueda, cuya geometría puede estar bien aunque su
secuencia física o su XML estén mal. C y relajación permanecen fuera de B0.

## API del generador

```ts
generatePatterns(context, budget, diversity): GenerationResult

GenerationResult = {
  status: 'COMPLETE' | 'WORK_LIMIT' | 'INVALID' | 'OPERATIONAL_ABORT',
  searchRestricted: boolean,
  restrictionReasons: string[],
  patterns: Array<{ uso: Map<TypeIndex, number>, area: number, placa: LegacyBoard }>,
  telemetry: GenerationTelemetry,
  provenance: { contextHash, generatorVersion, policyHash, budgetHash }
}
```

La API devuelve plantillas físicas validadas. Internamente mantiene árboles
compactos; no construye coordenadas, piezas físicas y trazas para cada pareja AND.
Un resultado interrumpido sólo contiene raíces completas ya materializadas y
validadas. Que `patterns` esté vacío no prueba que la demanda sea imposible.

Cada contexto nace de `lineas` y `config` recibidos en la llamada real de V10,
no de un mapper paralelo. Catálogo en orden de líneas, con índices estables;
cantidades acotadas por línea, incluso con dimensiones coincidentes. Usar
`medidaCorte` y `orientaciones` de la referencia para reproducir tapacanto/veta.
La región inicial es `(placaBase-refiladoX, placaAltura-refiladoY)`; no restar
dos veces el trim ni volver a inferirlo del XML dentro del generador.

Para claves/cortes, convertir los decimales efectivos a unidades enteras con
escala común exacta. No redondear a milímetros enteros ni fusionar valores por
epsilon. Comprobar representación segura; si un valor no está soportado,
registrar `OPERATIONAL_ABORT` con razón, conservar el caso en cobertura y no
producir una supuesta certificación. Validar también la precisión al exportar,
porque el exportador actual serializa con tres decimales.

H1 fija `b0-context-v1`: unidades enteras de 0,001 mm. La conversión decimal
usa aritmética entera, incluso para valores como `1.005`; rechaza precisión
adicional, dimensiones inseguras y cantidades inválidas. No redondea ni excluye
silenciosamente casos. El caller futuro deberá convertir esos errores en
`OPERATIONAL_ABORT` cuando se trate de entradas fuera del dominio soportado.

## Gramática física de B0

Se conserva la representación por rebanadas del motor: un nodo tiene dirección
y nivel; sus hermanos avanzan en la misma dirección y el contenido de cada
rebanada puede alternar dirección en el nivel siguiente.

Estado OR: `S(width, height, axis, physicalLevel, terminalPolicy, contextHash)`.
El contexto contiene las cantidades máximas por tipo. La función devuelve una
frontera de consumos bajo esas cantidades, no bajo una disponibilidad mutable
heredada del caller. No hay RNG en B0; todos los recorridos tienen orden fijo.

Alternativas:

1. `Waste`: remanente de toda la región; consumo cero. Se conserva internamente
   para permitir una zona sin piezas y no se ofrece al Master como patrón vacío.
2. `Piece(type, orientation)`: sólo cuando ocupa exactamente la región; consumo
   unitario y hoja física. No confundir que una pieza entre con que esté liberada.
3. `Slice(t)`: divide según el eje del estado. El primer hijo resuelve el bloque
   de espesor `t` con eje alternado y nivel siguiente; la cola usa el mismo eje
   y nivel del padre. El arco AND combina ambos vectores sin superar demanda.
4. Cierre terminal: en el límite de búsqueda admite únicamente el corte terminal
   que libera una pieza y residuo, con los niveles físicos adicionales usados
   por el motor; no admite otra búsqueda arbitraria más profunda.

La cola comienza en `t + kerf`. Cuando el corte final consume el borde, no crear
rectángulos de dimensión negativa ni restos ficticios. El borde sin corte no
consume kerf. Casos con kerf que sobresale al descarte requieren la misma
semántica del validador y pruebas explícitas.

En B0 el espesor elegido es final. No hay ancla provisional ni contracción a
posteriori: si se elige 578, el siguiente hermano comienza en `578+kerf`.
Un árbol de búsqueda binario se convierte en lista de rebanadas para XML;
encadenar colas no añade etapas. Rechazar el árbol si no se puede materializar
respetando este contrato, aunque el packing visual parezca correcto.

### Política inicial de coordenadas

`piece-multiples-v1`: para cada dimensión orientada `d` de cada tipo, considerar
`n*d + (n-1)*kerf`, con `1 <= n <= cantidadDelTipo`, que quepa en el eje actual.
Incluir posiciones complementarias legales para colocar bloques a ambos lados,
deduplicar coordenadas exactas y enumerar por valor ascendente y tipo estable.
Las orientaciones raíz X e Y se procesan en orden versionado y con el mismo
contador global; si un límite impide explorar la segunda, declararlo.

Esta política no enumera necesariamente todos los cortes mixtos posibles:
`searchRestricted=true`, razón `piece-multiples-v1`. `COMPLETE` sólo significa
recorrido terminado bajo esta política, no óptimo guillotina demostrado.
No se la presenta como normalización exacta de tamaños de la literatura.

Cada expansión admite y procesa una alternativa OR, no una región entera con
cantidad ilimitada de alternativas. La enumeración de posiciones es perezosa;
no construir un producto cartesiano completo antes de consultar presupuestos.
Mezclar iteradores ordenados de múltiplos/complementos en vez de generar y ordenar
todas las posiciones por adelantado. Cobrar cada propuesta antes de procesarla,
incluidas las descartadas como duplicadas, para acotar también esa enumeración.

## Búsqueda y frontera

Resumen de la expansión implementada en `and-or.mjs`:

```text
solve(state):
  si existe cache completo para la clave: devolver frontera
  crear frontera; admitir alternativas Waste/Piece/Slice en orden estable
  para cada alternativa admitida por tryExpand():
    resolver hijos y recorrer parejas en orden estable
    antes de cada pareja: tryCombine(), incluso si será rechazada
    verificar suma de consumos <= demanda y compatibilidad física
    construir descriptor compacto; clasificar duplicación/diversidad
    reservar entrada viva antes de retenerla
  publicar cache completo sólo si acabaron todas las alternativas/hijos
  si hay límite: detener expansiones/combinaciones y conservar raíces ya retenidas
```

El grafo es acíclico: las transiciones reducen una dimensión o avanzan el nivel
con cambio de eje, con techo explícito. Una transición de región completa nunca
puede repetir indefinidamente la misma geometría/nivel. Asignar IDs de nodos en
orden de creación; nada depende del reloj ni de la dirección de un objeto.

H2 asigna `nodeId` secuencial a los descriptores y lo excluye de sus firmas.
El cache es local a una llamada, contexto, K y ledger; no existe cache global.
La clave serializada completa incorpora dimensiones, eje, nivel, contexto y
políticas de corte/cierre. Sólo se publican estados cuyo recorrido acabó; un
estado interrumpido nunca se publica como completo ni como prueba de imposibilidad.
Un estado completo con poda por K lo está bajo esa restricción, que se conserva
en el resultado global. No hay no-goods ni dominancia fuerte.

La admisión cobra Waste, candidatos Piece, preparación de cada flujo de
tipo/orientación, propuestas de coordenadas (también duplicadas) y candidatos
terminales. Cada pareja AND se cobra antes de comprobar consumo. Los múltiplos
y complementos se mezclan en orden ascendente sin arrays proporcionales a la
demanda; preparar una orientación cuenta aunque después no aporte cortes.

Una entrada es un nodo de árbol local más `usageVector`, remanentes y complejidad.
La firma canónica excluye identidad física y traza ligada al padre, pero mantiene
tipo, orientación, dimensiones, orden de cortes y remanentes. Un hash acelerador
no reemplaza comprobar igualdad de esa representación si se detecta colisión.

En B0 la única eliminación exacta es duplicación canónica completa. No implementar
dominancia fuerte hasta disponer de una prueba y contraejemplos automatizados.
`frontierPruned.dominated=0` debe ser un resultado honesto al comienzo.

Dentro de cada `GeometryKey+usageVector`, `maxVariantsPerUsageVector=K` limita
diversidad. Política inicial `remnant-shape-v1`: agrupar por firma completa de
remanentes; elegir representantes en orden determinista por métrica oficial,
complejidad física y firma canónica. Conservar hasta K formas y, si quedan cupos,
completar con árboles distintos. Todos los descartes por K son heurísticos y se
registran aunque la alternativa perdedora tenga el mismo consumo.

La frontera global se detiene al intentar superar su límite de entradas vivas. No aplicar
evicción dependiente de memoria disponible. Los nodos referenciados desde otra
entrada siguen vivos; liberar referencias y no subcontar subárboles compartidos.
Medir `retainedTreeNodes` además de entradas, RSS y heap.

`replaceFrontierEntry()` intercambia un cupo vivo sin reservar otro: conserva
`frontierLive` y `frontierPeak`, incrementa `frontierInserted` y `replaced` en
uno. Requiere un cupo existente y búsqueda activa. No dispara el límite por
estar llena, ni reactiva una búsqueda detenida. La frontera futura debe decidir
el reemplazo antes de llamar al ledger y mantener las referencias de subárboles;
el ledger no administra propiedad de nodos ni demuestra dominancia.

La frontera congela las entradas aceptadas y devuelve arrays nuevos; no clona
ni destruye sus subárboles compartidos. `dispose()` libera sus cupos una sola vez.
Al concluir `generatePatterns`, todas las fronteras se liberan en `finally`.
La telemetría conserva la ocupación anterior a esa limpieza; `retainedTreeNodes`
cuenta objetos AST únicos alcanzables desde todas las entradas vivas, incluyendo
subárboles aún referenciados. `retainedRootTreeNodes` cuenta los alcanzables desde
las raíces devueltas para inspección H2. No son bytes, RSS ni un pico de memoria.

Un mismo contador acompaña toda la generación. Tras detener búsqueda puede
materializar raíces retenidas hasta `maxMaterializations`; no se permite expandir
nuevos estados durante esa finalización. Rechazar una pareja o fallar una
materialización no devuelve presupuesto. Agotar el último paso no es hit hasta
intentar admitir un paso adicional; se admite la solución del último paso legal.

H2 no realiza nuevas combinaciones para transportar un hijo parcial tras agotar
el ledger. Conserva únicamente las raíces completas ya insertadas, aunque su
frontera raíz esté incompleta. `rootVisits` distingue ejes completos,
interrumpidos y no iniciados. `searchComplete` refleja el fin de la búsqueda
antes de materializar; un límite posterior de materialización puede hacer que
el estado global sea `WORK_LIMIT` con `searchComplete=true`.

### Políticas ejecutables previas a medir

`materializationPolicy=usage-diversity-v1` ordena descriptores de raíces sin
materializarlos para evaluarlos. El descriptor contiene `usageVector`, `cutTree`,
`remnants` en mm y `cutComplexity=[cutCount,maxCutLevel,totalCutLength]`.
La frontera futura debe calcular y conservar esos resúmenes desde sus decisiones.

1. Agrupar por consumo exacto. Ordenar grupos por cantidad de tipos presentes
   descendente, cantidad de piezas descendente y vector numérico lexicográfico
   ascendente, manteniendo el índice original de cada tipo.
2. Dentro del grupo, ordenar por los componentes de `calidadRestos`: mayor y
   segundo remanente descendentes, fragmentos ascendentes y área total descendente;
   después complejidad ascendente y representación canónica completa ascendente.
3. Recorrer una variante de cada grupo antes de la segunda de cualquiera, y así
   sucesivamente. Intentar ese orden mediante `tryMaterialize`, sin devolver
   presupuesto por intentos inválidos. Si hay 3.000 raíces y 500 admisiones,
   se intentan las primeras 500 de esta secuencia, incluso si alguna falla.

El comparador de orden usa igualdad numérica exacta sobre los componentes de
la métrica; no usa igualdad por epsilon, que puede ser no transitiva al ordenar.
Esto fija una heurística de selección; no altera el comparador oficial de Q2.

`poolOrderingPolicy=b0-v1` aplica a las plantillas válidas el mismo orden de
grupos, calidad, complejidad y firma, sin rondas de diversidad. No depende del
orden de llegada o materialización. Se devuelve un array nuevo. La firma
física conserva tipos, orientación, árbol, secuencia y remanentes; excluye IDs
temporales de pieza/XML y trazas. `patternPoolHash` conserva la multiplicidad
de patrones pero ignora su orden; `orderedPoolHash` incluye el orden y su política.
Ambos incluyen `contextHash`, porque un índice de tipo sólo tiene sentido bajo
su contexto. Los hashes del plan completo siguen siendo una medición aparte.

## Materialización y contratos verificables

`physical-pattern.mjs` asigna coordenadas locales, IDs de plantilla deterministas,
`pieza.ref=typeIndex`, `_corte`, orientación y árbol `{dir,nivel,partes}`. Todas las
partes llevan `cut`, `type`, `bloque` e `hijo` compatibles con `materializar.cjs`.
Convertir colas del mismo nivel en hermanos, con ancho/perpendicular exactos.
Construir cortes en orden físico válido; comprobar con simulación independiente.

Generar trazas desde las decisiones reales de B, sin copiar decisiones/anclas de
legacy. Usar campos estructurales que acepta la fachada y un identificador B0;
deben sobrevivir la reasignación de `materializar.cjs` y llegar a cada pieza final.
La identidad del pedido se verifica de nuevo después de la reasignación.

Validación por plantilla: simular una placa con demanda igual al consumo del
patrón; comprobar `validarPlacaIndustrial`, `validateIndependentSlices` y el
contrato físico de niveles. El validador industrial no verifica por sí solo todas
las restricciones del árbol/XML; no basta con su booleano `ok`.
Validación final: demanda exacta por tipo y piezas físicas, geometría, secuencia,
veta, etapas, trazas y exportación/relectura consistente. El parser canónico por
sí solo tampoco sustituye un chequeo de secuencia XML.

El exportador escribe `_xmlId` en el árbol. Exportar una copia y calcular el
`fullPlanHash` antes de esa mutación; volver a comprobar que el original conserva
su hash. No transformar ese efecto secundario en una falsa falta de determinismo.

API H1: `materializePattern(context, manualTree, {budget?, rootAxis?})` devuelve
`{status, pattern, validation, contextHash, materializerVersion}`. Los tamaños del
AST están en mm: `piece {type,rotated?}`, `waste`, `slice {axis,parts:[{size,content}]}`
y `terminal {type,rotated?}` como contenido de la última etapa. La cola sobrante
es implícita; `rootAxis` debe coincidir con el eje de una raíz `slice`.
`COMPLETE` aquí significa materialización terminada, no búsqueda completa.
Árboles inválidos lanzan error y consumen su admisión si se proporcionó ledger.

Hallazgo H1: el exportador añade trim a nodos de nivel 2. Declarar una pieza
final directamente en la raíz hacía que el importador recuperara una dimensión
con trim añadido. `b0-physical-pattern-v1` crea un bloque de nivel 2 y una hoja
final de nivel 3 para esa liberación exacta. Esa declaración de ancho completo
no añade corte ni kerf. Los cierres terminales con residuo sí añaden su corte
físico. La corrección se limita al adaptador experimental.

## Harness A/B sin modificar el kernel

Un proceso Node nuevo por `(archivo, brazo, repetición, modo)`, ejecutado en serie.
El padre verifica árbol Git, hash de scripts/lockfile, corpus, inputs y manifiesto.
No usar la caché de resultados de una corrida previa como ejecución medida.

El hijo instala adaptadores CommonJS locales al proceso antes de importar la
fachada/bundle. El precedente es `scripts/pattern-rounds-ablation.mjs`:
`v10.cjs` captura exports por destructuring durante la carga.

1. Verificar que `v10.cjs` aún no fue cargado. Resolver rutas exactas y registrar
   el árbol original `src/lib/optimizer`; no editar ni reextraer esos archivos.
2. A: delegar a exports originales, conservando 40 rondas, monotipo y orden.
3. B: sustituir `generarPatrones` por B0, que devuelve su pool completo;
   `patronesMonotipo` devuelve vacío porque B ya es responsable de su cobertura.
   No ejecutar ocultamente las 40 rondas ni monotipo legacy. Si se ensaya conservar
   monotipo legacy, identificarlo como variante distinta `B+legacy-mono` y cobrarlo.
4. Cargar la misma fachada y ejecutar `optimizeProject` con los mismos inputs y
   seis presupuestos del Kernel V1. Flags experimentales existentes OFF.
5. Observar cobertura y materialización sin modificar sus decisiones. El harness
   registra excepciones antes de que V10 las absorba: un fallback válido no convierte
   un error del generador en Q1 PASS. El hijo vuelve a reportarlas al padre.

Control obligatorio previo: `A-direct` y `A-adapter` producen el mismo pool
ordenado y `fullPlanHash`. Si falla, corregir el harness antes de evaluar B.
La instrumentación detallada se verifica aparte y se apaga en las corridas de
rendimiento. Se permiten medidas gruesas por fase para A y B con el mismo alcance;
si hay materialización anidada en generación, reportar fases exclusivas además
del intervalo inclusivo, sin sumar tiempos que se superponen.

Master puede no activarse porque el pipeline ya alcanzó su cota. Reportar
`masterActivated=false`, `generatorCalls=0`, resultado end-to-end y costo real;
ese caso no demuestra que B haya generado ningún patrón. Un modo adicional
`generation-only` captura `lineas/config` y fuerza la evaluación de ambos pools
para Q1/costo de generación, separado del resultado end-to-end de producción.

### Qué puede observarse del Master existente

Su objetivo es reducir placas. No recorre necesariamente distintas geometrías
para mejorar remanente con el mismo consumo; la memoización de demanda y el
incumbente pueden podarlas. Preservar esto en ambos brazos.
Registrar `generatedPool`, `selectedPatterns`, candidato materializado y plan
final. Orden del pool B fijo y versionado; `patternPoolHash` identifica contenido
canónico y `orderedPoolHash` identifica el orden que vio el Master. No declarar
ganancia de remanente de B basándose sólo en un patrón que nunca se seleccionó.

Conservar el incumbente del pipeline del propio brazo es parte de V10. Entregar
el resultado final de A como fallback a B es otra ablación: registrar su costo y
resultado por separado, sin presentarlo como éxito propio de B.

## Manifiesto y artefactos

Un manifiesto ejecutable futuro debe incluir:

```text
schemaVersion, experimentVersion, mode (pilot | scored)
kernelCommit, generatorSourceHash, harnessSourceHash, lockfileHash
corpusContentHash, identitySetHash, orderedFiles[], canonicalInputHashes[]
executionBinding=physical-xml-historical-validity-v1
profile=balanced, strategy=v10, seed, experimentalFlags=OFF
kernelBudgets (los seis valores versionados)
generatorBudget (los cuatro enteros positivos), maxVariantsPerUsageVector
cutPolicy, diversityPolicy, materializerVersion, frontierSemanticsVersion
materializationPolicy=usage-diversity-v1, poolOrderingPolicy=b0-v1
arms=[A,B], repetitions=3, executionOrder=AB/BA/AB, concurrency=1
watchdogPolicy, numericSavingsGate, environmentFingerprint
```

No fijar todavía números de rendimiento o presupuesto a partir de la literatura.
El piloto acotado de `4057401` sirve para fijarlos, antes de puntuar los casos.
Tres repeticiones son el mínimo de identidad; por sí solas no aseguran potencia
estadística para una diferencia de CPU pequeña.

Comandos H3 disponibles (salida nueva obligatoria, sin sobrescribir intentos):

```powershell
node research/optimizer/pattern-generators/harness/h3.test.mjs
node research/optimizer/pattern-generators/harness/run.mjs <h3-manifest.json> <directorio-nuevo>
```

La prueba construye el manifiesto sintético de `harness/h3-fixtures.mjs` y lo
persiste con identidad y presupuestos en `test-results/pattern-h3-<timestamp>/`.
El manifiesto H3 usa `mode=h3`; su salida es 1 si no aprueba el informe de integración.
El piloto fijo de 4057401 tiene su comando específico documentado abajo.
Los siguientes comandos generales de piloto/scored siguen previstos y no disponibles:

```text
node .../harness/run.mjs preflight --manifest <archivo>
node .../harness/run.mjs pilot --manifest <archivo>
node .../harness/run.mjs scored --manifest <archivo>
node .../harness/run.mjs report --run <directorio>
```

Artefactos: manifiesto inmutable, environment, preflight, `cases.jsonl` append-only,
telemetría, planes de fallos, pools, resúmenes por Q y hashes. El padre persiste
también crash/timeout/errores de importación. Reanudación sólo con identidad
completa; no sobrescribir un fallo ni saltarlo porque otro intento aprobó.
Reportar por separado cobertura, casos no ejercitados y búsquedas incompletas.
Serializar `Map` de consumos como pares `[typeIndex, cantidad]` ordenados antes
de JSON/IPC; no aceptar `{}` como consumo válido. Mantener árboles compactos
dentro del hijo y transportar sólo los artefactos necesarios, con hashes.

La referencia inicial de archivos es el preflight físico recuperado de la
certificación. Revalidar entradas y contrato; no reutilizar sus timings Linux
como baseline A local ni confundir sus 3.725 planes disponibles con un freeze.

## Pruebas y puertas de implementación

**H0 — Contador:** último paso permitido; pareja rechazada cobrada; frontera viva
vs inserciones; no reanudar tras límite; finalización acotada; snapshot aislado.
Implementado y ejecutable:

```powershell
node research/optimizer/pattern-generators/work-budget.test.mjs
```

**H1 — Árbol físico a mano:** una pieza exacta; dos hermanos con kerf cero y no
cero; trim asimétrico; rotación prohibida; cierre terminal; límite de etapas;
578+kerf; dos tipos de igual medida; repetición de plantilla en placas distintas;
trazas completas; exportación sin mutar el original. Plantillas inválidas deben
ser rechazadas aunque el dibujo encaje.

Resultado local 2026-09-13: H0 **10/10**, políticas **8/8**, H1 **25/25**.
H1 usa los validadores existentes, reasignación exacta y parser canónico.
Además, un lector de prueba independiente reconstruye cortes desde las partes
XML, comprueba referencias, posiciones, dimensiones y niveles y vuelve a
simularlos. Rechaza XML corrompido. Ese lector admite el dialecto emitido aquí;
recibe el eje raíz del fixture porque XML no lo declara explícitamente. No es
un importador industrial general ni reemplaza el futuro gate de corpus.

```powershell
node research/optimizer/pattern-generators/ordering.test.mjs
npm test -- tests/optimizer/pattern-generator-h1.test.ts
npx tsc -p research/optimizer/pattern-generators/tsconfig.h1.json
```

La repetición de H1 y las pruebas de orden son locales al proceso. H2 añade
tres procesos nuevos para fixtures completos, restringidos e interrumpidos;
esto no sustituye las repeticiones A/B ni la contabilidad completa de CPU de
finalización (incluidos ranking y firmas) que corresponden al harness H3.

**H2 — Búsqueda diminuta:** comparar con enumeración exhaustiva independiente
sobre tableros pequeños y la misma gramática sin poda ni límites alcanzados;
controlar consumos, firmas y sets alcanzables. `d=[3]` debe permitir patrones de
una y dos piezas: conservar ambos para cobertura exacta. El oracle no llama a B.
Probar estados de misma geometría con contexto/demanda/veta distintos y no-good
incompleto. Probar que K pequeño marca restricción y tres procesos repiten hash.

### Evidencia H2 ejecutada — 2026-09-13

El oracle se escribió y pasó sus dos pruebas antes de implementar `and-or.mjs`.
No importa búsqueda, frontera, generador de coordenadas, ledger ni materializador.
Enumera todos los árboles de su gramática con cantidades factibles, sin cache,
poda de alternativas ni límites de trabajo/reloj. Elimina sólo coordenadas
repetidas como exige `piece-multiples-v1`; conserva derivaciones duplicadas de
árboles. Los tests comparan sets canónicos de árboles y consumos por eje.

Comparación con K=100.000 y los presupuestos de `h2-fixtures.mjs`: nueve fixtures,
18 pares fixture/eje, igualdad de consumos y árboles canónicos, cero hits de
presupuesto y cero podas por K. Todas las ejecuciones finalizaron `COMPLETE`
bajo `piece-multiples-v1`, conservando `searchRestricted=true`.

| Fixture | Raíces retenidas (incluye consumo cero) | Patrones físicos no vacíos | Estados geométricos | Parejas AND examinadas |
|---|---:|---:|---:|---:|
| one-and-two | 11 | 5 | 6 | 13 |
| kerf | 11 | 5 | 6 | 13 |
| clipped-kerf | 6 | 2 | 4 | 4 |
| terminal | 16 | 8 | 8 | 18 |
| two-stages | 68 | 42 | 10 | 116 |
| distinct-types | 15 | 10 | 5 | 24 |
| rotation | 16 | 8 | 8 | 24 |
| grain | 9 | 4 | 5 | 12 |
| decimal-trim | 11 | 5 | 6 | 13 |

Los 89 patrones se comprobaron con los validadores existentes, reasignación de
piezas, trazas y export/reimport XML canónico y físico. Los resúmenes de consumo,
remanentes, área y complejidad se contrastaron con la materialización de cada
raíz no vacía. Con demanda `[3]`, un patrón de una pieza y otro de dos producen
un plan industrial válido de cobertura exacta.

En `terminal`, K=1 conserva 6 raíces/4 patrones, frente a 16/8 con K=100.000;
registra 8 descartes heurísticos, `dominated=0` y la razón explícita
`maxVariantsPerUsageVector`. Los consumos alcanzables coinciden con el oracle
en ese fixture. No se generaliza esta evidencia a todos los pedidos.

Resultados de pruebas H2: frontera **9/9**, oracle **2/2**, coordenadas **2/2**,
búsqueda **18/18**, repetición en tres procesos **1/1**, XML generado **9/9**:
**41/41**. Regresión H0/orden/H1: **43/43**. Total ejecutado **84/84**, sin fallos
pendientes. El chequeo de tipos de los puentes TS H1/H2 también pasó.

Fallos encontrados durante el desarrollo: una expectativa del test de demanda
grande omitía la preparación de la orientación rotada; se corrigió el test,
manteniendo el cobro por orientación. El tipado inicial del fixture de Vitest
H2 también se corrigió. Los primeros intentos de ejecutar Vitest y los procesos
hijos recibieron `EPERM` del sandbox; se repitieron con permiso y pasaron.
No se detectaron discrepancias oracle/búsqueda ni patrones inválidos en esta
cohorte. No se modificó `src/lib/optimizer/**`.

```powershell
node research/optimizer/pattern-generators/frontier.test.mjs
node research/optimizer/pattern-generators/tiny-oracle.test.mjs
node research/optimizer/pattern-generators/cut-policy.test.mjs
node research/optimizer/pattern-generators/and-or.test.mjs
node research/optimizer/pattern-generators/h2-repeat.test.mjs
npm test -- tests/optimizer/pattern-generator-h1.test.ts tests/optimizer/pattern-generator-h2.test.ts
npx tsc -p research/optimizer/pattern-generators/tsconfig.h1.json
```

API H2: `generatePatterns(context, limits, {maxVariantsPerUsageVector, rootAxes?})`.
El orden raíz por defecto es X/Y; restringirlo declara `root-axis-subset` y forma
parte del hash de política. `roots`, `stateAudit`, hashes y telemetría son evidencia
experimental, no integración al Master. Una materialización inválida se registra
y devuelve estado `INVALID`; no se disimula como éxito. Errores de entrada o
excepciones operativas se propagan al caller con limpieza en `finally`; su registro
persistente como `OPERATIONAL_ABORT` pertenece al runner futuro, aún ausente.

Aclaración del contrato de interrupción: se evita interpretar «propagar frontera
parcial» como permiso para ejecutar AND tras el límite. Sólo se materializan
raíces ya construidas. No hay otros cambios de alcance: sin harness A/B, LP,
duales, Branch-and-Price, relajación ni agrupación de tipos. H2 no demuestra
calidad contra A, aceleración, optimalidad guillotina general ni certificación.

**H3 — Integración aislada:** paridad A-direct/A-adapter, orden de carga, B sin
llamadas ocultas al generador legacy, caso Master no activado y errores absorbidos
por V10 visibles en informe. Inyectar una plantilla inválida para comprobar Q1.

### Evidencia H3 ejecutada — 2026-09-14

Los módulos de `harness/` instalan las envolturas antes de que CommonJS capture
las dependencias de V10. El hijo recibe los seis presupuestos congelados del
Kernel y limpia las variables `OPTIMIZER_*` heredadas. Padre e hijo comprueban
los hashes de Kernel, algoritmos H2, harness, lockfile, política y lector XML;
también se comprueban los bundles. La ejecución es serial, en procesos nuevos.

La suite H3 contiene dos pruebas y **27 ejecuciones hijas**:

- 18 ejecuciones con Master activado o `generation-only`: A-direct, A-adapter
  y B, tres repeticiones de cada modo; orden A/B alternado por repetición.
- Tres ejecuciones end-to-end con Master inactivo: se registra que el generador
  no fue ejercitado, con cero llamadas y plan final válido.
- Una generación B limitada a una expansión: `WORK_LIMIT`, pool vacío, sin
  afirmar imposibilidad, cobertura del pedido ni calidad suficiente.
- Cinco controles negativos: excepción del generador, plantilla inválida,
  carga tardía, salida abrupta y watchdog. Los cinco quedan como Q1 FAIL en los
  artefactos. Los dos primeros terminan con fallback final válido, sin ocultar
  la excepción o el candidato inválido. Crash/watchdog conservan un artefacto
  del padre y los eventos previos, si existen.

Los 22 trabajos sin inyección aprueban Q1 dentro del alcance ejercitado. A-direct
y A-adapter coinciden en pool completo, orden y plan final. Los seis grupos
brazo/modo repetidos conservan hashes; B conserva también su telemetría y estado
de búsqueda. No hubo llamadas al generador, monotipo o packing legacy dentro
de la generación B. El informe rechaza controles ocultados y deriva de hashes,
comprobados también con alteraciones de los resultados en la prueba.

Se comprueban consumo por tipo, área, trazas, validación industrial y slices de
cada plantilla; su XML se exporta sobre una copia y se reconstruye con el lector
físico independiente de H1. El plan final verifica demanda XML con medidas de
corte, trazas, geometría reconstruida y que exportar no haya mutado el original.
Los hashes del harness incluyen las plantillas serializadas completas, con IDs
y trazas, como control estricto de paridad. Los hashes canónicos propios de B0
se conservan aparte en `probe.generatorResults`; no son intercambiables.

Fixture activo: placa 10×10, tres piezas 6×6, kerf/trim cero, dos etapas;
cota de área 2 y resultado 3 placas. El Master se invoca pero no reduce placas;
esta evidencia no demuestra un candidato B seleccionado ni una mejora. El
fixture inactivo tiene cuatro piezas 5×5 sobre la misma placa. Los presupuestos
sintéticos están versionados en el manifiesto y no fijan la política del piloto.

Resultado: **H3 2/2**, regresión **H0/H1/H2 84/84**, TypeScript H1/H2 aprobado.
Los primeros intentos de esbuild recibieron `EPERM` del sandbox; las ejecuciones
autorizadas aprobaron. Se reforzó el código empezado para persistir los abortos
del padre, enlazar sus artefactos, validar XML físico y excluir el costo
diagnóstico de cualquier conclusión Q3. `Q2=NOT_EVALUATED`,
`Q3=DIAGNOSTIC_ONLY`; la generación B incluye su materialización y no ofrece aún
fases exclusivas aptas para puntuar rendimiento.

El registro portable de cierre está en `H3_CLOSED_2026-09-14.json`. Los artefactos
completos permanecen en el directorio local identificado allí; `test-results/`
está ignorado por Git. No se modificaron los algoritmos H2 ni el Kernel.

**H4 — Datos reales:** `4057401`, `4056900`, los otros tres sentinelas, `4020442`.
Luego 213 hotspots y 8.168 factibles bajo el contrato rector. Q1/Q2/Q3 separados;
un fallo no se compensa por promedios ni por más cache hits. Revisar la causa
antes de ampliar una corrida costosa. Promoción sólo con la evidencia completa.

### Piloto H4 4057401 — cerrado 2026-09-14

**Alcance autorizado y completado:** medir costo sobre 4057401 y detenerse.
La secuencia H4 general del párrafo anterior queda pendiente; no se ejecutaron
4056900, otros sentinelas, hotspots ni corpus. No se ajustó ningún presupuesto
después de observar resultados. No se cambió el kernel ni el algoritmo B0.

Política fijada antes de ejecutar: [H4_4057401_POLICY.json](H4_4057401_POLICY.json).
Informe portable: [H4_4057401_PILOT_2026-09-14.json](H4_4057401_PILOT_2026-09-14.json).
Artefactos originales: `test-results/h4-4057401-pilot-v1/`; manifiesto previo:
`test-results/h4-4057401-pilot-v1-input/frozen-manifest.json`.

#### Entrada, presupuesto y protocolo

Se releyó el XML físico `4057401__GABRIEL_TUMBACO CRUZ4057401.xml` del corpus
recuperado. Es formato **Order**: se conserva su trim canónico (0/0), sin aplicar
el trim histórico de Project. La entrada coincide por hash con el caso factible
del preflight de certificación: placa 2742×1822 mm, kerf 4,5 mm, cuatro etapas,
cuatro tipos y 19 piezas. `benchmarkInputFromCanonicalCase` fija V10/balanced.
El manifiesto conserva XML SHA-256, input, hash canónico, parser y vínculo físico.

| Presupuesto B | Valor fijo | Uso observado en cada ejecución B |
|---|---:|---:|
| Expansiones | 20.000 | 20.000; un hit |
| Combinaciones AND | 50.000 | 14.448 |
| Entradas vivas | 10.000 | pico 3.137 |
| Materializaciones | 500 | 0 |
| Variantes por consumo K | 8 | poda heurística declarada |

Se conservaron los seis valores de Kernel V1: Beam 1024 expansiones por llamada
y watchdog 5000 ms; Master 1.600.000 nodos y watchdog 60.000 ms; OneBoard 384
intentos y watchdog 10.000 ms. Fusible externo: 600.000 ms por hijo; heap máximo
configurado 4096 MiB. No se activó telemetría detallada del kernel ni flags
experimentales; sus watchdogs internos no tienen un contador observado aquí.

Ocho procesos Node nuevos, seriales y sin calentamiento: primero A-direct y
B-native como controles sin el observador de materialización; luego tres pares
medidos **AB/BA/AB**. A ejecuta 40 rondas con semilla legacy 7 y monotipo; B usa
únicamente AND/OR. No hubo llamadas ocultas al generador/monotipo/packing legacy
dentro de B. Los hashes pool/orden/plan se repiten dentro de cada brazo; también
coinciden los controles con sus brazos medidos y toda la telemetría B.

Máquina: Windows 10.0.19045 x64, Node v22.21.1, Intel i5-1135G7, ocho procesadores
lógicos y 16,95 GB de RAM. La huella completa está en `environment.json`.

#### CPU y memoria realmente medidas — Q3

CPU del proceso en **segundos**, incluyendo user+system. Cada fila es un proceso
nuevo; los controles de paridad no entran en estos totales.

| Par / orden | Generación A | Generación B | Total A | Total B | Pico RSS A (KiB) | Pico RSS B (KiB) |
|---|---:|---:|---:|---:|---:|---:|
| 1 / AB | 3,719 | 0,796 | 7,344 | 4,297 | 154.912 | 146.784 |
| 2 / BA | 3,812 | 0,968 | 7,234 | 4,719 | 150.160 | 146.844 |
| 3 / AB | 3,720 | 0,750 | 7,173 | 4,407 | 149.184 | 138.220 |
| Suma CPU | **11,251** | **2,514** | **21,751** | **13,423** | — | — |

**Ahorro de CPU de generación B: 77,6553%** sobre totales emparejados; por par
78,5964%, 74,6065% y 79,8387%. Medianas A/B: 3,720/0,796 s.
**Ahorro de CPU total: 38,2879%**; medianas A/B: 7,234/4,407 s.
El monotipo de A está incluido: 0,015/0,031/0,031 s. El costo exclusivo restante
del pipeline suma 10,500 s en A y 10,909 s en B; no se atribuye a generación.

`patternGenCPU`, `materializationCPU`, `masterCPU` y `otherCPU` suman exactamente
`totalCPU`. El medidor descuenta cada intervalo hijo una vez. `totalCPU` abarca
`optimizeProject`, incluida su validación y fallback propios y los observadores
gruesos; excluye carga de módulos y la validación/serialización extra del harness,
que se difiere hasta después de medir. Se trata de procesos fríos, sin reusar cache.

En A la construcción física está mezclada con la búsqueda y permanece dentro
de generación. En B sólo se intercepta el enlace a `materializePattern` mediante
un bundle experimental: el archivo de búsqueda y todas sus dependencias originales
se conservan. La materialización B se descuenta de generación y suma a
`materializationCPU`, junto con `materializar` del Master. `poolProductionCPU`
incluye toda la construcción del pool en ambos brazos; en este piloto coincide
con generación porque B no llegó a materializar ningún patrón.

Las muestras de `masterCPU` y `materializationCPU` fueron **0 s** en los tres pares.
Esto no significa que A no trabajó: cada A registra dos llamadas de cobertura
(crear/resolver) y una materialización del plan. Su CPU no se resolvió con el
contador del proceso en esta máquina; no se calcula un porcentaje con denominador
cero. B registra una llamada al constructor de cobertura sobre un pool vacío,
sin resolver ni materializar. No se inventan duraciones a partir de wall.

`peakMemory` es el máximo RSS del proceso desde su inicio hasta el retorno del
optimizador, antes de la validación extra; incluye la carga de módulos. No es un
pico de heap ni de una fase concreta. El máximo entre repeticiones fue 151,28 MiB
para A y 143,40 MiB para B. El snapshot de heap al retornar se conserva aparte.

Q3 queda **MEASURED**, con paridad y repetibilidad aprobadas. Estos porcentajes
describen el costo de una búsqueda B interrumpida con pool vacío; no demuestran
una sustitución más rápida con la misma calidad ni fijan un umbral de promoción.

#### Resultado físico y calidad — Q1 y Q2

| Resultado final, igual en las tres repeticiones | A | B |
|---|---:|---:|
| Placas | **4** | **5** |
| Piezas | 19 | 19 |
| Mayor remanente útil (mm²) | 721.146 | 3.074.625 |
| Segundo mayor (mm²) | 721.146 | 1.967.385 |
| Fragmentos útiles | 10 | 9 |
| Área útil total (mm²) | 3.577.592 | 8.845.085 |

**Q2 FAIL:** B añade una placa. El mayor remanente que resulta de esa placa
adicional no compensa la regresión; `compararCalidad` sólo decide con igual
cantidad de placas. B devuelve el incumbente de su propio pipeline, sin fallback
externo a A y sin candidato generado seleccionado.

**Q1 FAIL en A; PASS en B.** En A pasan la validación industrial, demanda de
colocaciones, trazas y reconstrucción geométrica del XML, pero el XML final
contiene dos piezas 744×450 con código `3` en lugar de `4`: aparecen doce con
código `4` y dos con código `3`, frente a catorce demandadas con código `4`.
También ocurre en A-direct; no lo introdujo la envoltura A. La comparación histórica
de dimensiones sin referencia no detectaría este defecto, pero el gate Q1 del
harness conserva la referencia y registra `INVALID_FINAL`. El fallo sigue abierto;
no se corrigió el kernel ni se relajó el chequeo. B pasa Q1 para su plan de cinco
placas; el pool vacío no demuestra cobertura propia de B0.

#### Telemetría B y estados

Las cuatro ejecuciones B, incluido el control nativo, repiten **WORK_LIMIT** por
`maxExpansions`. Raíz X interrumpida; raíz Y `NOT_STARTED`; `searchComplete=false`.
Sólo queda una raíz de consumo cero: pool final vacío, cero materializaciones.

| Telemetría nativa B0 | Valor por ejecución |
|---|---:|
| geometryStates / demandStates | 1.016 / 1.097 |
| cacheHits / cachedCompleteStates / incompleteStates | 2.051 / 1.001 / 15 |
| andPairsConsidered / andPairsAccepted | 14.448 / 14.448 |
| frontierPeak / frontierInserted / replaced | 3.137 / 4.792 / 1.655 |
| duplicateUsageVectors | 14.371 |
| frontierPruned: duplicate / heuristic / dominated | 43 / 12.288 / 0 |
| retainedTreeNodes / retainedRootTreeNodes | 3.137 / 1 |
| coordinateStreams / coordinateProposals / duplicateCoordinates | 7.616 / 1.664 / 51 |
| materializations / invalid | 0 / 0 |

Se conserva el objeto completo, límites, hits, motivos de restricción, hashes y
proveniencia en cada resultado. No hubo estado de generador **INVALID** ni
**OPERATIONAL_ABORT** en las ocho ejecuciones. El fallo Q1 de A queda separado
del estado `COMPLETE` de ejecución; no se oculta bajo ese estado.

#### Evidencia, pruebas y reproducción

Pruebas: H4 **3/3** (contabilidad exclusiva, gates separados y paridad del
observador en 18 combinaciones fixture/presupuesto), regresión H3 **2/2** con
27 procesos. Esbuild recibió inicialmente `EPERM` del sandbox; la ejecución
autorizada pasó. Se corrigió una prueba que intentaba hashear `Map` sin serializar;
esto ocurrió antes del pedido real y no cambió el algoritmo.

El primer informe del piloto marcó Q2 `INCONCLUSIVE` al ver Q1 FAIL en A.
Se corrigió sólo la clasificación del informe: una regresión observada de placas
debe seguir siendo Q2 FAIL aunque Q1 falle de forma independiente. La prueba
cubre esa condición. El informe portable se deriva de **los mismos ocho registros**:
no hubo otra corrida real, cambio de presupuesto ni sustitución de mediciones.
Se preservaron el informe original, sus hashes y una copia del harness medido
en `measured-harness-source/`; `derivation` distingue el código medido del código
que generó el informe corregido.

Comandos para una reproducción futura; no se ejecutaron corridas reales adicionales:

```powershell
node research/optimizer/pattern-generators/harness/h4.test.mjs
node research/optimizer/pattern-generators/harness/h4-pilot.mjs <directorio-nuevo>
node research/optimizer/pattern-generators/harness/rebuild-pilot-report.mjs test-results/h4-4057401-pilot-v1 <nuevo-informe.json>
```

El último comando sólo relee evidencia; no ejecuta el optimizador. El runner exige
la política fija, identidad de entrada, ocho trabajos y orden autorizado, y no
sobrescribe directorios. Devuelve código 1 ante estos fallos Q1/Q2; las ocho
ejecuciones terminaron correctamente a nivel de proceso. **Piloto cerrado: no
avanzar a otra configuración o pedido sin una nueva instrucción.**
