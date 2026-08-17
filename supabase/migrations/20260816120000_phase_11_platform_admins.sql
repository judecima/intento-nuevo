-- Fase 11: super usuario de plataforma y ABM de organizaciones.
--
-- Hasta ahora el rol mas alto era `admin` DENTRO de una organizacion: nadie
-- podia crear organizaciones ni vincular usuarios a una organizacion de la que
-- no fuera miembro (de hecho `organizations` no tenia politica de insert).
-- Esta fase agrega un rol por encima del tenant: el super usuario.

create table if not exists public.platform_admins (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  note text,
  created_at timestamptz not null default now()
);

comment on table public.platform_admins is
  'Usuarios con permisos de plataforma: crean organizaciones y sus membresias.';

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_admins admins
    where admins.user_id = auth.uid()
  );
$$;

revoke all on function public.is_platform_admin() from public;
grant execute on function public.is_platform_admin() to authenticated;

alter table public.platform_admins enable row level security;

-- La tabla se administra con service role; por RLS solo se puede leer.
drop policy if exists "platform_admins_select_self_or_platform" on public.platform_admins;
create policy "platform_admins_select_self_or_platform"
on public.platform_admins
for select
to authenticated
using (user_id = auth.uid() or public.is_platform_admin());

-- ---------------------------------------------------------------- organizations
-- Las politicas permisivas se combinan con OR: estas se suman a las de tenant
-- sin alterar lo que ya podia hacer un admin de organizacion.
drop policy if exists "organizations_select_platform_admin" on public.organizations;
create policy "organizations_select_platform_admin"
on public.organizations
for select
to authenticated
using (public.is_platform_admin());

drop policy if exists "organizations_insert_platform_admin" on public.organizations;
create policy "organizations_insert_platform_admin"
on public.organizations
for insert
to authenticated
with check (public.is_platform_admin());

drop policy if exists "organizations_update_platform_admin" on public.organizations;
create policy "organizations_update_platform_admin"
on public.organizations
for update
to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists "organizations_delete_platform_admin" on public.organizations;
create policy "organizations_delete_platform_admin"
on public.organizations
for delete
to authenticated
using (public.is_platform_admin());

-- --------------------------------------------------------- organization_members
drop policy if exists "organization_members_select_platform_admin" on public.organization_members;
create policy "organization_members_select_platform_admin"
on public.organization_members
for select
to authenticated
using (public.is_platform_admin());

drop policy if exists "organization_members_insert_platform_admin" on public.organization_members;
create policy "organization_members_insert_platform_admin"
on public.organization_members
for insert
to authenticated
with check (public.is_platform_admin());

drop policy if exists "organization_members_update_platform_admin" on public.organization_members;
create policy "organization_members_update_platform_admin"
on public.organization_members
for update
to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists "organization_members_delete_platform_admin" on public.organization_members;
create policy "organization_members_delete_platform_admin"
on public.organization_members
for delete
to authenticated
using (public.is_platform_admin());

-- ------------------------------------------------------------------- profiles
-- El super usuario necesita buscar personas por email para vincularlas.
drop policy if exists "profiles_select_platform_admin" on public.profiles;
create policy "profiles_select_platform_admin"
on public.profiles
for select
to authenticated
using (public.is_platform_admin());

-- --------------------------------------------------------------------- alta
-- Super usuario inicial. Idempotente: si el usuario todavia no existe en
-- auth.users, la migracion no falla y el alta se puede repetir despues.
insert into public.platform_admins (user_id, note)
select profiles.id, 'super usuario inicial'
from public.profiles
where lower(profiles.email) = 'juliodecima@gmail.com'
on conflict (user_id) do nothing;
