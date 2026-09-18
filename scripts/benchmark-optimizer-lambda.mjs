import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const fixturePath = resolve(process.argv[2] || "infra/optimizer-rust-lambda/fixtures/4057401.json");
const samples = Math.max(1, Number(process.env.OPTIMIZER_LAMBDA_SAMPLES || 10));
const functions = [
  ["x86_64", process.env.OPTIMIZER_LAMBDA_X64],
  ["arm64", process.env.OPTIMIZER_LAMBDA_ARM64],
].filter(([, name]) => Boolean(name));

if (functions.length !== 2) {
  throw new Error("Set OPTIMIZER_LAMBDA_X64 and OPTIMIZER_LAMBDA_ARM64 to the two deployed function names");
}

const payload = readFileSync(fixturePath, "utf8");
JSON.parse(payload);

function percentile(values, p) {
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b);
  const index = Math.min(ordered.length - 1, Math.ceil((p / 100) * ordered.length) - 1);
  return Number(ordered[Math.max(0, index)].toFixed(3));
}

function parseReport(logText) {
  const report = logText.split(/\r?\n/).find((line) => line.startsWith("REPORT RequestId:"));
  if (!report) return {};
  const duration = /Duration:\s*([\d.]+) ms/.exec(report);
  const billed = /Billed Duration:\s*(\d+) ms/.exec(report);
  const memory = /Memory Size:\s*(\d+) MB/.exec(report);
  const maxMemory = /Max Memory Used:\s*(\d+) MB/.exec(report);
  const init = /Init Duration:\s*([\d.]+) ms/.exec(report);
  return {
    lambdaDurationMs: duration ? Number(duration[1]) : null,
    billedDurationMs: billed ? Number(billed[1]) : null,
    memoryMb: memory ? Number(memory[1]) : null,
    maxMemoryMb: maxMemory ? Number(maxMemory[1]) : null,
    initDurationMs: init ? Number(init[1]) : null,
  };
}

function invoke(functionName, outputPath) {
  const result = spawnSync(
    "aws",
    [
      "lambda",
      "invoke",
      "--function-name", functionName,
      "--payload", `fileb://${fixturePath}`,
      "--log-type", "Tail",
      outputPath,
    ],
    { encoding: "utf8" },
  );

  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `aws exited ${result.status}`);

  const metadata = JSON.parse(result.stdout || "{}");
  if (metadata.FunctionError) throw new Error(`Lambda ${functionName} failed: ${readFileSync(outputPath, "utf8")}`);
  const response = JSON.parse(readFileSync(outputPath, "utf8"));
  const logText = metadata.LogResult ? Buffer.from(metadata.LogResult, "base64").toString("utf8") : "";
  return { response, report: parseReport(logText), logText };
}

function summarize(arch, functionName, runs) {
  const good = runs.filter((run) => run.response?.ok);
  const digests = [...new Set(good.map((run) => run.response.digest))];
  const patterns = [...new Set(good.map((run) => run.response.patterns))];
  const billedGbSeconds = good.reduce((sum, run) => {
    const billedMs = run.report.billedDurationMs;
    const memoryMb = run.report.memoryMb;
    if (!Number.isFinite(billedMs) || !Number.isFinite(memoryMb)) return sum;
    return sum + (billedMs / 1000) * (memoryMb / 1024);
  }, 0);

  return {
    arch,
    functionName,
    samples: good.length,
    coldStartsObserved: good.filter((run) => run.response.coldStart).length,
    digests,
    patterns,
    generatorWallMs: {
      p50: percentile(good.map((run) => run.response.generatorWallMs), 50),
      p90: percentile(good.map((run) => run.response.generatorWallMs), 90),
      p95: percentile(good.map((run) => run.response.generatorWallMs), 95),
      p99: percentile(good.map((run) => run.response.generatorWallMs), 99),
    },
    generatorCpuMs: {
      p50: percentile(good.map((run) => run.response.generatorCpuMs), 50),
      p90: percentile(good.map((run) => run.response.generatorCpuMs), 90),
      p95: percentile(good.map((run) => run.response.generatorCpuMs), 95),
      p99: percentile(good.map((run) => run.response.generatorCpuMs), 99),
    },
    lambdaDurationMs: {
      p50: percentile(good.map((run) => run.report.lambdaDurationMs).filter(Number.isFinite), 50),
      p90: percentile(good.map((run) => run.report.lambdaDurationMs).filter(Number.isFinite), 90),
      p95: percentile(good.map((run) => run.report.lambdaDurationMs).filter(Number.isFinite), 95),
      p99: percentile(good.map((run) => run.report.lambdaDurationMs).filter(Number.isFinite), 99),
    },
    initDurationMs: good.map((run) => run.report.initDurationMs).filter(Number.isFinite),
    maxMemoryMb: Math.max(0, ...good.map((run) => run.report.maxMemoryMb).filter(Number.isFinite)),
    billedGbSeconds: Number(billedGbSeconds.toFixed(6)),
  };
}

const dir = mkdtempSync(join(tmpdir(), "optimizer-lambda-bench-"));
try {
  const output = [];
  for (const [arch, functionName] of functions) {
    const runs = [];
    for (let sample = 0; sample < samples; sample++) {
      const outputPath = join(dir, `${arch}-${sample}.json`);
      runs.push(invoke(functionName, outputPath));
    }
    output.push(summarize(arch, functionName, runs));
  }

  if (output.some((entry) => entry.digests.length !== 1 || entry.patterns.length !== 1)) {
    throw new Error(`Nondeterministic Lambda output: ${JSON.stringify(output)}`);
  }
  if (output[0].digests[0] !== output[1].digests[0] || output[0].patterns[0] !== output[1].patterns[0]) {
    throw new Error(`Architecture parity failure: ${JSON.stringify(output)}`);
  }

  console.log(JSON.stringify({ ok: true, fixturePath, samples, results: output }, null, 2));
} finally {
  rmSync(dir, { recursive: true, force: true });
}
