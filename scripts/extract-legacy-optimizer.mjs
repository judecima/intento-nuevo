import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const LEGACY_HTML =
  process.env.LEGACY_OPTIMIZER_HTML || "Optimizador_V10_Interactivo_Modos_Validacion_XML_Lepton.html";

// Source-of-truth policy (2026-09-07):
// - the active optimizer lives in the Next project under src/lib/optimizer/**;
// - root HTML files are historical/reference artifacts only;
// - this extractor must not overwrite the active Next runtime by accident.
const NEXT_RUNTIME_DIR = join("src", "lib", "optimizer", "legacy");
const OUT_DIR = process.env.LEGACY_EXTRACT_OUT_DIR || join("research", "legacy-html-extracted");
const ALLOW_RUNTIME_OVERWRITE = /^(1|true|yes|on)$/i.test(
  process.env.ALLOW_LEGACY_RUNTIME_OVERWRITE || "",
);

if (resolve(OUT_DIR) === resolve(NEXT_RUNTIME_DIR) && !ALLOW_RUNTIME_OVERWRITE) {
  throw new Error(
    "Refusing to overwrite the active Next optimizer runtime. " +
      "src/lib/optimizer/** is the source of truth. " +
      "Use LEGACY_EXTRACT_OUT_DIR for historical extraction, or set " +
      "ALLOW_LEGACY_RUNTIME_OVERWRITE=1 only for an explicit archaeology/comparison task.",
  );
}

const html = readFileSync(LEGACY_HTML, "utf8");
mkdirSync(OUT_DIR, { recursive: true });

const generatedHeader = `// Historical extraction from ${LEGACY_HTML}.
// Reference snapshot only. The active Next optimizer source of truth lives under src/lib/optimizer/**.
"use strict";
`;

function findIndex(regex, from = 0) {
  const match = regex.exec(html.slice(from));
  if (!match?.index && match?.index !== 0) {
    throw new Error(`Marker not found: ${regex}`);
  }
  return from + match.index;
}

function writeLegacyFile(fileName, source) {
  writeFileSync(join(OUT_DIR, fileName), `${generatedHeader}\n${source.trim()}\n`, "utf8");
}

function rewriteLegacyRequires(source) {
  return source.replace(
    /require\(["']\.\/([^"']+)["']\)/g,
    (_all, name) => `require('./${name}.cjs')`,
  );
}

function patchExtractedModule(name, source) {
  if (name !== "v10" || !source.includes("calidadPlanPlacas")) return source;

  return source.replace(
    "const { optimizar } = require('./motor.cjs');",
    "const { optimizar, compararCalidad, calidadPlanPlacas } = require('./motor.cjs');",
  );
}

function extractModule(name) {
  const header = `__mods["./${name}"]=function(module,exports,require){`;
  const start = html.indexOf(header);
  if (start < 0) {
    throw new Error(`Legacy module not found: ${name}`);
  }

  const bodyStart = start + header.length;
  const rest = html.slice(bodyStart);
  const endCandidates = [
    rest.indexOf("\n};\n__mods["),
    rest.indexOf("\r\n};\r\n__mods["),
    rest.indexOf("\n};\nconst __V10"),
    rest.indexOf("\r\n};\r\nconst __V10"),
  ].filter((index) => index >= 0);

  if (endCandidates.length === 0) {
    throw new Error(`Legacy module terminator not found: ${name}`);
  }

  return patchExtractedModule(name, rewriteLegacyRequires(rest.slice(0, Math.min(...endCandidates))));
}

const engineStart = findIndex(/\/\* =+\r?\n\s+MOTOR DE OPTIMIZ/i);
const xmlStart = html.indexOf("const xmlEsc=", engineStart);
if (xmlStart < 0) throw new Error("XML exporter marker not found.");

const engineSource = html.slice(engineStart, xmlStart);
const engineExports = [
  "optimizar",
  "empacarPlaca",
  "orientaciones",
  "medidaCorte",
  "hashTexto",
  "DIR_X",
  "DIR_Y",
  "calidadRestos",
  "compararCalidad",
  "calidadPlanPlacas",
  "mejorPlanIgualPlacas",
  "mejorCandidatoPlaca",
].filter((name) => {
  const declaration = new RegExp(`function\\s+${name}\\b`);
  const variableDeclaration = new RegExp(`(?:const|let|var)\\s+[^;\\n]*\\b${name}\\b`);
  return declaration.test(engineSource) || variableDeclaration.test(engineSource);
});

writeLegacyFile(
  "motor.cjs",
`${engineSource}

module.exports = { ${engineExports.join(", ")} };`,
);

const downloadStart = html.indexOf("function descargarTexto", xmlStart);
if (downloadStart < 0) throw new Error("Download helper marker not found.");

const xmlSource = html.slice(xmlStart, downloadStart);
writeLegacyFile(
  "xml-exporter.cjs",
  `const DIR_X='x', DIR_Y='y';

${xmlSource}

module.exports = { exportarProjectXml, espesorDesdeMaterial };`,
);

for (const moduleName of [
  "patrones",
  "cobertura",
  "materializar",
  "oneboard",
  "validador_industrial_v3",
  "v10",
]) {
  writeLegacyFile(`${moduleName}.cjs`, extractModule(moduleName));
}

writeFileSync(
  join(OUT_DIR, "README.md"),
  `# Historical HTML optimizer extraction\n\nThis directory was extracted from \`${LEGACY_HTML}\` by \`scripts/extract-legacy-optimizer.mjs\`.\n\nIt is a reference/archaeology snapshot only. The active optimizer source of truth is the Next project under \`src/lib/optimizer/**\`. Do not copy this snapshot over the active runtime as part of normal development.\n`,
  "utf8",
);

console.log("Historical optimizer extracted into", OUT_DIR);
