create or replace function public.can_read_generated_file(target_file_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.generated_files files
    where files.id = target_file_id
      and public.can_manage_production_order(files.order_id)
  );
$$;

drop policy if exists "production_jobs_select_authorized" on public.production_jobs;
create policy "production_jobs_select_authorized"
on public.production_jobs
for select
to authenticated
using (public.can_manage_production_order(order_id));

drop policy if exists "generated_files_select_authorized" on public.generated_files;
create policy "generated_files_select_authorized"
on public.generated_files
for select
to authenticated
using (public.can_read_generated_file(id));

drop policy if exists "production_files_storage_select_authorized" on storage.objects;
create policy "production_files_storage_select_authorized"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'production-files'
  and exists (
    select 1
    from public.generated_files files
    where files.storage_bucket = storage.objects.bucket_id
      and files.storage_path = storage.objects.name
      and public.can_read_generated_file(files.id)
  )
);

revoke all on function public.can_read_generated_file(uuid) from public;
grant execute on function public.can_read_generated_file(uuid) to authenticated;
