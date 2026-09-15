export const P13_SAAS_ROUTING_POLICY = Object.freeze({
  maxGap: 1,
  maxPieceQty: 50,
  maxLogicalPieceTypes: 20,
  syncBudgetMs: 1500,
});

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

export function routeAfterFast(metrics, policy = P13_SAAS_ROUTING_POLICY) {
  if (!metrics || !Number.isFinite(metrics.fastBoards) || !Number.isFinite(metrics.lowerBound)) {
    return 'BACKGROUND_RESCUE28';
  }
  if (metrics.fastBoards <= metrics.lowerBound) return 'DONE_FAST_CERTIFIED';
  return shouldRunP13Synchronously(metrics, policy)
    ? 'SYNC_P13'
    : 'BACKGROUND_RESCUE28';
}
