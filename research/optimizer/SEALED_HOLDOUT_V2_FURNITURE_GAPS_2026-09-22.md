# SEALED HOLDOUT V2 — FURNITURE 1..10 BOARD GAP RESULT — 2026-09-22

Status: BLIND PRODUCT-COHORT GAP RESULT FROZEN / NO TUNING BEFORE THIS RESULT

Repository:
`judecima/intento-nuevo`

Branch:
`research/perfv3-industrial-incremental-20260922`

Pre-holdout authoritative base:
`deeb9c1ba0e9c9154874d559a66901d6854790f2`

Manifest commit:
`9a26388bb57381f2b963337e8bf98cffecd86718`

Frozen fast-path blind result:
`research/optimizer/SEALED_HOLDOUT_V2_FAST_BLIND_RESULT_2026-09-22.md`

## Product cohort

The product-relevant furniture cohort is defined only for reporting as:

- physical Lepton board count: **1..10**
- all canonical-valid PROJECT inputs retained
- no piece-count trimming
- no type-count trimming
- no geometry trimming

Cases:
- **15,024 / 15,784** canonical-valid holdout cases

Industrial cases remain part of the original holdout and are not deleted or reclassified as invalid. This report only isolates the furniture-scale product cohort so very large production batches do not dominate product decisions.

## Exact V3-worse tail

Every one of the 15,024 furniture cases has a resolved answer to the question:

> Can frozen V3 finish with more boards than physical Lepton?

Result:

- V3 worse than Lepton: **56 / 15,024 = 0.3727369542%**
- V3 not worse than Lepton: **14,968 / 15,024 = 99.6272630458%**
- invalid observed plans in the exact V3 suspect executions: **0**

Magnitude:
- **56 / 56 gaps are exactly +1 board**
- no +2 gap
- no +3 gap
- no large industrial-style gap

Gap distribution by Lepton board count:
- 1 -> 2: **36**
- 2 -> 3: **3**
- 3 -> 4: **4**
- 4 -> 5: **7**
- 5 -> 6: **2**
- 6 -> 7: **2**
- 10 -> 11: **2**

Therefore **64.29% of the remaining furniture gaps are one-board feasibility failures**.

Gap complexity:
- pieces: min 6, median **32**, max 116
- types: min 1, median **8**, max 38

Structural compression:
- 56 gap instances
- **49 unique gap geometries**
- 6 repeated gap families
- 7 repeated instances beyond the first

Repeated examples include:
- 5449324 / 5449630
- 5448564 / 5448584
- 5467557 / 5467644
- 5487953 / 5487973
- 5495080 / 5495112
- 5472614 / 5472630 / 5507215

## Lower-bound diagnosis

Frozen safe Hybrid Cheap LB was evaluated descriptively on all 56 gap instances, without changing any optimizer parameter.

Result:
- **LB == Lepton on 56 / 56**
- LB > Lepton: 0
- LB < Lepton: 0
- binding: area in 55, DFF in 1

This means the remaining furniture tail is **not a lower-bound problem**.

For every observed furniture gap the optimizer already has a safe target equal to the Lepton board count. The failure is in candidate generation / pattern construction / materialization.

## Gap-screen method

The full frozen V3 path was executed for every unresolved suspect.

To avoid spending full V3 cost on obvious non-gap cases, a monotonic certification screen was used only to prove **not-worse** status:

1. Run the exact frozen baseline pass 0 at stage depth 4, with the same full configuration set. This candidate is already one of the candidates evaluated by the frozen baseline.
2. If this candidate reaches `<= Lepton`, frozen baseline cannot finish with more boards.
3. Otherwise run the full frozen baseline.
4. If full baseline reaches `<= Lepton`, frozen V3 cannot finish with more boards because V3 starts from baseline and only accepts non-increasing board-count replacements.
5. Only if baseline remains above Lepton is full frozen V3 executed.

Final accounting:
- exact/full-result rows: 6,904
- monotonic certified-not-worse rows: 8,120
- total resolved: **15,024 / 15,024**
- final unresolved suspects: **0**

The screen is suitable for the binary **V3-worse tail** measurement. It does NOT replace the still-required full-corpus run for exact better/equal split, remnant statistics, or latency percentiles.

## Product implication

The 75-board outlier is not representative of this furniture cohort.

Inside 1..10 physical Lepton boards:
- tail size is only **0.373%**
- every miss is only **+1 board**
- almost two thirds of misses are `1 -> 2`
- safe LB already identifies the correct target in every miss

The next quality milestone should therefore target:

`LB == 1 && current V3 > 1`

before spending research effort on very large repeated industrial batches.

No optimizer threshold, gate, round count, polish parameter, H2 rule, early-LB rule, OneBoard rule, or Master rule was changed before freezing this result.
