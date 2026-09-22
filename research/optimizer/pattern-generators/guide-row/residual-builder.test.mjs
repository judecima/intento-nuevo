import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  enumerateGuideResidualStates,
  feasibleOrientations,
  prioritizeResidualStates,
} from "./residual-builder.mjs";

const external = JSON.parse(
  readFileSync(new URL("../guide-slice/fixtures/4961912-normalized.json", import.meta.url), "utf8"),
);
const lines = external.lines.map((line) => ({
  ...line,
  detalle: line.ref,
  veta: false,
  cantos: null,
}));
const config = {
  placaBase: external.board.l,
  placaAltura: external.board.w,
  refiladoX: external.board.trim,
  refiladoY: external.board.trim,
  sierra: external.board.saw,
  materialConVeta: false,
};

test("explicit canRotate overrides the grained-board default", () => {
  const grained = { base: 700, altura: 300, veta: true };
  assert.equal(feasibleOrientations(grained, { materialConVeta: true }).length, 1);
  assert.equal(
    feasibleOrientations({ ...grained, canRotate: true }, { materialConVeta: true }).length,
    2,
  );
  assert.equal(
    feasibleOrientations(
      { base: 700, altura: 300, veta: false, canRotate: false },
      { materialConVeta: false },
    ).length,
    1,
  );
});

test("4961912 residual kernel exposes the real branching before search", () => {
  const result = enumerateGuideResidualStates(lines, config);
  assert.deepEqual(result.telemetry, {
    version: "guide-row-residual-builder-h2a-v1",
    rawStates: 120,
    naturalStates: 62,
    successorChecks: 3660,
    feasibleSuccessorFamilies: 2594,
    rejectedByGeometry: 1066,
    effectClasses: 2594,
  });

  const ordered = prioritizeResidualStates(result.states);
  assert.ok(ordered.length > 0);
  assert.equal(ordered[0].natural, true);
  assert.equal(ordered.filter((state) => state.natural).length, 62);
});

test("equivalent geometry groups successors without losing logical demand identity", () => {
  const demand = [
    { ref: "G", base: 600, altura: 400, cant: 1, veta: false },
    { ref: "A", base: 300, altura: 200, cant: 2, veta: false },
    { ref: "B", base: 300, altura: 200, cant: 3, veta: false },
  ];
  const result = enumerateGuideResidualStates(demand, {
    placaBase: 1000,
    placaAltura: 600,
    refiladoX: 0,
    refiladoY: 0,
    sierra: 4,
    materialConVeta: false,
  });
  const state = result.states.find(
    (item) =>
      item.guideType === 0 &&
      item.repeat === 1 &&
      item.guideOrientation.base === 600,
  );
  assert.ok(state);

  const grouped = state.effectClasses.find((item) =>
    item.members.some((member) => member.type === 1),
  );
  assert.ok(grouped);
  assert.deepEqual(
    grouped.members.map((member) => member.type).sort((a, b) => a - b),
    [1, 2],
  );
});
