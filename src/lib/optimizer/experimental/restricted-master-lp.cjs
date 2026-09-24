"use strict";

const EPS = 1e-9;
const MAX_ITERATIONS = 20000;

function vectorFromPattern(pattern, typeCount) {
  if (Array.isArray(pattern?.usage)) {
    if (pattern.usage.length !== typeCount) throw new Error("usage length mismatch");
    return pattern.usage.map((value) => Number(value) || 0);
  }
  if (Array.isArray(pattern?.usageVector)) {
    if (pattern.usageVector.length !== typeCount) throw new Error("usageVector length mismatch");
    return pattern.usageVector.map((value) => Number(value) || 0);
  }
  const out = new Array(typeCount).fill(0);
  if (pattern?.uso && typeof pattern.uso[Symbol.iterator] === "function") {
    for (const [index, value] of pattern.uso) {
      if (index >= 0 && index < typeCount) out[index] = Number(value) || 0;
    }
    return out;
  }
  throw new Error("unsupported pattern vector shape");
}

function dot(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

function transpose(matrix) {
  const rows = matrix.length;
  const cols = matrix[0]?.length || 0;
  return Array.from({ length: cols }, (_, j) =>
    Array.from({ length: rows }, (_, i) => matrix[i][j]),
  );
}

function solveLinear(matrix, rhs) {
  const n = rhs.length;
  const a = matrix.map((row, i) => row.slice().concat(rhs[i]));

  for (let col = 0; col < n; col++) {
    let pivot = col;
    let best = Math.abs(a[col][col]);
    for (let row = col + 1; row < n; row++) {
      const value = Math.abs(a[row][col]);
      if (value > best) {
        best = value;
        pivot = row;
      }
    }
    if (best <= 1e-12) throw new Error("singular LP basis");
    if (pivot !== col) [a[pivot], a[col]] = [a[col], a[pivot]];

    const divisor = a[col][col];
    for (let j = col; j <= n; j++) a[col][j] /= divisor;

    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = a[row][col];
      if (Math.abs(factor) <= 1e-15) continue;
      for (let j = col; j <= n; j++) a[row][j] -= factor * a[col][j];
    }
  }

  return a.map((row) => row[n]);
}

function identityBasis(columns, typeCount) {
  const basis = new Array(typeCount).fill(-1);
  for (let col = 0; col < columns.length; col++) {
    let oneAt = -1;
    let valid = true;
    for (let row = 0; row < typeCount; row++) {
      const value = columns[col][row];
      if (Math.abs(value - 1) <= EPS) {
        if (oneAt !== -1) {
          valid = false;
          break;
        }
        oneAt = row;
      } else if (Math.abs(value) > EPS) {
        valid = false;
        break;
      }
    }
    if (valid && oneAt !== -1 && basis[oneAt] === -1) basis[oneAt] = col;
  }
  const missing = basis
    .map((value, index) => (value === -1 ? index : null))
    .filter((value) => value !== null);
  if (missing.length) {
    throw new Error("restricted master requires UNIT patterns for types: " + missing.join(","));
  }
  return basis;
}

function basisMatrix(columns, basis, typeCount) {
  return Array.from({ length: typeCount }, (_, row) =>
    basis.map((columnIndex) => columns[columnIndex][row]),
  );
}

/**
 * Exact (up to floating-point tolerance) revised simplex for:
 *
 *   min sum_p x_p
 *   s.t. A x = demand
 *        x >= 0
 *
 * Research-only. The serial pattern pools contain UNIT columns, so an identity
 * feasible basis exists and Phase I is unnecessary.
 */
function solveRestrictedMasterLp(patterns, demand, options = {}) {
  const started = process.hrtime.bigint();
  const typeCount = demand.length;
  if (!typeCount) throw new Error("empty demand");
  const b = demand.map((value) => Number(value));
  if (b.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error("invalid demand");
  }

  const columns = patterns.map((pattern) => vectorFromPattern(pattern, typeCount));
  const costs = patterns.map(() => 1);
  let basis = identityBasis(columns, typeCount);
  const maxIterations = Math.max(
    1,
    Math.floor(Number(options.maxIterations) || MAX_ITERATIONS),
  );
  const tolerance = Math.max(1e-12, Number(options.tolerance) || EPS);

  let iterations = 0;
  let last = null;

  while (iterations < maxIterations) {
    iterations++;
    const B = basisMatrix(columns, basis, typeCount);
    const xB = solveLinear(B, b);
    for (let row = 0; row < xB.length; row++) {
      if (xB[row] < -1e-7) {
        throw new Error("LP basis lost primal feasibility");
      }
      if (Math.abs(xB[row]) <= tolerance) xB[row] = 0;
    }

    const cB = basis.map((index) => costs[index]);
    const dual = solveLinear(transpose(B), cB);
    const basisSet = new Set(basis);

    // Bland entering rule: deterministic and resistant to cycling.
    let entering = -1;
    let enteringReducedCost = 0;
    for (let col = 0; col < columns.length; col++) {
      if (basisSet.has(col)) continue;
      const reducedCost = costs[col] - dot(columns[col], dual);
      if (reducedCost < -tolerance) {
        entering = col;
        enteringReducedCost = reducedCost;
        break;
      }
    }

    const objective = dot(cB, xB);
    last = { B, xB, dual, objective, enteringReducedCost };

    if (entering === -1) {
      const primal = new Array(columns.length).fill(0);
      for (let row = 0; row < basis.length; row++) {
        primal[basis[row]] = xB[row];
      }
      const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
      let maxConstraintError = 0;
      for (let row = 0; row < typeCount; row++) {
        let covered = 0;
        for (let col = 0; col < columns.length; col++) {
          if (primal[col]) covered += columns[col][row] * primal[col];
        }
        maxConstraintError = Math.max(maxConstraintError, Math.abs(covered - b[row]));
      }
      let maxDualViolation = 0;
      for (const column of columns) {
        maxDualViolation = Math.max(maxDualViolation, dot(column, dual) - 1);
      }

      return {
        status: "OPTIMAL",
        objective,
        dualPrices: dual,
        primal,
        basis: basis.slice(),
        iterations,
        elapsedMs,
        maxConstraintError,
        maxDualViolation,
      };
    }

    const direction = solveLinear(B, columns[entering]);
    let leavingRow = -1;
    let bestRatio = Infinity;
    let bestLeavingVariable = Infinity;
    for (let row = 0; row < typeCount; row++) {
      if (direction[row] <= tolerance) continue;
      const ratio = xB[row] / direction[row];
      const leavingVariable = basis[row];
      if (
        ratio < bestRatio - tolerance ||
        (Math.abs(ratio - bestRatio) <= tolerance &&
          leavingVariable < bestLeavingVariable)
      ) {
        bestRatio = ratio;
        bestLeavingVariable = leavingVariable;
        leavingRow = row;
      }
    }
    if (leavingRow === -1) throw new Error("restricted master LP is unbounded");
    basis[leavingRow] = entering;
  }

  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
  return {
    status: "ITERATION_LIMIT",
    objective: last?.objective ?? null,
    dualPrices: last?.dual ?? null,
    iterations,
    elapsedMs,
  };
}

module.exports = {
  solveRestrictedMasterLp,
};
