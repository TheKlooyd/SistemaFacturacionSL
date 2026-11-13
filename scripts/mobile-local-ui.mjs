import { chromium, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { localStatus, root } from "./mobile-local.mjs";

await localStatus();
const [owner] = JSON.parse(
  await readFile(resolve(root, "local/state.local/accounts.json"), "utf8"),
);
const browser = await chromium.launch();
let page;
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
  });
  const unexpected = [];
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (["127.0.0.1", "localhost"].includes(url.hostname))
      return route.continue();
    unexpected.push(url.origin);
    return route.abort();
  });
  page = await context.newPage();
  page.setDefaultTimeout(15000);
  await page.goto("http://127.0.0.1:5173/mobile/");
  await page.getByLabel("Correo", { exact: true }).fill(owner.email);
  await page.getByLabel("Contraseña", { exact: true }).fill(owner.password);
  await page.getByRole("button", { name: "Entrar a mi negocio" }).click();
  await expect(
    page.getByRole("heading", { name: "Ventas por día" }),
  ).toBeVisible();
  await page.screenshot({
    path: resolve(root, "design-preview/mobile/local-dashboard-390.png"),
    fullPage: true,
  });
  await page.getByRole("link", { name: "Ajustes", exact: true }).click();
  await page
    .getByLabel("Contraseña actual", { exact: true })
    .fill(owner.password);
  await page.getByLabel("Nuevo PIN").fill("123456");
  await page.getByLabel("Repite el PIN").fill("123456");
  await page.getByRole("button", { name: "Guardar PIN", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "PIN configurado" }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Inventario", exact: false })
    .last()
    .click();
  await page
    .getByRole("link")
    .filter({
      has: page.getByRole("heading", {
        name: "Producto de prueba",
        exact: true,
      }),
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Ajustar existencias" }),
  ).toBeVisible();
  await page.getByLabel("Cantidad", { exact: true }).fill("1");
  await page
    .getByLabel("Motivo", { exact: true })
    .fill("Prueba de interfaz local");
  await page.getByLabel("PIN administrativo", { exact: true }).fill("123456");
  page.on("dialog", (dialog) => dialog.accept());
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().endsWith("/rpc/klooyd_mobile") &&
        response.request().postDataJSON()?.p_action === "adjust" &&
        response.ok(),
    ),
    page.getByRole("button", { name: "Confirmar ajuste", exact: true }).click(),
  ]);
  await expect(
    page.getByRole("status").filter({ hasText: "registrado" }),
  ).toBeVisible();
  // Restore the quantity with a second audited adjustment through the UI.
  await page.getByLabel(/^Tipo/).selectOption("remove");
  await page.getByLabel("Cantidad", { exact: true }).fill("1");
  await page
    .getByLabel("Motivo", { exact: true })
    .fill("Restauración de prueba local");
  await page.getByLabel("PIN administrativo", { exact: true }).fill("123456");
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().endsWith("/rpc/klooyd_mobile") &&
        response.request().postDataJSON()?.p_action === "adjust" &&
        response.ok(),
    ),
    page.getByRole("button", { name: "Confirmar ajuste", exact: true }).click(),
  ]);
  await expect(
    page.getByRole("status").filter({ hasText: "registrado" }),
  ).toBeVisible();
  await page.screenshot({
    path: resolve(root, "design-preview/mobile/local-inventory-390.png"),
    fullPage: true,
  });
  await page.getByRole("link", { name: "Ajustes", exact: true }).click();
  await page
    .getByRole("button", { name: "Cerrar sesión", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Entrar a mi negocio" }),
  ).toBeVisible();
  expect(unexpected).toEqual([]);
  console.log(
    "Interfaz local verificada: login, ventas, configurar PIN, agregar/retirar con auditoría y salir. Sin peticiones remotas.",
  );
} catch (error) {
  if (page) {
    await page.screenshot({
      path: resolve(root, "local/state.local/ui-failure.png"),
      fullPage: true,
    });
    console.error("Estado visible:", await page.locator("body").innerText());
  }
  throw error;
} finally {
  await browser.close();
}
