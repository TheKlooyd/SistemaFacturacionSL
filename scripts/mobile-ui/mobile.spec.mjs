import { test, expect } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
const business = "10000000-0000-4000-8000-000000000001",
  product = "20000000-0000-4000-8000-000000000001";
const source = await readFile("frontend/.env", "utf8");
const projectUrl = source.match(/^VITE_SUPABASE_URL\s*=\s*["']?([^\s"']+)/m)[1];
const projectRef = new URL(projectUrl).hostname.split(".")[0];
const contextData = {
  businesses: [
    {
      id: business,
      name: "Negocio de prueba",
      timezone: "America/Bogota",
      currency: "COP",
    },
  ],
  pinConfigured: true,
};
await mkdir("design-preview/mobile", { recursive: true });

async function fixture(
  page,
  { authenticated = true, owner = true, failFirstAdjustment = false, failFirstCreation = false } = {},
) {
  const calls = [];
  let stock = 5,
    receipt = null,
    failed = false,
    createdItem = null,
    creationFailed = false;
  if (authenticated)
    await page.addInitScript(
      ({ projectRef, business }) => {
        const jwt = [
          btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })),
          btoa(
            JSON.stringify({
              sub: business,
              exp: Math.floor(Date.now() / 1000) + 3600,
              aud: "authenticated",
              role: "authenticated",
            }),
          ),
          "local-ui-fixture",
        ].join(".");
        localStorage.setItem(
          `sb-${projectRef}-auth-token`,
          JSON.stringify({
            access_token: jwt,
            refresh_token: "local-fixture-only",
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            expires_in: 3600,
            token_type: "bearer",
            user: {
              id: business,
              email: "propietario@example.test",
              aud: "authenticated",
              role: "authenticated",
              app_metadata: {},
              user_metadata: {},
              created_at: "2026-05-01T00:00:00Z",
            },
          }),
        );
      },
      { projectRef, business },
    );
  // UI contract fixtures only. The real SQL implementation is tested separately
  // in mobile-database.test.mjs. No request may reach the production project.
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (["127.0.0.1", "localhost"].includes(url.hostname))
      return route.continue();
    if (url.origin !== projectUrl) return route.abort();
    if (!url.pathname.endsWith("/rpc/klooyd_mobile") && !url.pathname.endsWith("/rpc/klooyd_mobile_workspace"))
      return route.fulfill({
        status: 501,
        json: { message: "Endpoint outside this UI fixture" },
      });
    const { p_action: action, p_payload: payload } = route
      .request()
      .postDataJSON();
    calls.push({
      action,
      payload:
        action === "pin_verify" ? { deviceId: payload.deviceId } : payload,
    });
    let data;
    switch (action) {
      case "context":
        data = owner ? contextData : { businesses: [], pinConfigured: false };
        break;
      case "daily":
        data = {
          date: "2026-11-13", sales: "120000", tickets: 4,
          stationLabel: "Mesas", stationsTotal: 8, stationsBusy: 3,
          lowStock: 3, outOfStock: 1, unread: 2, lastClose: null,
        };
        break;
      case "dashboard": {
        const month = payload.month;
        const count = new Date(
          Number(month.slice(0, 4)),
          Number(month.slice(5, 7)),
          0,
        ).getDate();
        data = {
          month,
          firstDay: "2026-05-25",
          historical: "12345600",
          lowStock: 3,
          outOfStock: 1,
          unread: 2,
          lastClose: null,
          suspectedDuplicates: 1,
          days: Array.from({ length: count }, (_, i) => ({
            date: month.slice(0, 8) + String(i + 1).padStart(2, "0"),
            sales: String(i % 4 === 0 ? 0 : (i + 1) * 12600),
            tickets: i % 4 === 0 ? 0 : 3,
          })),
        };
        break;
      }
      case "categories":
        data = [{ id: business, name: "Repuestos" }];
        break;
      case "inventory":
        data = [
          {
            id: product,
            name: "Aceite de motor",
            stock_quantity: String(stock),
            category: "Repuestos",
            category_id: business,
          },
        ];
        break;
      case "product":
        data = {
          id: product,
          name: "Aceite de motor",
          stock: String(stock),
          movements: receipt ? [receipt] : [],
        };
        break;
      case "pin_verify":
        data =
          payload.pin === "123456"
            ? { ok: true, token: "local-fixture-token" }
            : { ok: false, error: "PIN incorrecto." };
        break;
      case "create_catalog_item":
        createdItem ||= { id: product };
        data = createdItem;
        if (failFirstCreation && !creationFailed) {
          creationFailed = true;
          return route.abort("connectionfailed");
        }
        break;
      case "adjust":
        if (!receipt) {
          stock += payload.delta;
          receipt = {
            id: "receipt-1",
            delta: String(payload.delta),
            stock_anterior: payload.expectedStock,
            stock_nuevo: String(stock),
            motivo: payload.reason,
            actor_user_id: business,
            created_at: "2026-11-13T12:00:00Z",
            idempotencyKey: payload.idempotencyKey,
          };
        }
        data = receipt;
        if (failFirstAdjustment && !failed) {
          failed = true;
          return route.abort("connectionfailed");
        }
        break;
      case "closes":
      case "notifications":
        data = [];
        break;
      case "settings":
        data = {
          devices: [],
          preferences: {
            stock_enabled: true,
            close_enabled: true,
            show_details: false,
          },
        };
        break;
      default:
        return route.fulfill({
          status: 501,
          json: { message: "Operation outside this fixture" },
        });
    }
    return route.fulfill({
      status: 200,
      json: data,
      headers: { "access-control-allow-origin": "*" },
    });
  });
  return { calls, getStock: () => stock };
}

for (const width of [320, 390, 430, 768])
  test(`login y dashboard sin desbordamiento a ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await fixture(page);
    await page.goto("/mobile/");
    await expect(
      page.getByRole("heading", { name: "Tu negocio, al día" }),
    ).toBeVisible();
    await expect(
      page.getByText("Ventas de hoy", { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const desktopScripts = await page
      .locator("script[src]")
      .evaluateAll((scripts) => scripts.map((s) => s.src));
    expect(desktopScripts.some((s) => s.endsWith("/src/main.jsx"))).toBe(false);
    if (width === 390 || width === 768)
      await page.screenshot({
        path: `design-preview/mobile/dashboard-${width}.png`,
        fullPage: true,
      });
    await page.getByRole("link", { name: "Inventario", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Existencias" }),
    ).toBeVisible();
    await page.getByRole("link", { name: /Aceite de motor/ }).click();
    await expect(
      page.getByRole("heading", { name: "Ajustar existencias" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (width === 390)
      await page.screenshot({
        path: "design-preview/mobile/inventario-390.png",
        fullPage: true,
      });
  });
test("inicio muestra el día y conserva el histórico en ventas", async ({ page }) => {
  const f = await fixture(page);
  await page.goto("/mobile/");
  await expect(page.getByText("Ventas de hoy", { exact: true })).toBeVisible();
  await expect(page.getByText("Mesas en uso", { exact: true })).toBeVisible();
  await expect(page.getByText("5 disponibles · 8 en total")).toBeVisible();
  await expect(page.getByText("Ventas históricas", { exact: true })).toHaveCount(0);
  expect(f.calls.some((call) => call.action === "dashboard")).toBe(false);
  await page.getByRole("link", { name: "Ventas", exact: true }).click();
  await expect(page.getByText("Ventas históricas", { exact: true })).toBeVisible();
});
test("crear producto requiere PIN y recupera el mismo intento tras recargar", async ({ page }) => {
  const f = await fixture(page, { failFirstCreation: true });
  await page.goto("/mobile/inventario/nuevo");
  await page.getByLabel("Nombre", { exact: true }).fill("Aceite nuevo");
  await page.getByRole("combobox", { name: "Categoría", exact: true }).selectOption(business);
  await page.getByLabel("Precio de venta").fill("2500");
  await page.getByLabel("Precio de compra").fill("1000");
  await page.getByLabel("Existencias iniciales").fill("3");
  await page.getByLabel("PIN administrativo").fill("000000");
  await page.getByRole("button", { name: "Guardar artículo" }).click();
  await expect(page.getByRole("alert")).toContainText("PIN incorrecto");
  expect(f.calls.some((call) => call.action === "create_catalog_item")).toBe(false);
  await page.getByLabel("PIN administrativo").fill("123456");
  await page.getByRole("button", { name: "Guardar artículo" }).click();
  await expect(page.getByRole("alert")).toContainText("evitar duplicados");
  await page.reload();
  await expect(page.getByText(/Pendiente de confirmar: Aceite nuevo/)).toBeVisible();
  await page.getByLabel("PIN administrativo").fill("123456");
  await page.getByRole("button", { name: "Reintentar el mismo artículo" }).click();
  await expect(page.getByText("Artículo guardado")).toBeVisible();
  const attempts = f.calls.filter((call) => call.action === "create_catalog_item");
  expect(attempts).toHaveLength(2);
  expect(attempts[0].payload.requestId).toBe(attempts[1].payload.requestId);
  expect(attempts[0].payload.stock).toBe(3);
});
test("crear servicio no solicita ni envía inventario físico", async ({ page }) => {
  const f = await fixture(page);
  await page.goto("/mobile/inventario/nuevo");
  await page.getByLabel("Tipo").selectOption("service");
  await page.getByLabel("Nombre", { exact: true }).fill("Servicio de mantenimiento");
  await page.getByRole("combobox", { name: "Categoría", exact: true }).selectOption(business);
  await page.getByLabel("Precio de venta").fill("50000");
  await expect(page.getByLabel("Existencias iniciales")).toHaveCount(0);
  await page.getByLabel("PIN administrativo").fill("123456");
  await page.getByRole("button", { name: "Guardar artículo" }).click();
  await expect(page.getByText("Artículo guardado")).toBeVisible();
  const call = f.calls.find((item) => item.action === "create_catalog_item");
  expect(call.payload.itemType).toBe("service");
  expect(call.payload.stock).toBe(0);
});
test("entrada anónima muestra login y no solicita datos privados", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const f = await fixture(page, { authenticated: false });
  await page.goto("/mobile/inventario/" + product);
  await expect(
    page.getByRole("heading", { name: "Inicia sesión" }),
  ).toBeVisible();
  expect(f.calls).toHaveLength(0);
  await page.screenshot({
    path: "design-preview/mobile/login-390.png",
    fullPage: true,
  });
});
test("empleado sin rol propietario no monta pantallas privadas", async ({
  page,
}) => {
  const f = await fixture(page, { owner: false });
  await page.goto("/mobile/inventario/" + product);
  await expect(
    page.getByRole("heading", { name: "Acceso para propietarios" }),
  ).toBeVisible();
  expect(f.calls.every((call) => call.action === "context")).toBe(true);
});
test("PIN incorrecto impide ajuste y reintento tras respuesta perdida conserva la clave", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const f = await fixture(page, { failFirstAdjustment: true });
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto("/mobile/inventario/" + product);
  await page.getByLabel("Cantidad", { exact: true }).fill("2");
  await page.getByLabel("PIN administrativo", { exact: true }).fill("000000");
  await page
    .getByRole("button", { name: "Confirmar ajuste", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("PIN incorrecto");
  expect(f.calls.some((c) => c.action === "adjust")).toBe(false);
  await page.getByLabel("PIN administrativo", { exact: true }).fill("123456");
  await page
    .getByRole("button", { name: "Confirmar ajuste", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("no se duplicará");
  expect(f.getStock()).toBe(7);
  await expect(page.getByLabel("Cantidad", { exact: true })).toBeDisabled();
  await page.getByLabel("PIN administrativo", { exact: true }).fill("123456");
  await page
    .getByRole("button", { name: "Reintentar el mismo ajuste", exact: true })
    .click();
  await expect(
    page.getByText("Ajuste guardado. El movimiento quedó registrado."),
  ).toBeVisible();
  expect(f.getStock()).toBe(7);
  const attempts = f.calls.filter((c) => c.action === "adjust");
  expect(attempts).toHaveLength(2);
  expect(attempts[0].payload.idempotencyKey).toBe(
    attempts[1].payload.idempotencyKey,
  );
});
test("manifest, iconos y 404 conservan las rutas profundas", async ({
  page,
}) => {
  await fixture(page);
  await page.goto("/404.html?ignored=1");
  const manifest = await (
    await page.request.get("/mobile/manifest.webmanifest")
  ).json();
  expect(manifest.scope).toBe("/mobile/");
  expect(manifest.start_url).toBe("/mobile/");
  for (const size of [192, 512]) {
    const result = await page.request.get(`/mobile/icon-${size}.png`);
    expect(result.ok()).toBe(true);
    const bytes = await result.body();
    expect(bytes.readUInt32BE(16)).toBe(size);
    expect(bytes.readUInt32BE(20)).toBe(size);
  }
  await page.goto(
    `/mobile/?mobile_route=${encodeURIComponent("/mobile/inventario/" + product)}`,
  );
  await expect(
    page.getByRole("heading", { name: "Aceite de motor" }),
  ).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/mobile/inventario/" + product);
});
test("push denegado no registra dispositivos ni bloquea la bandeja", async ({page}) => {
  const f=await fixture(page);
  await page.addInitScript(()=>{Notification.requestPermission=async()=>"denied";});
  await page.goto("/mobile/ajustes");
  await page.getByRole("button",{name:"Activar en este dispositivo"}).click();
  await expect(page.getByRole("status")).toContainText("Permiso denegado");
  expect(f.calls.some(call=>call.action==="subscribe")).toBe(false);
  await page.getByRole("link",{name:"Alertas",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Lo que debes saber"})).toBeVisible();
});

test.describe("PWA",()=>{
  test.use({serviceWorkers:"allow"});
  test("worker limitado a mobile y caída de red sin datos privados cacheados",async({page})=>{
    await fixture(page,{authenticated:false});await page.goto("/mobile/");
    await page.evaluate(async()=>{await navigator.serviceWorker.register("/mobile/sw.js",{scope:"/mobile/"});await navigator.serviceWorker.ready;});
    await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
    const state=await page.evaluate(async()=>{
      const registration=await navigator.serviceWorker.getRegistration("/mobile/");
      const cache=await caches.open("klooyd-mobile-offline-v1");
      return{scope:new URL(registration.scope).pathname,paths:(await cache.keys()).map(request=>new URL(request.url).pathname)};
    });
    expect(state.scope).toBe("/mobile/");expect(state.paths).toEqual(["/mobile/offline.html"]);
    await page.context().setOffline(true);await page.goto("/mobile/estadisticas");
    await expect(page.getByRole("heading",{name:"Estás sin conexión"})).toBeVisible();
  });
});
