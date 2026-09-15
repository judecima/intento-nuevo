export const DIRECTED_GENERATION_POLICY = Object.freeze({
  areaFillLow: 0.9316830039024353,
  largeQtyHigh: 0.2886905074119568,
  fewTypesMax: 4.5,
  largeTypeLow: 0.4833334982395172,
  avgQtyMax: 10.699999809265137,
  areaFillVeryHigh: 0.9614295065402985,
  totalAreaVeryHigh: 0.9837400019168854,
});

export function shouldAttemptSynchronousDirectedP13(features, policy = DIRECTED_GENERATION_POLICY) {
  if (!features) return false;
  const { areaFillVsLB, largeQtyRatio, pieceTypes, largeTypeRatio, avgQtyPerType, totalAreaRatio } = features;
  if (![areaFillVsLB, largeQtyRatio, pieceTypes, largeTypeRatio, avgQtyPerType, totalAreaRatio].every(Number.isFinite)) return false;
  if (areaFillVsLB <= policy.areaFillLow && largeQtyRatio > policy.largeQtyHigh && pieceTypes <= policy.fewTypesMax) return false;
  if (areaFillVsLB <= policy.areaFillLow && largeQtyRatio > policy.largeQtyHigh && pieceTypes > policy.fewTypesMax && largeTypeRatio <= policy.largeTypeLow) return false;
  if (areaFillVsLB > policy.areaFillLow && avgQtyPerType <= policy.avgQtyMax && areaFillVsLB > policy.areaFillVeryHigh && totalAreaRatio > policy.totalAreaVeryHigh) return false;
  return true;
}
