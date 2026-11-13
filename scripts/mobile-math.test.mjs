import assert from "node:assert/strict";
import test from "node:test";
import {
  moneyCents,
  paymentBreakdown,
  summarizeBreakdown,
  summarizePayments,
  businessDate,
} from "../frontend/src/paymentMath.js";

test("ventas netas: descuento ya incluido, propinas separadas, IDs distintos cuentan", () => {
  const a = {
    id: "a",
    subtotal: "60800",
    totalWithTip: "54000",
    tipAmount: 0,
    paidAmount: 100000,
  };
  const summary = summarizePayments([a, { ...a, id: "b" }, a]);
  assert.equal(summary.sales, 108000);
  assert.equal(summary.tickets, 2);
  assert.equal(
    summarizePayments([
      {
        id: "c",
        subtotal: 100,
        totalWithTip: 95,
        tipAmount: 5,
        discountAmount: 10,
      },
    ]).sales,
    90,
  );
});
test("pago mixto: el cambio sale solo del efectivo, se conserva transferencia", () => {
  const result = paymentBreakdown({
    totalWithTip: 110,
    tipAmount: 10,
    paymentSplits: [
      { method: "EFECTIVO", amount: 100 },
      { method: "TRANSFERENCIA", amount: 60 },
    ],
  });
  assert.equal(result.find((x) => x.method === "EFECTIVO").total, 50);
  assert.equal(result.find((x) => x.method === "TRANSFERENCIA").total, 60);
  assert.equal(
    result.reduce((sum, x) => sum + moneyCents(x.sales), 0n),
    10000n,
  );
  assert.equal(
    result.reduce((sum, x) => sum + moneyCents(x.tip), 0n),
    1000n,
  );
});
test("centavos: reparto de propina nunca produce ventas negativas y conserva totales", () => {
  assert.equal(moneyCents(0.1 + 0.2), 30n);
  assert.throws(() => moneyCents(0.125), /inválido/);
  const result = paymentBreakdown({
    totalWithTip: "0.03",
    tipAmount: "0.02",
    paymentSplits: [
      { method: "EFECTIVO", amount: "0.01" },
      { method: "TARJETA", amount: "0.01" },
      { method: "TRANSFERENCIA", amount: "0.01" },
    ],
  });
  assert.ok(result.every((row) => row.sales >= 0));
  assert.equal(
    result.reduce((sum, row) => sum + moneyCents(row.tip), 0n),
    2n,
  );
  assert.equal(
    summarizeBreakdown([
      { totalWithTip: "0.30", tipAmount: 0, method: "EFECTIVO" },
      { totalWithTip: "0.10", tipAmount: 0, method: "EFECTIVO" },
    ])[0].total,
    0.4,
  );
});
test("datos inconsistentes no se convierten en un desglose inventado", () => {
  assert.equal(
      paymentBreakdown({
        totalWithTip: 50,
        tipAmount: 0,
        paymentSplits: [{ method: "TARJETA", amount: 60 }],
      })[0].method,
    "POR CONCILIAR",
  );
  assert.equal(
      paymentBreakdown({
        totalWithTip: 50,
        tipAmount: 0,
        paymentSplits: [{ method: "EFECTIVO", amount: 40 }],
      })[0].total,
    50,
  );
  assert.equal(
    paymentBreakdown({
      totalWithTip: 50,
      tipAmount: 0,
      method: "EFECTIVO + TARJETA",
    })[0].method,
    "POR CONCILIAR",
  );
});
test("día local de negocio: primer pago UTC pertenece al día anterior en Bogotá", () => {
  assert.equal(
    businessDate("2026-05-26T00:28:21.350Z", "America/Bogota"),
    "2026-05-25",
  );
  assert.equal(
    businessDate("2026-05-26T00:28:21.350Z", "Asia/Tokyo"),
    "2026-05-26",
  );
});
