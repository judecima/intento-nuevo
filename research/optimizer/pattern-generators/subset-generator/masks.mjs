export const LEGACY_MASK_POLICY = Object.freeze({
  seed: 7,
  threshold: 0.45,
  rounds: 40,
});

export function buildLegacyMasks(typeCount, {
  rounds = LEGACY_MASK_POLICY.rounds,
  seed = LEGACY_MASK_POLICY.seed,
  threshold = LEGACY_MASK_POLICY.threshold,
} = {}) {
  if (!Number.isInteger(typeCount) || typeCount <= 0) throw new TypeError("typeCount must be a positive integer");
  if (!Number.isInteger(rounds) || rounds <= 0) throw new TypeError("rounds must be a positive integer");

  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;
    return (state & 0x7fffffff) / 0x7fffffff;
  };

  const all = Array.from({ length: typeCount }, (_, index) => index);
  const masks = [];
  for (let round = 0; round < rounds; round++) {
    masks.push(round === 0 ? all.slice() : all.filter(() => random() > threshold));
  }
  return masks;
}

export function jaccardDistance(a, b) {
  const aa = a instanceof Set ? a : new Set(a);
  const bb = b instanceof Set ? b : new Set(b);
  let intersection = 0;
  for (const value of aa) if (bb.has(value)) intersection++;
  const union = aa.size + bb.size - intersection;
  return union === 0 ? 0 : 1 - intersection / union;
}

/**
 * Deterministic farthest-first ordering over the exact Legacy masks.
 * Round 0 (full order) is the anchor. Each next mask maximizes its minimum
 * Jaccard distance to the masks already retained. Ties prefer the lower round.
 */
export function rankMasksByDiversity(masks) {
  if (!Array.isArray(masks) || masks.length === 0) return [];
  const selected = [0];
  const remaining = new Set(Array.from({ length: masks.length - 1 }, (_, i) => i + 1));

  while (remaining.size) {
    let bestRound = -1;
    let bestDistance = -Infinity;
    for (const round of remaining) {
      let minDistance = Infinity;
      for (const prior of selected) {
        minDistance = Math.min(minDistance, jaccardDistance(masks[round], masks[prior]));
      }
      if (
        minDistance > bestDistance + 1e-12 ||
        (Math.abs(minDistance - bestDistance) <= 1e-12 && (bestRound < 0 || round < bestRound))
      ) {
        bestRound = round;
        bestDistance = minDistance;
      }
    }
    selected.push(bestRound);
    remaining.delete(bestRound);
  }

  return selected;
}

export function selectDiverseMaskRounds(typeCount, count, options = {}) {
  const masks = buildLegacyMasks(typeCount, options);
  const order = rankMasksByDiversity(masks);
  return order.slice(0, Math.max(0, Math.min(count, order.length)));
}
