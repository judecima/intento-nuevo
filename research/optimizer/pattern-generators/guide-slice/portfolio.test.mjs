import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { selectIndustrialMode, generateIndustrialPortfolio } from "./portfolio.mjs";

const external = JSON.parse(readFileSync(new URL("./fixtures/4961912-normalized.json", import.meta.url), "utf8"));
const lines = external.lines.map((line) => ({ ...line, detalle: line.ref, veta: false, cantos: null }));
const config = { placaBase: external.board.l, placaAltura: external.board.w,
  refiladoX: external.board.trim, refiladoY: external.board.trim, sierra: external.board.saw, etapas: 4,
  materialConVeta: false, descontarCanto: false, cantoEspesor: 0, restoMin: 250, restoMax: 400 };

test("4961912 is a useful negative gate fixture, not a triple-enumeration target", () => {
  assert.equal(external.pieceTypes, 31);
  assert.equal(external.pieceQuantity, 61);
  assert.equal(external.areaLowerBound, 2);
  assert.equal(external.maxRepeat, 6);
  assert.equal(selectIndustrialMode(lines).mode, "NOT_APPLICABLE");
  const result = generateIndustrialPortfolio(lines, config);
  assert.equal(result.status, "NOT_APPLICABLE");
  assert.equal(result.patterns.length, 0);
  assert.equal(result.telemetry.calls, 0);
});
