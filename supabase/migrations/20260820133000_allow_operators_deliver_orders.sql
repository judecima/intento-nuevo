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

  if not public.has_org_role(
    order_record.organization_id,
    array[
      'seller'::public.organization_role,
      'operator'::public.organization_role,
      'admin'::public.organization_role
    ]
  ) then
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

revoke all on function public.deliver_order(uuid, integer, text, text) from public;
grant execute on function public.deliver_order(uuid, integer, text, text) to authenticated;
