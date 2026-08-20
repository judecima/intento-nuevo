-- Permite distinguir los dos tipos de canto del proceso: fino 0,45 mm y
-- grueso 2 mm, o ambos. La cantidad de lados sigue derivandose de edge_*.

alter table public.project_items
  add column if not exists edge_type text not null default 'none'
  check (edge_type in ('none', 'thin', 'thick'));

comment on column public.project_items.edge_type is
  'Tipo de tapacanto: thin = 0,45 mm, thick = 2 mm, both = ambos tipos, none = sin canto.';
