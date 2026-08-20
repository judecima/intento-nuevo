-- Corrige la insercion de proyectos para los tres flujos de alta:
-- cliente/admin propio, vendedor para un cliente y superusuario de plataforma.
-- La politica es deliberadamente unica para evitar que migraciones posteriores
-- de permisos de tenant dejen fuera el caso platform_admin.

drop policy if exists "projects_insert_owner_customer_admin" on public.projects;
drop policy if exists "projects_insert_platform_admin" on public.projects;
drop policy if exists "projects_insert_authorized" on public.projects;

create policy "projects_insert_authorized"
on public.projects
for insert
to authenticated
with check (
  status = 'draft'::public.project_status
  and (
    (
      public.is_platform_admin()
      and (
        owner_id = auth.uid()
        or exists (
          select 1
          from public.organization_members customer_member
          where customer_member.organization_id = projects.organization_id
            and customer_member.user_id = projects.owner_id
            and customer_member.role = 'customer'::public.organization_role
            and customer_member.active = true
        )
      )
    )
    or (
      owner_id = auth.uid()
      and public.has_org_role(
        organization_id,
        array[
          'customer'::public.organization_role,
          'seller'::public.organization_role,
          'admin'::public.organization_role
        ]
      )
    )
    or (
      public.has_org_role(organization_id, array['seller'::public.organization_role])
      and exists (
        select 1
        from public.organization_members customer_member
        where customer_member.organization_id = projects.organization_id
          and customer_member.user_id = projects.owner_id
          and customer_member.role = 'customer'::public.organization_role
          and customer_member.active = true
      )
    )
  )
);

