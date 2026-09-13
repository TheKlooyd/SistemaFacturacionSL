import assert from "node:assert/strict";
import test from "node:test";
import { createBusinessBranding, resolveLogoUrl } from "../frontend/src/branding.js";
import { ticketCuenta, ticketFactura, ticketComanda, ticketCierre } from "../frontend/src/printTemplates.js";
import { loadSessionToken, saveSessionToken, removeSessionToken } from "../frontend/src/qrSessionStorage.js";
import { getQrBranding } from "../supabase/functions/qr-order/branding.ts";
import { openPrintWindow } from "../frontend/src/print.js";

const base = "/SistemaFacturacionSL/";
const a = createBusinessBranding({ id: "a", nombre: "Restaurante A" }, {
  nombre_comercial: "Comercial A", logo_url: "a.png", payment_info: "Transferencias A\nCuenta A",
}, base);
const b = createBusinessBranding({ id: "b", nombre: "Restaurante B" }, {}, base);
const order = { tableName: "Mesa 1", createdAt: "2026-09-12T12:00:00Z", items: [{ name: "Pan & queso", qty: 2, unit_price: 5000 }], subtotal: 10000, tipAmount: 0, totalWithTip: 10000 };

test("cuenta y factura usan exclusivamente la configuración recibida, incluidos pagos vacíos", () => {
  for (const render of [ticketCuenta, ticketFactura]) {
    const first = render({ ...order, branding: a });
    const second = render({ ...order, branding: b });
    assert.match(first, /Comercial A/);
    assert.match(first, /Transferencias A\nCuenta A/);
    assert.match(first, /src="\/SistemaFacturacionSL\/a.png"/);
    assert.match(second, /Restaurante B/);
    assert.match(second, /logoklooyd.png/);
    assert.doesNotMatch(second, /Comercial A|Cuenta A|Nequi|SABOR LATINO|317 231|300 550/);
    assert.match(second, /2 x Pan &amp; queso/);
    assert.doesNotMatch(second, /&amp;amp;/);
    assert.match(second, /10[.,]000/);
  }
});

test("comanda y cierre identifican el negocio sin divulgar instrucciones de pago", () => {
  for (const html of [ticketComanda({ ...order, branding: a }), ticketCierre({ branding: a, dateISO: "2026-09-12" })]) {
    assert.match(html, /Comercial A/);
    assert.doesNotMatch(html, /Cuenta A/);
  }
});

test("los campos configurables se escapan al imprimir y los protocolos peligrosos se rechazan", () => {
  assert.equal(createBusinessBranding(null, null).name, "Mi negocio");
  const html = ticketFactura({ ...order, branding: {
    name: '<script>alert("x")</script>', nit: '<b>NIT</b>', paymentInfo: '<img src=x onerror=alert(1)>',
    logoUrl: 'https://example.test/logo.png" onerror="alert(1)',
  } });
  assert.doesNotMatch(html, /<script>|<b>NIT|<img src=x|" onerror="/);
  assert.match(html, /&lt;script&gt;/);
  for (const logo of ["javascript:alert(1)", "data:text/html;base64,AA", "//example.test/logo.png", "../a.png", "a\\b.png", "a\nb.png"]) {
    assert.equal(resolveLogoUrl(logo, base), `${base}logoklooyd.png`);
  }
  assert.equal(resolveLogoUrl("saborlatinologo.png", base), `${base}saborlatinologo.png`);
  assert.equal(resolveLogoUrl(`${base}a.png`, base), `${base}a.png`);
});

function memoryStore() {
  const entries = new Map();
  return { getItem: (key) => entries.get(key) || null, setItem: (key, value) => entries.set(key, value), removeItem: (key) => entries.delete(key) };
}

test("la transición de almacenamiento conserva el borrador y mantiene cada QR separado", () => {
  const storage = memoryStore();
  storage.setItem("sabor-latino-qr-session:qr-a", "old-secret");
  assert.equal(loadSessionToken("qr-a", () => "new", storage), "old-secret");
  saveSessionToken("qr-a", "old-secret", storage);
  assert.equal(storage.getItem("sabor-latino-qr-session:qr-a"), null);
  assert.equal(loadSessionToken("qr-a", () => "new", storage), "old-secret");
  assert.equal(loadSessionToken("qr-b", () => "different", storage), "different");
  saveSessionToken("qr-b", "b-secret", storage);
  removeSessionToken("qr-a", storage);
  assert.equal(loadSessionToken("qr-b", () => "new", storage), "b-secret");
});

test("un almacenamiento bloqueado no pierde la clave antigua ni impide comenzar", () => {
  const storage = memoryStore();
  storage.setItem("sabor-latino-qr-session:qr-a", "old-secret");
  storage.setItem = () => { throw Error("quota"); };
  saveSessionToken("qr-a", "old-secret", storage);
  assert.equal(loadSessionToken("qr-a", () => "new", storage), "old-secret");
  assert.equal(loadSessionToken("qr-a", () => "new", { getItem() { throw Error("blocked"); } }), "new");
});

function fakeAdmin({ fault = null } = {}) {
  const calls = [];
  const tables = {
    mesa_qr_codes: [
      { token_hash: "hash-a", negocio_id: "a", is_active: true },
      { token_hash: "hash-b", negocio_id: "b", is_active: true },
      { token_hash: "disabled", negocio_id: "a", is_active: false },
      { token_hash: "suspended", negocio_id: "c", is_active: true },
      { token_hash: "no-config", negocio_id: "d", is_active: true },
    ],
    negocios: [
      { id: "a", nombre: "Restaurante A", estado: "activo" },
      { id: "b", nombre: "Restaurante B", estado: "activo" },
      { id: "c", nombre: "Suspendido", estado: "suspendido" },
      { id: "d", nombre: "Sin configuración", estado: "activo" },
    ],
    negocio_configuracion: [
      { negocio_id: "a", nombre_comercial: "Comercial A", logo_url: "a.png", payment_info: "private-a", reglas_pedidos: "secret" },
      { negocio_id: "b", nombre_comercial: "Comercial B", logo_url: null, payment_info: "private-b" },
    ],
  };
  return {
    calls,
    async rpc(name, params) {
      assert.equal(name, "business_has_active_subscription");
      return { data: params.p_negocio_id !== "c", error: null };
    },
    from(table) {
      assert.ok(tables[table], `Unexpected table: ${table}`);
      const filters = [];
      let fields;
      return {
        select(value) { fields = value.split(","); return this; },
        eq(key, value) { filters.push([key, value]); return this; },
        async maybeSingle() {
          calls.push({ table, filters });
          if (fault === table) return { error: Error("database unavailable") };
          const row = tables[table].find((candidate) => filters.every(([key, value]) => candidate[key] === value));
          return { data: row ? Object.fromEntries(fields.map((field) => [field, row[field]])) : null, error: null };
        },
      };
    },
  };
}

test("QR público resuelve dos negocios por el hash, con lista pública de campos y sin escrituras", async () => {
  const admin = fakeAdmin();
  assert.deepEqual(await getQrBranding(admin, "hash-a"), { state: "ok", branding: { name: "Comercial A", logoUrl: "a.png" } });
  assert.deepEqual(await getQrBranding(admin, "hash-b"), { state: "ok", branding: { name: "Comercial B", logoUrl: "" } });
  const configs = admin.calls.filter((call) => call.table === "negocio_configuracion");
  assert.deepEqual(configs.map((call) => call.filters), [[["negocio_id", "a"]], [["negocio_id", "b"]]]);
  // This fake has only the read-only access RPC and no INSERT, UPDATE or DELETE methods.
});

test("QR desconocido/inactivo no devuelve branding; errores de BD no producen datos de otro negocio", async () => {
  for (const qrHash of ["unknown", "disabled", "a"]) {
    assert.deepEqual(await getQrBranding(fakeAdmin(), qrHash), { state: "invalid" });
  }
  assert.deepEqual(await getQrBranding(fakeAdmin(), "suspended"), { state: "inactive" });
  assert.deepEqual(await getQrBranding(fakeAdmin(), "no-config"), { state: "ok", branding: { name: "Sin configuración", logoUrl: "" } });
  await assert.rejects(getQrBranding(fakeAdmin({ fault: "negocio_configuracion" }), "hash-a"), /database unavailable/);
});

test("imprimir espera al logo y continúa sin imagen cuando esta falla", async (t) => {
  const previousWindow = globalThis.window;
  t.after(() => { if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow; });
  for (const event of ["load", "error"]) {
    const img = new EventTarget();
    Object.assign(img, { complete: false, naturalWidth: 0, hidden: false });
    let printed = false;
    let closed = false;
    globalThis.window = { open: () => ({
      document: { open() {}, write() {}, close() {}, images: [img] }, focus() {},
      print() { printed = true; }, close() { closed = true; },
    }) };
    const printing = openPrintWindow("<html></html>");
    await Promise.resolve();
    assert.equal(printed, false);
    img.complete = true;
    img.naturalWidth = event === "load" ? 100 : 0;
    img.dispatchEvent(new Event(event));
    await printing;
    assert.equal(printed, true);
    assert.equal(closed, true);
    assert.equal(img.hidden, event === "error");
  }
});
