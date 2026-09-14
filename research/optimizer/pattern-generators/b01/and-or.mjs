import { stableJson, digest, freezeDeep } from "../canonical.mjs";
import { createWorkBudget } from "../work-budget.mjs";
import { COORDINATE_POLICY } from "../cut-policy.mjs";
import { createFrontier, geometryKey, entrySignature, FRONTIER_VERSION, DIVERSITY_POLICY } from "../frontier.mjs";
import { descriptorFactory } from "../descriptors.mjs";
import { materializePattern, MATERIALIZER_VERSION } from "../physical-pattern.mjs";
import { orderMaterializationRoots, orderPatternPool, poolHashes, MATERIALIZATION_POLICY, POOL_ORDERING_POLICY } from "../ordering.mjs";
import { createCandidateIndex, coordinateCursor } from "./candidates.mjs";
import { createAgenda } from "./agenda.mjs";
export const GENERATOR_VERSION = "b01-incremental-v2";
export const SCHEDULING_POLICY = "round-robin-axis-level-state-delta-v2";
function retainedNodes(entries) {
  const nodes = new Set();
  const visit = (tree) => { if (nodes.has(tree)) return; nodes.add(tree); for (const p of tree.parts ?? []) visit(p.content); };
  entries.forEach((entry) => visit(entry.cutTree)); return nodes.size;
}

export function generatePatterns(context, limits, { maxVariantsPerUsageVector, rootAxes = ["x", "y"] } = {}) {
  if (!Number.isSafeInteger(maxVariantsPerUsageVector) || maxVariantsPerUsageVector < 1) throw new RangeError("positive K required");
  if (!Array.isArray(rootAxes) || !rootAxes.length || rootAxes.length > 2 || new Set(rootAxes).size !== rootAxes.length ||
    rootAxes.some((a) => !["x", "y"].includes(a))) throw new RangeError("invalid root axes");
  const work = createWorkBudget(limits), factory = descriptorFactory(context), agenda = createAgenda(rootAxes);
  const states = new Map(), rootStates = [], pins = new Map(), discoveries = new Map();
  const counters = { cacheHits: 0, sharedStateHits: 0, logicalRequests: 0, coordinateStreams: 0, coordinateProposals: 0,
    duplicateCoordinates: 0, andPairsConsidered: 0, andPairsAccepted: 0, evictedPartnerPairs: 0,
    schedulerTurns: 0, propagationPinsPeak: 0, terminalEntries: 0, firstNonEmptyRootExpansion: null,
    firstMaterializableRootExpansion: null, expansionsByWork: {}, expansionsByRootAxis: { x: 0, y: 0, shared: 0 },
    expansionsByAxis: { x: 0, y: 0, shared: 0 }, expansionsByWorkAndRootAxis: {}, andPairsByRootAxis: { x: 0, y: 0 } };
  const stopped = () => work.snapshot().searchStopReason !== null;
  function admit(kind, lane, axis) {
    if (!work.tryExpand()) return false;
    counters.expansionsByWork[kind] = (counters.expansionsByWork[kind] ?? 0) + 1;
    counters.expansionsByRootAxis[lane]++; counters.expansionsByAxis[axis]++;
    const detail = counters.expansionsByWorkAndRootAxis[kind] ??= { x: 0, y: 0, shared: 0 }; detail[lane]++;
    return true;
  }
  const index = createCandidateIndex(context, admit);
  function accept(state, entry, terminal = false) {
    if (terminal) {
      if (!work.tryReserveFrontier()) return;
      state.terminals.push(entry); counters.terminalEntries++; freezeDeep(entry);
    } else {
      const result = state.frontier.insert(entry);
      if (result !== "INSERTED" && result !== "REPLACED") return;
    }
    state.live = new Map([...state.frontier.entries(), ...state.terminals].map((e) => [e.nodeId, e]));
    if (state.rootAxis && entry.usageVector.some(Boolean)) {
      const expansion = work.snapshot().used.expansions;
      counters.firstNonEmptyRootExpansion ??= expansion; discoveries.set(entry.nodeId, expansion);
    }
    if (state.listeners.length) notify(state, entry);
  }
  function combine(arc, head, tail) {
    if (!work.tryCombine()) return;
    counters.andPairsConsidered++; counters.andPairsByRootAxis[arc.parent.lane]++;
    if (!head || !tail) { counters.evictedPartnerPairs++; return; }
    const entry = factory.combine(arc.parent.geometry, arc.thickness, head, tail);
    if (!entry) return;
    counters.andPairsAccepted++; accept(arc.parent, entry);
  }
  function addPairs(arc) {
    // Bootstrap an arc from current inputs. Later additions trigger deltas.
    // No demand filter, pair cache or pair deduplication is introduced.
    const heads = [...arc.left.live.keys()], tails = arc.tail ? [...arc.tail.live.keys()] : [-1];
    let h = 0, t = 0;
    agenda.add(arc.parent.lane, true, () => {
      if (h >= heads.length || !tails.length) return false;
      combine(arc, arc.left.live.get(heads[h]), arc.tail ? arc.tail.live.get(tails[t]) : factory.empty());
      if (++t === tails.length) { t = 0; h++; }
      return h < heads.length;
    }, arc.parent.geometry.level);
  }
  function notify(source, entry) {
    // One charged pin per delta, shared by all listeners, even after K eviction.
    if (!work.tryReserveFrontier()) return;
    const token = {}; pins.set(token, entry);
    counters.propagationPinsPeak = Math.max(counters.propagationPinsPeak, pins.size);
    const listeners = [...source.listeners];
    let listener = 0, partners = null, cursor = 0;
    agenda.add(source.lane, true, () => {
      while (listener < listeners.length) {
        const { arc, left } = listeners[listener];
        const other = left ? arc.tail : arc.left;
        partners ??= other ? [...other.live.keys()] : [-1];
        if (cursor < partners.length) {
          const partner = other ? other.live.get(partners[cursor++]) : (cursor++, factory.empty());
          combine(arc, left ? entry : partner, left ? partner : entry);
          return true;
        }
        listener++; partners = null; cursor = 0;
      }
      pins.delete(token); work.releaseFrontier(); return false;
    }, source.geometry.level);
  }
  function stateFor(geometry, lane, rootAxis = null) {
    counters.logicalRequests++;
    const key = geometryKey(context, geometry);
    if (states.has(key)) { counters.sharedStateHits++; return states.get(key); }
    const state = { geometry, lane, rootAxis, key, frontier: createFrontier(context, geometry, work, { maxVariantsPerUsageVector }),
      terminals: [], live: new Map(), listeners: [], enumerated: false, stage: "waste", candidates: [], candidate: 0, coordinates: null };
    states.set(key, state);
    agenda.add(lane, false, () => advance(state), geometry.level);
    return state;
  }
  function advance(state) {
    const s = state.geometry;
    if (state.stage === "waste") {
      if (!admit("stateWaste", state.lane, s.axis)) return false;
      accept(state, factory.waste(s)); state.stage = "exactLookup";
    } else if (state.stage === "exactLookup") {
      if (!admit("exactLookup", state.lane, s.axis)) return false;
      state.candidates = index.exact(s); state.candidate = 0; state.stage = "piece";
    } else if (state.stage === "piece" && state.candidate < state.candidates.length) {
      if (!admit("piece", state.lane, s.axis)) return false;
      const { type, orientation } = state.candidates[state.candidate++]; accept(state, factory.piece(s, type, orientation));
    } else if (state.stage === "piece") {
      state.stage = s.level > context.opts.etapas ? "terminalLookup" : "coordinates";
      if (state.stage === "coordinates") state.coordinates = coordinateCursor(context, s, index.orientations, counters);
    } else if (state.stage === "terminalLookup") {
      if (!admit("terminalLookup", state.lane, s.axis)) return false;
      state.candidates = index.terminal(s); state.candidate = 0; state.stage = "terminal";
    } else if (state.stage === "terminal" && state.candidate < state.candidates.length) {
      if (!admit("terminal", state.lane, s.axis)) return false;
      const { type, orientation } = state.candidates[state.candidate++];
      accept(state, factory.terminal(s, s.axis === "x" ? "y" : "x", type, orientation), true);
    } else if (state.stage === "coordinates" && state.coordinates.kind) {
      if (!admit(state.coordinates.kind, state.lane, s.axis)) return false;
      const thickness = state.coordinates.step();
      if (thickness !== null) {
        const span = s.axis === "x" ? s.width : s.height;
        const remaining = Math.max(0, span - thickness - (thickness < span ? context.kerf : 0));
        const left = stateFor({ width: s.axis === "x" ? thickness : s.width, height: s.axis === "y" ? thickness : s.height,
          axis: s.axis === "x" ? "y" : "x", level: s.level + 1 }, state.lane);
        const tail = remaining ? stateFor({ ...s, width: s.axis === "x" ? remaining : s.width,
          height: s.axis === "y" ? remaining : s.height }, state.lane) : null;
        const arc = { parent: state, left, tail, thickness };
        left.listeners.push({ arc, left: true }); tail?.listeners.push({ arc, left: false });
        addPairs(arc);
      }
    } else { state.enumerated = true; return false; }
    return true;
  }
  try {
    if (index) for (const axis of rootAxes) rootStates.push(stateFor({ width: context.width, height: context.height, axis, level: 1 }, axis, axis));
    while (!stopped()) {
      const item = agenda.take(); if (!item) break;
      counters.schedulerTurns++;
      if (item.task() && !stopped()) agenda.add(item.axis, item.propagation, item.task, item.level);
    }
    const searchComplete = !stopped();
    const roots = rootStates.flatMap((s) => s.frontier.entries().map((e) => freezeDeep({ ...e, rootAxis: s.rootAxis })));
    const nonempty = roots.filter((r) => r.usageVector.some(Boolean)), patterns = [], failures = [];
    for (const root of orderMaterializationRoots(nonempty, context)) {
      try {
        const result = materializePattern(context, root.cutTree, { budget: work, rootAxis: root.rootAxis });
        if (result.status === "WORK_LIMIT") break;
        patterns.push(result.pattern);
        const discovered = discoveries.get(root.nodeId);
        counters.firstMaterializableRootExpansion = counters.firstMaterializableRootExpansion === null ? discovered : Math.min(counters.firstMaterializableRootExpansion, discovered);
      } catch (error) { failures.push({ root: entrySignature(root), error: String(error.message ?? error) }); }
    }
    const allStates = [...states.values()], stats = allStates.map((s) => s.frontier.snapshot());
    const sum = (field) => stats.reduce((n, s) => n + s[field], 0);
    const stateAudit = allStates.map((s) => ({ key: s.key, complete: searchComplete && s.enumerated, cached: searchComplete && s.enumerated }));
    const reasons = [COORDINATE_POLICY];
    if (sum("heuristic")) reasons.push("maxVariantsPerUsageVector");
    if (rootAxes.length !== 2) reasons.push("root-axis-subset");
    const pool = orderPatternPool(patterns, context);
    return { status: failures.length ? "INVALID" : stopped() ? "WORK_LIMIT" : "COMPLETE", searchRestricted: true,
      restrictionReasons: reasons, patterns: pool, roots, stateAudit, failures,
      telemetry: { ...counters, ...work.snapshot(), geometryStates: states.size,
        demandStates: allStates.reduce((n, s) => n + new Set([...s.live.values()].map((e) => stableJson(e.usageVector))).size, 0),
        duplicateUsageVectors: sum("duplicateUsageVectors"), frontierPruned: { duplicate: sum("duplicates"), heuristic: sum("heuristic"), dominated: sum("dominated") },
        retainedTreeNodes: retainedNodes([...allStates.flatMap((s) => [...s.live.values()]), ...pins.values()]), retainedRootTreeNodes: retainedNodes(roots),
        cachedCompleteStates: stateAudit.filter((s) => s.cached).length, incompleteStates: stateAudit.filter((s) => !s.complete).length,
        liveStateReuseIsCompleteCache: false, propagationPinsLive: pins.size, agenda: agenda.snapshot(),
        materializations: work.snapshot().used.materializations, invalid: failures.length, searchComplete,
        rootPatternsProduced: nonempty.length, rootUsageVectorsProduced: new Set(nonempty.map((e) => stableJson(e.usageVector))).size,
        rootVisits: rootAxes.map((axis) => ({ axis, status: !rootStates.some((s) => s.rootAxis === axis && s.live.size) ? "NOT_STARTED" : searchComplete ? "COMPLETE" : "WORK_LIMIT" })) },
      ...poolHashes(pool, context), rootHash: digest(roots.map((r) => [r.rootAxis, entrySignature(r)])),
      provenance: { contextHash: context.contextHash, generatorVersion: GENERATOR_VERSION, materializerVersion: MATERIALIZER_VERSION,
        budgetHash: digest(limits), policyHash: digest({ maxVariantsPerUsageVector, rootAxes, cutPolicy: COORDINATE_POLICY,
          frontier: FRONTIER_VERSION, diversity: DIVERSITY_POLICY, materialization: MATERIALIZATION_POLICY, ordering: POOL_ORDERING_POLICY,
          scheduling: SCHEDULING_POLICY, index: "exact-geometry-v1", transientSlots: "charged-deltas-and-terminals-v1" }) } };
  } finally {
    if (pins.size) work.releaseFrontier(pins.size); pins.clear();
    for (const state of states.values()) { state.frontier.dispose(); if (state.terminals.length) work.releaseFrontier(state.terminals.length); }
    states.clear();
  }
}
