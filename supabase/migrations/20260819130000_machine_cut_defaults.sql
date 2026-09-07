-- Parametros de corte que se copian al proyecto al momento de crearlo.
alter table public.projects add column if not exists min_cut_size numeric(10, 2) not null default 50 check (min_cut_size >= 0);
comment on column public.projects.min_cut_size is 'Tamano minimo de corte copiado desde el perfil de maquina al crear el proyecto';

create or replace function public.bump_project_version()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();

  if new.version is distinct from old.version then
    new.version = old.version + 1;
    return new;
  end if;

  if new.name is distinct from old.name
    or new.description is distinct from old.description
    or new.material_id is distinct from old.material_id
    or new.board_width is distinct from old.board_width
    or new.board_height is distinct from old.board_height
    or new.board_thickness is distinct from old.board_thickness
    or new.kerf is distinct from old.kerf
    or new.trim_x is distinct from old.trim_x
    or new.trim_y is distinct from old.trim_y
    or new.min_remnant is distinct from old.min_remnant
    or new.min_cut_size is distinct from old.min_cut_size
    or new.grain_enabled is distinct from old.grain_enabled
  then
    new.version = old.version + 1;
    return new;
  end if;

  new.version = old.version;
  return new;
end;
$$;
