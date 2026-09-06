# Furniture Structure Baseline — 2026-09-06

## Objetivo

Medir si la cola lenta del optimizador parece estar dominada por geometría genérica/atípica o por pedidos con estructura productiva compatible con muebles.

Este análisis es **pasivo**: no cambia el solver, la generación de patrones ni los criterios de aceptación.

## Fuentes

- `experiencia/canonical_cases.json`: 20.844 casos canónicos.
- `benchmark_project_v10.csv`: 2.000 filas históricas.
- Join por `case_id` / nombre de XML: 1.999 casos emparejados.
- Script reproducible: `scripts/furniture-structure-report.mjs`.

## Métricas geométricas

Las familias son componentes de tipos de pieza conectados por una dimensión exacta compartida (ancho o alto). No se infieren etiquetas semánticas como lateral, estante, puerta o módulo.

Métricas principales:

- `pieceCount`: piezas totales.
- `pieceTypes`: líneas/tipos distintos.
- `repeatFactor = pieceCount / pieceTypes`.
- `maxMultiplicity`: máxima cantidad de una misma línea.
- `repeatedPieceRatio`: fracción de piezas perteneciente a líneas con cantidad > 1.
- `familyCoverageRatio`: fracción de piezas perteneciente a componentes con al menos dos tipos relacionados por dimensión compartida.

## Resultado

| Cohorte | n | mediana ms | p95 ms | piezas mediana | tipos mediana | repeatFactor | familyCoverage mediana | family >= 0.80 | family >= 0.95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Todos | 1.999 | 49 | 4.967 | 21 | 8 | 2,33 | 0,88 | 62,8% | 34,4% |
| Top 20 más lentos | 20 | 20.647 | 38.523 | 140,5 | 50,5 | 2,96 | **0,99** | **95%** | **70%** |
| Top 50 más lentos | 50 | 16.869 | — | 131,5 | 37 | 2,86 | **0,97** | **86%** | **66%** |
| Top 100 más lentos | 100 | 11.075 | — | 89 | 30,5 | 2,79 | **0,96** | **89%** | **53%** |

Correlación de Spearman contra tiempo (`ms`) en los 1.999 casos:

| Variable | rho |
| --- | ---: |
| `pieceTypes` | 0,4980 |
| `pieceCount` | 0,4688 |
| `maxMultiplicity` | 0,3084 |
| `familyCoverageRatio` | 0,2299 |
| `repeatFactor` | 0,0946 |
| `repeatedPieceRatio` | -0,0316 |

## Lectura

La hipótesis simple **“los casos más difíciles probablemente no son muebles” no queda respaldada por este baseline**.

La cola lenta muestra simultáneamente:

1. materiales típicos de fabricación de mobiliario (MDF, melamina y derivados) entre los pedidos más costosos;
2. mucha más estructura por dimensiones compartidas que el conjunto completo;
3. mayor cantidad de piezas y, especialmente, mayor cantidad de tipos.

La interpretación de trabajo más plausible es:

> una parte relevante de los casos difíciles puede ser mobiliario estructurado que el generador actual sigue tratando como subconjuntos genéricos de rectángulos.

Esto encaja con la generación actual por muestreo de líneas:

```js
const sub = r === 0 ? conRef : conRef.filter(() => R() > 0.45);
```

El resultado no prueba que cada familia geométrica sea un módulo de mueble. Sólo muestra que la estructura productiva existe en el pedido y puede medirse sin etiquetas semánticas.

## Implicación para V20

No cambiar las cotas inferiores: deben permanecer genéricas y seguras.

Investigar conocimiento de dominio en la **generación de candidatos**, inicialmente mediante instrumentación:

- `roundFound`: ronda de primera aparición más tardía entre las columnas elegidas por el Master;
- `maxSourceRound`: ronda más tardía de la variante física finalmente conservada;
- `patternOrigin`: `full`, `random`, `monotype` y, más adelante, orígenes dirigidos (`family-*`, `experience`, `repair`);
- estructura del pedido (`repeatFactor`, familias, cobertura y multiplicidades).

El primer experimento activo posterior a V19 debería comparar, bajo el mismo presupuesto y con gate de cero regresiones:

1. generación aleatoria actual;
2. generación híbrida: familias geométricas dirigidas + exploración aleatoria residual.

La métrica de interés no es sólo tiempo: hay que medir si las columnas ganadoras aparecen antes (`roundFound`) y si se puede retirar trabajo de las rondas 21–40 sin perder placas.
