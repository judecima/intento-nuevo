import { createRequire } from "node:module";
import {
  enumerateGuideResidualStates,
  prioritizeResidualStates,
} from "./residual-builder.mjs";

const require = createRequire(import.meta.url);
const {
  optimizar,
  calidadPlanPlacas,
  compararCalidad,
} = require("../../../../src/lib/optimizer/legacy/motor.cjs");
const {
  validarPlanIndustrial,
} = require("../../../../src/lib/optimizer/legacy/validador_industrial_v3.cjs");

export const GUIDE_ROW_H2B_VERSION = "guide-row-complete-candidate-h2b-v1";

function countPieces(lines) {
  return lines.reduce((sum, line) => sum + Number(line?.cant || 0), 0);
}

function quality(plan, config) {
  return calidadPlanPlacas(plan?.placas || [], plan?.opts || config);
}

function betterPlan(a, b, config) {
  if (!a) return b;
  if (!b) return a;
  const boardsA = a?.resumen?.placas ?? Infinity;
  const boardsB = b?.resumen?.placas ?? Infinity;
  if (boardsB < boardsA) return b;
  if (boardsA < boardsB) return a;
  return compararCalidad(quality(b, config), quality(a, config)) > 0 ? b : a;
}

function residualOrder(state, lines) {
  const successors = [];
  const seen = new Set([state.guideType]);

  const groups = [...state.effectClasses].sort((a, b) => {
    const arA = a.orientations.reduce((m, o) => Math.max(m, o.base * o.altura), 0);
    const arB = b.orientations.reduce((m, o) => Math.max(m, o.base * o.altura), 0);
    return arB - arA || a.members.length - b.members.length;
  });

  for (const group of groups) {
    const members = [...group.members].sort((a, b) => {
      const qa = Number(lines[a.type]?.cant || 0);
      const qb = Number(lines[b.type]?.cant || 0);
      return qb - qa || a.type - b.type;
    });
    for (const member of members) {
      if (seen.has(member.type)) continue;
      seen.add(member.type);
      successors.push(member.type);
    }
  }

  const rest = lines
    .map((_, index) => index)
    .filter((index) => !seen.has(index))
    .sort((a, b) => {
      const areaA = Number(lines[a].base) * Number(lines[a].altura);
      const areaB = Number(lines[b].base) * Number(lines[b].altura);
      const qtyA = Number(lines[a].cant || 0);
      const qtyB = Number(lines[b].cant || 0);
      return areaB * qtyB - areaA * qtyA || areaB - areaA || a - b;
    });

  return [state.guideType, ...successors, ...rest];
}

function distinctCandidateOrders(lines, config, maxCandidates) {
  const residual = enumerateGuideResidualStates(lines, config);
  const prioritized = prioritizeResidualStates(residual.states)
    .filter((state) => state.natural);

  const orders = [];
  const signatures = new Set();

  const add = (order, source) => {
    const signature = order.join(",");
    if (signatures.has(signature)) return;
    signatures.add(signature);
    orders.push({ order, source });
  };

  add(lines.map((_, index) => index), { kind: "ORIGINAL" });

  for (const state of prioritized) {
    add(residualOrder(state, lines), {
      kind: "RESIDUAL",
      guideType: state.guideType,
      repeat: state.repeat,
      residualWidth: state.residual.width,
      effectClasses: state.effectClasses.length,
      feasibleFamilies: state.feasibleFamilies,
    });
    if (orders.length >= maxCandidates) break;
  }

  return { residual, orders: orders.slice(0, maxCandidates) };
}

export function buildGuideRowCandidate(
  lines,
  config,
  {
    maxCandidates = 6,
    passes = 1,
    restartsPerBoard = 1,
  } = {},
) {
  if (!Array.isArray(lines) || !lines.length) {
    return {
      status: "NOT_APPLICABLE",
      plan: null,
      telemetry: {
        version: GUIDE_ROW_H2B_VERSION,
        candidates: 0,
      },
    };
  }

  const expectedPieces = countPieces(lines);
  const { residual, orders } = distinctCandidateOrders(
    lines,
    config,
    Math.max(1, Math.trunc(maxCandidates)),
  );

  let best = null;
  const runs = [];
  const started = process.hrtime.bigint();

  for (const spec of orders) {
    const orderedLines = spec.order.map((index) => structuredClone(lines[index]));
    const t0 = process.hrtime.bigint();
    let plan = null;
    let error = null;
    let validation = null;

    try {
      plan = optimizar(orderedLines, {
        ...structuredClone(config),
        ruido: 0,
        pases: passes,
        restartsPorPlaca: restartsPerBoard,
        usarRescue: false,
        maxPiezasBeam: 0,
        multiVariantes: false,
      });
      validation = validarPlanIndustrial(plan, expectedPieces);
      if (!validation?.ok) plan = null;
    } catch (err) {
      error = String(err?.stack || err?.message || err);
      plan = null;
    }

    const wallMs = Number(process.hrtime.bigint() - t0) / 1e6;
    if (plan) best = betterPlan(best, plan, config);

    runs.push({
      ...spec.source,
      wallMs,
      ok: Boolean(plan),
      boards: plan?.resumen?.placas ?? null,
      quality: plan ? quality(plan, config) : null,
      validation: validation?.ok ?? false,
      error,
    });
  }

  const wallMs = Number(process.hrtime.bigint() - started) / 1e6;

  return {
    status: best ? "COMPLETE" : "FAILED",
    plan: best,
    telemetry: {
      version: GUIDE_ROW_H2B_VERSION,
      candidates: orders.length,
      wallMs,
      residual: residual.telemetry,
      runs,
    },
  };
}
