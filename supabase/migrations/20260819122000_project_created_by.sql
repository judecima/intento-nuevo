-- Distingue al cliente propietario del proyecto del usuario que lo cargo.
alter table public.projects add column if not exists created_by uuid references public.profiles(id) on delete restrict;
update public.projects set created_by = owner_id where created_by is null;
create index if not exists projects_created_by_status_idx on public.projects (created_by, status, updated_at desc);
