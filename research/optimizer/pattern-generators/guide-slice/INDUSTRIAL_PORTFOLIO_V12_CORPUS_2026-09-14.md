# Industrial Portfolio V1.2 / Repeated Strips V1 — checkpoint 2026-09-14

## Gate cerrado
- Investigación aislada; no se modifica `src/lib/optimizer/**`.
- Regresión ejecutada: **80/80 PASS**.
- Todos los planes aceptados se validan con geometría y secuencia guillotina completa, borde a borde del bloque actual.

## REPEATED_STRIPS v1
Política: `repeat>=4 + narrow<=25% + strip quantity>=50% + focused full-order`.
La ruta hace una sola llamada enfocada al motor industrial existente: `pases=2`, `restartsPorPlaca=6`, Beam/Rescue/MultiVariantes desactivados, seed fija 1000.

### A/B fresco
| Caso | Legacy-40 mediana CPU generación | Repeated Strips mediana | Ahorro | Placas A/B |
|---|---:|---:|---:|---:|
| 4050594 | 18124.305 ms | 456.167 ms | 97.48% | 7 / 7 |
| 4020442 | 6398.229 ms | 343.478 ms | 94.63% | 2 / 2 |

Ambos lados repiten placa, validez industrial y calidad en 3 procesos frescos.

## Corpus `resto.zip` con las tres familias congeladas
- XML parseables: **8.663**.
- Router activado: **3.340 (38,55%)**.
- Candidatos industriales válidos: **2.759 (31,85%)** del corpus total.

| Familia | Activados | Válidos | Sin cobertura del selector | Error de entrada |
|---|---:|---:|---:|---:|
| GUIDE_HUB | 1291 | 765 | 526 | 0 |
| COMMON_BAND | 144 | 121 | 23 | 0 |
| REPEATED_STRIPS | 1905 | 1873 | 31 | 1 |

Los 31 `NO_COVERAGE` de REPEATED_STRIPS conservan demanda exacta y un plan físico válido si se toma directamente la salida enfocada. En 23/31 se observó residuo de área floating-point > `1e-9`; los 8 restantes requieren diagnóstico separado del selector. No se corrige el Master dentro de este experimento.

## Residual estructural después de V1.2
- WEAK_REPEATED_STRIPS: 1.776
- HETEROGENEOUS_HIGH_TYPES: 1.146
- MONOTYPE_EXISTING_PATH: 862
- OTHER: 712
- PARTIAL_COMMON_BAND: **540**
- MODERATE_HUB: 287

### Próximo paso
Atacar **PARTIAL_COMMON_BAND** antes de relajar REPEATED_STRIPS. Es una extensión industrial más específica y auditable: un subconjunto dominante comparte altura/ancho de banda mientras el resto actúa como anclas/fillers. Cada nueva regla debe validarse primero en casos oro y luego rerun congelado sobre los 8.663 XML.
