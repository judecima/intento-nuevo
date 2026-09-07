create table if not exists public.order_process_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_id uuid not null unique references public.orders(id) on delete cascade,
  invoice_number text,
  remittance_number text,
  remitted boolean not null default false,
  promised_on date,
  deadline_on date,
  cut_completed_on date,
  edgebanding_completed_on date,
  delivered_at timestamptz,
  edge_band_045_count numeric(12, 2) not null default 0 check (edge_band_045_count >= 0),
  edge_band_2mm_count numeric(12, 2) not null default 0 check (edge_band_2mm_count >= 0),
  process_notes text,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists order_process_entries_org_updated_idx
  on public.order_process_entries (organization_id, updated_at desc);

create index if not exists order_process_entries_deadline_idx
  on public.order_process_entries (organization_id, deadline_on);

drop trigger if exists order_process_entries_set_updated_at on public.order_process_entries;
create trigger order_process_entries_set_updated_at
before update on public.order_process_entries
for each row execute function public.set_updated_at();

create or replace function public.sync_order_process_entry_organization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  order_record public.orders%rowtype;
begin
  if tg_op = 'UPDATE' and new.order_id <> old.order_id then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  select *
  into order_record
  from public.orders
  where id = new.order_id;

  if order_record.id is null then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001';
  end if;

  new.organization_id = order_record.organization_id;
  return new;
end;
$$;

drop trigger if exists order_process_entries_sync_org on public.order_process_entries;
create trigger order_process_entries_sync_org
before insert or update on public.order_process_entries
for each row execute function public.sync_order_process_entry_organization();

create or replace function public.can_update_order_process(target_order_id uuid)
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
        public.has_org_role(
          orders.organization_id,
          array['seller'::public.organization_role, 'admin'::public.organization_role]
        )
        or (
          orders.status in (
            'approved'::public.order_status,
            'production'::public.order_status,
            'completed'::public.order_status,
            'delivered'::public.order_status
          )
          and public.has_org_role(
            orders.organization_id,
            array['operator'::public.organization_role]
          )
        )
      )
  );
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
          orders.status in (
            'approved'::public.order_status,
            'production'::public.order_status,
            'completed'::public.order_status,
            'delivered'::public.order_status
          )
          and public.has_org_role(orders.organization_id, array['operator'::public.organization_role])
        )
      )
  );
$$;

create or replace function public.upsert_order_process_entry(
  target_order_id uuid,
  process_invoice_number text default null,
  process_remittance_number text default null,
  process_remitted boolean default false,
  process_promised_on date default null,
  process_deadline_on date default null,
  process_cut_completed_on date default null,
  process_edgebanding_completed_on date default null,
  process_edge_band_045_count numeric default 0,
  process_edge_band_2mm_count numeric default 0,
  process_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  order_record public.orders%rowtype;
  entry_id uuid;
begin
  select *
  into order_record
  from public.orders
  where id = target_order_id;

  if order_record.id is null then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not public.can_update_order_process(target_order_id) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  insert into public.order_process_entries (
    organization_id,
    order_id,
    invoice_number,
    remittance_number,
    remitted,
    promised_on,
    deadline_on,
    cut_completed_on,
    edgebanding_completed_on,
    edge_band_045_count,
    edge_band_2mm_count,
    process_notes,
    updated_by
  )
  values (
    order_record.organization_id,
    target_order_id,
    nullif(process_invoice_number, ''),
    nullif(process_remittance_number, ''),
    coalesce(process_remitted, false),
    process_promised_on,
    process_deadline_on,
    process_cut_completed_on,
    process_edgebanding_completed_on,
    greatest(coalesce(process_edge_band_045_count, 0), 0),
    greatest(coalesce(process_edge_band_2mm_count, 0), 0),
    nullif(process_notes, ''),
    auth.uid()
  )
  on conflict (order_id) do update
  set invoice_number = excluded.invoice_number,
      remittance_number = excluded.remittance_number,
      remitted = excluded.remitted,
      promised_on = excluded.promised_on,
      deadline_on = excluded.deadline_on,
      cut_completed_on = excluded.cut_completed_on,
      edgebanding_completed_on = excluded.edgebanding_completed_on,
      edge_band_045_count = excluded.edge_band_045_count,
      edge_band_2mm_count = excluded.edge_band_2mm_count,
      process_notes = excluded.process_notes,
      updated_by = excluded.updated_by
  returning id into entry_id;

  perform public.write_audit_log(
    order_record.organization_id,
    auth.uid(),
    'order_process_entry',
    entry_id,
    'order_process_updated',
    null,
    jsonb_build_object(
      'order_id', target_order_id,
      'invoice_number', nullif(process_invoice_number, ''),
      'remittance_number', nullif(process_remittance_number, ''),
      'remitted', coalesce(process_remitted, false),
      'promised_on', process_promised_on,
      'deadline_on', process_deadline_on
    ),
    '{}'::jsonb
  );

  return entry_id;
end;
$$;

create or replace function public.deliver_order(
  target_order_id uuid,
  expected_order_version integer,
  delivery_notes text default null,
  delivery_remittance_number text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  order_record public.orders%rowtype;
  entry_id uuid;
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

  if order_record.status <> 'completed'::public.order_status then
    raise exception 'ORDER_INVALID_STATUS' using errcode = 'P0001';
  end if;

  if not public.has_org_role(order_record.organization_id, array['seller'::public.organization_role, 'admin'::public.organization_role]) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  update public.orders
  set status = 'delivered'::public.order_status,
      notes_seller = coalesce(nullif(delivery_notes, ''), notes_seller)
  where id = target_order_id;

  update public.projects
  set status = 'completed'::public.project_status
  where id = order_record.project_id;

  insert into public.order_process_entries (
    organization_id,
    order_id,
    remittance_number,
    remitted,
    delivered_at,
    process_notes,
    updated_by
  )
  values (
    order_record.organization_id,
    target_order_id,
    nullif(delivery_remittance_number, ''),
    true,
    now(),
    nullif(delivery_notes, ''),
    auth.uid()
  )
  on conflict (order_id) do update
  set remittance_number = coalesce(excluded.remittance_number, public.order_process_entries.remittance_number),
      remitted = true,
      delivered_at = coalesce(public.order_process_entries.delivered_at, excluded.delivered_at),
      process_notes = coalesce(excluded.process_notes, public.order_process_entries.process_notes),
      updated_by = excluded.updated_by
  returning id into entry_id;

  insert into public.order_status_history (order_id, from_status, to_status, changed_by, comment)
  values (
    target_order_id,
    'completed'::public.order_status,
    'delivered'::public.order_status,
    auth.uid(),
    nullif(delivery_notes, '')
  );

  return entry_id;
end;
$$;

create or replace function public.audit_order_status_history_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  order_record record;
  audit_action text;
begin
  select organization_id
  into order_record
  from public.orders
  where id = new.order_id;

  if order_record.organization_id is null then
    return new;
  end if;

  audit_action = case new.to_status
    when 'submitted'::public.order_status then 'order_submitted'
    when 'under_review'::public.order_status then 'order_under_review'
    when 'changes_requested'::public.order_status then 'order_changes_requested'
    when 'approved'::public.order_status then 'order_approved'
    when 'production'::public.order_status then 'order_in_production'
    when 'completed'::public.order_status then 'order_completed'
    when 'delivered'::public.order_status then 'order_delivered'
    when 'cancelled'::public.order_status then 'order_cancelled'
    else 'order_status_changed'
  end;

  perform public.write_audit_log(
    order_record.organization_id,
    new.changed_by,
    'order',
    new.order_id,
    audit_action,
    case when new.from_status is null then null else jsonb_build_object('status', new.from_status) end,
    jsonb_build_object('status', new.to_status),
    jsonb_build_object('history_id', new.id, 'comment', new.comment)
  );

  return new;
end;
$$;

alter table public.order_process_entries enable row level security;

drop policy if exists "order_process_entries_select_authorized" on public.order_process_entries;
create policy "order_process_entries_select_authorized"
on public.order_process_entries
for select
to authenticated
using (public.can_read_order(order_id));

revoke all on table public.order_process_entries from public;
revoke all on function public.can_update_order_process(uuid) from public;
revoke all on function public.upsert_order_process_entry(uuid, text, text, boolean, date, date, date, date, numeric, numeric, text) from public;
revoke all on function public.deliver_order(uuid, integer, text, text) from public;

grant select on public.order_process_entries to authenticated;
grant execute on function public.can_update_order_process(uuid) to authenticated;
grant execute on function public.upsert_order_process_entry(uuid, text, text, boolean, date, date, date, date, numeric, numeric, text) to authenticated;
grant execute on function public.deliver_order(uuid, integer, text, text) to authenticated;
