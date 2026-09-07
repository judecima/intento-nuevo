# Rescue / Experience Memory — experimento independiente

## Resultado 1 — Exact Memory en caso caro
- Caso aprendido: `4029715__Luis_Mendez4029715`
- Optimización original: **3416 ms**
- Placas: **5**
- Revalidación posterior: **1 ms**
- Regresión: **0**
- Relación cómputo original / validación: **~3416x**

## Resultado 2 — Caso nuevo difícil que reaparece
- Primera aparición: `4046466__karla_villarreal ortega4046466`
- Optimización: **3262 ms**
- Resultado: **6 placas**, válido.
- Reaparición: `karla_villarreal ortega4096661`
- Exact Memory: **1 ms** de revalidación, **6 placas**.
- Regresión: **0**.
- Relación cómputo original / validación: **~3262x**.

## Structural Memory
Dos casos structural-only costosos terminaron con baseline largo:
- `4041142__Rolando Rene_Rodriguez Cisneros4041142`: 5 placas en 3013 ms (referencia 5).
- `4046466__karla_villarreal ortega4046466`: 6 placas en 3286 ms (referencia 6).

Pruebas directas de estrategia:
- familia 2 / multislice: 5 placas, válido=True, 5716 ms.
- familia 2 / master: timeout >= 6000 ms.
- familia 3 / multislice: timeout >= 6000 ms.
- familia 3 / master: timeout >= 6000 ms.

## Decisión
1. **Exact Memory validada experimentalmente** con revalidación.
2. **Structural Memory basada sólo en dimensiones/tipos no está validada para routing de Rescue.**
3. Para generalizar entre cantidades distintas hay que incluir `ratioFingerprint`, `pieceCount`, lower bound, área relativa, repetición y cantidad de tipos.
4. En casos caros repetidos conviene guardar el **plan ganador completo**, no sólo el nombre del Rescue.

## Nota
El tiempo de 1 ms mide validación local de un plan serializado ya localizado; producción agregará lookup y deserialización.
