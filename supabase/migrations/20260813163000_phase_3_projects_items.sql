do $$
begin
  if not exists (select 1 from pg_type where typname = 'project_status') then
    create type public.project_status as enum (
      'draft',
      'optimizing',
      'optimized',
      'submitted',
      'under_review',
      'approved',
      'rejected',
      'in_production',
      'completed',
      'cancelled'
    );
  end if;
end $$;

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete restrict,
  name text not null,
  description text,
  status public.project_status not null default 'draft',
  material_id uuid not null references public.materials(id) on delete restrict,
  board_width numeric(10, 2) not null check (board_width > 0),
  board_height numeric(10, 2) not null check (board_height > 0),
  board_thickness numeric(8, 2) not null check (board_thickness >= 0),
  kerf numeric(8, 2) not null default 4.5 check (kerf >= 0),
  trim_x numeric(10, 2) not null default 0 check (trim_x >= 0),
  trim_y numeric(10, 2) not null default 0 check (trim_y >= 0),
  min_remnant numeric(10, 2) not null default 250 check (min_remnant >= 0),
  grain_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0)
);

create table if not exists public.project_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  reference text not null,
  description text,
  quantity integer not null default 1 check (quantity > 0),
  width numeric(10, 2) not null check (width > 0),
  height numeric(10, 2) not null check (height > 0),
  grain boolean not null default false,
  can_rotate boolean not null default true,
  edge_top boolean not null default false,
  edge_bottom boolean not null default false,
  edge_left boolean not null default false,
  edge_right boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_organization_status_idx
  on public.projects (organization_id, status, updated_at desc);

create index if not exists projects_owner_status_idx
  on public.projects (owner_id, status, updated_at desc);

create index if not exists projects_material_id_idx
  on public.projects (material_id);

create index if not exists project_items_project_sort_idx
  on public.project_items (project_id, sort_order, created_at);

create or replace function public.validate_project_material()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  matched_material record;
begin
  select id, organization_id, type, enabled
  into matched_material
  from public.materials
  where id = new.material_id;

  if matched_material.id is null then
    raise exception 'MATERIAL_NOT_FOUND' using errcode = 'P0001';
  end if;

  if matched_material.enabled is not true or matched_material.type <> 'board'::public.material_kind then
    raise exception 'MATERIAL_NOT_FOUND' using errcode = 'P0001';
  end if;

  if matched_material.organization_id is not null and matched_material.organization_id <> new.organization_id then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists projects_validate_material on public.projects;
create trigger projects_validate_material
before insert or update of material_id, organization_id on public.projects
for each row execute function public.validate_project_material();

create or replace function public.prevent_project_identity_change()
returns trigger
language plpgsql
as $$
begin
  if new.organization_id <> old.organization_id then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  if new.owner_id <> old.owner_id then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists projects_prevent_identity_change on public.projects;
create trigger projects_prevent_identity_change
before update on public.projects
for each row execute function public.prevent_project_identity_change();

create or replace function public.bump_project_version()
returns trigger
language plpgsql
as $$
begin
  new.version = old.version + 1;
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists projects_bump_version on public.projects;
create trigger projects_bump_version
before update on public.projects
for each row execute function public.bump_project_version();

drop trigger if exists project_items_set_updated_at on public.project_items;
create trigger project_items_set_updated_at
before update on public.project_items
for each row execute function public.set_updated_at();

create or replace function public.touch_project_from_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_project_id uuid;
begin
  target_project_id = coalesce(new.project_id, old.project_id);

  update public.projects
  set version = version + 1,
      updated_at = now()
  where id = target_project_id;

  return null;
end;
$$;

drop trigger if exists project_items_touch_project_insert on public.project_items;
create trigger project_items_touch_project_insert
after insert on public.project_items
for each row execute function public.touch_project_from_item();

drop trigger if exists project_items_touch_project_update on public.project_items;
create trigger project_items_touch_project_update
after update on public.project_items
for each row execute function public.touch_project_from_item();

drop trigger if exists project_items_touch_project_delete on public.project_items;
create trigger project_items_touch_project_delete
after delete on public.project_items
for each row execute function public.touch_project_from_item();

create or replace function public.can_read_project(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects projects
    where projects.id = target_project_id
      and (
        (
          projects.owner_id = auth.uid()
          and public.is_org_member(projects.organization_id)
        )
        or public.has_org_role(
          projects.organization_id,
          array['seller'::public.organization_role, 'admin'::public.organization_role]
        )
      )
  );
$$;

create or replace function public.can_edit_project(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects projects
    where projects.id = target_project_id
      and projects.status in ('draft'::public.project_status, 'optimized'::public.project_status)
      and (
        (
          projects.owner_id = auth.uid()
          and public.has_org_role(
            projects.organization_id,
            array['customer'::public.organization_role, 'admin'::public.organization_role]
          )
        )
        or public.has_org_role(projects.organization_id, array['admin'::public.organization_role])
      )
  );
$$;

alter table public.projects enable row level security;
alter table public.project_items enable row level security;

drop policy if exists "projects_select_owner_seller_admin" on public.projects;
create policy "projects_select_owner_seller_admin"
on public.projects
for select
to authenticated
using (
  (
    owner_id = auth.uid()
    and public.is_org_member(organization_id)
  )
  or public.has_org_role(
    organization_id,
    array['seller'::public.organization_role, 'admin'::public.organization_role]
  )
);

drop policy if exists "projects_insert_owner_customer_admin" on public.projects;
create policy "projects_insert_owner_customer_admin"
on public.projects
for insert
to authenticated
with check (
  owner_id = auth.uid()
  and status = 'draft'::public.project_status
  and public.has_org_role(
    organization_id,
    array['customer'::public.organization_role, 'admin'::public.organization_role]
  )
);

drop policy if exists "projects_update_owner_draft_or_admin" on public.projects;
create policy "projects_update_owner_draft_or_admin"
on public.projects
for update
to authenticated
using (
  public.has_org_role(organization_id, array['admin'::public.organization_role])
  or (
    owner_id = auth.uid()
    and status in ('draft'::public.project_status, 'optimized'::public.project_status)
    and public.has_org_role(
      organization_id,
      array['customer'::public.organization_role, 'admin'::public.organization_role]
    )
  )
)
with check (
  public.has_org_role(organization_id, array['admin'::public.organization_role])
  or (
    owner_id = auth.uid()
    and status in ('draft'::public.project_status, 'optimized'::public.project_status)
    and public.has_org_role(
      organization_id,
      array['customer'::public.organization_role, 'admin'::public.organization_role]
    )
  )
);

drop policy if exists "projects_delete_draft_owner_or_admin" on public.projects;
create policy "projects_delete_draft_owner_or_admin"
on public.projects
for delete
to authenticated
using (
  status = 'draft'::public.project_status
  and (
    public.has_org_role(organization_id, array['admin'::public.organization_role])
    or (
      owner_id = auth.uid()
      and public.has_org_role(
        organization_id,
        array['customer'::public.organization_role, 'admin'::public.organization_role]
      )
    )
  )
);

drop policy if exists "project_items_select_readable_project" on public.project_items;
create policy "project_items_select_readable_project"
on public.project_items
for select
to authenticated
using (public.can_read_project(project_id));

drop policy if exists "project_items_insert_editable_project" on public.project_items;
create policy "project_items_insert_editable_project"
on public.project_items
for insert
to authenticated
with check (public.can_edit_project(project_id));

drop policy if exists "project_items_update_editable_project" on public.project_items;
create policy "project_items_update_editable_project"
on public.project_items
for update
to authenticated
using (public.can_edit_project(project_id))
with check (public.can_edit_project(project_id));

drop policy if exists "project_items_delete_editable_project" on public.project_items;
create policy "project_items_delete_editable_project"
on public.project_items
for delete
to authenticated
using (public.can_edit_project(project_id));

revoke all on function public.can_read_project(uuid) from public;
revoke all on function public.can_edit_project(uuid) from public;
grant execute on function public.can_read_project(uuid) to authenticated;
grant execute on function public.can_edit_project(uuid) to authenticated;

grant select, insert, update, delete on public.projects, public.project_items to authenticated;
