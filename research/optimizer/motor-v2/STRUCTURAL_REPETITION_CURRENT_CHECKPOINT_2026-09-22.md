# Motor V2 — Structural Repetition Rescue — Current measured checkpoint — 2026-09-22

Status: RESEARCH CANDIDATE / QUALITY + EFFICIENCY MILESTONE / NOT YET PROMOTED TO motor-beta-v1

Frozen reference:
- motor-beta-v1 @ 07428bad8b1a4670c92ca0919fad32d3f487d63f

Research branch:
- research/motor-v2-structural-20260922

## Wide repeated-gap cohort

Cohort:
- 18 repeated-demand holdout cases with frozen V3 > safe LB

Earlier exhaustive prototype:
- total rescue work ~331 s
- wins: 3
- too expensive for production

Structural portfolio v2:
- wins: 4 / 18
- invalid accepted plans: 0
- board regressions: 0
- boards saved vs frozen V3: 28
- total rescue work ~23 s
- ~14.4x lower rescue cost than the exhaustive prototype

Measured wins in structural v2:
- 5504203: 90 -> 75, Lepton 75, safe LB 75
- 5432432: 4 -> 3, Lepton 3, safe LB 3
- 5526837: 13 -> 12, Lepton 12, safe LB 12
- 5446507: 156 -> 145, Lepton 159

## Pre-Master placement

Moving the same structural rescue before Master, after the frozen baseline, improved both quality and latency on the four known wins.

Measured examples:
- 5504203: frozen V3 ~2.3 s -> pre-Master rescue ~0.9 s; boards 90 -> 75
- 5526837: frozen V3 ~4.06 s -> pre-Master rescue ~1.23 s; boards 13 -> 12
- 5446507: frozen V3 ~18.8 s -> pre-Master rescue ~11 s; boards 156 -> 144

For 5446507 the pre-Master variant improves one additional board over the earlier structural-v2 run:
- frozen V3: 156
- Lepton: 159
- earlier structural v2: 145
- current pre-Master candidate: 144

This is 12 boards saved vs V3 and 15 boards better than Lepton on that case.

## Objective ordering audit

The hypothesis that 5504203 failed because local remnant was preferred over fewer boards was tested directly:
- tolerance 2% -> 90 boards
- tolerance 0.5% -> 90 boards
- tolerance 0% -> 90 boards

So local-remnant tolerance is NOT the root cause of 5504203.

Confirmed root cause:
- frozen generator omits the decisive mixed pattern when the large request disables Beam at >120 pieces
- safe DFF LB already equals 75
- when mixed pattern [1,2] is exposed, existing exact coverage solver reaches 75 in 75 nodes without exhaustion

## Remnant safety finding

A per-board remnant polish experiment produced a counterexample on 5526837:
- some individual patterns improved locally
- complete-plan official remnant quality became worse because commercial fragments increased 12 -> 14 while largest/second remnant stayed equal

Therefore local per-board remnant polish is REJECTED as an acceptance rule.

Required Motor V2 acceptance is global:
1. strictly fewer boards always wins
2. at equal board count, accept only if compararCalidad(full candidate plan, full incumbent plan) > 0
3. never accept a local remnant improvement that worsens complete-plan official quality

## Current decision

The structural repeated-demand rescue is a real quality improvement and can be much cheaper than frozen V3 when routed before Master.

It is not yet promoted to motor-beta-v1 because the full 18-case pre-Master timing/quality table and broad equal-board remnant gate still need to be frozen together.

No production optimizer files were changed.
