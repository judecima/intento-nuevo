import { createRequire } from "node:module";
import { stableJson, compareText, freezeDeep } from "./canonical.mjs";
import { CUT_POLICY_VERSION, COORDINATE_POLICY } from "./cut-policy.mjs";
const require = createRequire(import.meta.url);
const { calidadRestos } = require("../../../src/lib/optimizer/legacy/motor.cjs");
export const FRONTIER_VERSION = "b0-frontier-v1";
export const DIVERSITY_POLICY = "remnant-shape-v1";

export function geometryKey(context, state) {
  if (![state.width, state.height, state.level].every(Number.isSafeInteger) || state.width <= 0 ||
      state.height <= 0 || state.level < 1 || state.level > context.opts.etapas + 1 ||
      !["x", "y"].includes(state.axis)) throw new RangeError("invalid geometry state");
  return stableJson({ contextHash: context.contextHash, width: state.width, height: state.height,
    axis: state.axis, physicalLevel: state.level, terminalPolicy: CUT_POLICY_VERSION, cutPolicy: COORDINATE_POLICY });
}
export function entrySignature(entry) {
  return stableJson({ geometryKey: entry.geometryKey, usageVector: entry.usageVector, cutTree: entry.cutTree,
    usedArea: entry.usedArea, remnants: entry.remnants, cutComplexity: entry.cutComplexity });
}
const lex = (a, b) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return 0;
};
function ranked(entry, opts) {
  const q = calidadRestos(entry.remnants, opts);
  return { entry, signature: entrySignature(entry), shape: stableJson(entry.remnants),
    rank: [-q.mayor, -q.segundo, q.fragmentos, -q.total, ...entry.cutComplexity] };
}
const compare = (a, b) => lex(a.rank, b.rank) || compareText(a.signature, b.signature);

/** Owns frontier slots, not subtrees: accepted descriptors become deeply frozen.
 * Subtrees may be shared; releasing/replacing a slot never mutates its tree.
 * Only exact canonical duplicates are eliminated without a heuristic flag.
 */
export function createFrontier(context, state, work, { maxVariantsPerUsageVector: k }) {
  if (!Number.isSafeInteger(k) || k < 1) throw new RangeError("K must be a positive safe integer");
  const key = geometryKey(context, state), groups = new Map();
  let closed = false;
  const stats = { duplicates: 0, duplicateUsageVectors: 0, heuristic: 0, dominated: 0, inserted: 0, replaced: 0 };
  return Object.freeze({
    key,
    insert(entry) {
      if (closed) throw new Error("frontier is disposed");
      if (work.snapshot().searchStopReason !== null) return "WORK_LIMIT";
      if (entry.geometryKey !== key) throw new Error("entry belongs to another geometry/context");
      if (!Array.isArray(entry.usageVector) || entry.usageVector.length !== context.types.length ||
          entry.usageVector.some((n, i) => !Number.isSafeInteger(n) || n < 0 || n > context.types[i].quantity)) throw new RangeError("invalid frontier demand");
      if (!entry.cutTree || !Array.isArray(entry.remnants) || !Array.isArray(entry.cutComplexity) || entry.cutComplexity.length !== 3 ||
          entry.cutComplexity.some((n) => !Number.isFinite(n) || n < 0) || !Number.isFinite(entry.usedArea) || entry.usedArea < 0 ||
          entry.remnants.some((r) => ![r.x, r.y, r.w, r.h].every(Number.isFinite) || r.x < 0 || r.y < 0 || r.w <= 0 || r.h <= 0)) throw new TypeError("invalid frontier summary");
      const usage = stableJson(entry.usageVector), group = groups.get(usage) ?? [];
      if (group.length) stats.duplicateUsageVectors++;
      const candidate = ranked(entry, context.opts);
      if (group.some((e) => e.signature === candidate.signature)) { stats.duplicates++; return "DUPLICATE"; }
      if (group.length < k) {
        if (!work.tryReserveFrontier()) return "WORK_LIMIT";
        freezeDeep(entry); groups.set(usage, [...group, candidate]); stats.inserted++;
        return "INSERTED";
      }
      // One representative per complete remnant signature, then spare slots
      // filled by remaining trees. Ranking is a total order, without epsilon.
      const all = [...group, candidate].sort(compare), shapes = new Set(), representatives = [];
      for (const e of all) if (!shapes.has(e.shape)) { shapes.add(e.shape); representatives.push(e); }
      const selected = representatives.slice(0, k);
      for (const e of all) if (selected.length < k && !selected.includes(e)) selected.push(e);
      stats.heuristic++; // exactly one discarded alternative, including replacements
      if (!selected.includes(candidate)) return "HEURISTIC_PRUNED";
      if (!work.replaceFrontierEntry()) return "WORK_LIMIT";
      freezeDeep(entry); groups.set(usage, selected); stats.inserted++; stats.replaced++;
      return "REPLACED";
    },
    entries() { return [...groups.values()].flat().sort((a, b) => compareText(a.signature, b.signature)).map((e) => e.entry); },
    snapshot() { return { ...stats, searchRestricted: stats.heuristic > 0,
      restrictionReasons: stats.heuristic ? ["maxVariantsPerUsageVector"] : [], size: [...groups.values()].reduce((s, g) => s + g.length, 0) }; },
    dispose() {
      if (closed) return;
      const count = [...groups.values()].reduce((s, g) => s + g.length, 0);
      if (count) work.releaseFrontier(count);
      groups.clear(); closed = true;
    },
  });
}
