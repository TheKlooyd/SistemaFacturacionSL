import { chromium, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { root } from "./mobile-local.mjs";

const config = JSON.parse(
  await readFile(root + "/local/state.local/phone-access.json", "utf8"),
);
const origin = process.argv[2] || "http://127.0.0.1:5174";
if (origin !== "http://127.0.0.1:5174" && origin !== config.origin)
  throw new Error("Origen de prueba no autorizado.");
const [owner] = JSON.parse(
  await readFile(root + "/local/state.local/accounts.json", "utf8"),
);
const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const remotes = [];
  await context.route("**/*", (route) => {
    if (new URL(route.request().url()).origin === origin)
      return route.continue();
    remotes.push(new URL(route.request().url()).origin);
    return route.abort();
  });
  expect((await page.goto(origin + "/mobile/")).status()).toBe(config.publicDemo ? 200 : 401);
  if (!config.publicDemo) await page.goto(origin + "/access?key=" + config.accessKey);
  const anonymous = await page.request.post(origin + "/local-api/rest/v1/rpc/klooyd_mobile", {
    data: { p_action: "context", p_negocio: null, p_payload: {} },
  });
  expect(anonymous.status()).toBeGreaterThanOrEqual(400);
  await page.getByLabel("Correo", { exact: true }).fill(owner.email);
  await page.getByLabel("Contraseña", { exact: true }).fill(owner.password);
  await page.getByRole("button", { name: "Entrar a mi negocio" }).click();
  await expect(
    page.getByRole("heading", { name: "Ventas por día" }),
  ).toBeVisible();
  const scope = await page.evaluate(
    async () => (await navigator.serviceWorker.ready).scope,
  );
  expect(scope).toBe(origin + "/mobile/");
  for (const path of [
    "/local-api/auth/v1/admin/users",
    "/local-api/functions/v1/mobile-push",
    "/admin/",
  ])
    expect((await page.request.get(origin + path)).status()).toBe(404);
  expect(remotes).toEqual([]);
  await page.getByRole("link", { name: "Ajustes", exact: true }).click();
  await page
    .getByRole("button", { name: "Cerrar sesión", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Entrar a mi negocio" }),
  ).toBeVisible();
  console.log(
    "Acceso Android verificado: login, rechazo de consultas anónimas, dashboard, Service Worker y bloqueo de rutas administrativas.",
  );
} finally {
  await browser.close();
}
