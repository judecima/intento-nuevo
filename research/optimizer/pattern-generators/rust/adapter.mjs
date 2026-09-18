import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { digest } from "../canonical.mjs";
import { createWorkBudget } from "../work-budget.mjs";
import { materializePattern, MATERIALIZER_VERSION } from "../physical-pattern.mjs";
import {
  orderMaterializationRoots,
  orderPatternPool,
  poolHashes,
  MATERIALIZATION_POLICY,
  POOL_ORDERING_POLICY,
} from "../ordering.mjs";

const require = createRequire(import.meta.url);
const addonPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../native/optimizer-pattern-generator/optimizer_pattern_generator.node",
);

export const RUST_GENERATOR_VERSION = "rust-b01-search-v1";

let cachedAddon;
let cachedLoadError;

function loadAddon() {
  if (cachedAddon) return cachedAddon;
  if (cachedLoadError) throw cachedLoadError;
  try {
    cachedAddon = require(addonPath);
    if (typeof cachedAddon?.generateRoots !== "function") {
      throw new TypeError("native addon does not export generateRoots()");
    }
    return cachedAddon;
  } catch (error) {
    cachedLoadError = error;
    throw error;
  }
}

export function isRustPatternGeneratorAvailable() {
  try {
    loadAddon();
    return true;
  } catch {
    return false;
  }
}

function validateRootAxes(rootAxes) {
  if (!Array.isArray(rootAxes) || !rootAxes.length || rootAxes.length > 2) {
    throw new RangeError("rootAxes must contain one or two axes");
  }
  if (new Set(rootAxes).size !== rootAxes.length || rootAxes.some((axis) => axis !== "x" && axis !== "y")) {
    throw new RangeError("invalid rootAxes");
  }
}

export function generatePatternsRust(
  context,
  limits,
  { maxVariantsPerUsageVector, rootAxes = ["x", "y"] } = {},
) {
  if (!Number.isSafeInteger(maxVariantsPerUsageVector) || maxVariantsPerUsageVector < 1) {
    throw new RangeError("positive K required");
  }
  validateRootAxes(rootAxes);

  const addon = loadAddon();
  const native = JSON.parse(
    addon.generateRoots(
      JSON.stringify(context),
      JSON.stringify(limits),
      maxVariantsPerUsageVector,
      JSON.stringify(rootAxes),
    ),
  );

  if (!native || !Array.isArray(native.roots) || !["COMPLETE", "WORK_LIMIT"].includes(native.status)) {
    throw new Error("invalid native generator result");
  }

  const roots = native.roots;
  const nonempty = roots.filter((root) => Array.isArray(root.usageVector) && root.usageVector.some(Boolean));
  const materializationBudget = createWorkBudget({
    maxExpansions: Number.MAX_SAFE_INTEGER,
    maxAndCombinations: Number.MAX_SAFE_INTEGER,
    maxFrontierEntries: Number.MAX_SAFE_INTEGER,
    maxMaterializations: limits.maxMaterializations,
  });

  const patterns = [];
  const failures = [];
  for (const root of orderMaterializationRoots(nonempty, context)) {
    try {
      const result = materializePattern(context, root.cutTree, {
        budget: materializationBudget,
        rootAxis: root.rootAxis,
      });
      if (result.status === "WORK_LIMIT") break;
      patterns.push(result.pattern);
    } catch (error) {
      failures.push({
        root: digest({ usage: root.usageVector, tree: root.cutTree, rootAxis: root.rootAxis }),
        error: String(error?.message ?? error),
      });
    }
  }

  const pool = orderPatternPool(patterns, context);
  const materializationSnapshot = materializationBudget.snapshot();
  const status = failures.length ? "INVALID" : native.status;

  return {
    status,
    searchRestricted: Boolean(native.searchRestricted),
    restrictionReasons: native.restrictionReasons ?? [],
    patterns: pool,
    roots,
    failures,
    telemetry: {
      ...(native.telemetry ?? {}),
      materializations: materializationSnapshot.used.materializations,
      materializationHits: materializationSnapshot.hits.maxMaterializations,
      invalid: failures.length,
      searchComplete: native.status === "COMPLETE",
    },
    ...poolHashes(pool, context),
    rootHash: digest(
      roots.map((root) => ({
        rootAxis: root.rootAxis,
        usage: root.usageVector,
        tree: root.cutTree,
      })),
    ),
    provenance: {
      contextHash: context.contextHash,
      generatorVersion: native.generatorVersion ?? RUST_GENERATOR_VERSION,
      materializerVersion: MATERIALIZER_VERSION,
      budgetHash: digest(limits),
      policyHash: digest({
        maxVariantsPerUsageVector,
        rootAxes,
        coordinatePolicy: native.coordinatePolicy,
        materialization: MATERIALIZATION_POLICY,
        ordering: POOL_ORDERING_POLICY,
        bridge: "napi-json-v1",
      }),
    },
  };
}
