-- Fase 12: puerta de entrada por organizacion y alta de clientes.
--
-- Cada organizacion tiene una ruta publica (/o/<slug>) donde su gente entra y,
-- si la organizacion lo permite, un cliente puede crearse la cuenta solo. El
-- resto de los roles (admin, vendedor, operario) los sigue dando de alta el
-- super usuario desde el ABM.

alter table public.organizations
  add column if not exists allow_customer_signup boolean not null default true;

comment on column public.organizations.allow_customer_signup is
  'Habilita el auto-registro de clientes desde la ruta publica de la organizacion.';

-- Datos minimos de la organizacion para la pantalla publica: nombre y si acepta
-- registro. No expone la tabla (su RLS sigue exigiendo membresia).
create or replace function public.organization_public_info(target_slug text)
returns table (
  id uuid,
  name text,
  slug text,
  active boolean,
  allow_customer_signup boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select organizations.id,
         organizations.name,
         organizations.slug,
         organizations.active,
         organizations.allow_customer_signup
  from public.organizations
  where organizations.slug = lower(trim(target_slug))
    and organizations.active = true;
$$;

revoke all on function public.organization_public_info(text) from public;
grant execute on function public.organization_public_info(text) to anon, authenticated;

-- Auto-registro: el usuario autenticado se suma a SI MISMO y siempre como
-- cliente. No puede elegir rol ni sumar a terceros.
create or replace function public.join_organization_as_customer(target_slug text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_organization public.organizations%rowtype;
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  select * into target_organization
  from public.organizations
  where slug = lower(trim(target_slug));

  if target_organization.id is null or target_organization.active = false then
    raise exception 'ORGANIZATION_NOT_FOUND' using errcode = 'P0001';
  end if;

  if target_organization.allow_customer_signup = false then
    raise exception 'ORGANIZATION_SIGNUP_DISABLED' using errcode = 'P0001';
  end if;

  -- Si ya pertenece con otro rol, se respeta: no se degrada a cliente.
  insert into public.organization_members (organization_id, user_id, role, active)
  values (target_organization.id, current_user_id, 'customer', true)
  on conflict (organization_id, user_id) do update
    set active = true;

  return target_organization.id;
end;
$$;

revoke all on function public.join_organization_as_customer(text) from public;
grant execute on function public.join_organization_as_customer(text) to authenticated;
