import { useEffect, useMemo, useState } from "react";
import { loadProducts } from "./productsStore";
import { loadCategories } from "./categoriesStore";
import { clearOrder, getOpenOrder, setOpenOrder } from "./ordersStore";
import PayModal from "./PayModal";
import { addPayment } from "./paymentsStore";
import { openPrintWindow } from "./print";
import { ticketComanda, ticketFactura } from "./printTemplates";

function formatCOP(value) {
  return new Intl.NumberFormat("es-CO").format(value || 0);
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

  const [order, setOrder] = useState(() =>
    getOpenOrder(String(table.id)) || { items: [], status: "OPEN" }
  );

  const [payOpen, setPayOpen] = useState(false);

  function persist(next) {
    setOrder(next);
    setOpenOrder(String(table.id), next);
  }

  useEffect(() => {
    const cats = loadCategories();
    const prods = loadProducts();
    setCategories(cats);
    setProducts(prods);
    if (cats.length) setSelectedCatId(cats[0].id);
  }, []);

  const selectedCat = useMemo(() => {
    return categories.find((c) => c.id === selectedCatId) || null;
  }, [categories, selectedCatId]);

  const isPizzaCategory = useMemo(() => {
    return (selectedCat?.name || "").toLowerCase().includes("pizza");
  }, [selectedCat]);

  // Reset tamaño al cambiar de categoría
  useEffect(() => {
    setPizzaSize("ALL");
  }, [selectedCatId]);

  const filteredCategories = useMemo(() => {
    const q = catQuery.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) => (c.name || "").toLowerCase().includes(q));
  }, [categories, catQuery]);

  // Si filtras y la categoría seleccionada no queda visible, selecciona la primera
  useEffect(() => {
    if (!filteredCategories.length) return;
    const stillVisible = filteredCategories.some((c) => c.id === selectedCatId);
    if (!stillVisible) setSelectedCatId(filteredCategories[0].id);
  }, [filteredCategories, selectedCatId]);

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

  function addProduct(p) {
    const existing = order.items.find((x) => x.product_id === p.id);
    let nextItems;

    if (existing) {
      nextItems = order.items.map((x) =>
        x.product_id === p.id ? { ...x, qty: x.qty + 1 } : x
      );
    } else {
      nextItems = [
        ...order.items,
        { product_id: p.id, name: p.name, unit_price: p.price, qty: 1 },
      ];
    }

    persist({ ...order, items: nextItems });
  }

  function changeQty(product_id, delta) {
    const current = order.items.find((x) => x.product_id === product_id);
    if (!current) return;

    const willDelete = delta < 0 && current.qty === 1;
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

  async function confirmPay({ method, tipAmount, paidAmount, totalWithTip }) {
    addPayment({
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      tableId: table.id,
      tableName: table.name,
      method,
      subtotal: total,
      tipAmount,
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
        businessName: "MI RESTAURANTE",
        tableName: table.name,
        createdAt: new Date().toISOString(),
        items: order.items.map((it) => ({
          name: it.name,
          unit_price: it.unit_price,
          qty: it.qty,
        })),
        subtotal: total,
        tipAmount,
        totalWithTip,
        method,
        paidAmount,
      }),
      "factura"
    );

    setPayOpen(false);
    clearOrder(String(table.id));
    persist({ items: [], status: "OPEN" });
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
              const current = getOpenOrder(String(table.id));
              if (!current.items?.length) return alert("No hay productos para imprimir.");

              openPrintWindow(
                ticketComanda({
                  tableName: table.name,
                  createdAt: new Date().toISOString(),
                  items: current.items.map((i) => ({ qty: i.qty, name: i.name })),
                }),
                "comanda"
              );
            }}
          >
            Imprimir comanda
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
            onChange={(e) => setCatQuery(e.target.value)}
            style={{ marginTop: 10, marginBottom: 10 }}
          />

          <div className="catList">
            {filteredCategories.map((c) => {
              const active = c.id === selectedCatId;
              return (
                <button
                  key={c.id}
                  className={`catBtn ${active ? "active" : ""}`}
                  onClick={() => setSelectedCatId(c.id)}
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
                {filteredProducts.map((p) => (
                  <div key={p.id} className="listItem">
                    <div>
                      <div style={{ fontWeight: 900 }}>{p.name}</div>
                      <div style={{ opacity: 0.8 }}>${formatCOP(p.price)}</div>
                    </div>

                    <button className="btnPrimary" onClick={() => addProduct(p)}>
                      + Agregar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* CUENTA */}
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Cuenta</h2>

          {order.items.length === 0 ? (
            <p style={{ opacity: 0.8 }}>No hay productos aún.</p>
          ) : (
            <div className="orderLines">
              {order.items.map((it) => (
                <div key={it.product_id} className="orderLine">
                  <div>
                    <div style={{ fontWeight: 900 }}>{it.name}</div>
                    <div style={{ opacity: 0.8 }}>${formatCOP(it.unit_price)} c/u</div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <button className="btn" onClick={() => changeQty(it.product_id, -1)}>–</button>

                    <div style={{ minWidth: 24, textAlign: "center", fontWeight: 900 }}>
                      {it.qty}
                    </div>

                    <button className="btn" onClick={() => changeQty(it.product_id, +1)}>+</button>
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

      <PayModal
        open={payOpen}
        total={total}
        defaultTipPercent={10}
        onCancel={() => setPayOpen(false)}
        onConfirm={confirmPay}
      />
    </div>
  );
}
