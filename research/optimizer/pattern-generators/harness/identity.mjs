import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { digest } from "../canonical.mjs";
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
export const EXPERIMENT = join(ROOT, "research/optimizer/pattern-generators");
export const KERNEL = "4063963260abb10c8d68d0e553942899c925cc2f";
export const POLICY = join(ROOT, "research/optimizer/freeze/KERNEL_V1_FORMAL_CERTIFICATION_POLICY.json");
export const fileHash = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
export function treeFiles(dir, prefix = "") {
  return readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1).flatMap((entry) => {
    const relative = prefix + entry.name;
    return entry.isDirectory() ? treeFiles(join(dir, entry.name), relative + "/") : [[relative, fileHash(join(dir, entry.name))]];
  });
}
export function verifyH2() {
  const lock = JSON.parse(readFileSync(join(EXPERIMENT, "H2_CLOSED_2026-09-13.json"), "utf8"));
  if (lock.kernelCommit !== KERNEL) throw new Error("kernel identity mismatch");
  for (const [file, hash] of lock.algorithmFiles) if (fileHash(join(EXPERIMENT, file)) !== hash) throw new Error(`H2 algorithm drift: ${file}`);
  const runtimeHash = digest(treeFiles(join(ROOT, "src/lib/optimizer")));
  if (runtimeHash !== lock.kernelTreeHash) throw new Error("kernel runtime drift");
  return { kernelCommit: KERNEL, kernelTreeHash: runtimeHash, h2LockHash: fileHash(join(EXPERIMENT, "H2_CLOSED_2026-09-13.json")),
    generatorSourceHash: digest(lock.algorithmFiles), harnessSourceHash: digest(treeFiles(join(EXPERIMENT, "harness"))),
    lockfileHash: fileHash(join(ROOT, "package-lock.json")), kernelPolicyHash: fileHash(POLICY),
    xmlReaderSourceHash: fileHash(join(ROOT, "tests/optimizer/helpers/b0-xml-roundtrip.ts")) };
}
export function kernelBudgets() {
  const policy = JSON.parse(readFileSync(POLICY, "utf8"));
  if (policy.kernelCandidate !== KERNEL || policy.deterministicBudgets.status !== "RESOLVED") throw new Error("unresolved kernel budget policy");
  return policy.deterministicBudgets.values;
}
