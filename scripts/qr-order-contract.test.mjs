import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { pickRelevantProducts } from "../supabase/functions/_shared/groqOrder.ts";

const execFileAsync = promisify(execFile);
const migration = await readFile("supabase/migrations/202608310001_qr_ordering.sql", "utf8");
const lifecycleMigration = await readFile(
  "supabase/migrations/202609020002_qr_session_lifecycle.sql",
  "utf8"
);
const config = await readFile("supabase/config.toml", "utf8");
const mobileView = await readFile("frontend/src/MobileOrderView.jsx", "utf8");
const ordersStore = await readFile("frontend/src/ordersStore.js", "utf8");
const appView = await readFile("frontend/src/App.jsx", "utf8");
const customerQrView = await readFile("frontend/src/CustomerQrOrderView.jsx", "utf8");
const qrOrderFunction = await readFile("supabase/functions/qr-order/index.ts", "utf8");

test("la migración crea las doce mesas y mantiene 9 a 12 inactivas", () => {
  assert.match(migration, /generate_series\(1, 12\)/);
  assert.match(migration, /number <= 8/);
  assert.match(migration, /mesa_number between 1 and 12/);
});

test("la base impide dos órdenes abiertas y cierra el QR con el pago", () => {
  assert.match(migration, /ordenes_one_open_per_table/);
  assert.match(migration, /where status = 'OPEN'/);
  assert.match(migration, /complete_table_payment/);
  assert.match(migration, /qr_close_session_on_order_delete/);
  assert.match(migration, /alter publication supabase_realtime add table public\.ordenes/);
});

test("el ciclo QR cierra antes de borrar y limita los borradores vacíos", () => {
  assert.match(lifecycleMigration, /before delete on public\.ordenes/);
  assert.match(lifecycleMigration, /now\(\) \+ interval '5 minutes'/);
  assert.match(lifecycleMigration, /qr_touch_session/);
  assert.match(lifecycleMigration, /'state', 'stale_session'/);
  assert.match(lifecycleMigration, /status = 'closed'/);
  assert.match(lifecycleMigration, /jsonb_array_length\(items\) = 0/);
  assert.match(qrOrderFunction, /action === "touch"/);
  assert.match(customerQrView, /qrOrder\("touch", \{ sessionToken \}\)/);
});

test("los endpoints tienen los permisos esperados", () => {
  assert.match(migration, /grant execute on function public\.qr_start_session\(text, text\) to service_role/);
  assert.match(migration, /grant execute on function public\.complete_table_payment\(jsonb\) to authenticated, service_role/);
  assert.match(config, /\[functions\.qr-order\][\s\S]*verify_jwt = false/);
  assert.match(config, /\[functions\.parse-order\][\s\S]*verify_jwt = true/);
});

test("el frontend móvil no muestra mesas inactivas y propaga errores al cerrar", () => {
  assert.match(mobileView, /activeTables\.map/);
  assert.match(mobileView, /table\.isActive !== false/);
  assert.match(ordersStore, /throw error/);
  assert.match(ordersStore, /order\.items\.length === 0[\s\S]*await clearOrder\(tableId\)/);
  assert.match(appView, /return order\?\.status === "OPEN"/);
});

test("gaseosa grande siempre conserva Gas Familiar entre los candidatos", () => {
  const filler = Array.from({ length: 220 }, (_, index) => ({
    id: `pizza-${String(index).padStart(3, "0")}`,
    name: `Pizza sabor ${index} (Grande)`,
  }));
  const gasFamiliar = { id: "gas-familiar", name: "Gas Familiar 1.5 L" };
  const selected = pickRelevantProducts(
    "una gaseosa grande de manzana",
    [...filler, gasFamiliar]
  );

  assert.ok(selected.some((product) => product.id === gasFamiliar.id));
});

test("los errores comunes y agua con gas conservan los productos correctos", () => {
  const filler = Array.from({ length: 150 }, (_, index) => ({
    id: `filler-${index}`,
    name: `Producto ${index}`,
  }));
  const hamburger = { id: "burger", name: "Hamburguesa Especial" };
  const sparklingWater = { id: "water-gas", name: "GAS" };

  assert.ok(
    pickRelevantProducts("una hamburgesa especial", [...filler, hamburger])
      .some((product) => product.id === hamburger.id)
  );
  assert.ok(
    pickRelevantProducts("agua con gas", [...filler, sparklingWater])
      .some((product) => product.id === sparklingWater.id)
  );
});

test("el generador crea doce QR únicos sin depender de qr-output", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "sabor-latino-qr-test-"));
  const output = path.join(temporaryRoot, "generated");

  try {
    await execFileAsync(process.execPath, ["scripts/generate-qr-codes.mjs"], {
      cwd: process.cwd(),
      env: { ...process.env, QR_OUTPUT_DIR: output },
    });

    const sql = await readFile(path.join(output, "register-qr-codes.sql"), "utf8");
    const manifest = JSON.parse(await readFile(path.join(output, "qr-manifest.json"), "utf8"));
    const rows = [...sql.matchAll(/\((\d+), \d+, '([a-f0-9]{64})', (true|false)\)/g)];

    assert.equal(rows.length, 12);
    assert.equal(new Set(rows.map((row) => row[2])).size, 12);
    assert.equal(manifest.length, 12);
    assert.equal(new Set(manifest.map((entry) => entry.token)).size, 12);
    assert.deepEqual(
      manifest.map((entry) => entry.is_active),
      [...Array(8).fill(true), ...Array(4).fill(false)]
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
