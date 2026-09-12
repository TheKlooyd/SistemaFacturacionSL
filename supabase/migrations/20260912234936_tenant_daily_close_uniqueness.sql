-- PENDING CUTOVER: apply only after the tenant-aware frontend is deployed.
-- The old main uses onConflict: date_iso and cannot run after this migration.
-- Preserves all rows and the existing tenant RLS policies.
set lock_timeout = '5s';

-- Ensure the per-business conflict target exists before removing the old one.
create unique index if not exists cierres_diarios_negocio_date_iso_key
  on public.cierres_diarios (negocio_id, date_iso);

drop index if exists public.cierres_diarios_date_iso_legacy_key;
