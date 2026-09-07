#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(import.meta.url);
const REPO = resolve(dirname(SCRIPT), "../..");
const sourcePath = resolve(REPO, "Optimizador_V11_Candidato_Prod_Benchmark_Project.html");
const outPath = resolve(
  REPO,
  process.argv[2] ?? "research/optimizer/freeze/KERNEL_V1_CORRECTNESS_EXECUTION_SEMANTICS.json",
);
const source = readFileSync(sourcePath, "utf8");

const checks = {
  rotationNormalizedTerminalDimensions:
    source.includes("const dimKey=(a,b)=>{ const x=Math.min(a,b),y=Math.max(a,b);"),
  semanticMultisetCompared:
    source.includes("const ours=parsearProjectXmlSemantico(outXml,'Nuestro'), mm=compararMultiset(ours.piezas,caso.refXml.piezas);"),
  acceptanceRequiresValidationXmlAndMultiset:
    source.includes("const valido=v.ok&&ours.ok&&mm.ok;"),
  rootTrimDefault10:
    source.includes("const trim=roots.length?numeroAttr(roots[0],'trim',10):10;"),
  rootTrimAppliedBothAxes:
    source.includes("refiladoX:trim,refiladoY:trim"),
};

if (!Object.values(checks).every(Boolean)) {
  throw new Error(`historical benchmark execution semantics drifted: ${JSON.stringify(checks)}`);
}

const report = {
  schemaVersion: "kernel-v1-correctness-execution-semantics-v1",
  generatedAt: new Date().toISOString(),
  source: {
    file: "Optimizador_V11_Candidato_Prod_Benchmark_Project.html",
    sha256: createHash("sha256").update(source).digest("hex"),
  },
  status: "RECOVERED",
  checks,
  multiset: {
    id: "HISTORICAL_TERMINAL_DIMENSION_MULTISET_V1",
    key: "min(width,height) x max(width,height)",
    rotationNormalized: true,
    ignoresReference: true,
    ignoresEdges: true,
    ignoresEdgeType: true,
    sourceSide: "terminal dimensions parsed from exported project XML",
  },
  usableBoard: {
    id: "HISTORICAL_PROJECT_ROOT_TRIM_V1",
    projectTrimSource: "first project root node trim attribute",
    defaultWhenMissing: 10,
    apply: "same trim value to refiladoX and refiladoY",
    orderBehavior: "no historical project-benchmark provenance; keep the canonical Order trim binding unchanged",
  },
  acceptance: {
    historicalExpression: "industrial validation ok AND generated XML semantic parse ok AND terminal-dimension multiset ok",
    referenceBoardsRole: "reported quality metric only",
  },
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ out: relative(outPath), status: report.status, checks }));

function relative(path) {
  return path.startsWith(REPO) ? path.slice(REPO.length + 1).replace(/\\/g, "/") : path.replace(/\\/g, "/");
}
