"use strict";

// Safe geometric lower bounds for axis-aligned rectangular packing.
// Experimental/offline only. These bounds are intentionally conservative:
// they may fail to prove optimality, but must never overstate it.

function feasibleOrientations(line, opts) {
  const W = +opts.placaBase;
  const H = +opts.placaAltura;
  const w = +line.base, h = +line.altura;
  const locked = !!opts.materialConVeta && !!line.veta;
  const out = [];
  if (w <= W + 1e-9 && h <= H + 1e-9) out.push([w, h]);
  if (!locked && Math.abs(w - h) > 1e-9 && h <= W + 1e-9 && w <= H + 1e-9) out.push([h, w]);
  return out;
}

function pairCanShareBoard(oa, ob, W, H, saw = 0) {
  for (const [aw, ah] of oa) {
    for (const [bw, bh] of ob) {
      // A separating guillotine cut is sufficient for coexistence. If neither
      // horizontal nor vertical separation is possible in any orientation,
      // the pair is certainly incompatible in any valid guillotine plan.
      if (aw + bw + saw <= W + 1e-9 && Math.max(ah, bh) <= H + 1e-9) return true;
      if (ah + bh + saw <= H + 1e-9 && Math.max(aw, bw) <= W + 1e-9) return true;
    }
  }
  return false;
}

function greedyIncompatibilityClique(lineas, opts, maxInstances = 140) {
  const W = +opts.placaBase, H = +opts.placaAltura, saw = +opts.sierra || 0;
  const instances = [];
  for (let i = 0; i < lineas.length; i++) {
    const os = feasibleOrientations(lineas[i], opts);
    if (!os.length) continue;
    const q = +lineas[i].cant || 0;
    for (let k = 0; k < q; k++) instances.push({ type: i, os });
  }
  const n = instances.length;
  if (!n || n > maxInstances) return 0;
  const adj = Array.from({ length: n }, () => new Set());
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (!pairCanShareBoard(instances[i].os, instances[j].os, W, H, saw)) {
        adj[i].add(j); adj[j].add(i);
      }
    }
  }
  let best = 0;
  // Seed from every vertex. Any clique found is a safe LB even if not maximum.
  for (let seed = 0; seed < n; seed++) {
    let cand = new Set(adj[seed]);
    let size = 1;
    while (cand.size) {
      let chosen = -1, score = -1;
      for (const v of cand) {
        let s = 0;
        for (const u of cand) if (adj[v].has(u)) s++;
        if (s > score) { score = s; chosen = v; }
      }
      if (chosen < 0) break;
      size++;
      const next = new Set();
      for (const u of cand) if (adj[chosen].has(u)) next.add(u);
      cand = next;
    }
    if (size > best) best = size;
  }
  return best;
}

function computeStrongLowerBound(lineas, opts, config = {}) {
  // Use the full stock rectangle, not trimmed usable dimensions. That makes
  // every bound weaker but guarantees safety if trim semantics vary.
  const W = +opts.placaBase, H = +opts.placaAltura;
  const totalArea = lineas.reduce((s, l) => s + (+l.cant || 0) * (+l.base) * (+l.altura), 0);
  const parts = [{ name: "area", value: Math.ceil(totalArea / (W * H) - 1e-9) }];
  const oriented = lineas.map((l) => ({ line: l, os: feasibleOrientations(l, opts) }));

  // Projection bounds. If every feasible orientation of a piece is wider than
  // W/k, at most k-1 such rectangles can cross the same horizontal scanline.
  // Integrating scanlines gives sum(minHeight) <= boards*(k-1)*H.
  const maxK = config.maxProjectionK ?? 9;
  for (let k = 2; k <= maxK; k++) {
    let verticalMeasure = 0;
    let horizontalMeasure = 0;
    for (const { line, os } of oriented) {
      if (!os.length) continue;
      const q = +line.cant || 0;
      if (os.every(([w]) => w > W / k + 1e-9)) {
        verticalMeasure += q * Math.min(...os.map(([, h]) => h));
      }
      if (os.every(([, h]) => h > H / k + 1e-9)) {
        horizontalMeasure += q * Math.min(...os.map(([w]) => w));
      }
    }
    parts.push({ name: `wide>${1}/${k}`, value: Math.ceil(verticalMeasure / ((k - 1) * H) - 1e-9) });
    parts.push({ name: `tall>${1}/${k}`, value: Math.ceil(horizontalMeasure / ((k - 1) * W) - 1e-9) });
  }

  // Obvious 2D cardinality bound: if every orientation is > half stock in both
  // dimensions, no two such pieces can share a board.
  let hugeCount = 0;
  for (const { line, os } of oriented) {
    if (os.length && os.every(([w, h]) => w > W / 2 + 1e-9 && h > H / 2 + 1e-9))
      hugeCount += +line.cant || 0;
  }
  parts.push({ name: "both>half", value: hugeCount });

  if (config.useClique !== false) {
    parts.push({ name: "incompatibility-clique", value: greedyIncompatibilityClique(lineas, opts, config.maxCliqueInstances ?? 140) });
  }

  parts.sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  return { lowerBound: parts[0]?.value || 0, reason: parts[0]?.name || "none", parts };
}

module.exports = { feasibleOrientations, pairCanShareBoard, greedyIncompatibilityClique, computeStrongLowerBound };
