// Read-only with respect to measurements: create a new derived report, never
// rerun the optimizer or replace the original report or failed records.
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pilotReport } from "./pilot-report.mjs";
import { fileHash, verifyH2 } from "./identity.mjs";
import { digest } from "../canonical.mjs";
export function rebuildPilotReport(dir, out) {
  const read = (file) => JSON.parse(readFileSync(join(dir, file), "utf8"));
  const manifest = read("manifest.json");
  if (manifest.mode !== "h4-pilot" || manifest.policy.order !== "4057401") throw new Error("only 4057401 pilot evidence supported");
  const completion = manifest.jobs.map((job) => read(job.id + "/completion.json"));
  const results = completion.map((row) => read(row.artifact));
  results.forEach((r, i) => {
    if (r.jobId !== manifest.jobs[i].id || r.inputHash !== digest(manifest.jobs[i].input)) throw new Error("record identity mismatch");
  });
  const current = verifyH2();
  if (current.kernelTreeHash !== manifest.identity.kernelTreeHash || current.generatorSourceHash !== manifest.identity.generatorSourceHash) throw new Error("frozen source drift");
  const report = { ...pilotReport(manifest, results), derivation: {
    inputManifestSha256: fileHash(join(dir, "manifest.json")), originalReportSha256: fileHash(join(dir, "pilot-report.json")),
    recordFiles: completion.map((row) => [row.artifact, fileHash(join(dir, row.artifact))]),
    measuredIdentity: manifest.identity, reportIdentity: current,
    reason: "Report-only correction: Q2 FAIL for observed 5 vs 4 boards remains visible even when independent Q1 is FAIL. No optimizer rerun or budget change."
  } };
  writeFileSync(out, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  return report;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [dir, out] = process.argv.slice(2);
  if (!dir || !out) throw new Error("usage: rebuild-pilot-report.mjs <existing-run> <new-report.json>");
  const report = rebuildPilotReport(resolve(dir), resolve(out));
  console.log(JSON.stringify({ comparisonValid: report.comparisonValid, q1: report.q1, q2: report.q2, q3: report.q3.status }));
}
