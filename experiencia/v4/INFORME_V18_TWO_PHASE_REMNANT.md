# V18 — Separación de optimalidad de placas y refinamiento de remanente

## Objetivo

Reducir latencia percibida sin cambiar el objetivo lexicográfico del optimizador:

1. mínimo número de placas;
2. a igualdad de placas, mejor remanente;
3. luego runtime.

La idea V18 NO elimina Compactación.

Separa dos momentos:

```text
Fase primaria
Baseline
→ Hybrid Lower Bound
→ si certifica placas: devolver plan de placas óptimo

Fase de refinamiento
Compactación
→ sólo puede mantener placas y mejorar remanente
→ si mejora, reemplazar/actualizar el plan
```

Si el baseline NO queda certificado, se usa la ruta staged completa V17 y Compactación sigue en el camino crítico.

---

## 1. Hallazgo histórico

En el holdout histórico de 2.000:

- Compactación se activó: 1.392 veces.
- Casos donde Compactación se activó y no hubo rescates posteriores: 1.183.
- De esos, 1.182 no registraron ahorro de placas en Compactación.
- Tiempo de Compactación acumulado en esos 1.182: ~1.273 s.
- En 208 de esos casos Compactación sí produjo una mejora de remanente a igual número de placas.

Esto significa que hay una cohorte grande donde:

- el número de placas ya puede cerrarse antes;
- Compactación debe conservarse para calidad;
- pero no necesita bloquear la respuesta primaria al usuario.

---

## 2. Replay de latencia percibida

Se hizo un replay conservador sobre los 2.000:

- tiempo actual histórico = `totalMs`
- cuando el caso pertenece a la cohorte certificable previa:
  `primaryMs = totalMs - compactacionMs`

Resultado:

| Métrica | Histórico | Primary replay |
|---|---:|---:|
| promedio | 7.080 ms | **6.455 ms** |
| p50 | 713 ms | **332 ms** |
| p95 | 39.237 ms | 39.237 ms |
| p99 | 97.250 ms | 97.250 ms |

Ahorro agregado estimado:

**~8,83%**

La mejora principal es sobre p50/percepción interactiva.

No cambia p95/p99 porque la cola extrema está dominada por otros caminos pesados que siguen necesitando rescates.

---

## 3. Implementación

Nuevo módulo experimental:

```text
src/lib/optimizer/experimental/v10-two-phase-remnant.cjs
```

Expone:

```js
runPrimaryBoardPhase(lineas, config)
runRemnantRefinement(lineas, config, primaryPlan)
```

### `runPrimaryBoardPhase`

1. Ejecuta baseline V8/V10.
2. Ejecuta Hybrid LB:
   - Strong V14
   - Kerf
   - DFF
   - Projection
   - Clique
   - Raster adaptativo
3. Valida físicamente el baseline.
4. Sólo marca `certified=true` si:

```text
lowerBound >= baselineBoards
```

Si no certifica:

```text
boards-not-certified-use-full-staged
```

y debe utilizarse V17 completo.

### `runRemnantRefinement`

Sólo se usa después de una certificación.

Ejecuta la misma Compactación de franjas muertas y acepta:

- menos placas, si apareciera de forma inesperada pero válida;
- o mismas placas + mejor remanente.

Nunca acepta más placas.

---

## 4. Pruebas directas

### Caso 4051587

Características:

- 68 piezas
- 34 tipos

Fase primaria:

```text
boards = 5
LB = 5
certified = true
tiempo ≈ 3,2 s
```

Refinamiento:

```text
tiempo ≈ 6,5 s
accepted = true
motivo = same-boards-better-remnant
```

Legacy síncrono completo:

```text
≈ 10,4 s
```

Resultado final V18 después del refinamiento:

- 5 placas
- mismo nivel de calidad que Legacy
- remanente mejor que el plan primario

Interpretación:

> El usuario podría conocer el número óptimo de placas alrededor de 7 s antes, mientras la mejora de remanente continúa.

### Caso 4051461

Fase primaria:

```text
boards = 6
LB = 6
certified = true
tiempo ≈ 2,8 s
```

Refinamiento:

```text
≈ 6,6 s
accepted = false
```

Legacy:

```text
≈ 8,0 s
```

El plan primario ya tenía la misma calidad final.

### Caso 4051230

En la reconstrucción actual:

```text
primary boards = 7
LB = 7
certified = true
```

y el refinamiento no encuentra mejora frente al baseline actual.

El registro histórico había marcado un ahorro de placa en Compactación, pero esta divergencia no se usa como evidencia causal porque el corpus/motor reconstruido no reproduce esa transición histórica exacta.

La regla de seguridad sigue siendo matemática: sólo se difiere Compactación cuando el baseline actual queda certificado por un lower bound válido.

---

## 5. Experimento descartado: cache fino baseline→Compactación

Se intentó reutilizar cada `empacarPlaca` individual si se podía probar que
`penalizarFranjaMuerta` no afectaba ninguna decisión.

Fue correcto en geometría/calidad, pero empeoró el runtime.

Ejemplo `4049378`:

```text
sin reuso ≈ 2,7 s
con reuso ≈ 5,3 s
```

El baseline tuvo que instrumentar ~42.804 empaques para detectar cuáles eran reutilizables.

Decisión:

**RECHAZADO.**

No se integra.

---

## 6. Poda por incumbente en Compactación

También se probó limitar Compactación a candidatos que no superen el número de placas del baseline.

La regla es segura porque V10 nunca aceptaría un candidato con más placas.

Resultados representativos:

- `4049378`: mismo plan/calidad, impacto prácticamente neutro.
- `4060603`: mismo plan/calidad, ~3,3% más rápido.
- `4051230`: mismo plan/calidad en la reconstrucción actual, ~10% más rápido.

Conclusión:

Es una micro-optimización válida, pero su impacto es demasiado pequeño para ser el eje de V18.
Puede mantenerse como experimento secundario.

---

## 7. Arquitectura recomendada

```text
                ┌────────────────────┐
                │ Baseline           │
                └─────────┬──────────┘
                          ↓
                ┌────────────────────┐
                │ Hybrid Lower Bound │
                └─────────┬──────────┘
                          ↓
                 ¿placas certificadas?
                    /           \
                  sí             no
                  ↓               ↓
      ┌──────────────────┐   V17 staged completo
      │ respuesta primaria│   Compactación
      │ placas óptimas    │   MultiSlice
      └─────────┬────────┘   Master/Repair/etc.
                ↓
      Compactación de remanente
      en worker/refinamiento
                ↓
      si mejora:
      actualizar plan disponible
```

---

## 8. Qué preserva

V18 no cambia el objetivo final.

El resultado final sigue siendo:

1. mínimo número de placas;
2. mejor remanente que encuentre Compactación;
3. fallback V17 cuando las placas no están certificadas.

La diferencia es UX/arquitectura:

> la prueba de optimalidad de placas deja de esperar obligatoriamente a una fase cuyo principal valor, en gran parte del corpus, es mejorar el remanente.

---

## 9. Estado

### Verde experimental

- API primaria + refinamiento separada.
- Lower bound como gate matemático.
- Compactación no se elimina.
- Direct tests conservan placas y calidad final.
- Replay histórico: ~8,83% menos tiempo agregado percibido.
- p50 estimado: 713 ms → 332 ms en el replay.

### No integrar todavía en UI principal

Falta cablear el refinamiento con Web Worker/estado de la aplicación para que:

- el plan primario pueda mostrarse de inmediato;
- la interfaz indique “remanente refinándose”;
- si aparece un plan mejor de igual número de placas, se reemplace;
- exportar/confirmar pueda esperar el refinamiento si se desea calidad final garantizada.

---

## Conclusión

V18 no intenta hacer Compactación más débil.

La convierte en lo que los datos muestran que es en gran parte del corpus:

> una fase secundaria de calidad que no debería bloquear el conocimiento de que el número de placas ya es óptimo.

Esto mantiene el objetivo del optimizador y mejora la experiencia interactiva sin asumir heurísticas sobre la cantidad de placas.
