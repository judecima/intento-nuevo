import { createRequire } from "node:module";
import { join } from "node:path";
import { ROOT } from "./identity.mjs";
const require = createRequire(import.meta.url);
const legacy = join(ROOT, "src/lib/optimizer/legacy");
export function installAdapter(job, observe) {
  for (const file of ["motor", "patrones", "cobertura", "materializar", "oneboard", "v10"]) {
    if (require.cache[require.resolve(join(legacy, file + ".cjs"))]) throw new Error(`LOAD_ORDER: ${file} already loaded`);
  }
  const probe = { generatorCalls: 0, monotypeCalls: 0, legacyGeneratorCalls: 0, legacyMonotypeCalls: 0,
    legacyPackingDuringB: 0, masterCalls: 0, rounds: [], captured: null, generatorResults: [], selectedPatterns: [], candidates: [] };
  let phase = "pipeline";
  const motor = require(join(legacy, "motor.cjs")), pack = motor.optimizar;
  motor.optimizar = function (...args) {
    if (job.arm === "B" && phase === "generation") probe.legacyPackingDuringB++;
    return pack.apply(this, args);
  };
  const patterns = require(join(legacy, "patrones.cjs"));
  const original = { generate: patterns.generarPatrones, mono: patterns.patronesMonotipo };
  const generate = function (lines, config, rounds = 40, ...rest) {
    probe.generatorCalls++; probe.rounds.push(rounds);
    const previous = phase; phase = "generation";
    try {
      const pool = observe.measure("generation", () => {
        if (job.fault === "throw-generator") throw new Error("INJECTED_GENERATOR_FAILURE");
        if (job.arm !== "B") { probe.legacyGeneratorCalls++; return original.generate.call(this, lines, config, rounds, ...rest); }
        const { createContext } = require("../context.mjs");
        const { generatePatterns } = observe.b0 ?? require("../and-or.mjs");
        const generated = generatePatterns(createContext(lines, config), job.generatorBudget,
          { maxVariantsPerUsageVector: job.maxVariantsPerUsageVector });
        probe.generatorResults.push({ status: generated.status, searchRestricted: generated.searchRestricted,
          restrictionReasons: generated.restrictionReasons, failures: generated.failures,
          telemetry: generated.telemetry, provenance: generated.provenance,
          rootHash: generated.rootHash, patternPoolHash: generated.patternPoolHash, orderedPoolHash: generated.orderedPoolHash });
        if (generated.status === "INVALID") observe.failure("B0_INVALID", generated.failures);
        return generated.patterns;
      });
      if (job.fault === "invalid-pattern" && pool.length) {
        const corrupt = structuredClone(pool); corrupt[0].placa.colocadas[0].x = config.placaBase * 10;
        observe.pool(corrupt, lines, config, "generation"); return corrupt;
      }
      observe.pool(pool, lines, config, "generation"); return pool;
    } catch (error) { observe.failure("GENERATOR_EXCEPTION", String(error.message)); throw error; }
    finally { phase = previous; }
  };
  const mono = function (...args) {
    probe.monotypeCalls++;
    if (job.arm === "B") return []; // no legacy monotype subsidy
    try {
      const result = observe.measure("monotype", () => { probe.legacyMonotypeCalls++; return original.mono.apply(this, args); });
      observe.pool(result, args[0], args[1], "monotype"); return result;
    } catch (error) { observe.failure("MONOTYPE_EXCEPTION", String(error.message)); throw error; }
  };
  if (job.arm !== "A-direct") { patterns.generarPatrones = generate; patterns.patronesMonotipo = mono; }
  const coverage = require(join(legacy, "cobertura.cjs")), solve = coverage.resolverCobertura;
  coverage.resolverCobertura = function (...args) {
    probe.masterCalls++;
    observe.pool(args[0], probe.captured.lines, probe.captured.config, "master");
    try {
      const handle = observe.measure("master", () => solve.apply(this, args));
      if (handle) {
        const resolver = handle.resolver;
        handle.resolver = function (...params) {
          try {
            const result = observe.measure("master", () => resolver.apply(this, params));
            probe.selectedPatterns.push(result?.plan ?? null); return result;
          } catch (error) { observe.failure("MASTER_EXCEPTION", String(error.message)); throw error; }
        };
      }
      return handle;
    } catch (error) { observe.failure("MASTER_EXCEPTION", String(error.message)); throw error; }
  };
  const material = require(join(legacy, "materializar.cjs")), materialize = material.materializar;
  material.materializar = function (...args) {
    try {
      const plan = observe.measure("materialization", () => materialize.apply(this, args));
      probe.candidates.push(plan); return plan;
    } catch (error) { observe.failure("MATERIALIZATION_EXCEPTION", String(error.message)); throw error; }
  };
  const v10 = require(join(legacy, "v10.cjs")), optimize = v10.optimizarV10;
  const captureOnly = new Error("H3_CAPTURE_ONLY");
  v10.optimizarV10 = function (lines, config, ...rest) {
    probe.captured = { lines: structuredClone(lines), config: structuredClone(config) };
    if (job.mode === "generation-only") throw captureOnly;
    return optimize.call(this, lines, config, ...rest);
  };
  return { probe, captureOnly, generateOnly() {
    const { lines, config } = probe.captured;
    if (job.arm !== "A-direct") return generate(lines, config, 40).concat(mono(lines, config));
    // Direct control: no generator wrapper on either invocation.
    const pool = observe.measure("generation", () => original.generate(lines, config, 40))
      .concat(observe.measure("monotype", () => original.mono(lines, config)));
    observe.pool(pool, lines, config, "direct"); return pool;
  }, motor };
}
