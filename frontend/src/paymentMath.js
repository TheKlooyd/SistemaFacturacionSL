// Shared by the POS and owner mobile. Arithmetic uses integer cents throughout.
export function moneyCents(value = 0) {
  // Accept the representation noise of existing JSON numbers, not real sub-cent amounts.
  if (typeof value === "number") {
    if (
      !Number.isFinite(value) ||
      !Number.isSafeInteger(Math.round(value * 100)) ||
      Math.abs(Math.round(value * 100) / 100 - value) >
        Number.EPSILON * Math.max(1, Math.abs(value)) * 4
    )
      throw new Error("Importe monetario inválido.");
    value = value.toFixed(2);
  }
  const text = String(value ?? 0).trim();
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(text))
    throw new Error("Importe monetario inválido.");
  const negative = text.startsWith("-");
  const [whole, decimal = ""] = text.replace(/^-/, "").split(".");
  const result = BigInt(whole) * 100n + BigInt(decimal.padEnd(2, "0"));
  return negative ? -result : result;
}

export function centsNumber(value) {
  if (
    value > BigInt(Number.MAX_SAFE_INTEGER) ||
    value < BigInt(Number.MIN_SAFE_INTEGER)
  ) {
    throw new Error("El importe supera el rango admitido.");
  }
  return Number(value) / 100;
}

function field(payment, camel, snake) {
  return payment[camel] ?? payment[snake] ?? 0;
}
function methodName(value) {
  const name = String(value || "OTROS").trim().toUpperCase();
  return ["EFECTIVO", "TARJETA", "TRANSFERENCIA"].includes(name) ? name : "OTROS";
}

export function paymentAmounts(payment) {
  const total = moneyCents(field(payment, "totalWithTip", "total_with_tip"));
  const tip = moneyCents(field(payment, "tipAmount", "tip_amount"));
  if (total < 0n || tip < 0n || tip > total)
    throw new Error("El total y la propina no concilian.");
  return { total, tip, sales: total - tip };
}

export function summarizePayments(payments) {
  const ids = new Set();
  let subtotal = 0n,
    total = 0n,
    tip = 0n,
    tickets = 0;
  for (const payment of payments) {
    if (payment.id && ids.has(payment.id)) continue;
    if (payment.id) ids.add(payment.id);
    const amounts = paymentAmounts(payment);
    subtotal += moneyCents(payment.subtotal);
    total += amounts.total;
    tip += amounts.tip;
    tickets++;
  }
  return {
    subtotal: centsNumber(subtotal),
    total: centsNumber(total),
    tip: centsNumber(tip),
    sales: centsNumber(total - tip),
    tickets,
  };
}

export function paymentBreakdown(payment) {
  const { total, tip } = paymentAmounts(payment);
  const unresolved = () => [{ method: "POR CONCILIAR", total: centsNumber(total), tip: centsNumber(tip), sales: centsNumber(total-tip), uses: 1 }];
  const splits = payment.paymentSplits ?? payment.payment_splits;
  const amounts = new Map();
  if (Array.isArray(splits) && splits.length) {
    for (const split of splits) {
      if(String(split?.method).includes("+")) return unresolved();
      const method = methodName(split.method);
      let amount;
      try { amount = moneyCents(split.amount); } catch { return unresolved(); }
      if (amount < 0n) return unresolved();
      amounts.set(method, (amounts.get(method) || 0n) + amount);
    }
    const received = [...amounts.values()].reduce(
      (sum, amount) => sum + amount,
      0n,
    );
    const change = received - total;
    if (change < 0n || change > (amounts.get("EFECTIVO") || 0n)) return unresolved();
    if (change) amounts.set("EFECTIVO", amounts.get("EFECTIVO") - change);
  } else {
    // A legacy mixed label cannot tell us how much went to each method.
    if (String(payment.method).includes("+")) return unresolved();
    const method = methodName(payment.method);
    amounts.set(method, total);
  }
  const entries = [...amounts].filter(
    ([, amount]) => amount > 0n || total === 0n,
  );
  let remainingTip = tip,
    remainingTotal = total;
  return entries.map(([method, amount], index) => {
    const partTip =
      index === entries.length - 1
        ? remainingTip
        : remainingTotal
          ? (remainingTip * amount) / remainingTotal
          : 0n;
    remainingTip -= partTip;
    remainingTotal -= amount;
    return {
      method,
      total: centsNumber(amount),
      tip: centsNumber(partTip),
      sales: centsNumber(amount - partTip),
      uses: 1,
    };
  });
}

export function summarizeBreakdown(payments) {
  const grouped = new Map(),
    ids = new Set();
  for (const payment of payments) {
    if (payment.id && ids.has(payment.id)) continue;
    if (payment.id) ids.add(payment.id);
    for (const entry of paymentBreakdown(payment)) {
      const current = grouped.get(entry.method) || {
        method: entry.method,
        total: 0n,
        tip: 0n,
        uses: 0,
      };
      current.total += moneyCents(entry.total);
      current.tip += moneyCents(entry.tip);
      current.uses++;
      grouped.set(entry.method, current);
    }
  }
  return [...grouped.values()]
    .map((entry) => ({
      ...entry,
      total: centsNumber(entry.total),
      tip: centsNumber(entry.tip),
      sales: centsNumber(entry.total - entry.tip),
    }))
    .sort((a, b) => b.total - a.total);
}

export function businessDate(iso, timeZone = "America/Bogota") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
