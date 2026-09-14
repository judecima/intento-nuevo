# Evaluación de AND/OR Graph Search para generar patrones

Fecha: 2026-09-11.
Referencia del motor: Kernel V1 `4063963260abb10c8d68d0e553942899c925cc2f`.
Estado: evaluación de arquitectura y evidencia; sin implementación ni aceleración medida.

Ampliación acordada con el usuario: [Pattern Generator Architecture Experiment](PATTERN_GENERATOR_ARCHITECTURE_EXPERIMENT_2026-09-11.md).
Ese contrato precisa los brazos A/B/C, fronteras por consumo, diversidad,
presupuestos, telemetría, Q1/Q2/Q3 y las alternativas de relajación y DP multinivel.
Rige el diseño experimental cuando agrega detalle a esta evaluación inicial.

## Dictamen

AND/OR es una alternativa pertinente para generar patrones de corte guillotina.
Recomiendo un generador experimental por placa, con presupuesto determinista y
reutilización de subproblemas, que entregue el contrato `{uso, area, placa}` al
Master existente. No hay evidencia todavía para sustituir las 40 rondas actuales.

Esta evaluación responde al pedido de explorar AND/OR. No modifica el runtime
del Kernel V1, no completa su certificación ni reabre automáticamente los
experimentos V21/V22. Una integración futura cambiaría el conjunto de patrones
y necesitaría una nueva referencia y validación.

## Evidencia del repositorio

- `legacy/patrones.cjs:26`: el generador repite `optimizar` sobre subconjuntos de
  tipos; cada ronda ejecuta dos pases y conserva placas por vector de consumo.
  V10 pasa 40 rondas por defecto; `generarPatrones` aislado tiene default 60.
- `legacy/patrones.cjs:62`: se agregan patrones monotipo mediante más llamadas
  al motor. La deduplicación principal ocurre después de construir las placas.
- `legacy/cobertura.cjs`: el Master exige cobertura exacta de cantidades,
  mediante igualdades, y recibe patrones físicos materializables.
- `legacy/motor.cjs:373`: `llenar` consume un pool mutable compartido. La
  contracción real de la rebanada cambia el límite del siguiente hermano.
- El diagnóstico versionado de `4020442` registra 21.916 ms totales y 10.028 ms
  en Master; el solver de cobertura ejecutó un nodo y registró 0 ms. El costo
  de esa etapa se encuentra fundamentalmente antes del solver.
- El 96,24 % histórico corresponde a generación + monotipo dentro de Master,
  no al tiempo total del optimizador ni a una aceleración ya disponible.

Fuentes locales: `freeze/KERNEL_V1_MASTER_PATTERN_GENERATION_BOUNDARY_2026-09-08.md`,
`STATUS.md` y `v12-v19/V19_CROSS_ROUND_MEMO_REJECTED.md`.

La memoización V19 no demostró una mejora: en `4058501`, con 40 rondas y pool
idéntico, pasó de 19,22 s a 20,17 s. Construir claves y reconstruir placas puede
costar más que recalcular. AND/OR debe demostrar ahorro neto, no sólo cache hits.

## Modelo propuesto

Un nodo OR representa un subrectángulo y las alternativas legales para cortarlo
o dejarlo como pieza/remanente. Elegir un corte crea un nodo AND: deben resolverse
y combinarse ambos subrectángulos. Un grafo comparte subproblemas equivalentes
que un árbol resolvería repetidamente.

Las regiones sólo son independientes después de asignarles recursos. No se
puede resolver cada mitad usando toda la demanda y sumar las soluciones.

Dos formulaciones posibles:

1. Estado `(ancho, alto, dirección, etapas disponibles, vector de cantidades)`;
   se enumeran asignaciones de cantidades compatibles a los hijos.
2. Estado geométrico con una frontera de alternativas `(vector de consumo,
   árbol de cortes, calidad)`; se combinan alternativas cuya suma no exceda
   la demanda. La frontera también puede crecer exponencialmente.

Prefiero explorar la segunda con generación perezosa y límites explícitos,
conservando diversidad por vector de consumo. Es una propuesta, no un resultado.

El contexto de cada búsqueda debe fijar medidas de corte efectivas, kerf, trim,
veta/rotación por tipo, política de etapas y cortes terminales, objetivo de
remanentes y precisión geométrica. Las claves no pueden fusionar referencias
distintas sólo porque sus medidas coincidan. Las coordenadas pueden ser locales
al subrectángulo; trazas e identidades se materializan al construir el plan.

La profundidad del árbol binario de búsqueda no equivale directamente a las
etapas físicas/XML de este motor. El adaptador debe respetar ese contrato y la
contracción real de las rebanadas.

## Riesgo combinatorio observado en el corpus

Inspección estática del preflight físico de 8.168 casos factibles, sin optimizar.
Se calculó `producto(cantidad_i + 1)` sobre los tipos que entrega el parser:

| Pedido | Tipos | Piezas | Combinaciones del vector de cantidades |
|---|---:|---:|---:|
| 4057401 | 4 | 19 | 270 |
| 4056900 | 4 | 94 | 329.375 |
| 4058501 | 11 | 50 | 56.595.000 |
| 4020442 | 16 | 50 | 122.653.440 |
| 4050594 | 14 | 103 | 340.376.478.750 |
| 4059200 | 17 | 64 | 32.659.200.000 |

Son combinaciones teóricas, no estados alcanzables ni mediciones de rendimiento.
Muchas no entran en una placa. El producto explica por qué una tabla exhaustiva
con todas las cantidades no es una buena implementación inicial.

Tampoco alcanza con guardar sólo el patrón de mayor área para cada rectángulo:
el Master necesita composiciones diferentes. Con demanda exacta de tres piezas,
descartar un patrón de una pieza porque existe otro de dos puede impedir una
cobertura exacta. La dominancia componente a componente no es segura en general.

## Experimento que permitiría decidir

1. Implementar fuera de `src/lib/optimizer/**`, sin invocación desde producción.
2. Comenzar con `4057401` y `4056900`, luego todos los cinco sentinelas y
   `4020442`. Son clases distintas de repetición, demanda y costo; no tratarlas
   como una muestra representativa del universo.
3. Generar árboles compactos por placa y vectores de consumo; materializar los
   candidatos y pasarlos por el validador industrial y el exportador existentes.
4. Medir expansiones, estados únicos, combinaciones AND, tamaño de fronteras,
   cache hits, memoria, CPU de búsqueda y costo de materialización por separado.
   Limitar trabajo por contadores deterministas; un límite alcanzado significa
   búsqueda incompleta, no optimalidad ni imposibilidad demostrada.
5. Comparar el plan final de ambos pipelines con la misma configuración, máquina
   y presupuestos. Exigir cero invalidos, cero piezas faltantes, cero regresiones
   de placas y remanentes, trazas completas y repetibilidad del candidato.
6. Mantener los ganadores de sentinelas: 7, 6, 4, 8 y 17 placas respectivamente
   para 4050594, 4056900, 4057401, 4058501 y 4059200.
7. Tras pasar los casos dirigidos, medir los 213 hotspots y la cohorte completa;
   decidir sustitución por ahorro neto repetido, no por una sola corrida.

Agregar patrones al pool actual sirve para medir diversidad/calidad, pero no
prueba ahorro porque conserva el costo del generador viejo. Además, aun añadir
columnas puede cambiar el recorrido de un Master con presupuesto finito; debe
compararse el resultado completo y conservarse el plan incumbente validado.

No hay multiplicadores de LP disponibles en el Master actual. Usar precios
duales para orientar la búsqueda sería otra ampliación; pesos heurísticos no
deben presentarse como duales ni como certificados.

## Fuentes primarias consultadas

- Morabito y Arenales (1996), *Staged and constrained two-dimensional guillotine
  cutting problems: An AND/OR-graph approach*. El resumen describe la extensión
  a cantidades restringidas y etapas. Se consultó la vista indexada del editor;
  el texto completo no estuvo disponible.
  https://www.sciencedirect.com/science/article/pii/037722179500128X
- Morabito y Pureza (2010, publicación en línea 2008), *A heuristic approach
  based on dynamic programming and and/or-graph search for the constrained
  two-dimensional guillotine cutting problem*. El resumen describe combinación
  de relajación de estados, búsqueda AND/OR y reparación a factibilidad.
  Se consultó el resumen del editor, no el artículo completo.
  https://link.springer.com/article/10.1007/s10479-008-0457-4
- Marinescu y Dechter, *Memory Intensive AND/OR Search for Combinatorial
  Optimization in Graphical Models*. El resumen de los autores describe
  búsqueda con caché adaptativa, tanto en profundidad como best-first. Sus
  resultados sobre modelos gráficos no miden este problema de corte.
  https://ics.uci.edu/~dechter/publications/r153a.html

La adaptación concreta, las claves, el análisis del corpus y el experimento
propuesto son inferencias de esta revisión del repositorio. Las publicaciones
respaldan la pertinencia del enfoque, no su rendimiento en este kernel.
