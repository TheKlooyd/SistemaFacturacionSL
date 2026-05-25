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

// Top productos vendidos del día (por total)
function computeTopProducts(dayPayments) {
  const map = new Map();
  for (const p of dayPayments) {
    for (const it of p.items || []) {
      const key = it.name || "Sin nombre";
      const cur = map.get(key) || { name: key, qty: 0, total: 0 };
      cur.qty += Number(it.qty || 0);
      cur.total += Number(it.line_total || 0);
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
  const dayPayments = useMemo(
    () => filterPaymentsByDate(payments, date),
    [payments, date]
  );

  // resumen del día (live)
  const liveSummary = useMemo(() => {
    return dayPayments.reduce(
      (acc, p) => {
        acc.subtotal += Number(p.subtotal || 0);
        acc.tip += Number(p.tipAmount || 0);
        acc.total += Number(p.totalWithTip || 0);
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
      if (p.paymentSplits && p.paymentSplits.length > 0) {
        // nuevo formato: dividir por splits
        for (const s of p.paymentSplits) {
          const key = String(s.method || "N/A").toUpperCase();
          const cur = map.get(key) || { method: key, tickets: 0, total: 0, tip: 0 };
          cur.tickets += 1;
          cur.total += Number(s.amount || 0);
          map.set(key, cur);
        }
      } else {
        // formato anterior: método único
        const key = String(p.method || "N/A").toUpperCase();
        const cur = map.get(key) || { method: key, tickets: 0, total: 0, tip: 0 };
        cur.tickets += 1;
        cur.total += Number(p.totalWithTip || 0);
        cur.tip += Number(p.tipAmount || 0);
        map.set(key, cur);
      }
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [dayPayments]);

  const topProducts = useMemo(() => computeTopProducts(dayPayments), [dayPayments]);

  // Cierre “generado” solo aplica si coincide la fecha seleccionada
  const closeForSelectedDate =
    close && (close.dateISO === date) ? close : null;

  function handlePrintClose() {
    // imprime el cierre de la fecha seleccionada:
    // si hay snapshot generado lo usa, sino imprime “live”
    const data = closeForSelectedDate || {
      dateISO: date,
      createdAt: new Date().toISOString(),
      summary: liveSummary,
      breakdown,
      topProducts,
      payments: dayPayments,
    };

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
      dateISO: date,
      createdAt: new Date().toISOString(),
      summary: liveSummary,
      breakdown,
      topProducts,
      payments: dayPayments,
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
      <div className="topbar">
        <h1>Cierre diario</h1>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn" onClick={onBack}>Volver</button>
          <button className="btn" onClick={reload}>Recargar</button>



          <button className="btn" onClick={handleGenerateClose}>
            Generar cierre diario
          </button>

          <button className="btn" onClick={handlePrintClose}>
            Imprimir cierre
          </button>



          <button className="btn" onClick={handleClearPayments}>
            Borrar historial de pagos
          </button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <label className="label">Fecha</label>
        <input
          className="input"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />

        <div style={{ marginTop: 18 }}>
          <h2 style={{ marginBottom: 8 }}>Total del día</h2>
          <div style={{ fontSize: 26, fontWeight: 900 }}>
            ${formatCOP(liveSummary.total)}
          </div>

          <div style={{ marginTop: 8, opacity: 0.8 }}>
            Subtotal: ${formatCOP(liveSummary.subtotal)} · Propina: ${formatCOP(liveSummary.tip)} · Tickets: {liveSummary.tickets}
          </div>

          {closeForSelectedDate && (
            <div style={{ marginTop: 10, opacity: 0.9 }}>
              ✅ Hay un cierre generado (snapshot) para esta fecha.
            </div>
          )}
        </div>

        <div style={{ marginTop: 18 }}>
          <h3 style={{ marginBottom: 10 }}>Por método</h3>
          {breakdown.length === 0 ? (
            <div style={{ opacity: 0.75 }}>No hay pagos en esta fecha.</div>
          ) : (
            <div className="list">
              {breakdown.map((b) => (
                <div className="listItem" key={b.method}>
                  <div style={{ fontWeight: 800 }}>{b.method}</div>
                  <div>
                    {b.tickets} tickets — ${formatCOP(b.total)} (propina: ${formatCOP(b.tip)})
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <h2 style={{ marginBottom: 10 }}>Productos vendidos (Top)</h2>

        {topProducts.length === 0 ? (
          <div style={{ opacity: 0.75 }}>No hay productos vendidos en esta fecha.</div>
        ) : (
          <div className="list">
            {topProducts.slice(0, 30).map((p) => (
              <div className="listItem" key={p.name}>
                <div style={{ fontWeight: 800 }}>{p.name}</div>
                <div>
                  {p.qty} uds — ${formatCOP(p.total)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <h2 style={{ marginBottom: 10 }}>Detalle de pagos</h2>

        {dayPayments.length === 0 ? (
          <div style={{ opacity: 0.75 }}>No hay pagos registrados en esta fecha.</div>
        ) : (
          <div className="list">
            {dayPayments.map((p) => (
              <div className="listItem" key={p.id} style={{ alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 900 }}>
                    {p.tableName || `Mesa ${p.tableId}`} — {String(p.method || "N/A").toUpperCase()}
                  </div>

                  <div style={{ opacity: 0.75, fontSize: 12 }}>
                    {fmtDateTime(p.createdAt)}
                  </div>

                  <div style={{ marginTop: 6 }}>
                    Subtotal: ${formatCOP(p.subtotal)} · Propina: ${formatCOP(p.tipAmount)} ·{" "}
                    <b>Total: ${formatCOP(p.totalWithTip)}</b>
                  </div>

                  <div style={{ marginTop: 10, opacity: 0.95 }}>
                    {(p.items || []).map((it, idx) => (
                      <div key={(it.product_id || idx) + ""} style={{ fontSize: 13 }}>
                        {it.qty} × {it.name} — ${formatCOP(it.line_total)}
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ fontWeight: 900, whiteSpace: "nowrap" }}>
                  ${formatCOP(p.totalWithTip)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

