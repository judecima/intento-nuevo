# EXPERIENCE OPTIMIZER - SOURCE OF TRUTH (ChatGPT independent branch)

## ESTADO ACTUAL
Etapa: análisis independiente / memoria de experiencia
Estado: dataset canónico construido + piloto de benchmark + candidatos de memoria

## DATOS DE ENTRADA
- ZIP XML recibidos: 7
- XML encontrados: 20.818
- Casos canónicos generados: 20,844
- project: 17,319
- Order: 3,525

## NORMALIZACIÓN XML
En `project`, l/w de los nodos son ejes locales al corte. La orientación global se reconstruye desde la dirección del root y la paridad de `layer`, siguiendo la convención de `dimsNodoXml` de V10.

## VETA / DIRECCIONALIDAD
- 639 nombres de material etiquetados desde XML Order (`Board Grain`).
- Convención observada y corroborada con productos EGGER: Grain=0 corresponde a decorativos direccionales; Grain=1 a unicolores/no direccionales en este corpus.
- Clasificador por nombre para materiales `project`: accuracy holdout 91,25%.
- No usar inferencias <0,70 como verdad automática.

## MEMORIA - HALLAZGOS
- Grupos exactos repetidos: 1,569
- Casos dentro de grupos exactos: 3,803
- Recomputaciones exactas evitables tras aprender la primera: 2,234 (10.72% de todos los casos).
- Grupos estructurales con más de una variante exacta: 220.

## BENCHMARK BASELINE CONTROLADO
Muestra: 30 casos <=40 piezas / <=15 tipos, veta de alta confianza o XML.
- Completados bajo timeout 2 s: 28/30
- Timeouts: 2
- Errores: 0
- Media: 789.0 ms
- Mediana: 736.5 ms
- P95: 1514 ms
- vs referencia en completados: {'equal': 27, 'worse': 1}

## CASOS DIFÍCILES / RESCUE
El caso `4066881__mariano_cenzano4066881` necesitó V10 completo y la compactación ganó 1 placa (2 -> 1), con ~1.5 s consumidos por esa estrategia. Este caso debe guardarse como experiencia de rescue para probar compactación temprano en fingerprints similares.

## PILOTO DE EXACT MEMORY
Se ejecutó una sola vez el representante de 20 fingerprints exactos frecuentes.
- 20/20 completaron.
- Cubren 146 ocurrencias históricas.
- Evitarían 126 optimizaciones repetidas.
- Cómputo medido sin cache: 93.96 s
- Cómputo ejecutando sólo primera aparición: 13.71 s
- Reducción de cómputo en esos grupos: 85.4% (lookup/validación no incluidos).

## REGLA DE SEGURIDAD PROPUESTA
1. Exact hit: recuperar plan + validar cobertura/geometría/restricciones.
2. Structural hit: NO devolver directamente; usar como warm-start / priorización.
3. Rescue aprendido: promover estrategia ganadora al principio, manteniendo baseline fallback.
4. Veta con confianza baja: no cachear orientación hasta revisión.

## SIGUIENTE PASO
Comparar estos fingerprints, normalización y métricas con la implementación de Codex. Luego correr un benchmark mayor por workers aislados, separando FAST y RESCUE.
