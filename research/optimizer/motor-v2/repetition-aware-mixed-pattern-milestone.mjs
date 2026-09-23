import fs from "node:fs";
import path from "node:path";
import { runCase } from "./repetition-aware-mixed-pattern-generator.mjs";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const fixture = JSON.parse(
  fs.readFileSync(
    path.join(HERE, "fixtures/REPEATED_MIXED_MILESTONE_8.json"),
    "utf8",
  ),
);

const rows = [];

for (const source of fixture) {
  const c = {
    id: source.id,
    b: source.board,
    s: source.saw,
    l: source.leptonBoards,
    t: source.types.map((t) => [t.w, t.h, t.q]),
  };

  const result = runCase(c, source.storedV3Boards);
  const accepted = Boolean(
    result.validFinal && result.resultBoards < source.storedV3Boards,
  );

  const row = {
    ...result,
    storedV3Boards: source.storedV3Boards,
    accepted,
    finalBoards: accepted ? result.resultBoards : source.storedV3Boards,
    boardRegression: false,
  };
  rows.push(row);
  console.log("CASE " + JSON.stringify(row));
}

const summary = {
  cases: rows.length,
  accepted: rows.filter((r) => r.accepted).length,
  unchanged: rows.filter((r) => !r.accepted).length,
  invalidAccepted: rows.filter((r) => r.accepted && !r.validFinal).length,
  boardRegressions: 0,
  boardsSaved: rows.reduce(
    (s, r) => s + (r.accepted ? r.storedV3Boards - r.resultBoards : 0),
    0,
  ),
  closedLeptonGaps: rows.filter(
    (r) =>
      r.accepted &&
      r.resultBoards <= r.reference &&
      r.storedV3Boards > r.reference,
  ).length,
  reachedSafeLB: rows.filter((r) => r.accepted && r.reachedLB).length,
};

fs.writeFileSync(
  path.join(HERE, "REPEATED_MIXED_PATTERN_MILESTONE_RESULT.json"),
  JSON.stringify({ summary, rows }, null, 2) + "\n",
);

console.log("SUMMARY " + JSON.stringify(summary));

if (
  summary.invalidAccepted ||
  summary.boardRegressions ||
  summary.accepted < 3 ||
  summary.boardsSaved < 17 ||
  summary.closedLeptonGaps < 3
) {
  process.exitCode = 2;
}
