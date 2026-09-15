import crypto from 'node:crypto';

const round = (value, digits = 6) => {
  if (!Number.isFinite(value)) return 0;
  const f = 10 ** digits;
  return Math.round(value * f) / f;
};

const mean = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
const weightedMean = (pairs) => {
  const w = pairs.reduce((s, [, weight]) => s + weight, 0);
  return w ? pairs.reduce((s, [value, weight]) => s + value * weight, 0) / w : 0;
};
const cv = (xs) => {
  if (!xs.length) return 0;
  const m = mean(xs);
  if (!m) return 0;
  const variance = mean(xs.map((x) => (x - m) ** 2));
  return Math.sqrt(variance) / m;
};
const ratio = (num, den) => den ? num / den : 0;

function normalizedLine(line) {
  const a = Number(line.base) || 0;
  const b = Number(line.altura) || 0;
  const rotLocked = Boolean(line.veta);
  const base = rotLocked ? a : Math.max(a, b);
  const altura = rotLocked ? b : Math.min(a, b);
  return { base, altura, cant: Number(line.cant) || 0, veta: rotLocked };
}

export function canonicalGeometryObject(c) {
  const cfg = c?.config ?? {};
  const lines = (c?.lines ?? []).map(normalizedLine).sort((x, y) => x.base - y.base || x.altura - y.altura || Number(x.veta) - Number(y.veta) || x.cant - y.cant);
  return {
    panel: [Number(cfg.placaBase) || 0, Number(cfg.placaAltura) || 0],
    trim: [Number(cfg.refiladoX) || 0, Number(cfg.refiladoY) || 0],
    kerf: Number(cfg.sierra) || 0,
    stages: Number(cfg.etapas) || 0,
    materialWithGrain: Boolean(cfg.materialConVeta),
    descontarCanto: Boolean(cfg.descontarCanto),
    cantoEspesor: Number(cfg.cantoEspesor) || 0,
    lines,
  };
}

export function geometrySignature(c) {
  return crypto.createHash('sha256').update(JSON.stringify(canonicalGeometryObject(c))).digest('hex');
}

export function splitGeometry(signature) {
  const bucket = parseInt(signature.slice(0, 8), 16) % 10;
  if (bucket <= 5) return 'train';
  if (bucket <= 7) return 'validation';
  return 'test';
}

export function extractGeometryFeatures(c, { lb = c?.lb, fastBoards = null } = {}) {
  const cfg = c?.config ?? {};
  const lines = (c?.lines ?? []).map(normalizedLine).filter((x) => x.cant > 0);
  const pieceTypes = lines.length;
  const pieceQty = lines.reduce((s, x) => s + x.cant, 0);
  const panelArea = (Number(cfg.placaBase) || 0) * (Number(cfg.placaAltura) || 0);
  const totalArea = lines.reduce((s, x) => s + x.base * x.altura * x.cant, 0);
  const lbValue = Number(lb) || 0;
  const fast = Number.isFinite(fastBoards) ? Number(fastBoards) : null;
  const widths = lines.map((x) => x.base), heights = lines.map((x) => x.altura), areas = lines.map((x) => x.base * x.altura);
  const aspects = lines.map((x) => ratio(Math.max(x.base, x.altura), Math.min(x.base, x.altura)));
  const repeatedTypes = lines.filter((x) => x.cant >= 2), repeatedQty = repeatedTypes.reduce((s, x) => s + x.cant, 0);
  const stripTypes = lines.filter((x) => x.cant >= 2 && ratio(Math.max(x.base, x.altura), Math.min(x.base, x.altura)) >= 2), stripQty = stripTypes.reduce((s, x) => s + x.cant, 0);
  const widthQty = new Map(), heightQty = new Map(), widthTypes = new Map(), heightTypes = new Map();
  for (const x of lines) {
    widthQty.set(x.base, (widthQty.get(x.base) ?? 0) + x.cant); heightQty.set(x.altura, (heightQty.get(x.altura) ?? 0) + x.cant);
    widthTypes.set(x.base, (widthTypes.get(x.base) ?? 0) + 1); heightTypes.set(x.altura, (heightTypes.get(x.altura) ?? 0) + 1);
  }
  const maxMapValue = (m) => m.size ? Math.max(...m.values()) : 0;
  const panelShort = Math.min(Number(cfg.placaBase) || 0, Number(cfg.placaAltura) || 0), panelLong = Math.max(Number(cfg.placaBase) || 0, Number(cfg.placaAltura) || 0);
  const large = lines.filter((x) => x.base * x.altura >= panelArea * 0.2);
  const grain = lines.filter((x) => x.veta);
  return Object.freeze({
    pieceQty, pieceTypes, avgQtyPerType: round(ratio(pieceQty, pieceTypes)), lb: lbValue, fastGap: fast == null ? null : fast - lbValue,
    panelArea, panelAspect: round(ratio(panelLong, panelShort)), kerfRatio: round(ratio(Number(cfg.sierra) || 0, panelShort)),
    totalAreaRatio: round(panelArea ? totalArea / panelArea : 0), areaFillVsLB: round(panelArea && lbValue ? totalArea / (panelArea * lbValue) : 0),
    repeatedTypeRatio: round(ratio(repeatedTypes.length, pieceTypes)), repeatedQtyRatio: round(ratio(repeatedQty, pieceQty)),
    stripTypeDensity: round(ratio(stripTypes.length, pieceTypes)), stripQtyDensity: round(ratio(stripQty, pieceQty)),
    bestExactDimTypeRatio: round(ratio(Math.max(maxMapValue(widthTypes), maxMapValue(heightTypes)), pieceTypes)), bestExactDimQtyRatio: round(ratio(Math.max(maxMapValue(widthQty), maxMapValue(heightQty)), pieceQty)),
    uniqueWidthRatio: round(ratio(widthQty.size, pieceTypes)), uniqueHeightRatio: round(ratio(heightQty.size, pieceTypes)), widthCv: round(cv(widths)), heightCv: round(cv(heights)), areaCv: round(cv(areas)),
    aspectMean: round(mean(aspects)), aspectMax: round(aspects.length ? Math.max(...aspects) : 0), weightedAspectMean: round(weightedMean(lines.map((x) => [ratio(Math.max(x.base, x.altura), Math.min(x.base, x.altura)), x.cant]))),
    largeTypeRatio: round(ratio(large.length, pieceTypes)), largeQtyRatio: round(ratio(large.reduce((s, x) => s + x.cant, 0), pieceQty)),
    grainTypeRatio: round(ratio(grain.length, pieceTypes)), grainQtyRatio: round(ratio(grain.reduce((s, x) => s + x.cant, 0), pieceQty)), materialWithGrain: Boolean(cfg.materialConVeta),
  });
}

export function describeCaseForDirectedGeneration(c, metrics = {}) {
  const signature = geometrySignature(c);
  return { signature, split: splitGeometry(signature), features: extractGeometryFeatures(c, metrics) };
}
