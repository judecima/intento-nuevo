export const GUIDE_ROW_RESIDUAL_BUILDER_VERSION = "guide-row-residual-builder-h2a-v1";
export const GUIDE_ROW_RESIDUAL_BUILDER_STATUS = "research-only-not-wired";

const EPS = 1e-9;

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function boolOrientationLock(line, config) {
  if (line?.canRotate === true) return false;
  if (line?.canRotate === false) return true;
  return Boolean(config?.materialConVeta && line?.veta);
}

export function feasibleOrientations(line, config = {}) {
  const base = num(line?.base), altura = num(line?.altura);
  if (!(base > 0 && altura > 0)) throw new RangeError("guide-row: invalid piece dimensions");
  const out = [{ base, altura, rotated: false }];
  if (!boolOrientationLock(line, config) && Math.abs(base - altura) > EPS) {
    out.push({ base: altura, altura: base, rotated: true });
  }
  return out;
}

function effectKey(orientations) {
  return orientations
    .map((o) => o.base.toFixed(3) + "x" + o.altura.toFixed(3))
    .sort()
    .join("/");
}

function usefulBoardSize(config) {
  const width = num(config?.placaBase) - num(config?.refiladoX);
  const height = num(config?.placaAltura) - num(config?.refiladoY);
  if (!(width > 0 && height > 0)) throw new RangeError("guide-row: invalid useful board size");
  return { width, height };
}

function maxNaturalRepeat(quantity, width, pieceWidth, kerf) {
  const fit = Math.floor((width + kerf + EPS) / (pieceWidth + kerf));
  return Math.max(0, Math.min(quantity, fit));
}

/**
 * H2a structural kernel.
 *
 * It enumerates guide-row residual states and filters physically impossible
 * continuations before any expensive construction call. Equal residual-effect
 * families are grouped, but every logical type remains in members: this module
 * does not merge demand and is intentionally not wired into production.
 */
export function enumerateGuideResidualStates(lines, config = {}) {
  if (!Array.isArray(lines) || lines.length === 0) {
    return {
      states: [],
      telemetry: {
        version: GUIDE_ROW_RESIDUAL_BUILDER_VERSION,
        rawStates: 0,
        naturalStates: 0,
        successorChecks: 0,
        feasibleSuccessorFamilies: 0,
        rejectedByGeometry: 0,
        effectClasses: 0,
      },
    };
  }

  const { width, height } = usefulBoardSize(config);
  const kerf = num(config?.sierra, 4.5);
  const ors = lines.map((line) => feasibleOrientations(line, config));
  const states = [];
  let successorChecks = 0;
  let feasibleSuccessorFamilies = 0;
  let effectClasses = 0;
  let naturalStates = 0;

  for (let guideType = 0; guideType < lines.length; guideType++) {
    const guide = lines[guideType];
    const quantity = Math.max(0, Math.trunc(num(guide?.cant)));
    if (!quantity) continue;

    for (const guideOrientation of ors[guideType]) {
      if (guideOrientation.base > width + EPS || guideOrientation.altura > height + EPS) continue;
      const maxRepeat = maxNaturalRepeat(quantity, width, guideOrientation.base, kerf);
      if (!maxRepeat) continue;

      for (let repeat = 1; repeat <= maxRepeat; repeat++) {
        const usedWidth = repeat * guideOrientation.base + Math.max(0, repeat - 1) * kerf;
        const residualWidth = width - usedWidth;
        const grouped = new Map();
        let feasibleFamilies = 0;

        for (let successorType = 0; successorType < lines.length; successorType++) {
          const remaining =
            Math.max(0, Math.trunc(num(lines[successorType]?.cant))) -
            (successorType === guideType ? repeat : 0);
          if (remaining <= 0) continue;

          successorChecks++;
          const fitting = ors[successorType].filter(
            (o) => o.altura <= guideOrientation.altura + EPS && o.base + kerf <= residualWidth + EPS,
          );
          if (!fitting.length) continue;

          feasibleFamilies++;
          feasibleSuccessorFamilies++;
          const key = effectKey(fitting);
          const current = grouped.get(key) ?? { key, orientations: fitting, members: [] };
          current.members.push({ type: successorType, remaining });
          grouped.set(key, current);
        }

        const classes = [...grouped.values()];
        effectClasses += classes.length;
        const natural = repeat === maxRepeat;
        if (natural) naturalStates++;

        states.push({
          guideType,
          guideOrientation,
          repeat,
          maxNaturalRepeat: maxRepeat,
          natural,
          usedWidth,
          residual: { width: residualWidth, height: guideOrientation.altura },
          feasibleFamilies,
          effectClasses: classes,
        });
      }
    }
  }

  return {
    states,
    telemetry: {
      version: GUIDE_ROW_RESIDUAL_BUILDER_VERSION,
      rawStates: states.length,
      naturalStates,
      successorChecks,
      feasibleSuccessorFamilies,
      rejectedByGeometry: successorChecks - feasibleSuccessorFamilies,
      effectClasses,
    },
  };
}

export function prioritizeResidualStates(states) {
  return [...states].sort(
    (a, b) =>
      Number(b.natural) - Number(a.natural) ||
      b.repeat - a.repeat ||
      a.effectClasses.length - b.effectClasses.length ||
      b.residual.width - a.residual.width ||
      a.guideType - b.guideType ||
      Number(a.guideOrientation.rotated) - Number(b.guideOrientation.rotated),
  );
}
