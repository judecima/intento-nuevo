import { stableJson, digest, freezeDeep } from "./canonical.mjs";
import { createWorkBudget } from "./work-budget.mjs";
import { cutCoordinates, COORDINATE_POLICY } from "./cut-policy.mjs";
import { createFrontier, geometryKey, entrySignature, FRONTIER_VERSION, DIVERSITY_POLICY } from "./frontier.mjs";
import { descriptorFactory } from "./descriptors.mjs";
import { materializePattern, MATERIALIZER_VERSION } from "./physical-pattern.mjs";
import { orderMaterializationRoots, orderPatternPool, poolHashes, MATERIALIZATION_POLICY, POOL_ORDERING_POLICY } from "./ordering.mjs";
export const GENERATOR_VERSION = "b0-and-or-h2-v1";

function retainedNodes(entries) {
  const nodes = new Set();
  const visit = (tree) => {
    if (nodes.has(tree)) return;
    nodes.add(tree);
    for (const part of tree.parts ?? []) visit(part.content);
  };
  entries.forEach((entry) => visit(entry.cutTree));
  return nodes.size;
}

/** Research only. Cache is local to this context, K and work ledger. COMPLETE
 * means traversal finished under piece-multiples-v1 and the declared K policy.
 * roots/stateAudit are H2 evidence; they are not a production Master adapter.
 */
export function generatePatterns(context, limits, { maxVariantsPerUsageVector, rootAxes = ["x", "y"] } = {}) {
  if (!Number.isSafeInteger(maxVariantsPerUsageVector) || maxVariantsPerUsageVector < 1) throw new RangeError("positive K required");
  if (!Array.isArray(rootAxes) || !rootAxes.length || rootAxes.length > 2 || new Set(rootAxes).size !== rootAxes.length ||
      rootAxes.some((a) => !["x", "y"].includes(a))) throw new RangeError("invalid root axes");
  const work = createWorkBudget(limits), factory = descriptorFactory(context);
  const cache = new Map(), frontiers = [], stateAudit = [], rootVisits = [], roots = [];
  const counters = { cacheHits: 0, coordinateStreams: 0, coordinateProposals: 0, duplicateCoordinates: 0,
    andPairsConsidered: 0, andPairsAccepted: 0 };
  const stopped = () => work.snapshot().searchStopReason !== null;
  function solve(state) {
    const key = geometryKey(context, state);
    if (stopped()) return null;
    if (cache.has(key)) { counters.cacheHits++; return cache.get(key); }
    const frontier = createFrontier(context, state, work, { maxVariantsPerUsageVector });
    frontiers.push(frontier);
    const audit = { key, complete: false, cached: false }; stateAudit.push(audit);
    if (!work.tryExpand()) return frontier;
    frontier.insert(factory.waste(state));
    for (const type of context.types) for (const o of type.orientations) {
      if (!work.tryExpand()) return frontier;
      if (o.width === state.width && o.height === state.height) frontier.insert(factory.piece(state, type, o));
    }
    if (state.level <= context.opts.etapas) for (const thickness of cutCoordinates(context, state, work, counters)) {
      const span = state.axis === "x" ? state.width : state.height;
      const perpendicular = state.axis === "x" ? state.height : state.width;
      const block = { width: state.axis === "x" ? thickness : state.width,
        height: state.axis === "y" ? thickness : state.height, axis: state.axis === "x" ? "y" : "x", level: state.level + 1 };
      const left = solve(block);
      if (stopped()) break;
      const contents = left.entries();
      terminalCandidates: if (state.level === context.opts.etapas) for (const type of context.types) for (const o of type.orientations) {
        if (!work.tryExpand()) break terminalCandidates;
        if ((state.axis === "x" ? o.width : o.height) === thickness && (state.axis === "x" ? o.height : o.width) < perpendicular) {
          contents.push(factory.terminal(block, state.axis, type, o));
        }
      }
      if (stopped()) break;
      const remaining = Math.max(0, span - thickness - (thickness < span ? context.kerf : 0));
      const tail = remaining ? solve({ ...state, width: state.axis === "x" ? remaining : state.width,
        height: state.axis === "y" ? remaining : state.height }) : null;
      if (stopped()) break;
      const tails = tail ? tail.entries() : [factory.empty()];
      pairs: for (const head of contents) for (const end of tails) {
        if (!work.tryCombine()) break pairs;
        counters.andPairsConsidered++;
        const candidate = factory.combine(state, thickness, head, end);
        if (!candidate) continue;
        counters.andPairsAccepted++;
        if (frontier.insert(candidate) === "WORK_LIMIT") break pairs;
      }
      if (stopped()) break;
    }
    if (!stopped()) { audit.complete = true; audit.cached = true; cache.set(key, frontier); }
    return frontier;
  }
  try {
    for (const axis of rootAxes) {
      if (stopped()) { rootVisits.push({ axis, status: "NOT_STARTED" }); continue; }
      const frontier = solve({ width: context.width, height: context.height, axis, level: 1 });
      rootVisits.push({ axis, status: stopped() ? "WORK_LIMIT" : "COMPLETE" });
      roots.push(...frontier.entries().map((entry) => freezeDeep({ ...entry, rootAxis: axis })));
    }
    const searchComplete = !stopped();
    const candidates = orderMaterializationRoots(roots.filter((r) => r.usageVector.some(Boolean)), context);
    const patterns = [], failures = [];
    for (const root of candidates) {
      try {
        const result = materializePattern(context, root.cutTree, { budget: work, rootAxis: root.rootAxis });
        if (result.status === "WORK_LIMIT") break;
        patterns.push(result.pattern);
      } catch (error) {
        failures.push({ root: entrySignature(root), error: String(error.message ?? error) });
      }
    }
    const stats = frontiers.map((f) => f.snapshot());
    const sum = (field) => stats.reduce((s, row) => s + row[field], 0);
    const restrictionReasons = [COORDINATE_POLICY];
    if (sum("heuristic")) restrictionReasons.push("maxVariantsPerUsageVector");
    if (rootAxes.length !== 2) restrictionReasons.push("root-axis-subset");
    const pool = orderPatternPool(patterns, context);
    const telemetry = { ...counters, ...work.snapshot(), geometryStates: stateAudit.length,
      demandStates: frontiers.reduce((s, f) => s + new Set(f.entries().map((e) => stableJson(e.usageVector))).size, 0),
      duplicateUsageVectors: sum("duplicateUsageVectors"), frontierPruned: { duplicate: sum("duplicates"), heuristic: sum("heuristic"), dominated: sum("dominated") },
      retainedTreeNodes: retainedNodes(frontiers.flatMap((f) => f.entries())), retainedRootTreeNodes: retainedNodes(roots),
      cachedCompleteStates: cache.size, incompleteStates: stateAudit.filter((s) => !s.complete).length,
      materializations: work.snapshot().used.materializations, invalid: failures.length, searchComplete, rootVisits };
    return { status: failures.length ? "INVALID" : stopped() ? "WORK_LIMIT" : "COMPLETE",
      searchRestricted: true, restrictionReasons, patterns: pool, roots, stateAudit, failures, telemetry,
      ...poolHashes(pool, context), rootHash: digest(roots.map((r) => [r.rootAxis, entrySignature(r)])),
      provenance: { contextHash: context.contextHash, generatorVersion: GENERATOR_VERSION, materializerVersion: MATERIALIZER_VERSION,
        budgetHash: digest(limits), policyHash: digest({ maxVariantsPerUsageVector, rootAxes, cutPolicy: COORDINATE_POLICY,
          frontier: FRONTIER_VERSION, diversity: DIVERSITY_POLICY, materialization: MATERIALIZATION_POLICY, ordering: POOL_ORDERING_POLICY }) } };
  } finally {
    // Snapshots describe occupancy before cleanup. Returned roots keep their
    // own immutable tree references; slot release does not destroy subtrees.
    for (const frontier of frontiers) frontier.dispose();
    cache.clear();
  }
}
