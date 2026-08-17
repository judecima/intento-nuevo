do $$
begin
  if not exists (select 1 from pg_type where typname = 'material_kind') then
    create type public.material_kind as enum ('board', 'edge_band', 'other');
  end if;
end $$;

create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  external_id text,
  code text not null,
  code_ext text,
  description text not null,
  texture_id integer,
  type public.material_kind not null default 'board',
  width numeric(10, 2) not null check (width > 0),
  height numeric(10, 2) not null check (height > 0),
  thickness numeric(8, 2) not null check (thickness >= 0),
  has_grain boolean not null default false,
  price_m2 numeric(12, 2) not null default 0,
  ref_x numeric(10, 2) not null default 0,
  ref_y numeric(10, 2) not null default 0,
  min_cut numeric(10, 2) not null default 0,
  enabled boolean not null default true,
  image_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint materials_organization_external_unique unique (organization_id, external_id)
);

create table if not exists public.board_formats (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  material_id uuid not null references public.materials(id) on delete cascade,
  label text,
  width numeric(10, 2) not null check (width > 0),
  height numeric(10, 2) not null check (height > 0),
  thickness numeric(8, 2) not null check (thickness >= 0),
  enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint board_formats_material_dimensions_unique unique (material_id, width, height, thickness)
);

create index if not exists materials_organization_type_enabled_idx
  on public.materials (organization_id, type, enabled);

create index if not exists materials_dimensions_idx
  on public.materials (width, height, thickness);

create index if not exists materials_texture_id_idx
  on public.materials (texture_id)
  where texture_id is not null;

create index if not exists materials_search_idx
  on public.materials
  using gin (
    to_tsvector(
      'simple',
      coalesce(code, '') || ' ' || coalesce(code_ext, '') || ' ' || coalesce(description, '')
    )
  );

create index if not exists board_formats_organization_enabled_idx
  on public.board_formats (organization_id, enabled);

create index if not exists board_formats_material_id_idx
  on public.board_formats (material_id);

drop trigger if exists materials_set_updated_at on public.materials;
create trigger materials_set_updated_at
before update on public.materials
for each row execute function public.set_updated_at();

drop trigger if exists board_formats_set_updated_at on public.board_formats;
create trigger board_formats_set_updated_at
before update on public.board_formats
for each row execute function public.set_updated_at();

alter table public.materials enable row level security;
alter table public.board_formats enable row level security;

drop policy if exists "materials_select_member_enabled" on public.materials;
create policy "materials_select_member_enabled"
on public.materials
for select
to authenticated
using (
  (enabled = true and (organization_id is null or public.is_org_member(organization_id)))
  or (
    organization_id is not null
    and public.has_org_role(organization_id, array['admin'::public.organization_role])
  )
);

drop policy if exists "materials_insert_admin" on public.materials;
create policy "materials_insert_admin"
on public.materials
for insert
to authenticated
with check (
  organization_id is not null
  and public.has_org_role(organization_id, array['admin'::public.organization_role])
);

drop policy if exists "materials_update_admin" on public.materials;
create policy "materials_update_admin"
on public.materials
for update
to authenticated
using (
  organization_id is not null
  and public.has_org_role(organization_id, array['admin'::public.organization_role])
)
with check (
  organization_id is not null
  and public.has_org_role(organization_id, array['admin'::public.organization_role])
);

drop policy if exists "materials_delete_admin" on public.materials;
create policy "materials_delete_admin"
on public.materials
for delete
to authenticated
using (
  organization_id is not null
  and public.has_org_role(organization_id, array['admin'::public.organization_role])
);

drop policy if exists "board_formats_select_member_enabled" on public.board_formats;
create policy "board_formats_select_member_enabled"
on public.board_formats
for select
to authenticated
using (
  (enabled = true and (organization_id is null or public.is_org_member(organization_id)))
  or (
    organization_id is not null
    and public.has_org_role(organization_id, array['admin'::public.organization_role])
  )
);

drop policy if exists "board_formats_insert_admin" on public.board_formats;
create policy "board_formats_insert_admin"
on public.board_formats
for insert
to authenticated
with check (
  organization_id is not null
  and public.has_org_role(organization_id, array['admin'::public.organization_role])
);

drop policy if exists "board_formats_update_admin" on public.board_formats;
create policy "board_formats_update_admin"
on public.board_formats
for update
to authenticated
using (
  organization_id is not null
  and public.has_org_role(organization_id, array['admin'::public.organization_role])
)
with check (
  organization_id is not null
  and public.has_org_role(organization_id, array['admin'::public.organization_role])
);

drop policy if exists "board_formats_delete_admin" on public.board_formats;
create policy "board_formats_delete_admin"
on public.board_formats
for delete
to authenticated
using (
  organization_id is not null
  and public.has_org_role(organization_id, array['admin'::public.organization_role])
);

grant select on public.profiles, public.organizations, public.organization_members to authenticated;
grant update on public.profiles to authenticated;
grant select, insert, update, delete on public.materials, public.board_formats to authenticated;
