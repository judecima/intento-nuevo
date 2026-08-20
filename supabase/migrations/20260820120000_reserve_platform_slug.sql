-- Reserva /jadsi para el acceso tenantless del super usuario de plataforma.

alter table public.organizations
  drop constraint if exists organizations_slug_not_platform;

alter table public.organizations
  add constraint organizations_slug_not_platform
    check (slug <> 'jadsi');
