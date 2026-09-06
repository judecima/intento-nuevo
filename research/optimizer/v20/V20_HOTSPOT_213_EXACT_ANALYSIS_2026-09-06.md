# V20 — análisis exacto del hotspot de 213 casos

Fecha: 2026-09-06
Rama: `optimizer-v19-premaster-profile`

## Marcador congelado

Se usa `experiencia/v6/hotspot-all.jsonl` excluyendo el único `engineCacheHit`.

- casos: 213
- placas: 2371
- total: 14,247,507 ms
- gate temporal fijado: <= 12,110,000 ms

El ZIP `resto.zip` contiene 213/213 XML del marcador. La reconstrucción independiente del input reproduce exactamente, caso por caso, `pieceCount` y `areaLB/cota` para los 213.

## Control de arnés

Se ejecutaron los primeros 20 casos con V10 legacy y se reprodujeron 20/20 `boards` y `cota` sin diferencias.

El entorno local fue ~17% más lento que el marcador en esos 20, por lo que no se usa el tiempo absoluto de esta máquina para decidir performance. La comparación de ahorro se deriva de las etapas ya medidas en el marcador congelado.

## Cota CJS real conectada

Se ejecutó exactamente la implementación CJS de la rama:

- `experimental/claude-lower-bounds.cjs` con Raster OFF
- `experimental/strong-lower-bound.cjs`
- `experimental/hybrid-lower-bound.cjs`

Se contrastó además contra una réplica matemática independiente y hubo 0 diferencias de LB en 213/213 casos.

Costo de la Hybrid Cheap LB sobre los 213:

- total: 714.6 ms
- promedio: 3.35 ms
- p50: 1.51 ms
- p95: 7.99 ms
- p99: 19.91 ms
- máximo: 151.85 ms

En V20 los casos que ya cierran por área retornan antes de ejecutar la cheap LB, por lo que el overhead realmente agregado al marcador es menor (~427 ms para los casos no certificados directamente por área).

## Certificación post-baseline

Importante: para este fast-path la comparación correcta es contra las placas del **baseline**, no contra el plan final después de rescates.

- `baseline == areaLB`: 83 casos
- `baseline == cheapLB`: 103 casos
- certificaciones incrementales de Cheap LB sobre área: 20 casos
- violaciones `cheapLB > baseline físico`: 0

De las 20 certificaciones incrementales:

- 19 tienen gap post-baseline `+1`
- 1 tiene gap `+43` (`4055545`, cerrado por DFF/V14 `both>half`)

El conteo anterior de 85 casos `finalBoards == areaLB` incluía dos pedidos en los que una etapa posterior reducía placas hasta la cota. Esos dos **no** son certificables inmediatamente después del baseline y, por tanto, no deben contarse para este fast-path.

## Ahorro histórico atribuible al fast-path

Sumando únicamente etapas que desaparecerían en los 103 casos certificados, usando `stageMs` del marcador congelado:

- compactación evitada: 134,292 ms
- MultiSlice evitado: 277,457 ms
- OneBoard evitado: 0 ms
- Pattern Master evitado: 1,474,267 ms
- **total evitado: 1,886,016 ms**

Esto representa **13.2375%** del marcador.

Incluyendo ~427 ms de overhead de Cheap LB, la proyección neta queda aproximadamente en:

- total proyectado: **12,361,918 ms**
- mejora neta: **13.2345%**
- distancia al gate de 12,110,000 ms: **+251,918 ms**

Por lo tanto, con el gate definido antes de medir, el resultado es:

> **Correctness: PASS. Performance gate 15%: FAIL.**

No corresponde mover el gate después de ver el resultado.

## Por qué la estimación previa (~19.5%) fue demasiado optimista

La estimación extrapolaba la tasa `40/136 = 29.4%` de la cohorte F1 corregida con trim 10/10 hacia el hotspot histórico.

El marcador `hotspot-all.jsonl`, sin embargo, se construyó con la semántica canónica actual del parser histórico, que fija `trim = {x:0,y:0}` tanto para XML `project` como `order`. El atributo `trim` del árbol de cortes del XML project se conserva sólo como referencia y no se usa como trim canónico del benchmark.

Por eso la tasa de certificación observada en este hotspot no es 29.4%: en los gaps post-baseline `+1`, Cheap LB certifica 19/105 (~18.1%).

No se debe extrapolar directamente una cohorte `trim10` sobre un marcador `trim0`.

## Proyección k-aria del TS validado

Se evaluó offline el término `proyeccionK` de la implementación TS validada sobre estos mismos 213 inputs, sin modificar runtime.

Resultado:

- certificaciones adicionales sobre el CJS actual: **0**

Por lo tanto, migrar al `.ts` validado sigue siendo correcto por mantenimiento/seguridad y evita la divergencia de implementaciones, pero **no alcanza por sí solo para cruzar el gate temporal de este hotspot**.

## Conclusión

V20 post-baseline Cheap LB es una mejora real, segura y grande (~13.2% del hotspot), pero no cumple el gate de 15% fijado para Paso 1.

La siguiente ganancia necesaria para cruzar ese gate es de ~252 s sobre el marcador. Los candidatos de mayor retorno siguen siendo:

1. generación dirigida por familias de muebles para reducir trabajo de Pattern Master;
2. evitar re-resolución global de compactación mediante reparación local;
3. presupuesto/activación de Master condicionado por evidencia estructural/gap, sin aceptar regresiones de placas.

No agregar nuevas cotas antes de atacar esos bloques.
