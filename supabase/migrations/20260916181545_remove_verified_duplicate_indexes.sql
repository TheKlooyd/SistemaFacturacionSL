-- Keep the UNIQUE counterparts, which provide the same search keys.
-- Verified against pg_index: keys, opclasses, collation, ordering and predicates.
set local lock_timeout = '3s';
do $$
begin
  if not exists (select 1 from pg_index where indexrelid = to_regclass('public.mesas_negocio_numero_key') and indisunique and indisvalid)
    or not exists (select 1 from pg_index where indexrelid = to_regclass('public.cierres_diarios_negocio_date_iso_key') and indisunique and indisvalid)
  then
    raise exception 'Required unique indexes are missing; refusing cleanup';
  end if;
end $$;
drop index if exists public.mesas_negocio_numero_idx;
drop index if exists public.cierres_diarios_negocio_fecha_idx;
