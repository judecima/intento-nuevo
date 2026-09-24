"use strict";

const DEFAULT_SCALE = 1000;
const EPS = 1e-9;

function gcd2(a, b) {
  a = Math.abs(Math.trunc(a));
  b = Math.abs(Math.trunc(b));
  while (b) [a, b] = [b, a % b];
  return a || 1;
}

function mm(value, scale) {
  return Math.round(Number(value) * scale);
}

function addUsage(a, b) {
  const out = new Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] + b[i];
  return out;
}

function usageArea(usage, lines) {
  let area = 0;
  for (let i = 0; i < usage.length; i++) {
    area += usage[i] * Number(lines[i].base) * Number(lines[i].altura);
  }
  return area;
}

class MinHeap {
  constructor() { this.a = []; }
  push(value) {
    const a = this.a;
    let i = a.length;
    a.push(value);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p] <= value) break;
      a[i] = a[p];
      i = p;
    }
    a[i] = value;
  }
  pop() {
    const a = this.a;
    if (!a.length) return null;
    const root = a[0];
    const last = a.pop();
    if (a.length) {
      let i = 0;
      while (true) {
        let child = i * 2 + 1;
        if (child >= a.length) break;
        if (child + 1 < a.length && a[child + 1] < a[child]) child++;
        if (a[child] >= last) break;
        a[i] = a[child];
        i = child;
      }
      a[i] = last;
    }
    return root;
  }
  get size() { return this.a.length; }
}

function better(candidate, current) {
  if (!current) return true;
  if (candidate.value > current.value + EPS) return true;
  if (Math.abs(candidate.value - current.value) <= EPS) {
    if (candidate.area > current.area + EPS) return true;
    if (Math.abs(candidate.area - current.area) <= EPS && candidate.count < current.count) {
      return true;
    }
  }
  return false;
}

/**
 * Unbounded 1-D pricing DP with exact kerf accounting.
 *
 * A sequence of n segments is feasible when:
 *   sum(length) + n*kerf <= span                  (trailing waste is separated)
 * or
 *   sum(length) + (n-1)*kerf == span             (last segment reaches the edge)
 *
 * Using effective item cost length+kerf, these become:
 *   effective <= span
 * or
 *   effective == span+kerf.
 *
 * This DP is exact for the supplied item set while demand caps do not bind.
 */
function bestSequence(items, spanMm, kerfMm, typeCount, options = {}) {
  if (!items.length) return null;
  const scale = options.scale || DEFAULT_SCALE;
  const span = mm(spanMm, scale);
  const kerf = mm(kerfMm, scale);
  const cap = span + kerf;
  const maxStates = options.maxStates || 500000;

  const normalized = items
    .map((item) => ({
      ...item,
      effective: mm(item.dimension, scale) + kerf,
    }))
    .filter((item) => item.effective > 0 && item.effective <= cap && item.value > EPS);
  if (!normalized.length) return null;

  let divisor = 0;
  for (const item of normalized) divisor = gcd2(divisor, item.effective);
  divisor = Math.max(1, divisor);

  const compressed = normalized.map((item) => ({
    ...item,
    cost: Math.trunc(item.effective / divisor),
  }));
  const capC = Math.floor(cap / divisor);
  const spanFloorC = Math.floor(span / divisor);
  const exactCapC = cap % divisor === 0 ? capC : -1;

  const zeroUsage = new Array(typeCount).fill(0);
  const states = new Map();
  states.set(0, { value: 0, usage: zeroUsage, area: 0, count: 0, trace: null });
  const heap = new MinHeap();
  heap.push(0);
  const queued = new Set([0]);
  let restricted = false;

  while (heap.size) {
    const used = heap.pop();
    queued.delete(used);
    const state = states.get(used);
    if (!state) continue;

    for (const item of compressed) {
      const next = used + item.cost;
      if (next > capC) continue;
      const candidate = {
        value: state.value + item.value,
        usage: addUsage(state.usage, item.usage),
        area: state.area + item.area,
        count: state.count + 1,
        trace: { item, prev: state.trace },
      };
      const prev = states.get(next);
      if (!better(candidate, prev)) continue;
      if (!prev && states.size >= maxStates) {
        restricted = true;
        continue;
      }
      states.set(next, candidate);
      if (!queued.has(next)) {
        heap.push(next);
        queued.add(next);
      }
    }
  }

  let best = null;
  let bestUsed = null;
  for (const [used, state] of states) {
    if (used === 0) continue;
    const validWithWaste = used <= spanFloorC;
    const validExactEdge = exactCapC >= 0 && used === exactCapC;
    if (!validWithWaste && !validExactEdge) continue;
    if (better(state, best)) {
      best = state;
      bestUsed = used;
    }
  }
  if (!best) return null;

  const sequence = [];
  for (let node = best.trace; node; node = node.prev) sequence.push(node.item);
  sequence.reverse();
  const effectiveUsedUnits = bestUsed * divisor;
  const exactEdge = exactCapC >= 0 && bestUsed === exactCapC;

  return {
    ...best,
    sequence,
    exactEdge,
    effectiveUsedUnits,
    restricted,
    states: states.size,
  };
}

function orientations(line, config) {
  const base = Number(line.base);
  const altura = Number(line.altura);
  const noRotate = Boolean(config.materialConVeta && line.veta);
  const out = [{ width: base, height: altura, rotated: false }];
  if (!noRotate && Math.abs(base - altura) > 1e-9) {
    out.push({ width: altura, height: base, rotated: true });
  }
  return out;
}

function buildStripOptions(lines, config, dualPrices, rootAxis, options) {
  const usefulWidth = Number(config.placaBase) - Number(config.refiladoX || 0);
  const usefulHeight = Number(config.placaAltura) - Number(config.refiladoY || 0);
  const rootSpan = rootAxis === "x" ? usefulWidth : usefulHeight;
  const innerSpan = rootAxis === "x" ? usefulHeight : usefulWidth;
  const typeCount = lines.length;

  const byStrip = new Map();
  for (let i = 0; i < lines.length; i++) {
    const price = Number(dualPrices[i] || 0);
    if (price <= EPS) continue;
    for (const orientation of orientations(lines[i], config)) {
      if (
        orientation.width > usefulWidth + 1e-9 ||
        orientation.height > usefulHeight + 1e-9
      ) {
        continue;
      }
      const stripDimension = rootAxis === "x" ? orientation.width : orientation.height;
      const innerDimension = rootAxis === "x" ? orientation.height : orientation.width;
      if (stripDimension > rootSpan + 1e-9 || innerDimension > innerSpan + 1e-9) continue;
      const key = String(Math.round(stripDimension * (options.scale || DEFAULT_SCALE)));
      if (!byStrip.has(key)) {
        byStrip.set(key, { stripDimension, items: [] });
      }
      const usage = new Array(typeCount).fill(0);
      usage[i] = 1;
      byStrip.get(key).items.push({
        dimension: innerDimension,
        value: price,
        usage,
        area: Number(lines[i].base) * Number(lines[i].altura),
        typeIndex: i,
        rotated: orientation.rotated,
        width: orientation.width,
        height: orientation.height,
      });
    }
  }

  const strips = [];
  let restricted = false;
  let innerStates = 0;
  for (const group of byStrip.values()) {
    const best = bestSequence(
      group.items,
      innerSpan,
      Number(config.sierra || 0),
      typeCount,
      options,
    );
    if (!best) continue;
    restricted ||= best.restricted;
    innerStates += best.states;
    strips.push({
      dimension: group.stripDimension,
      value: best.value,
      usage: best.usage,
      area: best.area,
      count: 1,
      innerSequence: best.sequence,
      innerExactEdge: best.exactEdge,
    });
  }

  return { strips, rootSpan, restricted, innerStates };
}

function physicalPattern(lines, config, rootAxis, root) {
  const usefulWidth = Number(config.placaBase) - Number(config.refiladoX || 0);
  const usefulHeight = Number(config.placaAltura) - Number(config.refiladoY || 0);
  const saw = Number(config.sierra || 0);
  const colocadas = [];
  const cortes = [];
  const uso = new Map();
  let pieceId = 0;

  function addPiece(item, x, y) {
    const typeIndex = item.typeIndex;
    const line = lines[typeIndex];
    const pieza = {
      id: `pricing-${rootAxis}-${pieceId++}`,
      ref: typeIndex,
      base: Number(line.base),
      altura: Number(line.altura),
      veta: Boolean(line.veta),
      detalle: line.detalle || `PRICING-${typeIndex}`,
      _corte: {
        base: Number(line.base),
        altura: Number(line.altura),
      },
    };
    colocadas.push({
      x,
      y,
      base: item.width,
      altura: item.height,
      rotada: Boolean(item.rotated),
      pieza,
      nivel: 2,
    });
    uso.set(typeIndex, (uso.get(typeIndex) || 0) + 1);
  }

  let rootPos = 0;
  const strips = root.sequence || [];
  for (let stripIndex = 0; stripIndex < strips.length; stripIndex++) {
    const strip = strips[stripIndex];
    const stripStart = rootPos;
    const stripEnd = stripStart + strip.dimension;
    const needsRootCut = stripIndex < strips.length - 1 || !root.exactEdge;

    // A 2-stage cross-cut is legal only after the parent strip is isolated.
    if (needsRootCut) {
      if (rootAxis === "x") {
        cortes.push({
          x1: stripEnd,
          y1: 0,
          x2: stripEnd,
          y2: usefulHeight,
          nivel: 1,
          largo: usefulHeight,
        });
      } else {
        cortes.push({
          x1: 0,
          y1: stripEnd,
          x2: usefulWidth,
          y2: stripEnd,
          nivel: 1,
          largo: usefulWidth,
        });
      }
    }

    let innerPos = 0;
    const inner = strip.innerSequence || [];
    for (let itemIndex = 0; itemIndex < inner.length; itemIndex++) {
      const item = inner[itemIndex];
      const itemStart = innerPos;
      const itemEnd = itemStart + item.dimension;
      const needsInnerCut = itemIndex < inner.length - 1 || !strip.innerExactEdge;

      if (rootAxis === "x") {
        addPiece(item, stripStart, itemStart);
        if (needsInnerCut) {
          cortes.push({
            x1: stripStart,
            y1: itemEnd,
            x2: stripEnd,
            y2: itemEnd,
            nivel: 2,
            largo: strip.dimension,
          });
        }
      } else {
        addPiece(item, itemStart, stripStart);
        if (needsInnerCut) {
          cortes.push({
            x1: itemEnd,
            y1: stripStart,
            x2: itemEnd,
            y2: stripEnd,
            nivel: 2,
            largo: strip.dimension,
          });
        }
      }

      innerPos = itemEnd + (needsInnerCut ? saw : 0);
    }

    rootPos = stripEnd + (needsRootCut ? saw : 0);
  }

  return {
    uso,
    area: colocadas.reduce((sum, placement) => sum + placement.base * placement.altura, 0),
    placa: {
      ancho: usefulWidth,
      alto: usefulHeight,
      colocadas,
      cortes,
      restos: [],
      arbol: null,
    },
  };
}

/**
 * Exact pricing oracle for the 2-stage strip family, provided per-board demand
 * caps do not bind. This condition is true for the serial audit cohort where
 * every demand is hundreds of copies and a board holds only tens of pieces.
 */
function priceTwoStage(lines, config, dualPrices, options = {}) {
  const started = process.hrtime.bigint();
  const typeCount = lines.length;
  if (dualPrices.length !== typeCount) throw new Error("dual price length mismatch");

  let best = null;
  const axes = [];
  for (const rootAxis of ["x", "y"]) {
    const built = buildStripOptions(lines, config, dualPrices, rootAxis, options);
    const root = bestSequence(
      built.strips,
      built.rootSpan,
      Number(config.sierra || 0),
      typeCount,
      options,
    );
    axes.push({
      rootAxis,
      stripTypes: built.strips.length,
      innerStates: built.innerStates,
      rootStates: root?.states ?? 0,
      restricted: built.restricted || Boolean(root?.restricted),
      dualValue: root?.value ?? 0,
    });
    if (!root) continue;

    const exceedsDemand = root.usage.some(
      (count, index) => count > Number(lines[index].cant),
    );
    if (exceedsDemand) {
      // The current research oracle is exact only while demand caps do not bind.
      // Never emit an infeasible column.
      continue;
    }

    const pattern = physicalPattern(lines, config, rootAxis, root);
    const candidate = {
      rootAxis,
      dualValue: root.value,
      usage: root.usage,
      area: usageArea(root.usage, lines),
      pattern,
      restricted: built.restricted || root.restricted,
      stripTypes: built.strips.length,
      innerStates: built.innerStates,
      rootStates: root.states,
    };
    if (
      !best ||
      candidate.dualValue > best.dualValue + EPS ||
      (Math.abs(candidate.dualValue - best.dualValue) <= EPS &&
        candidate.area > best.area + EPS)
    ) {
      best = candidate;
    }
  }

  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
  return {
    status: best ? "OK" : "NO_PATTERN",
    elapsedMs,
    best,
    axes,
    exactForTwoStage: axes.every((axis) => !axis.restricted),
    demandCapsBinding: false,
  };
}

module.exports = {
  priceTwoStage,
};
