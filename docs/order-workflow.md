# Order Workflow

Phase 6 implements the order workflow from optimized project to seller approval.

## Project States

- `draft`
- `optimizing`
- `optimized`
- `submitted`

Only `draft` and `optimized` are editable by the project author in Fase 3. Once an order is introduced, submitted/approved production data must be snapshotted and immutable.

Submitting an order moves the project from `optimized` to `submitted`.

If the seller requests changes, the order moves to `changes_requested` and the project returns to `optimized` so the customer can revise it.

Approving an order moves the project to `approved`.

## Order States

- `submitted`
- `under_review`
- `changes_requested`
- `approved`
- `production`
- `completed`
- `delivered`
- `cancelled`

Valid Phase 6 transitions:

- `submitted` -> `under_review`
- `submitted` -> `changes_requested`
- `under_review` -> `approved`
- `under_review` -> `changes_requested`

Phase 7 adds production transitions:

- `approved` -> `production`
- `production` -> `completed`

The process board adds the final delivery transition:

- `completed` -> `delivered`

`completed` means production is finished. `delivered` means the product was handed off/remitted to the customer.

## Atomic Commands

Database RPC functions own state changes:

- `submit_project_order(project_id, optimization_result_id, expected_project_version, notes_customer)`
- `start_order_review(order_id, expected_order_version, transition_comment)`
- `request_order_changes(order_id, expected_order_version, transition_comment)`
- `approve_order(order_id, expected_order_version, transition_comment)`
- `start_production_job(order_id, expected_order_version, machine_profile_id, production_notes)`
- `complete_production_job(order_id, expected_order_version, production_notes)`
- `deliver_order(order_id, expected_order_version, delivery_notes, delivery_remittance_number)`
- `upsert_order_process_entry(order_id, invoice/remittance/date/edge/process fields)`

Each command validates role, organization, current status and optimistic version before updating data.

## Snapshot

`submit_project_order` creates `orders.snapshot` as immutable JSONB. It contains:

- project data
- customer profile fields
- material data
- project items
- selected optimization result
- normalized boards, pieces, cuts and remnants
- engine version

Later project edits do not mutate submitted order snapshots.

## History

Every transition writes `order_status_history` with:

- previous status
- next status
- actor
- comment
- timestamp

## Process Board

`/process` is the operational table inspired by `process.xlsx`. It starts after seller/admin approval: pending, under-review and changes-requested orders stay in the sales queues until approval. It is available to seller, operator and admin roles and consolidates:

- order/customer/material snapshot data;
- seller/admin that approved the order;
- production job dates and assigned operator;
- XML availability;
- process fields stored in `order_process_entries`: invoice, remittance, remitted flag, promised/deadline dates, cut/edgebanding dates, edge counts and comments.

The table does not write directly to Supabase from the browser. Edits and state transitions call server actions backed by RLS-protected RPC functions.

## Production XML

Operators generate XML from the approved order snapshot, not from current editable project state. The generated XML is uploaded to the private `production-files` bucket and registered in `generated_files` with a SHA-256 checksum.
