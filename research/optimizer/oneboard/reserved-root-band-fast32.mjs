import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(new URL("../../../", import.meta.url).pathname);
const M = require(path.join(ROOT, "src/lib/optimizer/legacy/motor.cjs"));
const { validarPlanIndustrial } = require(path.join(ROOT, "src/lib/optimizer/legacy/v10.cjs"));

export const RESERVED_ROOT_BAND_FAST32_VERSION =
  "oneboard-reserved-root-band-fast32-research-20260922";

export const RESERVED_ROOT_BAND_FAST32_LIMITS = Object.freeze({
  maxRootBands: 30,
  maxSiblingChecks: 32,
});

const CRITERIA = ["perp", "exacta", "area", "largo"];
const ORDERS = [
  (a, b) => b.base * b.altura - a.base * a.altura,
  (a, b) => Math.max(b.base, b.altura) - Math.max(a.base, a.altura),
  (a, b) => b.altura - a.altura || b.base - a.base,
  (a, b) => b.base - a.base || b.altura - a.altura,
  (a, b) => a.base * a.altura - b.base * b.altura,
  (a, b) => Math.min(a.base, a.altura) - Math.min(b.base, b.altura),
];

function makePieces(lines, opts) {
  const pieces = [];
  let id = 0;
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    for (let k = 0; k < Number(line.cant || 0); k++) {
      pieces.push({
        id: id++,
        base: +line.base,
        altura: +line.altura,
        detalle: line.detalle || "",
        veta: Boolean(line.veta),
        cantos: line.cantos || null,
        ref: line.ref ?? li,
        _codigoXml: String(line.ref ?? li),
      });
    }
  }

  const signatures = new Map();
  for (const piece of pieces) {
    piece._corte = M.medidaCorte(piece, opts);
    piece._ors = M.orientaciones(piece, Boolean(opts.materialConVeta));
    const key =
      piece._corte.base +
      "|" +
      piece._corte.altura +
      "|" +
      (piece.veta ? 1 : 0);
    if (!signatures.has(key)) signatures.set(key, signatures.size);
    piece._sig = signatures.get(key);
  }

  return { pieces, nSigs: signatures.size };
}

function regionOpts(base, width, height, dir, c1, c2, multi, nSigs) {
  return {
    ...base,
    placaBase: width,
    placaAltura: height,
    anchoUtil: width,
    altoUtil: height,
    etapas: 3,
    criterios: [c1, c2],
    criterio: c1,
    dirInicial: dir,
    ruido: 0,
    multiRebanada: multi,
    _vistas: new Set(),
    _cuenta: new Map(),
    _reps: [],
    _medidas: [],
    _nSigs: nSigs,
    _cache: null,
    _stats: { hits: 0, fallos: 0 },
  };
}

function exactDemandOk(plan, lines) {
  const expected = new Map(
    lines.map((line, index) => [
      String(line.ref ?? index),
      Number(line.cant || 0),
    ]),
  );
  const actual = new Map();

  for (const board of plan?.placas || []) {
    for (const placed of board.colocadas || []) {
      const key = String(placed?.pieza?.ref);
      actual.set(key, (actual.get(key) || 0) + 1);
    }
  }

  if (expected.size !== actual.size) return false;
  for (const [key, count] of expected) {
    if (actual.get(key) !== count) return false;
  }
  return true;
}

function missingRefs(lines, result) {
  const expected = new Map(
    lines.map((line, index) => [
      String(line.ref ?? index),
      Number(line.cant || 0),
    ]),
  );
  const actual = new Map();

  for (const placed of result?.colocadas || []) {
    const key = String(placed.pieza.ref);
    actual.set(key, (actual.get(key) || 0) + 1);
  }

  const out = [];
  for (const [key, count] of expected) {
    const missing = count - (actual.get(key) || 0);
    if (missing > 0) out.push({ ref: key, count: missing });
  }
  return out;
}

/**
 * Research equivalent of the current OneBoard trajectory set.
 *
 * A production integration should NOT rerun this. Instead, OneBoard should
 * expose its already-computed best failed placement so the reserved-band
 * rescue can reuse it.
 */
export function diagnoseOneBoardMiss(lines, config = {}) {
  const started = Date.now();
  const opts = {
    pases: 40,
    semillasRescate: 6,
    msRescate: 20000,
    placaBase: 2750,
    placaAltura: 1830,
    refiladoX: 0,
    refiladoY: 0,
    sierra: 4.5,
    etapas: 4,
    materialConVeta: false,
    descontarCanto: false,
    cantoEspesor: 0,
    ruido: 0.3,
    restoMin: 250,
    restoMax: 400,
    ...config,
  };

  opts.anchoUtil = opts.placaBase - opts.refiladoX;
  opts.altoUtil = opts.placaAltura - opts.refiladoY;

  const { pieces, nSigs } = makePieces(lines, opts);
  const total = pieces.length;
  let best = null;
  let bestLeft = Infinity;
  let attempts = 0;

  for (let seedIndex = 0; seedIndex < opts.semillasRescate; seedIndex++) {
    for (const c1 of CRITERIA) {
      for (const c2 of CRITERIA) {
        for (const dir of [M.DIR_Y, M.DIR_X]) {
          for (const multi of [false, true]) {
            const local = {
              criterios: [c1, c2],
              criterio: c1,
              dirInicial: dir,
              ruido: seedIndex === 0 ? 0 : 0.3,
              multiRebanada: multi,
            };
            local._id = M.hashTexto(c1 + ">" + c2 + "|" + dir + "|" + multi);

            let seed = (1000 + seedIndex * 97) >>> 0;
            const rnd =
              local.ruido > 0
                ? () => {
                    seed =
                      (Math.imul(seed, 1664525) + 1013904223) >>> 0;
                    return seed / 4294967296;
                  }
                : null;

            const runOpts = {
              ...opts,
              ...local,
              _vistas: new Set(),
              _cuenta: new Map(),
              _reps: [],
              _medidas: [],
              _nSigs: nSigs,
              _cache: null,
              _stats: { hits: 0, fallos: 0 },
            };

            attempts++;
            let result = null;
            try {
              result = M.empacarPlaca(
                pieces.slice().sort(ORDERS[seedIndex % ORDERS.length]),
                runOpts,
                rnd,
              );
            } catch {
              result = null;
            }
            if (!result) continue;

            const left = total - result.colocadas.length;
            if (left < bestLeft) {
              bestLeft = left;
              best = result;
            }
            if (left === 0) {
              return {
                complete: true,
                best,
                left: 0,
                missing: [],
                pieces,
                nSigs,
                opts,
                attempts,
                wallMs: Date.now() - started,
              };
            }
          }
        }
      }
    }
  }

  return {
    complete: false,
    best,
    left: bestLeft,
    missing: missingRefs(lines, best),
    pieces,
    nSigs,
    opts,
    attempts,
    wallMs: Date.now() - started,
  };
}

function prioritizedOrder(target, baseOrder) {
  return (a, b) => {
    const aTarget = String(a.ref) === String(target);
    const bTarget = String(b.ref) === String(target);
    if (aTarget !== bTarget) return aTarget ? -1 : 1;
    return baseOrder(a, b) || a.id - b.id;
  };
}

function usageSignature(result) {
  return result.colocadas
    .map((entry) => entry.pieza.id)
    .sort((a, b) => a - b)
    .join(",");
}

function bandOutcomes(pool, base, width, height, childDir, target, nSigs) {
  const unique = new Map();

  for (let orderIndex = 0; orderIndex < ORDERS.length; orderIndex++) {
    const order = prioritizedOrder(target, ORDERS[orderIndex]);

    for (const c1 of CRITERIA) {
      for (const c2 of CRITERIA) {
        for (const multi of [false, true]) {
          const opts = regionOpts(
            base,
            width,
            height,
            childDir,
            c1,
            c2,
            multi,
            nSigs,
          );

          let result = null;
          try {
            result = M.empacarPlaca(pool.slice().sort(order), opts, null);
          } catch {
            result = null;
          }
          if (!result) continue;
          if (
            !result.colocadas.some(
              (entry) => String(entry.pieza.ref) === String(target),
            )
          ) {
            continue;
          }

          const signature = usageSignature(result);
          const previous = unique.get(signature);
          if (
            !previous ||
            result.colocadas.length > previous.result.colocadas.length
          ) {
            unique.set(signature, { result, opts });
          }
        }
      }
    }
  }

  return [...unique.values()]
    .sort(
      (a, b) =>
        b.result.colocadas.length - a.result.colocadas.length ||
        b.result.area - a.result.area,
    )
    .slice(0, 12);
}

function cheapSiblingFeasible(rest, width, height, base) {
  const area = rest.reduce(
    (sum, piece) =>
      sum + piece._corte.base * piece._corte.altura,
    0,
  );
  if (area > width * height + 1e-6) return false;

  for (const piece of rest) {
    const orientations =
      piece._ors || M.orientaciones(piece, Boolean(base.materialConVeta));
    if (
      !orientations.some(
        (orientation) =>
          orientation.base <= width + 1e-9 &&
          orientation.altura <= height + 1e-9,
      )
    ) {
      return false;
    }
  }
  return true;
}

function packSibling(pool, base, width, height, childDir, nSigs) {
  for (let orderIndex = 0; orderIndex < ORDERS.length; orderIndex++) {
    for (const c1 of CRITERIA) {
      for (const c2 of CRITERIA) {
        for (const multi of [false, true]) {
          const opts = regionOpts(
            base,
            width,
            height,
            childDir,
            c1,
            c2,
            multi,
            nSigs,
          );

          let result = null;
          try {
            result = M.empacarPlaca(
              pool.slice().sort(ORDERS[orderIndex]),
              opts,
              null,
            );
          } catch {
            result = null;
          }
          if (result?.colocadas?.length === pool.length) {
            return { result, opts };
          }
        }
      }
    }
  }
  return null;
}

function shiftResult(result, dx, dy) {
  return {
    colocadas: result.colocadas.map((entry) => ({
      ...entry,
      x: entry.x + dx,
      y: entry.y + dy,
    })),
    cortes: (result.cortes || []).map((cut) => ({
      ...cut,
      x1: cut.x1 + dx,
      x2: cut.x2 + dx,
      y1: cut.y1 + dy,
      y2: cut.y2 + dy,
    })),
    restos: (result.restos || []).map((remnant) => ({
      ...remnant,
      x: remnant.x + dx,
      y: remnant.y + dy,
    })),
  };
}

function combinedPlan(
  config,
  pieces,
  axis,
  thickness,
  band,
  sibling,
  baseOpts,
) {
  const width =
    Number(config.placaBase) - Number(config.refiladoX || 0);
  const height =
    Number(config.placaAltura) - Number(config.refiladoY || 0);
  const saw = Number(config.sierra);

  const first = shiftResult(band.result, 0, 0);
  let second;
  let rootCut;

  if (axis === "x") {
    second = shiftResult(sibling.result, thickness + saw, 0);
    rootCut = {
      x1: thickness,
      y1: 0,
      x2: thickness,
      y2: height,
      nivel: 1,
      largo: height,
    };
  } else {
    second = shiftResult(sibling.result, 0, thickness + saw);
    rootCut = {
      x1: 0,
      y1: thickness,
      x2: width,
      y2: thickness,
      nivel: 1,
      largo: width,
    };
  }

  const opts = {
    ...baseOpts,
    anchoUtil: width,
    altoUtil: height,
  };

  return {
    placas: [
      {
        ancho: width,
        alto: height,
        colocadas: [...first.colocadas, ...second.colocadas],
        cortes: [rootCut, ...first.cortes, ...second.cortes],
        restos: [...first.restos, ...second.restos],
        arbol: null,
      },
    ],
    opts,
    resumen: {
      placas: 1,
      piezas: pieces.length,
      origen: RESERVED_ROOT_BAND_FAST32_VERSION,
    },
  };
}

function candidateBands(lines, width, height, saw) {
  const x = new Set();
  const y = new Set();

  for (const line of lines) {
    for (const dimension of [+line.base, +line.altura]) {
      if (dimension > 0 && dimension < width - saw - 1e-9) {
        x.add(+dimension.toFixed(6));
      }
      if (dimension > 0 && dimension < height - saw - 1e-9) {
        y.add(+dimension.toFixed(6));
      }
    }
  }

  return {
    x: [...x].sort((a, b) => a - b),
    y: [...y].sort((a, b) => a - b),
  };
}

function orderedBands(values, lines, target) {
  const line = lines.find(
    (candidate, index) =>
      String(candidate.ref ?? index) === String(target),
  );
  const preferred = new Set(
    line
      ? [+line.base.toFixed(6), +line.altura.toFixed(6)]
      : [],
  );

  return values.slice().sort((a, b) => {
    const preference =
      (preferred.has(a) ? 0 : 1) - (preferred.has(b) ? 0 : 1);
    return preference || a - b;
  });
}

export function tryReservedRootBandFast32(
  lines,
  config,
  diagnostic = null,
) {
  const started = Date.now();
  const source = diagnostic || diagnoseOneBoardMiss(lines, config);

  if (!source?.best || source.left <= 0) {
    return {
      attempted: false,
      certified: false,
      reason: source?.left === 0 ? "ONEBOARD_ALREADY_COMPLETE" : "NO_FAILED_STATE",
      plan: null,
      diagnostic: source,
      wallMs: Date.now() - started,
    };
  }

  const width =
    Number(config.placaBase) - Number(config.refiladoX || 0);
  const height =
    Number(config.placaAltura) - Number(config.refiladoY || 0);
  const saw = Number(config.sierra);
  const bands = candidateBands(lines, width, height, saw);
  const missing = source.missing?.length
    ? source.missing
    : missingRefs(lines, source.best);

  let rootBandAttempts = 0;
  let siblingChecks = 0;
  let cheapSiblingRejects = 0;

  search:
  for (const missingFamily of missing) {
    const target = String(missingFamily.ref);

    for (const axis of ["x", "y"]) {
      const span = axis === "x" ? width : height;
      const perpendicular = axis === "x" ? height : width;
      const childDir = axis === "x" ? M.DIR_Y : M.DIR_X;

      for (const thickness of orderedBands(bands[axis], lines, target)) {
        if (
          rootBandAttempts >=
          RESERVED_ROOT_BAND_FAST32_LIMITS.maxRootBands
        ) {
          break search;
        }

        const remaining = span - thickness - saw;
        if (remaining <= 1e-9) continue;

        rootBandAttempts++;

        const bandWidth = axis === "x" ? thickness : perpendicular;
        const bandHeight = axis === "x" ? perpendicular : thickness;
        const siblingWidth = axis === "x" ? remaining : perpendicular;
        const siblingHeight = axis === "x" ? perpendicular : remaining;

        const outcomes = bandOutcomes(
          source.pieces,
          source.opts,
          bandWidth,
          bandHeight,
          childDir,
          target,
          source.nSigs,
        );

        for (const band of outcomes) {
          if (
            siblingChecks >=
            RESERVED_ROOT_BAND_FAST32_LIMITS.maxSiblingChecks
          ) {
            break search;
          }

          const used = new Set(
            band.result.colocadas.map((entry) => entry.pieza.id),
          );
          const rest = source.pieces.filter(
            (piece) => !used.has(piece.id),
          );
          if (!rest.length) continue;

          siblingChecks++;

          if (
            !cheapSiblingFeasible(
              rest,
              siblingWidth,
              siblingHeight,
              source.opts,
            )
          ) {
            cheapSiblingRejects++;
            continue;
          }

          const sibling = packSibling(
            rest,
            source.opts,
            siblingWidth,
            siblingHeight,
            childDir,
            source.nSigs,
          );
          if (!sibling) continue;

          const plan = combinedPlan(
            config,
            source.pieces,
            axis,
            thickness,
            band,
            sibling,
            source.opts,
          );

          if (
            validarPlanIndustrial(plan, source.pieces.length)?.ok &&
            exactDemandOk(plan, lines)
          ) {
            return {
              attempted: true,
              certified: true,
              reason: "RESERVED_ROOT_BAND_FAST32_CERTIFIED",
              plan,
              diagnostic: source,
              target,
              axis,
              thickness,
              bandPlaced: band.result.colocadas.length,
              siblingPieces: rest.length,
              rootBandAttempts,
              siblingChecks,
              cheapSiblingRejects,
              wallMs: Date.now() - started,
            };
          }
        }
      }
    }
  }

  return {
    attempted: true,
    certified: false,
    reason:
      rootBandAttempts >= RESERVED_ROOT_BAND_FAST32_LIMITS.maxRootBands
        ? "ROOT_BAND_BUDGET"
        : siblingChecks >= RESERVED_ROOT_BAND_FAST32_LIMITS.maxSiblingChecks
          ? "SIBLING_CHECK_BUDGET"
          : "NO_VALID_ONEBOARD",
    plan: null,
    diagnostic: source,
    rootBandAttempts,
    siblingChecks,
    cheapSiblingRejects,
    wallMs: Date.now() - started,
  };
}
