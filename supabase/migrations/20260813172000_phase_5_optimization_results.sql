do $$
begin
  if not exists (select 1 from pg_type where typname = 'optimization_job_status') then
    create type public.optimization_job_status as enum (
      'queued',
      'running',
      'completed',
      'failed',
      'cancelled'
    );
  end if;
end $$;

create table if not exists public.optimization_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  project_version integer not null check (project_version > 0),
  status public.optimization_job_status not null default 'queued',
  algorithm_version text not null,
  strategy text not null default 'baseline',
  requested_by uuid not null references public.profiles(id) on delete restrict,
  started_at timestamptz,
  completed_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.optimization_results (
  id uuid primary key default gen_random_uuid(),
  optimization_job_id uuid not null unique references public.optimization_jobs(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  project_version integer not null check (project_version > 0),
  board_count integer not null check (board_count >= 0),
  piece_count integer not null check (piece_count >= 0),
  utilization_percentage numeric(7, 3) not null check (utilization_percentage >= 0),
  waste_percentage numeric(7, 3) not null check (waste_percentage >= 0),
  commercial_remnant_area numeric(14, 6) not null default 0 check (commercial_remnant_area >= 0),
  cut_count integer not null default 0 check (cut_count >= 0),
  saw_meters numeric(14, 3) not null default 0 check (saw_meters >= 0),
  result_json jsonb not null,
  validation_json jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.optimization_boards (
  id uuid primary key default gen_random_uuid(),
  optimization_result_id uuid not null references public.optimization_results(id) on delete cascade,
  board_index integer not null check (board_index >= 0),
  width numeric(10, 2) not null check (width > 0),
  height numeric(10, 2) not null check (height > 0),
  placement_count integer not null default 0 check (placement_count >= 0),
  cut_count integer not null default 0 check (cut_count >= 0),
  remnant_count integer not null default 0 check (remnant_count >= 0),
  raw_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (optimization_result_id, board_index)
);

create table if not exists public.optimization_pieces (
  id uuid primary key default gen_random_uuid(),
  optimization_result_id uuid not null references public.optimization_results(id) on delete cascade,
  board_index integer not null check (board_index >= 0),
  piece_id text not null,
  reference text not null,
  description text not null default '',
  x numeric(10, 2) not null check (x >= 0),
  y numeric(10, 2) not null check (y >= 0),
  width numeric(10, 2) not null check (width > 0),
  height numeric(10, 2) not null check (height > 0),
  rotated boolean not null default false,
  level integer not null default 0,
  raw_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.optimization_cuts (
  id uuid primary key default gen_random_uuid(),
  optimization_result_id uuid not null references public.optimization_results(id) on delete cascade,
  board_index integer not null check (board_index >= 0),
  x1 numeric(10, 2) not null check (x1 >= 0),
  y1 numeric(10, 2) not null check (y1 >= 0),
  x2 numeric(10, 2) not null check (x2 >= 0),
  y2 numeric(10, 2) not null check (y2 >= 0),
  level integer not null default 0,
  length numeric(12, 3) not null check (length >= 0),
  terminal boolean not null default false,
  raw_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.optimization_remnants (
  id uuid primary key default gen_random_uuid(),
  optimization_result_id uuid not null references public.optimization_results(id) on delete cascade,
  board_index integer not null check (board_index >= 0),
  x numeric(10, 2) not null check (x >= 0),
  y numeric(10, 2) not null check (y >= 0),
  width numeric(10, 2) not null check (width > 0),
  height numeric(10, 2) not null check (height > 0),
  area numeric(14, 2) not null check (area >= 0),
  commercial boolean not null default false,
  raw_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists optimization_jobs_project_version_idx
  on public.optimization_jobs (project_id, project_version, created_at desc);

create index if not exists optimization_jobs_org_status_idx
  on public.optimization_jobs (organization_id, status, created_at desc);

create index if not exists optimization_results_project_created_idx
  on public.optimization_results (project_id, created_at desc);

create index if not exists optimization_boards_result_idx
  on public.optimization_boards (optimization_result_id, board_index);

create index if not exists optimization_pieces_result_board_idx
  on public.optimization_pieces (optimization_result_id, board_index);

create index if not exists optimization_cuts_result_board_idx
  on public.optimization_cuts (optimization_result_id, board_index);

create index if not exists optimization_remnants_result_board_idx
  on public.optimization_remnants (optimization_result_id, board_index);

create or replace function public.validate_optimization_job_project()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  project_record record;
begin
  select organization_id, version
  into project_record
  from public.projects
  where id = new.project_id;

  if project_record.organization_id is null then
    raise exception 'PROJECT_NOT_FOUND' using errcode = 'P0001';
  end if;

  if project_record.organization_id <> new.organization_id then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  if new.project_version <= 0 then
    raise exception 'PROJECT_VERSION_CONFLICT' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists optimization_jobs_validate_project on public.optimization_jobs;
create trigger optimization_jobs_validate_project
before insert or update of organization_id, project_id, project_version on public.optimization_jobs
for each row execute function public.validate_optimization_job_project();

create or replace function public.validate_optimization_result_job()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  job_record record;
begin
  select organization_id, project_id, project_version
  into job_record
  from public.optimization_jobs
  where id = new.optimization_job_id;

  if job_record.project_id is null then
    raise exception 'OPTIMIZATION_JOB_NOT_FOUND' using errcode = 'P0001';
  end if;

  if job_record.organization_id <> new.organization_id
     or job_record.project_id <> new.project_id
     or job_record.project_version <> new.project_version then
    raise exception 'OPTIMIZATION_RESULT_JOB_MISMATCH' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists optimization_results_validate_job on public.optimization_results;
create trigger optimization_results_validate_job
before insert or update of optimization_job_id, organization_id, project_id, project_version on public.optimization_results
for each row execute function public.validate_optimization_result_job();

drop trigger if exists optimization_jobs_set_updated_at on public.optimization_jobs;
create trigger optimization_jobs_set_updated_at
before update on public.optimization_jobs
for each row execute function public.set_updated_at();

create or replace function public.can_read_optimization_result(target_result_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.optimization_results results
    where results.id = target_result_id
      and public.can_read_project(results.project_id)
  );
$$;

create or replace function public.can_write_optimization_result(target_result_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.optimization_results results
    where results.id = target_result_id
      and public.can_edit_project(results.project_id)
  );
$$;

alter table public.optimization_jobs enable row level security;
alter table public.optimization_results enable row level security;
alter table public.optimization_boards enable row level security;
alter table public.optimization_pieces enable row level security;
alter table public.optimization_cuts enable row level security;
alter table public.optimization_remnants enable row level security;

drop policy if exists "optimization_jobs_select_readable_project" on public.optimization_jobs;
create policy "optimization_jobs_select_readable_project"
on public.optimization_jobs
for select
to authenticated
using (public.can_read_project(project_id));

drop policy if exists "optimization_jobs_insert_editable_project" on public.optimization_jobs;
create policy "optimization_jobs_insert_editable_project"
on public.optimization_jobs
for insert
to authenticated
with check (
  requested_by = auth.uid()
  and public.can_edit_project(project_id)
);

drop policy if exists "optimization_jobs_update_editable_project" on public.optimization_jobs;
create policy "optimization_jobs_update_editable_project"
on public.optimization_jobs
for update
to authenticated
using (public.can_edit_project(project_id))
with check (public.can_edit_project(project_id));

drop policy if exists "optimization_results_select_readable_project" on public.optimization_results;
create policy "optimization_results_select_readable_project"
on public.optimization_results
for select
to authenticated
using (public.can_read_project(project_id));

drop policy if exists "optimization_results_insert_editable_project" on public.optimization_results;
create policy "optimization_results_insert_editable_project"
on public.optimization_results
for insert
to authenticated
with check (
  public.can_edit_project(project_id)
  and exists (
    select 1
    from public.optimization_jobs jobs
    where jobs.id = optimization_job_id
      and jobs.project_id = optimization_results.project_id
      and jobs.organization_id = optimization_results.organization_id
  )
);

drop policy if exists "optimization_boards_select_readable_result" on public.optimization_boards;
create policy "optimization_boards_select_readable_result"
on public.optimization_boards
for select
to authenticated
using (public.can_read_optimization_result(optimization_result_id));

drop policy if exists "optimization_boards_insert_writable_result" on public.optimization_boards;
create policy "optimization_boards_insert_writable_result"
on public.optimization_boards
for insert
to authenticated
with check (public.can_write_optimization_result(optimization_result_id));

drop policy if exists "optimization_pieces_select_readable_result" on public.optimization_pieces;
create policy "optimization_pieces_select_readable_result"
on public.optimization_pieces
for select
to authenticated
using (public.can_read_optimization_result(optimization_result_id));

drop policy if exists "optimization_pieces_insert_writable_result" on public.optimization_pieces;
create policy "optimization_pieces_insert_writable_result"
on public.optimization_pieces
for insert
to authenticated
with check (public.can_write_optimization_result(optimization_result_id));

drop policy if exists "optimization_cuts_select_readable_result" on public.optimization_cuts;
create policy "optimization_cuts_select_readable_result"
on public.optimization_cuts
for select
to authenticated
using (public.can_read_optimization_result(optimization_result_id));

drop policy if exists "optimization_cuts_insert_writable_result" on public.optimization_cuts;
create policy "optimization_cuts_insert_writable_result"
on public.optimization_cuts
for insert
to authenticated
with check (public.can_write_optimization_result(optimization_result_id));

drop policy if exists "optimization_remnants_select_readable_result" on public.optimization_remnants;
create policy "optimization_remnants_select_readable_result"
on public.optimization_remnants
for select
to authenticated
using (public.can_read_optimization_result(optimization_result_id));

drop policy if exists "optimization_remnants_insert_writable_result" on public.optimization_remnants;
create policy "optimization_remnants_insert_writable_result"
on public.optimization_remnants
for insert
to authenticated
with check (public.can_write_optimization_result(optimization_result_id));

revoke all on function public.can_read_optimization_result(uuid) from public;
revoke all on function public.can_write_optimization_result(uuid) from public;
grant execute on function public.can_read_optimization_result(uuid) to authenticated;
grant execute on function public.can_write_optimization_result(uuid) to authenticated;

grant select, insert, update on public.optimization_jobs to authenticated;
grant select, insert on public.optimization_results to authenticated;
grant select, insert on public.optimization_boards to authenticated;
grant select, insert on public.optimization_pieces to authenticated;
grant select, insert on public.optimization_cuts to authenticated;
grant select, insert on public.optimization_remnants to authenticated;
