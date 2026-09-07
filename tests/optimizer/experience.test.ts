import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  EXACT_FINGERPRINT_VERSION,
  EXPERIENCE_STORE_VERSION,
  LEGACY_OPTIMIZER_VERSION,
  benchmarkInputFromCanonicalCase,
  benchmarkProfileForStrategy,
  buildPieceKeys,
  createDirectoryExperienceStore,
  createExperienceEntry,
  createExperienceStats,
  createFileExperienceStore,
  createMemoryExperienceStore,
  experienceEntryKey,
  experienceMemoryEnabled,
  freezeExperienceStore,
  generateMachineXml,
  isEntryCompatible,
  optimizeProject,
  optimizeProjectWithExperience,
  parseCanonicalXml,
  revalidateExactHit,
  type CanonicalOptimizationCase,
  type ExactExperienceEntry,
  type OptimizationInput
} from "@/lib/optimizer";

const tempRoot = mkdtempSync(join(tmpdir(), "experience-store-"));

afterAll(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

const baseInput: OptimizationInput = {
  board: { width: 2750, height: 1830, thickness: 18 },
  material: { description: "MDF Blanco 18mm", hasGrain: false, thickness: 18 },
  kerf: 4.5,
  trim: { x: 0, y: 0 },
  constraints: { profile: "fast", stages: 4, minRemnant: 250, minCommercialRemnantLongSide: 400 },
  strategy: "baseline",
  pieces: [
    { reference: "A", description: "Tapa", quantity: 2, width: 900, height: 500 },
    { reference: "B", description: "Lateral", quantity: 3, width: 700, height: 450 },
    { reference: "C", description: "Estante", quantity: 4, width: 600, height: 320 }
  ]
};

/** El mismo problema geometrico con otras etiquetas: mismo fingerprint, otras referencias. */
const relabeledInput: OptimizationInput = {
  ...baseInput,
  pieces: [
    { reference: "Z1", description: "Cubierta", quantity: 2, width: 900, height: 500 },
    { reference: "Z2", description: "Costado", quantity: 3, width: 700, height: 450 },
    { reference: "Z3", description: "Balda", quantity: 4, width: 600, height: 320 }
  ]
};

const key = { exactFingerprint: "fp-test", strategy: "baseline" as const, profile: "fast" as const };

function entryFor(input: OptimizationInput, exactFingerprint = "fp-test"): ExactExperienceEntry {
  const plan = optimizeProject(input);
  const pieceKeys = buildPieceKeys(plan, input);
  if (!pieceKeys) throw new Error("piece keys");
  return createExperienceEntry({ exactFingerprint, strategy: "baseline", profile: "fast", plan, pieceKeys });
}

function fingerprintOf(input: OptimizationInput): string {
  const probe = createMemoryExperienceStore();
  return optimizeProjectWithExperience(input, { enabled: true, store: probe, record: false }).experience
    .exactFingerprint as string;
}

describe("1. Experience Store / save y get", () => {
  it("guarda y recupera una entrada", () => {
    const store = createMemoryExperienceStore();
    store.save(entryFor(baseInput));

    const entry = store.get(key);
    expect(store.size()).toBe(1);
    expect(entry).not.toBeNull();
    expect(entry?.boards).toBeGreaterThan(0);
    expect(entry?.plan.metrics.expectedPieceCount).toBe(9);
    expect(entry?.metrics?.originalEngineMs).toBeTypeOf("number");
  });

  it("devuelve null cuando no hay entrada", () => {
    expect(createMemoryExperienceStore().get(key)).toBeNull();
  });

  it("no confunde estrategias ni perfiles distintos", () => {
    const store = createMemoryExperienceStore();
    store.save(entryFor(baseInput));

    expect(store.get({ ...key, strategy: "v10" })).toBeNull();
    expect(store.get({ ...key, profile: "balanced" })).toBeNull();
    expect(store.get({ exactFingerprint: "fp-test", strategy: "baseline" })).toBeNull();
    expect(experienceEntryKey({ exactFingerprint: "fp", strategy: "baseline" })).toBe("fp|baseline|default");
  });

  it("respeta maxEntries descartando la mas antigua", () => {
    const store = createMemoryExperienceStore({ maxEntries: 2 });
    for (const fingerprint of ["fp-1", "fp-2", "fp-3"]) store.save(entryFor(baseInput, fingerprint));

    expect(store.size()).toBe(2);
    expect(store.get({ ...key, exactFingerprint: "fp-1" })).toBeNull();
    expect(store.get({ ...key, exactFingerprint: "fp-3" })).not.toBeNull();
  });

  it("persiste en un archivo local y lo relee", () => {
    const path = join(tempRoot, "store.json");
    createFileExperienceStore(path).save(entryFor(baseInput));

    const reopened = createFileExperienceStore(path);
    expect(reopened.size()).toBe(1);
    expect(reopened.get(key)?.plan.metrics.boardCount).toBeGreaterThan(0);
    expect(JSON.parse(readFileSync(path, "utf8")).storeVersion).toBe(EXPERIENCE_STORE_VERSION);
  });

  it("con autoFlush false solo escribe al llamar flush", () => {
    const path = join(tempRoot, "deferred.json");
    const store = createFileExperienceStore(path, { autoFlush: false });
    store.save(entryFor(baseInput));

    expect(createFileExperienceStore(path).size()).toBe(0);
    store.flush();
    expect(createFileExperienceStore(path).size()).toBe(1);
  });

  it("un store congelado no acepta escrituras", () => {
    const store = createMemoryExperienceStore();
    store.save(entryFor(baseInput));
    const frozen = freezeExperienceStore(store);

    frozen.save(entryFor(baseInput, "fp-nuevo"));
    expect(frozen.size()).toBe(1);
    expect(frozen.get({ ...key, exactFingerprint: "fp-nuevo" })).toBeNull();
    expect(frozen.get(key)).not.toBeNull();
  });
});

describe("2. Miss", () => {
  it("la primera corrida es miss y queda registrada", () => {
    const store = createMemoryExperienceStore();
    const stats = createExperienceStats();
    const first = optimizeProjectWithExperience(baseInput, { enabled: true, store, stats });

    expect(first.experience.outcome).toBe("miss");
    expect(first.experience.recorded).toBe(true);
    expect(first.experience.exactFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(store.size()).toBe(1);
    expect(stats).toMatchObject({ cases: 1, misses: 1, exactHits: 0, recorded: 1 });
  });

  it("record false permite consultar sin aprender", () => {
    const store = createMemoryExperienceStore();
    const result = optimizeProjectWithExperience(baseInput, { enabled: true, store, record: false });

    expect(result.experience.outcome).toBe("miss");
    expect(result.experience.recorded).toBe(false);
    expect(store.size()).toBe(0);
  });

  it("un pedido distinto no reutiliza el plan guardado", () => {
    const store = createMemoryExperienceStore();
    optimizeProjectWithExperience(baseInput, { enabled: true, store });
    const other = optimizeProjectWithExperience(
      { ...baseInput, pieces: [{ reference: "A", quantity: 2, width: 901, height: 500 }] },
      { enabled: true, store }
    );

    expect(other.experience.outcome).toBe("miss");
    expect(store.size()).toBe(2);
  });
});

describe("3. Hit", () => {
  it("la segunda corrida del mismo pedido es hit", () => {
    const store = createMemoryExperienceStore();
    const stats = createExperienceStats();
    optimizeProjectWithExperience(baseInput, { enabled: true, store, stats });
    const second = optimizeProjectWithExperience(baseInput, { enabled: true, store, stats });

    expect(second.experience.outcome).toBe("hit");
    expect(stats).toMatchObject({ cases: 2, exactHits: 1, misses: 1, invalidCacheEntries: 0, fallbacks: 0 });
  });

  it("el hit no ejecuta el motor y reporta el desglose de tiempos", () => {
    const store = createMemoryExperienceStore();
    optimizeProjectWithExperience(baseInput, { enabled: true, store });
    const hit = optimizeProjectWithExperience(baseInput, { enabled: true, store });

    expect(hit.experience.timings.engineMs).toBe(0);
    expect(hit.experience.timings.totalMs).toBeGreaterThan(0);
    expect(hit.experience.timings.validationMs).toBeGreaterThanOrEqual(0);
    expect(hit.experience.originalEngineMs).toBeTypeOf("number");
  });

  it("el plan devuelto por un hit no comparte estructura con el store", () => {
    const store = createMemoryExperienceStore();
    optimizeProjectWithExperience(baseInput, { enabled: true, store });
    const hit = optimizeProjectWithExperience(baseInput, { enabled: true, store });

    const guardado = store.list()[0] as ExactExperienceEntry;
    hit.placements[0]!.x = -12345;
    expect(guardado.plan.placements[0]!.x).not.toBe(-12345);
  });
});

describe("4. Fingerprint version mismatch", () => {
  it("una entrada de otra version de fingerprint no se reutiliza", () => {
    const store = createMemoryExperienceStore();
    store.save({ ...entryFor(baseInput), fingerprintVersion: "experience-exact-v0" });

    expect(store.get(key)).toBeNull();
    expect(revalidateExactHit({ ...entryFor(baseInput), fingerprintVersion: "v0" }, baseInput)).toMatchObject({
      ok: false,
      reason: "incompatible-version"
    });
    expect(EXACT_FINGERPRINT_VERSION).toBe("experience-exact-v1");
  });
});

describe("5. Optimizer version mismatch", () => {
  it("una entrada de otra version de motor no se reutiliza", () => {
    const store = createMemoryExperienceStore();
    store.save({ ...entryFor(baseInput), optimizerVersion: "otro-motor" });

    expect(store.get(key)).toBeNull();
    expect(revalidateExactHit({ ...entryFor(baseInput), optimizerVersion: "otro" }, baseInput)).toMatchObject({
      ok: false,
      reason: "incompatible-version"
    });
    expect(entryFor(baseInput).optimizerVersion).toBe(LEGACY_OPTIMIZER_VERSION);
  });

  it("una entrada de otra version de store no se reutiliza", () => {
    const store = createMemoryExperienceStore();
    store.save({ ...entryFor(baseInput), storeVersion: "experience-store-v0" });

    expect(store.get(key)).toBeNull();
    expect(isEntryCompatible(entryFor(baseInput))).toBe(true);
  });
});

describe("6. Plan invalido", () => {
  const entry = entryFor(baseInput);

  it("rechaza un plan guardado marcado como invalido", () => {
    const invalid = { ...entry, plan: { ...entry.plan, validation: { ...entry.plan.validation, ok: false } } };
    expect(revalidateExactHit(invalid, baseInput)).toMatchObject({ ok: false, reason: "stored-plan-invalid" });
  });

  it("rechaza si no coincide la cantidad de piezas", () => {
    const more: OptimizationInput = {
      ...baseInput,
      pieces: baseInput.pieces.map((piece, index) => (index === 0 ? { ...piece, quantity: 5 } : piece))
    };
    expect(revalidateExactHit(entry, more)).toMatchObject({ ok: false, reason: "piece-count-mismatch" });
  });

  it("rechaza si no coincide el tablero, el kerf o las restricciones", () => {
    expect(revalidateExactHit(entry, { ...baseInput, board: { ...baseInput.board, width: 2600 } })).toMatchObject({
      ok: false,
      reason: "board-width-mismatch"
    });
    expect(revalidateExactHit(entry, { ...baseInput, kerf: 4.4 })).toMatchObject({ ok: false, reason: "kerf-mismatch" });
    expect(
      revalidateExactHit(entry, { ...baseInput, constraints: { ...baseInput.constraints, stages: 3 } })
    ).toMatchObject({ ok: false, reason: "stages-mismatch" });
    expect(
      revalidateExactHit(entry, { ...baseInput, constraints: { ...baseInput.constraints, minRemnant: 300 } })
    ).toMatchObject({ ok: false, reason: "min-remnant-mismatch" });
    expect(
      revalidateExactHit(entry, { ...baseInput, material: { ...baseInput.material, hasGrain: true } })
    ).toMatchObject({ ok: false, reason: "grain-constraint-mismatch" });
  });

  it("rechaza si una colocacion cae fuera del tablero util", () => {
    expect(revalidateExactHit(entry, { ...baseInput, trim: { x: 1200, y: 0 } }).ok).toBe(false);
  });

  it("rechaza un plan con overlaps usando el validador industrial existente", () => {
    // Se pisan dos piezas dentro del plan legacy sin tocar placements ni contadores.
    const broken = structuredClone(entry);
    const placed = broken.plan.raw.placas[0]?.colocadas;
    if (!placed || placed.length < 2) throw new Error("fixture sin dos piezas en la misma placa");
    placed[1]!.x = placed[0]!.x;
    placed[1]!.y = placed[0]!.y;

    expect(revalidateExactHit(broken, baseInput)).toMatchObject({
      ok: false,
      reason: "industrial-validation-failed"
    });
  });

  it("rechaza un plan cuya geometria se salio del panel", () => {
    const broken = structuredClone(entry);
    const placed = broken.plan.raw.placas[0]?.colocadas?.[0];
    if (!placed) throw new Error("fixture sin piezas");
    placed.x = 99999;

    expect(revalidateExactHit(broken, baseInput).ok).toBe(false);
  });

  it("rechaza si las claves de pieza no cubren la demanda", () => {
    const mismatched = { ...entry, pieceKeys: entry.pieceKeys.map(() => "clave-inexistente") };
    expect(revalidateExactHit(mismatched, baseInput)).toMatchObject({
      ok: false,
      reason: "piece-key-not-in-demand"
    });
  });
});

describe("7. Fallback", () => {
  it("una entrada invalida no rompe: recalcula, cuenta y devuelve el plan del motor", () => {
    const store = createMemoryExperienceStore();
    const stats = createExperienceStats();
    const fingerprint = fingerprintOf(baseInput);
    const corrupted = entryFor(baseInput, fingerprint);
    corrupted.pieceKeys = corrupted.pieceKeys.map(() => "clave-inexistente");
    store.save(corrupted);

    const result = optimizeProjectWithExperience(baseInput, { enabled: true, store, stats });

    expect(result.experience.outcome).toBe("fallback");
    expect(result.experience.invalidReason).toBe("piece-key-not-in-demand");
    expect(result.metrics.boardCount).toBe(optimizeProject(baseInput).metrics.boardCount);
    expect(result.validation.ok).toBe(true);
    expect(stats).toMatchObject({ invalidCacheEntries: 1, fallbacks: 1, exactHits: 0 });
  });

  it("una entrada con plan corrupto no propaga error al usuario", () => {
    const store = createMemoryExperienceStore();
    const fingerprint = fingerprintOf(baseInput);
    const corrupted = entryFor(baseInput, fingerprint);
    corrupted.plan.raw.placas[0]!.colocadas![0]!.x = 99999;
    store.save(corrupted);

    expect(() => optimizeProjectWithExperience(baseInput, { enabled: true, store })).not.toThrow();
    expect(optimizeProjectWithExperience(baseInput, { enabled: true, store }).experience.outcome).toBe("fallback");
  });
});

describe("8. Feature disabled / flujo baseline intacto", () => {
  it("la memoria de experiencia nace apagada", () => {
    expect(experienceMemoryEnabled).toBe(false);
  });

  it("deshabilitado devuelve exactamente el resultado del motor", () => {
    const baseline = optimizeProject(baseInput);
    const disabled = optimizeProjectWithExperience(baseInput);

    expect(disabled.experience.enabled).toBe(false);
    expect(disabled.experience.outcome).toBe("disabled");
    expect(disabled.metrics.boardCount).toBe(baseline.metrics.boardCount);
    expect(disabled.placements).toEqual(baseline.placements);
    expect(disabled.validation.ok).toBe(baseline.validation.ok);
  });

  it("sin store no usa experiencia aunque este habilitado", () => {
    const result = optimizeProjectWithExperience(baseInput, { enabled: true });
    expect(result.experience.outcome).toBe("disabled");
  });

  it("deshabilitado nunca escribe en el store", () => {
    const store = createMemoryExperienceStore();
    optimizeProjectWithExperience(baseInput, { enabled: false, store });
    expect(store.size()).toBe(0);
  });
});

describe("9. Mismo boards baseline y cache", () => {
  it("el hit devuelve la misma cantidad de placas y la misma disposicion", () => {
    const store = createMemoryExperienceStore();
    const baseline = optimizeProject(baseInput);
    optimizeProjectWithExperience(baseInput, { enabled: true, store });
    const hit = optimizeProjectWithExperience(baseInput, { enabled: true, store });

    expect(hit.experience.outcome).toBe("hit");
    expect(hit.metrics.boardCount).toBe(baseline.metrics.boardCount);
    expect(hit.placements.map((p) => [p.x, p.y, p.width, p.height, p.rotated])).toEqual(
      baseline.placements.map((p) => [p.x, p.y, p.width, p.height, p.rotated])
    );
  });

  it("no faltan piezas al reutilizar", () => {
    const store = createMemoryExperienceStore();
    optimizeProjectWithExperience(baseInput, { enabled: true, store });
    const hit = optimizeProjectWithExperience(relabeledInput, { enabled: true, store });

    expect(hit.metrics.pieceCount).toBe(hit.metrics.expectedPieceCount);
    expect(hit.placements).toHaveLength(9);
    expect(hit.validation.ok).toBe(true);
  });
});

describe("10. Remapeo de etiquetas", () => {
  const store = createMemoryExperienceStore();
  optimizeProjectWithExperience(baseInput, { enabled: true, store });
  const reused = optimizeProjectWithExperience(relabeledInput, { enabled: true, store });

  it("reutiliza el plan de un pedido con otras etiquetas", () => {
    expect(reused.experience.outcome).toBe("hit");
  });

  it("respeta las cantidades de cada referencia nueva", () => {
    const counts = new Map<string, number>();
    for (const placement of reused.placements) {
      counts.set(placement.reference, (counts.get(placement.reference) ?? 0) + 1);
    }
    expect(counts.get("Z1")).toBe(2);
    expect(counts.get("Z2")).toBe(3);
    expect(counts.get("Z3")).toBe(4);
  });

  it("conserva las medidas de origen de cada referencia", () => {
    const expected = new Map([
      ["Z1", [900, 500]],
      ["Z2", [700, 450]],
      ["Z3", [600, 320]]
    ]);
    for (const placement of reused.placements) {
      expect([placement.sourceWidth, placement.sourceHeight]).toEqual(expected.get(placement.reference));
    }
  });

  it("deja los tableros coherentes con las colocaciones", () => {
    const fromBoards = reused.boards.flatMap((board) => board.placements);
    expect(fromBoards).toHaveLength(reused.placements.length);
    expect(new Set(fromBoards.map((p) => p.reference))).toEqual(new Set(["Z1", "Z2", "Z3"]));
  });
});

describe("11. No reutiliza etiquetas del pedido historico", () => {
  const store = createMemoryExperienceStore();
  optimizeProjectWithExperience(baseInput, { enabled: true, store });
  const reused = optimizeProjectWithExperience(relabeledInput, { enabled: true, store });

  it("ninguna colocacion conserva referencias ni descripciones del pedido viejo", () => {
    for (const placement of reused.placements) {
      expect(["A", "B", "C"]).not.toContain(placement.reference);
      expect(["Tapa", "Lateral", "Estante"]).not.toContain(placement.description);
      expect(["Z1", "Z2", "Z3"]).toContain(placement.reference);
    }
  });

  it("el plan legacy tampoco conserva las etiquetas viejas", () => {
    const placed = reused.raw.placas.flatMap((board) => board.colocadas ?? []);
    expect(placed.length).toBeGreaterThan(0);
    for (const item of placed) {
      expect(["Z1", "Z2", "Z3"]).toContain(String(item.pieza?.ref));
      expect(String(item.pieza?._codigoXml)).toMatch(/^Z[123]$/);
    }

    const treeRefs: string[] = [];
    const walk = (node: { partes?: Array<{ pieza?: { ref?: unknown } | null; hijo?: unknown }> }) => {
      for (const part of node.partes ?? []) {
        if (part.pieza?.ref != null) treeRefs.push(String(part.pieza.ref));
        if (part.hijo) walk(part.hijo as { partes?: [] });
      }
    };
    for (const board of reused.raw.placas) if (board.arbol) walk(board.arbol);

    expect(treeRefs.length).toBeGreaterThan(0);
    for (const ref of treeRefs) expect(["Z1", "Z2", "Z3"]).toContain(ref);
  });

  it("el XML de maquina lleva las referencias del pedido actual", () => {
    const xml = generateMachineXml(reused, { material: "MDF Blanco 18mm", thickness: 18 });
    const codes = [...xml.matchAll(/code="([^"]*)"/g)].map((match) => match[1]).filter(Boolean);

    expect(codes.length).toBeGreaterThan(0);
    expect(new Set(codes)).toEqual(new Set(["Z1", "Z2", "Z3"]));
  });

  it("un pedido ambiguo no se guarda, asi que nunca se remapea mal", () => {
    const store2 = createMemoryExperienceStore();
    const ambiguous: OptimizationInput = {
      ...baseInput,
      pieces: [
        { reference: "DUP", quantity: 1, width: 900, height: 500 },
        { reference: "DUP", quantity: 1, width: 600, height: 320 }
      ]
    };

    expect(buildPieceKeys(optimizeProject(ambiguous), ambiguous)).toBeNull();
    expect(optimizeProjectWithExperience(ambiguous, { enabled: true, store: store2 }).experience.recorded).toBe(false);
    expect(store2.size()).toBe(0);
  });
});

describe("12. Entrada corrupta no rompe el optimizador", () => {
  it("un archivo de store corrupto se ignora entero", () => {
    const path = join(tempRoot, "corrupto.json");
    writeFileSync(path, "{ esto no es json", "utf8");

    expect(() => createFileExperienceStore(path)).not.toThrow();
    expect(createFileExperienceStore(path).size()).toBe(0);
  });

  it("un archivo con entradas basura se ignora y el optimizador sigue funcionando", () => {
    const path = join(tempRoot, "basura.json");
    writeFileSync(path, JSON.stringify({ storeVersion: EXPERIENCE_STORE_VERSION, entries: [{ nada: 1 }, null] }), "utf8");

    const store = createFileExperienceStore(path);
    expect(store.size()).toBe(0);

    const result = optimizeProjectWithExperience(baseInput, { enabled: true, store });
    expect(result.experience.outcome).toBe("miss");
    expect(result.metrics.boardCount).toBe(optimizeProject(baseInput).metrics.boardCount);
  });

  it("un archivo inexistente arranca vacio", () => {
    expect(createFileExperienceStore(join(tempRoot, "nada", "store.json")).size()).toBe(0);
  });

  it("una entrada sin plan no se considera compatible", () => {
    expect(isEntryCompatible(null)).toBe(false);
    expect(isEntryCompatible({} as ExactExperienceEntry)).toBe(false);
  });
});

describe("13. Store por directorio", () => {
  const dirFor = (name: string) => join(tempRoot, "dir-" + name);

  it("guarda y recupera una entrada leyendola del disco", () => {
    const store = createDirectoryExperienceStore(dirFor("basico"));
    const entry = entryFor(baseInput);
    store.save(entry);

    expect(store.size()).toBe(1);
    expect(store.get(key)?.plan.metrics.boardCount).toBe(entry.plan.metrics.boardCount);
    expect(store.has(key)).toBe(true);
    expect(store.list()).toHaveLength(1);
  });

  it("un directorio inexistente arranca vacio y devuelve miss", () => {
    const store = createDirectoryExperienceStore(dirFor("vacio"));
    expect(store.size()).toBe(0);
    expect(store.get(key)).toBeNull();
  });

  it("borra y limpia", () => {
    const store = createDirectoryExperienceStore(dirFor("borrado"));
    store.save(entryFor(baseInput));
    expect(store.delete(key)).toBe(true);
    expect(store.delete(key)).toBe(false);

    store.save(entryFor(baseInput));
    store.clear();
    expect(store.size()).toBe(0);
  });

  it("un archivo de entrada corrupto se trata como miss y no rompe el optimizador", () => {
    const dir = dirFor("corrupto");
    const store = createDirectoryExperienceStore(dir);
    store.save(entryFor(baseInput, fingerprintOf(baseInput)));

    const [file] = readdirSync(dir);
    writeFileSync(join(dir, file), "{ esto no es json", "utf8");

    expect(store.list()).toHaveLength(0);
    const result = optimizeProjectWithExperience(baseInput, { enabled: true, store, record: false });
    expect(result.experience.outcome).toBe("miss");
    expect(result.metrics.boardCount).toBe(optimizeProject(baseInput).metrics.boardCount);
  });

  it("una entrada cuya clave no es la buscada no se reutiliza", () => {
    const dir = dirFor("cruzado");
    const store = createDirectoryExperienceStore(dir);
    store.save(entryFor(baseInput));

    const [file] = readdirSync(dir);
    const entry = JSON.parse(readFileSync(join(dir, file), "utf8")) as ExactExperienceEntry;
    writeFileSync(join(dir, file), JSON.stringify({ ...entry, exactFingerprint: "otro" }), "utf8");

    expect(store.get(key)).toBeNull();
  });

  it("sirve de memoria congelada para un holdout", () => {
    const store = createDirectoryExperienceStore(dirFor("holdout"));
    store.clear();
    optimizeProjectWithExperience(baseInput, { enabled: true, store });

    const frozen = freezeExperienceStore(createDirectoryExperienceStore(dirFor("holdout")));
    const hit = optimizeProjectWithExperience(relabeledInput, { enabled: true, store: frozen });
    expect(hit.experience.outcome).toBe("hit");

    const other: OptimizationInput = { ...baseInput, kerf: 3.2 };
    const miss = optimizeProjectWithExperience(other, { enabled: true, store: frozen });
    expect(miss.experience.outcome).toBe("miss");
    expect(miss.experience.recorded).toBe(false);
    expect(frozen.size()).toBe(1);
  });
});

describe("14. Adaptador de benchmark desde caso canonico", () => {
  const projectXml = readFileSync("tests/fixtures/optimizer/xml/project-minimal.xml", "utf8");
  const orderXml = readFileSync("tests/fixtures/optimizer/xml/order-grain.xml", "utf8");

  const canonicalOf = (xml: string): CanonicalOptimizationCase => parseCanonicalXml(xml).case;

  it("mapea el perfil igual que produccion", () => {
    expect(benchmarkProfileForStrategy("baseline")).toBe("fast");
    expect(benchmarkProfileForStrategy("v10")).toBe("balanced");
  });

  it("produce un input que el optimizador acepta", () => {
    const input = benchmarkInputFromCanonicalCase(canonicalOf(projectXml));
    const result = optimizeProject(input);
    expect(result.validation.ok).toBe(true);
    expect(result.metrics.expectedPieceCount).toBe(
      canonicalOf(projectXml).pieces.reduce((total, piece) => total + piece.quantity, 0)
    );
  });

  it("conserva tablero, kerf y refilado del caso canonico", () => {
    const canonical = canonicalOf(projectXml);
    const input = benchmarkInputFromCanonicalCase(canonical);
    expect(input.board.width).toBe(canonical.panel.width);
    expect(input.board.height).toBe(canonical.panel.height);
    expect(input.kerf).toBe(canonical.kerf);
    expect(input.trim).toEqual(canonical.trim);
    expect(input.constraints.minRemnant).toBe(canonical.constraints.minRemnant);
  });

  /**
   * OptimizationInput no tiene un tercer estado de veta, asi que el adaptador colapsa
   * unknown en false. Consecuencia registrada: dentro del benchmark el fingerprint se
   * calcula sobre el input adaptado, y ahi un caso project sin veta declarada y un caso
   * que declara "sin veta" son el MISMO problema. Es correcto, porque es exactamente lo
   * que resuelve el motor, pero hace la clase de equivalencia mas gruesa que la del
   * fingerprint sobre casos canonicos de XML medido en la Etapa 2A.
   */
  it("veta desconocida se corre como material sin veta y colapsa con la veta declarada", () => {
    const canonical = canonicalOf(projectXml);
    expect(canonical.material.hasGrain).toBeNull();
    expect(benchmarkInputFromCanonicalCase(canonical).material.hasGrain).toBe(false);

    const declared: CanonicalOptimizationCase = {
      ...canonical,
      material: { ...canonical.material, hasGrain: false, grainSource: "xml" }
    };
    expect(fingerprintOf(benchmarkInputFromCanonicalCase(canonical))).toBe(
      fingerprintOf(benchmarkInputFromCanonicalCase(declared))
    );

    const withGrain: CanonicalOptimizationCase = {
      ...canonical,
      material: { ...canonical.material, hasGrain: true, grainSource: "xml" }
    };
    expect(fingerprintOf(benchmarkInputFromCanonicalCase(canonical))).not.toBe(
      fingerprintOf(benchmarkInputFromCanonicalCase(withGrain))
    );
  });

  it("conserva la veta declarada de un Order", () => {
    const canonical = canonicalOf(orderXml);
    const input = benchmarkInputFromCanonicalCase(canonical);
    expect(input.material.hasGrain).toBe(canonical.material.hasGrain);
    for (const [index, piece] of canonical.pieces.entries()) {
      expect(input.pieces[index].reference).toBe(piece.reference);
      expect(input.pieces[index].quantity).toBe(piece.quantity);
    }
  });

  it("la estrategia elegida viaja al input", () => {
    expect(benchmarkInputFromCanonicalCase(canonicalOf(projectXml), { strategy: "v10" }).strategy).toBe("v10");
    expect(benchmarkInputFromCanonicalCase(canonicalOf(projectXml), { strategy: "v10" }).constraints.profile).toBe(
      "balanced"
    );
  });
});
