-- Fase 15: el superusuario de plataforma puede leer optimizaciones de los
-- proyectos que administra, aunque no pertenezca a una organizacion.
-- Las politicas se suman a las existentes y no cambian el acceso tenant.

drop policy if exists "optimization_jobs_select_platform_admin" on public.optimization_jobs;
create policy "optimization_jobs_select_platform_admin"
on public.optimization_jobs
for select
to authenticated
using (public.is_platform_admin());

drop policy if exists "optimization_results_select_platform_admin" on public.optimization_results;
create policy "optimization_results_select_platform_admin"
on public.optimization_results
for select
to authenticated
using (public.is_platform_admin());

drop policy if exists "optimization_boards_select_platform_admin" on public.optimization_boards;
create policy "optimization_boards_select_platform_admin"
on public.optimization_boards
for select
to authenticated
using (public.is_platform_admin());

drop policy if exists "optimization_pieces_select_platform_admin" on public.optimization_pieces;
create policy "optimization_pieces_select_platform_admin"
on public.optimization_pieces
for select
to authenticated
using (public.is_platform_admin());

drop policy if exists "optimization_cuts_select_platform_admin" on public.optimization_cuts;
create policy "optimization_cuts_select_platform_admin"
on public.optimization_cuts
for select
to authenticated
using (public.is_platform_admin());

drop policy if exists "optimization_remnants_select_platform_admin" on public.optimization_remnants;
create policy "optimization_remnants_select_platform_admin"
on public.optimization_remnants
for select
to authenticated
using (public.is_platform_admin());
