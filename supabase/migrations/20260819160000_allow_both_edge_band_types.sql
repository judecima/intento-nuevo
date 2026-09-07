-- El proceso puede requerir canto fino, canto grueso o ambos en una misma
-- pieza/pedido.

alter table public.project_items
  drop constraint if exists project_items_edge_type_check;

alter table public.project_items
  add constraint project_items_edge_type_check
  check (edge_type in ('none', 'thin', 'thick', 'both'));
