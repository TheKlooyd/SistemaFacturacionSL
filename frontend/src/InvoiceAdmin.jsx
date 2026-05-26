import { useEffect, useMemo, useState } from "react";
import { loadPayments, updatePayment, deletePayment } from "./paymentsStore";
import { loadProducts } from "./productsStore";

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

export default function InvoiceAdmin({ onBack }) {
  const [date, setDate] = useState(todayISO());
  const [payments, setPayments] = useState([]);
  const [products, setProducts] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editItems, setEditItems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [productSearch, setProductSearch] = useState("");

  async function reload() {
    const all = await loadPayments();
    setPayments(all);
  }

  useEffect(() => {
    reload();
    loadProducts().then(setProducts);
  }, []);

  const dayPayments = useMemo(
    () =>
      payments.filter(
        (p) => p.createdAt && localDateFrom(p.createdAt) === date
      ),
    [payments, date]
  );

  function startEdit(payment) {
    setEditingId(payment.id);
    setEditItems((payment.items || []).map((it) => ({ ...it })));
    setShowAddProduct(false);
    setProductSearch("");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditItems([]);
    setShowAddProduct(false);
    setProductSearch("");
  }

  function changeQty(idx, delta) {
    setEditItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const newQty = Math.max(1, (it.qty || 1) + delta);
        return { ...it, qty: newQty, line_total: (it.unit_price || 0) * newQty };
      })
    );
  }

  function removeItem(idx) {
    setEditItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function addProductToEdit(product) {
    setEditItems((prev) => {
      const existing = prev.findIndex((it) => it.product_id === product.id);
      if (existing >= 0) {
        return prev.map((it, i) => {
          if (i !== existing) return it;
          const newQty = it.qty + 1;
          return { ...it, qty: newQty, line_total: it.unit_price * newQty };
        });
      }
      return [
        ...prev,
        {
          product_id: product.id,
          name: product.name,
          unit_price: product.price,
          qty: 1,
          line_total: product.price,
        },
      ];
    });
    setShowAddProduct(false);
    setProductSearch("");
  }

  const editSubtotal = useMemo(
    () => editItems.reduce((s, it) => s + (it.line_total || 0), 0),
    [editItems]
  );

  async function handleSave(payment) {
    if (editItems.length === 0) {
      alert("La factura debe tener al menos un producto.");
      return;
    }
    setSaving(true);
    const newTotalWithTip = editSubtotal + (payment.tipAmount || 0);
    await updatePayment(payment.id, {
      items: editItems,
      subtotal: editSubtotal,
      total_with_tip: newTotalWithTip,
    });
    await reload();
    setSaving(false);
    setEditingId(null);
    setEditItems([]);
  }

  async function handleDelete(payment) {
    if (!requireKey("eliminar esta factura")) return;
    await deletePayment(payment.id);
    await reload();
    if (editingId === payment.id) {
      setEditingId(null);
      setEditItems([]);
    }
  }

  const filteredProducts = useMemo(
    () =>
      products.filter((p) =>
        p.name.toLowerCase().includes(productSearch.toLowerCase())
      ),
    [products, productSearch]
  );

  const selectedPayment = useMemo(
    () => payments.find((p) => p.id === editingId) || null,
    [payments, editingId]
  );

  return (
    <div className="page">
      {/* ── Topbar ── */}
      <header className="topbar">
        <h2 style={{ margin: 0, fontSize: "clamp(18px, 2vw, 26px)", fontWeight: 800 }}>
          Administrador de Facturas
        </h2>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ fontWeight: 700, color: "var(--muted)" }}>Fecha:</label>
          <input
            type="date"
            value={date}
            onChange={(e) => { setDate(e.target.value); cancelEdit(); }}
            className="input"
            style={{ width: "auto" }}
          />
          <button className="btn" onClick={onBack}>← Volver</button>
        </div>
      </header>

      {/* ── Dos paneles ── */}
      <div style={{ flex: 1, display: "flex", gap: 16, minHeight: 0 }}>

        {/* ─ Panel izquierdo: lista ─ */}
        <div
          style={{
            width: 300,
            flexShrink: 0,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {dayPayments.length === 0 && (
            <p style={{ color: "var(--muted)", padding: "16px 4px", fontSize: 14 }}>
              No hay facturas para {date}.
            </p>
          )}

          {dayPayments.map((payment) => {
            const isSelected = editingId === payment.id;
            const label = payment.isDelivery
              ? `🛵 ${payment.deliveryClient?.name || "Delivery"}`
              : `🍽️ ${payment.tableName || `Mesa ${payment.tableId}`}`;
            const methodLabel = payment.paymentSplits?.length > 1
              ? payment.paymentSplits.map((s) => s.method).join(" + ")
              : (payment.method || "—");

            return (
              <button
                key={payment.id}
                onClick={() => isSelected ? cancelEdit() : startEdit(payment)}
                style={{
                  textAlign: "left",
                  background: isSelected
                    ? "var(--amber2)"
                    : "rgba(255,255,255,.82)",
                  border: isSelected
                    ? "2px solid var(--amber)"
                    : "1px solid var(--border)",
                  borderRadius: 16,
                  padding: "14px 16px",
                  cursor: "pointer",
                  transition: "all .15s ease",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                <span style={{ fontWeight: 800, fontSize: 15 }}>{label}</span>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>
                  {fmtDateTime(payment.createdAt)}
                </span>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 13 }}>
                  <span style={{ color: "var(--muted)" }}>
                    {(payment.items || []).length} producto(s)
                  </span>
                  <span style={{ fontWeight: 800 }}>
                    ${formatCOP(payment.totalWithTip)}
                  </span>
                </div>
                <span style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--brown)",
                  background: "var(--brown2)",
                  borderRadius: 8,
                  padding: "2px 7px",
                  alignSelf: "flex-start",
                  marginTop: 2,
                }}>
                  {methodLabel}
                </span>
              </button>
            );
          })}
        </div>

        {/* ─ Panel derecho: detalle / edición ─ */}
        <div style={{ flex: 1, minWidth: 0, overflowY: "auto" }}>
          {!selectedPayment && (
            <div style={{
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--muted)",
              fontSize: 15,
              flexDirection: "column",
              gap: 8,
            }}>
              <span style={{ fontSize: 40 }}>📄</span>
              <span>Selecciona una factura para ver el detalle</span>
            </div>
          )}

          {selectedPayment && (() => {
            const payment = selectedPayment;
            const label = payment.isDelivery
              ? `Delivery — ${payment.deliveryClient?.name || "Sin nombre"}`
              : payment.tableName || `Mesa ${payment.tableId}`;
            const methodLabel = payment.paymentSplits?.length > 1
              ? payment.paymentSplits.map((s) => s.method).join(" + ")
              : (payment.method || "—");

            return (
              <div className="card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>

                {/* Encabezado del detalle */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 900, fontSize: 20 }}>{label}</div>
                    <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 2 }}>
                      {fmtDateTime(payment.createdAt)}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      className="btnPrimary"
                      onClick={() => handleSave(payment)}
                      disabled={saving}
                    >
                      {saving ? "Guardando..." : "💾 Guardar cambios"}
                    </button>
                    <button
                      className="btnDanger"
                      onClick={() => handleDelete(payment)}
                      disabled={saving}
                    >
                      🗑️ Eliminar factura
                    </button>
                    <button className="btn" onClick={cancelEdit} disabled={saving}>
                      Cancelar
                    </button>
                  </div>
                </div>

                {/* Ítems editables */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto auto auto auto",
                    gap: "6px 12px",
                    padding: "0 4px 8px",
                    borderBottom: "2px solid var(--border)",
                    color: "var(--muted)",
                    fontSize: 12,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: ".5px",
                  }}>
                    <span>Producto</span>
                    <span style={{ textAlign: "right" }}>Precio</span>
                    <span style={{ textAlign: "center" }}>Cantidad</span>
                    <span style={{ textAlign: "right" }}>Total</span>
                    <span />
                  </div>

                  {editItems.length === 0 && (
                    <p style={{ color: "var(--muted)", fontSize: 14, padding: "8px 4px" }}>
                      Sin productos. Agrega al menos uno.
                    </p>
                  )}

                  {editItems.map((it, i) => (
                    <div
                      key={i}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr auto auto auto auto",
                        gap: "6px 12px",
                        alignItems: "center",
                        padding: "10px 12px",
                        background: "rgba(0,0,0,.035)",
                        borderRadius: 12,
                      }}
                    >
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{it.name}</span>
                      <span style={{ color: "var(--muted)", fontSize: 13, textAlign: "right", whiteSpace: "nowrap" }}>
                        ${formatCOP(it.unit_price)}
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <button
                          className="btn"
                          style={{ padding: "3px 10px", fontSize: 16, lineHeight: 1 }}
                          onClick={() => changeQty(i, -1)}
                        >−</button>
                        <span style={{ minWidth: 24, textAlign: "center", fontWeight: 800 }}>{it.qty}</span>
                        <button
                          className="btn"
                          style={{ padding: "3px 10px", fontSize: 16, lineHeight: 1 }}
                          onClick={() => changeQty(i, 1)}
                        >+</button>
                      </div>
                      <span style={{ fontWeight: 800, textAlign: "right", whiteSpace: "nowrap" }}>
                        ${formatCOP(it.line_total)}
                      </span>
                      <button
                        className="btnDanger"
                        style={{ padding: "4px 10px", fontSize: 13 }}
                        onClick={() => removeItem(i)}
                      >✕</button>
                    </div>
                  ))}
                </div>

                {/* Agregar producto */}
                {!showAddProduct ? (
                  <button
                    className="btn"
                    style={{ alignSelf: "flex-start" }}
                    onClick={() => setShowAddProduct(true)}
                  >
                    + Agregar producto
                  </button>
                ) : (
                  <div style={{
                    background: "var(--panel2)",
                    border: "1px solid var(--border)",
                    borderRadius: 16,
                    padding: 16,
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}>
                    <input
                      type="text"
                      placeholder="Buscar producto..."
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      className="input"
                      autoFocus
                    />
                    <div style={{ maxHeight: 220, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
                      {filteredProducts.map((p) => (
                        <button
                          key={p.id}
                          className="btn"
                          style={{ display: "flex", justifyContent: "space-between", gap: 12, textAlign: "left" }}
                          onClick={() => addProductToEdit(p)}
                        >
                          <span>{p.name}</span>
                          <span style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>${formatCOP(p.price)}</span>
                        </button>
                      ))}
                      {filteredProducts.length === 0 && (
                        <p style={{ color: "var(--muted)", fontSize: 14 }}>Sin resultados.</p>
                      )}
                    </div>
                    <button className="btn" style={{ alignSelf: "flex-start" }} onClick={() => { setShowAddProduct(false); setProductSearch(""); }}>
                      Cancelar
                    </button>
                  </div>
                )}

                {/* Totales */}
                <div style={{
                  background: "rgba(0,0,0,.035)",
                  borderRadius: 14,
                  padding: "14px 18px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  alignSelf: "flex-end",
                  minWidth: 240,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "var(--muted)" }}>
                    <span>Subtotal</span>
                    <strong style={{ color: "var(--text)" }}>${formatCOP(editSubtotal)}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "var(--muted)" }}>
                    <span>Propina</span>
                    <strong style={{ color: "var(--text)" }}>${formatCOP(payment.tipAmount)}</strong>
                  </div>
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 18,
                    fontWeight: 900,
                    borderTop: "1px solid var(--border)",
                    paddingTop: 8,
                    marginTop: 2,
                  }}>
                    <span>Total</span>
                    <span>${formatCOP(editSubtotal + (payment.tipAmount || 0))}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                    Método de pago: <strong style={{ color: "var(--text)" }}>{methodLabel}</strong>
                  </div>
                </div>

              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
