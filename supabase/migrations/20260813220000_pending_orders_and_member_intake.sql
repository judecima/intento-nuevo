-- Pending order approval and administrator-controlled internal user intake.

create or replace function public.approve_order(
  target_order_id uuid,
  expected_order_version integer,
  transition_comment text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  order_record public.orders%rowtype;
  result_record public.optimization_results%rowtype;
begin
  select *
  into order_record
  from public.orders
  where id = target_order_id
  for update;

  if order_record.id is null then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001';
  end if;

  if order_record.version <> expected_order_version then
    raise exception 'ORDER_VERSION_CONFLICT' using errcode = 'P0001';
  end if;

  if order_record.status not in ('submitted'::public.order_status, 'under_review'::public.order_status) then
    raise exception 'ORDER_INVALID_STATUS' using errcode = 'P0001';
  end if;

  if order_record.snapshot is null or order_record.snapshot = '{}'::jsonb then
    raise exception 'ORDER_SNAPSHOT_MISSING' using errcode = 'P0001';
  end if;

  if not public.has_org_role(order_record.organization_id, array['seller'::public.organization_role, 'admin'::public.organization_role]) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  select *
  into result_record
  from public.optimization_results
  where id = order_record.selected_optimization_result_id;

  if result_record.id is null or coalesce((result_record.validation_json->>'ok')::boolean, false) is not true then
    raise exception 'OPTIMIZATION_INVALID' using errcode = 'P0001';
  end if;

  update public.orders
  set status = 'approved'::public.order_status,
      reviewed_by = coalesce(reviewed_by, auth.uid()),
      reviewed_at = coalesce(reviewed_at, now()),
      approved_by = auth.uid(),
      approved_at = now(),
      notes_seller = coalesce(nullif(transition_comment, ''), notes_seller)
  where id = target_order_id;

  update public.projects
  set status = 'approved'::public.project_status
  where id = order_record.project_id;

  insert into public.order_status_history (order_id, from_status, to_status, changed_by, comment)
  values (target_order_id, order_record.status, 'approved'::public.order_status, auth.uid(), nullif(transition_comment, ''));

  return target_order_id;
end;
$$;

create or replace function public.admin_upsert_organization_member(
  target_organization_id uuid,
  target_user_id uuid,
  new_role public.organization_role,
  new_active boolean default true,
  change_comment text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  old_member public.organization_members%rowtype;
  active_admins integer;
  profile_exists boolean;
begin
  if not public.has_org_role(target_organization_id, array['admin'::public.organization_role]) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  select exists (
    select 1
    from public.profiles
    where id = target_user_id
  )
  into profile_exists;

  if profile_exists is not true then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0001';
  end if;

  select *
  into old_member
  from public.organization_members
  where organization_id = target_organization_id
    and user_id = target_user_id
  for update;

  if old_member.user_id is null then
    insert into public.organization_members (organization_id, user_id, role, active)
    values (target_organization_id, target_user_id, new_role, new_active);

    perform public.write_audit_log(
      target_organization_id,
      auth.uid(),
      'organization_member',
      target_user_id,
      'organization_member_created',
      null,
      jsonb_build_object(
        'organization_id', target_organization_id,
        'user_id', target_user_id,
        'role', new_role,
        'active', new_active
      ),
      jsonb_build_object('comment', nullif(change_comment, ''))
    );
  else
    if old_member.role = 'admin'::public.organization_role and old_member.active = true
       and (new_role <> 'admin'::public.organization_role or new_active is not true) then
      select count(*)
      into active_admins
      from public.organization_members
      where organization_id = target_organization_id
        and active = true
        and role = 'admin'::public.organization_role
        and user_id <> target_user_id;

      if active_admins = 0 then
        raise exception 'LAST_ADMIN_REQUIRED' using errcode = 'P0001';
      end if;
    end if;

    update public.organization_members
    set role = new_role,
        active = new_active
    where organization_id = target_organization_id
      and user_id = target_user_id;

    perform public.write_audit_log(
      target_organization_id,
      auth.uid(),
      'organization_member',
      target_user_id,
      'organization_member_updated',
      to_jsonb(old_member),
      jsonb_build_object(
        'organization_id', target_organization_id,
        'user_id', target_user_id,
        'role', new_role,
        'active', new_active
      ),
      jsonb_build_object('comment', nullif(change_comment, ''))
    );
  end if;

  return target_user_id;
end;
$$;

revoke all on function public.approve_order(uuid, integer, text) from public;
revoke all on function public.admin_upsert_organization_member(uuid, uuid, public.organization_role, boolean, text) from public;

grant execute on function public.approve_order(uuid, integer, text) to authenticated;
grant execute on function public.admin_upsert_organization_member(uuid, uuid, public.organization_role, boolean, text) to authenticated;
