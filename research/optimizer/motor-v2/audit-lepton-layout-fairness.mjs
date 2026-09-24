#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../..");
const DEFAULT_SOURCE = path.resolve(
  ROOT,
  "validation-full/serial-production-audit/_extracted",
);
const DEFAULT_IDS = [5445701, 5445716, 5447573];
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
    const lower = name.toLowerCase();
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

function walkXml(root) {
  const out = [];
  if (!fs.existsSync(root)) return out;
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    const stat = fs.statSync(current);
    if (stat.isFile()) {
      if (path.extname(current).toLowerCase() === ".xml") out.push(current);
      continue;
    }
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === ".extracted-ok") continue;
      stack.push(path.join(current, entry.name));
    }
  }
  return out;
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
  return Math.abs(a - b) <= EPS;
}

function sameFrame(a, b) {
  return same(a.width, b.width) && same(a.height, b.height);
}

function sortedRect(width, height) {
  return [Number(width), Number(height)].sort((a, b) => a - b);
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

function parseTargetIds() {
  if (!process.env.SERIAL_IDS) return DEFAULT_IDS;
  return process.env.SERIAL_IDS.split(",")
    .map((value) => Number(value.trim()))
    .filter(Number.isSafeInteger);
}

function panelShape(panel, index) {
  const nodes = (panel.children || []).filter((child) => /^no\.\d+$/i.test(child.name));
  const byId = nodeMap(nodes);
  const root = byId.get("0");
  if (!root) throw new Error(`panel ${index + 1} has no root node`);

  return {
    index,
    panel,
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
      const x = n(attr(child, "x", "X"), 0);
      const y = n(attr(child, "y", "Y"), 0);
      const code = String(attr(part, "code", "Code") ?? childId);
      const partNum = Math.max(1, integer(attr(part, "num", "Num"), 1));
      const multiplicity = partNum * shape.quantity;
      const long = Math.max(d.width, d.height);
      const short = Math.min(d.width, d.height);
      const orientation =
        same(long, short) ? "square" : d.width >= d.height ? "landscape" : "portrait";

      out.push({
        code,
        x,
        y,
        width: d.width,
        height: d.height,
        long,
        short,
        orientation,
        partNum,
        multiplicity,
      });
    }
  }
  return out;
}

function auditCase(id, xmlPath) {
  const xml = fs.readFileSync(xmlPath, "utf8");
  const root = parseXml(xml);
  if (root.name.toLowerCase() !== "project") {
    throw new Error(`${id}: fairness auditor currently expects <project> XML`);
  }

  const panels = (root.children || []).filter((child) => /^panel\d+$/i.test(child.name));
  if (!panels.length) throw new Error(`${id}: no panel nodes`);

  const shapes = panels.map(panelShape);
  resolveDirections(shapes);

  let physicalBoards = 0;
  let physicalPieces = 0;
  let rotatedPhysical = 0;
  let landscapePhysical = 0;
  let squarePhysical = 0;
  let rootFrameMismatchBoards = 0;
  let minLeft = Infinity;
  let minTop = Infinity;
  let minRight = Infinity;
  let minBottom = Infinity;
  let minFrameDeltaShort = Infinity;
  let minFrameDeltaLong = Infinity;
  let maxFrameDeltaShort = -Infinity;
  let maxFrameDeltaLong = -Infinity;
  const codes = new Map();
  const kerfValues = new Set();
  const rootTrimValues = new Set();
  const trimByAxis = { x: new Set(), y: new Set() };
  const panelReports = [];

  for (const shape of shapes) {
    physicalBoards += shape.quantity;
    if (Number.isFinite(shape.declared.kerf)) kerfValues.add(shape.declared.kerf);

    const frame = globalDims(shape.root, shape.rootDirection);
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

    const [panelShort, panelLong] = sortedRect(shape.declared.l, shape.declared.w);
    const [rootShort, rootLong] = sortedRect(frame.width, frame.height);
    const deltaShort = panelShort - rootShort;
    const deltaLong = panelLong - rootLong;
    minFrameDeltaShort = Math.min(minFrameDeltaShort, deltaShort);
    minFrameDeltaLong = Math.min(minFrameDeltaLong, deltaLong);
    maxFrameDeltaShort = Math.max(maxFrameDeltaShort, deltaShort);
    maxFrameDeltaLong = Math.max(maxFrameDeltaLong, deltaLong);
    if (!same(deltaShort, 0) || !same(deltaLong, 0)) {
      rootFrameMismatchBoards += shape.quantity;
    }

    const placements = terminalPlacements(shape);
    let pMinX = Infinity;
    let pMinY = Infinity;
    let pMaxX = -Infinity;
    let pMaxY = -Infinity;

    for (const placement of placements) {
      physicalPieces += placement.multiplicity;
      pMinX = Math.min(pMinX, placement.x);
      pMinY = Math.min(pMinY, placement.y);
      pMaxX = Math.max(pMaxX, placement.x + placement.width);
      pMaxY = Math.max(pMaxY, placement.y + placement.height);

      if (placement.orientation === "portrait") rotatedPhysical += placement.multiplicity;
      else if (placement.orientation === "landscape") landscapePhysical += placement.multiplicity;
      else squarePhysical += placement.multiplicity;

      const key = `${placement.code}|${placement.long}x${placement.short}`;
      let stat = codes.get(key);
      if (!stat) {
        stat = {
          code: placement.code,
          width: placement.long,
          height: placement.short,
          landscape: 0,
          portrait: 0,
          square: 0,
        };
        codes.set(key, stat);
      }
      stat[placement.orientation] += placement.multiplicity;
    }

    if (placements.length) {
      const margins = {
        left: pMinX,
        top: pMinY,
        right: frame.width - pMaxX,
        bottom: frame.height - pMaxY,
      };
      minLeft = Math.min(minLeft, margins.left);
      minTop = Math.min(minTop, margins.top);
      minRight = Math.min(minRight, margins.right);
      minBottom = Math.min(minBottom, margins.bottom);
      panelReports.push({
        panel: shape.index + 1,
        physicalMultiplicity: shape.quantity,
        rootDirection: shape.rootDirection,
        declared: shape.declared,
        rootFrame: frame,
        frameDeltaSorted: { short: deltaShort, long: deltaLong },
        rootTrim: Number.isFinite(rootTrim) ? rootTrim : null,
        placements: placements.length,
        margins,
      });
    }
  }

  const orientationByCode = [...codes.values()].sort((a, b) =>
    String(a.code).localeCompare(String(b.code), undefined, { numeric: true }),
  );
  const codesBothOrientations = orientationByCode.filter(
    (entry) => entry.landscape > 0 && entry.portrait > 0,
  );

  const finiteMargin = (value) => (Number.isFinite(value) ? value : null);
  const samePhysicalFrame = rootFrameMismatchBoards === 0;
  const touches = {
    left: Number.isFinite(minLeft) && Math.abs(minLeft) <= EPS,
    top: Number.isFinite(minTop) && Math.abs(minTop) <= EPS,
    right: Number.isFinite(minRight) && Math.abs(minRight) <= EPS,
    bottom: Number.isFinite(minBottom) && Math.abs(minBottom) <= EPS,
  };

  return {
    caseId: id,
    xmlPath,
    xmlSha256: crypto.createHash("sha256").update(xml).digest("hex"),
    panelTags: panels.length,
    physicalBoards,
    physicalPieces,
    kerfValues: [...kerfValues].sort((a, b) => a - b),
    rootTrimValues: [...rootTrimValues].sort((a, b) => a - b),
    trimByAxis: {
      x: [...trimByAxis.x].sort((a, b) => a - b),
      y: [...trimByAxis.y].sort((a, b) => a - b),
    },
    inferredRefilado: {
      x:
        trimByAxis.x.size === 1
          ? [...trimByAxis.x][0]
          : null,
      y:
        trimByAxis.y.size === 1
          ? [...trimByAxis.y][0]
          : null,
      unambiguous: trimByAxis.x.size === 1 && trimByAxis.y.size === 1,
    },
    samePhysicalFrame,
    rootFrameMismatchBoards,
    frameDeltaSorted: {
      minShort: Number.isFinite(minFrameDeltaShort) ? minFrameDeltaShort : null,
      maxShort: Number.isFinite(maxFrameDeltaShort) ? maxFrameDeltaShort : null,
      minLong: Number.isFinite(minFrameDeltaLong) ? minFrameDeltaLong : null,
      maxLong: Number.isFinite(maxFrameDeltaLong) ? maxFrameDeltaLong : null,
    },
    minObservedPieceMargins: {
      left: finiteMargin(minLeft),
      top: finiteMargin(minTop),
      right: finiteMargin(minRight),
      bottom: finiteMargin(minBottom),
    },
    touchesPhysicalRootEdge: touches,
    rotation: {
      landscapePhysical,
      portraitPhysical: rotatedPhysical,
      squarePhysical,
      portraitRate:
        physicalPieces > squarePhysical
          ? rotatedPhysical / (physicalPieces - squarePhysical)
          : 0,
      codesBothOrientations: codesBothOrientations.length,
      bothOrientationCodes: codesBothOrientations,
      orientationByCode,
    },
    fairnessEvidence: {
      noRootFrameShrink: samePhysicalFrame,
      noPositiveRootTrimAttribute:
        rootTrimValues.size === 0 || [...rootTrimValues].every((value) => Math.abs(value) <= EPS),
      pieceTouchesOriginEdges: touches.left && touches.top,
      pieceTouchesFarEdges: touches.right && touches.bottom,
      leptonRotationObserved: rotatedPhysical > 0,
      sameCodeBothOrientationsObserved: codesBothOrientations.length > 0,
    },
    caveat:
      "This audit can rule out geometric trim represented by a smaller root frame, positive root trim attribute, or mandatory piece inset. It cannot rule out an external machine-level trim that Lepton may apply outside the exported XML coordinate system.",
    panelReports,
  };
}

const targetIds = parseTargetIds();
const sourceArg = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_SOURCE;
const xmlFiles = walkXml(sourceArg);
const reports = [];

for (const id of targetIds) {
  const matches = xmlFiles.filter((file) => path.basename(file).includes(String(id)));
  if (!matches.length) {
    reports.push({ caseId: id, error: "XML not found", source: sourceArg });
    continue;
  }
  try {
    reports.push(auditCase(id, matches[0]));
  } catch (error) {
    reports.push({ caseId: id, xmlPath: matches[0], error: String(error?.stack || error) });
  }
}

const valid = reports.filter((report) => !report.error);
const summary = {
  schema: "lepton-layout-fairness-audit-v1",
  generatedAt: new Date().toISOString(),
  source: sourceArg,
  requestedCases: targetIds.length,
  validCases: valid.length,
  invalidCases: reports.length - valid.length,
  allSamePhysicalFrame: valid.length > 0 && valid.every((r) => r.samePhysicalFrame),
  allNoPositiveRootTrim:
    valid.length > 0 &&
    valid.every((r) => r.fairnessEvidence.noPositiveRootTrimAttribute),
  allTrimAxesUnambiguous:
    valid.length > 0 && valid.every((r) => r.inferredRefilado.unambiguous),
  allRotationObserved:
    valid.length > 0 && valid.every((r) => r.fairnessEvidence.leptonRotationObserved),
  allSameCodeBothOrientations:
    valid.length > 0 &&
    valid.every((r) => r.fairnessEvidence.sameCodeBothOrientationsObserved),
  reports,
};

const output = path.resolve(
  process.env.LEPTON_FAIRNESS_OUTPUT ||
    path.join(HERE, "LEPTON_LAYOUT_FAIRNESS.json"),
);
fs.writeFileSync(output, JSON.stringify(summary, null, 2) + "\n");

for (const report of reports) {
  if (report.error) {
    console.log("LEPTON_FAIRNESS " + JSON.stringify({
      id: report.caseId,
      error: report.error,
    }));
    continue;
  }
  console.log("LEPTON_FAIRNESS " + JSON.stringify({
    id: report.caseId,
    physicalBoards: report.physicalBoards,
    physicalPieces: report.physicalPieces,
    kerf: report.kerfValues,
    samePhysicalFrame: report.samePhysicalFrame,
    frameDelta: report.frameDeltaSorted,
    rootTrim: report.rootTrimValues,
    trimByAxis: report.trimByAxis,
    inferredRefilado: report.inferredRefilado,
    margins: report.minObservedPieceMargins,
    touches: report.touchesPhysicalRootEdge,
    portraitRate: report.rotation.portraitRate,
    codesBothOrientations: report.rotation.codesBothOrientations,
    rotationObserved: report.fairnessEvidence.leptonRotationObserved,
  }));
}
console.log("LEPTON_FAIRNESS_SUMMARY " + JSON.stringify({
  validCases: summary.validCases,
  invalidCases: summary.invalidCases,
  allSamePhysicalFrame: summary.allSamePhysicalFrame,
  allNoPositiveRootTrim: summary.allNoPositiveRootTrim,
  allTrimAxesUnambiguous: summary.allTrimAxesUnambiguous,
  allRotationObserved: summary.allRotationObserved,
  allSameCodeBothOrientations: summary.allSameCodeBothOrientations,
  output,
}));

if (summary.invalidCases) process.exitCode = 1;
