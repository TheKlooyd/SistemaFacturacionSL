import { useEffect, useMemo, useState } from "react";
import { loadProducts } from "./productsStore";
import { loadCategories } from "./categoriesStore";
import { clearOrder, getOpenOrder, setOpenOrder } from "./ordersStore";
import { loadClients } from "./clientsStore";
import PayModal from "./PayModal";
import { addPayment } from "./paymentsStore";
import { openPrintWindow } from "./print";
import { ticketComanda, ticketFactura, ticketCuenta } from "./printTemplates";

function formatCOP(value) {
  return new Intl.NumberFormat("es-CO").format(value || 0);
}

// Display qty as fraction when decimal (0.5 → "½", 1.5 → "1½")
function fmtQty(qty) {
  if (qty === 0.5) return "½";
  if (qty % 1 === 0.5) return Math.floor(qty) + "½";
  return String(qty);
}

// Extrae "(Personal)" "(Mediana)" "(Grande)" "(Extragrande)" "(Porción)" al final del nombre
function extractSizeFromName(name = "") {
  const m = /\(([^)]+)\)\s*$/.exec(String(name));
  return m ? m[1].trim() : null;
}

function normalizeSize(raw) {
  const s = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");

  if (!s) return null;
  if (s.includes("porc")) return "PORCIÓN";
  if (s.includes("personal")) return "PERSONAL";
  if (s.includes("mediana")) return "MEDIANA";
  if (s.includes("grande") && !s.includes("extra")) return "GRANDE";
  if (s.includes("extragrande") || s.includes("extra") || s.includes("xgrande"))
    return "EXTRAGRANDE";

  return null;
}

function sizeLabel(s) {
  if (s === "PORCIÓN") return "Porciones";
  if (s === "PERSONAL") return "Personales";
  if (s === "MEDIANA") return "Medianas";
  if (s === "GRANDE") return "Grandes";
  if (s === "EXTRAGRANDE") return "Extra grandes";
  return s;
}

export default function TableOrder({ table, onBack, onPaid }) {
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedCatId, setSelectedCatId] = useState("");

  const [catQuery, setCatQuery] = useState("");

  // Subcategoría (tamaño) SOLO para pizzas
  const [pizzaSize, setPizzaSize] = useState("ALL"); // ALL | PORCIÓN | PERSONAL | ...

  const [order, setOrder] = useState({ items: [], status: "OPEN" });

  const [payOpen, setPayOpen] = useState(false);
  const [billOpen, setBillOpen] = useState(false);

  // Notas por producto
  const [noteModalId, setNoteModalId] = useState(null);
  const [noteText, setNoteText] = useState("");

  function openNoteModal(it) {
    setNoteModalId(it.product_id);
    setNoteText(it.note || "");
  }

  function saveNote() {
    if (noteModalId == null) return;
    const nextItems = order.items.map((x) =>
      x.product_id === noteModalId ? { ...x, note: noteText.trim() } : x
    );
    persist({ ...order, items: nextItems });
    setNoteModalId(null);
    setNoteText("");
  }

  // Delivery
  const [isDelivery, setIsDelivery] = useState(false);
  const [clients, setClients] = useState([]);
  const [clientQuery, setClientQuery] = useState("");
  const [selectedClient, setSelectedClient] = useState(null);

  function persist(next) {
    setOrder(next);
    setOpenOrder(String(table.id), next).catch(console.error);
  }

  function persistDelivery(delivery, client) {
    setOpenOrder(String(table.id), {
      ...order,
      isDelivery: delivery,
      deliveryClient: client,
    }).catch(console.error);
  }

  function toggleDelivery() {
    const next = !isDelivery;
    setIsDelivery(next);
    if (!next) {
      setSelectedClient(null);
      setClientQuery("");
      persistDelivery(false, null);
    } else {
      persistDelivery(true, selectedClient);
    }
  }

  function selectClient(c) {
    setSelectedClient(c);
    setClientQuery("");
    persistDelivery(true, c);
  }

  function clearClient() {
    setSelectedClient(null);
    setClientQuery("");
    persistDelivery(true, null);
  }

  function handleSelectCategory(categoryId) {
    setSelectedCatId(categoryId);
    setPizzaSize("ALL");
  }

  function handleCategoryQueryChange(value) {
    setCatQuery(value);

    const q = value.trim().toLowerCase();
    const nextFiltered = !q
      ? categories
      : categories.filter((c) => (c.name || "").toLowerCase().includes(q));

    if (!nextFiltered.length) return;

    const stillVisible = nextFiltered.some((c) => c.id === selectedCatId);
    if (!stillVisible) {
      setSelectedCatId(nextFiltered[0].id);
      setPizzaSize("ALL");
    }
  }

  useEffect(() => {
    (async () => {
      const [cats, prods, loadedClients, savedOrder] = await Promise.all([
        loadCategories(),
        loadProducts(),
        loadClients(),
        getOpenOrder(String(table.id)),
      ]);
      setCategories(cats);
      setProducts(prods);
      if (cats.length) setSelectedCatId(cats[0].id);
      setClients(loadedClients);
      if (savedOrder) {
        setOrder(savedOrder);
        setIsDelivery(savedOrder.isDelivery || false);
        setSelectedClient(savedOrder.deliveryClient || null);
      }
    })();
  }, [table.id]);

  const filteredClients = useMemo(() => {
    const q = clientQuery.trim().toLowerCase();
    if (!q) return [];
    return clients.filter(
      (c) =>
        (c.name || "").toLowerCase().includes(q) ||
        (c.phone || "").includes(q)
    ).slice(0, 8);
  }, [clients, clientQuery]);

  const selectedCat = useMemo(() => {
    return categories.find((c) => c.id === selectedCatId) || null;
  }, [categories, selectedCatId]);

  const isPizzaCategory = useMemo(() => {
    return (selectedCat?.name || "").toLowerCase().includes("pizza");
  }, [selectedCat]);

  const filteredCategories = useMemo(() => {
    const q = catQuery.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) => (c.name || "").toLowerCase().includes(q));
  }, [categories, catQuery]);

  // Tamaños disponibles dentro de esa categoría de pizza (según los productos)
  const pizzaSizesAvailable = useMemo(() => {
    if (!isPizzaCategory) return [];
    const inCat = products.filter((p) => p.category_id === selectedCatId);

    const set = new Set();
    for (const p of inCat) {
      // si algún día guardas p.size, lo soporta también:
      const raw = p.size ?? extractSizeFromName(p.name);
      const norm = normalizeSize(raw);
      if (norm) set.add(norm);
    }

    const order = ["PORCIÓN", "PERSONAL", "MEDIANA", "GRANDE", "EXTRAGRANDE"];
    return order.filter((x) => set.has(x));
  }, [isPizzaCategory, products, selectedCatId]);

  function requireKey() {
    const key = prompt("Ingresa la clave de seguridad para eliminar productos:");
    if (key !== "1207") {
      alert("Clave incorrecta. Acción cancelada.");
      return false;
    }
    return true;
  }

  function addProduct(p, increment = 1) {
    const existing = order.items.find((x) => x.product_id === p.id);
    let nextItems;

    if (existing) {
      nextItems = order.items.map((x) =>
        x.product_id === p.id ? { ...x, qty: x.qty + increment } : x
      );
    } else {
      nextItems = [
        ...order.items,
        { product_id: p.id, name: p.name, unit_price: p.price, qty: increment },
      ];
    }

    persist({ ...order, items: nextItems });
  }

  function addHalf(p) {
    addProduct(p, 0.5);
  }

  function changeQty(product_id, delta) {
    const current = order.items.find((x) => x.product_id === product_id);
    if (!current) return;

    const willDelete = delta < 0 && current.qty + delta <= 0;
    if (willDelete) {
      if (!requireKey()) return;
    }

    const nextItems = order.items
      .map((x) =>
        x.product_id === product_id ? { ...x, qty: x.qty + delta } : x
      )
      .filter((x) => x.qty > 0);

    persist({ ...order, items: nextItems });
  }

  const total = useMemo(() => {
    return order.items.reduce((acc, it) => acc + it.unit_price * it.qty, 0);
  }, [order.items]);

  const tipSuggested = Math.round(total * 0.1);
  const totalWithTip = total + tipSuggested;

  const filteredProducts = useMemo(() => {
    let list = products.filter((p) => p.category_id === selectedCatId);

    // Subfiltro por tamaño solo para pizzas
    if (isPizzaCategory && pizzaSize !== "ALL") {
      list = list.filter((p) => {
        const raw = p.size ?? extractSizeFromName(p.name);
        return normalizeSize(raw) === pizzaSize;
      });
    }

    // Ordenar alfabéticamente para que sea más fácil buscar
    list = [...list].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    return list;
  }, [products, selectedCatId, isPizzaCategory, pizzaSize]);

  function openPay() {
    if (order.items.length === 0) return alert("No hay productos en la cuenta.");
    setPayOpen(true);
  }

  async function confirmPay({ paymentSplits, method, tipAmount, discountAmount, paidAmount, totalWithTip }) {
    await addPayment({
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      tableId: table.id,
      tableName: table.name,
      isDelivery,
      deliveryClient: isDelivery ? selectedClient : null,
      method,
      paymentSplits,
      subtotal: total,
      tipAmount,
      discountAmount: discountAmount || 0,
      totalWithTip,
      paidAmount,
      items: order.items.map((it) => ({
        product_id: it.product_id,
        name: it.name,
        unit_price: it.unit_price,
        qty: it.qty,
        line_total: it.unit_price * it.qty,
      })),
    });

    openPrintWindow(
      ticketFactura({
        businessName: "SABOR LATINO",
        tableName: isDelivery ? "DELIVERY" : table.name,
        createdAt: new Date().toISOString(),
        isDelivery,
        deliveryClient: isDelivery ? selectedClient : null,
        items: order.items.map((it) => ({
          name: it.name,
          unit_price: it.unit_price,
          qty: it.qty,
          note: it.note || "",
        })),
        subtotal: total,
        tipAmount,
        discountAmount: discountAmount || 0,
        totalWithTip,
        method,
        paymentSplits,
        paidAmount,
      }),
      "factura"
    );

    setPayOpen(false);
    await clearOrder(String(table.id));
    setOrder({ items: [], status: "OPEN" });
    setIsDelivery(false);
    setSelectedClient(null);
    await onPaid?.();
  }

  return (
    <div className="page">
      <div className="topbar">
        <h1>{table.name} — Cuenta</h1>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            className="btn"
            onClick={() => {
              if (!order.items?.length) return alert("No hay productos para imprimir.");

              openPrintWindow(
                ticketComanda({
                  tableName: table.name,
                  createdAt: new Date().toISOString(),
                  items: order.items.map((i) => ({ qty: i.qty, name: i.name, note: i.note || "" })),
                }),
                "comanda"
              );
            }}
          >
            Imprimir comanda
          </button>

          <button
            className={isDelivery ? "btnPrimary" : "btn"}
            onClick={toggleDelivery}
            title={isDelivery ? "Desactivar modo delivery" : "Activar modo delivery"}
          >
            🛵 {isDelivery ? "Delivery ON" : "Delivery"}
          </button>

          <button className="btn" onClick={onBack}>Volver</button>

          <button className="btnPrimary" onClick={openPay}>Pagar</button>
        </div>
      </div>

      <div className="threeCols">
        {/* CATEGORÍAS */}
        <aside className="sidebar card">
          <h2 style={{ marginTop: 0 }}>Categorías</h2>

          <input
            className="input"
            placeholder="Buscar categoría..."
            value={catQuery}
            onChange={(e) => handleCategoryQueryChange(e.target.value)}
            style={{ marginTop: 10, marginBottom: 10 }}
          />

          <div className="catList">
            {filteredCategories.map((c) => {
              const active = c.id === selectedCatId;
              return (
                <button
                  key={c.id}
                  className={`catBtn ${active ? "active" : ""}`}
                  onClick={() => handleSelectCategory(c.id)}
                >
                  {c.name}
                </button>
              );
            })}
          </div>
        </aside>

        {/* PRODUCTOS */}
        <section className="card productsCard">
          <h2 style={{ marginTop: 0 }}>Productos</h2>

          {/* Subcategorías SOLO para pizzas */}
          {isPizzaCategory && (
            <div className="pizzaSizes">
              <button
                className={`chip ${pizzaSize === "ALL" ? "active" : ""}`}
                onClick={() => setPizzaSize("ALL")}
              >
                Todos
              </button>

              {pizzaSizesAvailable.map((s) => (
                <button
                  key={s}
                  className={`chip ${pizzaSize === s ? "active" : ""}`}
                  onClick={() => setPizzaSize(s)}
                >
                  {sizeLabel(s)}
                </button>
              ))}
            </div>
          )}

          <div className="productsScroll">
            {filteredProducts.length === 0 ? (
              <p style={{ opacity: 0.7 }}>
                No hay productos en esta categoría{isPizzaCategory && pizzaSize !== "ALL" ? ` (${sizeLabel(pizzaSize)})` : ""}.
              </p>
            ) : (
              <div className="productsGrid">
                {filteredProducts.map((p) => {
                  const isHalfable =
                    isPizzaCategory &&
                    normalizeSize(p.size ?? extractSizeFromName(p.name)) !== "PORCIÓN";
                  return (
                    <div key={p.id} className="listItem">
                      <div>
                        <div style={{ fontWeight: 900 }}>{p.name}</div>
                        <div style={{ opacity: 0.8 }}>${formatCOP(p.price)}</div>
                      </div>

                      <div style={{ display: "flex", gap: 6 }}>
                        {isHalfable && (
                          <button
                            className="btn"
                            style={{ fontSize: "0.85em", padding: "4px 10px" }}
                            onClick={() => addHalf(p)}
                            title="Agregar media pizza"
                          >
                            ½ Mitad
                          </button>
                        )}
                        <button className="btnPrimary" onClick={() => addProduct(p)}>
                          + Agregar
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* CLIENTE DELIVERY */}
        {isDelivery && (
          <section className="card" style={{ gridColumn: "1 / -1" }}>
            <h2 style={{ marginTop: 0 }}>🛵 Cliente Delivery</h2>

            {selectedClient ? (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 16 }}>{selectedClient.name}</div>
                  <div style={{ opacity: 0.8, fontSize: 13 }}>📞 {selectedClient.phone}</div>
                  <div style={{ opacity: 0.8, fontSize: 13 }}>📍 {selectedClient.address}</div>
                </div>
                <button className="btn" onClick={clearClient}>Cambiar cliente</button>
              </div>
            ) : (
              <div>
                <input
                  className="input"
                  placeholder="Buscar cliente por nombre o teléfono..."
                  value={clientQuery}
                  onChange={(e) => setClientQuery(e.target.value)}
                  style={{ marginBottom: 8 }}
                />
                {filteredClients.length > 0 && (
                  <div className="list" style={{ maxHeight: 200, overflowY: "auto" }}>
                    {filteredClients.map((c) => (
                      <div
                        key={c.id}
                        className="listItem"
                        style={{ cursor: "pointer" }}
                        onClick={() => selectClient(c)}
                      >
                        <div>
                          <div style={{ fontWeight: 900 }}>{c.name}</div>
                          <div style={{ opacity: 0.7, fontSize: 13 }}>📞 {c.phone} — 📍 {c.address}</div>
                        </div>
                        <button className="btnPrimary" onClick={(e) => { e.stopPropagation(); selectClient(c); }}>Seleccionar</button>
                      </div>
                    ))}
                  </div>
                )}
                {clientQuery.trim() && filteredClients.length === 0 && (
                  <div style={{ opacity: 0.7, fontSize: 13 }}>No se encontraron clientes. Regístralos en "Admin clientes".</div>
                )}
              </div>
            )}
          </section>
        )}

        {/* CUENTA */}
        <section className="card" style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <h2 style={{ marginTop: 0, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            Cuenta
            {order.items.length > 0 && (
              <button
                className="btnPrimary"
                style={{ fontSize: 13, padding: "6px 14px" }}
                onClick={() => setBillOpen(true)}
              >
                Sacar cuenta
              </button>
            )}
          </h2>

          {order.items.length === 0 ? (
            <p style={{ opacity: 0.8 }}>No hay productos aún.</p>
          ) : (
            <div className="orderLines">
              {order.items.map((it) => (
                <div key={it.product_id} className="orderLine" style={{ flexDirection: "column", alignItems: "stretch", gap: 4 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 900 }}>{it.name}</div>
                      <div style={{ opacity: 0.8 }}>${formatCOP(it.unit_price)} c/u</div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <button className="btn" onClick={() => changeQty(it.product_id, -1)}>–</button>

                      <div style={{ minWidth: 24, textAlign: "center", fontWeight: 900 }}>
                        {fmtQty(it.qty)}
                      </div>

                      <button className="btn" onClick={() => changeQty(it.product_id, +1)}>+</button>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button
                      className="btn"
                      style={{ fontSize: 12, padding: "2px 10px" }}
                      onClick={() => openNoteModal(it)}
                    >
                      {it.note ? "✏️ Editar nota" : "📝 Añadir nota"}
                    </button>
                    {it.note && (
                      <span style={{ fontSize: 12, opacity: 0.75, fontStyle: "italic" }}>"{it.note}"</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div
            style={{
              marginTop: 16,
              fontWeight: 900,
              fontSize: 20,
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <span>Total</span>
            <span>${formatCOP(total)}</span>
          </div>

          <div style={{ marginTop: 8, opacity: 0.7 }}>
            Nota: Para eliminar el último item pide clave 1207.
          </div>
        </section>
      </div>

      {/* Modal de nota */}
      {noteModalId != null && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999,
          }}
          onClick={() => setNoteModalId(null)}
        >
          <div
            style={{
              background: "#fff", borderRadius: 12, padding: 24, width: 340,
              boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>Nota del producto</h3>
            <div style={{ opacity: 0.7, fontSize: 13, marginBottom: 8 }}>
              {order.items.find((x) => x.product_id === noteModalId)?.name}
            </div>
            <textarea
              autoFocus
              className="input"
              rows={3}
              style={{ width: "100%", resize: "vertical", boxSizing: "border-box" }}
              placeholder="Ej: sin piña, término medio, extra salsa..."
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveNote(); } }}
            />
            <div style={{ display: "flex", gap: 10, marginTop: 12, justifyContent: "flex-end" }}>
              <button className="btn" onClick={() => setNoteModalId(null)}>Cancelar</button>
              {noteText.trim() === "" && order.items.find((x) => x.product_id === noteModalId)?.note && (
                <button
                  className="btn"
                  style={{ color: "#c0392b" }}
                  onClick={() => {
                    const nextItems = order.items.map((x) =>
                      x.product_id === noteModalId ? { ...x, note: "" } : x
                    );
                    persist({ ...order, items: nextItems });
                    setNoteModalId(null);
                    setNoteText("");
                  }}
                >
                  Quitar nota
                </button>
              )}
              <button className="btnPrimary" onClick={saveNote}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {payOpen && (
        <PayModal
          total={total}
          defaultTipPercent={10}
          onCancel={() => setPayOpen(false)}
          onConfirm={confirmPay}
        />
      )}

      {/* Modal Sacar Cuenta */}
      {billOpen && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999,
          }}
          onClick={() => setBillOpen(false)}
        >
          <div
            style={{
              background: "#fff", borderRadius: 14, padding: 28, width: 380,
              maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto",
              boxShadow: "0 8px 40px rgba(0,0,0,0.3)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Encabezado restaurante */}
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <div style={{ fontWeight: 900, fontSize: 24, letterSpacing: 0.5, textTransform: "uppercase" }}>
                Sabor Latino
              </div>
              <div style={{ fontSize: 14, color: "#555", marginTop: 6 }}>Nequi: 317 231 6964</div>
              <div style={{ fontSize: 14, color: "#555", marginTop: 2 }}>
                {isDelivery ? "🛵 DELIVERY" : table.name}
              </div>
            </div>

            <hr style={{ borderTop: "1px dashed #bbb", margin: "12px 0" }} />

            {/* Productos */}
            <div style={{ marginBottom: 4 }}>
              {order.items.map((it) => {
                const lineTotal = it.unit_price * it.qty;
                return (
                  <div key={it.product_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{fmtQty(it.qty)} x {it.name}</div>
                      <div style={{ fontSize: 12, color: "#888" }}>${formatCOP(it.unit_price)} c/u</div>
                      {it.note && (
                        <div style={{ fontSize: 12, color: "#888", fontStyle: "italic" }}>↳ {it.note}</div>
                      )}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 15, whiteSpace: "nowrap", marginLeft: 12 }}>
                      ${formatCOP(lineTotal)}
                    </div>
                  </div>
                );
              })}
            </div>

            <hr style={{ borderTop: "1px dashed #bbb", margin: "12px 0" }} />

            {/* Totales */}
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 15 }}>
              <span>Subtotal</span>
              <span>${formatCOP(total)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 15, color: "#666" }}>
              <span>Propina sugerida (10%)</span>
              <span>${formatCOP(tipSuggested)}</span>
            </div>

            <hr style={{ borderTop: "1px dashed #bbb", margin: "12px 0" }} />

            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 900, fontSize: 20 }}>
              <span>TOTAL</span>
              <span>${formatCOP(totalWithTip)}</span>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button
                className="btnPrimary"
                style={{ flex: 1 }}
                onClick={() => {
                  openPrintWindow(
                    ticketCuenta({
                      tableName: table.name,
                      isDelivery,
                      items: order.items.map((it) => ({
                        name: it.name,
                        unit_price: it.unit_price,
                        qty: it.qty,
                        note: it.note || "",
                      })),
                      subtotal: total,
                      tipAmount: tipSuggested,
                      totalWithTip,
                    }),
                    "cuenta"
                  );
                }}
              >
                🖨️ Imprimir cuenta
              </button>
              <button
                className="btn"
                style={{ flex: 1 }}
                onClick={() => setBillOpen(false)}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
