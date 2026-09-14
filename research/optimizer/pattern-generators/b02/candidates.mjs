export function createCandidateIndex(context, admit) {
  const exact = new Map(), byWidth = new Map(), byHeight = new Map(), orientations = [];
  const append = (map, key, value) => { if (!map.has(key)) map.set(key, []); map.get(key).push(value); };
  for (const type of context.types) for (const orientation of type.orientations) {
    if (!admit("indexOrientation", "shared", "shared")) return null;
    const entry = { type, orientation }; orientations.push(entry);
    append(exact, `${orientation.width}/${orientation.height}`, entry);
    append(byWidth, orientation.width, entry); append(byHeight, orientation.height, entry);
  }
  const terminalCache = new Map();
  return {
    orientations,
    exact: (state) => exact.get(`${state.width}/${state.height}`) ?? [],
    terminal(state) {
      const parentAxis = state.axis === "x" ? "y" : "x";
      const key = `${state.width}/${state.height}/${parentAxis}`;
      if (!terminalCache.has(key)) {
        const candidates = parentAxis === "x" ? byWidth.get(state.width) : byHeight.get(state.height);
        terminalCache.set(key, (candidates ?? []).filter(({ orientation: o }) =>
          parentAxis === "x" ? o.height < state.height : o.width < state.width));
      }
      return terminalCache.get(key);
    },
  };
}

// Same piece-multiples/complements and linear merge as cutCoordinates. Every
// stream setup and duplicate proposal is an individually suspendable operation.
export function coordinateCursor(context, state, orientations, telemetry) {
  const span = BigInt(state.axis === "x" ? state.width : state.height), kerf = BigInt(context.kerf);
  const streams = [];
  let source = 0, last = null;
  return {
    get kind() { return source < orientations.length ? "coordinateStream" : streams.length ? "coordinateProposal" : null; },
    step() {
      if (source < orientations.length) {
        const { type, orientation } = orientations[source++]; telemetry.coordinateStreams++;
        const d = BigInt(state.axis === "x" ? orientation.width : orientation.height), step = d + kerf, q = BigInt(type.quantity);
        const direct = (span + kerf) / step < q ? (span + kerf) / step : q;
        const complement = (span - 1n) / step < q ? (span - 1n) / step : q;
        if (direct > 0n) streams.push({ value: d, step, left: direct });
        if (complement > 0n) streams.push({ value: span - complement * step, step, left: complement });
        return null;
      }
      telemetry.coordinateProposals++;
      let index = 0;
      for (let i = 1; i < streams.length; i++) if (streams[i].value > streams[index].value) index = i;
      const stream = streams[index], value = Number(stream.value);
      if (--stream.left === 0n) streams.splice(index, 1); else stream.value += stream.step;
      if (value === last) { telemetry.duplicateCoordinates++; return null; }
      last = value; return value;
    },
  };
}
