"use strict";

/**
 * Semillas geométricas de dominio para Pattern Master.
 *
 * EXPERIMENTAL/OFFLINE: este módulo no está conectado al camino productivo.
 * Su único objetivo es convertir estructura observable del pedido en
 * subconjuntos reproducibles para comparar contra el muestreo aleatorio.
 *
 * Deliberadamente NO infiere semántica de mueble (lateral, estante, puerta,
 * módulo). Una familia significa solamente que varios tipos pueden compartir
 * una rebanada por una dimensión común.
 */

function normalizeDimension(value) {
  return Math.round((+value || 0) * 1000) / 1000;
}

function typeQuantity(line) {
  return Math.max(0, Math.floor(+line?.cant || 0));
}

function familyKey(axis, dimension) {
  return `${axis}:${normalizeDimension(dimension)}`;
}

/**
 * Construye familias por dimensión exacta sobre el mismo eje.
 *
 * Mismo-eje es intencionalmente conservador: una coincidencia base↔altura
 * puede requerir rotar una pieza y no siempre es legal por veta. Las familias
 * cruzadas se pueden incorporar después cuando la política de rotación esté
 * explícitamente disponible en el adaptador.
 */
function buildExactDimensionFamilies(lineas, options = {}) {
  const minTypes = Math.max(2, Math.floor(options.minTypes ?? 2));
  const minPieces = Math.max(2, Math.floor(options.minPieces ?? 2));
  const maxFamilies = Math.max(1, Math.floor(options.maxFamilies ?? 24));
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

  const families = [...groups.values()]
    .filter((family) => family.typeIndexes.length >= minTypes && family.pieces >= minPieces)
    .map((family) => ({
      ...family,
      typeIndexes: [...family.typeIndexes].sort((a, b) => a - b),
      coverageTypes: family.typeIndexes.length / Math.max(1, lineas.length),
      coveragePieces: family.pieces / Math.max(1, lineas.reduce((sum, l) => sum + typeQuantity(l), 0)),
    }));

  families.sort((a, b) =>
    b.pieces - a.pieces ||
    b.typeIndexes.length - a.typeIndexes.length ||
    a.dimension - b.dimension ||
    a.axis.localeCompare(b.axis),
  );

  // Evitar duplicados de subconjunto: si exactamente los mismos tipos comparten
  // base y altura, una sola semilla alcanza. Conservamos la de mayor cobertura;
  // el orden estable anterior hace la elección reproducible.
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

/** Devuelve las líneas completas de una familia, sin mutar ni truncar cantidades. */
function materializeFamilySubset(lineas, family) {
  return family.typeIndexes.map((index) => ({ ...lineas[index] }));
}

/**
 * Genera descriptores de semillas, no patrones físicos. Separar detección de
 * estructura de generación permite medir cobertura del dominio sin ejecutar el
 * motor y evita que esta capa adquiera responsabilidad de factibilidad.
 */
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
