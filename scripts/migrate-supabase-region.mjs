import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const sourceEnvPath = resolve(".env.local");
const targetEnvPath = resolve(".env.brazil.local");
const migrationsDir = resolve("supabase", "migrations");
const backupRoot = resolve("backups");

const tables = [
  ["auth", "users"],
  ["auth", "identities"],
  ["public", "organizations"],
  ["public", "profiles"],
  ["public", "organization_members"],
  ["public", "materials"],
  ["public", "board_formats"],
  ["public", "machine_profiles"],
  ["public", "projects"],
  ["public", "project_items"],
  ["public", "optimization_jobs"],
  ["public", "optimization_results"],
  ["public", "optimization_boards"],
  ["public", "optimization_pieces"],
  ["public", "optimization_cuts"],
  ["public", "optimization_remnants"],
  ["public", "orders"],
  ["public", "order_status_history"],
  ["public", "production_jobs"],
  ["public", "generated_files"],
  ["public", "order_process_entries"],
  ["public", "audit_log"]
];

const publicTables = tables.filter(([schema]) => schema === "public").map(([, table]) => table);

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

async function main() {
  const command = process.argv[2];
  const backupDir = process.argv[3] ? resolve(process.argv[3]) : null;

  if (!command || !["backup", "migrate", "restore", "copy-storage", "all"].includes(command)) {
    console.log("Usage: node scripts/migrate-supabase-region.mjs <backup|migrate|restore|copy-storage|all> [backupDir]");
    process.exit(1);
  }

  const sourceEnv = readEnv(sourceEnvPath);
  const targetEnv = readEnv(targetEnvPath);
  const sourceDbUrl = databaseUrl(sourceEnv, "source");
  const targetDbUrl = databaseUrl(targetEnv, "target");

  let outputDir = backupDir;
  if (command === "backup" || command === "all") {
    outputDir = createBackupDir();
    exportTables(sourceDbUrl, outputDir);
    console.log(`backup_dir=${outputDir}`);
  }

  if (command === "migrate" || command === "all") {
    if (!outputDir) throw new Error("backupDir is required for migrate.");
    assertTargetCanReceiveData(targetDbUrl);
    applyMigrations(targetDbUrl);
    restoreTables(targetDbUrl, outputDir);
    console.log("database_migration=ok");
  }

  if (command === "restore") {
    if (!outputDir) throw new Error("backupDir is required for restore.");
    restoreTables(targetDbUrl, outputDir);
    console.log("database_restore=ok");
  }

  if (command === "copy-storage" || command === "all") {
    await copyStorageObjects(sourceEnv, targetEnv, sourceDbUrl);
    console.log("storage_copy=ok");
  }
}

function readEnv(path) {
  if (!existsSync(path)) throw new Error(`Missing ${path}`);

  const values = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;
    const name = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^"(.*)"$/, "$1");
    values[name] = value;
  }
  return values;
}

function databaseUrl(env, label) {
  const url = env.SUPABASE_DB_POOLER_URL || env.SUPABASE_DB_URL;
  if (!url) throw new Error(`${label} database URL is missing.`);
  return url;
}

function createBackupDir() {
  mkdirSync(backupRoot, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
  const dir = join(backupRoot, `supabase-region-${stamp}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function exportTables(sourceDbUrl, backupDir) {
  for (const [schema, table] of tables) {
    const qualified = `${quoteIdent(schema)}.${quoteIdent(table)}`;
    const columns = getInsertableColumns(sourceDbUrl, schema, table);
    const sql = `
      select coalesce(jsonb_agg(to_jsonb(source_rows)), '[]'::jsonb)
      from (select ${columns.join(", ")} from ${qualified}) source_rows;
    `;
    const jsonText = psql(sourceDbUrl, ["-t", "-A", "-c", sql]).stdout.trim() || "[]";
    const parsed = JSON.parse(jsonText);
    writeFileSync(join(backupDir, `${schema}.${table}.json`), `${JSON.stringify(parsed, null, 2)}\n`);
    writeFileSync(join(backupDir, `${schema}.${table}.columns.json`), `${JSON.stringify(columns, null, 2)}\n`);
    console.log(`exported=${schema}.${table}:${parsed.length}`);
  }
}

function assertTargetCanReceiveData(targetDbUrl) {
  const publicCountSql = `
    select coalesce(sum(estimate), 0)::bigint
    from (
      select reltuples::bigint as estimate
      from pg_class tables
      join pg_namespace namespaces on namespaces.oid = tables.relnamespace
      where namespaces.nspname = 'public'
        and tables.relkind = 'r'
        and tables.relname = any(array[${publicTables.map((table) => sqlString(table)).join(",")}])
    ) counts;
  `;
  const authCountSql = "select (select count(*) from auth.users) + (select count(*) from auth.identities);";
  const publicEstimate = Number(psql(targetDbUrl, ["-t", "-A", "-c", publicCountSql]).stdout.trim() || "0");
  const authCount = Number(psql(targetDbUrl, ["-t", "-A", "-c", authCountSql]).stdout.trim() || "0");
  if (publicEstimate > 0 || authCount > 0) {
    throw new Error("Target database is not empty enough for an automated restore.");
  }
}

function applyMigrations(targetDbUrl) {
  const migrations = readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const migration of migrations) {
    psql(targetDbUrl, ["-f", join(migrationsDir, migration)]);
    console.log(`migration=${migration}`);
  }
}

function restoreTables(targetDbUrl, backupDir) {
  for (const [schema, table] of tables) {
    const dataPath = join(backupDir, `${schema}.${table}.json`);
    const columnsPath = join(backupDir, `${schema}.${table}.columns.json`);
    if (!existsSync(dataPath) || !existsSync(columnsPath)) {
      throw new Error(`Missing backup files for ${schema}.${table}`);
    }

    const rows = JSON.parse(readFileSync(dataPath, "utf8"));
    const columns = JSON.parse(readFileSync(columnsPath, "utf8"));
    if (rows.length === 0) {
      console.log(`restored=${schema}.${table}:0`);
      continue;
    }

    const qualified = `${quoteIdent(schema)}.${quoteIdent(table)}`;
    const jsonLiteral = sqlString(JSON.stringify(rows));
    const columnList = columns.join(", ");
    const primaryKeyColumns = getPrimaryKeyColumns(targetDbUrl, schema, table);
    const updateColumns = columns.filter((column) => !primaryKeyColumns.includes(column));
    const conflictSql =
      primaryKeyColumns.length === 0
        ? ""
        : updateColumns.length === 0
          ? ` on conflict (${primaryKeyColumns.join(", ")}) do nothing`
          : ` on conflict (${primaryKeyColumns.join(", ")}) do update set ${updateColumns
              .map((column) => `${column} = excluded.${column}`)
              .join(", ")}`;
    const sql = `
      insert into ${qualified} (${columnList})
      select ${columnList}
      from jsonb_populate_recordset(null::${qualified}, ${jsonLiteral}::jsonb)
      ${conflictSql};
    `;
    psqlInput(targetDbUrl, sql);
    console.log(`restored=${schema}.${table}:${rows.length}`);
  }
}

async function copyStorageObjects(sourceEnv, targetEnv, sourceDbUrl) {
  const source = createSupabaseAdmin(sourceEnv, "source");
  const target = createSupabaseAdmin(targetEnv, "target");
  const sql = "select storage_bucket, storage_path from public.generated_files order by storage_bucket, storage_path;";
  const lines = psql(sourceDbUrl, ["-t", "-A", "-F", "\t", "-c", sql]).stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const [bucket, path] = line.split("\t");
    const { data, error } = await source.storage.from(bucket).download(path);
    if (error) throw new Error(`Could not download ${bucket}/${path}: ${error.message}`);

    const body = Buffer.from(await data.arrayBuffer());
    const { error: uploadError } = await target.storage.from(bucket).upload(path, body, {
      upsert: true,
      contentType: path.toLowerCase().endsWith(".xml") ? "application/xml" : data.type || "application/octet-stream"
    });
    if (uploadError) throw new Error(`Could not upload ${bucket}/${path}: ${uploadError.message}`);
    console.log(`storage=${bucket}/${path}`);
  }
}

function createSupabaseAdmin(env, label) {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(`${label} Supabase URL/service role key missing.`);
  }
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

function getInsertableColumns(dbUrl, schema, table) {
  const sql = `
    select string_agg(quote_ident(attribute.attname), ', ' order by attribute.attnum)
    from pg_attribute attribute
    join pg_class class on class.oid = attribute.attrelid
    join pg_namespace namespace on namespace.oid = class.relnamespace
    where namespace.nspname = ${sqlString(schema)}
      and class.relname = ${sqlString(table)}
      and attribute.attnum > 0
      and not attribute.attisdropped
      and attribute.attgenerated = ''
      and attribute.attidentity = '';
  `;
  const output = psql(dbUrl, ["-t", "-A", "-c", sql]).stdout.trim();
  if (!output) throw new Error(`No insertable columns found for ${schema}.${table}`);
  return output.split(", ");
}

function getPrimaryKeyColumns(dbUrl, schema, table) {
  const sql = `
    select coalesce(string_agg(quote_ident(attribute.attname), ', ' order by keys.ordinality), '')
    from pg_index index_data
    join pg_class class on class.oid = index_data.indrelid
    join pg_namespace namespace on namespace.oid = class.relnamespace
    join unnest(index_data.indkey) with ordinality as keys(attribute_number, ordinality) on true
    join pg_attribute attribute on attribute.attrelid = class.oid and attribute.attnum = keys.attribute_number
    where namespace.nspname = ${sqlString(schema)}
      and class.relname = ${sqlString(table)}
      and index_data.indisprimary;
  `;
  const output = psql(dbUrl, ["-t", "-A", "-c", sql]).stdout.trim();
  return output ? output.split(", ") : [];
}

function psql(databaseUrl, args) {
  const result = spawnSync("psql", ["-X", "-v", "ON_ERROR_STOP=1", ...args, databaseUrl], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 80
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || `psql exited with ${result.status}`);
  }
  return result;
}

function psqlInput(databaseUrl, sql) {
  const result = spawnSync("psql", ["-X", "-v", "ON_ERROR_STOP=1", databaseUrl], {
    encoding: "utf8",
    input: sql,
    maxBuffer: 1024 * 1024 * 80
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || `psql exited with ${result.status}`);
  }
  return result;
}

function quoteIdent(value) {
  return `"${value.replace(/"/g, '""')}"`;
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}
