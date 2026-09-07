# V20 — auditoría DFF y costo de la cheap LB (2026-09-06)

## Contexto

Durante la corrida parcial de `OPTIMIZER_POST_BASELINE_CHEAP_LB_EXPERIMENTAL=1` se observó que los primeros certificados reportaban `claude:kerf` y que `cheapMs` era muy superior al costo histórico aislado de DFF. Esta auditoría usa los 213 casos exactos del marcador `experiencia/v6/hotspot-all.jsonl` (excluyendo el único `engineCacheHit`) y los XML exactos recuperados del corpus histórico.

## DFF sí está corriendo

Sobre los 213 casos exactos, usando `claude-lower-bounds.cjs` con Raster apagado:

- binding final: `area=179`, `kerf=24`, `dff=10`;
- DFF eleva la cota de área en `34/213` casos;
- entre los `130` casos cuyo baseline queda por encima del área, DFF certifica `20`;
- en los `105` casos F1 (`baseline = area + 1`), DFF certifica `19`;
- kerf certifica `16` de esos F1.

La razón por la que DFF casi no aparece como `binding` es el desempate: `computeLowerBound` considera `kerf` antes que `dff` y sólo cambia el binding cuando el nuevo valor es estrictamente mayor. En los primeros tres certificados observados en la corrida parcial:

| orden | baseline | area | kerf | dff | binding |
|---|---:|---:|---:|---:|---|
| 4055664 | 12 | 11 | 12 | 12 | kerf |
| 4060002 | 6 | 5 | 6 | 6 | kerf |
| 4050868 | 8 | 7 | 8 | 8 | kerf |

DFF también certifica los tres; simplemente empata con kerf y por eso no queda como etiqueta.

En los 20 certificados incrementales respecto del área, DFF alcanza el baseline en los 20. En 4 casos DFF aporta una placa que kerf no aporta; en 2 de esos 4 tampoco V14 alcanza el baseline.

## Paridad CJS vs TypeScript validado

Se comparó el port conectado `src/lib/optimizer/experimental/claude-lower-bounds.cjs` contra el artefacto compilado desde el `src/lib/optimizer/bounds/lower-bounds.ts` validado del bundle `experimental/lower-bounds`.

Con `usarRaster=false` y `usarProyeccionK=false` para comparar exactamente la intersección implementada por ambos módulos:

- `area`: 0 diferencias / 213;
- `kerf`: 0 diferencias / 213;
- `dff`: 0 diferencias / 213;
- `proyeccion`: 0 diferencias / 213;
- `clique`: 0 diferencias / 213;
- `best`: 0 diferencias / 213.

Luego se habilitó `proyeccionK` en el TypeScript validado:

- casos donde `proyeccionK` eleva el máximo en estos 213: `0`;
- certificados adicionales en estos 213: `0`.

Conclusión: migrar al TypeScript validado sigue siendo correcto para tener una sola fuente de verdad y evitar nueva divergencia, pero no explica ni cambia el resultado de DFF de este benchmark.

## Por qué 64/231 históricos no contradice 19/105 actuales

El dato histórico `DFF certifica 64/231 F1` pertenece a otra cohorte y otra semántica de selección. La tabla histórica se calculó sobre 1826 casos consistentes, con F1 definido respecto de `boards40` y con las condiciones de trim usadas en esa ablación. El hotspot actual mide `baseline - areaLB` sobre 213 casos cuyo parser canónico usa `trim=0/0` para estos XML. No son universos intercambiables.

## Costo: 0.2905 ms no es comparable con `cheapMs`

El `0.2905 ms` histórico corresponde a **DFF aislada**, con warmup, sobre los 1826 casos de la ablación. `cheapMs` actual mide `computeHybridLowerBound` completo:

1. Strong LB V14;
2. cascada Claude sin Raster: área + kerf + DFF + proyección + clique;
3. ensamblado del resultado híbrido.

En este entorno, sobre los 213 exactos:

| subconjunto | V14 mean | Claude mean | hybrid mean | hybrid p50 | hybrid p95 |
|---|---:|---:|---:|---:|---:|
| 213 completos | 1.067 ms | 1.939 ms | 3.006 ms | 1.443 ms | 7.361 ms |
| 130 fuera de área | 1.375 ms | 1.533 ms | 2.908 ms | 1.325 ms | 5.584 ms |
| 105 F1 | 0.241 ms | 1.512 ms | 1.753 ms | 1.361 ms | 4.194 ms |

Existe un outlier de V14 de ~149 ms en el conjunto completo; su clique trabaja por instancias y puede ser mucho más caro que la DFF. Por eso el número histórico de DFF aislada no debe compararse directamente con `cheapMs`.

La máquina Windows de la corrida parcial reporta ~25 ms promedio en sólo 9 ejecuciones, bastante por encima de esta medición. Eso merece instrumentación por subcomponente (`v14` vs `claudeCascade`) en esa máquina antes de atribuir el costo al port. La paridad término-a-término descarta que una divergencia funcional de DFF sea la causa.

## Decisión

1. No modificar la corrida V20 en curso.
2. No atribuir la ausencia visual de `dff` a un fallo: el binding oculta empates con kerf.
3. Cuando termine el A/B, migrar el módulo validado TypeScript como fuente única y generar/adaptar el CommonJS mecánicamente.
4. Si el costo sigue siendo relevante, instrumentar `timingsMs.v14` y `timingsMs.claudeCascade` en el runner; no micro-optimizar DFF a ciegas.
