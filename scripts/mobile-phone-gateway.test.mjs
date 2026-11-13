import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPhoneGateway } from "./mobile-phone-gateway.mjs";

for (const publicDemo of [false, true]) test(`Android ${publicDemo ? "demo pública" : "acceso privado"}: rutas administrativas bloqueadas`, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "klooyd-phone-"));
  await mkdir(join(directory, "mobile"));
  await writeFile(join(directory, "mobile/index.html"), "LOCAL");
  const accessKey = "a".repeat(64);
  const server = createPhoneGateway({
    apiUrl: "http://127.0.0.1:1",
    anonKey: "local",
    directory,
    accessKey,
    expiresAt: Date.now() + 60000,
    publicDemo,
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await unlink(join(directory, "mobile/index.html"));
    await rmdir(join(directory, "mobile"));
    await rmdir(directory);
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  if (publicDemo) {
    assert.equal((await fetch(base + "/mobile/")).status, 200);
    assert.equal((await fetch(base + "/access", {redirect:"manual"})).status, 303);
  } else {
  for (const path of [
    "/mobile/",
    "/local-api/auth/v1/token",
    "/assets/example.js",
  ])
    assert.equal((await fetch(base + path)).status, 401);
  assert.equal(
    (await fetch(base + "/access?key=wrong", { redirect: "manual" })).status,
    401,
  );
  const enter = await fetch(base + "/access?key=" + accessKey, {
    redirect: "manual",
  });
  assert.equal(enter.status, 303);
  assert.match(
    enter.headers.get("set-cookie"),
    /Secure; HttpOnly; SameSite=Lax/,
  );
  }
  const headers = publicDemo ? {} : { Cookie: "__Host-klooyd_local=" + accessKey };
  assert.equal(
    await (await fetch(base + "/mobile/inventario", { headers })).text(),
    "LOCAL",
  );
  for (const path of [
    "/local-api/auth/v1/admin/users",
    "/local-api/rest/v1/productos",
    "/local-api/functions/v1/mobile-push",
    "/local-api/rest/v1/rpc/klooyd_mobile_pin_set",
    "/admin/",
    "/local/state.local/accounts.json",
    "/mobile/%2e%2e%2f%2e%2e%2fpackage.json",
  ])
    assert.equal((await fetch(base + path, { headers })).status, 404, path);
});
