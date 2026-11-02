-- Existing catalog entries default to services.
alter table public.productos
  add column if not exists item_type text not null default 'service'
  check (item_type in ('service', 'product'));
