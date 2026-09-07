-- Fase 10: la version del proyecto identifica el CONTENIDO a optimizar.
--
-- Problema corregido: `bump_project_version` incrementaba la version en toda
-- actualizacion de `projects`, incluidos los cambios de estado. Al terminar una
-- optimizacion el server action marca el proyecto como `optimized`, lo que
-- subia la version y dejaba el resultado recien guardado apuntando a una
-- version anterior. Consecuencias visibles:
--   * el plano aparecia como "de una version anterior" apenas se generaba;
--   * `Enviar pedido` quedaba deshabilitado;
--   * cualquier accion enviada desde esa pantalla chocaba con
--     PROJECT_VERSION_CONFLICT y no llegaba a ejecutarse.
--
-- Ahora la version sube solo cuando cambian los datos que alteran el corte
-- (parametros del tablero o piezas). Los cambios de estado y los `updated_at`
-- no la mueven. El bump explicito que hace `touch_project_from_item` se
-- respeta para que editar, agregar o borrar piezas siga invalidando el plano.

create or replace function public.bump_project_version()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();

  -- Bump explicito: lo pide el trigger de project_items.
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
    or new.grain_enabled is distinct from old.grain_enabled
  then
    new.version = old.version + 1;
    return new;
  end if;

  new.version = old.version;
  return new;
end;
$$;

drop trigger if exists projects_bump_version on public.projects;
create trigger projects_bump_version
before update on public.projects
for each row execute function public.bump_project_version();
