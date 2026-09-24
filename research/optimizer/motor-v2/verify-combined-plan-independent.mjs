#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const EPS = 1e-6;

function approx(a, b, eps = EPS) {
  return Math.abs(Number(a) - Number(b)) <= eps;
}

function rawAttrs(text) {
  const out = {};
  for (const match of String(text || "").matchAll(/([\w:.-]+)\s*=\s*["']([^"']*)["']/g)) {
    out[match[1].toLowerCase()] = match[2];
  }
  return out;
}

function independentXmlAudit(xml) {
  const panels = [...String(xml).matchAll(/<panel\d+\b([^>]*)>/gi)].map((m) => rawAttrs(m[1]));
  const roots = [...String(xml).matchAll(/<no\.0\b([^>]*)>/gi)].map((m) => rawAttrs(m[1]));
  const physicalBoards = panels.reduce((sum, attrs) => {
    const n = Number(attrs.num ?? 1);
    return sum + (Number.isFinite(n) && n > 0 ? n : 1);
  }, 0);
  return {
    sha256: crypto.createHash("sha256").update(xml).digest("hex"),
    panelTags: panels.length,
    physicalBoards,
    panelRectangles: panels.map((attrs) => ({
      l: Number(attrs.l),
      w: Number(attrs.w),
      thickness: Number(attrs.thickness),
      material: attrs.material ?? null,
      num: Number(attrs.num ?? 1),
    })),
    kerfValues: [...new Set(
      panels
        .map((attrs) => Number(attrs.saw ?? attrs.kerf))
        .filter(Number.isFinite),
    )],
    rootTrimReferences: [...new Set(
      roots.map((attrs) => Number(attrs.trim)).filter(Number.isFinite),
    )],
  };
}

function pairOverlaps(a, b) {
  return (
    a.x < b.x + b.base - EPS &&
    a.x + a.base > b.x + EPS &&
    a.y < b.y + b.altura - EPS &&
    a.y + a.altura > b.y + EPS
  );
}

function verifyCutSequence(board, kerf, maxStages) {
  const errors = [];
  const regions = [{ x: 0, y: 0, w: Number(board.ancho), h: Number(board.alto) }];
  const cuts = board.cortes || [];

  for (let ci = 0; ci < cuts.length; ci++) {
    const cut = cuts[ci];
    if (Number.isFinite(Number(cut.nivel)) && Number(cut.nivel) > maxStages) {
      errors.push(`cut_stage_exceeded:${ci}:${cut.nivel}>${maxStages}`);
    }

    const vertical = approx(cut.x1, cut.x2);
    const horizontal = approx(cut.y1, cut.y2);
    if (vertical === horizontal) {
      errors.push(`cut_not_axis_aligned:${ci}`);
      continue;
    }

    let regionIndex = -1;
    for (let ri = 0; ri < regions.length; ri++) {
      const r = regions[ri];
      if (
        vertical &&
        approx(cut.y1, r.y) &&
        approx(cut.y2, r.y + r.h) &&
        Number(cut.x1) >= r.x - EPS &&
        Number(cut.x1) <= r.x + r.w + EPS
      ) {
        regionIndex = ri;
        break;
      }
      if (
        horizontal &&
        approx(cut.x1, r.x) &&
        approx(cut.x2, r.x + r.w) &&
        Number(cut.y1) >= r.y - EPS &&
        Number(cut.y1) <= r.y + r.h + EPS
      ) {
        regionIndex = ri;
        break;
      }
    }

    if (regionIndex < 0) {
      errors.push(`cut_not_full_region:${ci}`);
      continue;
    }

    const r = regions.splice(regionIndex, 1)[0];
    if (vertical) {
      const cutX = Number(cut.x1);
      const leftW = cutX - r.x;
      const rightX = cutX + kerf;
      const rightW = r.x + r.w - rightX;
      if (leftW > EPS) regions.push({ x: r.x, y: r.y, w: leftW, h: r.h });
      if (rightW > EPS) regions.push({ x: rightX, y: r.y, w: rightW, h: r.h });
    } else {
      const cutY = Number(cut.y1);
      const topH = cutY - r.y;
      const bottomY = cutY + kerf;
      const bottomH = r.y + r.h - bottomY;
      if (topH > EPS) regions.push({ x: r.x, y: r.y, w: r.w, h: topH });
      if (bottomH > EPS) regions.push({ x: r.x, y: bottomY, w: r.w, h: bottomH });
    }
  }

  const placements = board.colocadas || [];
  let liberated = 0;
  for (const p of placements) {
    const exact = regions.filter((r) =>
      approx(r.x, p.x) &&
      approx(r.y, p.y) &&
      approx(r.w, p.base) &&
      approx(r.h, p.altura)
    );
    if (exact.length === 1) liberated++;
    else errors.push(`piece_not_liberated:${p.pieza?.id ?? "?"}`);
  }

  return {
    ok: errors.length === 0 && liberated === placements.length,
    errors,
    liberated,
    cuts: cuts.length,
    finalRegions: regions.length,
    maxCutLevel: cuts.reduce(
      (max, cut) => Math.max(max, Number.isFinite(Number(cut.nivel)) ? Number(cut.nivel) : 0),
      0,
    ),
  };
}

function canonicalPlanDigest(plan) {
  const boards = (plan?.placas || []).map((board) => {
    const placements = (board.colocadas || [])
      .map((p) => ({
        ref: Number(p.pieza?.ref),
        x: Number(p.x),
        y: Number(p.y),
        base: Number(p.base),
        altura: Number(p.altura),
        rotada: Boolean(p.rotada),
      }))
      .sort((a, b) =>
        a.ref - b.ref ||
        a.x - b.x ||
        a.y - b.y ||
        a.base - b.base ||
        a.altura - b.altura ||
        Number(a.rotada) - Number(b.rotada)
      );
    const cuts = (board.cortes || []).map((c) => ({
      x1: Number(c.x1),
      y1: Number(c.y1),
      x2: Number(c.x2),
      y2: Number(c.y2),
      nivel: Number(c.nivel || 0),
    }));
    return JSON.stringify({
      ancho: Number(board.ancho),
      alto: Number(board.alto),
      placements,
      cuts,
    });
  }).sort();
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(boards))
    .digest("hex");
}

function verifyBundle(bundle) {
  const errors = [];
  const warnings = [];
  const expected = bundle.expected;
  const plan = bundle.plan;
  const types = expected.pieces || [];
  const expectedCounts = types.map((type) => Number(type.quantity));
  const actualCounts = new Array(types.length).fill(0);
  const ids = new Set();
  const duplicateIds = new Set();
  let placed = 0;
  let maxCutLevel = 0;
  let boardsAbove2Stages = 0;
  let boardsAboveExpectedStages = 0;
  const boardReports = [];

  if (!plan || !Array.isArray(plan.placas)) {
    errors.push("missing_plan");
    return { ok: false, errors, warnings };
  }

  const expectedUsefulW = Number(expected.useful.width);
  const expectedUsefulH = Number(expected.useful.height);
  const kerf = Number(expected.kerf);
  const maxStages = Number(expected.stages ?? 4);

  for (let bi = 0; bi < plan.placas.length; bi++) {
    const board = plan.placas[bi];
    const boardErrors = [];

    if (!approx(board.ancho, expectedUsefulW) || !approx(board.alto, expectedUsefulH)) {
      boardErrors.push(
        `board_dimensions:${board.ancho}x${board.alto}!=${expectedUsefulW}x${expectedUsefulH}`,
      );
    }

    const placements = board.colocadas || [];
    for (let pi = 0; pi < placements.length; pi++) {
      const p = placements[pi];
      placed++;
      const ref = Number(p.pieza?.ref);
      if (!Number.isInteger(ref) || ref < 0 || ref >= types.length) {
        boardErrors.push(`invalid_ref:${bi}:${pi}:${p.pieza?.ref}`);
        continue;
      }
      actualCounts[ref]++;

      const id = p.pieza?.id;
      if (id === undefined || id === null) boardErrors.push(`missing_piece_id:${bi}:${pi}`);
      else if (ids.has(String(id))) duplicateIds.add(String(id));
      else ids.add(String(id));

      const type = types[ref];
      const normal = approx(p.base, type.width) && approx(p.altura, type.height);
      const rotated = approx(p.base, type.height) && approx(p.altura, type.width);
      if (!normal && !rotated) {
        boardErrors.push(
          `piece_dimensions:${id}:${p.base}x${p.altura} expected ${type.width}x${type.height}`,
        );
      }

      const rotationForbidden =
        type.rotationAllowed === false ||
        (Boolean(expected.materialHasGrain) && Boolean(type.grain));
      if (rotationForbidden && !normal) {
        boardErrors.push(`forbidden_rotation:${id}:ref=${ref}`);
      }
      if (Boolean(p.rotada) && !rotated && !approx(type.width, type.height)) {
        boardErrors.push(`rotation_flag_mismatch:${id}`);
      }

      if (
        Number(p.x) < -EPS ||
        Number(p.y) < -EPS ||
        Number(p.x) + Number(p.base) > Number(board.ancho) + EPS ||
        Number(p.y) + Number(p.altura) > Number(board.alto) + EPS
      ) {
        boardErrors.push(`out_of_bounds:${id}`);
      }
    }

    for (let i = 0; i < placements.length; i++) {
      for (let j = i + 1; j < placements.length; j++) {
        if (pairOverlaps(placements[i], placements[j])) {
          boardErrors.push(
            `overlap:${placements[i].pieza?.id ?? "?"}:${placements[j].pieza?.id ?? "?"}`,
          );
        }
      }
    }

    const cutReport = verifyCutSequence(board, kerf, maxStages);
    boardErrors.push(...cutReport.errors);
    maxCutLevel = Math.max(maxCutLevel, cutReport.maxCutLevel);
    if (cutReport.maxCutLevel > 2) boardsAbove2Stages++;
    if (cutReport.maxCutLevel > maxStages) boardsAboveExpectedStages++;

    boardReports.push({
      board: bi + 1,
      pieces: placements.length,
      cuts: cutReport.cuts,
      maxCutLevel: cutReport.maxCutLevel,
      ok: boardErrors.length === 0,
      errors: boardErrors,
    });
    errors.push(...boardErrors.map((error) => `board_${bi + 1}:${error}`));
  }

  for (let i = 0; i < expectedCounts.length; i++) {
    if (actualCounts[i] !== expectedCounts[i]) {
      errors.push(`demand_mismatch:ref=${i}:expected=${expectedCounts[i]}:actual=${actualCounts[i]}`);
    }
  }
  if (duplicateIds.size) errors.push(`duplicate_piece_ids:${[...duplicateIds].join(",")}`);

  const expectedPieces = expectedCounts.reduce((a, b) => a + b, 0);
  if (placed !== expectedPieces) errors.push(`piece_total:${placed}!=${expectedPieces}`);
  if (ids.size !== expectedPieces) errors.push(`unique_piece_ids:${ids.size}!=${expectedPieces}`);

  if (Number(bundle.pipeline?.combinedBoards) !== plan.placas.length) {
    errors.push(
      `combined_board_count:${plan.placas.length}!=${bundle.pipeline?.combinedBoards}`,
    );
  }

  let xmlAudit = null;
  if (bundle.sourcePath && fs.existsSync(bundle.sourcePath)) {
    const xml = fs.readFileSync(bundle.sourcePath, "utf8");
    xmlAudit = independentXmlAudit(xml);

    if (xmlAudit.physicalBoards !== Number(bundle.leptonBoards)) {
      errors.push(
        `lepton_physical_boards:${xmlAudit.physicalBoards}!=${bundle.leptonBoards}`,
      );
    }

    const expectedPanelSorted = [
      Number(expected.panel.width),
      Number(expected.panel.height),
    ].sort((a, b) => a - b);
    for (const rect of xmlAudit.panelRectangles) {
      const actualSorted = [rect.l, rect.w].sort((a, b) => a - b);
      if (
        Number.isFinite(actualSorted[0]) &&
        Number.isFinite(actualSorted[1]) &&
        (!approx(actualSorted[0], expectedPanelSorted[0]) ||
          !approx(actualSorted[1], expectedPanelSorted[1]))
      ) {
        errors.push(
          `source_panel_dimensions:${rect.l}x${rect.w}!=${expected.panel.width}x${expected.panel.height}`,
        );
        break;
      }
    }

    if (
      xmlAudit.kerfValues.length &&
      xmlAudit.kerfValues.some((value) => !approx(value, kerf))
    ) {
      errors.push(
        `source_kerf:${xmlAudit.kerfValues.join(",")}!=${kerf}`,
      );
    }

    if (xmlAudit.rootTrimReferences.some((value) => Math.abs(value) > EPS)) {
      warnings.push(
        "XML root-node trim references are non-zero; canonical project parsing treats these as cut-tree references, not global panel refilado.",
      );
    }
  } else if (bundle.sourcePath) {
    warnings.push(`source XML not found at ${bundle.sourcePath}`);
  }

  return {
    ok: errors.length === 0,
    caseId: bundle.caseId,
    boards: plan.placas.length,
    piecesExpected: expectedPieces,
    piecesPlaced: placed,
    uniquePieceIds: ids.size,
    countsExact: actualCounts.every((count, i) => count === expectedCounts[i]),
    panel: expected.panel,
    trim: expected.trim,
    useful: expected.useful,
    kerf,
    stagesAllowed: maxStages,
    maxCutLevel,
    boardsAbove2Stages,
    boardsAboveExpectedStages,
    allBoardsAtMost2Stages: boardsAbove2Stages === 0,
    planDigest: canonicalPlanDigest(plan),
    leptonBoards: bundle.leptonBoards,
    leptonPhysicalBoardsFromXml: xmlAudit?.physicalBoards ?? null,
    xmlAudit,
    errors,
    warnings,
    boardReports: boardReports.filter((board) => !board.ok),
  };
}

function inputFiles(arg) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const target = path.resolve(arg || path.join(here, "combined-plan-audit"));
  if (!fs.existsSync(target)) throw new Error(`input not found: ${target}`);
  const stat = fs.statSync(target);
  if (stat.isFile()) return [target];
  return fs.readdirSync(target)
    .filter((name) => name.endsWith(".combined-plan.json"))
    .sort()
    .map((name) => path.join(target, name));
}

const files = inputFiles(process.argv[2]);
if (!files.length) throw new Error("no combined-plan audit files found");

const reports = files.map((file) => {
  const bundle = JSON.parse(fs.readFileSync(file, "utf8"));
  return { file, ...verifyBundle(bundle) };
});

const summary = {
  schema: "optimizer-independent-combined-plan-verification-v1",
  generatedAt: new Date().toISOString(),
  cases: reports.length,
  valid: reports.filter((report) => report.ok).length,
  invalid: reports.filter((report) => !report.ok).length,
  allValid: reports.every((report) => report.ok),
  allAtMost2Stages: reports.every((report) => report.allBoardsAtMost2Stages),
  reports,
};

const out = path.resolve(
  process.env.SERIAL_INDEPENDENT_VERIFY_OUTPUT ||
  path.join(path.dirname(files[0]), "INDEPENDENT_VERIFICATION.json"),
);
fs.writeFileSync(out, JSON.stringify(summary, null, 2) + "\n");

for (const report of reports) {
  console.log("VERIFY " + JSON.stringify({
    id: report.caseId,
    ok: report.ok,
    boards: report.boards,
    pieces: report.piecesPlaced,
    countsExact: report.countsExact,
    maxCutLevel: report.maxCutLevel,
    boardsAbove2Stages: report.boardsAbove2Stages,
    lepton: report.leptonBoards,
    leptonPhysical: report.leptonPhysicalBoardsFromXml,
    digest: report.planDigest,
    errors: report.errors.length,
    warnings: report.warnings.length,
  }));
}
console.log("VERIFY_SUMMARY " + JSON.stringify({
  cases: summary.cases,
  valid: summary.valid,
  invalid: summary.invalid,
  allValid: summary.allValid,
  allAtMost2Stages: summary.allAtMost2Stages,
  output: out,
}));

if (!summary.allValid) process.exitCode = 1;
