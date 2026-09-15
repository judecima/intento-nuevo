export const P13_SAAS_ROUTING_POLICY = Object.freeze({
  // Fast remains interactive in the measured Project+Order corpus through ~350 pieces.
  fastSyncMaxPieceQty: 350,

  // Rescue28/P13 subset generation is only validated as a bounded deep-rescue tier
  // for small/medium inputs. Large inputs need a separate background strategy.
  deepRescueMaxPieceQty: 160,

  maxGap: 1,
  maxPieceQty: 50,
  maxLogicalPieceTypes: 20,
  syncBudgetMs: 1500,
});

export function routeBeforeFast(
  { pieceQty } = {},
  policy = P13_SAAS_ROUTING_POLICY,
) {
  if (!Number.isFinite(pieceQty) || pieceQty < 0) return 'BACKGROUND_FAST';
  return pieceQty <= policy.fastSyncMaxPieceQty ? 'SYNC_FAST' : 'BACKGROUND_FAST';
}

export function shouldRunP13Synchronously(
  { fastBoards, lowerBound, pieceQty, logicalPieceTypes },
  policy = P13_SAAS_ROUTING_POLICY,
) {
  if (![fastBoards, lowerBound, pieceQty, logicalPieceTypes].every(Number.isFinite)) return false;
  const gap = fastBoards - lowerBound;
  if (gap <= 0) return false;
  return (
    gap <= policy.maxGap &&
    pieceQty <= policy.maxPieceQty &&
    logicalPieceTypes <= policy.maxLogicalPieceTypes
  );
}

function backgroundRoute(metrics, policy) {
  return Number.isFinite(metrics?.pieceQty) && metrics.pieceQty <= policy.deepRescueMaxPieceQty
    ? 'BACKGROUND_RESCUE28'
    : 'BACKGROUND_LARGE_CASE';
}

export function routeAfterFast(metrics, policy = P13_SAAS_ROUTING_POLICY) {
  if (!metrics || !Number.isFinite(metrics.fastBoards) || !Number.isFinite(metrics.lowerBound)) {
    return backgroundRoute(metrics, policy);
  }
  if (metrics.fastBoards <= metrics.lowerBound) return 'DONE_FAST_CERTIFIED';
  return shouldRunP13Synchronously(metrics, policy)
    ? 'SYNC_P13'
    : backgroundRoute(metrics, policy);
}

export function routeAfterP13(metrics, policy = P13_SAAS_ROUTING_POLICY) {
  if (!metrics || !Number.isFinite(metrics.p13Boards) || !Number.isFinite(metrics.lowerBound)) {
    return backgroundRoute(metrics, policy);
  }
  if (metrics.p13Boards <= metrics.lowerBound) return 'DONE_P13_CERTIFIED';
  return backgroundRoute(metrics, policy);
}
