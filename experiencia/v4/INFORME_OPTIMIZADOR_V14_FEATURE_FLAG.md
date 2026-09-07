# Informe de avance — V14 Feature-Flag Gate

## Estado

Se llevó la arquitectura staged hasta una integración opt-in en `legacy-engine.ts`, manteniendo el V10 congelado como comportamiento por defecto.

### Feature flag maestro

```env
OPTIMIZER_V10_STAGED_EXPERIMENTAL=0
```

Con `0` o sin variable, `strategy=v10` sigue llamando al `legacy/v10.cjs` original.

Cuando se activa, existen subflags independientes:

```env
OPTIMIZER_STRONG_LOWER_BOUND_EXPERIMENTAL=1
OPTIMIZER_INTEGRALITY_REPAIR_EXPERIMENTAL=1
OPTIMIZER_INCREMENTAL_MASTER_EXPERIMENTAL=1
```

La clave interna de cache incorpora el modo y los subflags, por lo que un resultado legacy no puede contaminar el cache staged ni viceversa. El `inputHash` público permanece estable.

---

## 1. Gate staged ampliado

Se ejecutaron 50 casos reales consistentes con el histórico, seleccionados entre casos que activaban Pattern Master y con costo histórico moderado.

Resultado consolidado:

- casos: **50**
- mismas placas que V10-40 histórico: **50/50**
- planes válidos: **50/50**
- regresiones de placas: **0**
- mejoras vs V10-40: 0
- cierres por Strong Lower Bound antes de Master: **15/50**
- casos que usaron fallback incremental: **35/50**
- Repair wins en esta muestra: 0

El hecho de que Repair no se active en esta muestra es consistente con una política conservadora: sólo debe intervenir cuando encuentra una reparación concreta y físicamente válida.

Los tiempos del staged en esta batería sumaron ~203,1 s, promedio ~4,06 s/caso. No se comparan estos tiempos directamente con históricos ejecutados en otro contexto de máquina/corrida.

---

## 2. Pattern Master incremental

La equivalencia se verificó en dos niveles.

### RNG/subconjuntos

- **2.000/2.000** casos equivalentes.

Las rondas 20..39 consumen exactamente la misma secuencia RNG y forman los mismos subconjuntos que una llamada monolítica de 40 rondas.

### Pool físico

Se amplió el gate a **51 casos físicos completos**:

- `generarPatrones(20) + generarPatronesRango(20,40)`
- versus `generarPatrones(40)`

Resultado:

- **51/51 equivalentes**
- faltantes: 0
- extras: 0

La comparación es por vector de uso deduplicado, que es la identidad que consume el master de cobertura.

---

## 3. Strong Lower Bound

Se conserva el resultado V13:

- auditado sobre 2.000 casos históricos;
- 0 violaciones observadas contra una solución V10-40 válida;
- ~0,1125 ms promedio;
- certifica 28 de 320 casos históricamente por encima de la cota de área.

En la batería staged V14, 15 de 50 casos terminaron antes de Pattern Master por certificado matemático.

Esto es seguro respecto de la lógica legacy porque Pattern Master sólo acepta una solución con **menos placas**; la mejora de igual número de placas por remanente ocurre en compactación, antes de este punto.

---

## 4. Integrality Repair

Permanece experimental.

Hecho ya demostrado:

- `4058501`: 20 rondas producen 9 placas; Repair puede construir una solución válida de 8 a partir del pool temprano, sin obtener las nuevas columnas de rondas 21..40.

Restricción de seguridad mantenida:

- si 8 no está certificado por una cota matemática, Repair **no cancela** el fallback; sólo mejora el incumbente.

Por eso la integración no introduce una poda irreversible basada en una heurística.

---

## 5. Integración en `legacy-engine.ts`

La ruta staged quedó conectada al facade mediante lazy `require` y flag de entorno.

Cambios de seguridad:

1. **Default apagado**: legacy V10 intacto.
2. **Cache aislado** por modo y subflags.
3. **Versión diferenciada**: `legacy-guillotine-v10-lepton-remnants-20260813+staged-v13`.
4. Test agregado para verificar aislamiento de cache legacy/staged.
5. `.env.example` documenta los cuatro flags.
6. `src/lib/optimizer/experimental/README.md` documenta invariantes y flujo.

---

## 6. Control con subfeatures desactivadas

Se ejecutó el pipeline staged con:

```text
Strong LB = false
Repair = false
Incremental = false
```

En el caso de control `4048053`, reprodujo V10-40 en:

- placas: 3 = 3
- mayor remanente: igual
- segundo remanente: igual
- fragmentos: igual
- validación industrial: OK

Esto valida que los switches internos no obligan a utilizar una optimización experimental.

---

## 7. Control staged real después de integración

`4048053` con la ruta staged activada:

- V10 legacy: 3 placas
- staged: 3 placas
- remanente/cortes: idénticos
- validación: OK
- reason: `strong-lower-bound-certified-pre-master`

En esa corrida directa:

- A legacy: ~1.734 ms
- B staged: ~383 ms

Es una medición local de esa corrida, no una proyección global.

---

## 8. Auditoría de código

- todos los `.cjs` modificados/nuevos pasan `node --check`;
- `legacy-engine.ts` modificado transpila sin errores sintácticos con TypeScript;
- `tests/optimizer/optimizer.test.ts` modificado transpila sin errores sintácticos;
- no se pudo ejecutar la suite Vitest completa en este contenedor porque el ZIP no contiene `node_modules`.

Se agregó la prueba Vitest para que el repo con dependencias instaladas verifique el contrato de cache/flag.

---

## 9. Decisión técnica actual

### Candidato a activar primero en entorno de prueba

**Strong Lower Bound**.

Tiene el mejor perfil riesgo/beneficio:

- certificado, no heurística de aceptación;
- costo submilisegundo típico;
- 2.000 casos auditados;
- evita Pattern Master en casos donde matemáticamente no puede bajar placas.

### Segundo

**Pattern Master incremental**.

- 2.000/2.000 equivalencia RNG;
- 51/51 equivalencia física;
- conserva el fallback de 40 sin regenerar 0..19.

### Mantener experimental

**Integrality Repair**.

Debe seguir detrás del fallback hasta tener más wins generales o certificados más fuertes.

---

## 10. Próximo gate lógico

Ya no considero necesario seguir inventando nuevas reglas. El siguiente trabajo es operativo:

1. ejecutar la suite del repo con dependencias instaladas;
2. activar staged en un entorno de prueba/canary, no globalmente;
3. registrar por pedido `reason`, boards, remanente, fallback, Repair y tiempos;
4. ampliar de 50 a 100–200 casos consistentes;
5. después ejecutar el holdout completo de 2.000 con la ruta staged real.

El diseño actual permite hacerlo sin poner en riesgo el V10 congelado: desactivar una sola variable vuelve instantáneamente al comportamiento legacy.
