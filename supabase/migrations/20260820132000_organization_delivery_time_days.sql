alter table public.organizations
  add column if not exists delivery_time_days integer not null default 7;

alter table public.organizations
  drop constraint if exists organizations_delivery_time_days_range;

alter table public.organizations
  add constraint organizations_delivery_time_days_range
    check (delivery_time_days between 1 and 365);

comment on column public.organizations.delivery_time_days is
  'Demora maxima esperada, en dias enteros, para que un pedido pase a finalizado.';
