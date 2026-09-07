# Benchmark F1 pesado — V15 híbrido

## Objetivo

Combinar:

- Strong Lower Bound V14
- Kerf + DFF + Projection + Clique de Claude
- Raster condicional
- Integrality Repair
- Pattern Master incremental 20→40

y medir específicamente la cola F1 pesada.

Definición usada:

```text
F1:
boards40 = areaLB + 1

Heavy:
piece_count >= 20
types >= 8
```

El ranking de la muestra principal se hizo por costo histórico de `generarPatrones` en 20 rondas.

---

# 1. Integración realizada

Se agregaron experimentalmente:

```text
src/lib/optimizer/experimental/
  claude-lower-bounds.cjs
  hybrid-lower-bound.cjs
  v10-hybrid-pipeline.cjs
```

La cota híbrida calcula:

```text
cheap =
max(
  Strong LB V14,
  Kerf,
  DFF,
  Projection,
  Clique
)
```

Sólo si la etapa barata no certifica se considera Raster.

Para la ruta staged:

```text
pre-master
→ Hybrid LB
→ 20 rounds
→ Integrality Repair
→ incremental 21..40
```

---

# 2. Top 50 F1 más caros

Criterio:

- F1
- >=20 piezas
- >=8 tipos
- top 50 por tiempo histórico `generarPatrones` de 20 rondas.

Resultados:

```text
casos: 50
boards20 == boards40: 50/50
```

## Certificación

### Strong LB V14

```text
0 / 50
```

### Híbrido barato

```text
7 / 50
```

### Híbrido + Raster

```text
7 / 50
```

Raster:

```text
0 certificados adicionales
```

## Seguridad

```text
lowerBound > solución V10-40: 0
```

---

# 3. Costo histórico de esos 50 pedidos

Los 50 acumulan:

```text
2.105.454 ms
```

de `generarPatrones` histórico de las primeras 20 rondas.

Los 7 pedidos certificados por la nueva cota acumulan:

```text
324.452 ms
≈ 324,5 s
```

de generación histórica.

Esto NO significa automáticamente que se ahorren exactamente 324,5 s, porque esa métrica corresponde a las primeras 20 rondas históricas y la certificación puede ocurrir en diferentes puntos del pipeline.

Sí demuestra que las nuevas cotas están alcanzando precisamente algunos de los pedidos donde Pattern Master es costoso.

---

# 4. Costo de la cota en Top 50 pesado

## Sin Raster

```text
avg   ~3,19 ms
p50   ~1,85 ms
p95   ~8,35 ms
```

Certificados:

```text
7
```

## Con Raster

```text
avg   ~9,36 ms
p50   ~6,78 ms
p95   ~22,56 ms
max   ~42,10 ms
```

Certificados:

```text
7
```

Conclusión:

> En el Top 50 F1 pesado, Raster multiplicó aproximadamente por 3 el costo de la cota y no certificó ningún pedido adicional.

Por lo tanto no conviene usar Raster de forma general en la cola pesada.

---

# 5. F1 pesado completo

Total elegible:

```text
156 casos
```

Resultados:

| Método | Certificados |
|---|---:|
| Strong LB V14 | 4 |
| Híbrido barato | **31** |
| Híbrido + Raster | **32** |

Raster agrega:

```text
1 / 156
```

caso.

## Costo histórico asociado

Generación histórica total de estos 156:

```text
3.181.477 ms
```

Casos certificados por V14:

```text
36.296 ms
```

Casos certificados por híbrido completo:

```text
586.192 ms
```

Incremento frente a V14:

```text
549.896 ms
≈ 550 s
```

de `generarPatrones` histórico concentrado en pedidos ahora certificables.

Nuevamente: es una medida de la importancia/costo histórico de los casos capturados, no un ahorro wall-clock garantizado de exactamente 550 segundos.

---

# 6. Timing F1 pesado completo

## Híbrido barato sin Raster

```text
avg  ~0,94 ms
p50  ~0,69 ms
p95  ~2,50 ms
```

Certifica:

```text
31 / 156
```

## Con Raster

```text
avg  ~4,43 ms
p50  ~2,40 ms
p95  ~13,48 ms
```

Certifica:

```text
32 / 156
```

Conclusión:

> Raster compra un único certificado adicional en toda la cohorte pesada y aumenta varias veces el costo medio.

---

# 7. Política adaptativa para Raster

Se probó:

```text
Raster sólo si:
pieces <= 40
AND
types <= 16
AND
cheap LB no certificó
```

Sobre los 1.826 casos históricos consistentes:

```text
cheap certificados:       1.653
total con política:        1.658
Raster corridas reales:       64
certificados extra Raster:     5
unsafe:                        0
```

Costo medio de la cota híbrida completa con esta política:

```text
~0,49 ms / caso
```

Esta política conserva los Raster wins conocidos de la prueba y evita Raster en casi toda la cola pesada.

---

# 8. Ejecuciones reales F1 pesado

## Caso 4057094

Características:

```text
98 piezas
20 tipos
areaLB = 5
V10-40 histórico = 6
```

Pipeline híbrido:

```text
6 placas
validación industrial: OK
```

Salida:

```text
strong-lower-bound-certified-pre-master
```

Binding:

```text
Kerf
```

Timing medido en el entorno actual:

```text
total hybrid:     ~22.984 ms
pre-master:       ~22.956 ms
lower bound:           28 ms
Pattern Master:         0 ms
```

Es decir:

> la cota consumió ~28 ms y evitó Pattern Master por completo.

La corrida Legacy completa aislada no terminó dentro de 180 s en este mismo entorno.

No uso ese timeout como ratio de speedup preciso, pero sí confirma que la rama eliminada puede ser extremadamente costosa.

---

## Caso 4050838

Características:

```text
85 piezas
26 tipos
areaLB = 5
V10-40 histórico = 6
```

Pipeline híbrido:

```text
6 placas
validación industrial: OK
```

Salida:

```text
strong-lower-bound-certified-pre-master
```

Binding:

```text
Kerf
```

Timing:

```text
total hybrid:     ~23.806 ms
pre-master:       ~23.774 ms
lower bound:           32 ms
Pattern Master:         0 ms
```

Otra vez, la parte matemática cuesta decenas de milisegundos frente a un pedido con decenas de segundos de trabajo previo.

---

# 9. Qué aporta realmente cada componente

## Kerf

En los casos F1 más caros fue sorprendentemente importante.

Ejemplos certificados:

- 4058921
- 4057027
- 4057094
- 4050838
- 4059130
- 4050868

Es una señal industrial coherente:
la cota de área pura ignora el espacio consumido por la sierra.

---

## DFF

También aporta certificados que Kerf no consigue.

Ejemplo:

```text
4060221
areaLB = 10
DFF = 11
boards = 11
```

DFF sigue siendo la técnica con mejor capacidad general de la propuesta de Claude.

---

## Strong LB V14

Sigue siendo válido, pero en la cola F1 pesada concreta del Top 50:

```text
0/50 certificados
```

Por eso no conviene depender sólo de incompatibilidad/proyección geométrica.

---

## Raster

Útil en pedidos chicos y discretizados.

Muy poco rentable en F1 pesado.

Debe permanecer como segunda etapa condicional.

---

# 10. Arquitectura resultante

La versión que recomiendo después del benchmark es:

```text
V10 pre-master
       ↓
CHEAP HYBRID LB
 max(
   Strong V14,
   Kerf,
   DFF,
   Projection,
   Clique
 )
       ↓
¿certifica?
 sí → STOP
 no
       ↓
¿pedido chico/medio?
 pieces <= 40
 types <= 16
       ↓
Raster
       ↓
¿certifica?
 sí → STOP
 no
       ↓
Pattern Master 0..19
       ↓
Integrality Repair
       ↓
Pattern Master incremental 20..39
```

---

# 11. Seguridad

La integración mantiene:

- V10 legacy sin modificar.
- fallback 20→40.
- Integrality Repair no corta búsqueda sin certificado.
- Raster puede omitirse sin afectar calidad; sólo reduce capacidad de certificar.
- toda solución sigue pasando `validador_industrial_v3`.

Cotas Claude ya habían pasado:

```text
13.000 instancias exactas
0 violaciones
```

En este benchmark F1:

```text
0 cotas > V10-40 válido
```

---

# 12. Decisión

## Incorporar

- Kerf.
- DFF.
- Projection/Clique.
- max con Strong LB V14.
- cascada barata antes de Pattern Master.

## Raster

Mantener, pero sólo condicional.

## Integrality Repair

Mantener después de 20 rondas para los pedidos que ninguna cota consigue certificar.

## Pattern Master 21..40

Mantener como fallback seguro.

---

# Conclusión

El benchmark F1 pesado confirma que combinar la propuesta de Claude con V14 es una mejora real.

El dato más importante:

```text
Top 50 F1 más caros:
V14       0 certificados
Híbrido   7 certificados
```

y esos siete pertenecen a una cohorte que históricamente acumuló más de 324 segundos de generación de patrones en las primeras 20 rondas.

En los 156 F1 pesados:

```text
V14          4
Hybrid cheap 31
Hybrid full  32
```

La mejora no viene de añadir más búsqueda.

Viene de poder demostrar, en aproximadamente un milisegundo en el conjunto pesado, que ciertas búsquedas no pueden mejorar la cantidad de placas.
