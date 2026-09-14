export const CUT_POLICY_VERSION = "b0-physical-slices-v1";
export const COORDINATE_POLICY = "piece-multiples-v1";
export function oppositeAxis(axis) {
  if (axis !== "x" && axis !== "y") throw new TypeError("axis must be x or y");
  return axis === "x" ? "y" : "x";
}

export function partitionSlice(region, size, kerf, hasNext) {
  const total = region.axis === "x" ? region.w : region.h;
  if (![size, kerf, region.w, region.h].every(Number.isSafeInteger) || size <= 0 || kerf < 0 || size > total) throw new RangeError("invalid slice thickness");
  const cut = size < total;
  const consumed = cut ? Math.min(total, size + kerf) : size;
  const remaining = total - consumed;
  if (hasNext && remaining <= 0) throw new RangeError("sibling does not fit after kerf");
  const block = { ...region, w: region.axis === "x" ? size : region.w, h: region.axis === "y" ? size : region.h };
  const tail = region.axis === "x"
    ? { ...region, x: region.x + consumed, w: remaining }
    : { ...region, y: region.y + consumed, h: remaining };
  return { block, tail, cut };
}

export function assertSliceStage(axis, expectedAxis, level, maxStages) {
  oppositeAxis(axis);
  if (axis !== expectedAxis) throw new Error("child slice must alternate axis");
  if (level > maxStages) throw new Error("search stage limit exceeded");
}

export function assertTerminalStage(level, maxStages) {
  if (level !== maxStages) throw new Error("terminal closure is only allowed at the search stage limit");
}

/** Lazy sorted merge of direct multiples and complements. Stream setup and
 * EVERY proposal (including duplicates) require an expansion admission.
 * Memory is proportional to type/orientation count, never multiplicities.
 */
export function* cutCoordinates(context, state, work, telemetry) {
  const span = BigInt(state.axis === "x" ? state.width : state.height), kerf = BigInt(context.kerf);
  const streams = [];
  for (const type of context.types) for (const orientation of type.orientations) {
    if (!work.tryExpand()) return;
    telemetry.coordinateStreams++;
    const dimension = BigInt(state.axis === "x" ? orientation.width : orientation.height);
    const step = dimension + kerf, demand = BigInt(type.quantity);
    const directMax = (span + kerf) / step < demand ? (span + kerf) / step : demand;
    const complementMax = (span - 1n) / step < demand ? (span - 1n) / step : demand;
    if (directMax > 0n) streams.push({ value: dimension, step, left: directMax });
    if (complementMax > 0n) streams.push({ value: span - complementMax * step, step, left: complementMax });
  }
  let last = null;
  while (streams.length) {
    if (!work.tryExpand()) return;
    telemetry.coordinateProposals++;
    let index = 0;
    for (let i = 1; i < streams.length; i++) if (streams[i].value < streams[index].value) index = i;
    const stream = streams[index], value = Number(stream.value);
    if (--stream.left === 0n) streams.splice(index, 1);
    else stream.value += stream.step;
    if (value === last) { telemetry.duplicateCoordinates++; continue; }
    last = value;
    yield value;
  }
}
