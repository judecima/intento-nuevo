import { copyFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const crate = join(root, "native", "optimizer-pattern-generator");
const names = {
  linux: "liboptimizer_pattern_generator.so",
  darwin: "liboptimizer_pattern_generator.dylib",
  win32: "optimizer_pattern_generator.dll",
};
const sourceName = names[process.platform];
if (!sourceName) throw new Error(`Unsupported native platform: ${process.platform}`);

const source = join(crate, "target", "release", sourceName);
const target = join(crate, "optimizer_pattern_generator.node");
if (!existsSync(source)) throw new Error(`Rust optimizer artifact not found: ${source}`);
copyFileSync(source, target);
console.log(`Installed native optimizer addon: ${target}`);
