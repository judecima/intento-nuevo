# Pruebas ejecutadas sobre la propuesta de Claude

## Resumen

Se compiló y ejecutó `lower-bounds.ts` de forma standalone y se realizaron tres grupos de pruebas:

1. oracle exacto independiente para packing guillotina pequeño;
2. ablación histórica sobre el holdout V10;
3. comparación directa contra nuestro Strong Lower Bound V14.

## 1. Oracle exacto independiente

Se implementó un solver exacto por enumeración de árboles de corte guillotina:
- genera todas las composiciones slicing posibles por subconjunto;
- mantiene sólo dimensiones Pareto;
- calcula exactamente qué subconjuntos caben en una placa;
- resuelve la partición mínima en placas por DP.

### Tanda A
- 3.000 instancias
- 2–8 piezas
- kerf entero
- rotación permitida/bloqueada
- 0 violaciones.

### Tanda B
- 10.000 instancias
- medidas en incrementos de 0,5
- kerf fraccionario
- rotación permitida/bloqueada
- repeticiones
- 0 violaciones.

### Total oracle
- **13.000 instancias exactas**
- **0 casos donde ninguna cota supere el óptimo guillotina real**

Elevación sobre área en la tanda decimal de 10.000:
- Kerf: 1361
- DFF: 4510
- Raster: 2108
- Proyección: 2369
- Clique: 3857
- Combinación completa: 4786

Esto es evidencia fuerte de seguridad experimental, aunque no sustituye una demostración formal.

## 2. Ablación histórica

Casos históricos consistentes por `piece_count`:
- **1826**

Familia F1:
- `boards40 = areaLB + 1`
- **231 casos**

Familia F2:
- **2 casos**

### Resultados por cota

| Cota | Unsafe vs V10-40 | Eleva área | Certifica F1 | Costo medio |
|---|---:|---:|---:|---:|
| Área | 0 | 0 | 0 | 0.0028 ms |
| Kerf | 0 | 31 | 28 | 0.0015 ms |
| DFF | 0 | 70 | 64 | 0.2905 ms |
| Raster | 0 | 47 | 43 | 1.2499 ms |
| Proyección | 0 | 51 | 47 | 0.0039 ms |
| Clique | 0 | 44 | 41 | 0.0304 ms |
| Todas | 0 | 76 | 70 | 1.5640 ms |

No apareció ninguna violación frente a una solución V10-40 conocida.

## 3. Comparación contra Strong LB V14

Sobre los mismos 1.826 casos:

- V14 certifica 1.615 casos al nivel del plan de 20 rondas.
- Claude completo certifica 1.658.
- **44 casos adicionales** certificados respecto de V14.
- `generarPatrones` histórico de esos 44: **581.2 s**.
- tiempo total histórico de esos 44: **1118.2 s**.

En la familia F1:
- V14: **28/231**
- Claude completo: **70/231**
- mejora neta: **43 casos F1**.
- esos 43 concentran aproximadamente **576,9 s** de `generarPatrones` histórico.

## 4. Configuración barata recomendada

Probé una cascada:

### Etapa barata
- V14 Strong LB
- Kerf
- DFF
- sin Raster

Resultado:
- certifica 66/231 F1;
- coste de DFF ~0,29 ms promedio;
- prácticamente captura todo el beneficio principal.

### Raster condicional
Ejecutarlo sólo cuando la etapa barata no certifica:

- casos donde Raster llega a ejecutarse: 173/1826;
- certificados adicionales: 6;
- costo medio de Raster cuando corre: ~2,41 ms;
- costo amortizado total de la cascada: ~0,54 ms/caso;
- generación histórica adicional evitable por esos 6: ~16,2 s.

Conclusión:
**Raster no conviene como parte obligatoria de la cota rápida.**
Conviene como segunda etapa condicional.

## 5. Caso oro 4058501

La propuesta de Claude devuelve:

- área: 7
- kerf: 7
- raster: 7
- DFF: 7
- best: **7**

Por lo tanto **no certifica que 8 sea óptimo** en `4058501`.

Integrality Repair sigue siendo necesario para generar 8, y el fallback 21–40 sigue siendo necesario si queremos cero regresiones.

## 6. Decisión técnica

### Integraría para siguiente benchmark

**Cheap Strong LB**
- V14 Strong LB existente
- Kerf
- DFF

### Dejaría condicional
- Raster, sólo si `boards == cheapLB + 1` o el caso sigue caro/no certificado.

### Mantendría
- Integrality Repair
- Pattern Master incremental 21–40 como fallback.

### No priorizaría
- Proyección/clique de Claude por separado, porque V14 ya cubre gran parte de esa geometría y el incremento marginal es pequeño frente a DFF.

## 7. Seguridad

Los resultados de seguridad son:

- 13.000 oracles exactos pequeños: 0 violaciones.
- 1.826 casos históricos consistentes: 0 bounds por encima de V10-40.
- No es una demostración formal universal, pero sí supera ampliamente el gate experimental que teníamos antes.

## Próximo paso

Implementar `Kerf + DFF` en la rama experimental V14, detrás de feature flag, y correr:

1. benchmark F1 completo;
2. staged pipeline 50–100 casos caros;
3. holdout 2.000 consistente;
4. sólo entonces evaluar activación por defecto.
