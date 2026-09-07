# Informe — Pruebas del segundo ZIP de Claude

## Qué cambió respecto de la propuesta anterior

El nuevo `lower-bounds.ts` agrega una API de cascada:

```ts
computeLowerBoundCascade(lineas, opts, incumbente?, config?)
```

La idea es:

1. calcular primero una etapa barata sin Raster;
2. si ya certifica el incumbente, terminar;
3. ejecutar la cota completa con Raster sólo cuando haga falta.

Además el archivo incorpora explícitamente los resultados medidos sobre los 1.826 casos históricos consistentes.

---

## 1. Compilación

`lower-bounds.ts` compiló standalone con TypeScript 5.8.3.

Resultado: OK.

---

## 2. Oracle exacto independiente

Se repitieron las dos baterías exactas usadas en la evaluación anterior.

### Batería A
- 3.000 instancias guillotina pequeñas.
- 0 violaciones.

### Batería B
- 10.000 instancias con:
  - medidas fraccionarias;
  - kerf fraccionario;
  - rotación permitida/bloqueada;
  - repeticiones.
- 0 violaciones.

Total:

**13.000 / 13.000 instancias exactas sin lower bound por encima del óptimo guillotina real.**

Por cota:

| Cota | Violaciones |
|---|---:|
| Kerf | 0 |
| DFF | 0 |
| Raster | 0 |
| Projection | 0 |
| Clique | 0 |
| Todas | 0 |

La nueva cascada no agrega una fórmula matemática nueva: sólo decide cuándo correr Raster. Por lo tanto mantiene la seguridad de las cotas ya auditadas.

---

## 3. Cascada histórica

Sobre los 1.826 casos consistentes:

- etapa barata certifica: **1.653**
- Raster necesita correr: **173**
- combinación completa certifica: **1.659**
- Raster agrega sólo **6 certificados**
- costo medio total amortizado: **~0,60 ms/caso**
- costo de Raster cuando corre: **~2,74 ms**
- `generarPatrones` histórico asociado a esos 6 certificados extra: **~16.152 ms**

La cascada reproduce la economía esperada:
Raster queda fuera del camino rápido y sólo se paga en ~9,5% de los casos.

---

## 4. Comparación de capacidad de certificación

Familia F1:

`boards40 = areaLB + 1`

Casos F1 consistentes: 231.

Resultados medidos anteriormente y confirmados por esta versión:

| Método | F1 certificados |
|---|---:|
| Área | 0 / 231 |
| Strong LB V14 | 28 / 231 |
| Kerf | 28 / 231 |
| DFF | 64 / 231 |
| Raster | 43 / 231 |
| Projection | 47 / 231 |
| Clique | 41 / 231 |
| Todas las cotas Claude | **70 / 231** |

El incremento frente al Strong LB V14 es grande.

La mayor parte del valor proviene de DFF.

---

## 5. Evaluación de `computeLowerBoundCascade`

La API es correcta conceptualmente.

Puntos positivos:

- si la etapa barata certifica, no corre Raster;
- si no hay incumbente, devuelve la cota completa;
- `best` nunca se reduce respecto de la etapa barata;
- expone `etapa`, `rasterCorrio` y `bestBarata`, útiles para telemetría.

No encontré una regresión matemática introducida por la API.

### Ajuste que recomiendo para nuestro motor

No reemplazar directamente nuestro Strong LB V14.

Usar:

```text
cheapLB = max(
    strongLB_V14,
    Claude cheap cascade
)
```

donde la parte Claude barata incluya:

- area
- kerf
- DFF
- projection
- clique

y `usarRaster=false`.

Si `cheapLB` certifica el incumbente:
terminar.

Si no:
ejecutar Raster condicional y volver a tomar el máximo.

Esto conserva cualquier certificado que ya daba V14 y suma DFF/Kerf/Raster sin regresión.

---

## 6. Observación sobre los tests de Claude

El nuevo `lower-bounds.test.ts` está mejor que la versión anterior:

- agrega tests explícitos de la cascada;
- prueba configuración individual;
- veta;
- kerf;
- raster;
- proyección;
- clique;
- determinismo.

Sin embargo mantiene como comentario:

> “VALIDEZ CONTRA EL MOTOR REAL — Este es el test que importa”

Esa frase sigue siendo demasiado fuerte.

Comparar:

```text
lowerBound <= plan factible del motor
```

es una prueba útil de regresión, pero no demuestra validez matemática.

Nuestra prueba más fuerte sigue siendo el oracle independiente:

```text
lowerBound <= óptimo guillotina exacto
```

sobre 13.000 instancias.

Recomiendo mantener ambos tipos de test.

---

## 7. Decisión

La nueva versión de Claude mejora la propuesta anterior y su API de cascada es coherente con nuestros resultados.

### Recomiendo integrar experimentalmente

1. DFF.
2. Kerf.
3. Projection/Clique de Claude junto con nuestro Strong LB, usando `max`.
4. `computeLowerBoundCascade`.
5. Raster sólo como segunda etapa.

### No recomiendo

- reemplazar V14 Strong LB completamente;
- correr Raster siempre;
- eliminar Integrality Repair;
- eliminar Pattern Master fallback.

Arquitectura recomendada:

```text
V10 pre-Master
    ↓
max(
  Strong LB V14,
  Claude cheap LB:
  area + kerf + DFF + projection + clique
)
    ↓
¿certifica?
   sí → stop
   no
    ↓
Raster conditional
    ↓
¿certifica?
   sí → stop
   no
    ↓
20 rounds
    ↓
Integrality Repair
    ↓
incremental 21..40 fallback
```

## Conclusión

La segunda propuesta pasa las pruebas realizadas.

- compila;
- 13.000 oracles exactos: 0 violaciones;
- 1.826 casos históricos: cascada coherente;
- Raster se ejecuta sólo en 173 casos;
- DFF sigue siendo la mejora de mayor retorno;
- la nueva API de cascada es apta para una integración experimental.

El siguiente paso lógico es fusionar esta cascada con V14 detrás de feature flag y correr el benchmark F1 pesado antes de pasar al holdout completo.
