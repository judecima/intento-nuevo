import { readFile } from "node:fs/promises";

const [x64Path, arm64Path] = process.argv.slice(2);
if (!x64Path || !arm64Path) {
  throw new Error("Usage: full-parity-gate.mjs <x64.json> <arm64.json>");
}

const x64 = JSON.parse(await readFile(x64Path, "utf8"));
const arm64 = JSON.parse(await readFile(arm64Path, "utf8"));
if (!x64.ok || !arm64.ok) throw new Error("Architecture gate input is not green");

const left = new Map(x64.results.map((entry) => [String(entry.order), entry]));
const right = new Map(arm64.results.map((entry) => [String(entry.order), entry]));
if (left.size !== right.size) throw new Error("Architecture fixture count mismatch");

for (const [order, a] of left) {
  const b = right.get(order);
  if (!b) throw new Error(`Missing arm64 result for ${order}`);
  const checks = ["plates", "valid", "algorithmVersion", "resultDigest"];
  for (const key of checks) {
    if (a[key] !== b[key]) throw new Error(`Architecture parity failure ${order} field=${key}: ${a[key]} != ${b[key]}`);
  }
  if (JSON.stringify(a.remnant) !== JSON.stringify(b.remnant)) {
    throw new Error(`Architecture remnant parity failure ${order}`);
  }
  if (!a.rustExecuted || !b.rustExecuted || a.cacheHit || b.cacheHit) {
    throw new Error(`Architecture certification invariant failure ${order}`);
  }
}

console.log(JSON.stringify({
  ok: true,
  x64ImageSizeBytes: x64.imageSizeBytes,
  arm64ImageSizeBytes: arm64.imageSizeBytes,
  results: [...left.keys()].map((order) => ({
    order,
    plates: left.get(order).plates,
    digest: left.get(order).resultDigest,
    valid: left.get(order).valid,
  })),
}, null, 2));
