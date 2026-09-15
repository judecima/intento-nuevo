alter table public.optimization_jobs
  add column if not exists profile text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'optimization_jobs_profile_check'
      and conrelid = 'public.optimization_jobs'::regclass
  ) then
    alter table public.optimization_jobs
      add constraint optimization_jobs_profile_check
      check (profile is null or profile in ('fast', 'balanced', 'deep'));
  end if;
end $$;

create unique index if not exists optimization_jobs_one_active_variant_idx
  on public.optimization_jobs (
    project_id,
    project_version,
    algorithm_version,
    strategy,
    coalesce(profile, '')
  )
  where status in ('queued', 'running');
