# FAPLAC Blend Scotch 18 mm — 125-piece sentinel — 2026-09-22

Material:
- FAPLAC Blend Scotch 18 mm
- stock used: 2750x1830 mm
- kerf: 4.5 mm

Demand:
- 125 pieces
- 22 logical types
- total piece area: 39,797,840 mm2

Important:
- Faplac describes Scotch as a walnut-inspired decor with pronounced grain.
- Application material catalog remains authoritative for grain policy.
- This sentinel therefore measures both orientation-locked and rotation-allowed scenarios.
- trim 0 and trim 10 were both measured.

## Lower bound

Raw area lower bound:
- 8 boards

But the safe Hybrid LB returns:
- 9 boards
- binding reason: kerf / DFF
- locked orientation also has V14 tall>1/4 = 9

Therefore 8 boards are provably impossible under the tested stock/kerf model.

## Current V3 results

### Locked orientation, trim 0
- boards: 9
- physically valid: yes
- rotated placements: 0
- Hybrid LB: 9
- optimal board count certified: YES
- wall: 388.98 ms
- CPU: 585.67 ms
- commercial remnant quality:
  - largest: 1,111,250 mm2
  - second: 870,375 mm2
  - fragments: 6
  - total useful: 2,774,300 mm2
- OneBoard activations: 0
- Master activations: 0
- MultiSlice activations: 0
- Compactation activations: 0

### Rotation allowed, trim 0
- boards: 9
- physically valid: yes
- rotated placements: 69
- Hybrid LB: 9
- optimal board count certified: YES
- wall: 411.03 ms
- CPU: 524.78 ms
- largest remnant: 897,875 mm2
- second: 870,375 mm2
- fragments: 9
- total useful: 3,674,889.5 mm2

At trim 0, allowing rotation does NOT reduce board count and is worse by the official remnant lexicographic objective because the largest reusable remnant is smaller.

### Locked orientation, trim 10
- boards: 9
- physically valid: yes
- rotated placements: 0
- Hybrid LB: 9
- optimal board count certified: YES
- wall: 288.56 ms
- CPU: 336.54 ms
- largest remnant: 873,990 mm2
- second: 235,750 mm2
- fragments: 4
- total useful: 1,460,344 mm2

### Rotation allowed, trim 10
- boards: 9
- physically valid: yes
- rotated placements: 63
- Hybrid LB: 9
- optimal board count certified: YES
- wall: 397.89 ms
- CPU: 472.63 ms
- largest remnant: 2,222,140 mm2
- second: 513,103.5 mm2
- fragments: 4
- total useful: 3,144,493.5 mm2

With trim 10, rotation still cannot reduce boards below 9, but it substantially improves official remnant quality.

## Interpretation

This is NOT a deep-search problem.

The important result is:
1. area LB says 8
2. stronger kerf/DFF bound proves 9
3. baseline/current V3 immediately reaches 9
4. no expensive Master/OneBoard/MultiSlice/Compactation stage activates
5. board optimality is certified in well under 0.5 s

This is exactly the kind of case where strong lower bounds prevent futile search.

For the likely production default of a grained Scotch decor with no explicit per-piece rotation override:
- use the LOCKED result
- 9 boards is certified minimum
- no piece rotation is required

If the user explicitly enables rotation for these pieces:
- minimum remains 9
- remnant geometry can change materially, especially with trim

GitHub Actions sentinel:
- workflow: Optimizer Faplac Blend Scotch Sentinel
- run: 35772982956
- conclusion: SUCCESS
