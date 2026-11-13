-- Run ONLY in Sabor Latino Database after the mobile migration, Edge Secrets,
-- Edge deployments, and the Vault secret described in KLOOYD_MOBILE_PRODUCCION.md.
-- This file contains no secret values and is not part of the local bootstrap.
begin;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

do $$
begin
  if to_regprocedure('public.klooyd_mobile_push_claim()') is null then
    raise exception 'Primero aplica la migración de Klooyd Mobile';
  end if;
  if (select count(*) from vault.decrypted_secrets
      where name='klooyd_mobile_push_dispatch_secret' and length(decrypted_secret)>=32)<>1 then
    raise exception 'Falta el secreto único de despacho en Vault';
  end if;
  if exists(select 1 from cron.job where jobname='klooyd-mobile-push') then
    raise exception 'El job ya existe; revisa su estado en lugar de duplicarlo';
  end if;
end $$;

select cron.schedule(
  'klooyd-mobile-push', '* * * * *',
  $job$
  select net.http_post(
    url := 'https://lpyivecyvtivtkbppjtr.supabase.co/functions/v1/mobile-push',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-mobile-push-key',(select decrypted_secret from vault.decrypted_secrets
        where name='klooyd_mobile_push_dispatch_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $job$
);
commit;

select jobid,jobname,schedule,active from cron.job where jobname='klooyd-mobile-push';
