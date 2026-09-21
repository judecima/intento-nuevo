# Mandatory-type Master round pruning — checkpoint 2026-09-21

Branch: `research/master-mandatory-type-prune-20260921`

## Safe proof

For any current incumbent using `I` boards, Master only matters if it can build a solution with at most:

`B = I - 1`.

For type `i`, use the deliberately optimistic upper capacity:

`U_i = floor(full stock area / piece area_i)`.

This ignores kerf, trim, grain, guillotine stages and fragmentation, so it can only overestimate real per-board capacity.

If:

`(B - 1) * U_i < demand_i`

then every solution using `B` or fewer boards must place at least one piece of type `i` on every board. Therefore any generation round whose type mask omits that type cannot contribute a pattern to an accepted Master improvement and can be skipped safely.

## Static scan

Gate V2 survivors: 90.

Exact snapshots available for this analysis: 21; 69 historical rows are excluded because the current canonical snapshot differs.

- cases with at least one mandatory type: 3/21;
- total safely skippable scheduled rounds: 50;
- linear projected generation saving on the analyzed set: 8,407.55 ms = 3.164%.

This signal is therefore narrow, not a broad replacement for the unique-mask policy.

## Direct A/B

Three exact cases were executed baseline vs candidate.

All 3/3 preserve:
- industrial validity;
- board count;
- remnant quality (candidate not worse);
- Master win / boards-saved outcome;
- historical final board count.

Aggregate:
- baseline Master: 22,465 ms;
- candidate Master: 19,913 ms;
- Master saving: 2,552 ms = **11.360%**;
- baseline wall: 30,384.47 ms;
- candidate wall: 27,658.42 ms;
- wall saving: 2,726.05 ms = **8.972%**.

Per case:

- 4053911: 11 scheduled rounds safely removed, but Master time only falls 18,311 -> 17,392 ms (**5.0%**). Round cost is highly non-uniform.
- 4050613: all seven types are mandatory, so only the full-mask round is needed; 39/40 rounds skipped. Master falls 1,928 -> 250 ms (**87.0%**) and total wall 4,073 -> 2,387 ms (**41.4%**).
- 4059488: no non-empty round is removed; timing noise makes the candidate ~2% slower. This confirms the policy should not be enabled when it predicts zero/low pruning.

## Decision

Keep the proof and implementation experimental.

Do not apply the policy indiscriminately. The useful next version should enable it only when the proof removes a substantial fraction of rounds (for example >= 50%), because low-pruning cases do not recover enough cost.

Unique-mask <=4 remains the primary generator optimization. Mandatory-type pruning is complementary for >4-type cases with strongly forced demand, such as 4050613.
