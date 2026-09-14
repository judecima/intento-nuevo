import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
test("three fresh Node processes repeat complete/restricted/interrupted hashes and accounting", () => {
  const runs = Array.from({ length: 3 }, () => {
    const child = spawnSync(process.execPath, [fileURLToPath(new URL("./h2-repeat-child.mjs", import.meta.url))],
      { encoding: "utf8", windowsHide: true, maxBuffer: 1024 * 1024 });
    if (child.error) throw child.error;
    assert.equal(child.status, 0, child.stderr);
    return JSON.parse(child.stdout);
  });
  assert.deepEqual(runs[0].map((r) => r.status), ["COMPLETE", "COMPLETE", "WORK_LIMIT"]);
  assert.deepEqual(runs[1], runs[0]); assert.deepEqual(runs[2], runs[0]);
});
