import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { ROOT, EXPERIMENT, fileHash, verifyH2 } from "./identity.mjs";
import { digest } from "../canonical.mjs";
import { runH3 } from "./run.mjs";

export async function preparePilot(out) {
  const policyPath = join(EXPERIMENT, "H4_4057401_POLICY.json");
  const policy = JSON.parse(readFileSync(policyPath, "utf8"));
  const path = join(ROOT, "test-results/kernel-v1-corpora/resto", policy.file);
  const cachePath = join(ROOT, "test-results/kernel-v1-formal-certification/preflight-state-cache-v4.json");
  const preparation = resolve(out + "-input");
  if (existsSync(out) || existsSync(preparation)) throw new Error("pilot output/preparation must be new");
  const identity = verifyH2();
  mkdirSync(preparation, { recursive: true });
  const bundle = join(preparation, "input-parser.mjs");
  const { build } = await import("esbuild");
  await build({ entryPoints: [join(ROOT, "src/lib/optimizer/index.ts")], outfile: bundle,
    bundle: true, platform: "node", format: "esm", target: "node22", logLevel: "silent",
    define: { "import.meta.url": JSON.stringify(pathToFileURL(join(ROOT, "src/lib/optimizer/engine/legacy-engine.ts")).href) } });
  const bridge = await import(pathToFileURL(bundle).href);
  const parsed = bridge.parseCanonicalXml(readFileSync(path, "utf8"), { fileName: policy.file });
  const trim = Number(parsed.stats.trimReference?.[0]);
  const canonical = parsed.format === "project" ? { ...parsed.case,
    trim: { x: Number.isFinite(trim) ? trim : 10, y: Number.isFinite(trim) ? trim : 10 } } : parsed.case;
  const cache = JSON.parse(readFileSync(cachePath, "utf8"));
  const recovered = cache.state.feasible.find((row) => row.file === policy.file);
  if (!recovered || digest(recovered.case) !== digest(canonical)) throw new Error("physical input differs from recovered certification binding");
  const input = bridge.benchmarkInputFromCanonicalCase(canonical, { strategy: "v10" });
  const job = (id, arm, extra = {}) => ({ id, arm, input, mode: "end-to-end", watchdogMs: policy.watchdogMs,
    ...(arm === "B" ? { generatorBudget: policy.generatorBudget, maxVariantsPerUsageVector: policy.maxVariantsPerUsageVector } : {}), ...extra });
  const jobs = [job("control-a-direct", "A-direct", { control: "parity" }),
    job("control-b-native", "B", { control: "parity", nativeB0: true })];
  for (const [index, order] of policy.orderByRepetition.entries()) {
    for (const arm of order) jobs.push(job(`${arm.toLowerCase()}-${index + 1}`, arm === "A" ? "A-adapter" : "B"));
  }
  const manifest = { schemaVersion: 1, mode: "h4-pilot", policy, jobs,
    source: { path, file: policy.file, sha256: fileHash(path), format: parsed.format,
      canonicalHash: digest(canonical), inputHash: digest(input), input,
      binding: policy.executionBinding, parserStats: parsed.stats, parserWarnings: parsed.warnings,
      preflightCacheSha256: fileHash(cachePath), referencePanels: recovered.referencePanels },
    policySha256: fileHash(policyPath), preparedIdentity: identity };
  writeFileSync(join(preparation, "frozen-manifest.json"), JSON.stringify(manifest, null, 2), { flag: "wx" });
  return manifest;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = resolve(process.argv[2] ?? join(ROOT, "test-results", `h4-4057401-${Date.now()}`));
  const manifest = await preparePilot(out);
  console.log(JSON.stringify({ frozenManifest: out + "-input/frozen-manifest.json", inputHash: manifest.source.inputHash,
    budget: manifest.policy.generatorBudget, diversity: manifest.policy.maxVariantsPerUsageVector }));
  const { report } = await runH3(manifest, out);
  console.log(JSON.stringify({ out, comparisonValid: report.comparisonValid, q1: report.q1, q2: report.q2, q3: report.q3.status }));
  if (!report.comparisonValid || report.q1 !== "PASS" || report.q2 !== "PASS") process.exitCode = 1;
}
