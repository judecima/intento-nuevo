import { performance } from "node:perf_hooks";

const moduleStartedAt = performance.now();
const full = await import("./src/lib/optimizer/engine/full-optimize-handler.mjs");
const moduleInitMs = performance.now() - moduleStartedAt;

export async function handler(event) {
  return full.handler(event, { moduleInitMs });
}
