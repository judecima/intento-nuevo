import { fromUnits, toUnits } from "./context.mjs";
import { geometryKey } from "./frontier.mjs";
const rect = (w, h, x = 0, y = 0) => ({ x: fromUnits(x), y: fromUnits(y), w: fromUnits(w), h: fromUnits(h) });
export function descriptorFactory(context) {
  let nextId = 0;
  const zero = () => context.types.map(() => 0);
  const stamp = (state, value) => ({ ...value, geometryKey: geometryKey(context, state), nodeId: nextId++ });
  function waste(state) {
    return stamp(state, { usageVector: zero(), usedArea: 0, cutTree: { kind: "waste" },
      remnants: [rect(state.width, state.height)], cutComplexity: [0, 0, 0] });
  }
  function piece(state, type, orientation) {
    const usageVector = zero(); usageVector[type.index] = 1;
    return stamp(state, { usageVector, usedArea: fromUnits(orientation.width) * fromUnits(orientation.height),
      cutTree: { kind: "piece", type: type.index, rotated: orientation.rotated }, remnants: [], cutComplexity: [0, 0, 0] });
  }
  function terminal(state, parentAxis, type, orientation) {
    const value = piece(state, type, orientation);
    value.cutTree = { ...value.cutTree, kind: "terminal" };
    const span = parentAxis === "x" ? state.height : state.width;
    const extent = parentAxis === "x" ? orientation.height : orientation.width;
    const consumed = Math.min(span, extent + context.kerf);
    value.remnants = consumed === span ? [] : [parentAxis === "x"
      ? rect(state.width, span - consumed, 0, consumed) : rect(span - consumed, state.height, consumed, 0)];
    value.cutComplexity = [1, state.level, fromUnits(parentAxis === "x" ? state.width : state.height)];
    return value;
  }
  function combine(state, thickness, left, right) {
    const usageVector = left.usageVector.map((n, i) => n + right.usageVector[i]);
    if (usageVector.some((n, i) => n > context.types[i].quantity)) return null;
    const span = state.axis === "x" ? state.width : state.height;
    const cut = thickness < span, consumed = Math.min(span, thickness + (cut ? context.kerf : 0));
    const parts = [{ size: fromUnits(thickness), content: left.cutTree }];
    if (right.cutTree.kind === "slice") parts.push(...right.cutTree.parts);
    else if (right.cutTree.kind === "piece") parts.push({ size: fromUnits(span - consumed), content: right.cutTree });
    const usedArea = Number(usageVector.reduce((sum, n, i) => sum + BigInt(n) * BigInt(context.types[i].cutWidth) * BigInt(context.types[i].cutHeight), 0n)) / 1e6;
    return stamp(state, { usageVector, usedArea, cutTree: { kind: "slice", axis: state.axis, parts },
      remnants: [...left.remnants, ...right.remnants.map((r) => ({ ...r,
        x: fromUnits(toUnits(r.x) + (state.axis === "x" ? consumed : 0)), y: fromUnits(toUnits(r.y) + (state.axis === "y" ? consumed : 0)) }))],
      cutComplexity: [left.cutComplexity[0] + right.cutComplexity[0] + Number(cut),
        Math.max(left.cutComplexity[1], right.cutComplexity[1], cut ? state.level : 0),
        fromUnits(toUnits(left.cutComplexity[2]) + toUnits(right.cutComplexity[2]) + (cut ? (state.axis === "x" ? state.height : state.width) : 0))] });
  }
  return { waste, piece, terminal, combine,
    empty: () => ({ usageVector: zero(), usedArea: 0, cutTree: { kind: "waste" }, remnants: [], cutComplexity: [0, 0, 0] }) };
}
