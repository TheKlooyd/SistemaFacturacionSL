import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migration = await readFile(
  "supabase/migrations/20261101213245_inventory_products_and_atomic_payment.sql",
  "utf8"
);
const businessId = "10000000-0000-4000-8000-000000000001";
const productId = "20000000-0000-4000-8000-000000000001";
const serviceId = "20000000-0000-4000-8000-000000000002";
const orderId = "30000000-0000-4000-8000-000000000001";

async function createDatabase() {
  const db = new PGlite();
  await db.exec(`
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$
      select null::uuid
    $$;
    create table public.productos (
      id uuid primary key,
      negocio_id uuid not null,
      name text not null,
      price numeric(12, 2) not null default 0,
      item_type text not null default 'service'
        check (item_type in ('service', 'product'))
    );
    create table public.negocio_usuarios (
      user_id uuid not null,
      negocio_id uuid not null,
      is_active boolean not null default true,
      created_at timestamptz not null default now()
    );
    create table public.ordenes (
      id uuid primary key,
      negocio_id uuid not null,
      table_id text not null,
      items jsonb not null default '[]',
      status text not null default 'OPEN',
      opened_at timestamptz not null default now()
    );
    create table public.pagos (
      id uuid primary key,
      negocio_id uuid not null,
      table_id text,
      table_name text,
      is_delivery boolean not null default false,
      delivery_client jsonb,
      method text,
      payment_splits jsonb,
      subtotal numeric,
      tip_amount numeric,
      discount_amount numeric not null default 0,
      total_with_tip numeric,
      paid_amount numeric,
      items jsonb,
      created_at timestamptz not null default now()
    );
  `);
  await db.exec(migration);
  return db;
}

async function addCatalogAndOrder(db, stockQuantity) {
  await db.query(
    `insert into public.productos (id, negocio_id, name, price, item_type, stock_quantity)
     values ($1, $2, 'Aceite', 20000, 'product', $3)`,
    [productId, businessId, stockQuantity]
  );
  await db.query(
    `insert into public.productos (id, negocio_id, name, price, item_type, stock_quantity)
     values ($1, $2, 'Servicio', 10000, 'service', 0)`,
    [serviceId, businessId]
  );
  await db.query(
    `insert into public.ordenes (id, negocio_id, table_id, items)
     values ($1, $2, '1', '[]')`,
    [orderId, businessId]
  );
}

function paymentPayload(items) {
  return {
    id: crypto.randomUUID(),
    negocio_id: businessId,
    table_id: "1",
    table_name: "Mesa 1",
    method: "Efectivo",
    subtotal: 50000,
    tip_amount: 0,
    total_with_tip: 50000,
    paid_amount: 50000,
    items,
  };
}

test("el pago descuenta productos, no servicios, y cierra la cuenta atómicamente", async (t) => {
  const db = await createDatabase();
  t.after(() => db.close());
  await addCatalogAndOrder(db, 3);

  await db.query(
    "select public.complete_table_payment($1::jsonb)",
    [JSON.stringify(paymentPayload([
      { product_id: productId, qty: 1 },
      { product_id: productId, qty: 1 },
      { product_id: serviceId, qty: 1 },
    ]))]
  );

  const stock = await db.query(
    "select stock_quantity from public.productos where id = $1",
    [productId]
  );
  const serviceStock = await db.query(
    "select stock_quantity from public.productos where id = $1",
    [serviceId]
  );
  const payments = await db.query("select count(*)::int as count from public.pagos");
  const orders = await db.query("select count(*)::int as count from public.ordenes");

  assert.equal(Number(stock.rows[0].stock_quantity), 1);
  assert.equal(Number(serviceStock.rows[0].stock_quantity), 0);
  assert.equal(payments.rows[0].count, 1);
  assert.equal(orders.rows[0].count, 0);
});

test("si falta inventario, revierte el pago y conserva la cuenta abierta", async (t) => {
  const db = await createDatabase();
  t.after(() => db.close());
  await addCatalogAndOrder(db, 1);

  await assert.rejects(
    db.query(
      "select public.complete_table_payment($1::jsonb)",
      [JSON.stringify(paymentPayload([{ product_id: productId, qty: 2 }]))]
    ),
    /Inventario insuficiente/
  );

  const stock = await db.query(
    "select stock_quantity from public.productos where id = $1",
    [productId]
  );
  const payments = await db.query("select count(*)::int as count from public.pagos");
  const orders = await db.query("select count(*)::int as count from public.ordenes");

  assert.equal(Number(stock.rows[0].stock_quantity), 1);
  assert.equal(payments.rows[0].count, 0);
  assert.equal(orders.rows[0].count, 1);
});
