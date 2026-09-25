#!/usr/bin/env node

import crypto from "node:crypto";

const EPS = 0.6;

function n(value, fallback = NaN) {
  const out = Number(value);
  return Number.isFinite(out) ? out : fallback;
}

function integer(value, fallback = 0) {
  const out = Number(value);
  return Number.isInteger(out) ? out : fallback;
}

function attr(node, ...names) {
  for (const name of names) {
    const direct = node?.attributes?.[name];
    if (direct != null) return direct;
    const lower = String(name).toLowerCase();
    for (const [key, value] of Object.entries(node?.attributes || {})) {
      if (key.toLowerCase() === lower) return value;
    }
  }
  return null;
}

function attrsFromStartTag(body) {
  const out = {};
  const nameMatch = /^([^\s/>]+)/.exec(body);
  if (!nameMatch) return { name: "", attributes: out };
  const name = nameMatch[1];
  const rest = body.slice(name.length);
  for (const match of rest.matchAll(/([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    out[match[1]] = match[2] ?? match[3] ?? "";
  }
  return { name, attributes: out };
}

function parseXml(xml) {
  const tokenPattern =
    /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<![^>]*>|<\/[^>]+>|<[^>]+>|[^<]+/g;
  const stack = [];
  let root = null;
  let token;

  while ((token = tokenPattern.exec(xml)) != null) {
    const raw = token[0];
    if (!raw.startsWith("<")) continue;
    if (raw.startsWith("<?") || raw.startsWith("<!--") || raw.startsWith("<!")) continue;

    if (raw.startsWith("</")) {
      stack.pop();
      continue;
    }

    const selfClosing = raw.endsWith("/>");
    const body = raw.slice(1, selfClosing ? -2 : -1).trim();
    const parsed = attrsFromStartTag(body);
    const node = { name: parsed.name, attributes: parsed.attributes, children: [] };
    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(node);
    else root = node;
    if (!selfClosing) stack.push(node);
  }

  if (!root) throw new Error("XML without root");
  return root;
}

function flip(dir) {
  return dir === "x" ? "y" : "x";
}

function nodeDirection(rootDirection, layer) {
  return layer % 2 === 1 ? rootDirection : flip(rootDirection);
}

function globalDims(node, rootDirection) {
  const l = n(attr(node, "l", "L"));
  const w = n(attr(node, "w", "W"));
  const layer = integer(attr(node, "layer", "Layer"), 1);
  const dir = nodeDirection(rootDirection, layer);
  return dir === "x" ? { width: l, height: w } : { width: w, height: l };
}

function same(a, b) {
  return Math.abs(Number(a) - Number(b)) <= EPS;
}

function sameFrame(a, b) {
  return same(a.width, b.width) && same(a.height, b.height);
}

function nodeMap(nodes) {
  const out = new Map();
  for (const node of nodes) {
    const id = attr(node, "id", "ID");
    if (id != null) out.set(String(id), node);
  }
  return out;
}

function inferDirectRootDirection(nodes, byId) {
  let inferred = null;
  for (const node of nodes) {
    const layer = integer(attr(node, "layer", "Layer"), 1);
    const children = (node.children || [])
      .filter((child) => child.name.toLowerCase() === "part")
      .map((part) => byId.get(String(attr(part, "id", "ID") ?? "")))
      .filter(Boolean);
    if (children.length < 2) continue;

    const xs = new Set(children.map((child) => n(attr(child, "x", "X"), 0)));
    const ys = new Set(children.map((child) => n(attr(child, "y", "Y"), 0)));
    const observed =
      xs.size > 1 && ys.size === 1
        ? "x"
        : ys.size > 1 && xs.size === 1
          ? "y"
          : null;
    if (!observed) continue;

    const candidate = layer % 2 === 1 ? observed : flip(observed);
    if (inferred && inferred !== candidate) return inferred;
    inferred = inferred ?? candidate;
  }
  return inferred;
}

function directionFits(nodes, rootDirection) {
  const root = nodes.find((node) => String(attr(node, "id", "ID")) === "0");
  if (!root) return false;
  const frame = globalDims(root, rootDirection);
  return nodes.every((node) => {
    const d = globalDims(node, rootDirection);
    const x = n(attr(node, "x", "X"), 0);
    const y = n(attr(node, "y", "Y"), 0);
    return (
      x >= -EPS &&
      y >= -EPS &&
      x + d.width <= frame.width + EPS &&
      y + d.height <= frame.height + EPS
    );
  });
}

function panelShape(panel, index) {
  const nodes = (panel.children || []).filter((child) => /^no\.\d+$/i.test(child.name));
  const byId = nodeMap(nodes);
  const root = byId.get("0");
  if (!root) throw new Error(`panel ${index + 1} has no root node`);

  return {
    index,
    nodes,
    byId,
    root,
    directDirection: inferDirectRootDirection(nodes, byId),
    quantity: Math.max(1, integer(attr(panel, "num", "Num"), 1)),
    declared: {
      l: n(attr(panel, "l", "L")),
      w: n(attr(panel, "w", "W")),
      kerf: n(attr(panel, "saw", "Saw", "kerf", "Kerf")),
      material: attr(panel, "material", "Material"),
      thickness: n(attr(panel, "thickness", "Thickness")),
    },
  };
}

function resolveDirections(shapes) {
  const reference = shapes.find((shape) => shape.directDirection);
  const referenceFrame = reference
    ? globalDims(reference.root, reference.directDirection)
    : null;

  for (const shape of shapes) {
    if (shape.directDirection) {
      shape.rootDirection = shape.directDirection;
      continue;
    }

    if (referenceFrame) {
      const fx = globalDims(shape.root, "x");
      const fy = globalDims(shape.root, "y");
      const xMatch = sameFrame(fx, referenceFrame);
      const yMatch = sameFrame(fy, referenceFrame);
      if (xMatch !== yMatch) {
        shape.rootDirection = xMatch ? "x" : "y";
        continue;
      }
    }

    const xFits = directionFits(shape.nodes, "x");
    const yFits = directionFits(shape.nodes, "y");
    shape.rootDirection = xFits && !yFits ? "x" : yFits && !xFits ? "y" : "x";
  }
}

function terminalPlacements(shape) {
  const out = [];
  const rootDirection = shape.rootDirection;

  for (const parent of shape.nodes) {
    for (const part of (parent.children || []).filter(
      (child) => child.name.toLowerCase() === "part",
    )) {
      if (integer(attr(part, "type", "Type"), 0) !== 1) continue;
      const childId = String(attr(part, "id", "ID") ?? "");
      const child = shape.byId.get(childId);
      if (!child) continue;

      const d = globalDims(child, rootDirection);
      const code = String(attr(part, "code", "Code") ?? childId);
      const partNum = Math.max(1, integer(attr(part, "num", "Num"), 1));
      const multiplicity = partNum * shape.quantity;
      const long = Math.max(d.width, d.height);
      const short = Math.min(d.width, d.height);
      const orientation =
        same(long, short) ? "square" : d.width >= d.height ? "landscape" : "portrait";

      out.push({
        code,
        long,
        short,
        orientation,
        multiplicity,
        x: n(attr(child, "x", "X")) || 0,
        y: n(attr(child, "y", "Y")) || 0,
        width: d.width,
        height: d.height,
      });
    }
  }

  return out;
}

function uniqueSingle(set) {
  return set.size === 1 ? [...set][0] : null;
}

export function auditLeptonProjectXml(xml, options = {}) {
  const root = parseXml(xml);
  const format = root.name.toLowerCase();

  if (format !== "project") {
    return {
      schema: "lepton-project-semantics-v1",
      caseId: options.caseId ?? null,
      fileName: options.fileName ?? null,
      format,
      project: false,
      xmlSha256: crypto.createHash("sha256").update(xml).digest("hex"),
    };
  }

  const panels = (root.children || []).filter((child) => /^panel\d+$/i.test(child.name));
  if (!panels.length) throw new Error("project XML has no panel nodes");

  const shapes = panels.map(panelShape);
  resolveDirections(shapes);

  let physicalBoards = 0;
  let physicalPieces = 0;
  let landscapePhysical = 0;
  let portraitPhysical = 0;
  let squarePhysical = 0;
  let minLeft = Infinity;
  let minTop = Infinity;
  let minRight = Infinity;
  let minBottom = Infinity;
  let boardsTouchingRight = 0;
  let boardsTouchingBottom = 0;
  let boardsTouchingFarEdge = 0;
  const kerfValues = new Set();
  const materials = new Set();
  const trimByAxis = { x: new Set(), y: new Set() };
  const rootTrimValues = new Set();
  const codes = new Map();

  for (const shape of shapes) {
    physicalBoards += shape.quantity;
    if (Number.isFinite(shape.declared.kerf)) kerfValues.add(shape.declared.kerf);
    if (shape.declared.material) materials.add(shape.declared.material);

    const rootTrim = n(attr(shape.root, "trim", "Trim"));
    if (Number.isFinite(rootTrim)) rootTrimValues.add(rootTrim);

    for (const node of shape.nodes) {
      const layer = integer(attr(node, "layer", "Layer"), 1);
      if (layer > 2) continue;
      const trim = n(attr(node, "trim", "Trim"));
      if (!Number.isFinite(trim)) continue;
      const dir = nodeDirection(shape.rootDirection, layer);
      trimByAxis[dir].add(trim);
    }

    const frame = globalDims(shape.root, shape.rootDirection);
    const placements = terminalPlacements(shape);
    let touchesRight = false;
    let touchesBottom = false;

    for (const placement of placements) {
      physicalPieces += placement.multiplicity;
      if (placement.orientation === "portrait") portraitPhysical += placement.multiplicity;
      else if (placement.orientation === "landscape") landscapePhysical += placement.multiplicity;
      else squarePhysical += placement.multiplicity;

      const rightMargin = frame.width - (placement.x + placement.width);
      const bottomMargin = frame.height - (placement.y + placement.height);
      minLeft = Math.min(minLeft, placement.x);
      minTop = Math.min(minTop, placement.y);
      minRight = Math.min(minRight, rightMargin);
      minBottom = Math.min(minBottom, bottomMargin);
      if (Math.abs(rightMargin) <= EPS) touchesRight = true;
      if (Math.abs(bottomMargin) <= EPS) touchesBottom = true;

      const key = `${placement.code}|${placement.long}x${placement.short}`;
      let stat = codes.get(key);
      if (!stat) {
        stat = { code: placement.code, long: placement.long, short: placement.short, landscape: 0, portrait: 0, square: 0 };
        codes.set(key, stat);
      }
      stat[placement.orientation] += placement.multiplicity;
    }

    if (touchesRight) boardsTouchingRight += shape.quantity;
    if (touchesBottom) boardsTouchingBottom += shape.quantity;
    if (touchesRight || touchesBottom) boardsTouchingFarEdge += shape.quantity;
  }

  const orientationByCode = [...codes.values()];
  const both = orientationByCode.filter((entry) => entry.landscape > 0 && entry.portrait > 0);
  const trimX = uniqueSingle(trimByAxis.x);
  const trimY = uniqueSingle(trimByAxis.y);

  return {
    schema: "lepton-project-semantics-v1",
    caseId: options.caseId ?? null,
    fileName: options.fileName ?? null,
    format,
    project: true,
    xmlSha256: crypto.createHash("sha256").update(xml).digest("hex"),
    panelTags: panels.length,
    physicalBoards,
    physicalPieces,
    kerfValues: [...kerfValues].sort((a, b) => a - b),
    materials: [...materials].sort((a, b) => String(a).localeCompare(String(b))),
    rootTrimValues: [...rootTrimValues].sort((a, b) => a - b),
    trimByAxis: {
      x: [...trimByAxis.x].sort((a, b) => a - b),
      y: [...trimByAxis.y].sort((a, b) => a - b),
    },
    inferredRefilado: {
      x: trimX,
      y: trimY,
      unambiguous: trimX != null && trimY != null,
      nonZero: (trimX ?? 0) > EPS || (trimY ?? 0) > EPS,
    },
    minObservedPieceMargins: {
      left: Number.isFinite(minLeft) ? minLeft : null,
      top: Number.isFinite(minTop) ? minTop : null,
      right: Number.isFinite(minRight) ? minRight : null,
      bottom: Number.isFinite(minBottom) ? minBottom : null,
    },
    touchesPhysicalRootEdge: {
      left: Number.isFinite(minLeft) && Math.abs(minLeft) <= EPS,
      top: Number.isFinite(minTop) && Math.abs(minTop) <= EPS,
      right: Number.isFinite(minRight) && Math.abs(minRight) <= EPS,
      bottom: Number.isFinite(minBottom) && Math.abs(minBottom) <= EPS,
    },
    physicalBoardsTouchingFarEdge: {
      right: boardsTouchingRight,
      bottom: boardsTouchingBottom,
      either: boardsTouchingFarEdge,
    },
    rotation: {
      landscapePhysical,
      portraitPhysical,
      squarePhysical,
      portraitRate:
        physicalPieces > squarePhysical
          ? portraitPhysical / (physicalPieces - squarePhysical)
          : 0,
      rotationObserved: portraitPhysical > 0,
      sameCodeBothOrientationsObserved: both.length > 0,
      codesBothOrientations: both.length,
    },
  };
}
