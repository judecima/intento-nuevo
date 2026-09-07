#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const args = parseArgs(process.argv.slice(2));
const source = resolve(String(args.source ?? "experiencia/v7/all20.jsonl"));
const sentinelsPath = resolve(String(args.sentinels ?? "experiencia/master-quality-sentinels.json"));
const outPath = typeof args.out === "string" ? resolve(args.out) : null;

if (!existsSync(source)) throw new Error(`no existe source: ${source}`);
if (!existsSync(sentinelsPath)) throw new Error(`no existe sentinels: ${sentinelsPath}`);

const rows = readJsonl(source).filter((row) => row && row.engineCacheHit !== true);
const sentinelDoc = JSON.parse(readFileSync(sentinelsPath, "utf8"));
const known = new Map((sentinelDoc.sentinels ?? []).map((s) => [s.file, s]));

const wins = rows
  .map((row) => normalizeWin(row))
  .filter(Boolean)
  .sort((a, b) => b.gap - a.gap || b.masterMs - a.masterMs || a.file.localeCompare(b.file));

const byGap = {};
for (const win of wins) {
  const key = win.gap >= 5 ? "5+" : String(win.gap);
  const bucket = byGap[key] ??= { wins: 0, boardsSaved: 0, masterMs: 0, files: [] };
  bucket.wins++;
  bucket.boardsSaved += win.savedBoards;
  bucket.masterMs += win.masterMs;
  bucket.files.push(win.file);
}

const newCandidates = wins.filter((win) => !known.has(win.file));
const knownWins = wins.filter((win) => known.has(win.file));

const summary = {
  source,
  rows: rows.length,
  masterWins: wins.length,
  masterBoardsSaved: wins.reduce((s, w) => s + w.savedBoards, 0),
  byGap,
  knownSentinelsPresent: knownWins.map((w) => w.file),
  newCandidates,
  wins,
  interpretation: "This script reads already-produced JSONL only. It does not run the optimizer. all20.jsonl reflects the 20-round ablation, so these wins are calibration candidates, not proof that 40-round legacy has no additional wins."
};

console.log(JSON.stringify(summary, null, 2));
if (outPath) writeFileSync(outPath, JSON.stringify(summary, null, 2) + "\n");

function normalizeWin(row) {
  const master = row?.metricas?.master ?? row?.metricasV10?.master ?? row?.master ?? {};
  const savedBoards = +(master.placasAhorradas ?? 0) || 0;
  if (savedBoards <= 0 || !row?.file) return null;
  const boards = +row.boards || +row?.resumen?.placas || 0;
  const cota = +row.cota || 0;
  const preMasterBoards = boards + savedBoards;
  const gap = Math.max(0, preMasterBoards - cota);
  return {
    file: row.file,
    rounds: +(row.rondasPatrones ?? 0) || null,
    boards,
    preMasterBoards,
    cota,
    gap,
    savedBoards,
    masterMs: +(master.ms ?? row.masterMs ?? 0) || 0,
    generationMs: +(row?.stageMs?.generarPatrones ?? row?.stageMs?.masterGenerarPatrones ?? 0) || 0,
    solveMs: +(row?.stageMs?.resolverCobertura ?? row?.stageMs?.masterResolverCobertura ?? 0) || 0,
  };
}

function readJsonl(path) {
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => {
      try { return JSON.parse(line); }
      catch (error) { throw new Error(`${path}:${index + 1}: ${error.message}`); }
    });
}

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
