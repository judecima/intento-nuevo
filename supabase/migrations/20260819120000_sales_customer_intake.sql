-- Intake de clientes por mostrador/ventas.
alter table public.profiles add column if not exists address text;

drop policy if exists "profiles_select_self_or_org_admin" on public.profiles;
drop policy if exists "profiles_select_same_org_staff" on public.profiles;
create policy "profiles_select_same_org_staff"
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or exists (
    select 1
    from public.organization_members viewer_membership
    join public.organization_members target_membership
      on target_membership.organization_id = viewer_membership.organization_id
    where viewer_membership.user_id = auth.uid()
      and viewer_membership.active = true
      and viewer_membership.role in ('seller'::public.organization_role, 'admin'::public.organization_role)
      and target_membership.user_id = profiles.id
      and target_membership.active = true
      and target_membership.role = 'customer'::public.organization_role
  )
);

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
        (
          projects.owner_id = auth.uid()
          and public.has_org_role(
            projects.organization_id,
            array['customer'::public.organization_role, 'seller'::public.organization_role, 'admin'::public.organization_role]
          )
        )
        or public.has_org_role(projects.organization_id, array['admin'::public.organization_role])
      )
  );
$$;

drop policy if exists "projects_insert_owner_customer_admin" on public.projects;
create policy "projects_insert_owner_customer_admin"
on public.projects
for insert
to authenticated
with check (
  status = 'draft'::public.project_status
  and (
    (
      owner_id = auth.uid()
      and public.has_org_role(
        organization_id,
        array['customer'::public.organization_role, 'admin'::public.organization_role]
      )
    )
    or (
      public.has_org_role(organization_id, array['seller'::public.organization_role])
      and exists (
        select 1
        from public.organization_members customer_member
        where customer_member.organization_id = organization_id
          and customer_member.user_id = owner_id
          and customer_member.role = 'customer'::public.organization_role
          and customer_member.active = true
      )
    )
  )
);

drop policy if exists "projects_update_owner_draft_or_admin" on public.projects;
create policy "projects_update_owner_draft_or_admin"
on public.projects
for update
to authenticated
using (
  public.has_org_role(organization_id, array['admin'::public.organization_role])
  or (
    owner_id = auth.uid()
    and status in ('draft'::public.project_status, 'optimized'::public.project_status)
    and public.has_org_role(
      organization_id,
      array['customer'::public.organization_role, 'seller'::public.organization_role, 'admin'::public.organization_role]
    )
  )
  or public.has_org_role(organization_id, array['seller'::public.organization_role])
)
with check (
  public.has_org_role(organization_id, array['admin'::public.organization_role])
  or (
    status in ('draft'::public.project_status, 'optimized'::public.project_status)
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
    and public.has_org_role(
      organization_id,
      array['customer'::public.organization_role, 'seller'::public.organization_role, 'admin'::public.organization_role]
    )
  )
);

grant select on public.profiles to authenticated;
grant update (full_name, email, phone, address, updated_at) on public.profiles to authenticated;
