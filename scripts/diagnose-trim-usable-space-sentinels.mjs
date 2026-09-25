#!/usr/bin/env node

import { build } from "esbuild";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");
const args = parseArgs(process.argv.slice(2));

const SENTINELS = new Map([
  [5431063, { physical: [2750, 1830], trim: [10, 10], usable: [2740, 1820], kerf: 4.5, leptonBoards: 1 }],
  [5431285, { physical: [2440, 1220], trim: [5, 5], usable: [2435, 1215], kerf: 4.4, leptonBoards: 2 }],
  [5468441, { physical: [2440, 1220], trim: [5, 5], usable: [2435, 1215], kerf: 4.5, leptonBoards: 4 }],
  [5504203, { physical: [2440, 1220], trim: [5, 5], usable: [2435, 1215], kerf: 4.5, leptonBoards: 75 }],
  [4961912, { physical: [2750, 1830], trim: [10, 10], usable: [2740, 1820], kerf: 4.5, leptonBoards: 2 }],
]);

if (args.help || !args.input) {
  help();
  process.exit(args.help ? 0 : 2);
}

mkdirSync(args.output, { recursive: true });

const bundlePath = join(
  REPO,
  "node_modules",
  ".cache",
  "trim-usable-space-sentinels",
  "optimizer.mjs",
);
mkdirSync(dirname(bundlePath), { recursive: true });

const anchor = pathToFileURL(
  join(REPO, "src", "lib", "optimizer", "experience", "revalidate.ts"),
).href;

console.log("Compilando runtime del optimizador...");
await build({
  entryPoints: [join(REPO, "src", "lib", "optimizer", "index.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile: bundlePath,
  define: { "import.meta.url": JSON.stringify(anchor) },
  logLevel: "warning",
});

const optimizer = await import(pathToFileURL(bundlePath).href + "?v=" + Date.now());

const rustAddon = join(
  REPO,
  "native",
  "optimizer-pattern-generator",
  "optimizer_pattern_generator.node",
);
if (!args.skipRuntime && !existsSync(rustAddon)) {
  throw new Error(
    "No esta instalado el addon Rust. Ejecuta: npm run optimizer:rust:build",
  );
}

const wanted = new Set(SENTINELS.keys());
const found = new Map();
for (const file of collectXml(resolve(args.input))) {
  const id = idFromName(file);
  if (!wanted.has(id)) continue;
  const list = found.get(id) ?? [];
  list.push(file);
  found.set(id, list);
}

const rows = [];
for (const [caseId, expected] of SENTINELS) {
  const matches = found.get(caseId) ?? [];
  if (!matches.length) {
    rows.push({
      caseId,
      status: "MISSING_XML",
      expected,
    });
    continue;
  }

  const file = matches[0];
  const xml = readFileSync(file, "utf8");
  let zero;
  let inferred;

  try {
    zero = optimizer.parseCanonicalXml(xml, {
      fileName: file,
      defaultKerf: 4.5,
      defaultMinRemnant: 250,
      defaultMinCommercialRemnantLongSide: 400,
      projectTrimMode: "zero",
    });

    inferred = optimizer.parseCanonicalXml(xml, {
      fileName: file,
      defaultKerf: 4.5,
      defaultMinRemnant: 250,
      defaultMinCommercialRemnantLongSide: 400,
      projectTrimMode: "infer",
    });
  } catch (error) {
    rows.push({
      caseId,
      status: "PARSE_ERROR",
      file,
      duplicateMatches: matches.length,
      expected,
      error: String(error?.stack || error),
    });
    continue;
  }

  const physical = inferred.case.panel;
  const trim = inferred.case.trim;
  const usable = {
    width: physical.width - trim.x,
    height: physical.height - trim.y,
  };

  const normalizedUsableCase = structuredClone(inferred.case);
  normalizedUsableCase.panel.width = usable.width;
  normalizedUsableCase.panel.height = usable.height;
  normalizedUsableCase.trim = { x: 0, y: 0 };

  const normalizedNoKerfCase = structuredClone(normalizedUsableCase);
  normalizedNoKerfCase.kerf = 0;

  const pieces = inferred.case.pieces.map((piece) =>
    pieceDiagnostic(piece, usable, inferred.case.kerf),
  );

  const arms = args.skipRuntime
    ? null
    : {
        historicalZeroTrim: runArm(
          optimizer,
          zero.case,
          `trim-sentinel-${caseId}-zero`,
        ),
        currentPhysicalPlusTrim: runArm(
          optimizer,
          inferred.case,
          `trim-sentinel-${caseId}-current`,
        ),
        normalizedUsableTrimZero: runArm(
          optimizer,
          normalizedUsableCase,
          `trim-sentinel-${caseId}-usable`,
        ),
        normalizedUsableNoKerf: runArm(
          optimizer,
          normalizedNoKerfCase,
          `trim-sentinel-${caseId}-usable-no-kerf`,
        ),
      };

  rows.push({
    caseId,
    status: "OK",
    file,
    duplicateMatches: matches.length,
    expected,
    parsed: {
      physicalBoard: [physical.width, physical.height],
      inferredTrim: [trim.x, trim.y],
      usableBoard: [usable.width, usable.height],
      kerf: inferred.case.kerf,
      material: inferred.case.material,
      stats: inferred.stats,
      pieceTypes: inferred.case.pieces.length,
      pieceQuantity: inferred.case.pieces.reduce(
        (sum, piece) => sum + piece.quantity,
        0,
      ),
    },
    pdfReferenceMatch: {
      physical:
        samePair([physical.width, physical.height], expected.physical),
      trim: samePair([trim.x, trim.y], expected.trim),
      usable: samePair([usable.width, usable.height], expected.usable),
      kerf: same(inferred.case.kerf, expected.kerf),
    },
    pieces,
    arms,
    equivalence:
      arms == null
        ? null
        : compareArms(
            arms.currentPhysicalPlusTrim,
            arms.normalizedUsableTrimZero,
          ),
  });

  console.log(
    `CASE ${caseId} ` +
      JSON.stringify({
        physical: [physical.width, physical.height],
        trim: [trim.x, trim.y],
        usable: [usable.width, usable.height],
        kerf: inferred.case.kerf,
        pieces: pieces.map((p) => ({
          q: p.quantity,
          w: p.width,
          h: p.height,
          exactAxis: p.exactAxis,
          capacities: p.capacities,
        })),
        boards: arms
          ? {
              zero: arms.historicalZeroTrim.boardCount,
              current: arms.currentPhysicalPlusTrim.boardCount,
              usable: arms.normalizedUsableTrimZero.boardCount,
              noKerf: arms.normalizedUsableNoKerf.boardCount,
            }
          : null,
        lb: arms
          ? {
              zero: arms.historicalZeroTrim.lowerBound,
              current: arms.currentPhysicalPlusTrim.lowerBound,
              usable: arms.normalizedUsableTrimZero.lowerBound,
              noKerf: arms.normalizedUsableNoKerf.lowerBound,
            }
          : null,
      }),
  );
}

const output = {
  schema: "trim-usable-space-sentinels-v1",
  generatedAt: new Date().toISOString(),
  input: resolve(args.input),
  skipRuntime: args.skipRuntime,
  intendedQuestion: {
    q1: "Does canonical parsing reproduce PDF physical board, project trim, usable board and kerf?",
    q2: "Is physicalBoard+trim exactly equivalent to normalizedUsableBoard+trim0 inside the optimizer?",
    q3: "Does removing kerf alone recover the Lepton board count?",
    q4: "Which exact-fit piece dimensions reach the engine, and what n-1-kerf capacity do they imply?",
  },
  rows,
};

const outputPath = join(args.output, "TRIM_USABLE_SPACE_SENTINELS.json");
writeFileSync(outputPath, JSON.stringify(output, null, 2) + "\n");

console.log("OUTPUT " + outputPath);

function runArm(optimizer, canonical, projectId) {
  const input = optimizer.benchmarkInputFromCanonicalCase(canonical, {
    strategy: "v10",
    profile: "balanced",
  });
  input.projectId = projectId;

  const started = performance.now();
  try {
    const result = optimizer.optimizeProject(input, {
      motorVersion: "v2",
      effortMode: "auto",
      patternGenerator: "rust",
    });

    const lb = result.raw?.metricasV10?.lowerBound ?? null;
    return {
      ok: true,
      boardCount: result.metrics?.boardCount ?? null,
      validationOk: result.validation?.ok === true,
      validationErrors: result.validation?.errors ?? [],
      lowerBound: result.raw?.cotaV10 ?? null,
      lowerBoundRoute: lb,
      wallMs: +(performance.now() - started).toFixed(3),
    };
  } catch (error) {
    return {
      ok: false,
      boardCount: null,
      validationOk: false,
      validationErrors: [],
      lowerBound: null,
      lowerBoundRoute: null,
      wallMs: +(performance.now() - started).toFixed(3),
      error: String(error?.stack || error),
    };
  }
}

function pieceDiagnostic(piece, usable, kerf) {
  const orientations = [
    { name: "normal", w: piece.width, h: piece.height },
  ];
  if (!same(piece.width, piece.height)) {
    orientations.push({
      name: "rotated",
      w: piece.height,
      h: piece.width,
    });
  }

  return {
    reference: piece.reference,
    description: piece.description ?? null,
    quantity: piece.quantity,
    width: piece.width,
    height: piece.height,
    grain: piece.grain,
    grainSource: piece.grainSource,
    rotationAllowed: piece.rotationAllowed,
    rotationSource: piece.rotationSource,
    exactAxis: {
      widthEqualsUsableWidth: same(piece.width, usable.width),
      widthEqualsUsableHeight: same(piece.width, usable.height),
      heightEqualsUsableWidth: same(piece.height, usable.width),
      heightEqualsUsableHeight: same(piece.height, usable.height),
    },
    orientations: orientations.map((o) => ({
      ...o,
      fitsUseful:
        o.w <= usable.width + 1e-9 &&
        o.h <= usable.height + 1e-9,
      fitsIfOuterKerfWereRequired:
        o.w + kerf <= usable.width + 1e-9 &&
        o.h + kerf <= usable.height + 1e-9,
      capacityNMinus1Kerf: {
        x: capacity(usable.width, o.w, kerf),
        y: capacity(usable.height, o.h, kerf),
      },
    })),
    capacities: orientations.map((o) => ({
      orientation: o.name,
      grid:
        capacity(usable.width, o.w, kerf) *
        capacity(usable.height, o.h, kerf),
      x: capacity(usable.width, o.w, kerf),
      y: capacity(usable.height, o.h, kerf),
    })),
  };
}

function capacity(span, piece, kerf) {
  if (!(span > 0) || !(piece > 0)) return 0;
  return Math.max(
    0,
    Math.floor((span + kerf + 1e-9) / (piece + kerf)),
  );
}

function compareArms(a, b) {
  return {
    bothOk: a.ok && b.ok,
    sameBoardCount: a.boardCount === b.boardCount,
    sameLowerBound: a.lowerBound === b.lowerBound,
    sameValidation: a.validationOk === b.validationOk,
    currentBoardCount: a.boardCount,
    normalizedBoardCount: b.boardCount,
    currentLowerBound: a.lowerBound,
    normalizedLowerBound: b.lowerBound,
  };
}

function samePair(a, b) {
  return (
    (same(a[0], b[0]) && same(a[1], b[1])) ||
    (same(a[0], b[1]) && same(a[1], b[0]))
  );
}

function same(a, b) {
  return Math.abs(Number(a) - Number(b)) <= 1e-6;
}

function collectXml(target) {
  if (!existsSync(target)) throw new Error("No existe --input: " + target);
  const out = [];
  walk(target, out);
  return out.sort((a, b) => a.localeCompare(b));
}

function walk(target, out) {
  const stat = statSync(target);
  if (stat.isFile()) {
    if (extname(target).toLowerCase() === ".xml") out.push(target);
    return;
  }

  for (const entry of readdirSync(target, { withFileTypes: true })) {
    const child = join(target, entry.name);
    if (entry.isDirectory()) walk(child, out);
    else if (
      entry.isFile() &&
      extname(entry.name).toLowerCase() === ".xml"
    ) {
      out.push(child);
    }
  }
}

function idFromName(file) {
  const name = file.split(/[\\/]/).pop() ?? file;
  const match = /(^|\D)(\d{5,})(?=\D|$)/.exec(name);
  return match ? Number(match[2]) : null;
}

function parseArgs(argv) {
  const out = {
    input: null,
    output: resolve("validation-full/trim-usable-space-sentinels"),
    skipRuntime: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--input") out.input = argv[++i];
    else if (arg === "--output") out.output = resolve(argv[++i]);
    else if (arg === "--skip-runtime") out.skipRuntime = true;
    else if (arg === "--help" || arg === "-h") out.help = true;
    else throw new Error("Argumento desconocido: " + arg);
  }
  return out;
}

function help() {
  console.log(`Uso:
  node scripts/diagnose-trim-usable-space-sentinels.mjs \\
    --input "validation-full/serial-production-audit/_extracted" \\
    --output "validation-full/trim-usable-space-sentinels"

Compara cuatro brazos por sentinel:
  A) XML historico con trim=0
  B) placa fisica + trim inferido (camino actual)
  C) placa ya normalizada a espacio util + trim=0
  D) C con kerf=0 como ablacion diagnostica

IDs:
  5431063, 5431285, 5468441, 5504203, 4961912

Use --skip-runtime para inspeccionar solo parser/geometria sin ejecutar el motor.
`);
}
