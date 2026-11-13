import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { api, localStatus, localDatabase, root } from "./mobile-local.mjs";

test("Supabase local real: Auth, Edge PIN, bcrypt, RLS y concurrencia", async (t) => {
  const status = await localStatus(); // Fail closed; never read frontend/.env.
  const accounts = JSON.parse(
    await readFile(resolve(root, "local/state.local/accounts.json"), "utf8"),
  );
  const [owner, foreign, cashier] = accounts;
  const db = await localDatabase(status);
  t.after(() => db.end());
  const sessions = [];
  for (const account of [owner, foreign, cashier]) {
    const login = await api(status, "/auth/v1/token?grant_type=password", {
      body: { email: account.email, password: account.password },
    });
    assert.equal(login.status, 200, "Inicio de sesión local");
    sessions.push(login.data.access_token);
  }
  t.after(async () => {
    for (const token of sessions)
      await api(status, "/auth/v1/logout?scope=local", { token });
  });
  const rpc = (
    action,
    payload = {},
    token = sessions[0],
    business = owner.businessId,
  ) =>
    api(status, "/rest/v1/rpc/klooyd_mobile", {
      token,
      body: { p_action: action, p_negocio: business, p_payload: payload },
    });
  const setPin = (password, token = sessions[0]) =>
    api(status, "/functions/v1/mobile-pin", {
      token,
      body: { businessId: owner.businessId, password, pin: "123456" },
    });
  await t.test("Propietario aislado y empleado sin acceso móvil", async () => {
    const context = await rpc("context");
    assert.equal(context.status, 200);
    assert.deepEqual(
      context.data.businesses.map((x) => x.id),
      [owner.businessId],
    );
    assert.equal((await rpc("inventory", {}, sessions[1])).ok, false);
    assert.equal((await rpc("inventory", {}, sessions[2])).ok, false);
    assert.equal((await rpc("inventory", {}, status.ANON_KEY)).ok, false);
  });
  await t.test(
    "Edge verifica la contraseña actual antes de guardar bcrypt",
    async () => {
      assert.equal((await setPin("password-incorrecta")).status, 403);
      const result = await setPin(owner.password);
      assert.equal(
        result.status,
        200,
        "Ejecuta npm run local:functions antes de esta prueba",
      );
      assert.equal(result.data.ok, true);
      const hash = (
        await db.query(
          "select hash from mobile_private.pins where user_id=$1",
          [owner.userId],
        )
      ).rows[0].hash;
      assert.match(hash, /^\$2[aby]\$12\$/);
      const checked = await db.query(
        "select extensions.crypt('123456',$1)=$1 as correct,extensions.crypt('000000',$1)=$1 as incorrect",
        [hash],
      );
      assert.deepEqual(checked.rows[0], { correct: true, incorrect: false });
    },
  );
  const deviceId = randomUUID();
  let grant;
  await t.test(
    "PIN autoriza únicamente el dispositivo verificado",
    async () => {
      const wrong = await rpc("pin_verify", { deviceId, pin: "000000" });
      assert.equal(wrong.data.ok, false);
      const valid = await rpc("pin_verify", { deviceId, pin: "123456" });
      assert.equal(valid.data.ok, true);
      grant = valid.data.token;
      assert.ok(grant);
    },
  );
  let productId;
  await t.test(
    "Dos conexiones compiten: un ajuste, un rechazo y reintento idempotente",
    async () => {
      productId = randomUUID();
      await db.query(
        `insert into public.productos(id,negocio_id,name,item_type,price,stock_quantity) values($1,$2,'Concurrencia local','product',100,5)`,
        [productId, owner.businessId],
      );
      const payload = {
        id: productId,
        delta: -1,
        reason: "Prueba concurrente local",
        expectedStock: 5,
        deviceId,
        token: grant,
      };
      // Hold the product lock so both independent PostgREST requests overlap.
      await db.query("begin");
      await db.query("select id from public.productos where id=$1 for update", [
        productId,
      ]);
      const a = { ...payload, idempotencyKey: randomUUID() },
        b = { ...payload, idempotencyKey: randomUUID() };
      const pending = Promise.all([rpc("adjust", a), rpc("adjust", b)]);
      await new Promise((resolve) => setTimeout(resolve, 250));
      await db.query("commit");
      const results = await pending;
      assert.equal(results.filter((x) => x.ok).length, 1);
      const winningPayload = results[0].ok ? a : b;
      assert.equal((await rpc("adjust", winningPayload)).ok, true);
      assert.equal(
        Number(
          (
            await db.query(
              "select stock_quantity from public.productos where id=$1",
              [productId],
            )
          ).rows[0].stock_quantity,
        ),
        4,
      );
      assert.equal(
        Number(
          (
            await db.query(
              "select count(*) from mobile_private.inventory_movements where producto_id=$1",
              [productId],
            )
          ).rows[0].count,
        ),
        1,
      );
      assert.equal(
        (
          await rpc("adjust", {
            ...payload,
            expectedStock: 4,
            idempotencyKey: randomUUID(),
            deviceId: randomUUID(),
          })
        ).ok,
        false,
      );
      await db.query("delete from public.productos where id=$1", [productId]);
      // Audit deliberately remains after product deletion.
    },
  );
  await t.test("Dispatcher rechaza invocación sin secreto", async () => {
    assert.equal(
      (
        await api(status, "/functions/v1/mobile-push", {
          token: sessions[0],
          body: {},
        })
      ).status,
      401,
    );
  });
  await rpc("logout_device", { deviceId });
});
