import { readFile } from "node:fs/promises";

const fixture = JSON.parse(
  await readFile(new URL("./fixtures/4057401.json", import.meta.url), "utf8"),
);
const { handler } = await import("./handler.cjs");
const result = await handler(fixture);

if (!result?.ok) throw new Error(`Lambda POC smoke failed: ${JSON.stringify(result)}`);
if (result.requestId !== "4057401") throw new Error("Unexpected request id");
if (!(result.patterns > 0)) throw new Error("Pattern Master returned an empty pool");
if (!/^[a-f0-9]{64}$/.test(result.digest)) throw new Error("Missing deterministic digest");
if (!Number.isFinite(result.generatorWallMs) || result.generatorWallMs <= 0) {
  throw new Error("Missing generator wall timing");
}
if (!Number.isFinite(result.generatorCpuMs) || result.generatorCpuMs <= 0) {
  throw new Error("Missing generator CPU timing");
}

console.log(JSON.stringify(result));
