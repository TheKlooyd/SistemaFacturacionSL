import test from 'node:test';
import assert from 'node:assert/strict';
import { createPendingRead } from '../frontend/src/pendingRead.js';

test('concurrent reads share work only within the same tenant; completed data is not cached', async () => {
  const read = createPendingRead();
  let calls = 0;
  const fetcher = async () => ++calls;
  const first = read('tenant-a', fetcher);
  assert.equal(read('tenant-a', fetcher), first);
  const other = read('tenant-b', fetcher);
  assert.notEqual(other, first);
  await Promise.all([first, other]);
  assert.equal(calls, 2);
  await read('tenant-a', fetcher);
  assert.equal(calls, 3);
});

test('failed requests can retry and fresh reads cannot join a pre-mutation request', async () => {
  const read = createPendingRead();
  await assert.rejects(read('a', async () => { throw new Error('offline'); }));
  assert.equal(await read('a', async () => 'recovered'), 'recovered');
  let finishOld;
  let finishNew;
  const old = read('a', () => new Promise(resolve => { finishOld = resolve; }));
  const fresh = read('a', () => new Promise(resolve => { finishNew = resolve; }), { fresh: true });
  await Promise.resolve();
  finishOld('old price');
  await old;
  assert.equal(read('a', () => { throw new Error('unexpected read'); }), fresh);
  finishNew('new price');
  assert.equal(await fresh, 'new price');
});

test('index cleanup preserves uniqueness, data, and refuses missing replacements', async t => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { readFile, readdir } = await import('node:fs/promises');
  const directory = new URL('../supabase/migrations/', import.meta.url);
  const file = (await readdir(directory)).find(f => f.endsWith('_remove_verified_duplicate_indexes.sql'));
  const sql = await readFile(new URL(file, directory), 'utf8');
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`create table mesas (negocio_id int, numero int);
    create table cierres_diarios (negocio_id int, date_iso text);
    create index mesas_negocio_numero_idx on mesas (negocio_id,numero);
    create index cierres_diarios_negocio_fecha_idx on cierres_diarios (negocio_id,date_iso);
    insert into mesas values (1,1),(2,1);`);
  await assert.rejects(db.exec(sql), /Required unique indexes/);
  await db.exec(`create unique index mesas_negocio_numero_key on mesas (negocio_id,numero);
    create unique index cierres_diarios_negocio_date_iso_key on cierres_diarios (negocio_id,date_iso);`);
  await db.exec(sql);
  await db.exec(sql);
  assert.equal((await db.query('select count(*)::int n from mesas')).rows[0].n, 2);
  assert.equal((await db.query("select to_regclass('public.mesas_negocio_numero_idx') idx")).rows[0].idx, null);
  await assert.rejects(db.exec('insert into mesas values (1,1)'), e => e.code === '23505');
  await db.exec("insert into cierres_diarios values (1,'2026-09-16'),(2,'2026-09-16')");
  await assert.rejects(db.exec("insert into cierres_diarios values (1,'2026-09-16')"), e => e.code === '23505');
});
