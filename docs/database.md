# Database

The first migrations create the identity, tenancy and catalog foundation:

- `profiles`
- `organizations`
- `organization_members`
- `materials`
- `board_formats`
- `projects`
- `project_items`
- `optimization_jobs`
- `optimization_results`
- `optimization_boards`
- `optimization_pieces`
- `optimization_cuts`
- `optimization_remnants`
- `orders`
- `order_status_history`
- `machine_profiles`
- `production_jobs`
- `generated_files`
- `audit_log`

Enums:

- `organization_role`: `customer`, `seller`, `operator`, `admin`
- `material_kind`: `board`, `edge_band`, `other`
- `project_status`: `draft`, `optimizing`, `optimized`, `submitted`, `under_review`, `approved`, `rejected`, `in_production`, `completed`, `cancelled`
- `optimization_job_status`: `queued`, `running`, `completed`, `failed`, `cancelled`
- `order_status`: `submitted`, `under_review`, `changes_requested`, `approved`, `production`, `completed`, `cancelled`
- `production_job_status`: `queued`, `in_progress`, `completed`, `cancelled`
- `generated_file_type`: `machine_xml`, `pdf`, `other`

All tenant-owned data must include `organization_id` and use RLS policies based on active organization membership.

## Catalog

`materials` stores the normalized commercial catalog. The legacy catalog keeps traceability with:

- `external_id`
- `texture_id`
- `metadata.raw`
- `metadata.normalized_thickness`

`board_formats` stores selectable board dimensions derived from board materials. Formats are normalized separately because future phases can add multiple purchasable formats per material.

## Projects

`projects` copies the selected board dimensions, thickness, grain and cut parameters when the project is created. Later catalog edits do not mutate existing projects.

`project_items` is the source of truth for requested pieces. Optimization results in later phases must reference a project version instead of replacing item data.

Project versioning is enforced in the database:

## Platform Admins

`platform_admins` holds the super users of the platform — the level above tenancy. `is_platform_admin()` backs additive RLS policies that let them select, insert, update and delete `organizations` and `organization_members`, and read every `profiles` row so they can link people by email. Everything else keeps working through the per-organization roles.

The table is written with the service role only; through RLS it is read-only. Migration `20260816120000` seeds `juliodecima@gmail.com` by looking the address up in `profiles`, so re-running it is safe and it does not fail when the user does not exist yet.

Before that migration nobody could create an organization: `organizations` had no insert policy at all.

## Organization Entry Point

Migration `20260816160000` adds `organizations.allow_customer_signup` plus two `security definer` functions:

- `organization_public_info(slug)` — executable by `anon`, returns only name, slug, active and the signup flag of an active organization. The table itself stays invisible to non-members.
- `join_organization_as_customer(slug)` — executable by `authenticated`. It adds the caller to themselves (`auth.uid()`), always with role `customer`, and only when the organization is active and accepts signups. An existing membership is reactivated but never downgraded, so an admin who walks through the public door keeps their role.

Every other role stays in the hands of the platform super user.

## Platform Access To Projects

Migration `20260816190000` lets the super user work inside any organization. Instead of duplicating policies table by table it extends the two helpers the whole domain is built on:

- `can_read_project` and `can_edit_project` now start with `public.is_platform_admin()`. That covers `project_items`, optimization jobs/results and everything else that delegates to them.
- `can_edit_project` still requires status `draft` or `optimized` for everyone, super user included: a submitted or approved project stays frozen because the order keeps a snapshot of that version.
- Direct policies on `projects` (select, insert, update) and `materials` (select) complete the picture. The insert policy still demands `owner_id = auth.uid()`, so it is always traceable who created the project.

## Project Versioning

- `projects.version` increments only when the content that defines the cut changes: name, description, material, board dimensions, kerf, trims, minimum remnant or grain (migration `20260813210000`);
- status-only updates do not bump the version, so marking a project as `optimized` no longer invalidates the result that was just stored;
- insert, update and delete on `project_items` touch the parent project through an explicit bump;
- server actions require `expectedVersion` to avoid stale writes.

## Optimizations

`optimization_jobs` records each execution against a specific `project_version`.

`optimization_results` stores the selected engine output as JSONB plus normalized reporting fields:

- board count
- piece count
- utilization and waste percentages
- commercial remnant area
- cut count
- saw meters
- validation JSON

`optimization_boards`, `optimization_pieces`, `optimization_cuts` and `optimization_remnants` store queryable geometry derived from the immutable result.

Only completed jobs are displayed as the latest project optimization. Failed or partial jobs remain auditable but are not treated as valid plans.

## Orders

`orders` stores submitted customer orders with immutable `snapshot` JSONB and a selected optimization result.

`order_status_history` records every state transition. Direct writes are not exposed to the application; server actions call SQL RPC functions that validate role, organization, status and expected version before changing state.

## Production And Files

`machine_profiles` stores organization-scoped machine/export profiles.

`production_jobs` tracks operator work against an approved order. Starting and completing production is handled by SQL RPC functions that also update order state and write `order_status_history`.

`generated_files` records XML/PDF/other outputs. Machine XML files are uploaded to the private Supabase Storage bucket `production-files`; rows store the bucket, path, checksum and generator.

Fase 9 tightens production RLS so `production_jobs`, `generated_files` and `production-files` Storage objects require production-capable roles instead of generic order visibility.

## Administration And Audit

`audit_log` stores organization-scoped sensitive events with actor, entity, old/new JSON snapshots and metadata.

Audit rows are produced by database triggers for:

- order status history inserts;
- generated file creation.

Server actions also write audit rows for XML downloads. Admin RPC functions write audit rows for organization member updates and machine profile changes.
