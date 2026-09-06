"use strict";

function normalizeDimension(value) {
  return Math.round((+value || 0) * 1000) / 1000;
}

function typeQuantity(line) {
  return Math.max(0, Math.floor(+line?.cant || 0));
}

function familyKey(axis, dimension) {
  return `${axis}:${normalizeDimension(dimension)}`;
}

function buildExactDimensionFamilies(lineas, options = {}) {
  const minTypes = Math.max(2, Math.floor(options.minTypes ?? 2));
  const minPieces = Math.max(2, Math.floor(options.minPieces ?? 2));
  const maxFamilies = Math.max(1, Math.floor(options.maxFamilies ?? 12));
  const groups = new Map();

  for (let index = 0; index < lineas.length; index++) {
    const line = lineas[index];
    const qty = typeQuantity(line);
    if (!qty) continue;

    for (const axis of ["base", "altura"]) {
      const dimension = normalizeDimension(line?.[axis]);
      if (!(dimension > 0)) continue;
      const key = familyKey(axis, dimension);
      let group = groups.get(key);
      if (!group) {
        group = { key, origin: `family-${axis}`, axis, dimension, typeIndexes: [], pieces: 0 };
        groups.set(key, group);
      }
      group.typeIndexes.push(index);
      group.pieces += qty;
    }
  }

  const totalPieces = Math.max(1, lineas.reduce((sum, line) => sum + typeQuantity(line), 0));
  const families = [...groups.values()]
    .filter((family) => family.typeIndexes.length >= minTypes && family.pieces >= minPieces)
    .map((family) => ({
      ...family,
      typeIndexes: [...family.typeIndexes].sort((a, b) => a - b),
      coverageTypes: family.typeIndexes.length / Math.max(1, lineas.length),
      coveragePieces: family.pieces / totalPieces,
    }));

  families.sort((a, b) =>
    b.pieces - a.pieces ||
    b.typeIndexes.length - a.typeIndexes.length ||
    a.dimension - b.dimension ||
    a.axis.localeCompare(b.axis),
  );

  const seenSubsets = new Set();
  const out = [];
  for (const family of families) {
    const signature = family.typeIndexes.join(",");
    if (seenSubsets.has(signature)) continue;
    seenSubsets.add(signature);
    out.push(family);
    if (out.length >= maxFamilies) break;
  }

  return out;
}

function materializeFamilySubset(lineas, family) {
  return family.typeIndexes.map((index) => ({ ...lineas[index] }));
}

function buildFurniturePatternSeeds(lineas, options = {}) {
  return buildExactDimensionFamilies(lineas, options).map((family, ordinal) => ({
    ...family,
    ordinal,
    subset: materializeFamilySubset(lineas, family),
  }));
}

module.exports = {
  buildExactDimensionFamilies,
  buildFurniturePatternSeeds,
  materializeFamilySubset,
  normalizeDimension,
};
