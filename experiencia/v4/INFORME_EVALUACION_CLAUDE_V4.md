# Evaluación del cuarto ZIP de Claude

## Cambios detectados

Respecto de la versión anterior:

1. `lower-bounds.ts` agrega política de tamaño dentro de `computeLowerBoundCascade`.
2. Defaults:
   - `rasterMaxPiezas = 40`
   - `rasterMaxTipos = 16`
3. Nuevo flag de telemetría:
   - `rasterOmitidoPorPolitica`
4. Tests nuevos para:
   - omisión de Raster en pedidos pesados;
   - override configurable de la política.
5. La documentación propone además investigar si conviene omitir rondas 21–40 en F1 pesado.

## Compilación

- TypeScript 5.8.3: OK
- JS transpile: OK
- `node --check`: OK

## Política Raster

Test directo:

### Default, 45 piezas
- etapa: barata
- Raster: no corre
- `rasterOmitidoPorPolitica = true`

### Override `rasterMaxPiezas=100`
- etapa: completa
- Raster: corre
- `rasterOmitidoPorPolitica = false`

La API funciona como fue diseñada.

## Benchmark histórico de la nueva cascada

Sobre 1.789 casos reconstruidos de forma consistente en esta ejecución:

- unsafe: **0**
- certificados por etapa barata: **1.617**
- certificados totales: **1.623**
- Raster ejecutado: **64**
- certificados adicionales de Raster: **6**
- costo medio: ~**0,31 ms**
- p50: ~**0,08 ms**
- p95: ~**1,27 ms**
- máximo: ~**9,48 ms**

Cohorte F1 pesada reconstruida:

- casos: **153**
- barata certifica: **29**
- total certifica: **30**
- Raster corre: **25**
- Raster agrega: **1**

La política reproduce la conclusión V15:
Raster debe ser condicional y tiene muy poco valor en la cola pesada.

## Hallazgo crítico: NO eliminar rondas 21–40 en F1 pesado

Se cruzó V10-20 contra V10-40 en el holdout histórico.

Sólo existe una mejora de placas entre 20 y 40 rondas:

`4058501`

Datos:

- 20 rondas: **9 placas**
- 40 rondas: **8 placas**
- area LB: **7**
- piezas: **50**
- tipos: **11**
- `boards40 = areaLB + 1`
- generación 20 rondas histórica: ~**20.180 ms**

Por definición, este pedido es F1 pesado:

- piezas >= 20
- tipos >= 8
- boards40 = areaLB + 1

Por lo tanto una regla:

`si F1 pesado => no ejecutar rondas 21–40`

produciría una regresión real en `4058501`.

### Decisión

**RECHAZAR** la eliminación global del fallback 21–40 para F1 pesado.

Mantener:

- Strong/Hybrid LB para certificar;
- Raster adaptativo;
- Integrality Repair;
- Pattern Master incremental 21–40 como fallback cuando no hay certificado.

## Recomendación

### Integrar
- `rasterMaxPiezas`
- `rasterMaxTipos`
- `rasterOmitidoPorPolitica`
- política adaptativa dentro de `computeLowerBoundCascade`

### No integrar
- regla de omitir rondas 21–40 sólo por ser pedido pesado.

Arquitectura segura:

```text
Cheap Hybrid LB
↓
si certifica → STOP
↓
Raster sólo chico/medio
↓
20 rondas
↓
Integrality Repair
↓
si no hay certificado
↓
21–40 incremental fallback
```

## Conclusión

El cuarto ZIP mejora la implementación porque codifica dentro del propio módulo una política Raster que ya había sido validada experimentalmente.

Sin embargo, la nueva hipótesis de eliminar rondas tardías en la cola pesada queda refutada por los datos históricos: `4058501` es exactamente un F1 pesado y necesita las rondas 21–40 si Integrality Repair no está autorizado a cortar el fallback.
