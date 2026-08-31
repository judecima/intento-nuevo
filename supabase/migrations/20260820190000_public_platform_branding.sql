-- Puerta publica para que login/register de plataforma muestren la identidad
-- configurada del SaaS antes de que exista una sesion autenticada.
create or replace function public.platform_public_branding()
returns table (
  legal_name text,
  primary_color text,
  secondary_color text,
  logo_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(trim(platform_settings.legal_name), ''), 'Plan de corte SaaS') as legal_name,
         coalesce(platform_settings.primary_color, '#12666b') as primary_color,
         coalesce(platform_settings.secondary_color, '#f5b301') as secondary_color,
         platform_settings.logo_url
  from public.platform_settings
  where platform_settings.id = true
  limit 1;
$$;

revoke all on function public.platform_public_branding() from public;
grant execute on function public.platform_public_branding() to anon, authenticated;
