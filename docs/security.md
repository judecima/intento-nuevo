# Security

## Principles

- Supabase service-role keys are server-only.
- RLS is enabled from the first migration.
- A user can read only organizations where they are an active member.
- Admin permissions are scoped to the organization.
- Privileged writes should go through server actions or PostgreSQL RPC functions.
- Catalog writes are admin-only inside the active organization.
- Authenticated members can read enabled materials for their organization.
- Project writes are validated by server actions and RLS.
- Production XML files are private and downloaded through signed URLs generated server-side.
- Audit records are organization-scoped and visible only to admins.

## RLS Helpers

The migration defines security-definer helpers:

- `is_org_member(organization_id)`
- `has_org_role(organization_id, roles)`

Policies use these helpers to avoid recursive RLS checks on `organization_members`.

## Catalog RLS

`materials` and `board_formats` use the same tenant boundary:

- enabled records are readable by active members of the owning organization;
- admins can read disabled records for administration;
- insert, update and delete require `admin` in the owning organization;
- production XML is stored in a private bucket and referenced through `generated_files`.

## Project RLS

Project policies use the following boundaries:

- owners can read their own projects inside their organization;
- sellers and admins can read organization projects;
- project creation requires `customer` or `admin`;
- edits are limited to `draft` and `optimized` projects;
- admins can edit organization projects while they remain in an editable status;
- `project_items` policies call `can_read_project(project_id)` and `can_edit_project(project_id)`.

## Order And Production RLS

Orders use `can_read_order(order_id)`:

- customers read their own orders;
- sellers and admins read organization orders;
- operators read approved, production and completed orders.

Production jobs are readable only through `can_manage_production_order(order_id)`, which requires `operator` or `admin`. Production state changes go through RPC functions and require the same production-capable roles.

Generated files use `can_read_generated_file(file_id)`, which also requires production-capable roles. XML upload uses a server-only service-role client after validating the authenticated operator/admin context.

## Admin And Audit RLS

`audit_log` allows reads only for active admins in the same organization. Normal application writes are not made directly from browser components:

- order and generated-file audit entries are created by database triggers;
- admin member and machine changes go through security-definer RPC functions;
- XML download audit entries are inserted server-side before issuing a signed URL.

Admin screens may use the server-only service-role client after checking the authenticated context is an admin of the active organization. The service-role key is never exposed to client components.

## Automated Checks

`npm test` includes static security tests that verify:

- every tenant-owned table has RLS enabled in migrations;
- every RLS table has at least one policy;
- privileged workflow RPCs are `security definer`;
- `production-files` remains private and policy-protected;
- service-role usage stays out of client components.

`npm run security:db` runs the same core checks against the configured Supabase database via `SUPABASE_DB_URL`.

`npm run smoke:routes` verifies unauthenticated access to protected routes redirects to `/login`.

`npm run test:e2e` runs Playwright specs for authenticated role surfaces and the initial customer project flow. The specs require optional `E2E_*` credentials; missing roles are skipped so CI can opt in gradually.
