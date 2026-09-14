// Development diagnostic: only captured 4057401 input, fixed H4 work budget.
// Preserve attempts; CPU is inclusive and never mixed with paired pilot timing.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { createContext } from "../context.mjs";
import { generatePatterns } from "../b01/and-or.mjs";
import { EXPERIMENT, ROOT, verifyH2, fileHash } from "./identity.mjs";
import { serialize } from "./evidence.mjs";
const out = resolve(process.argv[2]);
const policy = JSON.parse(readFileSync(join(EXPERIMENT, "H4_4057401_POLICY.json"), "utf8"));
const reference = JSON.parse(readFileSync(join(ROOT, "test-results/h4-4057401-pilot-v1/a-1/result.json"), "utf8"));
const context = createContext(reference.probe.captured.lines, reference.probe.captured.config);
const identity = verifyH2();
const source = readdirSync(join(EXPERIMENT, "b01")).map((file) => ({ file, sha256: fileHash(join(EXPERIMENT, "b01", file)),
  text: readFileSync(join(EXPERIMENT, "b01", file), "utf8") }));
const cpu = process.cpuUsage(), start = performance.now();
const result = generatePatterns(context, policy.generatorBudget, { maxVariantsPerUsageVector: policy.maxVariantsPerUsageVector });
const used = process.cpuUsage(cpu);
mkdirSync(dirname(out), { recursive: true });
const record = { mode: "development-generation-only", order: policy.order, policy, identity, source,
  inputHash: reference.inputHash, cpuMs: (used.user + used.system) / 1000, wallMs: performance.now() - start,
  result: serialize(result) };
writeFileSync(out, JSON.stringify(record), { flag: "wx" });
console.log(JSON.stringify({ out, cpuMs: record.cpuMs, patterns: result.patterns.length, status: result.status, telemetry: result.telemetry }));
