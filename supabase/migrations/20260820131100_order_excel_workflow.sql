alter table public.orders
  alter column status set default 'pending'::public.order_status;

update public.orders
set status = 'pending'::public.order_status
where status in ('submitted'::public.order_status, 'under_review'::public.order_status);

drop index if exists public.orders_active_project_result_idx;
create unique index orders_active_project_result_idx
  on public.orders (project_id, selected_optimization_result_id)
  where status in ('pending', 'submitted', 'under_review', 'approved', 'production', 'edgebanding');

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
    public.is_platform_admin()
    or (
      project_record.owner_id = auth.uid()
      and public.has_org_role(
        project_record.organization_id,
        array['customer'::public.organization_role, 'admin'::public.organization_role]
      )
    )
    or public.has_org_role(
      project_record.organization_id,
      array['seller'::public.organization_role, 'admin'::public.organization_role]
    )
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
      and status in (
        'pending'::public.order_status,
        'submitted'::public.order_status,
        'under_review'::public.order_status,
        'approved'::public.order_status,
        'production'::public.order_status,
        'edgebanding'::public.order_status
      )
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
    'pending'::public.order_status,
    nullif(notes_customer, ''),
    order_snapshot
  )
  returning id into new_order_id;

  insert into public.order_status_history (order_id, from_status, to_status, changed_by, comment)
  values (new_order_id, null, 'pending'::public.order_status, auth.uid(), nullif(notes_customer, ''));

  update public.projects
  set status = 'submitted'::public.project_status
  where id = project_record.id;

  return new_order_id;
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

  if order_record.status not in (
    'pending'::public.order_status,
    'submitted'::public.order_status,
    'under_review'::public.order_status
  ) then
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
      reviewed_by = coalesce(reviewed_by, auth.uid()),
      reviewed_at = coalesce(reviewed_at, now()),
      approved_by = auth.uid(),
      approved_at = now(),
      notes_seller = coalesce(nullif(transition_comment, ''), notes_seller)
  where id = target_order_id;

  update public.projects
  set status = 'approved'::public.project_status
  where id = order_record.project_id;

  insert into public.order_status_history (order_id, from_status, to_status, changed_by, comment)
  values (target_order_id, order_record.status, 'approved'::public.order_status, auth.uid(), nullif(transition_comment, ''));

  return target_order_id;
end;
$$;

create or replace function public.start_production_job(
  target_order_id uuid,
  expected_order_version integer,
  target_machine_profile_id uuid default null,
  production_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  order_record public.orders%rowtype;
  machine_record public.machine_profiles%rowtype;
  job_id uuid;
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

  if order_record.status <> 'approved'::public.order_status then
    raise exception 'ORDER_INVALID_STATUS' using errcode = 'P0001';
  end if;

  if not public.can_manage_production_order(target_order_id) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  if target_machine_profile_id is not null then
    select *
    into machine_record
    from public.machine_profiles
    where id = target_machine_profile_id
      and organization_id = order_record.organization_id
      and active = true;

    if machine_record.id is null then
      raise exception 'MACHINE_PROFILE_NOT_FOUND' using errcode = 'P0001';
    end if;
  end if;

  insert into public.production_jobs (
    order_id,
    assigned_operator_id,
    status,
    started_at,
    machine_profile_id,
    notes
  )
  values (
    target_order_id,
    auth.uid(),
    'in_progress'::public.production_job_status,
    now(),
    target_machine_profile_id,
    nullif(production_notes, '')
  )
  returning id into job_id;

  update public.orders
  set status = 'production'::public.order_status
  where id = target_order_id;

  insert into public.order_status_history (order_id, from_status, to_status, changed_by, comment)
  values (
    target_order_id,
    'approved'::public.order_status,
    'production'::public.order_status,
    auth.uid(),
    nullif(production_notes, '')
  );

  return job_id;
end;
$$;

create or replace function public.start_edgebanding_job(
  target_order_id uuid,
  expected_order_version integer,
  production_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  order_record public.orders%rowtype;
  job_record public.production_jobs%rowtype;
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

  if order_record.status <> 'production'::public.order_status then
    raise exception 'ORDER_INVALID_STATUS' using errcode = 'P0001';
  end if;

  if not public.can_manage_production_order(target_order_id) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  select *
  into job_record
  from public.production_jobs
  where order_id = target_order_id
  for update;

  if job_record.id is null or job_record.status <> 'in_progress'::public.production_job_status then
    raise exception 'PRODUCTION_JOB_NOT_FOUND' using errcode = 'P0001';
  end if;

  update public.orders
  set status = 'edgebanding'::public.order_status
  where id = target_order_id;

  insert into public.order_process_entries (
    organization_id,
    order_id,
    cut_completed_on,
    process_notes,
    updated_by
  )
  values (
    order_record.organization_id,
    target_order_id,
    current_date,
    nullif(production_notes, ''),
    auth.uid()
  )
  on conflict (order_id) do update
  set cut_completed_on = coalesce(public.order_process_entries.cut_completed_on, excluded.cut_completed_on),
      process_notes = coalesce(excluded.process_notes, public.order_process_entries.process_notes),
      updated_by = excluded.updated_by
  returning id into entry_id;

  insert into public.order_status_history (order_id, from_status, to_status, changed_by, comment)
  values (
    target_order_id,
    'production'::public.order_status,
    'edgebanding'::public.order_status,
    auth.uid(),
    nullif(production_notes, '')
  );

  return job_record.id;
end;
$$;

create or replace function public.complete_production_job(
  target_order_id uuid,
  expected_order_version integer,
  production_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  order_record public.orders%rowtype;
  job_record public.production_jobs%rowtype;
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

  if order_record.status not in ('production'::public.order_status, 'edgebanding'::public.order_status) then
    raise exception 'ORDER_INVALID_STATUS' using errcode = 'P0001';
  end if;

  if not public.can_manage_production_order(target_order_id) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  select *
  into job_record
  from public.production_jobs
  where order_id = target_order_id
  for update;

  if job_record.id is null or job_record.status <> 'in_progress'::public.production_job_status then
    raise exception 'PRODUCTION_JOB_NOT_FOUND' using errcode = 'P0001';
  end if;

  update public.production_jobs
  set status = 'completed'::public.production_job_status,
      completed_at = now(),
      notes = coalesce(nullif(production_notes, ''), notes)
  where id = job_record.id;

  update public.orders
  set status = 'completed'::public.order_status
  where id = target_order_id;

  insert into public.order_process_entries (
    organization_id,
    order_id,
    cut_completed_on,
    edgebanding_completed_on,
    process_notes,
    updated_by
  )
  values (
    order_record.organization_id,
    target_order_id,
    current_date,
    case when order_record.status = 'edgebanding'::public.order_status then current_date else null end,
    nullif(production_notes, ''),
    auth.uid()
  )
  on conflict (order_id) do update
  set cut_completed_on = coalesce(public.order_process_entries.cut_completed_on, excluded.cut_completed_on),
      edgebanding_completed_on = coalesce(public.order_process_entries.edgebanding_completed_on, excluded.edgebanding_completed_on),
      process_notes = coalesce(excluded.process_notes, public.order_process_entries.process_notes),
      updated_by = excluded.updated_by
  returning id into entry_id;

  insert into public.order_status_history (order_id, from_status, to_status, changed_by, comment)
  values (
    target_order_id,
    order_record.status,
    'completed'::public.order_status,
    auth.uid(),
    nullif(production_notes, '')
  );

  return job_record.id;
end;
$$;

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
            'edgebanding'::public.order_status,
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
            'edgebanding'::public.order_status,
            'completed'::public.order_status,
            'delivered'::public.order_status
          )
          and public.has_org_role(orders.organization_id, array['operator'::public.organization_role])
        )
      )
  );
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
    when 'pending'::public.order_status then 'order_pending'
    when 'submitted'::public.order_status then 'order_submitted'
    when 'under_review'::public.order_status then 'order_under_review'
    when 'changes_requested'::public.order_status then 'order_changes_requested'
    when 'approved'::public.order_status then 'order_approved'
    when 'production'::public.order_status then 'order_in_production'
    when 'edgebanding'::public.order_status then 'order_edgebanding'
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

revoke all on function public.submit_project_order(uuid, uuid, integer, text) from public;
revoke all on function public.approve_order(uuid, integer, text) from public;
revoke all on function public.start_production_job(uuid, integer, uuid, text) from public;
revoke all on function public.start_edgebanding_job(uuid, integer, text) from public;
revoke all on function public.complete_production_job(uuid, integer, text) from public;
revoke all on function public.can_update_order_process(uuid) from public;
revoke all on function public.can_read_order(uuid) from public;

grant execute on function public.submit_project_order(uuid, uuid, integer, text) to authenticated;
grant execute on function public.approve_order(uuid, integer, text) to authenticated;
grant execute on function public.start_production_job(uuid, integer, uuid, text) to authenticated;
grant execute on function public.start_edgebanding_job(uuid, integer, text) to authenticated;
grant execute on function public.complete_production_job(uuid, integer, text) to authenticated;
grant execute on function public.can_update_order_process(uuid) to authenticated;
grant execute on function public.can_read_order(uuid) to authenticated;
