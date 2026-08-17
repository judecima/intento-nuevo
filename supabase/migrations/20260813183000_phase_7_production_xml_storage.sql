do $$
begin
  if not exists (select 1 from pg_type where typname = 'production_job_status') then
    create type public.production_job_status as enum (
      'queued',
      'in_progress',
      'completed',
      'cancelled'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'generated_file_type') then
    create type public.generated_file_type as enum (
      'machine_xml',
      'pdf',
      'other'
    );
  end if;
end $$;

create table if not exists public.machine_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  manufacturer text,
  model text,
  xml_format text not null default 'legacy_project_xml',
  kerf numeric(8, 2) not null default 4.5 check (kerf >= 0),
  min_piece_width numeric(10, 2) not null default 0 check (min_piece_width >= 0),
  min_piece_height numeric(10, 2) not null default 0 check (min_piece_height >= 0),
  configuration jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.production_jobs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  assigned_operator_id uuid references public.profiles(id) on delete restrict,
  status public.production_job_status not null default 'queued',
  started_at timestamptz,
  completed_at timestamptz,
  machine_profile_id uuid references public.machine_profiles(id) on delete restrict,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.generated_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  optimization_result_id uuid not null references public.optimization_results(id) on delete restrict,
  type public.generated_file_type not null,
  storage_bucket text not null default 'production-files',
  storage_path text not null,
  checksum text not null,
  generated_by uuid references public.profiles(id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (storage_bucket, storage_path)
);

create index if not exists machine_profiles_org_active_idx
  on public.machine_profiles (organization_id, active, name);

create index if not exists production_jobs_status_idx
  on public.production_jobs (status, updated_at desc);

create index if not exists generated_files_order_type_idx
  on public.generated_files (order_id, type, created_at desc);

create index if not exists generated_files_org_type_idx
  on public.generated_files (organization_id, type, created_at desc);

drop trigger if exists machine_profiles_set_updated_at on public.machine_profiles;
create trigger machine_profiles_set_updated_at
before update on public.machine_profiles
for each row execute function public.set_updated_at();

drop trigger if exists production_jobs_set_updated_at on public.production_jobs;
create trigger production_jobs_set_updated_at
before update on public.production_jobs
for each row execute function public.set_updated_at();

create or replace function public.can_manage_production_order(target_order_id uuid)
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
      and public.has_org_role(
        orders.organization_id,
        array['operator'::public.organization_role, 'admin'::public.organization_role]
      )
  );
$$;

create or replace function public.can_read_generated_file(target_file_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.generated_files files
    where files.id = target_file_id
      and public.can_read_order(files.order_id)
  );
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

  update public.production_jobs
  set status = 'completed'::public.production_job_status,
      completed_at = now(),
      notes = coalesce(nullif(production_notes, ''), notes)
  where id = job_record.id;

  update public.orders
  set status = 'completed'::public.order_status
  where id = target_order_id;

  insert into public.order_status_history (order_id, from_status, to_status, changed_by, comment)
  values (
    target_order_id,
    'production'::public.order_status,
    'completed'::public.order_status,
    auth.uid(),
    nullif(production_notes, '')
  );

  return job_record.id;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'production-files',
  'production-files',
  false,
  10485760,
  array['application/xml', 'text/xml', 'application/octet-stream']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

insert into public.machine_profiles (
  organization_id,
  name,
  manufacturer,
  model,
  xml_format,
  kerf,
  min_piece_width,
  min_piece_height,
  configuration
)
select
  organizations.id,
  'Perfil estandar XML',
  null,
  null,
  'legacy_project_xml',
  4.5,
  0,
  0,
  jsonb_build_object('source', 'phase_7_default')
from public.organizations
where not exists (
  select 1
  from public.machine_profiles profiles
  where profiles.organization_id = organizations.id
    and profiles.xml_format = 'legacy_project_xml'
);

alter table public.machine_profiles enable row level security;
alter table public.production_jobs enable row level security;
alter table public.generated_files enable row level security;

drop policy if exists "machine_profiles_select_member" on public.machine_profiles;
create policy "machine_profiles_select_member"
on public.machine_profiles
for select
to authenticated
using (public.is_org_member(organization_id));

drop policy if exists "machine_profiles_insert_admin" on public.machine_profiles;
create policy "machine_profiles_insert_admin"
on public.machine_profiles
for insert
to authenticated
with check (public.has_org_role(organization_id, array['admin'::public.organization_role]));

drop policy if exists "machine_profiles_update_admin" on public.machine_profiles;
create policy "machine_profiles_update_admin"
on public.machine_profiles
for update
to authenticated
using (public.has_org_role(organization_id, array['admin'::public.organization_role]))
with check (public.has_org_role(organization_id, array['admin'::public.organization_role]));

drop policy if exists "production_jobs_select_authorized" on public.production_jobs;
create policy "production_jobs_select_authorized"
on public.production_jobs
for select
to authenticated
using (public.can_read_order(order_id));

drop policy if exists "generated_files_select_authorized" on public.generated_files;
create policy "generated_files_select_authorized"
on public.generated_files
for select
to authenticated
using (public.can_read_generated_file(id));

drop policy if exists "production_files_storage_select_authorized" on storage.objects;
create policy "production_files_storage_select_authorized"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'production-files'
  and exists (
    select 1
    from public.generated_files files
    where files.storage_bucket = storage.objects.bucket_id
      and files.storage_path = storage.objects.name
      and public.can_read_generated_file(files.id)
  )
);

revoke all on function public.can_manage_production_order(uuid) from public;
revoke all on function public.can_read_generated_file(uuid) from public;
revoke all on function public.start_production_job(uuid, integer, uuid, text) from public;
revoke all on function public.complete_production_job(uuid, integer, text) from public;

grant execute on function public.can_manage_production_order(uuid) to authenticated;
grant execute on function public.can_read_generated_file(uuid) to authenticated;
grant execute on function public.start_production_job(uuid, integer, uuid, text) to authenticated;
grant execute on function public.complete_production_job(uuid, integer, text) to authenticated;

grant select, insert, update on public.machine_profiles to authenticated;
grant select on public.production_jobs to authenticated;
grant select on public.generated_files to authenticated;
