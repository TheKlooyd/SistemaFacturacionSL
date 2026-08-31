import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile("supabase/migrations/202608310001_qr_ordering.sql", "utf8");

test("QR migration constrains tables to 1 through 12 and keeps 9 through 12 inactive", () => {
  assert.match(migration, /mesa_number between 1 and 12/);
  assert.match(migration, /id between 1 and 8 then true else false/);
});

test("QR migration protects anonymous table access and has idempotent submit state", () => {
  assert.match(migration, /revoke all on public\.mesa_qr_codes, public\.qr_sessions, public\.qr_orders from anon/);
  assert.match(migration, /idempotency_key uuid unique/);
  assert.match(migration, /qr_sessions_one_active_per_table/);
  assert.match(migration, /qr_close_session_on_order_delete/);
});

test("locally generated QR registration file has twelve unique hashes and initial activation split", async () => {
  const sql = await readFile("qr-output/register-qr-codes.sql", "utf8");
  const rows = [...sql.matchAll(/\((\d+), \d+, '([a-f0-9]{64})', (true|false)\)/g)];
  assert.equal(rows.length, 12);
  assert.equal(new Set(rows.map((row) => row[2])).size, 12);
  assert.deepEqual(rows.map((row) => Number(row[1])), Array.from({ length: 12 }, (_, index) => index + 1));
  assert.deepEqual(rows.map((row) => row[3]), [...Array(8).fill("true"), ...Array(4).fill("false")]);
});