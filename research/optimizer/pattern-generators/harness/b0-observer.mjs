import { join, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { EXPERIMENT } from "./identity.mjs";

// Only the materializer import binding is observed. The frozen search file and
// every dependency remain unchanged; there is no rewritten search expression.
export async function buildObservedB0(outfile) {
  const { build } = await import("esbuild");
  const generator = join(EXPERIMENT, "and-or.mjs");
  const materializer = pathToFileURL(join(EXPERIMENT, "physical-pattern.mjs")).href;
  return build({ stdin: { contents: `export * from ${JSON.stringify(generator)}; export { setObserver } from 'h4-materializer';`,
    resolveDir: EXPERIMENT, sourcefile: "h4-entry.mjs" }, bundle: true, platform: "node", format: "esm", target: "node22",
    outfile, metafile: true, logLevel: "silent", plugins: [{ name: "observe-materialization-boundary", setup(build) {
      build.onResolve({ filter: /.*/ }, (args) => {
        if (args.path === "h4-materializer" || (args.importer === generator && args.path === "./physical-pattern.mjs")) {
          return { path: "h4-materializer", namespace: "h4-observer" };
        }
        if (args.path === generator) return { path: generator };
        if (args.path.startsWith(".")) return { path: pathToFileURL(join(dirname(args.importer), args.path)).href, external: true };
        return { path: args.path, external: true };
      });
      build.onLoad({ filter: /.*/, namespace: "h4-observer" }, () => ({ contents: `
        import { materializePattern as original, MATERIALIZER_VERSION } from ${JSON.stringify(materializer)};
        export { MATERIALIZER_VERSION };
        let measure = (_phase, fn) => fn();
        export function setObserver(observer) { measure = observer; }
        export function materializePattern(...args) { return measure('materialization', () => original(...args)); }
      `, loader: "js" }));
    } }] });
}
