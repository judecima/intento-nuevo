import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const envPath = join(process.cwd(), ".env.local");

if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const name = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    process.env[name] = rawValue.replace(/^"(.*)"$/, "$1");
  }
}

const databaseUrl = process.env.SUPABASE_DB_POOLER_URL || process.env.SUPABASE_DB_URL;
if (!databaseUrl) {
  console.error("SUPABASE_DB_POOLER_URL or SUPABASE_DB_URL is required in .env.local or the process environment.");
  process.exit(1);
}

const rlsTables = [
  "profiles",
  "organizations",
  "organization_members",
  "platform_admins",
  "materials",
  "board_formats",
  "projects",
  "project_items",
  "optimization_jobs",
  "optimization_results",
  "optimization_boards",
  "optimization_pieces",
  "optimization_cuts",
  "optimization_remnants",
  "orders",
  "order_status_history",
  "order_process_entries",
  "machine_profiles",
  "production_jobs",
  "generated_files",
  "audit_log"
];

const securityDefinerFunctions = [
  "is_org_member",
  "has_org_role",
  "is_platform_admin",
  "can_edit_project",
  "can_read_project",
  "can_read_optimization_result",
  "can_write_optimization_result",
  "build_order_snapshot",
  "submit_project_order",
  "start_order_review",
  "request_order_changes",
  "approve_order",
  "can_update_order_process",
  "upsert_order_process_entry",
  "deliver_order",
  "can_manage_production_order",
  "can_read_generated_file",
  "start_production_job",
  "complete_production_job",
  "write_audit_log",
  "admin_upsert_organization_member",
  "admin_update_organization_member",
  "admin_create_machine_profile",
  "admin_update_machine_profile"
];

const sql = `
with expected_tables(table_name) as (
  values ${rlsTables.map((table) => `('${table}')`).join(",\n         ")}
)
select 'rls_missing=' || coalesce(string_agg(expected_tables.table_name, ',' order by expected_tables.table_name), '')
from expected_tables
left join pg_class tables
  on tables.relname = expected_tables.table_name
left join pg_namespace namespaces
  on namespaces.oid = tables.relnamespace
  and namespaces.nspname = 'public'
where tables.oid is null
  or tables.relrowsecurity is not true;

with expected_tables(table_name) as (
  values ${rlsTables.map((table) => `('${table}')`).join(",\n         ")}
)
select 'policy_missing=' || coalesce(string_agg(expected_tables.table_name, ',' order by expected_tables.table_name), '')
from expected_tables
where not exists (
  select 1
  from pg_policies policies
  where policies.schemaname = 'public'
    and policies.tablename = expected_tables.table_name
);

with expected_functions(function_name) as (
  values ${securityDefinerFunctions.map((fn) => `('${fn}')`).join(",\n         ")}
)
select 'security_definer_missing=' || coalesce(string_agg(expected_functions.function_name, ',' order by expected_functions.function_name), '')
from expected_functions
where not exists (
  select 1
  from pg_proc functions
  join pg_namespace namespaces on namespaces.oid = functions.pronamespace
  where namespaces.nspname = 'public'
    and functions.proname = expected_functions.function_name
    and functions.prosecdef is true
);

select 'production_files_public=' || coalesce(
  (select public::text from storage.buckets where id = 'production-files'),
  'missing'
);

select 'generated_file_reader_uses_production_role=' || exists (
  select 1
  from pg_proc functions
  join pg_namespace namespaces on namespaces.oid = functions.pronamespace
  where namespaces.nspname = 'public'
    and functions.proname = 'can_read_generated_file'
    and pg_get_functiondef(functions.oid) ilike '%can_manage_production_order(files.order_id)%'
    and pg_get_functiondef(functions.oid) not ilike '%can_read_order%'
);
`;

const result = spawnSync("psql", ["-t", "-A", "-v", "ON_ERROR_STOP=1", "-c", sql, databaseUrl], {
  encoding: "utf8"
});

if (result.error) {
  console.error(`Could not run psql: ${result.error.message}`);
  process.exit(1);
}

if (result.status !== 0) {
  console.error(result.stderr.trim() || "Supabase security check failed.");
  process.exit(result.status ?? 1);
}

const values = Object.fromEntries(
  result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separatorIndex = line.indexOf("=");
      return [line.slice(0, separatorIndex), line.slice(separatorIndex + 1)];
    })
);

const failures = [];
for (const key of ["rls_missing", "policy_missing", "security_definer_missing"]) {
  if (values[key]) failures.push(`${key}: ${values[key]}`);
}

if (values.production_files_public !== "false") {
  failures.push(`production_files_public: ${values.production_files_public || "missing"}`);
}

if (values.generated_file_reader_uses_production_role !== "true") {
  failures.push(
    `generated_file_reader_uses_production_role: ${values.generated_file_reader_uses_production_role || "missing"}`
  );
}

if (failures.length > 0) {
  console.error("Supabase security check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Supabase security check OK");
