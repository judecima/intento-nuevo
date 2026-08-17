-- Fase 14: superusuario inicial sin membresia obligatoria de tenant.
--
-- El usuario juliodecima@gmail.com administra la plataforma completa. No debe
-- depender de una organizacion activa para ver el ABM global ni para crear
-- proyectos asignandolos a una organizacion activa desde el selector.

insert into public.platform_admins (user_id, note)
select profiles.id, 'super usuario inicial tenantless'
from public.profiles
where lower(profiles.email) = 'juliodecima@gmail.com'
on conflict (user_id) do update
set note = excluded.note;

delete from public.organization_members members
using public.profiles profiles
where members.user_id = profiles.id
  and lower(profiles.email) = 'juliodecima@gmail.com';
