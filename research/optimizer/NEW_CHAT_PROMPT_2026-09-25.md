# New Chat Prompt — MDF Optimizer — 2026-09-25

Continúa el proyecto del optimizador MDF desde el estado exacto guardado en GitHub.

Repositorio:
`judecima/intento-nuevo`

Rama:
`research/holdout-trim-baseline-20260924`

ANTES DE HACER CUALQUIER INVESTIGACIÓN O PROPONER CAMBIOS:

1. Lee `research/optimizer/START_HERE.md`.
2. Lee completo `research/optimizer/STATUS_2026-09-25_TRIM_SEMANTICS_HANDOFF.md`.
3. Lee `research/optimizer/TRIM_SEMANTICS_GATE_2026-09-25.md`.
4. Verifica el HEAD actual de esta misma rama. Si avanzó respecto del commit que te paso, usa el HEAD más nuevo de la misma rama y vuelve a leer los archivos anteriores.
5. No reconstruyas el estado desde ramas o handoffs viejos salvo que el STATUS actual los cite explícitamente.
6. No repitas experimentos ya cerrados/rechazados.
7. No despliegues nada en Vercel.
8. No modifiques `.gitignore`, `.vercelignore` ni limpies artefactos locales del usuario.

Contexto crítico:
- el objetivo es un optimizador guillotina industrial para muebles, con serial como laboratorio paralelo;
- prioridad lexicográfica: mínimo de placas, luego remanente comercial, luego latencia;
- la corrida con trim global reducido NO es todavía baseline oficial;
- el gate de 1.660 casos rechazó `globalFarInset` y validó `factoryEdgeOrReserve` 1.660/1.660;
- no minar todavía las pérdidas A–F de esa corrida porque contiene falsos gaps por semántica de refilado;
- el siguiente milestone es cerrar la semántica de trim sobre el corpus completo.

SIGUIENTE ACCIÓN:
Ejecutar o analizar el audit completo de todos los XML sin `--ids-file` y verificar:

`trimRuleCandidates.factoryEdgeOrReserve.failingCases == 0`

Si falla:
- inspeccionar todos los casos violatorios antes de tocar el motor.

Si pasa:
- definir la política explícita `mandatory | factoryEdgeAllowed`;
- implementarla coherentemente en schema/factibilidad, generadores JS/Rust, materializador, validador, lower bounds y pricing;
- rerun completo del holdout de muebles;
- exigir cero casos `lowerBound > LeptonBoards`;
- recién entonces congelar la baseline oficial y clasificar las pérdidas reales.

Trabaja con resultados medibles y commits reproducibles. Cuando avances, informa métricas concretas y deja el estado persistido en GitHub.
