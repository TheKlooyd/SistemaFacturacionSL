import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { PGlite } from '@electric-sql/pglite';

const root = new URL('../', import.meta.url);
const files = await readdir(new URL('supabase/migrations/', root));
const migration = await readFile(new URL(`supabase/migrations/${files.find(f => f.endsWith('_tenant_daily_close_uniqueness.sql'))}`, root), 'utf8');
const hardening = await readFile(new URL('supabase/migrations/20260912201436_tenant_hardening_and_rls.sql', root), 'utf8');
const policy = hardening.match(/create policy cierres_del_negocio[\s\S]*?;/)[0];
const a = '10000000-0000-4000-8000-000000000001';
const b = '10000000-0000-4000-8000-000000000002';

test('cierres: dos negocios el mismo día, reintentos y aislamiento real con PostgreSQL/RLS', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    $$;
    grant usage on schema public, auth to authenticated;
    create table negocio_usuarios (negocio_id uuid, user_id uuid, is_active boolean);
    insert into negocio_usuarios values ('${a}','${a}',true),('${b}','${b}',true);
    create table cierres_diarios (
      id uuid primary key default gen_random_uuid(), negocio_id uuid not null,
      date_iso text not null, data jsonb not null, created_at timestamptz not null default now()
    );
    create unique index cierres_diarios_negocio_date_iso_key on cierres_diarios(negocio_id,date_iso);
    create unique index cierres_diarios_date_iso_legacy_key on cierres_diarios(date_iso);
    alter table cierres_diarios enable row level security;
    grant select on negocio_usuarios to authenticated;
    grant select,insert,update,delete on cierres_diarios to authenticated;
    ${policy}
    insert into cierres_diarios(negocio_id,date_iso,data) values ('${a}','2026-09-12','{"total":100}');
  `);
  const before = (await db.query('select * from cierres_diarios')).rows;
  await assert.rejects(db.query(`insert into cierres_diarios(negocio_id,date_iso,data) values ('${b}','2026-09-12','{}')`), e => e.code === '23505');
  await db.exec(migration);
  assert.deepEqual((await db.query('select * from cierres_diarios')).rows, before);
  const asUser = async (id) => db.exec(`reset role; select set_config('request.jwt.claim.sub','${id}',false); set role authenticated;`);
  const save = (id, total) => db.query(`insert into cierres_diarios(negocio_id,date_iso,data)
    values ($1,'2026-09-12',jsonb_build_object('total',$2::int))
    on conflict(negocio_id,date_iso) do update set data=excluded.data returning id,data`, [id,total]);
  await asUser(b);
  await save(b,200);
  await asUser(a);
  const updated = await save(a,150);
  assert.equal(updated.rows[0].id,before[0].id);
  assert.equal((await db.query('select count(*)::int n from cierres_diarios')).rows[0].n,1);
  await assert.rejects(save(b,999), e => e.code === '42501');
  assert.equal((await db.query('update cierres_diarios set data=\'{}\' where negocio_id=$1 returning id',[b])).rows.length,0);
  assert.equal((await db.query('delete from cierres_diarios where negocio_id=$1 returning id',[b])).rows.length,0);
  await asUser(b);
  assert.equal((await db.query('select data from cierres_diarios')).rows[0].data.total,200);
  await db.exec(`reset role; update negocio_usuarios set is_active=false where user_id='${b}'; set role authenticated;`);
  assert.equal((await db.query('select * from cierres_diarios')).rows.length,0);
  await assert.rejects(save(b,300), e => e.code === '42501');
  await db.exec('reset role');
  assert.equal((await db.query('select count(*)::int n from cierres_diarios')).rows[0].n,2);
  await db.exec(migration); // Repeat safely without deleting or duplicating snapshots.
  assert.equal((await db.query('select count(*)::int n from cierres_diarios')).rows[0].n,2);
});

test('el store guarda en el negocio autenticado y propaga fallos sin confirmar un cierre inexistente', async (t) => {
  const calls = [];
  let response = { data: { data: { dateISO: '2026-09-12', summary: { total: 150 } } }, error: null };
  const query = {
    upsert(payload, options) { calls.push({ payload, options }); return this; },
    select() { return this; }, eq() { return this; }, order() { return this; }, limit() { return this; },
    single() { return Promise.resolve(response); }, maybeSingle() { return Promise.resolve(response); },
    then(resolve, reject) { return Promise.resolve(response).then(resolve, reject); },
  };
  globalThis.__dailyCloseClient = { from(table) { assert.ok(['cierres_diarios','pagos'].includes(table)); return query; } };
  const hooks = registerHooks({ resolve(specifier, context, next) {
    if (context.parentURL?.endsWith('/frontend/src/paymentsStore.js')) {
      if (specifier === './supabaseClient') return { shortCircuit: true, url: 'data:text/javascript,export const supabase=globalThis.__dailyCloseClient;' };
      if (specifier === './tenantSession') return { shortCircuit: true, url: `data:text/javascript,export const requireNegocioId=()=>${JSON.stringify(a)};` };
    }
    return next(specifier, context);
  } });
  t.after(() => { hooks.deregister(); delete globalThis.__dailyCloseClient; });
  t.mock.method(console, 'error', () => {});
  const { saveDailyClose, loadDailyClose, loadPayments } = await import('../frontend/src/paymentsStore.js');
  const snapshot = { dateISO: '2026-09-12', summary: { total: 150 }, negocio_id: b };
  assert.deepEqual(await saveDailyClose(snapshot),response.data.data);
  assert.equal(calls[0].payload.negocio_id,a);
  assert.equal(calls[0].options.onConflict,'negocio_id,date_iso');
  for (const dateISO of ['', '2026-02-30', 'not-a-date']) await assert.rejects(saveDailyClose({dateISO}),/fecha válida/);
  response = { data: null, error: new Error('network failure') };
  await assert.rejects(saveDailyClose(snapshot),/network failure/);
  await assert.rejects(loadDailyClose(snapshot.dateISO),/network failure/);
  await assert.rejects(loadPayments({throwOnError:true}),/network failure/);
  response = { data: null, error: null };
  await assert.rejects(saveDailyClose(snapshot),/confirmación/);
  assert.equal(await loadDailyClose(snapshot.dateISO),null);
});
