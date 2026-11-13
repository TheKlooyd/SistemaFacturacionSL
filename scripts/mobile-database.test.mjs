import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const migration = await readFile(
  "supabase/migrations/20261113184528_klooyd_mobile_owner_workspace.sql",
  "utf8",
);
const a = "10000000-0000-4000-8000-000000000001",
  b = "10000000-0000-4000-8000-000000000002",
  staff = "10000000-0000-4000-8000-000000000003";
const product = "20000000-0000-4000-8000-000000000001",
  service = "20000000-0000-4000-8000-000000000002",
  foreign = "20000000-0000-4000-8000-000000000003";
const sid = "30000000-0000-4000-8000-000000000001",
  device = "40000000-0000-4000-8000-000000000001";

test("mobile: PostgreSQL, propietarios, aislamiento, PIN, ajustes auditados y eventos", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role authenticated; create role anon; create role service_role;
    create schema auth; create schema extensions;
    create table auth.users(id uuid primary key);
    create table auth.sessions(id uuid primary key,user_id uuid references auth.users);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('session_id',current_setting('request.jwt.claim.session_id',true))$$;
    grant usage on schema auth to authenticated,anon,service_role;
    -- PGlite has no pgcrypto. These TEST-ONLY shims exercise state/authorization,
    -- not bcrypt or randomness. Production uses the installed pgcrypto extension.
    create function extensions.gen_salt(text,integer) returns text language sql as $$select 'test-only-salt'::text$$;
    create function extensions.crypt(text,text) returns text language sql as $$select 'test-only:'||encode(sha256(convert_to($1,'UTF8')),'hex')$$;
    create function extensions.digest(text,text) returns bytea language sql as $$select sha256(convert_to($1,'UTF8'))$$;
    create function extensions.gen_random_bytes(integer) returns bytea language sql as $$select decode(replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''),'hex')$$;
    create table public.negocios(id uuid primary key,nombre text,estado text);
    create table public.negocio_usuarios(user_id uuid,negocio_id uuid,is_active boolean,rol text);
    create table public.suscripciones(negocio_id uuid,estado text,starts_at timestamptz,ends_at timestamptz);
    create table public.negocio_configuracion(negocio_id uuid,nombre_comercial text,timezone text,moneda text);
    create table public.categorias(id uuid primary key,negocio_id uuid,name text);
    create table public.productos(id uuid primary key,negocio_id uuid,name text,item_type text,stock_quantity numeric(12,2) check(stock_quantity>=0),category_id uuid);
    create table public.pagos(id uuid primary key,negocio_id uuid,created_at timestamptz,subtotal numeric,discount_amount numeric,tip_amount numeric,total_with_tip numeric,paid_amount numeric,method text,payment_splits jsonb,items jsonb,table_id text);
    create table public.cierres_diarios(id uuid primary key default gen_random_uuid(),negocio_id uuid,date_iso text,created_at timestamptz default now(),data jsonb,unique(negocio_id,date_iso));
    insert into auth.users values('${a}'),('${b}'),('${staff}');
    insert into auth.sessions values('${sid}','${a}');
    insert into negocios values('${a}','Negocio A','activo'),('${b}','Negocio B','activo');
    insert into negocio_usuarios values('${a}','${a}',true,'propietario'),('${b}','${b}',true,'propietario'),('${staff}','${a}',true,'cajero');
    insert into suscripciones values('${a}','activa',null,null),('${b}','activa',null,null);
    insert into negocio_configuracion values('${a}','Negocio A','America/Bogota','COP'),('${b}','Negocio B','America/Bogota','COP');
    insert into productos values('${product}','${a}','Aceite','product',5,null),('${service}','${a}','Servicio','service',0,null),('${foreign}','${b}','Producto B','product',8,null);
    insert into pagos values('50000000-0000-4000-8000-000000000001','${a}','2026-05-26T00:28:21Z',100,10,5,95,100,'EFECTIVO','[{"method":"EFECTIVO","amount":100}]','[]','mesa1');
    insert into pagos select '50000000-0000-4000-8000-000000000002',negocio_id,created_at+interval '5 seconds',subtotal,discount_amount,tip_amount,total_with_tip,paid_amount,method,payment_splits,items,table_id from pagos;
    insert into pagos values('50000000-0000-4000-8000-000000000003','${b}','2026-05-26T00:28:21Z',999,0,0,999,999,'EFECTIVO',null,'[]','mesa1');
  `);
  await db.exec(migration);
  const asUser = async (id, role = "authenticated") => {
    await db.exec("reset role");
    await db.query(
      "select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.session_id',$2,false)",
      [id, sid],
    );
    await db.exec(`set role ${role}`);
  };
  const api = async (action, tenant = a, payload = {}) =>
    (
      await db.query("select public.klooyd_mobile($1,$2,$3) as result", [
        action,
        tenant,
        JSON.stringify(payload),
      ])
    ).rows[0].result;
  await asUser(a);
  await t.test(
    "contexto y agregación no descargan pagos; zona local, ceros y duplicados incluidos",
    async () => {
      const context = await api("context");
      assert.deepEqual(
        context.businesses.map((x) => x.id),
        [a],
      );
      const dashboard = await api("dashboard", a, { month: "2026-05-01" });
      assert.equal(dashboard.days.length, 31);
      assert.equal(Number(dashboard.historical), 180);
      assert.equal(
        Number(dashboard.days.find((x) => x.date === "2026-05-25").sales),
        180,
      );
      assert.equal(
        dashboard.days.find((x) => x.date === "2026-05-26").tickets,
        0,
      );
      assert.equal(dashboard.suspectedDuplicates, 1);
      assert.equal((await api("inventory")).length, 1);
    },
  );
  await t.test(
    "otro negocio, cajero, anónimo e inactivo no acceden a la API móvil",
    async () => {
      await assert.rejects(api("inventory", b), /no autorizado/);
      await assert.rejects(api("product", a, { id: foreign }), /no disponible/);
      await assert.rejects(
        db.query("select * from mobile_private.pins"),
        /permission denied/,
      );
      await assert.rejects(
        db.query("select public.klooyd_mobile_pin_set($1,$2,$3)", [
          a,
          a,
          "123456",
        ]),
        /permission denied/,
      );
      await asUser(staff);
      assert.deepEqual((await api("context")).businesses, []);
      await assert.rejects(api("inventory"), /no autorizado/);
      await asUser("", "anon");
      await assert.rejects(api("context"), /permission denied/);
      await asUser(a);
      await db.exec(
        `reset role;update negocio_usuarios set is_active=false where user_id='${a}';set role authenticated`,
      );
      await assert.rejects(api("inventory"), /no autorizado/);
      await db.exec(
        `reset role;update negocio_usuarios set is_active=true where user_id='${a}';set role authenticated`,
      );
    },
  );
  await asUser(a, "service_role");
  await db.query("select public.klooyd_mobile_pin_set($1,$2,$3)", [
    a,
    a,
    "123456",
  ]);
  await asUser(a);
  await t.test(
    "fallos PIN se conservan y bloquean después del quinto intento",
    async () => {
      for (let i = 0; i < 5; i++)
        assert.equal(
          (await api("pin_verify", a, { pin: "000000", deviceId: device })).ok,
          false,
        );
      assert.match(
        (await api("pin_verify", a, { pin: "123456", deviceId: device })).error,
        /bloqueado/,
      );
      await db.exec(
        `reset role;update mobile_private.pins set locked_until=now()-interval '1 minute' where user_id='${a}';set role authenticated`,
      );
    },
  );
  let token;
  const payload = {
    id: product,
    delta: -3,
    expectedStock: 5,
    reason: "Merma",
    deviceId: device,
    idempotencyKey: "60000000-0000-4000-8000-000000000001",
  };
  await t.test(
    "PIN requerido, dispositivo ligado, ajuste atómico, reintentos y servicios",
    async () => {
      await assert.rejects(
        api("adjust", a, { ...payload, token: "invalid" }),
        /PIN/,
      );
      token = (await api("pin_verify", a, { pin: "123456", deviceId: device }))
        .token;
      assert.ok(token);
      await assert.rejects(
        api("adjust", a, { ...payload, token, deviceId: b }),
        /PIN/,
      );
      const first = await api("adjust", a, { ...payload, token });
      const again = await api("adjust", a, { ...payload, token });
      assert.equal(first.id, again.id);
      assert.equal(Number(first.stock_nuevo), 2);
      await assert.rejects(
        api("adjust", a, { ...payload, token, delta: 1 }),
        /otro ajuste/,
      );
      await assert.rejects(
        api("adjust", a, {
          ...payload,
          token,
          id: service,
          idempotencyKey: crypto.randomUUID(),
        }),
        /no disponible/,
      );
      await assert.rejects(
        api("adjust", a, {
          ...payload,
          token,
          expectedStock: 2,
          idempotencyKey: crypto.randomUUID(),
        }),
        /negativo/,
      );
      await assert.rejects(
        api("adjust", a, {
          ...payload,
          token,
          delta: 1,
          idempotencyKey: crypto.randomUUID(),
        }),
        /stock cambió/,
      );
      assert.equal(Number((await api("product", a, { id: product })).stock), 2);
      assert.equal((await api("notifications")).length, 1);
    },
  );
  await t.test(
    "alerta: 2→1 no repite; 1→4→2 rearma y genera una nueva",
    async () => {
      let stock = 2;
      for (const delta of [-1, 3, -2]) {
        await api("adjust", a, {
          ...payload,
          token,
          delta,
          expectedStock: stock,
          idempotencyKey: crypto.randomUUID(),
        });
        stock += delta;
      }
      assert.equal((await api("notifications")).length, 2);
      const p = await api("product", a, { id: product });
      assert.equal(p.movements.length, 4);
      assert.equal(Number(p.stock), 2);
      await asUser(b);
      assert.equal((await api("notifications", b)).length, 0);
      await asUser(a);
    },
  );
  await t.test(
    "PIN caducado por inactividad y logout no permite otra escritura",
    async () => {
      await db.exec(
        `reset role;update mobile_private.admin_sessions set last_used_at=now()-interval '3 minutes';set role authenticated`,
      );
      await assert.rejects(
        api("adjust", a, {
          ...payload,
          token,
          delta: 1,
          expectedStock: 2,
          idempotencyKey: crypto.randomUUID(),
        }),
        /PIN/,
      );
      token = (await api("pin_verify", a, { pin: "123456", deviceId: device }))
        .token;
      await db.exec(
        `reset role;delete from auth.sessions where id='${sid}';set role authenticated`,
      );
      await assert.rejects(
        api("adjust", a, {
          ...payload,
          token,
          delta: 1,
          expectedStock: 2,
          idempotencyKey: crypto.randomUUID(),
        }),
        /sesión/,
      );
      await db.exec(
        `reset role;insert into auth.sessions values('${sid}','${a}');set role authenticated`,
      );
    },
  );
  await t.test(
    "cierre: una notificación por propietario aunque se guarde otra vez",
    async () => {
      await db.exec(
        `reset role;insert into cierres_diarios(negocio_id,date_iso,data) values('${a}','2026-05-25','{"summary":{"total":190,"tip":10,"tickets":2},"payments":[],"breakdown":[]}');update cierres_diarios set data=data;set role authenticated`,
      );
      assert.equal(
        (await api("notifications")).filter((x) => x.kind === "close").length,
        1,
      );
      const notification = (await api("notifications")).find(
        (x) => x.kind === "close",
      );
      await api("mark_read", a, { id: notification.id });
      assert.ok(
        (await api("notifications")).find((x) => x.id === notification.id)
          .read_at,
      );
      await assert.rejects(
        api("close", b, { id: notification.id }),
        /no autorizado/,
      );
    },
  );
  await t.test(
    "suscripción tenant/device, límites de destinos y cola con lease",
    async () => {
      await assert.rejects(
        api("subscribe", a, {
          subscription: { endpoint: "https://localhost/internal" },
          deviceId: device,
        }),
        /Proveedor/,
      );
      const subscription = {
        endpoint: "https://fcm.googleapis.com/fcm/send/test",
        keys: { p256dh: "x".repeat(87), auth: "x".repeat(22) },
      };
      await api("subscribe", a, { subscription, deviceId: device });
      await api("subscribe", a, { subscription, deviceId: device });
      assert.equal((await api("settings")).devices.length, 1);
      await db.exec(
        `reset role;update productos set stock_quantity=4 where id='${product}';update productos set stock_quantity=0 where id='${product}';set role authenticated`,
      );
      await assert.rejects(
        db.query("select public.klooyd_mobile_push_claim()"),
        /permission denied/,
      );
      await asUser(a, "service_role");
      const jobs = (
        await db.query("select public.klooyd_mobile_push_claim() result")
      ).rows[0].result;
      assert.equal(jobs.length, 1);
      assert.equal(
        (await db.query("select public.klooyd_mobile_push_claim() result"))
          .rows[0].result.length,
        0,
      );
      await db.query("select public.klooyd_mobile_push_finish($1,$2,$3,$4)", [
        jobs[0].id,
        jobs[0].leaseId,
        "accepted",
        false,
      ]);
      await db.exec("reset role");
      assert.equal(
        (await db.query("select status from mobile_private.push_deliveries"))
          .rows[0].status,
        "accepted",
      );
      await asUser(a);
    },
  );
  await t.test(
    "regresión POS: un cajero sigue cobrando productos y servicios con auditoría",
    async () => {
      await db.exec(`reset role;
      alter table pagos add column table_name text,add column is_delivery boolean,add column delivery_client jsonb;
      create table ordenes(id uuid primary key,negocio_id uuid,table_id text,status text,items jsonb);
      grant select on negocio_usuarios to authenticated;
      grant select,insert,update,delete on productos,pagos,ordenes to authenticated;
      update productos set stock_quantity=5 where id='${product}';
      insert into ordenes values(gen_random_uuid(),'${a}','mesa-pos','OPEN','[]');
    `);
      await db.exec(
        await readFile(
          "supabase/migrations/20261101213245_inventory_products_and_atomic_payment.sql",
          "utf8",
        ),
      );
      await asUser(staff);
      const payment = {
        id: crypto.randomUUID(),
        negocio_id: a,
        table_id: "mesa-pos",
        subtotal: 100,
        total_with_tip: 100,
        tip_amount: 0,
        paid_amount: 100,
        items: [
          { product_id: product, qty: 1 },
          { product_id: service, qty: 1 },
        ],
      };
      await db.query("select public.complete_table_payment($1)", [
        JSON.stringify(payment),
      ]);
      await db.exec("reset role");
      assert.equal(
        Number(
          (
            await db.query("select stock_quantity from productos where id=$1", [
              product,
            ])
          ).rows[0].stock_quantity,
        ),
        4,
      );
      assert.equal(
        Number(
          (
            await db.query("select stock_quantity from productos where id=$1", [
              service,
            ])
          ).rows[0].stock_quantity,
        ),
        0,
      );
      assert.equal(
        (await db.query("select count(*)::int n from ordenes")).rows[0].n,
        0,
      );
      assert.equal(
        (
          await db.query(
            "select count(*)::int n from mobile_private.inventory_movements where actor_user_id=$1",
            [staff],
          )
        ).rows[0].n,
        1,
      );
      await asUser(a);
    },
  );
  await t.test(
    "dos solicitudes de ajuste sobre el mismo saldo no pisan existencias",
    async () => {
      const verified = await api("pin_verify", a, {
        pin: "123456",
        deviceId: device,
      });
      const attempt = {
        id: product,
        delta: -1,
        expectedStock: 4,
        reason: "Corrección concurrente",
        deviceId: device,
        token: verified.token,
      };
      // PGlite serializes its connection. This proves stale-write rejection and
      // idempotency under queued callers, not lock contention between native PG sessions.
      const results = await Promise.allSettled([
        api("adjust", a, { ...attempt, idempotencyKey: crypto.randomUUID() }),
        api("adjust", a, { ...attempt, idempotencyKey: crypto.randomUUID() }),
      ]);
      assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
      assert.equal(Number((await api("product", a, { id: product })).stock), 3);
      const key = crypto.randomUUID();
      const repeated = {
        ...attempt,
        delta: 1,
        expectedStock: 3,
        idempotencyKey: key,
      };
      const [first, second] = await Promise.all([
        api("adjust", a, repeated),
        api("adjust", a, repeated),
      ]);
      assert.equal(first.id, second.id);
      assert.equal(Number((await api("product", a, { id: product })).stock), 4);
    },
  );
});
