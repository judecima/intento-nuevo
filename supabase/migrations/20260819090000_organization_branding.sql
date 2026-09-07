-- Branding por tenant: colores y logo de la organización.
alter table public.organizations
  add column if not exists primary_color text not null default '#12666b',
  add column if not exists secondary_color text not null default '#f5b301',
  add column if not exists logo_url text;

alter table public.organizations
  drop constraint if exists organizations_primary_color_format,
  drop constraint if exists organizations_secondary_color_format;

alter table public.organizations
  add constraint organizations_primary_color_format
    check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  add constraint organizations_secondary_color_format
    check (secondary_color ~ '^#[0-9A-Fa-f]{6}$');

comment on column public.organizations.primary_color is 'Color principal hexadecimal de la interfaz del tenant.';
comment on column public.organizations.secondary_color is 'Color secundario/acento hexadecimal de la interfaz del tenant.';
comment on column public.organizations.logo_url is 'URL publica del logo almacenado en organization-branding.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'organization-branding',
  'organization-branding',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "organization_branding_insert_admin" on storage.objects;
create policy "organization_branding_insert_admin"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'organization-branding'
  and (
    public.is_platform_admin()
    or public.has_org_role((storage.foldername(name))[1]::uuid, array['admin'::public.organization_role])
  )
);

drop policy if exists "organization_branding_update_admin" on storage.objects;
create policy "organization_branding_update_admin"
on storage.objects for update to authenticated
using (
  bucket_id = 'organization-branding'
  and (
    public.is_platform_admin()
    or public.has_org_role((storage.foldername(name))[1]::uuid, array['admin'::public.organization_role])
  )
)
with check (
  bucket_id = 'organization-branding'
  and (
    public.is_platform_admin()
    or public.has_org_role((storage.foldername(name))[1]::uuid, array['admin'::public.organization_role])
  )
);

drop policy if exists "organization_branding_delete_admin" on storage.objects;
create policy "organization_branding_delete_admin"
on storage.objects for delete to authenticated
using (
  bucket_id = 'organization-branding'
  and (
    public.is_platform_admin()
    or public.has_org_role((storage.foldername(name))[1]::uuid, array['admin'::public.organization_role])
  )
);

-- Extiende la puerta publica para que login/register puedan mostrar branding.
drop function if exists public.organization_public_info(text);
create or replace function public.organization_public_info(target_slug text)
returns table (
  id uuid,
  name text,
  slug text,
  active boolean,
  allow_customer_signup boolean,
  primary_color text,
  secondary_color text,
  logo_url text
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
         organizations.allow_customer_signup,
         organizations.primary_color,
         organizations.secondary_color,
         organizations.logo_url
  from public.organizations
  where organizations.slug = lower(trim(target_slug))
    and organizations.active = true;
$$;

revoke all on function public.organization_public_info(text) from public;
grant execute on function public.organization_public_info(text) to anon, authenticated;
