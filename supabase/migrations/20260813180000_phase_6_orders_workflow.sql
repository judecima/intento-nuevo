do $$
begin
  if not exists (select 1 from pg_type where typname = 'order_status') then
    create type public.order_status as enum (
      'submitted',
      'under_review',
      'changes_requested',
      'approved',
      'production',
      'completed',
      'cancelled'
    );
  end if;
end $$;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete restrict,
  customer_id uuid not null references public.profiles(id) on delete restrict,
  selected_optimization_result_id uuid not null references public.optimization_results(id) on delete restrict,
  status public.order_status not null default 'submitted',
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id) on delete restrict,
  reviewed_at timestamptz,
  approved_by uuid references public.profiles(id) on delete restrict,
  approved_at timestamptz,
  notes_customer text,
  notes_seller text,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0)
);

create table if not exists public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  from_status public.order_status,
  to_status public.order_status not null,
  changed_by uuid references public.profiles(id) on delete restrict,
  comment text,
  created_at timestamptz not null default now()
);

create index if not exists orders_organization_status_idx
  on public.orders (organization_id, status, updated_at desc);

create index if not exists orders_customer_status_idx
  on public.orders (customer_id, status, updated_at desc);

create index if not exists orders_project_idx
  on public.orders (project_id, created_at desc);

create index if not exists order_status_history_order_idx
  on public.order_status_history (order_id, created_at);

create unique index if not exists orders_active_project_result_idx
  on public.orders (project_id, selected_optimization_result_id)
  where status in ('submitted', 'under_review', 'approved', 'production');

create or replace function public.bump_order_version()
returns trigger
language plpgsql
as $$
begin
  new.version = old.version + 1;
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists orders_bump_version on public.orders;
create trigger orders_bump_version
before update on public.orders
for each row execute function public.bump_order_version();

create or replace function public.prevent_order_identity_change()
returns trigger
language plpgsql
as $$
begin
  if new.organization_id <> old.organization_id
     or new.project_id <> old.project_id
     or new.customer_id <> old.customer_id
     or new.selected_optimization_result_id <> old.selected_optimization_result_id then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists orders_prevent_identity_change on public.orders;
create trigger orders_prevent_identity_change
before update on public.orders
for each row execute function public.prevent_order_identity_change();

create or replace function public.build_order_snapshot(
  target_project_id uuid,
  target_optimization_result_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  project_snapshot jsonb;
  material_snapshot jsonb;
  customer_snapshot jsonb;
  items_snapshot jsonb;
  result_snapshot jsonb;
  boards_snapshot jsonb;
  pieces_snapshot jsonb;
  cuts_snapshot jsonb;
  remnants_snapshot jsonb;
begin
  select to_jsonb(project_row)
  into project_snapshot
  from (
    select *
    from public.projects
    where id = target_project_id
  ) project_row;

  if project_snapshot is null then
    raise exception 'PROJECT_NOT_FOUND' using errcode = 'P0001';
  end if;

  select to_jsonb(material_row)
  into material_snapshot
  from (
    select materials.*
    from public.materials materials
    join public.projects projects on projects.material_id = materials.id
    where projects.id = target_project_id
  ) material_row;

  select to_jsonb(customer_row)
  into customer_snapshot
  from (
    select profiles.id, profiles.full_name, profiles.email, profiles.phone
    from public.profiles profiles
    join public.projects projects on projects.owner_id = profiles.id
    where projects.id = target_project_id
  ) customer_row;

  select coalesce(jsonb_agg(to_jsonb(items_row) order by items_row.sort_order, items_row.created_at), '[]'::jsonb)
  into items_snapshot
  from (
    select *
    from public.project_items
    where project_id = target_project_id
  ) items_row;

  select to_jsonb(result_row)
  into result_snapshot
  from (
    select *
    from public.optimization_results
    where id = target_optimization_result_id
  ) result_row;

  select coalesce(jsonb_agg(to_jsonb(board_row) order by board_row.board_index), '[]'::jsonb)
  into boards_snapshot
  from (
    select *
    from public.optimization_boards
    where optimization_result_id = target_optimization_result_id
  ) board_row;

  select coalesce(jsonb_agg(to_jsonb(piece_row) order by piece_row.board_index, piece_row.created_at), '[]'::jsonb)
  into pieces_snapshot
  from (
    select *
    from public.optimization_pieces
    where optimization_result_id = target_optimization_result_id
  ) piece_row;

  select coalesce(jsonb_agg(to_jsonb(cut_row) order by cut_row.board_index, cut_row.created_at), '[]'::jsonb)
  into cuts_snapshot
  from (
    select *
    from public.optimization_cuts
    where optimization_result_id = target_optimization_result_id
  ) cut_row;

  select coalesce(jsonb_agg(to_jsonb(remnant_row) order by remnant_row.board_index, remnant_row.created_at), '[]'::jsonb)
  into remnants_snapshot
  from (
    select *
    from public.optimization_remnants
    where optimization_result_id = target_optimization_result_id
  ) remnant_row;

  return jsonb_build_object(
    'generated_at', now(),
    'project', project_snapshot,
    'customer', customer_snapshot,
    'material', material_snapshot,
    'items', items_snapshot,
    'optimization_result', result_snapshot,
    'optimization_boards', boards_snapshot,
    'optimization_pieces', pieces_snapshot,
    'optimization_cuts', cuts_snapshot,
    'optimization_remnants', remnants_snapshot,
    'engine_version', result_snapshot #>> '{result_json,algorithmVersion}'
  );
end;
$$;

create or replace function public.submit_project_order(
  target_project_id uuid,
  target_optimization_result_id uuid,
  expected_project_version integer,
  notes_customer text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  project_record public.projects%rowtype;
  result_record public.optimization_results%rowtype;
  new_order_id uuid;
  order_snapshot jsonb;
begin
  select *
  into project_record
  from public.projects
  where id = target_project_id
  for update;

  if project_record.id is null then
    raise exception 'PROJECT_NOT_FOUND' using errcode = 'P0001';
  end if;

  if project_record.version <> expected_project_version then
    raise exception 'PROJECT_VERSION_CONFLICT' using errcode = 'P0001';
  end if;

  if project_record.status <> 'optimized'::public.project_status then
    raise exception 'PROJECT_INVALID_STATUS' using errcode = 'P0001';
  end if;

  if not (
    (
      project_record.owner_id = auth.uid()
      and public.has_org_role(project_record.organization_id, array['customer'::public.organization_role, 'admin'::public.organization_role])
    )
    or public.has_org_role(project_record.organization_id, array['admin'::public.organization_role])
  ) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  select *
  into result_record
  from public.optimization_results
  where id = target_optimization_result_id;

  if result_record.id is null
     or result_record.project_id <> project_record.id
     or result_record.organization_id <> project_record.organization_id
     or result_record.project_version <> expected_project_version then
    raise exception 'OPTIMIZATION_INVALID' using errcode = 'P0001';
  end if;

  if coalesce((result_record.validation_json->>'ok')::boolean, false) is not true then
    raise exception 'OPTIMIZATION_INVALID' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.orders
    where project_id = target_project_id
      and selected_optimization_result_id = target_optimization_result_id
      and status in ('submitted'::public.order_status, 'under_review'::public.order_status, 'approved'::public.order_status, 'production'::public.order_status)
  ) then
    raise exception 'ORDER_ALREADY_EXISTS' using errcode = 'P0001';
  end if;

  order_snapshot = public.build_order_snapshot(target_project_id, target_optimization_result_id);

  insert into public.orders (
    organization_id,
    project_id,
    customer_id,
    selected_optimization_result_id,
    status,
    notes_customer,
    snapshot
  )
  values (
    project_record.organization_id,
    project_record.id,
    project_record.owner_id,
    target_optimization_result_id,
    'submitted'::public.order_status,
    nullif(notes_customer, ''),
    order_snapshot
  )
  returning id into new_order_id;

  insert into public.order_status_history (order_id, from_status, to_status, changed_by, comment)
  values (new_order_id, null, 'submitted'::public.order_status, auth.uid(), nullif(notes_customer, ''));

  update public.projects
  set status = 'submitted'::public.project_status
  where id = project_record.id;

  return new_order_id;
end;
$$;

create or replace function public.start_order_review(
  target_order_id uuid,
  expected_order_version integer,
  transition_comment text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  order_record public.orders%rowtype;
begin
  select *
  into order_record
  from public.orders
  where id = target_order_id
  for update;

  if order_record.id is null then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001';
  end if;

  if order_record.version <> expected_order_version then
    raise exception 'ORDER_VERSION_CONFLICT' using errcode = 'P0001';
  end if;

  if order_record.status <> 'submitted'::public.order_status then
    raise exception 'ORDER_INVALID_STATUS' using errcode = 'P0001';
  end if;

  if not public.has_org_role(order_record.organization_id, array['seller'::public.organization_role, 'admin'::public.organization_role]) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  update public.orders
  set status = 'under_review'::public.order_status,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      notes_seller = coalesce(nullif(transition_comment, ''), notes_seller)
  where id = target_order_id;

  insert into public.order_status_history (order_id, from_status, to_status, changed_by, comment)
  values (target_order_id, 'submitted'::public.order_status, 'under_review'::public.order_status, auth.uid(), nullif(transition_comment, ''));

  return target_order_id;
end;
$$;

create or replace function public.request_order_changes(
  target_order_id uuid,
  expected_order_version integer,
  transition_comment text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  order_record public.orders%rowtype;
begin
  select *
  into order_record
  from public.orders
  where id = target_order_id
  for update;

  if order_record.id is null then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001';
  end if;

  if order_record.version <> expected_order_version then
    raise exception 'ORDER_VERSION_CONFLICT' using errcode = 'P0001';
  end if;

  if order_record.status not in ('submitted'::public.order_status, 'under_review'::public.order_status) then
    raise exception 'ORDER_INVALID_STATUS' using errcode = 'P0001';
  end if;

  if not public.has_org_role(order_record.organization_id, array['seller'::public.organization_role, 'admin'::public.organization_role]) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  update public.orders
  set status = 'changes_requested'::public.order_status,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      notes_seller = coalesce(nullif(transition_comment, ''), notes_seller)
  where id = target_order_id;

  update public.projects
  set status = 'optimized'::public.project_status
  where id = order_record.project_id;

  insert into public.order_status_history (order_id, from_status, to_status, changed_by, comment)
  values (target_order_id, order_record.status, 'changes_requested'::public.order_status, auth.uid(), nullif(transition_comment, ''));

  return target_order_id;
end;
$$;

create or replace function public.approve_order(
  target_order_id uuid,
  expected_order_version integer,
  transition_comment text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  order_record public.orders%rowtype;
  result_record public.optimization_results%rowtype;
begin
  select *
  into order_record
  from public.orders
  where id = target_order_id
  for update;

  if order_record.id is null then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001';
  end if;

  if order_record.version <> expected_order_version then
    raise exception 'ORDER_VERSION_CONFLICT' using errcode = 'P0001';
  end if;

  if order_record.status <> 'under_review'::public.order_status then
    raise exception 'ORDER_INVALID_STATUS' using errcode = 'P0001';
  end if;

  if order_record.snapshot is null or order_record.snapshot = '{}'::jsonb then
    raise exception 'ORDER_SNAPSHOT_MISSING' using errcode = 'P0001';
  end if;

  if not public.has_org_role(order_record.organization_id, array['seller'::public.organization_role, 'admin'::public.organization_role]) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  select *
  into result_record
  from public.optimization_results
  where id = order_record.selected_optimization_result_id;

  if result_record.id is null or coalesce((result_record.validation_json->>'ok')::boolean, false) is not true then
    raise exception 'OPTIMIZATION_INVALID' using errcode = 'P0001';
  end if;

  update public.orders
  set status = 'approved'::public.order_status,
      approved_by = auth.uid(),
      approved_at = now(),
      notes_seller = coalesce(nullif(transition_comment, ''), notes_seller)
  where id = target_order_id;

  update public.projects
  set status = 'approved'::public.project_status
  where id = order_record.project_id;

  insert into public.order_status_history (order_id, from_status, to_status, changed_by, comment)
  values (target_order_id, 'under_review'::public.order_status, 'approved'::public.order_status, auth.uid(), nullif(transition_comment, ''));

  return target_order_id;
end;
$$;

create or replace function public.can_read_order(target_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.orders orders
    where orders.id = target_order_id
      and (
        (
          orders.customer_id = auth.uid()
          and public.is_org_member(orders.organization_id)
        )
        or public.has_org_role(orders.organization_id, array['seller'::public.organization_role, 'admin'::public.organization_role])
        or (
          orders.status in ('approved'::public.order_status, 'production'::public.order_status, 'completed'::public.order_status)
          and public.has_org_role(orders.organization_id, array['operator'::public.organization_role])
        )
      )
  );
$$;

alter table public.orders enable row level security;
alter table public.order_status_history enable row level security;

drop policy if exists "orders_select_authorized" on public.orders;
create policy "orders_select_authorized"
on public.orders
for select
to authenticated
using (public.can_read_order(id));

drop policy if exists "order_status_history_select_authorized" on public.order_status_history;
create policy "order_status_history_select_authorized"
on public.order_status_history
for select
to authenticated
using (public.can_read_order(order_id));

revoke all on function public.build_order_snapshot(uuid, uuid) from public;
revoke all on function public.submit_project_order(uuid, uuid, integer, text) from public;
revoke all on function public.start_order_review(uuid, integer, text) from public;
revoke all on function public.request_order_changes(uuid, integer, text) from public;
revoke all on function public.approve_order(uuid, integer, text) from public;
revoke all on function public.can_read_order(uuid) from public;

grant execute on function public.submit_project_order(uuid, uuid, integer, text) to authenticated;
grant execute on function public.start_order_review(uuid, integer, text) to authenticated;
grant execute on function public.request_order_changes(uuid, integer, text) to authenticated;
grant execute on function public.approve_order(uuid, integer, text) to authenticated;
grant execute on function public.can_read_order(uuid) to authenticated;

grant select on public.orders to authenticated;
grant select on public.order_status_history to authenticated;
