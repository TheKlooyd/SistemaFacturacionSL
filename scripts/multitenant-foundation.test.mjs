import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const root = new URL('../', import.meta.url);
const read = (name) => readFile(new URL(name, root), 'utf8');
const users = {
  ownerA: '10000000-0000-4000-8000-000000000001',
  ownerB: '10000000-0000-4000-8000-000000000002',
  cashierA: '10000000-0000-4000-8000-000000000003',
  unassigned: '10000000-0000-4000-8000-000000000004',
};
const coreTables = ['mesas', 'categorias', 'productos', 'clientes', 'ordenes', 'pagos', 'cierres_diarios'];

test('fundación multinegocio: PostgreSQL aislado, sin conexión a producción', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  // Dobles mínimos de Supabase Auth. RLS y GRANT son ejecutados por PostgreSQL.
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    grant usage on schema auth, public to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  `);
  // Reproduce la base documentada y sus migraciones previas, incluida la reparación QR.
  await db.exec(await read('supabase_schema.sql'));
  await db.exec(await read('supabase/migrations/202608310001_qr_ordering.sql'));
  await db.exec(await read('supabase/migrations/202609020002_qr_session_lifecycle.sql'));
  await db.exec(`
    alter table public.productos add column size text;
    update public.mesas set is_active = true;
    insert into public.productos (name, price, size) values ('Producto existente', 5000, 'Personal');
    insert into public.clientes (name) values ('Cliente de prueba');
    insert into public.pagos (total_with_tip) values (5000);
    insert into public.cierres_diarios (date_iso, data) values ('2026-09-12', '{}');
    insert into public.mesa_qr_codes(mesa_id, mesa_number, token_hash, is_active)
      values (1, 1, repeat('a',64), true);
  `);
  const snapshot = async () => {
    const result = {};
    for (const table of [...coreTables, 'mesa_qr_codes', 'qr_sessions', 'qr_orders']) {
      result[table] = (await db.query(`select to_jsonb(t) as row from public.${table} t order by id`)).rows;
    }
    result.policies = (await db.query(`select * from pg_policies where schemaname='public' order by tablename, policyname`)).rows;
    return result;
  };
  const before = await snapshot();
  const migrations = await readdir(new URL('supabase/migrations/', root));
  const foundation = migrations.filter((name) => name.endsWith('_multitenant_foundation.sql'));
  assert.equal(foundation.length, 1);
  await db.exec(await read(`supabase/migrations/${foundation[0]}`));

  await t.test('conserva datos, QR, columna size y políticas operativas', async () => {
    const after = await snapshot();
    after.policies = after.policies.filter((p) => coreTables.includes(p.tablename));
    assert.deepEqual(after, before);
    assert.equal((await db.query('select count(*)::int n from public.mesas where is_active')).rows[0].n, 12);
  });
  await t.test('registra Sabor Latino sin crear usuarios ni otorgar privilegios', async () => {
    assert.equal((await db.query('select slug from public.negocios')).rows[0].slug, 'sabor-latino');
    for (const table of ['auth.users', 'public.negocio_usuarios', 'public.suscripciones', 'sl_private.platform_admins']) {
      assert.equal((await db.query(`select count(*)::int n from ${table}`)).rows[0].n, 0);
    }
  });

  for (const id of Object.values(users)) await db.query('insert into auth.users(id) values ($1)', [id]);
  const a = (await db.query("select id from public.negocios where slug='sabor-latino'")).rows[0].id;
  const b = (await db.query("insert into public.negocios(slug,nombre) values ('don-juan','Don Juan') returning id")).rows[0].id;
  await db.query('insert into public.negocio_configuracion(negocio_id,nombre_comercial) values ($1,$2)', [b, 'Don Juan']);
  for (const [business, user, role] of [[a, users.ownerA, 'propietario'], [b, users.ownerB, 'propietario'], [a, users.cashierA, 'cajero']]) {
    await db.query('insert into public.negocio_usuarios(negocio_id,user_id,rol) values ($1,$2,$3)', [business, user, role]);
  }
  for (const business of [a,b]) await db.query('insert into public.suscripciones(negocio_id) values ($1)', [business]);

  async function asRole(role, uid, callback) {
    assert.ok(['anon', 'authenticated', 'service_role'].includes(role));
    await db.exec('begin');
    try {
      await db.exec(`set local role ${role}`);
      await db.query("select set_config('request.jwt.claim.sub', $1, true)", [uid || '']);
      await callback();
    } finally {
      await db.exec('rollback');
    }
  }
  const denied = (fn) => assert.rejects(fn, (error) => error.code === '42501');

  await t.test('cada propietario ve solo su negocio, configuración y suscripción', async () => {
    for (const [user,business] of [[users.ownerA,a], [users.ownerB,b]]) {
      await asRole('authenticated', user, async () => {
        assert.deepEqual((await db.query('select id from public.negocios')).rows, [{id:business}]);
        for (const table of ['negocio_configuracion','suscripciones','negocio_usuarios']) {
          assert.deepEqual((await db.query(`select negocio_id from public.${table}`)).rows, [{negocio_id:business}]);
        }
      });
    }
  });
  await t.test('un usuario sin membresía no ve metadatos de restaurantes', async () => {
    await asRole('authenticated', users.unassigned, async () => {
      for (const table of ['negocios','negocio_configuracion','suscripciones','negocio_usuarios']) {
        assert.deepEqual((await db.query(`select * from public.${table}`)).rows, []);
      }
    });
  });
  await t.test('cajero ve configuración pero no información de suscripción', async () => {
    await asRole('authenticated', users.cashierA, async () => {
      assert.equal((await db.query('select * from public.negocio_configuracion')).rows.length, 1);
      assert.deepEqual((await db.query('select * from public.suscripciones')).rows, []);
    });
  });
  await t.test('las credenciales del navegador no pueden leer como anon ni escribir', async () => {
    for (const table of ['negocios','negocio_configuracion','suscripciones','negocio_usuarios']) {
      await asRole('anon', null, () => denied(() => db.query(`select * from public.${table}`)));
      await asRole('authenticated', users.ownerA, () => denied(() => db.query(`delete from public.${table}`)));
      await asRole('authenticated', users.ownerA, () => denied(() => db.query(`insert into public.${table} default values`)));
    }
    await asRole('authenticated', users.ownerA, () => denied(() => db.query("update public.negocio_usuarios set rol='administrador'")));
    await asRole('authenticated', users.ownerA, () => denied(() => db.query("update public.suscripciones set estado='activa', starts_at=now()")));
    await asRole('authenticated', users.ownerA, () => denied(() => db.query('select * from sl_private.platform_admins')));
  });
  await t.test('RLS sigue impidiendo altas aunque se concediera INSERT por accidente', async () => {
    await db.exec('grant insert on public.negocio_usuarios to authenticated');
    try {
      await asRole('authenticated', users.ownerA, () => denied(() => db.query(
        "insert into public.negocio_usuarios(negocio_id,user_id,rol) values ($1,$2,'propietario')", [b,users.ownerA]
      )));
    } finally {
      await db.exec('revoke insert on public.negocio_usuarios from authenticated');
    }
  });
  await t.test('desactivar membresía retira la lectura sin renovar el JWT', async () => {
    await db.query('update public.negocio_usuarios set is_active=false where user_id=$1', [users.ownerA]);
    await asRole('authenticated', users.ownerA, async () => {
      assert.deepEqual((await db.query('select * from public.negocios')).rows, []);
      assert.deepEqual((await db.query('select * from public.suscripciones')).rows, []);
    });
  });
  await t.test('el backend administrativo conserva acceso explícito', async () => {
    await asRole('service_role', null, async () => {
      assert.equal((await db.query('select * from public.negocios')).rows.length, 2);
      await db.query('insert into sl_private.platform_admins(user_id) values ($1)', [users.unassigned]);
      assert.equal((await db.query('select * from sl_private.platform_admins')).rows.length, 1);
    });
  });
  await t.test('rechaza roles inválidos, membresías duplicadas y fechas incoherentes', async () => {
    await assert.rejects(() => db.query("insert into public.negocio_usuarios(negocio_id,user_id,rol) values ($1,$2,'superadmin')", [a,users.unassigned]), (e) => e.code==='23514');
    await assert.rejects(() => db.query("insert into public.negocio_usuarios(negocio_id,user_id,rol) values ($1,$2,'propietario')", [a,users.ownerA]), (e) => e.code==='23505');
    await assert.rejects(() => db.query("update public.suscripciones set starts_at='2026-09-12', ends_at='2026-09-11' where negocio_id=$1", [a]), (e) => e.code==='23514');
  });
});
