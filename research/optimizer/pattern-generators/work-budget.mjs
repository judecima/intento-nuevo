// Experimental accounting only. No optimizer import and no clock-based decisions.
export const BUDGET_KEYS = Object.freeze([
  "maxExpansions", "maxAndCombinations", "maxFrontierEntries", "maxMaterializations",
]);

export function validateBudget(budget) {
  if (!budget || typeof budget !== "object" || Array.isArray(budget)) {
    throw new TypeError("budget must be an object");
  }
  if (Object.keys(budget).length !== BUDGET_KEYS.length || BUDGET_KEYS.some((key) => !Object.hasOwn(budget, key))) {
    throw new TypeError("budget must contain exactly the four versioned work limits");
  }
  for (const key of BUDGET_KEYS) {
    if (!Number.isSafeInteger(budget[key]) || budget[key] <= 0) {
      throw new RangeError(`${key} must be a positive safe integer`);
    }
  }
  return Object.freeze({ ...budget });
}

export function createWorkBudget(budget) {
  const limits = validateBudget(budget);
  const used = { expansions: 0, andCombinations: 0, materializations: 0 };
  const hits = { maxExpansions: 0, maxAndCombinations: 0, maxFrontierEntries: 0, maxMaterializations: 0 };
  let frontierLive = 0;
  let frontierPeak = 0;
  let frontierInserted = 0;
  let replaced = 0;
  let searchStopReason = null;
  let materializationStopped = false;

  function admit(counter, limitKey, search) {
    if (search ? searchStopReason !== null : materializationStopped) return false;
    if (used[counter] >= limits[limitKey]) {
      hits[limitKey]++;
      if (search) searchStopReason = limitKey;
      else {
        materializationStopped = true;
        searchStopReason ??= limitKey;
      }
      return false;
    }
    used[counter]++;
    return true;
  }

  return Object.freeze({
    // Call before the work, including work that subsequently fails validation.
    tryExpand: () => admit("expansions", "maxExpansions", true),
    tryCombine: () => admit("andCombinations", "maxAndCombinations", true),
    // Finalization may materialize already retained roots after search stops.
    tryMaterialize: () => admit("materializations", "maxMaterializations", false),
    tryReserveFrontier() {
      if (searchStopReason !== null) return false;
      if (frontierLive >= limits.maxFrontierEntries) {
        hits.maxFrontierEntries++;
        searchStopReason = "maxFrontierEntries";
        return false;
      }
      frontierLive++;
      frontierInserted++;
      frontierPeak = Math.max(frontierPeak, frontierLive);
      return true;
    },
    releaseFrontier(count = 1) {
      if (!Number.isSafeInteger(count) || count <= 0 || count > frontierLive) {
        throw new RangeError("frontier release must refer to live entries");
      }
      frontierLive -= count;
    },
    replaceFrontierEntry() {
      if (searchStopReason !== null) return false;
      if (frontierLive === 0) throw new RangeError("replacement requires a live frontier entry");
      // The caller atomically swaps one owned slot; tree references are its responsibility.
      frontierInserted++;
      replaced++;
      return true;
    },
    snapshot() {
      return {
        limits: { ...limits }, used: { ...used }, hits: { ...hits },
        frontierLive, frontierPeak, frontierInserted, replaced,
        searchStopReason, materializationStopped,
      };
    },
  });
}
