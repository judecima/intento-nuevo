# Architecture

The application is server-first. Browser components are used only for interactive surfaces such as editable tables, material selection and future optimization viewers.

## Layers

- `src/app`: Next.js routes and server actions.
- `src/components`: presentational and workflow UI.
- `src/lib/auth`: session and tenant context.
- `src/lib/domain`: pure domain rules.
- `src/lib/materials`: server-side catalog queries.
- `src/lib/orders`: order queries and workflow actions.
- `src/lib/production`: production queues, XML generation and file handling.
- `src/lib/admin`: admin-only queries and commands.
- `src/lib/supabase`: Supabase clients and generated/manual database types.
- `src/lib/optimizer`: isolated optimizer facade over the extracted legacy engine.
- `data`: versioned extracted catalog data.
- `scripts`: local repeatable import/extraction utilities.
- `supabase/migrations`: versioned database changes.

## Catalog Boundary

The material catalog is separate from projects and optimization. A project copies the selected board dimensions and grain behavior into its own versioned record, so later catalog edits do not mutate historical projects.

## Critical Boundary

The current optimizer is treated as a critical legacy component. It remains untouched until the extraction phase. The target is a pure facade:

```ts
optimizeProject(input)
```

The facade will call the existing guillotine engine, run industrial validation, and return a typed result.

## Admin Boundary

Admin screens stay server-first. They use server actions and PostgreSQL RPCs for privileged changes, and may use the server-only service-role client for reads only after verifying the authenticated user is an admin of the active organization.

Audit records are append-only from the application perspective. Order and generated-file events are produced by database triggers; XML downloads and admin changes are written server-side.
