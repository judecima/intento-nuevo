# V16/V17 validation summary

## V16 persisted-pool findings

Experimental staged path:

```text
V10 pre-Master
  -> Hybrid Lower Bound
     max(Strong V14, Kerf, DFF, Projection, Clique)
  -> adaptive Raster only for small/medium cases
  -> Pattern Master 0..19
  -> Integrality Repair only for <=16 types
  -> incremental Pattern Master 20..39
  -> legacy selection/validation
```

Safety default:

```env
OPTIMIZER_V10_STAGED_EXPERIMENTAL=0
```

60 fallback cases had both physical pools persisted. Cold build confirmed physical pattern generation is the dominant cost.

Warm post-Master, 60 cases x 2 repetitions, Repair gated to <=16 types:

- total post-Master avg: 11.25 ms
- p50: 1.73 ms
- p95: 46.31 ms
- p99: 93.74 ms
- Repair avg: 9.40 ms
- B&B fallback avg: 1.84 ms
- Repair eligible: 88/120 repetitions (44/60 cases)
- observed Repair wins: `[4058501]`
- invalid materialized candidates: none
- board-count mismatches against historical when materialized: none

`4058501` full warm control:

- boards: **8**
- industrial validation: OK
- Repair improved: true
- fallback still executed
- pre-Master ~12.7 s
- Repair ~227 ms
- fallback B&B ~38 ms

The important result is architectural: once physical pattern generation is reusable/persisted, the post-Master work becomes small compared with the legacy pre-Master path.

## V17 pre-MultiSlice lower-bound gate

V17 moves the Hybrid LB after baseline + compactation and before MultiSlice.

This preserves remnant quality because compactation still runs first. MultiSlice and OneBoard only matter afterward if they can reduce board count; therefore a valid lower bound equal to the incumbent safely proves they cannot improve the primary objective.

Historical audit:

- relevant cases: 238
- certified before MultiSlice: **71**
- certification rate: **29.8%**
- observed lower-bound violations: **0**
- historical MultiSlice + OneBoard time avoidable in those cases: **~350.2 s**

Direct controls:

- `4049378`: Legacy 5 boards, V17 5 boards, both valid, same quality; V17 exits `strong-lower-bound-certified-pre-multislice`.
- `4054375`: lower bound does not certify, MultiSlice still runs and reaches 5 valid boards.
- `4060543` and `4058794`: lower bound does not block OneBoard; both still reach 1 valid board.

Current V17 architecture:

```text
Baseline
 -> Compactation
 -> Hybrid LB
 -> if certified: STOP
 -> MultiSlice
 -> OneBoard
 -> Pattern Master 0..19
 -> Integrality Repair (<=16 types)
 -> incremental 20..39
```

Feature flag:

```env
OPTIMIZER_PRE_MULTISLICE_LB_EXPERIMENTAL=1
```

Experimental/cache version: `hybrid-staged-v17`.
