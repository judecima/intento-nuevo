create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_org_created_idx
  on public.audit_log (organization_id, created_at desc);

create index if not exists audit_log_entity_idx
  on public.audit_log (entity_type, entity_id, created_at desc);

create index if not exists audit_log_actor_idx
  on public.audit_log (actor_id, created_at desc);

create or replace function public.write_audit_log(
  target_organization_id uuid,
  target_actor_id uuid,
  target_entity_type text,
  target_entity_id uuid,
  target_action text,
  target_old_data jsonb default null,
  target_new_data jsonb default null,
  target_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  insert into public.audit_log (
    organization_id,
    actor_id,
    entity_type,
    entity_id,
    action,
    old_data,
    new_data,
    metadata
  )
  values (
    target_organization_id,
    target_actor_id,
    target_entity_type,
    target_entity_id,
    target_action,
    target_old_data,
    target_new_data,
    coalesce(target_metadata, '{}'::jsonb)
  )
  returning id into new_id;

  return new_id;
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

drop trigger if exists audit_order_status_history_insert on public.order_status_history;
create trigger audit_order_status_history_insert
after insert on public.order_status_history
for each row execute function public.audit_order_status_history_insert();

create or replace function public.audit_generated_files_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.write_audit_log(
    new.organization_id,
    new.generated_by,
    'generated_file',
    new.id,
    case when new.type = 'machine_xml'::public.generated_file_type then 'xml_generated' else 'file_generated' end,
    null,
    to_jsonb(new),
    jsonb_build_object('order_id', new.order_id, 'file_type', new.type)
  );

  return new;
end;
$$;

drop trigger if exists audit_generated_files_insert on public.generated_files;
create trigger audit_generated_files_insert
after insert on public.generated_files
for each row execute function public.audit_generated_files_insert();

create or replace function public.admin_update_organization_member(
  target_organization_id uuid,
  target_user_id uuid,
  new_role public.organization_role,
  new_active boolean,
  change_comment text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  old_member public.organization_members%rowtype;
  active_admins integer;
begin
  if not public.has_org_role(target_organization_id, array['admin'::public.organization_role]) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  select *
  into old_member
  from public.organization_members
  where organization_id = target_organization_id
    and user_id = target_user_id
  for update;

  if old_member.user_id is null then
    raise exception 'ORGANIZATION_MEMBER_NOT_FOUND' using errcode = 'P0001';
  end if;

  if old_member.role = 'admin'::public.organization_role and old_member.active = true
     and (new_role <> 'admin'::public.organization_role or new_active is not true) then
    select count(*)
    into active_admins
    from public.organization_members
    where organization_id = target_organization_id
      and active = true
      and role = 'admin'::public.organization_role
      and user_id <> target_user_id;

    if active_admins = 0 then
      raise exception 'LAST_ADMIN_REQUIRED' using errcode = 'P0001';
    end if;
  end if;

  update public.organization_members
  set role = new_role,
      active = new_active
  where organization_id = target_organization_id
    and user_id = target_user_id;

  perform public.write_audit_log(
    target_organization_id,
    auth.uid(),
    'organization_member',
    target_user_id,
    'organization_member_updated',
    to_jsonb(old_member),
    jsonb_build_object(
      'organization_id', target_organization_id,
      'user_id', target_user_id,
      'role', new_role,
      'active', new_active
    ),
    jsonb_build_object('comment', nullif(change_comment, ''))
  );

  return target_user_id;
end;
$$;

create or replace function public.admin_create_machine_profile(
  target_organization_id uuid,
  profile_name text,
  profile_manufacturer text default null,
  profile_model text default null,
  profile_xml_format text default 'legacy_project_xml',
  profile_kerf numeric default 4.5,
  profile_min_piece_width numeric default 0,
  profile_min_piece_height numeric default 0,
  profile_configuration jsonb default '{}'::jsonb,
  profile_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_profile public.machine_profiles%rowtype;
begin
  if not public.has_org_role(target_organization_id, array['admin'::public.organization_role]) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  insert into public.machine_profiles (
    organization_id,
    name,
    manufacturer,
    model,
    xml_format,
    kerf,
    min_piece_width,
    min_piece_height,
    configuration,
    active
  )
  values (
    target_organization_id,
    profile_name,
    nullif(profile_manufacturer, ''),
    nullif(profile_model, ''),
    coalesce(nullif(profile_xml_format, ''), 'legacy_project_xml'),
    profile_kerf,
    profile_min_piece_width,
    profile_min_piece_height,
    coalesce(profile_configuration, '{}'::jsonb),
    profile_active
  )
  returning * into new_profile;

  perform public.write_audit_log(
    target_organization_id,
    auth.uid(),
    'machine_profile',
    new_profile.id,
    'machine_profile_created',
    null,
    to_jsonb(new_profile),
    '{}'::jsonb
  );

  return new_profile.id;
end;
$$;

create or replace function public.admin_update_machine_profile(
  target_profile_id uuid,
  profile_name text,
  profile_manufacturer text default null,
  profile_model text default null,
  profile_xml_format text default 'legacy_project_xml',
  profile_kerf numeric default 4.5,
  profile_min_piece_width numeric default 0,
  profile_min_piece_height numeric default 0,
  profile_configuration jsonb default '{}'::jsonb,
  profile_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  old_profile public.machine_profiles%rowtype;
  new_profile public.machine_profiles%rowtype;
begin
  select *
  into old_profile
  from public.machine_profiles
  where id = target_profile_id
  for update;

  if old_profile.id is null then
    raise exception 'MACHINE_PROFILE_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not public.has_org_role(old_profile.organization_id, array['admin'::public.organization_role]) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  update public.machine_profiles
  set name = profile_name,
      manufacturer = nullif(profile_manufacturer, ''),
      model = nullif(profile_model, ''),
      xml_format = coalesce(nullif(profile_xml_format, ''), 'legacy_project_xml'),
      kerf = profile_kerf,
      min_piece_width = profile_min_piece_width,
      min_piece_height = profile_min_piece_height,
      configuration = coalesce(profile_configuration, '{}'::jsonb),
      active = profile_active
  where id = target_profile_id
  returning * into new_profile;

  perform public.write_audit_log(
    old_profile.organization_id,
    auth.uid(),
    'machine_profile',
    target_profile_id,
    'machine_profile_updated',
    to_jsonb(old_profile),
    to_jsonb(new_profile),
    '{}'::jsonb
  );

  return target_profile_id;
end;
$$;

alter table public.audit_log enable row level security;

drop policy if exists "audit_log_select_admin" on public.audit_log;
create policy "audit_log_select_admin"
on public.audit_log
for select
to authenticated
using (public.has_org_role(organization_id, array['admin'::public.organization_role]));

drop policy if exists "audit_log_insert_admin" on public.audit_log;
create policy "audit_log_insert_admin"
on public.audit_log
for insert
to authenticated
with check (
  actor_id = auth.uid()
  and public.has_org_role(organization_id, array['admin'::public.organization_role])
);

revoke all on function public.write_audit_log(uuid, uuid, text, uuid, text, jsonb, jsonb, jsonb) from public;
revoke all on function public.admin_update_organization_member(uuid, uuid, public.organization_role, boolean, text) from public;
revoke all on function public.admin_create_machine_profile(uuid, text, text, text, text, numeric, numeric, numeric, jsonb, boolean) from public;
revoke all on function public.admin_update_machine_profile(uuid, text, text, text, text, numeric, numeric, numeric, jsonb, boolean) from public;

grant execute on function public.admin_update_organization_member(uuid, uuid, public.organization_role, boolean, text) to authenticated;
grant execute on function public.admin_create_machine_profile(uuid, text, text, text, text, numeric, numeric, numeric, jsonb, boolean) to authenticated;
grant execute on function public.admin_update_machine_profile(uuid, text, text, text, text, numeric, numeric, numeric, jsonb, boolean) to authenticated;

grant select, insert on public.audit_log to authenticated;
