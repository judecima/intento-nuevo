-- Phase 1 seed. Create auth users from Supabase Auth first, then attach them
-- to this organization with organization_members rows.

insert into public.organizations (name, slug, active)
values ('Demo Corte', 'demo-corte', true)
on conflict (slug) do update
set name = excluded.name,
    active = excluded.active,
    updated_at = now();

with demo_org as (
  select id from public.organizations where slug = 'demo-corte'
)
insert into public.materials (
  organization_id,
  external_id,
  code,
  code_ext,
  description,
  texture_id,
  type,
  width,
  height,
  thickness,
  has_grain,
  price_m2,
  ref_x,
  ref_y,
  min_cut,
  enabled,
  image_url,
  metadata
)
select
  demo_org.id,
  seed.external_id,
  seed.code,
  seed.code_ext,
  seed.description,
  seed.texture_id,
  seed.type::public.material_kind,
  seed.width,
  seed.height,
  seed.thickness,
  seed.has_grain,
  0,
  0,
  0,
  0,
  true,
  seed.image_url,
  jsonb_build_object('source', 'supabase/seed.sql')
from demo_org
cross join (
  values
    (
      '4741',
      '105',
      '105',
      'AGL 18MM BLANCO',
      445,
      'board',
      2750,
      1830,
      18,
      false,
      'https://optionline-prod-files.s3.amazonaws.com/6-445-thumbnail.jpg'
    ),
    (
      '5204',
      '93',
      '93',
      'AGL 15MM ABEDUL',
      446,
      'board',
      2750,
      1830,
      15,
      true,
      'https://optionline-prod-files.s3.amazonaws.com/6-446-thumbnail.jpg'
    ),
    (
      '115633',
      '902',
      '902',
      'BIANCO BRILLATO 2.75*1.22 MM',
      10226,
      'board',
      2750,
      1220,
      18,
      false,
      'https://optionline-prod-files.s3.amazonaws.com/6-10226-thumbnail.jpg'
    )
) as seed (
  external_id,
  code,
  code_ext,
  description,
  texture_id,
  type,
  width,
  height,
  thickness,
  has_grain,
  image_url
)
on conflict (organization_id, external_id) do update set
  code = excluded.code,
  code_ext = excluded.code_ext,
  description = excluded.description,
  texture_id = excluded.texture_id,
  type = excluded.type,
  width = excluded.width,
  height = excluded.height,
  thickness = excluded.thickness,
  has_grain = excluded.has_grain,
  enabled = excluded.enabled,
  image_url = excluded.image_url,
  updated_at = now();

insert into public.board_formats (
  organization_id,
  material_id,
  label,
  width,
  height,
  thickness,
  enabled,
  metadata
)
select
  materials.organization_id,
  materials.id,
  materials.width || ' x ' || materials.height || ' x ' || materials.thickness || ' mm',
  materials.width,
  materials.height,
  materials.thickness,
  materials.enabled,
  jsonb_build_object('source', 'supabase/seed.sql')
from public.materials
join public.organizations on organizations.id = materials.organization_id
where organizations.slug = 'demo-corte'
  and materials.external_id in ('4741', '5204', '115633')
on conflict (material_id, width, height, thickness) do update set
  label = excluded.label,
  enabled = excluded.enabled,
  updated_at = now();

with demo_context as (
  select
    organizations.id as organization_id,
    organization_members.user_id as owner_id,
    materials.id as material_id,
    materials.width,
    materials.height,
    materials.thickness,
    materials.has_grain
  from public.organizations
  join public.organization_members
    on organization_members.organization_id = organizations.id
   and organization_members.active = true
   and organization_members.role = 'admin'
  join public.materials
    on materials.organization_id = organizations.id
   and materials.external_id = '4741'
  where organizations.slug = 'demo-corte'
  order by organization_members.created_at
  limit 1
)
insert into public.projects (
  id,
  organization_id,
  owner_id,
  name,
  description,
  status,
  material_id,
  board_width,
  board_height,
  board_thickness,
  kerf,
  trim_x,
  trim_y,
  min_remnant,
  grain_enabled
)
select
  '10000000-0000-4000-8000-000000000001'::uuid,
  organization_id,
  owner_id,
  'Proyecto demo cocina',
  'Proyecto de demostracion para validar carga de piezas.',
  'draft'::public.project_status,
  material_id,
  width,
  height,
  thickness,
  4.5,
  0,
  0,
  250,
  has_grain
from demo_context
on conflict (id) do nothing;

insert into public.project_items (
  id,
  project_id,
  reference,
  description,
  quantity,
  width,
  height,
  grain,
  can_rotate,
  edge_top,
  edge_bottom,
  edge_left,
  edge_right,
  sort_order
)
select
  seed.id,
  seed.project_id,
  seed.reference,
  seed.description,
  seed.quantity,
  seed.width,
  seed.height,
  seed.grain,
  seed.can_rotate,
  seed.edge_top,
  seed.edge_bottom,
  seed.edge_left,
  seed.edge_right,
  seed.sort_order
from (
  values
    (
      '10000000-0000-4000-8000-000000000101'::uuid,
      '10000000-0000-4000-8000-000000000001'::uuid,
      'LATERAL',
      'Laterales modulo bajo',
      2,
      720,
      560,
      false,
      true,
      true,
      false,
      true,
      false,
      10
    ),
    (
      '10000000-0000-4000-8000-000000000102'::uuid,
      '10000000-0000-4000-8000-000000000001'::uuid,
      'ESTANTE',
      'Estantes interiores',
      3,
      560,
      300,
      false,
      true,
      true,
      true,
      false,
      false,
      20
    )
) as seed (
  id,
  project_id,
  reference,
  description,
  quantity,
  width,
  height,
  grain,
  can_rotate,
  edge_top,
  edge_bottom,
  edge_left,
  edge_right,
  sort_order
)
join public.projects on projects.id = seed.project_id
on conflict (id) do nothing;

-- Example after creating users in Supabase Auth:
--
-- insert into public.organization_members (organization_id, user_id, role)
-- select organizations.id, '<auth-user-id>'::uuid, 'admin'::public.organization_role
-- from public.organizations
-- where organizations.slug = 'demo-corte'
-- on conflict (organization_id, user_id) do update
-- set role = excluded.role,
--     active = true;
