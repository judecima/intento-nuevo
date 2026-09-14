// Test oracle only. No imports from search, frontier, cut-policy, descriptors,
// budgets or materializer. No memoization, alternative deduplication, heuristic pruning,
// work caps or timeout. Call only on deliberately tiny fixtures.
export function exhaustiveTinyOracle(context, rootAxis = "x") {
  if (!["x", "y"].includes(rootAxis)) throw new Error("invalid oracle root axis");
  const zero = () => context.types.map(() => 0);
  function coordinates(span, axis) {
    // Coordinate deduplication belongs to piece-multiples-v1; no tree or
    // usage alternative is discarded by the oracle.
    const positions = new Set();
    for (const type of context.types) for (const o of type.orientations) {
      const dimension = axis === "x" ? o.width : o.height;
      for (let n = 1; n <= type.quantity; n++) {
        const cut = n * dimension + (n - 1) * context.kerf;
        if (cut > span) break;
        positions.add(cut);
        const complement = span - cut - context.kerf;
        if (complement > 0) positions.add(complement);
      }
    }
    return [...positions].sort((a, b) => a - b);
  }
  function enumerate(width, height, axis, level) {
    const alternatives = [{ usageVector: zero(), cutTree: { kind: "waste" } }];
    for (const type of context.types) for (const o of type.orientations) {
      if (o.width === width && o.height === height) {
        const usageVector = zero(); usageVector[type.index] = 1;
        alternatives.push({ usageVector, cutTree: { kind: "piece", type: type.index, rotated: o.rotated } });
      }
    }
    if (level > context.opts.etapas) return alternatives;
    const span = axis === "x" ? width : height, perpendicular = axis === "x" ? height : width;
    for (const thickness of coordinates(span, axis)) {
      const contents = enumerate(axis === "x" ? thickness : width, axis === "y" ? thickness : height,
        axis === "x" ? "y" : "x", level + 1);
      if (level === context.opts.etapas) for (const type of context.types) for (const o of type.orientations) {
        if ((axis === "x" ? o.width : o.height) === thickness && (axis === "x" ? o.height : o.width) < perpendicular) {
          const usageVector = zero(); usageVector[type.index] = 1;
          contents.push({ usageVector, cutTree: { kind: "terminal", type: type.index, rotated: o.rotated } });
        }
      }
      const remaining = Math.max(0, span - thickness - (thickness < span ? context.kerf : 0));
      const tails = remaining > 0 ? enumerate(axis === "x" ? remaining : width, axis === "y" ? remaining : height, axis, level)
        : [{ usageVector: zero(), cutTree: { kind: "waste" } }];
      for (const content of contents) for (const tail of tails) {
        const usageVector = content.usageVector.map((n, i) => n + tail.usageVector[i]);
        if (usageVector.some((n, i) => n > context.types[i].quantity)) continue; // feasibility, not heuristic pruning
        const parts = [{ size: thickness / 1000, content: content.cutTree }];
        if (tail.cutTree.kind === "slice") parts.push(...tail.cutTree.parts);
        else if (tail.cutTree.kind === "piece") parts.push({ size: remaining / 1000, content: tail.cutTree });
        alternatives.push({ usageVector, cutTree: { kind: "slice", axis, parts } });
      }
    }
    return alternatives;
  }
  return enumerate(context.width, context.height, rootAxis, 1);
}
