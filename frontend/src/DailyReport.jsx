import { useEffect, useMemo, useState } from "react";
import {
  loadPayments,
  loadDailyClose,
  saveDailyClose,
  deleteDailyClose,
  clearPayments,
} from "./paymentsStore";
import { openPrintWindow } from "./print";
import { ticketCierre } from "./printTemplates";

function formatCOP(value) {
  return new Intl.NumberFormat("es-CO").format(value || 0);
}

function safeNumber(value) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function todayISO() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Extrae la fecha local (YYYY-MM-DD) de un ISO string UTC
function localDateFrom(isoString) {
  const d = new Date(isoString);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function requireKey(actionName = "esta acción") {
  const key = prompt(`Ingresa la clave de seguridad para ${actionName}:`);
  if (key !== "1207") {
    alert("Clave incorrecta. Acción cancelada.");
    return false;
  }
  return true;
}

function fmtDateTime(iso) {
  try {
    return new Date(iso).toLocaleString("es-CO");
  } catch {
    return iso;
  }
}

// Filtra pagos por fecha YYYY-MM-DD usando la fecha LOCAL de createdAt
function filterPaymentsByDate(payments, dateISO) {
  return payments.filter(
    (p) => p.createdAt && localDateFrom(p.createdAt) === dateISO
  );
}

function normalizeMethod(method) {
  const normalized = String(method || "").trim().toUpperCase();
  return normalized || "N/A";
}

function normalizePaymentSplits(paymentSplits) {
  return (paymentSplits || [])
    .map((split) => ({
      method: normalizeMethod(split?.method),
      amount: Math.max(0, safeNumber(split?.amount)),
    }))
    .filter((split) => split.method);
}

function normalizeItems(items) {
  return (items || [])
    .map((item) => ({
      productId: String(item?.product_id || ""),
      name: String(item?.name || ""),
      qty: safeNumber(item?.qty),
      unitPrice: safeNumber(item?.unit_price),
      lineTotal: safeNumber(item?.line_total),
    }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

function paymentFingerprint(payment) {
  return JSON.stringify({
    tableId: String(payment.tableId || ""),
    tableName: String(payment.tableName || ""),
    isDelivery: Boolean(payment.isDelivery),
    deliveryClient: payment.deliveryClient
      ? {
          id: String(payment.deliveryClient.id || ""),
          name: String(payment.deliveryClient.name || ""),
          phone: String(payment.deliveryClient.phone || ""),
        }
      : null,
    method: normalizeMethod(payment.method),
    paymentSplits: normalizePaymentSplits(payment.paymentSplits),
    subtotal: safeNumber(payment.subtotal),
    tipAmount: safeNumber(payment.tipAmount),
    discountAmount: safeNumber(payment.discountAmount),
    totalWithTip: safeNumber(payment.totalWithTip),
    paidAmount: safeNumber(payment.paidAmount),
    items: normalizeItems(payment.items),
  });
}

// Evita que un doble clic o reintento inmediato infle el cierre con el mismo pago.
function splitProbableDuplicatePayments(payments) {
  const uniquePayments = [];
  const duplicatePayments = [];
  const latestByFingerprint = new Map();
  const sorted = [...payments].sort(
    (a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
  );

  for (const payment of sorted) {
    const fingerprint = paymentFingerprint(payment);
    const previous = latestByFingerprint.get(fingerprint);
    const createdAtMs = new Date(payment.createdAt || 0).getTime();
    const previousMs = previous ? new Date(previous.createdAt || 0).getTime() : NaN;

    if (
      previous &&
      Number.isFinite(createdAtMs) &&
      Number.isFinite(previousMs) &&
      createdAtMs - previousMs <= 15000
    ) {
      duplicatePayments.push(payment);
      continue;
    }

    latestByFingerprint.set(fingerprint, payment);
    uniquePayments.push(payment);
  }

  const byNewestFirst = (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
  uniquePayments.sort(byNewestFirst);
  duplicatePayments.sort(byNewestFirst);

  return { uniquePayments, duplicatePayments };
}

function allocateAcrossSplits(paymentSplits, targetAmount) {
  const splits = normalizePaymentSplits(paymentSplits);
  if (splits.length === 0) return [];

  const totalCents = Math.round(safeNumber(targetAmount) * 100);
  const splitSumCents = splits.reduce(
    (sum, split) => sum + Math.round(split.amount * 100),
    0
  );

  if (splitSumCents <= 0) {
    return splits.map((split, index) => ({
      method: split.method,
      amount: index === 0 ? totalCents / 100 : 0,
    }));
  }

  let allocatedCents = 0;
  return splits.map((split, index) => {
    if (index === splits.length - 1) {
      return {
        method: split.method,
        amount: (totalCents - allocatedCents) / 100,
      };
    }

    const splitCents = Math.round(split.amount * 100);
    const nextCents = Math.round((splitCents * totalCents) / splitSumCents);
    allocatedCents += nextCents;

    return {
      method: split.method,
      amount: nextCents / 100,
    };
  });
}

function normalizeBreakdownEntries(entries) {
  return (entries || [])
    .map((entry) => ({
      method: normalizeMethod(entry?.method),
      uses: safeNumber(entry?.uses ?? entry?.tickets),
      total: Math.round(safeNumber(entry?.total) * 100),
      tip: Math.round(safeNumber(entry?.tip) * 100),
    }))
    .sort((a, b) => a.method.localeCompare(b.method));
}

function normalizeTopProductsEntries(entries) {
  return (entries || [])
    .map((entry) => ({
      name: String(entry?.name || "Sin nombre"),
      qty: safeNumber(entry?.qty),
      total: Math.round(safeNumber(entry?.total) * 100),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function equalJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function isCloseSnapshotCurrent(closeObj, liveData) {
  if (!closeObj) return false;

  const snapshotSummary = {
    subtotal: Math.round(safeNumber(closeObj.summary?.subtotal) * 100),
    tip: Math.round(safeNumber(closeObj.summary?.tip) * 100),
    total: Math.round(safeNumber(closeObj.summary?.total) * 100),
    tickets: safeNumber(closeObj.summary?.tickets),
  };

  const liveSummary = {
    subtotal: Math.round(safeNumber(liveData.summary?.subtotal) * 100),
    tip: Math.round(safeNumber(liveData.summary?.tip) * 100),
    total: Math.round(safeNumber(liveData.summary?.total) * 100),
    tickets: safeNumber(liveData.summary?.tickets),
  };

  const snapshotBreakdown = normalizeBreakdownEntries(closeObj.breakdown);
  const liveBreakdown = normalizeBreakdownEntries(liveData.breakdown);

  const snapshotTopProducts = normalizeTopProductsEntries(closeObj.topProducts);
  const liveTopProducts = normalizeTopProductsEntries(liveData.topProducts);

  return (
    equalJson(snapshotSummary, liveSummary) &&
    equalJson(snapshotBreakdown, liveBreakdown) &&
    equalJson(snapshotTopProducts, liveTopProducts)
  );
}

// Top productos vendidos del día (por total)
function computeTopProducts(dayPayments) {
  const map = new Map();
  for (const p of dayPayments) {
    for (const it of p.items || []) {
      const key = it.name || "Sin nombre";
      const cur = map.get(key) || { name: key, qty: 0, total: 0 };
      cur.qty += safeNumber(it.qty);
      cur.total += safeNumber(it.line_total);
      map.set(key, cur);
    }
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

export default function DailyReport({ onBack }) {
  const [date, setDate] = useState(todayISO());
  const [payments, setPayments] = useState([]);
  const [close, setClose] = useState(null);

  async function reload() {
    const [all, closeData] = await Promise.all([loadPayments(), loadDailyClose(date)]);
    setPayments(all);
    setClose(closeData);
  }

  useEffect(() => {
    reload();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  // pagos del día seleccionado
  const { dayPayments, probableDuplicates } = useMemo(() => {
    const filtered = filterPaymentsByDate(payments, date);
    const { uniquePayments, duplicatePayments } = splitProbableDuplicatePayments(filtered);

    return {
      dayPayments: uniquePayments,
      probableDuplicates: duplicatePayments,
    };
  }, [payments, date]);

  // resumen del día (live)
  const liveSummary = useMemo(() => {
    return dayPayments.reduce(
      (acc, p) => {
        acc.subtotal += safeNumber(p.subtotal);
        acc.tip += safeNumber(p.tipAmount);
        acc.total += safeNumber(p.totalWithTip);
        acc.tickets += 1;
        return acc;
      },
      { subtotal: 0, tip: 0, total: 0, tickets: 0 }
    );
  }, [dayPayments]);

  // breakdown por método (soporta paymentSplits y formato anterior)
  const breakdown = useMemo(() => {
    const map = new Map();
    for (const p of dayPayments) {
      const splitTotals = allocateAcrossSplits(p.paymentSplits, p.totalWithTip);
      const splitTips = allocateAcrossSplits(p.paymentSplits, p.tipAmount);

      if (splitTotals.length > 0) {
        const perMethod = new Map();

        for (const split of splitTotals) {
          const cur = perMethod.get(split.method) || { total: 0, tip: 0 };
          cur.total += split.amount;
          perMethod.set(split.method, cur);
        }

        for (const split of splitTips) {
          const cur = perMethod.get(split.method) || { total: 0, tip: 0 };
          cur.tip += split.amount;
          perMethod.set(split.method, cur);
        }

        for (const [method, values] of perMethod.entries()) {
          const cur = map.get(method) || { method, uses: 0, total: 0, tip: 0 };
          cur.uses += 1;
          cur.total += values.total;
          cur.tip += values.tip;
          map.set(method, cur);
        }
      } else {
        // formato anterior: método único
        const key = normalizeMethod(p.method);
        const cur = map.get(key) || { method: key, uses: 0, total: 0, tip: 0 };
        cur.uses += 1;
        cur.total += safeNumber(p.totalWithTip);
        cur.tip += safeNumber(p.tipAmount);
        map.set(key, cur);
      }
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [dayPayments]);

  const topProducts = useMemo(() => computeTopProducts(dayPayments), [dayPayments]);

  const liveCloseData = useMemo(
    () => ({
      dateISO: date,
      createdAt: new Date().toISOString(),
      summary: liveSummary,
      breakdown,
      topProducts,
      payments: dayPayments,
    }),
    [date, liveSummary, breakdown, topProducts, dayPayments]
  );

  // Cierre “generado” solo aplica si coincide la fecha seleccionada
  const closeForSelectedDate =
    close && (close.dateISO === date) ? close : null;

  const closeSnapshotIsCurrent = useMemo(
    () => isCloseSnapshotCurrent(closeForSelectedDate, liveCloseData),
    [closeForSelectedDate, liveCloseData]
  );

  function handlePrintClose() {
    // Usa el snapshot solo si coincide con el cálculo actual; así evitamos
    // reimprimir cierres antiguos generados con datos o lógica desactualizada.
    const data = closeForSelectedDate && closeSnapshotIsCurrent
      ? closeForSelectedDate
      : liveCloseData;

    openPrintWindow(
      ticketCierre({
        dateISO: data.dateISO,
        createdAt: data.createdAt,
        summary: data.summary,
        breakdown: data.breakdown,
        topProducts: data.topProducts,
        payments: data.payments, // para que puedas listar tickets si quieres
      }),
      "cierre"
    );
  }

  async function handleGenerateClose() {
    if (dayPayments.length === 0) {
      alert("No hay pagos registrados para esta fecha.");
      return;
    }

    if (closeForSelectedDate) {
      const ok = confirm(
        `Ya existe un cierre generado para ${date}. ¿Deseas sobreescribirlo?`
      );
      if (!ok) return;
    }

    if (!requireKey("generar el cierre diario")) return;

    const closeObj = {
      ...liveCloseData,
      createdAt: new Date().toISOString(),
    };

    await saveDailyClose(closeObj);
    await reload();
    alert(`✅ Cierre diario generado para ${date}`);
  }

  async function handleClearPayments() {
    if (!requireKey("borrar el historial de pagos")) return;

    const ok = confirm(
      "⚠️ Esto borra TODOS los pagos guardados (historial). ¿Seguro?"
    );
    if (!ok) return;

    await Promise.all([clearPayments(), deleteDailyClose()]);
    await reload();
    alert("Historial borrado ✅");
  }

  return (
    <div className="page">
      {/* ── Topbar ── */}
      <div className="topbar">
        <h1>Cierre diario</h1>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn" onClick={onBack}>Volver</button>
          <button className="btn" onClick={reload}>Recargar</button>
          <button className="btn" onClick={handleGenerateClose}>Generar cierre diario</button>
          <button className="btn" onClick={handlePrintClose}>Imprimir cierre</button>
          <button className="btn" onClick={handleClearPayments}>Borrar historial de pagos</button>
        </div>
      </div>

      {/* ── Contenido scrollable ── */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column" }}>

      {/* ── Fila: selector de fecha + estado de cierre ── */}
      <div style={{ display: "flex", gap: 12, alignItems: "stretch", marginBottom: 12, flexWrap: "wrap" }}>
        <div className="card" style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px" }}>
          <label className="label" style={{ margin: 0, whiteSpace: "nowrap" }}>Fecha</label>
          <input
            className="input"
            type="date"
            value={date}
            style={{ margin: 0 }}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        {closeForSelectedDate && closeSnapshotIsCurrent && (
          <div className="card" style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 18px", color: "var(--brown)", fontWeight: 700 }}>
            ✅ Cierre generado (snapshot) para esta fecha
          </div>
        )}
        {closeForSelectedDate && !closeSnapshotIsCurrent && (
          <div className="card" style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 18px", color: "#8a5a00", fontWeight: 700 }}>
            ⚠️ El cierre guardado quedó desactualizado. Regénéralo para guardar los totales corregidos.
          </div>
        )}
        {probableDuplicates.length > 0 && (
          <div className="card" style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 18px", color: "#8a5a00", fontWeight: 700 }}>
            ⚠️ Se excluyeron {probableDuplicates.length} pago(s) probablemente duplicados del cierre. Revísalos en Admin facturas.
          </div>
        )}
      </div>

      {/* ── Grid principal: 3 columnas ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 12,
        marginBottom: 12,
      }}>
        {/* Columna 1 — Resumen del día */}
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h3 style={{ margin: 0, fontSize: 13, textTransform: "uppercase", letterSpacing: 1, opacity: 0.55 }}>Resumen del día</h3>
          <div style={{ fontSize: 36, fontWeight: 900, lineHeight: 1, color: "var(--brown)" }}>
            ${formatCOP(liveSummary.total)}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
              <span style={{ opacity: 0.65 }}>Subtotal</span>
              <span style={{ fontWeight: 700 }}>${formatCOP(liveSummary.subtotal)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
              <span style={{ opacity: 0.65 }}>Propina</span>
              <span style={{ fontWeight: 700 }}>${formatCOP(liveSummary.tip)}</span>
            </div>
            <div style={{ height: 1, background: "var(--border)", margin: "2px 0" }} />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15 }}>
              <span style={{ opacity: 0.65 }}>Tickets</span>
              <span style={{ fontWeight: 900 }}>{liveSummary.tickets}</span>
            </div>
          </div>
        </div>

        {/* Columna 2 — Por método de pago */}
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h3 style={{ margin: 0, fontSize: 13, textTransform: "uppercase", letterSpacing: 1, opacity: 0.55 }}>Por método de pago</h3>
          {breakdown.length === 0 ? (
            <div style={{ opacity: 0.55, fontSize: 14 }}>Sin pagos para esta fecha.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {breakdown.map((b) => (
                <div key={b.method} style={{
                  background: "var(--amber2)",
                  borderRadius: 10,
                  padding: "10px 14px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                }}>
                  <div style={{ fontWeight: 900, fontSize: 15 }}>{b.method}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, opacity: 0.75 }}>
                    <span>{b.uses} uso{b.uses !== 1 ? "s" : ""}</span>
                    <span style={{ fontWeight: 700, opacity: 1 }}>${formatCOP(b.total)}</span>
                  </div>
                  {b.tip > 0 && (
                    <div style={{ fontSize: 12, opacity: 0.6 }}>Propina: ${formatCOP(b.tip)}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Columna 3 — Top productos */}
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h3 style={{ margin: 0, fontSize: 13, textTransform: "uppercase", letterSpacing: 1, opacity: 0.55 }}>Top productos</h3>
          {topProducts.length === 0 ? (
            <div style={{ opacity: 0.55, fontSize: 14 }}>Sin productos para esta fecha.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {topProducts.slice(0, 10).map((p, i) => (
                <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: "50%",
                    background: i === 0 ? "var(--amber)" : "var(--border)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 900, flexShrink: 0,
                  }}>
                    {i + 1}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                    <div style={{ fontSize: 12, opacity: 0.6 }}>{p.qty} uds</div>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 14, whiteSpace: "nowrap" }}>${formatCOP(p.total)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Detalle de pagos (ancho completo) ── */}
      <div className="card" style={{ marginBottom: 0 }}>
        <h3 style={{ margin: "0 0 12px 0", fontSize: 13, textTransform: "uppercase", letterSpacing: 1, opacity: 0.55 }}>Detalle de pagos</h3>
        {dayPayments.length === 0 ? (
          <div style={{ opacity: 0.55, fontSize: 14 }}>No hay pagos registrados en esta fecha.</div>
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 10,
          }}>
            {dayPayments.map((p) => (
              <div key={p.id} style={{
                background: "var(--panel2)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: "12px 14px",
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: 900, fontSize: 15 }}>
                      {p.tableName || `Mesa ${p.tableId}`}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.55, marginTop: 1 }}>{fmtDateTime(p.createdAt)}</div>
                  </div>
                  <div style={{
                    background: "var(--amber2)",
                    color: "var(--brown)",
                    fontWeight: 900,
                    fontSize: 13,
                    borderRadius: 8,
                    padding: "3px 9px",
                    whiteSpace: "nowrap",
                  }}>
                    {String(p.method || "N/A").toUpperCase()}
                  </div>
                </div>

                <div style={{ height: 1, background: "var(--border)" }} />

                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  {(p.items || []).map((it, idx) => (
                    <div key={(it.product_id || idx) + ""} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                      <span>{it.qty} × {it.name}</span>
                      <span style={{ fontWeight: 600 }}>${formatCOP(it.line_total)}</span>
                    </div>
                  ))}
                </div>

                <div style={{ height: 1, background: "var(--border)" }} />

                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span style={{ opacity: 0.65 }}>Subtotal</span>
                  <span>${formatCOP(p.subtotal)}</span>
                </div>
                {Number(p.tipAmount) > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                    <span style={{ opacity: 0.65 }}>Propina</span>
                    <span>${formatCOP(p.tipAmount)}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 900, fontSize: 15 }}>
                  <span>Total</span>
                  <span>${formatCOP(p.totalWithTip)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      </div>{/* fin contenido scrollable */}
    </div>
  );
}

