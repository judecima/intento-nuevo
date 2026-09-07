-- Metros de canto calculados para cada optimizacion.
-- Se mantienen separados porque 0,45 mm y 2 mm tienen materiales y costos distintos.

alter table public.optimization_results
  add column if not exists edge_band_045_meters numeric(14, 3) not null default 0
    check (edge_band_045_meters >= 0),
  add column if not exists edge_band_2mm_meters numeric(14, 3) not null default 0
    check (edge_band_2mm_meters >= 0);

comment on column public.optimization_results.edge_band_045_meters is
  'Metros lineales de canto fino 0,45 mm requeridos por la optimizacion.';

comment on column public.optimization_results.edge_band_2mm_meters is
  'Metros lineales de canto grueso 2 mm requeridos por la optimizacion.';
