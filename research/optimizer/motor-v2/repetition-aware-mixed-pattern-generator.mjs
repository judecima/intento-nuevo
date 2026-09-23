import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(new URL("../../../", import.meta.url).pathname);

const { optimizar } = require(path.join(ROOT, "src/lib/optimizer/legacy/motor.cjs"));
const { patronesMonotipo, claveVector } = require(path.join(ROOT, "src/lib/optimizer/legacy/patrones.cjs"));
const { resolverCobertura } = require(path.join(ROOT, "src/lib/optimizer/legacy/cobertura.cjs"));
const { materializar } = require(path.join(ROOT, "src/lib/optimizer/legacy/materializar.cjs"));
const { validarPlanIndustrial } = require(path.join(ROOT, "src/lib/optimizer/legacy/validador_industrial_v3.cjs"));
const { computeHybridLowerBound } = require(path.join(ROOT, "src/lib/optimizer/experimental/hybrid-lower-bound.cjs"));

function patternFromBoard(board, typeCount) {
  const uso = new Map();
  for (const c of board.colocadas || []) {
    const i = Number(c.pieza.ref);
    if (!Number.isInteger(i) || i < 0 || i >= typeCount) return null;
    uso.set(i, (uso.get(i) || 0) + 1);
  }
  if (!uso.size) return null;
  return {
    uso,
    area: (board.colocadas || []).reduce((s, c) => s + c.base * c.altura, 0),
    placa: board,
  };
}

function vectorOf(pattern, typeCount) {
  const v = new Array(typeCount).fill(0);
  for (const [i, q] of pattern.uso) v[i] = q;
  return v;
}

function enumerateMixedVectors(lines, config, maxPerType) {
  const typeCount = lines.length;
  const usableW = config.placaBase - (config.refiladoX || 0);
  const usableH = config.placaAltura - (config.refiladoY || 0);
  const boardArea = usableW * usableH;
  const current = new Array(typeCount).fill(0);
  const out = [];

  function visit(i, area, pieces, positiveTypes) {
    if (i === typeCount) {
      if (positiveTypes >= 2) out.push({ v: current.slice(), area, pieces });
      return;
    }

    const pieceArea = lines[i].base * lines[i].altura;
    const limit = Math.min(
      maxPerType[i],
      lines[i].cant,
      Math.floor((boardArea - area) / pieceArea + 1e-9),
    );

    for (let q = 0; q <= limit; q++) {
      current[i] = q;
      visit(
        i + 1,
        area + q * pieceArea,
        pieces + q,
        positiveTypes + (q > 0 ? 1 : 0),
      );
    }
    current[i] = 0;
  }

  visit(0, 0, 0, 0);

  const demand = lines.map((x) => x.cant);
  const totalDemand = demand.reduce((a, b) => a + b, 0);

  // Dense patterns first. Demand-ratio proximity only orders candidates:
  // non-proportional and partial-kit vectors remain in the search space.
  for (const x of out) {
    const density = x.area / boardArea;
    const scale = Math.max(...x.v.map((q, i) => (demand[i] ? q / demand[i] : 0)));
    let deviation = 0;
    if (scale > 0) {
      for (let i = 0; i < typeCount; i++) {
        deviation += Math.abs(x.v[i] - demand[i] * scale);
      }
    }
    x.score = density * 1000 - deviation / (totalDemand || 1);
  }

  out.sort(
    (a, b) =>
      b.score - a.score ||
      b.area - a.area ||
      b.pieces - a.pieces ||
      a.v.join(",").localeCompare(b.v.join(",")),
  );
  return out;
}

function buildConfig(c) {
  return {
    placaBase: c.b[0],
    placaAltura: c.b[1],
    refiladoX: 0,
    refiladoY: 0,
    sierra: c.s,
    etapas: 4,
    materialConVeta: false,
    descontarCanto: false,
    cantoEspesor: 0,
    restoMin: 250,
    restoMax: 400,
    usarCache: false,
    maxPiezasCache: 0,
    maxPiezasBeam: 120,
    presupuestoBeamMs: 1500,
    preferirMenorProfundidad: true,
  };
}

function linesFromCase(c) {
  return c.t.map((t, i) => ({
    base: +t[0],
    altura: +t[1],
    cant: +t[2],
    veta: false,
    canRotate: true,
    ref: i,
    detalle: `T${i}`,
    cantos: null,
  }));
}

function solvePool(pool, lines, config, incumbent) {
  const usableArea =
    (config.placaBase - (config.refiladoX || 0)) *
    (config.placaAltura - (config.refiladoY || 0));

  const solver = resolverCobertura(
    pool,
    lines.map((l) => l.cant),
    usableArea,
    incumbent,
    8000,
    { maxNodos: 1600000, watchdogMs: 12000 },
  );

  return solver?.resolver(lines.map((l) => l.base * l.altura)) || null;
}

function materializeFinal(sol, lines, config) {
  if (!sol?.plan) return null;
  const opts = {
    ...config,
    anchoUtil: config.placaBase - (config.refiladoX || 0),
    altoUtil: config.placaAltura - (config.refiladoY || 0),
  };
  return materializar(sol.plan, lines, opts);
}

export function runCase(c, incumbentBoards) {
  const started = performance.now();
  const lines = linesFromCase(c);
  const config = buildConfig(c);
  const typeCount = lines.length;
  const expectedPieces = lines.reduce((s, l) => s + l.cant, 0);

  const lbResult = computeHybridLowerBound(lines, config, incumbentBoards, {
    useRaster: false,
    claude: { usarRaster: false, usarDffFs0: true },
  });
  const safeLB = Math.max(
    1,
    Math.floor(Number(lbResult?.cheapLowerBound ?? lbResult?.lowerBound ?? 1)),
  );

  // Exact monotype patterns provide a guaranteed coverage fallback and
  // a physical upper bound for how many copies of each type fit on one board.
  const mono = patronesMonotipo(lines, config);
  const maxPerType = new Array(typeCount).fill(0);
  for (const p of mono) {
    for (const [i, q] of p.uso) maxPerType[i] = Math.max(maxPerType[i], q);
  }
  for (let i = 0; i < typeCount; i++) {
    if (!maxPerType[i]) {
      maxPerType[i] = Math.max(
        1,
        Math.floor(
          (config.placaBase * config.placaAltura) /
            (lines[i].base * lines[i].altura) +
            1e-9,
        ),
      );
    }
  }

  const vectors = enumerateMixedVectors(lines, config, maxPerType);
  const patternsByVector = new Map(mono.map((p) => [claveVector(p.uso), p]));

  const maxPhysicalTests = Number(process.env.MAX_PHYSICAL_TESTS || 256);
  let physicalTests = 0;
  let validMixedPatterns = 0;
  let sol = solvePool([...patternsByVector.values()], lines, config, incumbentBoards);
  let best = sol?.placas ?? incumbentBoards;
  let stopReason = "EXHAUSTED_VECTORS";

  for (const candidate of vectors) {
    if (best <= safeLB) {
      stopReason = "REACHED_SAFE_LB";
      break;
    }
    if (physicalTests >= maxPhysicalTests) {
      stopReason = "WORK_LIMIT";
      break;
    }

    const subproblem = lines
      .map((l, i) => ({ ...l, cant: candidate.v[i] }))
      .filter((l) => l.cant > 0);

    physicalTests++;
    let result = null;
    try {
      // The global 225-piece request is never given a larger Beam limit.
      // Only this compressed per-board feasibility subproblem is evaluated.
      result = optimizar(subproblem, {
        ...config,
        pases: 4,
        maxPiezasBeam: Math.max(120, candidate.pieces),
        presupuestoBeamMs: 1500,
      });
    } catch {
      result = null;
    }

    if (!result || result.resumen?.placas !== 1 || !result.placas?.[0]) continue;

    const pattern = patternFromBoard(result.placas[0], typeCount);
    if (!pattern) continue;

    const key = claveVector(pattern.uso);
    if (patternsByVector.has(key)) continue;

    const actualVector = vectorOf(pattern, typeCount);
    const oneBoardPlan = {
      placas: [pattern.placa],
      opts: result.opts,
      resumen: {
        placas: 1,
        piezas: actualVector.reduce((a, b) => a + b, 0),
      },
    };
    const validation = validarPlanIndustrial(
      oneBoardPlan,
      actualVector.reduce((a, b) => a + b, 0),
    );
    if (!validation?.ok) continue;

    patternsByVector.set(key, pattern);
    validMixedPatterns++;

    sol = solvePool([...patternsByVector.values()], lines, config, incumbentBoards);
    if (sol?.placas < best) best = sol.placas;
  }

  const finalPlan = materializeFinal(sol, lines, config);
  const finalValidation = finalPlan
    ? validarPlanIndustrial(finalPlan, expectedPieces)
    : null;

  return {
    id: c.id,
    types: typeCount,
    pieces: expectedPieces,
    incumbent: incumbentBoards,
    reference: c.l,
    lb: safeLB,
    lbReason: lbResult?.reason || null,
    monoPatterns: mono.length,
    maxs: maxPerType,
    enumeratedVectors: vectors.length,
    physicalTests,
    validMixedPatterns,
    poolSize: patternsByVector.size,
    resultBoards: sol?.plan ? sol.placas : incumbentBoards,
    solverNodes: sol?.nodos ?? null,
    solverExhausted: sol?.agotado ?? null,
    reachedLB: Boolean(sol?.plan && sol.placas <= safeLB),
    validFinal: Boolean(finalValidation?.ok),
    stopReason,
    ms: +(performance.now() - started).toFixed(3),
    selected: sol?.plan?.map((p) => vectorOf(p, typeCount)) || [],
  };
}
