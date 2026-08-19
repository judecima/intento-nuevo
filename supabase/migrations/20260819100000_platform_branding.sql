-- Identidad visual global del SaaS, independiente de los tenants.
create table if not exists public.platform_settings (
  id boolean primary key default true check (id = true),
  legal_name text not null default 'Plan de corte SaaS',
  primary_color text not null default '#12666b',
  secondary_color text not null default '#f5b301',
  logo_url text,
  updated_at timestamptz not null default now(),
  constraint platform_settings_primary_color_format check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint platform_settings_secondary_color_format check (secondary_color ~ '^#[0-9A-Fa-f]{6}$')
);

insert into public.platform_settings (id) values (true)
on conflict (id) do nothing;

alter table public.platform_settings enable row level security;

drop policy if exists "platform_settings_select_authenticated" on public.platform_settings;
create policy "platform_settings_select_authenticated"
on public.platform_settings for select to authenticated
using (true);

drop policy if exists "platform_settings_update_platform_admin" on public.platform_settings;
create policy "platform_settings_update_platform_admin"
on public.platform_settings for update to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

grant select on public.platform_settings to authenticated;
grant update on public.platform_settings to authenticated;
