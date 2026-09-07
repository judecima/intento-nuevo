import { build } from "esbuild";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";

const script = fileURLToPath(import.meta.url);
const repo = resolve(dirname(script), "..");
const temp = mkdtempSync(join(tmpdir(), "optimizer-worker-smoke-"));
const directBundle = join(temp, "optimizer-direct.mjs");
const workerBundle = join(temp, "optimizer-worker.mjs");
const legacyEngineUrl = pathToFileURL(join(repo, "src/lib/optimizer/engine/legacy-engine.ts")).href;

const input = {
  projectId: "worker-smoke",
  projectVersion: 1,
  strategy: "baseline",
  board: {
    width: 1200,
    height: 800,
    thickness: 18
  },
  material: {
    description: "MDF WORKER SMOKE 18MM",
    hasGrain: false,
    thickness: 18
  },
  kerf: 5,
  trim: {
    x: 0,
    y: 0
  },
  constraints: {
    profile: "fast",
    minRemnant: 100,
    minCommercialRemnantLongSide: 250,
    allowOneBoard: false,
    allowPatternMaster: false,
    allowMultiSlice: false,
    allowDeadStripCompaction: false
  },
  pieces: [
    {
      reference: "A",
      description: "Anchor candidate",
      quantity: 1,
      width: 622,
      height: 120
    },
    {
      reference: "B",
      description: "Real slice content",
      quantity: 2,
      width: 578,
      height: 300
    },
    {
      reference: "C",
      description: "Fillers",
      quantity: 2,
      width: 280,
      height: 250
    }
  ]
};

try {
  for (const [entryPoint, outfile] of [
    [join(repo, "src/lib/optimizer/index.ts"), directBundle],
    [join(repo, "src/lib/optimizations/optimization-worker.ts"), workerBundle]
  ]) {
    await build({
      entryPoints: [entryPoint],
      bundle: true,
      platform: "node",
      format: "esm",
      target: "node22",
      outfile,
      logLevel: "warning",
      define: {
        "import.meta.url": JSON.stringify(legacyEngineUrl)
      }
    });
  }

  const optimizer = await import(pathToFileURL(directBundle).href);
  const directStartedAt = performance.now();
  const direct = optimizer.optimizeProject(input);
  const directWallMs = performance.now() - directStartedAt;

  const workerStartedAt = performance.now();
  const workerMessage = await runWorker(workerBundle, input);
  const workerWallMs = performance.now() - workerStartedAt;
  if (!workerMessage.ok) {
    throw new Error(`${workerMessage.error.name}: ${workerMessage.error.message}`);
  }
  const threaded = workerMessage.result;

  const directIdentity = identity(direct);
  const workerIdentity = identity(threaded);
  const failures = [];

  if (!direct.validation.ok) failures.push("direct:invalid");
  if (!threaded.validation.ok) failures.push("worker:invalid");
  if (direct.metrics.boardCount !== threaded.metrics.boardCount) failures.push("boardCount");
  if (directIdentity.geometryHash !== workerIdentity.geometryHash) failures.push("geometryHash");
  if (directIdentity.traceHash !== workerIdentity.traceHash) failures.push("traceHash");
  if (directIdentity.fullPlanHash !== workerIdentity.fullPlanHash) failures.push("fullPlanHash");

  const report = {
    status: failures.length === 0 ? "PASS" : "FAIL",
    failures,
    boardCount: direct.metrics.boardCount,
    pieces: direct.placements.length,
    validation: {
      direct: direct.validation.ok,
      worker: threaded.validation.ok
    },
    geometryHash: directIdentity.geometryHash,
    traceHash: directIdentity.traceHash,
    fullPlanHash: directIdentity.fullPlanHash,
    directWallMs,
    workerWallMs,
    workerEngineMs: workerMessage.engineMs,
    workerTransportOverheadMs: Math.max(0, workerWallMs - workerMessage.engineMs)
  };

  console.log(JSON.stringify(report, null, 2));
  if (failures.length > 0) process.exitCode = 1;
} finally {
  rmSync(temp, { recursive: true, force: true });
}

function runWorker(bundle, workerInput) {
  return new Promise((resolvePromise, rejectPromise) => {
    const worker = new Worker(pathToFileURL(bundle));
    const timeout = setTimeout(() => {
      void worker.terminate();
      rejectPromise(new Error("OPTIMIZER_WORKER_SMOKE_TIMEOUT"));
    }, 60_000);

    worker.once("error", (error) => {
      clearTimeout(timeout);
      rejectPromise(error);
    });
    worker.once("exit", (code) => {
      if (code !== 0) {
        clearTimeout(timeout);
        rejectPromise(new Error(`OPTIMIZER_WORKER_SMOKE_EXIT:${code}`));
      }
    });
    worker.once("message", (message) => {
      clearTimeout(timeout);
      resolvePromise(message);
      void worker.terminate();
    });

    worker.postMessage({ id: "worker-smoke", input: workerInput });
  });
}

function identity(result) {
  const { engineMs, cacheHit, ...quality } = result.metrics;
  const geometry = geometryOnly({
    boards: result.boards,
    placements: result.placements,
    cuts: result.cuts,
    remnants: result.remnants,
    trees: result.raw.placas.map((board) => board.arbol)
  });
  const traces = result.placements.map((placement) => placement.trace);
  const fullPlan = { geometry, traces, quality };

  return {
    geometryHash: hash(geometry),
    traceHash: hash(traces),
    fullPlanHash: hash(fullPlan)
  };
}

function geometryOnly(value) {
  if (Array.isArray(value)) return value.map(geometryOnly);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !["trace", "_diagLink", "_diagPath"].includes(key))
        .map(([key, child]) => [key, geometryOnly(child)])
    );
  }
  return value;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function hash(value) {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}
