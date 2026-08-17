import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const sourceRoot = join(process.cwd(), "src");

type SourceFile = {
  relativePath: string;
  content: string;
};

const sourceFiles = collectSourceFiles(sourceRoot);

describe("server-only Supabase boundaries", () => {
  it("does not reference the service-role key outside server env/admin modules", () => {
    const allowed = new Set(["lib/env.ts", "lib/supabase/admin.ts"]);
    const offenders = sourceFiles
      .filter((file) => file.content.includes("SUPABASE_SERVICE_ROLE_KEY"))
      .map((file) => file.relativePath)
      .filter((file) => !allowed.has(file));

    expect(offenders).toEqual([]);
  });

  it("does not import the admin Supabase client from client components", () => {
    const offenders = sourceFiles
      .filter((file) => isClientComponent(file.content))
      .filter((file) => file.content.includes("@/lib/supabase/admin"))
      .map((file) => file.relativePath);

    expect(offenders).toEqual([]);
  });

  it("keeps service-role helper usage in server-only modules", () => {
    const allowedPrefixes = ["lib/admin/", "lib/production/", "lib/supabase/admin.ts"];
    const offenders = sourceFiles
      .filter((file) => file.content.includes("createSupabaseAdminClient"))
      .map((file) => file.relativePath)
      .filter((file) => !allowedPrefixes.some((prefix) => file.startsWith(prefix)));

    expect(offenders).toEqual([]);
  });
});

function collectSourceFiles(root: string): SourceFile[] {
  const files: SourceFile[] = [];

  for (const entry of readdirSync(root)) {
    const absolutePath = join(root, entry);
    const stats = statSync(absolutePath);

    if (stats.isDirectory()) {
      files.push(...collectSourceFiles(absolutePath));
      continue;
    }

    if (!/\.(ts|tsx)$/.test(entry)) continue;

    files.push({
      relativePath: normalizePath(relative(sourceRoot, absolutePath)),
      content: readFileSync(absolutePath, "utf8")
    });
  }

  return files;
}

function isClientComponent(content: string): boolean {
  const firstStatement = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  return firstStatement === "\"use client\";" || firstStatement === "'use client';";
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}
