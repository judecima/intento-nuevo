-- Tapacanto por lado.
--
-- Hasta ahora la pieza tenia un unico `edge_type` y cuatro booleanos de lado,
-- asi que no se podia pedir 2 mm en el frente y 0,45 en los costados. Ahora
-- cada lado guarda su propio tipo.
--
-- Los booleanos y `edge_type` se conservan: los escribe la aplicacion como
-- valores derivados para que los lectores viejos (resultados de optimizacion ya
-- guardados, reportes) sigan funcionando.

alter table public.project_items
  add column if not exists edge_top_type text not null default 'none',
  add column if not exists edge_bottom_type text not null default 'none',
  add column if not exists edge_left_type text not null default 'none',
  add column if not exists edge_right_type text not null default 'none';

-- Cada lado marcado hereda el tipo que tenia la pieza. Un lado marcado sin
-- tipo era, por convencion de la aplicacion, 0,45.
update public.project_items
set
  edge_top_type = case
    when edge_top then case when edge_type = 'none' then 'thin' else edge_type end
    else 'none'
  end,
  edge_bottom_type = case
    when edge_bottom then case when edge_type = 'none' then 'thin' else edge_type end
    else 'none'
  end,
  edge_left_type = case
    when edge_left then case when edge_type = 'none' then 'thin' else edge_type end
    else 'none'
  end,
  edge_right_type = case
    when edge_right then case when edge_type = 'none' then 'thin' else edge_type end
    else 'none'
  end
where edge_top or edge_bottom or edge_left or edge_right;

alter table public.project_items
  drop constraint if exists project_items_edge_top_type_check,
  drop constraint if exists project_items_edge_bottom_type_check,
  drop constraint if exists project_items_edge_left_type_check,
  drop constraint if exists project_items_edge_right_type_check;

alter table public.project_items
  add constraint project_items_edge_top_type_check
    check (edge_top_type in ('none', 'thin', 'thick', 'both')),
  add constraint project_items_edge_bottom_type_check
    check (edge_bottom_type in ('none', 'thin', 'thick', 'both')),
  add constraint project_items_edge_left_type_check
    check (edge_left_type in ('none', 'thin', 'thick', 'both')),
  add constraint project_items_edge_right_type_check
    check (edge_right_type in ('none', 'thin', 'thick', 'both'));

comment on column public.project_items.edge_top_type is
  'Tapacanto del lado superior: none, thin (0,45 mm), thick (2 mm) o both (los dos espesores).';
comment on column public.project_items.edge_bottom_type is
  'Tapacanto del lado inferior: none, thin (0,45 mm), thick (2 mm) o both (los dos espesores).';
comment on column public.project_items.edge_left_type is
  'Tapacanto del lado izquierdo: none, thin (0,45 mm), thick (2 mm) o both (los dos espesores).';
comment on column public.project_items.edge_right_type is
  'Tapacanto del lado derecho: none, thin (0,45 mm), thick (2 mm) o both (los dos espesores).';

comment on column public.project_items.edge_type is
  'Derivado: resumen del tapacanto de la pieza. La fuente de verdad son las columnas edge_*_type.';
