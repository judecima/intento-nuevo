import { createContext } from "./context.mjs";
export const H2_LIMITS = Object.freeze({ maxExpansions: 200000, maxAndCombinations: 500000,
  maxFrontierEntries: 100000, maxMaterializations: 100000 });
const line = (base = 1, altura = 1, cant = 3, ref = "A", veta = false) => ({ base, altura, cant, ref, veta });
const fixture = (name, lines = [line()], options = {}) => ({ name,
  context: createContext(lines, { placaBase: 2, placaAltura: 1, etapas: 1, sierra: 0, restoMin: 0.1, restoMax: 0.1, ...options }) });
export const H2_FIXTURES = [
  fixture("one-and-two"),
  fixture("kerf", [line()], { placaBase: 2.5, sierra: 0.5 }),
  fixture("clipped-kerf", [line(1, 1, 1)], { placaBase: 1.2, sierra: 0.5 }),
  fixture("terminal", [line(1, 1, 2)], { placaAltura: 2 }),
  fixture("two-stages", [line(1, 1, 1)], { placaAltura: 2, etapas: 2 }),
  fixture("distinct-types", [line(1, 1, 1, "A"), line(1, 1, 1, "B")]),
  fixture("rotation", [line(2, 1, 1, "A", true)], { placaAltura: 2 }),
  fixture("grain", [line(2, 1, 1, "A", true)], { placaAltura: 2, materialConVeta: true }),
  fixture("decimal-trim", [line(1.005, 1.005, 2)], { placaBase: 2.12, placaAltura: 1.02, refiladoX: 0.11, refiladoY: 0.015 }),
];
