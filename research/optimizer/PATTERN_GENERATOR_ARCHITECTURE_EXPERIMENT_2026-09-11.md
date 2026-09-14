# Pattern Generator Architecture Experiment

Fecha y decisión del usuario: 2026-09-11.
Estado: contrato experimental; generadores B/C todavía no implementados.

Diseño de B y su harness: [especificación de implementación](pattern-generators/README.md).
Actualización 2026-09-13: incluye contador H0 con reemplazo (10/10), políticas de
selección y orden (8/8) y materializador físico H1 con árboles manuales (25/25).
Frontera, búsqueda y runner A/B siguen pendientes. Este contrato y los otros tres documentos rectores
conservan prioridad sobre cualquier detalle de implementación.
Pregunta: ¿podemos producir la diversidad que necesita el Master reutilizando
trabajo estructural, en vez de repetir `optimizar` durante 40 rondas?

AND/OR es pertinente, pero todavía no existe evidencia para sustituir las 40
rondas. Este documento amplía la [evaluación inicial](AND_OR_PATTERN_GENERATION_ASSESSMENT_2026-09-11.md).

## Referencia y alcance

El runtime Kernel V1 `4063963260abb10c8d68d0e553942899c925cc2f` permanece intacto.
Su certificación y la de un futuro generador son trabajos distintos. Ese commit
es una referencia inmutable de código, no una declaración de Kernel V1 FROZEN.
Completar su certificación sigue siendo requisito para promover una nueva versión.

El experimento vive fuera de `src/lib/optimizer/**`, inicialmente bajo
`research/optimizer/pattern-generators/` y con artefactos en `test-results/`.
Comparte parser, entradas físicas, Master, materialización, validador y exportador
con la referencia mediante un harness aislado. No se conecta a producción.

| Variante | Función | Primera etapa |
|---|---|---|
| A — Legacy iterative generator | 40 rondas y monotipo actuales | Referencia medida |
| B — Bounded AND/OR frontier | Cortes OR, combinaciones AND y fronteras por consumo | Primer prototipo |
| C — Multi-level DP / AND-OR hybrid | Composición horizontal/vertical por niveles y reutilización DP | Competidor posterior con el mismo contrato |

La relajación de estados es una extensión ortogonal B+R/C+R, apagada al medir
B y C sin relajación. Dejar un contrato para un proveedor de cotas opcional no
implica implementarlo ahora. No introducir LP, precios duales, Branch-and-Price,
solvers adicionales ni agrupación geométrica de tipos en el primer prototipo.

No recortar las 40 rondas de A para facilitar la comparación. Para B/C, la salida
del generador debe reemplazar la generación de A en la comparación de sustitución.
Una ejecución A+B o A+C es una ablación de calidad y costo adicional, no de ahorro.
Monotipo, fallback y cualquier llamada a legacy deben registrarse y cobrarse.

## Estado, demanda e identidad

Contrato conceptual; no se incorporan estas interfaces al runtime certificado:

```ts
type GeometryKey = {
  width: ExactDimension;
  height: ExactDimension;
  stageState: PhysicalStageState;
  grainState: GrainAndRotationState;
  cutPolicy: CutPolicyId;
};

type FrontierEntry = {
  usageVector: readonly number[];
  cutTree: CutTreeHandle;
  usedArea: number;
  remnantSignature: CompleteRemnantSignature;
  cutComplexity: PhysicalCutComplexity;
  materializationWorkEstimate?: number;
};
```

Cada mapa geométrico pertenece a un contexto inmutable de pedido: catálogo de
tipos y cantidades, medidas efectivas tras tapacanto, material/espesor, kerf,
trim, restricciones, objetivos de remanente y precisión. La clave real incluye
un identificador de ese contexto. Si la resolución recibe una disponibilidad
menor que la del contexto, debe incluirla en la clave o filtrar una frontera
completa de forma demostrablemente equivalente. Nunca reutilizar una solución
dependiente de demanda como si fuera sólo geométrica.

Un corte crea dos regiones, pero sus consumos se combinan bajo `uIzq + uDer <=
demanda`. Se mantienen tipos estables para el Master e identidades físicas
separadas para materializar. Cada hoja conserva tipo, orientación y medidas.
Se reasignan piezas concretas sólo respetando cantidades y propiedades.

`ESTANTE_600x400 × 8` y `BASE_600x400 × 2` siguen siendo dos componentes del
vector. Una clase geométrica común sería una optimización posterior, con mapeo
y capacidades por tipo, sólo si coinciden todas las propiedades industriales.

## Frontera y deduplicación

`GeometryKey + usageVector` define un grupo de comparación; no es por sí solo
una autorización para descartar todas sus alternativas salvo una.

1. Colapsar duplicados con la misma semántica física y firma canónica completa.
2. Dentro del mismo consumo, conservar alternativas de remanente y complejidad.
3. Aplicar dominancia únicamente con una regla de sustitución probada para
   cualquier continuación admisible. La comparación local por área o por el
   mayor remanente no basta para demostrar dominancia al componer regiones.
4. Limitar diversidad mediante una política determinista, versionada y separada
   de la dominancia. Toda expulsión por cupo se registra como poda heurística.

Con tipos y medidas efectivos fijos, `usedArea` queda determinado por el vector:
no distingue dos patrones con el mismo consumo. La forma y distribución de
remanentes y el árbol sí pueden distinguirlos. `remnantSignature` conserva
dimensiones y multiplicidades relevantes, no sólo área agregada ni un score.

La métrica de remanente de referencia es `calidadPlanPlacas` + `compararCalidad`
en `legacy/motor.cjs`: mayor bloque útil, segundo, menos fragmentos y mayor área
total, con los umbrales efectivos del pedido. El gate final usa esa función.
Complejidad de corte se mide separadamente y nunca justifica empeorar remanente
a igual cantidad de placas bajo el objetivo solicitado.

El motor también contiene desempates internos por profundidad. Se conservan
en A; no se cambia silenciosamente el comparador ni se confunde con el gate
externo de remanente. Todos los resultados cumplen los límites físicos/XML.

## Presupuestos y estados de terminación

```ts
budget = {
  maxExpansions,
  maxAndCombinations,
  maxFrontierEntries,
  maxMaterializations,
};
diversity = { maxVariantsPerUsageVector };
```

Todos son enteros positivos obligatorios, por pedido completo, sin reiniciarse
por rectángulo ni nivel. Un piloto acotado fija valores antes de las corridas
puntuadas; valores, orden, semilla y políticas quedan en el manifiesto.

- `maxExpansions`: admisiones de expansión OR, cobradas antes de expandir.
- `maxAndCombinations`: pares candidatos examinados, incluso si se rechazan
  inmediatamente por demanda, geometría o etapas.
- `maxFrontierEntries`: entradas vivas totales, reservadas antes de insertarlas;
  es un límite de ocupación, no un límite acumulado de inserciones. El trabajo
  acumulado queda acotado por expansiones/combinaciones. Registrar ambos valores.
- `maxMaterializations`: intentos completos, incluidos los fallidos, cobrados
  antes de construir el artefacto físico.

Estados: `COMPLETE`, `WORK_LIMIT`, `INVALID`, `OPERATIONAL_ABORT`.
Al agotar presupuesto se detiene la generación y se devuelve sólo lo construido
y validado. No declarar imposibilidad u optimalidad. Las expulsiones por cupo
de diversidad marcan `searchRestricted=true` aunque la búsqueda termine.
Una frontera interrumpida nunca se cachea como completa o como un no-good exacto.

El reloj sólo mide y puede actuar como fusible operacional. Un aborto por reloj
o memoria es inconcluso, se conserva en el informe y no se elimina de la cohorte.
Los límites de entradas no garantizan por sí solos un máximo de bytes: contabilizar
también árboles retenidos, referencias, tamaño del cache y memoria observada.

Ni tiempo medido ni presión de memoria deben ordenar/expulsar candidatos en una
corrida válida. Si se usa costo de materialización para desempatar, es una
estimación determinista de trabajo, no duración observada.

## Telemetría y repetición estructural

| Métrica | Significado |
|---|---|
| `geometryStates` | Claves geométricas/contextos distintos |
| `demandStates` | Pares distintos de geometría y consumo/disponibilidad |
| `frontierPeak` | Máximo de entradas vivas globales; informar también máximo por geometría |
| `frontierInserted` | Inserciones acumuladas, incluidas reemplazadas después |
| `frontierPruned` | Descartes, desglosados en duplicado, dominancia demostrada y cupo heurístico |
| `duplicateUsageVectors` | Llegadas con consumo ya presente en esa geometría; no implica duplicado físico |
| `andPairsConsidered` | Todo par examinado, antes del primer filtro |
| `andPairsAccepted` | Pares que pasan compatibilidad; separarlos de las inserciones posteriores |
| `materializations` | Intentos, éxitos y fallos, medidos por separado |
| `cacheHits`, `cacheMisses` | Reutilizaciones de estado, con costo de claves y recuperación |
| `logicalRequests` | Solicitudes de resolución, incluidas las atendidas por caché |

El diagnóstico busca distinguir geometrías repetidas de estados realmente
equivalentes después de considerar consumo, etapas y contexto. No inferir
reutilización útil sólo de contar rectángulos iguales o cache hits.

Instrumentar A en copia aislada; exigir pool/plan idénticos con y sin observación
antes de interpretar sus contadores. Separar las corridas instrumentadas de las
mediciones de rendimiento para no atribuir al algoritmo el costo del observador.

## Q1, Q2 y Q3 se reportan por separado

**Q1 — Validez física.** Cada patrón materializado coincide con su propio vector
de consumo y pasa validación industrial. Un patrón de una placa no debe cubrir
por sí solo el pedido entero. En el plan final: `invalid=0`, `missingPieces=0`,
`duplicatePieces=0`, demanda exacta, trazas completas y XML físicamente válido.
Registrar candidatos inválidos aunque se descarten y el fallback final sea válido;
no declarar Q1 PASS ocultándolos. Un candidato aún incompleto no es un plan válido.

**Q2 — Calidad suficiente.** Por caso: `boardsCandidate <= boardsBaseline`; si
empatan, `compararCalidad(remnantCandidate, remnantBaseline) >= 0`. No se exige
igualdad de pools ni igualdad de plan entre A, B y C. La mejora de placas tiene
prioridad sobre el remanente. Mostrar resultado propio y resultado con fallback
separadamente: devolver siempre A no demuestra calidad del nuevo generador.

**Repetibilidad.** Tres procesos nuevos por configuración, con idénticos input,
semilla, orden, presupuestos y política, producen el mismo `fullPlanHash` dentro
de cada variante. Registrar también `patternPoolHash` canónico para localizar
cambios aunque el Master termine eligiendo el mismo plan. No ordenar por reloj.

**Q3 — Costo.** Medir `patternGenCPU`, `materializationCPU`, `masterCPU`, `totalCPU`
y `peakMemory` con fases exclusivas; indicar validación/orquestación y evitar
sumar medidas anidadas dos veces. Incluir toda reconstrucción, fallback y monotipo.
También registrar wall, calentamiento, orden de ejecución y huella de entorno.
CPU es tiempo del proceso; RSS/heap y memoria del proceso completo tienen alcance
distinto y deben etiquetarse. Empezar con ejecución serial para atribuir diferencias.

Comparaciones emparejadas y repetidas sobre entradas idénticas, alternando el
orden A/B; añadir C posteriormente bajo el mismo protocolo. Antes de puntuar se
versionan presupuestos y criterio numérico de ahorro; no ajustar el umbral tras
ver resultados. Publicar todos los casos, límites y regresiones, además de medianas,
totales y distribución. No prometer un porcentaje antes de medir.

Un resultado Q1/Q2 positivo con Q3 negativo puede justificar estudiar un rescate
selectivo; no la sustitución del generador. Un pool diferente puede aprobar los
tres criterios. Un algoritmo rápido que pierde una placa en un caso no aprueba Q2.

## Secuencia de evaluación

1. Referencia de código fijada; finalizar certificación Kernel V1 antes de promoción.
2. B: `4057401` y `4056900`, luego completar cinco sentinelas, con resultados de
   referencia 4, 6, 7, 8 y 17 placas para `4057401`, `4056900`, `4050594`,
   `4058501` y `4059200`. Son techos de no regresión; una mejora válida se admite.
3. `4020442`, para observar crecimiento de la frontera con 16 tipos.
4. Los 213 hotspots exactos, con manifiesto, hash de identidades y resultados
   nuevos de referencia bajo la misma configuración; no reemplazarlos por tiempos
   históricos de otra máquina.
5. Los 8.168 factibles del corpus físico fijado y sus repeticiones. Las exclusiones
   y los 482 imposibles se conservan como controles del parser, no como ejecuciones
   exitosas del generador. Fallar en un caso detiene la promoción, sin borrar evidencia.

C utiliza las mismas puertas cuando se implemente. Q1/Q2/Q3 positivos en los
213 justifican diseñar V2; no equivalen a certificación de los 8.168.

## Alcance de la literatura incorporada

- **Relajación:** Velasco y Uchoa (2019) estudian demanda limitada, con y sin
  rotación, sin límite de etapas. X/X2 ajustan pesos mediante programación entera;
  X2D agrega procedimientos primales. No es una receta AND/OR sin dependencias
  adicionales. Sus cotas del problema de valor por placa no certifican por sí
  solas el número mínimo de placas del pedido. En este experimento sólo queda
  prevista la extensión; los pesos no son duales del Master existente.
  [Artículo del editor](https://www.sciencedirect.com/science/article/pii/S0377221718305393).
- **Multinivel:** Pan (2024) construye por DP composiciones horizontales y
  verticales de patrones, partiendo de arreglos homogéneos. El trabajo es
  unconstrained y utiliza tamaños normales para reducir cálculo. Su nivel de
  composición no equivale a una etapa física/XML de nuestro motor. C deberá
  mantener ambas nociones y verificar el árbol con el validador existente.
  [Artículo del editor](https://www.sciencedirect.com/science/article/pii/S1524070324000080).
- **Anti-redundancia:** el artículo de 2024 en Computers & Operations Research
  mejora una DP unconstrained e incorpora paralelización. En la formulación
  descrita las dimensiones son enteras y no hay rotación. Las aceleraciones
  publicadas pertenecen a ese dominio; aquí no se extrapolan. Una normalización
  que omita cortes bajo nuestro kerf/veta/etapas necesita prueba de equivalencia,
  o debe identificarse como restricción heurística del espacio de búsqueda.
  [Artículo del editor](https://www.sciencedirect.com/science/article/pii/S0305054823003544).

Se verificaron resúmenes y secciones públicas indexadas de los editores, no los
textos completos de los tres artículos. Las propuestas de adaptación de arriba
son hipótesis del experimento, no resultados atribuidos a esas publicaciones.
