#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const args = parseArgs(process.argv.slice(2));
const source = resolve(String(args.source ?? "experiencia/v6/hotspot-all.jsonl"));
const v20Path = resolve(String(args.v20 ?? "experiencia/v6/hotspot-v20-cheap.jsonl"));
const out = typeof args.out === "string" ? resolve(args.out) : null;
if (!existsSync(source)) throw new Error(`no existe source: ${source}`);
if (!existsSync(v20Path)) throw new Error(`no existe v20: ${v20Path}`);

const historical = readJsonl(source).filter((r) => r && r.engineCacheHit !== true);
const v20Rows = readJsonl(v20Path).filter((r) => r?.file);
const v20 = new Map(v20Rows.map((r) => [r.file, r]));

const records = historical.map((row) => {
  const master = row?.metricas?.master ?? row?.metricasV10?.master ?? row?.master ?? {};
  const saved = +(master.placasAhorradas ?? 0) || 0;
  const preMasterBoards = (+row.boards || 0) + saved;
  const cota = +row.cota || 0;
  const gap = Math.max(0, preMasterBoards - cota);
  const masterMs = +(row.masterMs ?? master.ms ?? 0) || 0;
  const activated = +(master.activaciones ?? 0) > 0 || masterMs > 0;
  const candidate = v20.get(row.file) ?? null;
  return {
    file: row.file,
    gap,
    masterMs,
    activated,
    v20Known: candidate !== null,
    v20Certified: candidate ? isCertified(candidate) : false,
  };
});

const activated = records.filter((r) => r.activated);
const matched = activated.filter((r) => r.v20Known);
const certified = matched.filter((r) => r.v20Certified);
const gapGt1 = activated.filter((r) => r.gap > 1);
const gapGt1Matched = gapGt1.filter((r) => r.v20Known);
const gapGt1Certified = gapGt1Matched.filter((r) => r.v20Certified);
const gapGt1KnownSurvivors = gapGt1Matched.filter((r) => !r.v20Certified);

const summary = {
  source,
  v20: v20Path,
  historicalCases: historical.length,
  v20Rows: v20Rows.length,
  v20CoveragePct: pct(v20Rows.length, historical.length),
  historicalMasterActivations: activated.length,
  matchedMasterActivations: matched.length,
  matchedMasterActivationCoveragePct: pct(matched.length, activated.length),
  v20CertifiedAmongMatchedMasterActivations: certified.length,
  historicalMasterMsCertifiedInMatchedRows: sum(certified),
  gapGt1: {
    historicalActivations: gapGt1.length,
    historicalMasterMs: sum(gapGt1),
    matchedActivations: gapGt1Matched.length,
    matchedMasterMs: sum(gapGt1Matched),
    certifiedByV20Activations: gapGt1Certified.length,
    certifiedByV20MasterMs: sum(gapGt1Certified),
    knownSurvivingActivations: gapGt1KnownSurvivors.length,
    knownSurvivingMasterMs: sum(gapGt1KnownSurvivors),
  },
  interpretation: v20Rows.length < historical.length
    ? "V20 es parcial: knownSurvivingMasterMs sólo describe filas ya medidas; no extrapolarlo al total. certifiedByV20MasterMs sí es solapamiento confirmado."
    : "V20 cubre toda la cohorte: knownSurvivingMasterMs es el ahorro incremental contrafáctico de V22a sobre gap>1.",
};

console.log(JSON.stringify(summary, null, 2));
if (out) writeFileSync(out, JSON.stringify(summary, null, 2) + "\n");

function isCertified(row) {
  const lb = row?.metricasV10?.lowerBound ?? row?.metricas?.lowerBound ?? row?.lowerBound ?? {};
  return +(row?.cheapCertified ?? lb.cheapCertified ?? 0) > 0 ||
    +(row?.certifiedAfterBaseline ?? lb.certifiedAfterBaseline ?? 0) > 0;
}
function readJsonl(path) {
  return readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean).map((line, i) => {
    try { return JSON.parse(line); }
    catch (error) { throw new Error(`${path}:${i + 1}: ${error.message}`); }
  });
}
function sum(rows) { return rows.reduce((s, r) => s + (+r.masterMs || 0), 0); }
function pct(part, total) { return total > 0 ? part / total * 100 : 0; }
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[key] = true;
    else { out[key] = next; i++; }
  }
  return out;
}
