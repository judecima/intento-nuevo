import assert from "node:assert/strict";
import { test } from "node:test";
import { createContext } from "./context.mjs";
import { exhaustiveTinyOracle } from "./tiny-oracle.mjs";
import { materializePattern } from "./physical-pattern.mjs";
const context = (sierra = 0) => createContext([{ base: 1, altura: 1, cant: 3, ref: "A" }],
  { placaBase: 2 + sierra, placaAltura: 1, sierra, etapas: 1 });
test("independent oracle reaches zero, one and two pieces and never exceeds geometry", () => {
  for (const kerf of [0, 0.5]) {
    const ctx = context(kerf), results = exhaustiveTinyOracle(ctx);
    assert.deepEqual([...new Set(results.map((e) => e.usageVector[0]))].sort(), [0, 1, 2]);
    for (const e of results.filter((r) => r.usageVector.some(Boolean))) {
      const p = materializePattern(ctx, e.cutTree).pattern;
      assert.equal(p.placa.colocadas.length, e.usageVector[0]);
    }
  }
});
test("oracle includes terminal release and preserves distinct equal-size type identities", () => {
  const ctx = createContext([{ base: 1, altura: 1, cant: 1, ref: "A" }, { base: 1, altura: 1, cant: 1, ref: "B" }],
    { placaBase: 2, placaAltura: 2, sierra: 0, etapas: 1 });
  const entries = exhaustiveTinyOracle(ctx);
  assert.deepEqual([...new Set(entries.map((e) => e.usageVector.join(",")))].sort(), ["0,0", "0,1", "1,0", "1,1"]);
  assert.ok(entries.some((e) => JSON.stringify(e.cutTree).includes('"terminal"')));
  for (const e of entries.filter((r) => r.usageVector.some(Boolean))) assert.equal(materializePattern(ctx, e.cutTree).validation.secuenciaCompleta, true);
});
