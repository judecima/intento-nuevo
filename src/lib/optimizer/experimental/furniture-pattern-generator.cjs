"use strict";

const { optimizar } = require("../legacy/motor.cjs");
const { claveVector } = require("../legacy/patrones.cjs");
const { buildFurniturePatternSeeds } = require("./furniture-pattern-seeds.cjs");

function generateFurnitureFamilyPatterns(lineas, config, options = {}) {
  const seeds = buildFurniturePatternSeeds(lineas, options);
  const byVector = new Map();
  const warnings = [];
  const started = Date.now();

  for (const seed of seeds) {
    const subset = seed.typeIndexes.map((typeIndex) => ({
      ...lineas[typeIndex],
      ref: typeIndex,
      _refOriginal: lineas[typeIndex]?.ref,
    }));

    try {
      const result = optimizar(subset, {
        ...config,
        semilla: (options.seedBase ?? 50_000) + seed.ordinal,
        pases: options.passes ?? 1,
      });

      for (const placa of result?.placas || []) {
        registerPattern(byVector, placa, {
          origin: seed.origin,
          familyKey: seed.key,
          familyAxis: seed.axis,
          familyDimension: seed.dimension,
          familyOrdinal: seed.ordinal,
          familyTypeIndexes: seed.typeIndexes,
        });
      }
    } catch (error) {
      warnings.push({
        familyKey: seed.key,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    patterns: [...byVector.values()],
    seeds,
    warnings,
    metrics: {
      seeds: seeds.length,
      patterns: byVector.size,
      warnings: warnings.length,
      ms: Date.now() - started,
    },
  };
}

function registerPattern(byVector, placa, meta) {
  const uso = new Map();
  for (const colocada of placa?.colocadas || []) {
    const typeIndex = colocada?.pieza?.ref;
    if (!Number.isInteger(typeIndex)) return;
    uso.set(typeIndex, (uso.get(typeIndex) || 0) + 1);
  }
  if (!uso.size) return;

  const area = (placa.colocadas || []).reduce(
    (sum, colocada) => sum + colocada.base * colocada.altura,
    0,
  );
  const key = claveVector(uso);
  const candidate = {
    uso,
    area,
    placa,
    _patternMeta: {
      ...meta,
      firstSeenRound: 0,
      sourceRound: 0,
    },
  };
  const previous = byVector.get(key);

  if (!previous || area > (+previous.area || 0)) {
    byVector.set(key, candidate);
  }
}

module.exports = {
  generateFurnitureFamilyPatterns,
  registerPattern,
};
