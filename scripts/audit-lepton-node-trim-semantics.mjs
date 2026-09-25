#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const args = parseArgs(process.argv.slice(2));
if (args.help || !args.inputs.length) {
  printHelp();
  process.exit(args.help ? 0 : 2);
}

fs.mkdirSync(args.output, { recursive: true });

const summaryPath = path.join(args.output, "NODE_TRIM_SEMANTICS_SUMMARY.json");
const violationsPath = path.join(args.output, "NODE_TRIM_SEMANTICS_VIOLATIONS.jsonl");
const negativesPath = path.join(args.output, "NODE_TRIM_SEMANTICS_NEGATIVE.jsonl");
const rootPropagationPath = path.join(
  args.output,
  "NODE_TRIM_ROOT_PROPAGATION_COUNTEREXAMPLES.jsonl",
);
const violationIdsPath = path.join(args.output, "IDS_NODE_TRIM_VIOLATIONS.txt");
const negativeIdsPath = path.join(args.output, "IDS_NODE_TRIM_NEGATIVE.txt");

const files = collectXml(args.inputs);
const counts = new Map();
const byTrim = new Map();
const byLayer = new Map();
const byTrimClass = new Map();
const byLayerClass = new Map();
const minPositiveByTrim = new Map();
const violations = [];
const negatives = [];
const rootPropagationCounterexamples = [];
const parseErrors = [];
const noPartsPreview = [];
let processed = 0;

for (const file of files) {
  const xml = fs.readFileSync(file, "utf8");
  const caseId = idFromFileName(path.basename(file));
  try {
    auditXml(xml, { file, caseId });
  } catch (error) {
    inc(counts, "parse_errors");
    if (parseErrors.length < 50) {
      parseErrors.push({
        caseId,
        file: path.basename(file),
        error: String(error?.stack || error),
      });
    }
  }

  processed++;
  if (processed % args.progressEvery === 0 || processed === files.length) {
    console.log(`NODE_TRIM_AUDIT ${processed}/${files.length}`);
  }
}

writeJsonl(violationsPath, violations);
writeJsonl(negativesPath, negatives);
writeJsonl(rootPropagationPath, rootPropagationCounterexamples);
writeIds(violationIdsPath, violations);
writeIds(negativeIdsPath, negatives);

const summary = {
  schema: "lepton-node-trim-semantics-audit-v1",
  generatedAt: new Date().toISOString(),
  inputs: args.inputs,
  epsilon: args.epsilon,
  xmlFiles: files.length,
  casesParsed: get(counts, "cases"),
  parseErrors: get(counts, "parse_errors"),
  nodesWithTrimAttr: get(counts, "nodes_with_trim_attr"),
  populatedNodes: get(counts, "populated_nodes"),
  nodesWithoutParts: get(counts, "nodes_no_parts"),
  badNodeAttrs: get(counts, "bad_node_attrs"),
  badParts: get(counts, "bad_parts"),
  rule: {
    description:
      "For each populated node, leftover = l - (sum(part.cut * part.num) + saw * (units - 1)); valid iff leftover ~= 0 OR node.trim ~= 0 OR leftover >= node.trim.",
    zeroRemainder: get(counts, "zero"),
    allowedPositiveRemainder: get(counts, "reserve"),
    forbiddenPositiveBelowTrim: violations.length,
    negativeRemainder: negatives.length,
    pass:
      violations.length === 0 &&
      negatives.length === 0 &&
      get(counts, "parse_errors") === 0,
  },
  byTrim: sortedObject(byTrim, numericKey),
  byLayer: sortedObject(byLayer, numericKey),
  byTrimClass: sortedObject(byTrimClass),
  byLayerClass: sortedObject(byLayerClass),
  minPositiveRemainderByTrim: Object.fromEntries(
    [...minPositiveByTrim.entries()]
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([key, value]) => [key, value]),
  ),
  rootTrimPropagationDiagnostic: {
    description:
      "Diagnostic only: node.trim == 0, panel root trim > 0, and 0 < leftover < root trim. These are valid under node-local trim and show why root trim must not be propagated blindly to every node.",
    counterexamples: rootPropagationCounterexamples.length,
    caseIds: [...new Set(rootPropagationCounterexamples.map((x) => x.caseId))]
      .filter(Number.isSafeInteger)
      .sort((a, b) => a - b),
  },
  violationsPreview: violations.slice(0, 50),
  negativesPreview: negatives.slice(0, 50),
  rootPropagationPreview: rootPropagationCounterexamples.slice(0, 50),
  noPartsPreview,
  parseErrorsPreview: parseErrors,
  outputs: {
    summary: summaryPath,
    violations: violationsPath,
    negatives: negativesPath,
    rootPropagationCounterexamples: rootPropagationPath,
    violationIds: violationIdsPath,
    negativeIds: negativeIdsPath,
  },
};

fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + "\n");

console.log(
  "SUMMARY " +
    JSON.stringify({
      xmlFiles: summary.xmlFiles,
      casesParsed: summary.casesParsed,
      parseErrors: summary.parseErrors,
      populatedNodes: summary.populatedNodes,
      nodesWithoutParts: summary.nodesWithoutParts,
      forbiddenPositiveBelowTrim: summary.rule.forbiddenPositiveBelowTrim,
      negativeRemainder: summary.rule.negativeRemainder,
      pass: summary.rule.pass,
      minPositiveRemainderByTrim: summary.minPositiveRemainderByTrim,
      rootTrimPropagationCounterexamples:
        summary.rootTrimPropagationDiagnostic.counterexamples,
      rootTrimPropagationCases:
        summary.rootTrimPropagationDiagnostic.caseIds.length,
      output: summaryPath,
    }),
);

if (!summary.rule.pass) process.exitCode = 1;

function auditXml(xml, context) {
  const root = parseXml(xml);
  if (root.name.toLowerCase() !== "project") return;
  inc(counts, "cases");

  const panels = (root.children || []).filter((child) =>
    /^panel\d+$/i.test(child.name),
  );

  for (const panel of panels) {
    const saw = finite(attr(panel, "saw", "Saw", "kerf", "Kerf"), 0);
    const nodes = (panel.children || []).filter(
      (node) => attr(node, "trim", "Trim") != null,
    );
    const rootNode =
      nodes.find((node) => String(attr(node, "id", "ID") ?? "") === "0") ??
      null;
    const rootTrim = finite(attr(rootNode, "trim", "Trim"), NaN);

    for (const node of nodes) {
      inc(counts, "nodes_with_trim_attr");

      const trim = finite(attr(node, "trim", "Trim"), NaN);
      const length = finite(attr(node, "l", "L"), NaN);
      const layer = integer(attr(node, "layer", "Layer"), null);
      const nodeId = String(attr(node, "id", "ID") ?? node.name);

      if (!Number.isFinite(trim) || !Number.isFinite(length)) {
        inc(counts, "bad_node_attrs");
        continue;
      }

      const parts = (node.children || []).filter(
        (child) => child.name.toLowerCase() === "part",
      );

      if (!parts.length) {
        inc(counts, "nodes_no_parts");
        if (noPartsPreview.length < 20) {
          noPartsPreview.push({
            caseId: context.caseId,
            panel: panel.name,
            nodeId,
            layer,
            trim,
          });
        }
        continue;
      }

      inc(counts, "populated_nodes");
      inc(byTrim, formatNumber(trim));
      inc(byLayer, String(layer ?? "?"));

      let units = 0;
      let sumCuts = 0;
      let badPart = false;

      for (const part of parts) {
        const cut = finite(attr(part, "cut", "Cut"), NaN);
        const num = integer(attr(part, "num", "Num"), 1);
        if (!Number.isFinite(cut) || !Number.isSafeInteger(num) || num <= 0) {
          badPart = true;
          break;
        }
        units += num;
        sumCuts += cut * num;
      }

      if (badPart || units <= 0) {
        inc(counts, "bad_parts");
        continue;
      }

      const used = sumCuts + saw * Math.max(0, units - 1);
      const leftover = length - used;
      const base = {
        caseId: context.caseId,
        fileName: path.basename(context.file),
        panel: panel.name,
        nodeId,
        layer,
        trim,
        rootTrim: Number.isFinite(rootTrim) ? rootTrim : null,
        l: length,
        saw,
        parts: parts.length,
        units,
        sumCuts,
        used,
        leftover,
      };

      let cls;
      if (leftover < -args.epsilon) {
        cls = "negative";
        negatives.push(base);
      } else if (Math.abs(leftover) <= args.epsilon) {
        cls = "zero";
        inc(counts, "zero");
      } else if (trim <= args.epsilon || leftover + args.epsilon >= trim) {
        cls = "reserve";
        inc(counts, "reserve");
        const key = formatNumber(trim);
        const current = minPositiveByTrim.get(key);
        if (current == null || leftover < current) {
          minPositiveByTrim.set(key, leftover);
        }
      } else {
        cls = "forbidden";
        violations.push(base);
        inc(counts, "forbidden");
      }

      inc(byTrimClass, `${formatNumber(trim)}|${cls}`);
      inc(byLayerClass, `${layer ?? "?"}|${cls}`);

      if (
        trim <= args.epsilon &&
        Number.isFinite(rootTrim) &&
        rootTrim > args.epsilon &&
        leftover > args.epsilon &&
        leftover + args.epsilon < rootTrim
      ) {
        rootPropagationCounterexamples.push(base);
      }
    }
  }
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
    if (
      raw.startsWith("<?") ||
      raw.startsWith("<!--") ||
      raw.startsWith("<!")
    ) {
      continue;
    }

    if (raw.startsWith("</")) {
      stack.pop();
      continue;
    }

    const selfClosing = raw.endsWith("/>");
    const body = raw.slice(1, selfClosing ? -2 : -1).trim();
    const parsed = attrsFromStartTag(body);
    const node = {
      name: parsed.name,
      attributes: parsed.attributes,
      children: [],
    };
    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(node);
    else root = node;
    if (!selfClosing) stack.push(node);
  }

  if (!root) throw new Error("XML without root");
  return root;
}

function attrsFromStartTag(body) {
  const out = {};
  const nameMatch = /^([^\s/>]+)/.exec(body);
  if (!nameMatch) return { name: "", attributes: out };
  const name = nameMatch[1];
  const rest = body.slice(name.length);

  for (const match of rest.matchAll(
    /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g,
  )) {
    out[match[1]] = match[2] ?? match[3] ?? "";
  }

  return { name, attributes: out };
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

function finite(value, fallback = NaN) {
  const out = Number(value);
  return Number.isFinite(out) ? out : fallback;
}

function integer(value, fallback = 0) {
  const out = Number(value);
  return Number.isInteger(out) ? out : fallback;
}

function idFromFileName(name) {
  const match = /(^|\D)(\d{5,})(?=\D|$)/.exec(name);
  return match ? Number(match[2]) : null;
}

function collectXml(inputs) {
  const out = [];
  for (const input of inputs) walk(path.resolve(input), out);
  return [...new Set(out)].sort((a, b) => a.localeCompare(b));
}

function walk(target, out) {
  if (!fs.existsSync(target)) {
    throw new Error(`No existe --input: ${target}`);
  }

  const stat = fs.statSync(target);
  if (stat.isFile()) {
    if (path.extname(target).toLowerCase() === ".xml") out.push(target);
    return;
  }

  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    const child = path.join(target, entry.name);
    if (entry.isDirectory()) walk(child, out);
    else if (
      entry.isFile() &&
      path.extname(entry.name).toLowerCase() === ".xml"
    ) {
      out.push(child);
    }
  }
}

function writeJsonl(filePath, rows) {
  fs.writeFileSync(
    filePath,
    rows.map((row) => JSON.stringify(row)).join("\n") +
      (rows.length ? "\n" : ""),
  );
}

function writeIds(filePath, rows) {
  const ids = [
    ...new Set(
      rows.map((row) => row.caseId).filter(Number.isSafeInteger),
    ),
  ].sort((a, b) => a - b);

  fs.writeFileSync(
    filePath,
    ids.join("\n") + (ids.length ? "\n" : ""),
  );
}

function inc(map, key, amount = 1) {
  map.set(key, (map.get(key) || 0) + amount);
}

function get(map, key) {
  return map.get(key) || 0;
}

function sortedObject(
  map,
  comparator = (a, b) => String(a).localeCompare(String(b)),
) {
  return Object.fromEntries(
    [...map.entries()].sort((a, b) => comparator(a[0], b[0])),
  );
}

function numericKey(a, b) {
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return String(a).localeCompare(String(b));
}

function formatNumber(value) {
  return Number(value).toString();
}

function parseArgs(argv) {
  const out = {
    inputs: [],
    output: path.resolve("research/optimizer/node-trim-audit"),
    epsilon: 1e-6,
    progressEvery: 500,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--input") out.inputs.push(argv[++i]);
    else if (arg === "--output") out.output = path.resolve(argv[++i]);
    else if (arg === "--epsilon") out.epsilon = Number(argv[++i]);
    else if (arg === "--progress-every") {
      out.progressEvery = Math.max(1, Number(argv[++i]) || 500);
    } else {
      throw new Error(`Argumento desconocido: ${arg}`);
    }
  }

  if (!Number.isFinite(out.epsilon) || out.epsilon < 0) {
    throw new Error("--epsilon inválido");
  }

  return out;
}

function printHelp() {
  console.log(`Uso:
  node scripts/audit-lepton-node-trim-semantics.mjs --input <xml-dir> [--input <xml-dir> ...] --output <dir>

Gate:
  Para cada nodo poblado con atributo trim:
    leftover = l - (sum(part.cut * part.num) + saw * (units - 1))
  Debe cumplirse:
    leftover ~= 0  OR  node.trim ~= 0  OR  leftover >= node.trim

Ejemplo:
  node scripts/audit-lepton-node-trim-semantics.mjs \\
    --input validation-full/serial-production-audit/_extracted \\
    --output validation-full/node-trim-semantics
`);
}
