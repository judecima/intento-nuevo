-- Fase 13: el super usuario puede trabajar sobre cualquier organizacion.
--
-- Crear un proyecto para otra organizacion requiere tres cosas: ver su catalogo
-- de materiales, poder insertar el proyecto y despues poder leerlo y editarlo.
-- Los helpers `can_read_project` / `can_edit_project` son la base de casi todas
-- las politicas del dominio (piezas, optimizaciones, pedidos), asi que alcanza
-- con extenderlos ahi en vez de duplicar politicas tabla por tabla.

create or replace function public.can_read_project(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects projects
    where projects.id = target_project_id
      and (
        public.is_platform_admin()
        or (
          projects.owner_id = auth.uid()
          and public.is_org_member(projects.organization_id)
        )
        or public.has_org_role(
          projects.organization_id,
          array['seller'::public.organization_role, 'admin'::public.organization_role]
        )
      )
  );
$$;

-- El super usuario no saltea el estado: un proyecto enviado o aprobado sigue
-- congelado para todos, porque el pedido guarda un snapshot de esa version.
create or replace function public.can_edit_project(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects projects
    where projects.id = target_project_id
      and projects.status in ('draft'::public.project_status, 'optimized'::public.project_status)
      and (
        public.is_platform_admin()
        or (
          projects.owner_id = auth.uid()
          and public.has_org_role(
            projects.organization_id,
            array['customer'::public.organization_role, 'admin'::public.organization_role]
          )
        )
        or public.has_org_role(projects.organization_id, array['admin'::public.organization_role])
      )
  );
$$;

-- ------------------------------------------------------------------- projects
drop policy if exists "projects_select_platform_admin" on public.projects;
create policy "projects_select_platform_admin"
on public.projects
for select
to authenticated
using (public.is_platform_admin());

-- Sigue siendo dueno de lo que crea: queda trazable quien lo dio de alta.
drop policy if exists "projects_insert_platform_admin" on public.projects;
create policy "projects_insert_platform_admin"
on public.projects
for insert
to authenticated
with check (
  public.is_platform_admin()
  and owner_id = auth.uid()
  and status = 'draft'::public.project_status
);

drop policy if exists "projects_update_platform_admin" on public.projects;
create policy "projects_update_platform_admin"
on public.projects
for update
to authenticated
using (
  public.is_platform_admin()
  and status in ('draft'::public.project_status, 'optimized'::public.project_status)
)
with check (public.is_platform_admin());

-- ------------------------------------------------------------------ materials
-- Para elegir el tablero hay que ver el catalogo de esa organizacion.
drop policy if exists "materials_select_platform_admin" on public.materials;
create policy "materials_select_platform_admin"
on public.materials
for select
to authenticated
using (public.is_platform_admin());
