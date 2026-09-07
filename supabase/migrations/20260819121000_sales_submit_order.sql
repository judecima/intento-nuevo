-- Permite que ventas envíe como pedido un proyecto cargado para un cliente.
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
  select * into project_record
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
    or public.has_org_role(project_record.organization_id, array['seller'::public.organization_role, 'admin'::public.organization_role])
  ) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  select * into result_record
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
    select 1 from public.orders
    where project_id = target_project_id
      and selected_optimization_result_id = target_optimization_result_id
      and status in ('submitted'::public.order_status, 'under_review'::public.order_status, 'approved'::public.order_status, 'production'::public.order_status)
  ) then
    raise exception 'ORDER_ALREADY_EXISTS' using errcode = 'P0001';
  end if;

  order_snapshot = public.build_order_snapshot(target_project_id, target_optimization_result_id);
  order_snapshot = jsonb_set(
    order_snapshot,
    '{customer,address}',
    coalesce((select to_jsonb(address) from public.profiles where id = project_record.owner_id), 'null'::jsonb),
    true
  );

  insert into public.orders (
    organization_id, project_id, customer_id, selected_optimization_result_id,
    status, notes_customer, snapshot
  ) values (
    project_record.organization_id, project_record.id, project_record.owner_id,
    target_optimization_result_id, 'submitted'::public.order_status,
    nullif(notes_customer, ''), order_snapshot
  ) returning id into new_order_id;

  insert into public.order_status_history (order_id, from_status, to_status, changed_by, comment)
  values (new_order_id, null, 'submitted'::public.order_status, auth.uid(), nullif(notes_customer, ''));

  update public.projects
  set status = 'submitted'::public.project_status
  where id = project_record.id;

  return new_order_id;
end;
$$;
