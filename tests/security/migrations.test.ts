import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const migrationsDir = join(process.cwd(), "supabase", "migrations");
const migrationSql = readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .sort()
  .map((file) => readFileSync(join(migrationsDir, file), "utf8"))
  .join("\n\n");
const productionRlsHardeningSql = readFileSync(
  join(migrationsDir, "20260813200000_phase_9_production_rls_hardening.sql"),
  "utf8"
);

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
  "machine_profiles",
  "production_jobs",
  "generated_files",
  "audit_log"
] as const;

const privilegedFunctions = [
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
  "can_manage_production_order",
  "can_read_generated_file",
  "start_production_job",
  "start_edgebanding_job",
  "complete_production_job",
  "write_audit_log",
  "admin_upsert_organization_member",
  "admin_update_organization_member",
  "admin_create_machine_profile",
  "admin_update_machine_profile"
] as const;

describe("database security migrations", () => {
  it("enables RLS for every tenant-owned public table", () => {
    for (const table of rlsTables) {
      expect(migrationSql).toMatch(
        new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security\\s*;`, "i")
      );
    }
  });

  it("defines at least one policy for every RLS table", () => {
    for (const table of rlsTables) {
      expect(migrationSql).toMatch(
        new RegExp(`create\\s+policy[\\s\\S]*?on\\s+public\\.${table}\\b`, "i")
      );
    }
  });

  it("keeps privileged workflow functions as security definer routines", () => {
    for (const functionName of privilegedFunctions) {
      expect(migrationSql).toMatch(
        new RegExp(
          `create\\s+or\\s+replace\\s+function\\s+public\\.${functionName}\\b[\\s\\S]*?security\\s+definer`,
          "i"
        )
      );
    }
  });

  it("keeps production XML storage private and policy-protected", () => {
    expect(migrationSql).toContain("'production-files'");
    expect(migrationSql).toMatch(/set\s+public\s*=\s*false/i);
    expect(migrationSql).toMatch(/create\s+policy[\s\S]*?on\s+storage\.objects/i);
    expect(migrationSql).toMatch(/bucket_id\s*=\s*'production-files'/i);
  });

  it("keeps project creation available for tenant and platform workflows", () => {
    expect(migrationSql).toMatch(
      /create\s+policy\s+"projects_insert_authorized"[\s\S]*?public\.is_platform_admin\(\)[\s\S]*?public\.has_org_role\([\s\S]*?seller/i
    );
  });

  it("limits production files and jobs to production-capable roles", () => {
    expect(productionRlsHardeningSql).toMatch(/can_manage_production_order\(files\.order_id\)/i);
    expect(productionRlsHardeningSql).toMatch(/can_manage_production_order\(order_id\)/i);
    expect(productionRlsHardeningSql).not.toMatch(/can_read_order/i);
  });
});
