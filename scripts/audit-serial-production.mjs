#!/usr/bin/env node

import { build } from "esbuild";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));

if (args.help || args.inputs.length === 0) {
  printHelp();
  process.exit(args.help ? 0 : 2);
}

const outputDir = resolve(args.output);
mkdirSync(outputDir, { recursive: true });

const bundlePath = join(REPO, "node_modules", ".cache", "serial-production-audit", "canonical-xml.mjs");
mkdirSync(dirname(bundlePath), { recursive: true });
await build({
  entryPoints: [join(REPO, "src", "lib", "optimizer", "canonical-xml.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile: bundlePath,
  logLevel: "warning",
});
const canonicalXml = await import(pathToFileURL(bundlePath).href + "?v=" + Date.now());

const inputDescriptors = prepareInputs(args.inputs, outputDir);
const files = collectXmlFiles(inputDescriptors);
const validationRows = loadValidationRows(args.validationOutput);
const validationByKey = new Map(validationRows.map((row) => [row.caseKey, row]));
const rows = [];
let parsedCount = 0;
let parseErrors = 0;

for (let index = 0; index < files.length; index++) {
  const file = files[index];
  try {
    const xml = readFileSync(file.path, "utf8");
    const parsed = canonicalXml.parseCanonicalXml(xml, {
      fileName: file.displayName,
      defaultKerf: 4.5,
      defaultMinRemnant: 250,
      defaultMinCommercialRemnantLongSide: 400,
    });
    const quantities = parsed.case.pieces.map((piece) => Number(piece.quantity)).filter((value) => Number.isInteger(value) && value > 0);
    const typeCount = quantities.length;
    const pieceCount = quantities.reduce((sum, value) => sum + value, 0);
    const kitCopies = quantities.length ? quantities.reduce(gcd) : 1;
    const piecesPerKit = kitCopies > 1 ? pieceCount / kitCopies : null;
    const typeRatio = typeCount > 0 ? pieceCount / typeCount : 0;
    const maxQuantity = quantities.length ? Math.max(...quantities) : 0;
    const minQuantity = quantities.length ? Math.min(...quantities) : 0;
    const medianQuantity = median(quantities);
    const panelMultiplicity = parsed.format === "project" ? physicalLeptonPanelMultiplicity(xml) : null;
    const leptonBoards = panelMultiplicity?.physicalBoards ?? null;
    const validation = validationByKey.get(file.caseKey) ?? null;

    const exactKit = kitCopies >= args.minKitCopies && pieceCount >= args.minPieces;
    const serialLowDiversity =
      pieceCount >= args.minPieces &&
      typeCount <= args.maxTypes &&
      typeRatio >= args.minRatio;
    const serialCandidate = exactKit || serialLowDiversity;
    const targetFurniture = Number.isFinite(leptonBoards) && leptonBoards <= args.targetBoards;

    rows.push({
      schema: "optimizer-serial-production-audit-row-v1",
      caseKey: file.caseKey,
      caseId: idFromFileName(file.displayName),
      fileName: file.displayName,
      source: file.source,
      relativePath: file.relativePath,
      format: parsed.format,
      typeCount,
      pieceCount,
      pieceToTypeRatio: round3(typeRatio),
      quantity: {
        min: minQuantity,
        median: medianQuantity,
        max: maxQuantity,
        gcd: kitCopies,
      },
      exactKit: {
        candidate: exactKit,
        copies: kitCopies,
        piecesPerKit,
      },
      serialLowDiversity,
      serialCandidate,
      leptonBoards,
      leptonPanelMultiplicity: panelMultiplicity,
      targetFurniture,
      panel: parsed.case.panel,
      kerf: parsed.case.kerf,
      validation: validation ? compactValidation(validation) : null,
    });
    parsedCount++;
  } catch (error) {
    parseErrors++;
    rows.push({
      schema: "optimizer-serial-production-audit-row-v1",
      caseKey: file.caseKey,
      caseId: idFromFileName(file.displayName),
      fileName: file.displayName,
      source: file.source,
      relativePath: file.relativePath,
      parseError: String(error?.stack || error),
    });
  }

  if ((index + 1) % args.progressEvery === 0 || index + 1 === files.length) {
    console.log(`Analizados ${index + 1}/${files.length} XML...`);
  }
}

const summary = summarize(rows, {
  discoveredXml: files.length,
  parsedCount,
  parseErrors,
  validationRows: validationRows.length,
  thresholds: {
    targetBoards: args.targetBoards,
    minPieces: args.minPieces,
    maxTypes: args.maxTypes,
    minRatio: args.minRatio,
    minKitCopies: args.minKitCopies,
  },
});

const rowsPath = join(outputDir, "SERIAL_PRODUCTION_AUDIT_ROWS.jsonl");
const summaryPath = join(outputDir, "SERIAL_PRODUCTION_AUDIT_SUMMARY.json");
const summaryMdPath = join(outputDir, "SERIAL_PRODUCTION_AUDIT_SUMMARY.md");
writeFileSync(rowsPath, rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : ""));
writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + "\n");
writeFileSync(summaryMdPath, renderMarkdown(summary));

console.log(`\nListo. Filas: ${rowsPath}`);
console.log(`Resumen: ${summaryPath}`);
console.log(`Markdown: ${summaryMdPath}`);

function compactValidation(row) {
  return {
    status: row.status ?? null,
    candidateBoards: row.candidate?.boards ?? row.candidateBoards ?? null,
    candidateValid: row.candidate?.valid ?? null,
    candidateWallMs: row.candidate?.wallMs ?? row.candidateWallMs ?? null,
    candidateCpuMs: row.candidate?.cpuMs ?? row.candidateCpuMs ?? null,
    leptonBoards: row.leptonBoards ?? null,
    error: row.candidate?.error ?? row.error ?? null,
  };
}

function summarize(rows, meta) {
  const valid = rows.filter((row) => !row.parseError);
  const exactKits = valid.filter((row) => row.exactKit?.candidate);
  const lowDiversity = valid.filter((row) => row.serialLowDiversity);
  const serial = valid.filter((row) => row.serialCandidate);
  const furniture = valid.filter((row) => row.targetFurniture);
  const nonFurniture = valid.filter((row) => Number.isFinite(row.leptonBoards) && !row.targetFurniture);
  const withValidation = valid.filter((row) => row.validation);

  return {
    schema: "optimizer-serial-production-audit-summary-v1",
    generatedAt: new Date().toISOString(),
    ...meta,
    counts: {
      valid: valid.length,
      exactKitCandidates: exactKits.length,
      serialLowDiversityCandidates: lowDiversity.length,
      serialCandidatesUnion: serial.length,
      targetFurniture: furniture.length,
      aboveTargetBoards: nonFurniture.length,
      validationMatched: withValidation.length,
    },
    serialSharePct: pct(serial.length, valid.length),
    exactKitSharePct: pct(exactKits.length, valid.length),
    byTarget: {
      furniture: cohortStats(furniture),
      aboveTargetBoards: cohortStats(nonFurniture),
      serialCandidates: cohortStats(serial),
      serialInsideFurniture: cohortStats(serial.filter((row) => row.targetFurniture)),
      serialAboveFurniture: cohortStats(serial.filter((row) => Number.isFinite(row.leptonBoards) && !row.targetFurniture)),
    },
    topExactKits: topRows(exactKits, (a, b) => b.exactKit.copies - a.exactKit.copies || b.pieceCount - a.pieceCount),
    topSerialByPieces: topRows(serial, (a, b) => b.pieceCount - a.pieceCount),
    topSerialByWall: topRows(serial.filter((row) => Number.isFinite(row.validation?.candidateWallMs)), (a, b) => b.validation.candidateWallMs - a.validation.candidateWallMs),
    serialFailures: topRows(serial.filter((row) => row.validation?.status === "FAIL"), (a, b) => b.pieceCount - a.pieceCount, 100),
  };
}

function cohortStats(rows) {
  const walls = rows.map((row) => row.validation?.candidateWallMs).filter(Number.isFinite).sort((a, b) => a - b);
  const cpus = rows.map((row) => row.validation?.candidateCpuMs).filter(Number.isFinite).sort((a, b) => a - b);
  const pieces = rows.map((row) => row.pieceCount).filter(Number.isFinite).sort((a, b) => a - b);
  return {
    cases: rows.length,
    validationCases: walls.length,
    failures: rows.filter((row) => row.validation?.status === "FAIL").length,
    pieces: {
      p50: quantile(pieces, 0.5),
      p95: quantile(pieces, 0.95),
      max: pieces.at(-1) ?? null,
    },
    wallMs: {
      p50: quantile(walls, 0.5),
      p95: quantile(walls, 0.95),
      p99: quantile(walls, 0.99),
      max: walls.at(-1) ?? null,
    },
    cpuMs: {
      p50: quantile(cpus, 0.5),
      p95: quantile(cpus, 0.95),
      p99: quantile(cpus, 0.99),
      max: cpus.at(-1) ?? null,
    },
  };
}

function topRows(rows, compare, limit = 30) {
  return rows.slice().sort(compare).slice(0, limit).map((row) => ({
    caseId: row.caseId,
    fileName: row.fileName,
    typeCount: row.typeCount,
    pieceCount: row.pieceCount,
    pieceToTypeRatio: row.pieceToTypeRatio,
    kitCopies: row.exactKit?.copies ?? 1,
    piecesPerKit: row.exactKit?.piecesPerKit ?? null,
    leptonBoards: row.leptonBoards,
    targetFurniture: row.targetFurniture,
    validation: row.validation,
  }));
}

function renderMarkdown(summary) {
  const c = summary.counts;
  const serial = summary.byTarget.serialCandidates;
  const furniture = summary.byTarget.furniture;
  return `# Serial Production Audit\n\n` +
    `Generado: ${summary.generatedAt}\n\n` +
    `## Umbrales\n\n` +
    `- Target muebles: hasta ${summary.thresholds.targetBoards} placas Lepton.\n` +
    `- Serialidad: >= ${summary.thresholds.minPieces} piezas, <= ${summary.thresholds.maxTypes} tipos y ratio piezas/tipo >= ${summary.thresholds.minRatio}.\n` +
    `- Kit exacto: GCD de cantidades >= ${summary.thresholds.minKitCopies} y >= ${summary.thresholds.minPieces} piezas.\n\n` +
    `## Corpus\n\n` +
    `- XML: ${summary.discoveredXml}\n` +
    `- Parseados: ${summary.parsedCount}\n` +
    `- Errores de parseo: ${summary.parseErrors}\n` +
    `- Target muebles: ${c.targetFurniture}\n` +
    `- Sobre target de placas: ${c.aboveTargetBoards}\n` +
    `- Candidatos seriales: ${c.serialCandidatesUnion} (${summary.serialSharePct}%)\n` +
    `- Kits exactos: ${c.exactKitCandidates} (${summary.exactKitSharePct}%)\n\n` +
    `## Performance cruzada\n\n` +
    `- Target muebles p95 wall: ${fmtMs(furniture.wallMs.p95)}\n` +
    `- Target muebles p99 wall: ${fmtMs(furniture.wallMs.p99)}\n` +
    `- Serial p95 wall: ${fmtMs(serial.wallMs.p95)}\n` +
    `- Serial p99 wall: ${fmtMs(serial.wallMs.p99)}\n` +
    `- FAIL seriales: ${serial.failures}\n\n` +
    `## Top seriales por piezas\n\n` +
    table(summary.topSerialByPieces) + `\n\n` +
    `## Top kits exactos\n\n` +
    table(summary.topExactKits) + `\n`;
}

function table(rows) {
  if (!rows.length) return "Sin casos.";
  const head = "| Caso | Tipos | Piezas | Ratio | Copias kit | Piezas/kit | Placas Lepton | Wall | Estado |\n|---:|---:|---:|---:|---:|---:|---:|---:|:---|";
  const body = rows.map((row) =>
    `| ${row.caseId ?? ""} | ${row.typeCount} | ${row.pieceCount} | ${row.pieceToTypeRatio} | ${row.kitCopies} | ${row.piecesPerKit ?? ""} | ${row.leptonBoards ?? ""} | ${fmtMs(row.validation?.candidateWallMs)} | ${row.validation?.status ?? ""} |`
  ).join("\n");
  return head + "\n" + body;
}

function loadValidationRows(validationOutput) {
  if (!validationOutput) return [];
  const path = resolve(validationOutput, "FULL_RUNTIME_VALIDATION_ROWS.jsonl");
  if (!existsSync(path)) {
    console.warn(`INFO: no existe ${path}; el audit correra sin tiempos del validator.`);
    return [];
  }
  const rows = [];
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    try { rows.push(JSON.parse(line)); } catch {}
  }
  console.log(`Validation rows cargadas: ${rows.length}`);
  return rows;
}

function parseArgs(argv) {
  const out = {
    inputs: [],
    output: "./validation-full/serial-production-audit",
    validationOutput: "./validation-full",
    targetBoards: 75,
    minPieces: 500,
    maxTypes: 40,
    minRatio: 20,
    minKitCopies: 2,
    progressEvery: 500,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--input") out.inputs.push(argv[++i]);
    else if (arg === "--output") out.output = argv[++i];
    else if (arg === "--validation-output") out.validationOutput = argv[++i];
    else if (arg === "--target-boards") out.targetBoards = numberArg(argv[++i], arg);
    else if (arg === "--min-pieces") out.minPieces = numberArg(argv[++i], arg);
    else if (arg === "--max-types") out.maxTypes = numberArg(argv[++i], arg);
    else if (arg === "--min-ratio") out.minRatio = numberArg(argv[++i], arg);
    else if (arg === "--min-kit-copies") out.minKitCopies = numberArg(argv[++i], arg);
    else if (arg === "--progress-every") out.progressEvery = numberArg(argv[++i], arg);
    else if (arg === "--help" || arg === "-h") out.help = true;
    else throw new Error(`Argumento desconocido: ${arg}`);
  }
  return out;
}

function printHelp() {
  console.log(`Uso:\n  npm run optimizer:audit:serial -- --input <zip|carpeta> [--input ...]\n\nOpciones:\n  --output <dir>              Default: ./validation-full/serial-production-audit\n  --validation-output <dir>   Default: ./validation-full\n  --target-boards <n>         Default: 75\n  --min-pieces <n>            Default: 500\n  --max-types <n>             Default: 40\n  --min-ratio <n>             Default: 20\n  --min-kit-copies <n>        Default: 2\n  --progress-every <n>        Default: 500`);
}

function prepareInputs(inputs, output) {
  const staging = join(output, "_extracted");
  mkdirSync(staging, { recursive: true });
  return inputs.map((source, index) => {
    const absolute = resolve(source);
    if (!existsSync(absolute)) throw new Error(`No existe --input: ${source}`);
    const stat = statSync(absolute);
    if (stat.isDirectory()) return { source: absolute, root: absolute, kind: "directory", fingerprint: null, index };
    if (extname(absolute).toLowerCase() !== ".zip") throw new Error(`El input debe ser carpeta o .zip: ${source}`);
    const fingerprint = sha256File(absolute);
    const target = join(staging, `${String(index + 1).padStart(2, "0")}-${safeId(basename(absolute))}-${fingerprint.slice(0, 10)}`);
    const marker = join(target, ".extracted-ok");
    if (!existsSync(marker)) {
      rmSync(target, { recursive: true, force: true });
      mkdirSync(target, { recursive: true });
      extractZip(absolute, target);
      writeFileSync(marker, fingerprint + "\n");
    }
    return { source: absolute, root: target, kind: "zip", fingerprint, index };
  });
}

function extractZip(source, target) {
  console.log(`Extrayendo ${source} ...`);
  let result = spawnSync("tar", ["-xf", source, "-C", target], { cwd: REPO, stdio: "inherit" });
  if (result.status === 0) return;
  if (process.platform === "win32") {
    const ps = (value) => "'" + String(value).replaceAll("'", "''") + "'";
    result = spawnSync("powershell.exe", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath ${ps(source)} -DestinationPath ${ps(target)} -Force`], { cwd: REPO, stdio: "inherit" });
    if (result.status === 0) return;
  }
  throw new Error(`No pude extraer ${source}.`);
}

function collectXmlFiles(descriptors) {
  const out = [];
  for (const item of descriptors) {
    const paths = walkXml(item.root).sort((a, b) => a.localeCompare(b));
    for (const path of paths) {
      const rel = relative(item.root, path).replaceAll("\\", "/");
      out.push({
        path,
        source: item.source,
        relativePath: rel,
        displayName: basename(path),
        caseKey: `${item.index}:${rel}`,
      });
    }
  }
  out.sort((a, b) => a.caseKey.localeCompare(b.caseKey));
  return out;
}

function walkXml(root) {
  const out = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name === ".extracted-ok") continue;
      const full = join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && extname(entry.name).toLowerCase() === ".xml") out.push(full);
    }
  }
  return out;
}

function physicalLeptonPanelMultiplicity(xml) {
  let physicalBoards = 0;
  let panelNodes = 0;
  let repeatedPanelNodes = 0;
  let repeatedPhysicalBoards = 0;
  let maxMultiplicity = 1;
  for (const match of xml.matchAll(/<panel\d+\b([^>]*)>/gi)) {
    panelNodes++;
    const attrs = match[1] || "";
    const n = /\bnum\s*=\s*["']([^"']+)["']/i.exec(attrs);
    const raw = n ? Number(n[1]) : 1;
    const quantity = Number.isFinite(raw) && raw > 0 ? raw : 1;
    physicalBoards += quantity;
    maxMultiplicity = Math.max(maxMultiplicity, quantity);
    if (quantity > 1) {
      repeatedPanelNodes++;
      repeatedPhysicalBoards += quantity;
    }
  }
  return panelNodes ? {
    panelNodes,
    physicalBoards,
    repeatedPanelNodes,
    repeatedPhysicalBoards,
    repeatedPhysicalSharePct: pct(repeatedPhysicalBoards, physicalBoards),
    maxMultiplicity,
  } : null;
}

function gcd(a, b) {
  a = Math.abs(Math.trunc(a));
  b = Math.abs(Math.trunc(b));
  while (b) [a, b] = [b, a % b];
  return a || 1;
}

function median(values) {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function quantile(sorted, q) {
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0];
  const index = (sorted.length - 1) * q;
  const lo = Math.floor(index);
  const hi = Math.ceil(index);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (index - lo);
}

function idFromFileName(name) {
  const match = /(^|[^0-9])(\d{6,})(?=[^0-9]|$)/.exec(name);
  return match ? Number(match[2]) : null;
}

function safeId(value) {
  return String(value).replace(/[^a-z0-9._-]+/gi, "_");
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function numberArg(value, flag) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${flag} requiere un numero positivo.`);
  return n;
}

function pct(a, b) {
  return b ? round3((a * 100) / b) : 0;
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

function fmtMs(value) {
  if (!Number.isFinite(value)) return "n/a";
  return `${Math.round(value)} ms`;
}
