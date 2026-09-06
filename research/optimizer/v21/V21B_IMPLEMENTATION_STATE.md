# V21b implementation state

Acceptance candidate is now isolated from the failed V21a certified prepass.

Runtime delta intended for V21b:
- `src/lib/optimizer/legacy/patrones.cjs`: family-base/family-height seeds + 20 random rounds when `OPTIMIZER_V21_FAMILY_MASTER_EXPERIMENTAL=1`;
- `src/lib/optimizer/experimental/furniture-pattern-seeds.cjs`: deterministic family detection;
- same V10 control flow, same coverage solver, same materialization, same industrial validator.

The separate certified prepass is closed and must remain OFF during V21b measurements.

Smoke result: same boards with Master active and prepass disabled.

Early paired signal on three real hotspot XMLs: Master -47.1% aggregate, total -23.0%, board regressions 0/3. This is not the acceptance result; the frozen 213 same-machine A/B remains authoritative.
