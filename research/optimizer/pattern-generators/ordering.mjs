import { createRequire } from "node:module";
import { compareText, digest, stableJson } from "./canonical.mjs";
const require = createRequire(import.meta.url);
const { calidadRestos } = require("../../../src/lib/optimizer/legacy/motor.cjs");

export const MATERIALIZATION_POLICY = "usage-diversity-v1";
export const POOL_ORDERING_POLICY = "b0-v1";

const lex = (a, b) => {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return a.length - b.length;
};
function usageKey(usage, context) {
  if (!Array.isArray(usage) || usage.length !== context.types.length ||
      usage.some((n, i) => !Number.isSafeInteger(n) || n < 0 || n > context.types[i].quantity) ||
      !usage.some(Boolean)) throw new RangeError("invalid root usage vector");
  return [-usage.filter(Boolean).length, -usage.reduce((a, b) => a + b, 0), ...usage];
}
function qualityKey(remnants, opts) {
  const q = calidadRestos(remnants, opts);
  // Exact total order on the official metric components; no epsilon comparator
  // (epsilon equality can be non-transitive in Array.sort).
  return [-q.mayor, -q.segundo, q.fragmentos, -q.total];
}
function compareEntries(a, b) {
  return lex(a.group, b.group) || lex(a.quality, b.quality) || lex(a.complexity, b.complexity) || compareText(a.signature, b.signature);
}

/** Retained roots must carry summaries computed by the future frontier.
 * This orders descriptors only: it never materializes a tree to rank it.
 * First variant of every usage precedes every second variant, and so on.
 * Attempt this sequence through the work ledger, including invalid attempts.
 */
export function orderMaterializationRoots(roots, context) {
  const entries = roots.map((root) => {
    if (!root.cutTree || !Array.isArray(root.remnants) || !Array.isArray(root.cutComplexity) ||
        root.cutComplexity.length !== 3 || root.cutComplexity.some((n) => !Number.isFinite(n) || n < 0) ||
        root.remnants.some((r) => !Number.isFinite(r.w) || !Number.isFinite(r.h) || r.w <= 0 || r.h <= 0)) {
      throw new TypeError("root requires tree, positive remnants, and [cutCount, maxCutLevel, totalCutLength]");
    }
    return { value: root, group: usageKey(root.usageVector, context), quality: qualityKey(root.remnants, context.opts),
      complexity: root.cutComplexity, signature: stableJson({ usage: root.usageVector, tree: root.cutTree,
        remnants: root.remnants, complexity: root.cutComplexity }) };
  }).sort(compareEntries);
  const counts = new Map();
  for (const entry of entries) {
    const key = stableJson(entry.value.usageVector);
    entry.round = counts.get(key) ?? 0;
    counts.set(key, entry.round + 1);
  }
  return entries.sort((a, b) => a.round - b.round || compareEntries(a, b)).map((e) => e.value);
}

// Remove export IDs, template piece IDs and diagnostic paths from identity.
// Preserve physical sequence, type identity, orientation and residual geometry.
function treeContent(n) {
  return { x: n.x, y: n.y, w: n.w, h: n.h, dir: n.dir, nivel: n.nivel,
    partes: n.partes.map((p) => ({ cut: p.cut, type: p.type, bloque: p.bloque,
      pieceType: p.pieza?.ref ?? null, terminal: Boolean(p.terminal), hijo: treeContent(p.hijo) })) };
}
export function patternContent(pattern) {
  if (!(pattern.uso instanceof Map)) throw new TypeError("pattern usage must be a Map");
  const p = pattern.placa;
  return { usage: [...pattern.uso].sort((a, b) => a[0] - b[0]), area: pattern.area,
    board: { width: p.ancho, height: p.alto, tree: treeContent(p.arbol), cuts: p.cortes, remnants: p.restos,
      pieces: p.colocadas.map((c) => ({ x: c.x, y: c.y, w: c.base, h: c.altura,
        type: c.pieza.ref, rotated: c.rotada, level: c.nivel })) } };
}
export function orderPatternPool(patterns, context) {
  return patterns.map((pattern) => {
    for (const [type, count] of pattern.uso) {
      if (!Number.isSafeInteger(type) || !context.types[type] || !Number.isSafeInteger(count) || count <= 0) throw new RangeError("invalid pool usage");
    }
    const cuts = pattern.placa.cortes;
    return { value: pattern, group: usageKey(context.types.map((t) => pattern.uso.get(t.index) ?? 0), context),
      quality: qualityKey(pattern.placa.restos, context.opts),
      complexity: [cuts.length, cuts.reduce((m, c) => Math.max(m, c.nivel), 0), cuts.reduce((s, c) => s + c.largo, 0)],
      signature: stableJson(patternContent(pattern)) };
  }).sort(compareEntries).map((e) => e.value);
}
export function poolHashes(patterns, context) {
  const content = patterns.map((p) => stableJson(patternContent(p)));
  // Multiset hash: duplicates remain visible. The context binds type meaning.
  return { patternPoolHash: digest({ context: context.contextHash, content: [...content].sort(compareText) }),
    orderedPoolHash: digest({ context: context.contextHash, policy: POOL_ORDERING_POLICY, content }) };
}
