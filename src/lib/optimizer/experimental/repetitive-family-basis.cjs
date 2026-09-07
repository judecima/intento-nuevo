"use strict";

function orientations(line, materialConVeta) {
  const base = +line.base, altura = +line.altura;
  const fixed = materialConVeta && !!line.veta;
  const out = [{ base, altura, rotated: false }];
  if (!fixed && Math.abs(base - altura) > 1e-9) out.push({ base: altura, altura: base, rotated: true });
  return out;
}

function countAlong(total, size, kerf) {
  if (!(size > 0) || !(total > 0)) return 0;
  return Math.max(0, Math.floor((total + kerf + 1e-9) / (size + kerf)));
}

function occupied(count, size, kerf) {
  return count > 0 ? count * size + (count - 1) * kerf : 0;
}

function sameWidth(a, b, tolerance) {
  return Math.abs(a - b) <= tolerance;
}

function buildFillerStrips(lines, H, maxWidth, kerf, dominantTypeIndex, options = {}) {
  const materialConVeta = !!options.materialConVeta;
  const widthTolerance = +(options.widthTolerance ?? 0.05);
  const oriented = [];
  lines.forEach((line, typeIndex) => {
    if (typeIndex === dominantTypeIndex) return;
    for (const o of orientations(line, materialConVeta)) {
      if (o.base <= maxWidth + 1e-9 && o.altura <= H + 1e-9) {
        oriented.push({ typeIndex, cant: +line.cant || 0, ...o });
      }
    }
  });

  const strips = [];
  for (const a of oriented) {
    const n = Math.min(a.cant, countAlong(H, a.altura, kerf));
    if (n <= 0) continue;
    strips.push({
      width: a.base,
      items: [{ typeIndex: a.typeIndex, rotated: a.rotated, count: n, base: a.base, altura: a.altura }],
      filledHeight: occupied(n, a.altura, kerf),
      pieceCount: n,
    });
  }

  for (let i = 0; i < oriented.length; i++) {
    const a = oriented[i];
    for (let j = i + 1; j < oriented.length; j++) {
      const b = oriented[j];
      if (a.typeIndex === b.typeIndex || !sameWidth(a.base, b.base, widthTolerance)) continue;
      const width = Math.max(a.base, b.base);
      let best = null;
      const maxA = Math.min(a.cant, countAlong(H, a.altura, kerf));
      const maxB = Math.min(b.cant, countAlong(H, b.altura, kerf));
      for (let ca = 1; ca <= maxA; ca++) {
        for (let cb = 1; cb <= maxB; cb++) {
          const n = ca + cb;
          const h = ca * a.altura + cb * b.altura + (n - 1) * kerf;
          if (h > H + 1e-9) continue;
          const cand = { ca, cb, h, n };
          if (!best || cand.h > best.h + 1e-9 || (Math.abs(cand.h - best.h) <= 1e-9 && cand.n > best.n)) best = cand;
        }
      }
      if (!best) continue;
      strips.push({
        width,
        items: [
          { typeIndex: a.typeIndex, rotated: a.rotated, count: best.ca, base: a.base, altura: a.altura },
          { typeIndex: b.typeIndex, rotated: b.rotated, count: best.cb, base: b.base, altura: b.altura },
        ],
        filledHeight: best.h,
        pieceCount: best.n,
      });
    }
  }

  const key = (s) => s.items.map((x) => `${x.typeIndex}:${x.rotated ? 1 : 0}:${x.count}`).sort().join("|");
  const dedup = new Map();
  for (const s of strips) {
    const k = key(s);
    const previous = dedup.get(k);
    if (!previous || s.filledHeight > previous.filledHeight) dedup.set(k, s);
  }
  return [...dedup.values()].sort((a, b) => b.filledHeight - a.filledHeight || b.pieceCount - a.pieceCount || a.width - b.width);
}

function usageOf(strips) {
  const usage = {};
  for (const strip of strips) {
    for (const item of strip.items) usage[item.typeIndex] = (usage[item.typeIndex] || 0) + item.count;
  }
  return usage;
}

function recipeArea(recipe) {
  return recipe.strips.reduce((sum, strip) => sum + strip.items.reduce(
    (acc, item) => acc + item.count * item.base * item.altura,
    0,
  ), 0);
}

function buildRepetitiveFamilyBasis(lines, config, options = {}) {
  const W = +config.placaBase - +(config.refiladoX ?? 0);
  const H = +config.placaAltura - +(config.refiladoY ?? 0);
  const kerf = +(config.sierra ?? 0);
  if (!(W > 0 && H > 0) || !(kerf >= 0)) throw new Error("invalid-board");

  const minRepeat = +(options.minRepeat ?? 4);
  const maxFamilies = +(options.maxFamilies ?? 12);
  const recipes = [];
  const families = [];

  lines.forEach((line, typeIndex) => {
    const cant = +line.cant || 0;
    if (cant < minRepeat) return;
    for (const o of orientations(line, !!config.materialConVeta)) {
      const perStrip = countAlong(H, o.altura, kerf);
      if (perStrip <= 0) continue;
      const maxByQty = Math.floor(cant / perStrip);
      const maxByWidth = countAlong(W, o.base, kerf);
      const K = Math.min(maxByQty, maxByWidth);
      if (K <= 0) continue;
      families.push({
        typeIndex,
        cant,
        ...o,
        perStrip,
        K,
        score: Math.min(cant, K * perStrip) * o.base * o.altura,
      });
    }
  });

  families.sort((a, b) => b.score - a.score || b.cant - a.cant || a.typeIndex - b.typeIndex || Number(a.rotated) - Number(b.rotated));

  for (const fam of families.slice(0, maxFamilies)) {
    const ks = [...new Set([fam.K, fam.K - 1, fam.K - 2].filter((x) => x >= 1))];
    for (const k of ks) {
      const repeatedStrips = Array.from({ length: k }, () => ({
        width: fam.base,
        items: [{
          typeIndex: fam.typeIndex,
          rotated: fam.rotated,
          count: fam.perStrip,
          base: fam.base,
          altura: fam.altura,
        }],
        filledHeight: occupied(fam.perStrip, fam.altura, kerf),
        pieceCount: fam.perStrip,
      }));
      const usedWidth = occupied(k, fam.base, kerf);
      const remainingForNextStrip = W - usedWidth - kerf;
      const baseRecipe = {
        origin: "repetitive-family",
        dominantTypeIndex: fam.typeIndex,
        dominantRotated: fam.rotated,
        k,
        perStrip: fam.perStrip,
        strips: repeatedStrips,
        usage: usageOf(repeatedStrips),
        occupiedWidth: usedWidth,
      };
      recipes.push(baseRecipe);

      if (remainingForNextStrip > 0) {
        const fillers = buildFillerStrips(lines, H, remainingForNextStrip, kerf, fam.typeIndex, {
          materialConVeta: !!config.materialConVeta,
          widthTolerance: options.widthTolerance,
        });
        for (const filler of fillers.slice(0, +(options.fillersPerFamily ?? 1))) {
          const strips = repeatedStrips.concat([filler]);
          recipes.push({
            ...baseRecipe,
            origin: "repetitive-family+filler",
            strips,
            usage: usageOf(strips),
            occupiedWidth: usedWidth + kerf + filler.width,
            filler,
          });
        }
      }
    }
  }

  const vectorKey = (recipe) => Object.entries(recipe.usage)
    .sort((a, b) => +a[0] - +b[0])
    .map(([i, n]) => `${i}:${n}`)
    .join(",");
  const dedup = new Map();
  for (const recipe of recipes) {
    const k = vectorKey(recipe);
    const previous = dedup.get(k);
    if (!previous || recipe.occupiedWidth < previous.occupiedWidth) dedup.set(k, recipe);
  }

  // Cuota por familia: mejor patrón con filler + patrón homogéneo que cubre el
  // remanente de demanda dominante. Evita un top-K global que pueda expulsar
  // una familia útil por área y produce columnas complementarias para B&B.
  const byFamily = new Map();
  for (const recipe of dedup.values()) {
    const familyKey = `${recipe.dominantTypeIndex}:${recipe.dominantRotated ? 1 : 0}`;
    if (!byFamily.has(familyKey)) byFamily.set(familyKey, []);
    byFamily.get(familyKey).push(recipe);
  }

  const selected = [];
  for (const group of byFamily.values()) {
    const fillers = group
      .filter((recipe) => recipe.origin === "repetitive-family+filler")
      .sort((a, b) => recipeArea(b) - recipeArea(a));
    const homogeneous = group
      .filter((recipe) => recipe.origin === "repetitive-family")
      .sort((a, b) => recipeArea(b) - recipeArea(a));
    const bestFiller = fillers[0] || null;

    if (bestFiller) {
      selected.push(bestFiller);
      const demand = +lines[bestFiller.dominantTypeIndex].cant || 0;
      const used = +bestFiller.usage[bestFiller.dominantTypeIndex] || 0;
      const residual = Math.max(0, demand - used);
      const residualPattern = homogeneous
        .filter((recipe) => (+recipe.usage[bestFiller.dominantTypeIndex] || 0) <= residual)
        .sort((a, b) =>
          (+b.usage[bestFiller.dominantTypeIndex] || 0) - (+a.usage[bestFiller.dominantTypeIndex] || 0)
          || recipeArea(b) - recipeArea(a)
        )[0]
        || homogeneous[0]
        || null;
      if (residualPattern) selected.push(residualPattern);
    } else {
      selected.push(...homogeneous.slice(0, 2));
    }
  }

  return selected.slice(0, +(options.maxPatterns ?? 24));
}

function newNode(x, y, w, h, dir, nivel) {
  return { x, y, w, h, dir, nivel, partes: [] };
}

function materializeStripRecipe(recipe, lines, config) {
  const W = +config.placaBase - +(config.refiladoX ?? 0);
  const H = +config.placaAltura - +(config.refiladoY ?? 0);
  const kerf = +(config.sierra ?? 0);
  const eps = 1e-9;
  let nextId = 0;
  let x = 0;
  const colocadas = [];
  const cortes = [];
  const restos = [];
  const root = newNode(0, 0, W, H, "x", 1);

  for (const strip of recipe.strips) {
    if (x + strip.width > W + eps) throw new Error("recipe-width-overflow");
    const child = newNode(x, 0, strip.width, H, "y", 2);
    const stripBlock = { x, y: 0, w: strip.width, h: H };
    root.partes.push({ cut: strip.width, type: 2, pieza: null, bloque: stripBlock, hijo: child });
    let y = 0;

    for (const item of strip.items) {
      const line = lines[item.typeIndex];
      if (!line) throw new Error("recipe-missing-type");
      for (let n = 0; n < item.count; n++) {
        if (y + item.altura > H + eps) throw new Error("recipe-height-overflow");
        const piece = {
          id: nextId++,
          base: +line.base,
          altura: +line.altura,
          detalle: line.detalle || "",
          veta: !!line.veta,
          cantos: line.cantos || null,
          ref: item.typeIndex,
          _corte: { base: +line.base, altura: +line.altura },
          _codigoXml: String(line.ref ?? item.typeIndex + 1),
        };
        const block = { x, y, w: item.base, h: item.altura };
        colocadas.push({
          x,
          y,
          base: item.base,
          altura: item.altura,
          rotada: !!item.rotated,
          pieza: piece,
          nivel: 2,
        });
        const leaf = newNode(x, y, item.base, item.altura, "x", 3);
        child.partes.push({ cut: item.altura, type: 1, pieza: piece, bloque: block, hijo: leaf });
        const cutY = y + item.altura;
        if (cutY < H - eps) {
          cortes.push({ x1: x, y1: cutY, x2: x + strip.width, y2: cutY, nivel: 2, largo: strip.width });
        }
        y = cutY + kerf;
      }
    }

    if (y < H - eps) {
      const h = H - y;
      if (h > eps) restos.push({ x, y, w: strip.width, h });
    }

    const cutX = x + strip.width;
    if (cutX < W - eps) cortes.push({ x1: cutX, y1: 0, x2: cutX, y2: H, nivel: 1, largo: H });
    x = cutX + kerf;
  }

  if (x < W - eps) {
    const w = W - x;
    if (w > eps) restos.push({ x, y: 0, w, h: H });
  }

  cortes.sort((a, b) => a.nivel - b.nivel);
  return { ancho: W, alto: H, colocadas, cortes, restos, arbol: root };
}

module.exports = {
  buildRepetitiveFamilyBasis,
  buildFillerStrips,
  materializeStripRecipe,
  orientations,
  countAlong,
  occupied,
};
