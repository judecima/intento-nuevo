import { readFile, writeFile } from "node:fs/promises";

const [domainPath, outputPath, ...fixturePaths] = process.argv.slice(2);
if (!domainPath || !outputPath || fixturePaths.length === 0) {
  throw new Error("Usage: full-rie-gate.mjs <domain.json> <output.json> <fixture...>");
}

const endpoint = process.env.FULL_OPTIMIZE_RIE_URL || "http://localhost:9000/2015-03-31/functions/function/invocations";
const repeats = Math.max(2, Number(process.env.FULL_OPTIMIZE_RIE_REPEATS || 3));
const expectedArch = process.env.FULL_OPTIMIZE_EXPECTED_ARCH || null;
const imageSizeBytes = Number(process.env.FULL_OPTIMIZE_IMAGE_SIZE_BYTES || 0) || null;
const expectedBoards = new Map([
  ["4050594", 7],
  ["4056900", 6],
  ["4057401", 4],
  ["4059200", 17],
]);

const domain = JSON.parse(await readFile(domainPath, "utf8"));
const domainByOrder = new Map(domain.results.map((entry) => [String(entry.order), entry]));
const results = [];

function orderFromFixture(fixturePath, payload) {
  if (payload.projectId) return String(payload.projectId);
  const match = /(?:^|[/\\])(\d{7})(?:\.json)?$/.exec(fixturePath);
  if (!match) throw new Error(`CANNOT_RESOLVE_ORDER:${fixturePath}`);
  return match[1];
}

async function invoke(payload) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`RIE returned non-JSON (${response.status}): ${text.slice(0, 1000)}`);
  }
  if (!response.ok || !parsed?.ok) {
    throw new Error(`RIE invocation failed (${response.status}): ${JSON.stringify(parsed)}`);
  }
  return parsed;
}

function assertStrict(entry, label) {
  const failures = [];
  if (entry.cacheHit !== false) failures.push("cacheHit");
  if (entry.cacheBypassed !== true) failures.push("cacheBypassed");
  if (entry.rustRequested !== true) failures.push("rustRequested");
  if (entry.rustExecuted !== true) failures.push("rustExecuted");
  if (entry.rustSucceeded !== true) failures.push("rustSucceeded");
  if (entry.rustFallback !== false) failures.push("rustFallback");
  if (entry.rustMasterSwallowedError !== false) failures.push("rustMasterSwallowedError");
  if (entry.patternGeneratorUsed !== "rust") failures.push("patternGeneratorUsed");
  if (entry.valid !== true) failures.push("valid");
  if (failures.length) throw new Error(`${label} strict invariant failed: ${failures.join(",")}`);
}

for (const fixturePath of fixturePaths) {
  const payload = JSON.parse(await readFile(fixturePath, "utf8"));
  const order = orderFromFixture(fixturePath, payload);
  const reference = domainByOrder.get(order);
  if (!reference) throw new Error(`Missing domain reference for ${order}`);
  assertStrict(reference, `domain ${order}`);

  const expected = expectedBoards.get(order);
  if (expected != null && reference.plates !== expected) {
    throw new Error(`Historical winner regression in domain ${order}: ${reference.plates} != ${expected}`);
  }

  const runs = [];
  for (let run = 0; run < repeats; run++) {
    const response = await invoke(payload);
    assertStrict(response, `RIE ${order} run ${run + 1}`);
    if (expectedArch && response.architecture !== expectedArch) {
      throw new Error(`Architecture mismatch for ${order}: ${response.architecture} != ${expectedArch}`);
    }
    if (response.plates !== reference.plates) {
      throw new Error(`Plate parity failure ${order}: RIE=${response.plates} domain=${reference.plates}`);
    }
    if (response.algorithmVersion !== reference.algorithmVersion) {
      throw new Error(`Algorithm version mismatch ${order}`);
    }
    if (response.resultDigest !== reference.resultDigest) {
      throw new Error(`Result digest mismatch ${order}: RIE=${response.resultDigest} domain=${reference.resultDigest}`);
    }
    if (JSON.stringify(response.remnant) !== JSON.stringify(reference.remnant)) {
      throw new Error(`Remnant parity failure ${order}`);
    }
    runs.push(response);
  }

  const digests = [...new Set(runs.map((run) => run.resultDigest))];
  if (digests.length !== 1) throw new Error(`Nondeterministic RIE output for ${order}: ${digests.join(",")}`);

  results.push({
    order,
    plates: reference.plates,
    valid: reference.valid,
    algorithmVersion: reference.algorithmVersion,
    resultDigest: reference.resultDigest,
    remnant: reference.remnant,
    rustExecuted: true,
    cacheHit: false,
    deterministicRuns: repeats,
    architecture: runs[0].architecture,
    domain: {
      plates: reference.plates,
      resultDigest: reference.resultDigest,
    },
    rie: runs.map((run) => ({
      resultDigest: run.resultDigest,
      domainWallMs: run.domainWallMs,
      domainCpuMs: run.domainCpuMs,
      moduleInitMs: run.moduleInitMs,
      coldStart: run.coldStart,
      rssAfterMb: run.rssAfterMb,
      maxRssMb: run.maxRssMb,
    })),
  });
}

const output = {
  ok: true,
  architecture: expectedArch ?? results[0]?.architecture ?? null,
  imageSizeBytes,
  repeats,
  results,
};
await writeFile(outputPath, JSON.stringify(output, null, 2) + "\n");
console.log(JSON.stringify(output, null, 2));
