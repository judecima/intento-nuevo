# Informe de avance — V13 consolidado

## Estado

Repo: `judecima/intento-nuevo`  
Branch: `feature/agregar_configuracion_organizacion`

La rama productiva legacy sigue sin modificaciones. Todo lo nuevo permanece en `src/lib/optimizer/experimental/` y scripts de benchmark/auditoría.

---

## 1. Arquitectura funcional consolidada

```text
V10 pre-Master real
    ↓
Strong Geometric Lower Bound
    ↓
si certifica el incumbente:
    terminar
    ↓
Pattern Master 0..19
    ↓
Strong LB nuevamente
    ↓
Integrality Repair
    Morton + replace+2 + filtro + sieve + empacarPlaca
    ↓
si Repair mejora:
    usar como mejor incumbente
    ↓
si no hay certificado:
    Pattern Master incremental 20..39
    ↓
B&B actual
    ↓
selección final
```

Regla de seguridad:

> Integrality Repair nunca elimina el fallback 21..40 si la cantidad de placas mejorada no quedó matemáticamente certificada.

Por lo tanto, una mejora heurística sólo fortalece el incumbente; no reduce el espacio de búsqueda de calidad.

---

## 2. Strong Lower Bound

Componentes actuales:

- área;
- proyecciones por ancho/alto;
- cardinalidad de piezas > mitad;
- grafo de incompatibilidad;
- clique greedy.

Auditoría histórica:

- casos: **2.000**
- violaciones contra una solución V10-40 válida: **0**
- costo medio: **~0,1125 ms**
- máximo observado: **23 ms**

Sobre los 320 casos donde V10-20 queda por encima de la cota de área:

- **28 casos** quedan certificados por la nueva cota.

Esos 28 consumieron históricamente aproximadamente:

- Pattern Master: **97.135 ms**
- `generarPatrones`: **95.310 ms**

sin que una búsqueda posterior pudiera reducir placas.

### Aclaración sobre remanente

Se revisó el código legacy:

`materializar.aceptar()` rechaza cualquier candidato con:

```text
candidate.boards >= baseline.boards
```

Pattern Master usa esa aceptación normal.

La única etapa V10 que explícitamente acepta mismas placas por mejor remanente es la compactación (`permitirMismas=true`), que ocurre antes del retorno por cota.

Por lo tanto, certificar que Pattern Master no puede bajar placas no elimina una mejora secundaria que Pattern Master legacy fuera capaz de aceptar.

---

## 3. Integrality Repair

Resultado principal estable:

### `4058501`

Histórico:

```text
V10-20 → 9 placas
V10-40 → 8 placas
```

La capa dirigida consigue generar una reparación válida a partir de patrones tempranos sin usar rondas 21..40 para descubrir esa columna.

Se validó:

- 8 placas;
- cobertura completa;
- geometría válida;
- secuencia completa de cortes;
- `validador_industrial_v3.ok = true`.

Sin embargo:

```text
area LB = 7
strong LB = 7
repair = 8
```

8 no está todavía certificado matemáticamente.

Por lo tanto el modo seguro mantiene el fallback 21..40.

Se intentó fortalecer la prueba con:

- DFF simples;
- DFF combinadas;
- MILP de asignación a 7 placas con:
  - área transformada;
  - orientación;
  - incompatibilidades por pares.

Ese MILP de relajación sigue siendo factible con 7 placas.

Conclusión:

> todavía no existe una prueba barata suficiente de que 7 sea imposible.

No se elimina el fallback en este caso.

---

## 4. Pattern Master incremental

Se implementó:

```text
generarPatronesRango(lineas, config, 20, 40)
```

La función:

- reproduce el RNG original;
- consume exactamente los mismos números aleatorios de rondas previas;
- no vuelve a ejecutar `optimizar()` para 0..19;
- ejecuta únicamente 20..39.

### Auditoría RNG

Sobre **2.000 casos**:

```text
monolithic rounds 20..39
==
incremental rounds 20..39
```

Resultado:

- **2.000/2.000 equivalentes**
- discrepancias: **0**

### Equivalencia física

Se ejecutaron comparaciones reales:

```text
generarPatrones(20)
+
generarPatronesRango(20,40)
```

contra:

```text
generarPatrones(40)
```

Casos físicos únicos completos:

- **19**
- equivalentes: **19/19**
- faltantes: 0
- extras: 0

La equivalencia física incluye:
- vector de uso;
- deduplicación final del pool.

---

## 5. Benchmark staged contra histórico V10-40

Se construyeron tandas usando sólo casos donde:

```text
canonical piece_count == historical pieces
```

para evitar comparar problemas distintos.

Resultado consolidado:

### Comparación contra V10-40 histórico

- casos consistentes: **21**
- misma cantidad de placas: **21/21**
- planes B válidos: **21/21**
- regresiones de placas: **0**
- casos que requirieron fallback: 14

### Apples-to-apples directo

Casos ejecutados calculando A y B en la misma corrida:

- casos: **5**
- mismas placas: **5/5**
- planes válidos: **5/5**
- mismas métricas de calidad registradas: **5/5**
- regresiones: **0**

Casos directos:

- `4061299`
- `4057006`
- `4058951`
- `4048053`
- `4060466`

---

## 6. Inconsistencia de corpus detectada

Caso:

`4051690`

Histórico:

- 4 piezas
- 2 placas.

Corpus canónico usado por runner:

- 2 piezas
- 1 placa.

El runner devuelve un plan válido de una placa para el problema canónico, pero esto NO es una mejora comparable al histórico.

El caso fue excluido de la auditoría consolidada.

Nueva regla del benchmark:

> nunca comparar contra histórico si cantidad de piezas/demanda canónica no coincide.

---

## 7. Clique exacta

Se probó reemplazar la clique greedy por búsqueda exacta acotada en tiempo.

Casos aplicables estudiados:

- 276

Mejoras sobre clique greedy:

- **0**

Decisión:

- no integrar;
- el costo/complexidad no aporta nuevos certificados.

La clique greedy actual es suficiente para esta fase.

---

## 8. Estado técnico

### VERDE — funcional y de bajo riesgo

#### Strong Lower Bound
- auditada sobre 2.000 casos;
- muy barata;
- 0 violaciones observadas;
- puede evitar Pattern Master cuando certifica el incumbente.

#### Pattern Master incremental
- RNG 2.000/2.000;
- pool físico 19/19;
- conserva fallback original sin repetir 0..19.

### VERDE EXPERIMENTAL

#### Pipeline staged
- 21/21 contra histórico consistente;
- 5/5 apples-to-apples directo;
- 0 regresiones observadas;
- todos los planes validados.

### AMARILLO

#### Integrality Repair
- genera mejoras reales;
- rescata `4058501`;
- todavía no tiene prueba matemática suficiente para cortar fallback cuando queda por encima del LB.

---

## 9. Qué considero ya funcional

La siguiente estrategia es coherente y segura:

```text
pre-master
→ strong LB
→ 20 rondas
→ repair
→ incremental 21..40 si hace falta
```

No reemplaza ciegamente V10.

Lo mejora de dos formas:

1. evita búsquedas matemáticamente inútiles;
2. evita repetir las primeras 20 rondas si el fallback es necesario.

Integrality Repair funciona como acelerador/generador de mejor incumbente, pero no como poda irreversible sin certificado.

---

## 10. Qué falta antes de tocar producción

El siguiente gate ya es ingeniería de integración, no investigación heurística.

### A. Feature flag

Agregar una ruta configurable:

```text
integralityRepairExperimental=true/false
strongLowerBound=true/false
incrementalPatternMaster=true/false
```

Default:

```text
false
```

### B. Benchmark de 50–100 casos con corpus consistente

Sólo casos donde la demanda reconstruida coincide exactamente con histórico.

### C. Holdout 2.000

Requisitos:

- 0 regresiones de placas;
- 0 planes inválidos;
- sin degradación sistemática de remanente;
- fallback idéntico;
- comparar p50/p95/p99.

### D. Integración gradual

Orden recomendado:

1. Strong Lower Bound.
2. Pattern Master incremental.
3. Integrality Repair detrás de flag.
4. Sólo después considerar reemplazar 40 rondas como comportamiento por defecto.

---

## 11. Archivos experimentales principales

```text
src/lib/optimizer/experimental/
  strong-lower-bound.cjs
  integrality-repair.cjs
  v10-integrality-pipeline.cjs
```

Scripts:

```text
scripts/
  strong-lower-bound-audit.cjs
  integrality-repair-benchmark.cjs
  v10-integrality-apples-benchmark.cjs
  pattern-incremental-equivalence.cjs
  pattern-incremental-rng-audit.cjs
```

Resultados:

```text
experiencia/
  v12_strong_lb_audit.json
  v12_incremental_rng_audit.json
  v13_incremental_physical_equivalence.json
  v13_staged_consolidated_audit.json
  v12_apples5.jsonl
```

Todos los `.cjs` y scripts experimentales pasaron `node --check`.

---

# Conclusión

La investigación ya llegó a una solución técnicamente coherente.

No recomiendo seguir agregando reglas geométricas/fractales en esta etapa.

La mayor mejora ahora está en:

> **certificar → reparar → continuar incrementalmente sólo cuando sea necesario.**

La arquitectura mantiene el V10 actual como garantía y empieza a sustituir búsqueda aleatoria sólo donde existe evidencia matemática o una mejora físicamente validada.

El próximo paso natural es llevar estos tres componentes a una integración bajo feature flag y ejecutar el holdout consistente completo.
